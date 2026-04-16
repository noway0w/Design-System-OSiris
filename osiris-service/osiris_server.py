import asyncio
import json
import cv2
import dlib
import numpy as np
from imutils import face_utils
from pathlib import Path
import os
import ntpath
import websockets
from PIL import Image
import threading
import queue
import time
import re
import psutil
from geopy.distance import geodesic
import base64
import urllib.request
from aiohttp import web

# ============================================================
# GLOBAL CONFIG
# ============================================================
GENERATE_UNKNOWN = False
# In-memory store for active connections: {websocket_obj: {"ip": "1.2.3.4", "city": "Paris", "lat": 0, "lon": 0, "connected_at": time.time()}}
ACTIVE_CONNECTIONS = {}
# In-memory blacklist: set("1.2.3.4", "5.6.7.8")
IP_BLACKLIST = set()

# ============================================================
# 1. CHARGEMENT DES MODÈLES
# ============================================================

print("[OSIRIS] Chargement des modèles dlib...")
pose_predictor_68_point = dlib.shape_predictor(
    "pretrained_model/shape_predictor_68_face_landmarks.dat"
)
pose_predictor_5_point = dlib.shape_predictor(
    "pretrained_model/shape_predictor_5_face_landmarks.dat"
)
face_encoder = dlib.face_recognition_model_v1(
    "pretrained_model/dlib_face_recognition_resnet_model_v1.dat"
)
face_detector = dlib.get_frontal_face_detector()
print("[OSIRIS] Modèles chargés ✅")


# ============================================================
# 2. GESTION DYNAMIQUE ET THREAD-SAFE DES VISAGES
# ============================================================

class RecordingSession:
    def __init__(self):
        self.active = False
        self.target_name = None
        self.temp_files = []
        self.lock = threading.Lock()
        self.face_detected_count = 0  # Track if any faces were detected

    def start(self, name):
        with self.lock:
            self.active = True
            self.target_name = name
            self.temp_files = []
            self.face_detected_count = 0
            print(f"[OSIRIS] Recording session started for: {name}")

    def add_file(self, filepath):
        with self.lock:
            self.temp_files.append(filepath)
            self.face_detected_count += 1

    def stop(self):
        with self.lock:
            self.active = False
            count = len(self.temp_files)
            print(f"[OSIRIS] Recording session stopped. Captured {count} files.")
            return count

    def validate(self):
        with self.lock:
            # Files are already on disk, just clear the temp list so they aren't deleted
            count = len(self.temp_files)
            self.temp_files = []
            self.active = False
            self.face_detected_count = 0
            print(f"[OSIRIS] Recording validated. {count} files kept.")
            return count

    def cancel(self):
        with self.lock:
            count = 0
            for f in self.temp_files:
                try:
                    if os.path.exists(f):
                        os.remove(f)
                        count += 1
                except Exception as e:
                    print(f"[OSIRIS] Error deleting temp file {f}: {e}")
            self.temp_files = []
            self.active = False
            self.face_detected_count = 0
            print(f"[OSIRIS] Recording cancelled. {count} files deleted.")
            # Note: reload_all() will be called asynchronously to avoid blocking

recording_session = RecordingSession()

class FaceManager:
    def __init__(self, known_dir="known_faces"):
        self.known_dir = Path(known_dir)
        self.lock = threading.RLock()
        self.known_encodings = np.empty((0, 128))
        self.known_names = []
        self.transient_faces = {}
        self.transient_lock = threading.Lock()
        self.reload_all()

    def reload_all(self):
        print(f"[OSIRIS] Chargement des visages depuis : {self.known_dir.resolve()}")
        patterns = ["*.jpg", "*.JPG", "*.jpeg", "*.JPEG", "*.png", "*.PNG", "*.heic", "*.HEIC"]
        files = []
        for pattern in patterns:
            files.extend(self.known_dir.rglob(pattern))

        if not files:
            print("[OSIRIS][WARN] Aucun fichier trouvé.")
            return

        new_names = []
        new_encodings = []

        for file_ in files:
            try:
                image = cv2.imread(str(file_))
                if image is None: continue
                rgb_image = image[:, :, ::-1] # BGR to RGB
                rgb_image = np.ascontiguousarray(rgb_image)
                
                locs = face_detector(rgb_image, 1)
                if not locs: continue
                shape = pose_predictor_68_point(rgb_image, locs[0])
                encoding = np.array(face_encoder.compute_face_descriptor(rgb_image, shape, num_jitters=0))
                
                new_names.append(os.path.splitext(ntpath.basename(file_))[0])
                new_encodings.append(encoding)
            except Exception as e:
                print(f"[OSIRIS][ERROR] Erreur chargement {file_}: {e}")

        with self.lock:
            if new_encodings:
                self.known_encodings = np.array(new_encodings)
                self.known_names = new_names
            else:
                self.known_encodings = np.empty((0, 128))
                self.known_names = []
            print(f"[OSIRIS] Base rechargée : {len(self.known_names)} visages.")

    def add_new_face(self, name, encoding):
        with self.lock:
            if self.known_encodings.size == 0:
                self.known_encodings = np.array([encoding])
            else:
                self.known_encodings = np.vstack([self.known_encodings, encoding])
            self.known_names.append(name)
            print(f"[OSIRIS] Nouveau visage ajouté en mémoire : {name}")

    def get_data(self):
        with self.lock:
            return self.known_encodings, self.known_names

    def is_transient_or_known(self, encoding, tolerance=0.6):
        encoding_tuple = tuple(encoding.flatten())
        with self.transient_lock:
            now = time.time()
            to_remove = [k for k, v in self.transient_faces.items() if now - v[0] > 20]
            for k in to_remove: del self.transient_faces[k]

            if encoding_tuple in self.transient_faces: return True, "Processing..."

            for k, (ts, status) in self.transient_faces.items():
                cached_enc = np.array(k)
                if np.linalg.norm(cached_enc - encoding) < tolerance:
                    return True, status
            return False, None

    def mark_processing(self, encoding):
        with self.transient_lock:
            self.transient_faces[tuple(encoding.flatten())] = (time.time(), "Learning...")
    
    def name_exists(self, name):
        """Check if a name already exists in known faces"""
        if not name:
            return False
        
        name_lower = name.lower()
        safe_name = "".join([c for c in name if c.isalnum() or c in (' ', '_', '-')]).strip()
        if not safe_name:
            return False
        
        # Check in memory first (quick check)
        with self.lock:
            for known_name in self.known_names:
                if known_name.lower() == name_lower:
                    return True
        
        # Check on disk (outside lock to avoid blocking)
        # This is safe because we're only reading file names, not modifying
        try:
            patterns = ["*.jpg", "*.JPG", "*.jpeg", "*.JPEG", "*.png", "*.PNG"]
            for pattern in patterns:
                for file_path in self.known_dir.glob(pattern):
                    file_name = os.path.splitext(file_path.name)[0]
                    # Check if name matches (with or without sequence number)
                    if file_name.lower().startswith(safe_name.lower() + "_") or file_name.lower() == safe_name.lower():
                        return True
        except Exception as e:
            print(f"[OSIRIS] Error checking name existence: {e}")
        
        return False


face_manager = FaceManager()
capture_queue = queue.Queue()


# ============================================================
# 3. WORKER DE SAUVEGARDE
# ============================================================

def get_next_filename(known_dir, prefix="UnknownGuest"):
    known_dir_path = Path(known_dir)
    # Sanitize prefix to be safe for filenames
    safe_prefix = "".join([c for c in prefix if c.isalnum() or c in (' ', '_', '-')]).strip()
    if not safe_prefix: safe_prefix = "UnknownGuest"
    
    clean_prefix = re.escape(safe_prefix)
    pattern = re.compile(rf'^{clean_prefix}_(\d+)\.(jpg|png|jpeg)$', re.IGNORECASE)
    
    max_seq = 0
    for file_path in known_dir_path.iterdir():
        match = pattern.match(file_path.name)
        if match: max_seq = max(max_seq, int(match.group(1)))
    return f"{safe_prefix}_{max_seq + 1}.jpg"

def background_worker():
    print("[OSIRIS] Background Worker démarré.")
    while True:
        try:
            item = capture_queue.get()
            if item is None: break
            
            # Check if item is old format (2 items) or new format (3 items)
            if len(item) == 3:
                face_image_bgr, encoding, target_name = item
            else:
                face_image_bgr, encoding = item
                target_name = None

            # Use target_name if provided (from recording session), else UnknownGuest
            prefix = target_name if target_name else "UnknownGuest"
            
            filename = get_next_filename(face_manager.known_dir, prefix=prefix)
            filepath = face_manager.known_dir / filename
            cv2.imwrite(str(filepath), face_image_bgr)
            
            # If this was part of a recording session, track the file
            if target_name:
                recording_session.add_file(str(filepath))
                # Check if recording is still active before adding to memory
                # This prevents adding faces that will be cancelled
                with recording_session.lock:
                    is_active = recording_session.active
                if is_active:
                    name_final = os.path.splitext(filename)[0]
                    face_manager.add_new_face(name_final, encoding)
                else:
                    # Recording was cancelled, don't add to memory
                    print(f"[OSIRIS] Skipping memory add for {filename} - recording was cancelled")
            else:
                # Unknown guest - always add
                name_final = os.path.splitext(filename)[0]
                face_manager.add_new_face(name_final, encoding)
            
            capture_queue.task_done()
        except Exception as e:
            print(f"[OSIRIS][BG ERROR] {e}")

worker_thread = threading.Thread(target=background_worker, daemon=True)
worker_thread.start()


# ============================================================
# 4. SYSTEME DE GEOLOCALISATION
# ============================================================

LOCATE_DIR = Path("Locate")
# Added Oslo, Barcelona, London, etc to cover more ground
CITY_COORDS = {
    "Amsterdam": (52.3676, 4.9041),
    "Annecy": (45.8992, 6.1294),
    "Berlin": (52.5200, 13.4050),
    "Bruxelle": (50.8503, 4.3517),
    "Copenhagen": (55.6761, 12.5683),
    "Geneve": (46.2044, 6.1432),
    "Munich": (48.1351, 11.5820),
    "Paris": (48.8566, 2.3522),
    "Royan": (45.6285, -1.0281),
    "Stockholm": (59.3293, 18.0686),
    "Toulon": (43.1242, 5.928),
    "Trollhättan": (58.2837, 12.2886),
    "Vienna": (48.2082, 16.3738),
    "Zurich": (47.3769, 8.5417),
    "Oslo": (59.9139, 10.7522) 
}

# Pre-load images in base64 to send via WS
CITY_IMAGES = {}
print("[OSIRIS] Chargement des images Locate...")
if not LOCATE_DIR.exists():
    print(f"[ERROR] Dossier Locate introuvable: {LOCATE_DIR}")

for city in CITY_COORDS.keys():
    try:
        # Cherche extension png/jpg
        found = False
        for ext in [".png", ".jpg", ".jpeg"]:
            p = LOCATE_DIR / (city + ext)
            if p.exists():
                with open(p, "rb") as f:
                    CITY_IMAGES[city] = base64.b64encode(f.read()).decode('utf-8')
                found = True
                break
        if not found:
            print(f"[WARN] Image manquante pour {city}")
            # Fallback Logic: If Oslo/Stockholm missing, map to Copenhagen if present
            if city in ["Oslo", "Trollhättan", "Stockholm"]:
                fallback = LOCATE_DIR / "Copenhagen.png"
                if fallback.exists():
                    with open(fallback, "rb") as f:
                        CITY_IMAGES[city] = base64.b64encode(f.read()).decode('utf-8')
    except Exception as e:
        print(f"[ERROR] Chargement image {city}: {e}")

def get_closest_city_image(lat, lon):
    min_dist = float('inf')
    closest_city = "Paris" # Default
    
    print(f"[GEO DEBUG] Searching closest city for Client @ ({lat}, {lon})...")
    
    for city, coords in CITY_COORDS.items():
        try:
            dist = geodesic((lat, lon), coords).km
            if dist < min_dist:
                min_dist = dist
                closest_city = city
        except: pass
        
    print(f"[GEO] Client @ ({lat}, {lon}) -> Closest: {closest_city} ({int(min_dist)}km)")
    
    # Return closest city name AND image (even if image missing, HTML handles empty src)
    # If image missing for closest city, try Paris fallback image
    img_data = CITY_IMAGES.get(closest_city, "")
    if not img_data:
         img_data = CITY_IMAGES.get("Paris", "")
         
    return closest_city, img_data

# ============================================================
# WEATHER SYSTEM
# ============================================================
WEATHER_DIR = Path("Weather")
WEATHER_ICONS = {}

print("[OSIRIS] Chargement des icônes météo...")
if WEATHER_DIR.exists():
    for file_path in WEATHER_DIR.glob("*.svg"):
        try:
            with open(file_path, "rb") as f:
                WEATHER_ICONS[file_path.name] = base64.b64encode(f.read()).decode('utf-8')
        except Exception as e:
            print(f"[ERROR] Chargement icône {file_path.name}: {e}")
else:
    print(f"[ERROR] Dossier Weather introuvable: {WEATHER_DIR}")

def get_weather_icon_name(wmo_code):
    # WMO Code Mapping
    if wmo_code == 0: return "clear_day_24dp_E3E3E3_FILL0_wght200_GRAD0_opsz24.svg"
    if wmo_code in [1, 2, 3]: return "partly_cloudy_day_24dp_E3E3E3_FILL0_wght200_GRAD0_opsz24.svg"
    if wmo_code in [45, 48]: return "foggy_24dp_E3E3E3_FILL0_wght200_GRAD0_opsz24.svg"
    if wmo_code in [51, 53, 55, 56, 57]: return "rainy_light_24dp_E3E3E3_FILL0_wght200_GRAD0_opsz24.svg"
    if wmo_code in [61, 63, 65, 66, 67, 80, 81, 82]: return "rainy_heavy_24dp_E3E3E3_FILL0_wght200_GRAD0_opsz24.svg"
    if wmo_code in [71, 73, 75, 77, 85, 86]: return "snowing_24dp_E3E3E3_FILL0_wght200_GRAD0_opsz24.svg"
    if wmo_code in [95, 96, 99]: return "thunderstorm_24dp_E3E3E3_FILL0_wght200_GRAD0_opsz24.svg"
    return "clear_day_24dp_E3E3E3_FILL0_wght200_GRAD0_opsz24.svg"

def get_weather_data(lat, lon):
    try:
        # Use Open-Meteo API (No Key Required)
        url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,relative_humidity_2m,weather_code"
        with urllib.request.urlopen(url, timeout=2) as response:
            data = json.loads(response.read().decode())
            current = data.get("current", {})
            return {
                "temp": current.get("temperature_2m", 0),
                "humidity": current.get("relative_humidity_2m", 0),
                "code": current.get("weather_code", 0)
            }
    except Exception as e:
        print(f"[WEATHER ERROR] {e}")
        return None

def get_client_ip_info(websocket):
    try:
        headers = websocket.request_headers
        ip = headers.get("X-Forwarded-For", headers.get("X-Real-IP", ""))
        if not ip:
            if hasattr(websocket, 'remote_address'):
                ip = websocket.remote_address[0]
        
        if "," in ip: ip = ip.split(",")[0].strip()
        print(f"[GEO] IP détectée: {ip}")
        return ip
    except Exception as e:
        print(f"[GEO ERROR] IP extraction: {e}")
        return "8.8.8.8"

def geolocate_ip_sync(ip):
    try:
        print(f"[GEO] Calling ip-api for {ip}...")
        # Timeout court pour ne pas bloquer
        with urllib.request.urlopen(f"http://ip-api.com/json/{ip}", timeout=2) as url:
            data = json.loads(url.read().decode())
            if data['status'] == 'success':
                print(f"[GEO] API Result: {data['city']} ({data['lat']}, {data['lon']})")
                return data['lat'], data['lon'], data['city']
            else:
                 print(f"[GEO] API Error: {data}")
    except Exception as e:
        print(f"[GEO ERROR] API call failed: {e}")
    
    print("[GEO] Fallback to Paris coordinates.")
    return 48.8566, 2.3522, "Unknown"

async def geolocate_ip_async(ip):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, geolocate_ip_sync, ip)


# ============================================================
# 5. LOGIQUE RECONNAISSANCE
# ============================================================

def encode_face(image_rgb):
    # OPTIMIZATION: Resize for faster detection
    h, w = image_rgb.shape[:2]
    scale = 1.0
    # Target width 480px for processing (good balance speed/accuracy)
    if w > 480:
        scale = 480.0 / w
        small_frame = cv2.resize(image_rgb, (0, 0), fx=scale, fy=scale)
    else:
        small_frame = image_rgb

    if not small_frame.flags['C_CONTIGUOUS']: small_frame = np.ascontiguousarray(small_frame)
    
    # Use 0 upsampling (fastest) instead of 1
    face_locations = face_detector(small_frame, 0)
    
    encodings = []
    locs = []
    
    for face in face_locations:
        shape = pose_predictor_68_point(small_frame, face)
        descriptor = face_encoder.compute_face_descriptor(small_frame, shape, num_jitters=0)
        encodings.append(np.array(descriptor))
        
        # Scale coordinates back to original size
        top = int(face.top() / scale)
        right = int(face.right() / scale)
        bottom = int(face.bottom() / scale)
        left = int(face.left() / scale)
        
        locs.append((max(top, 0), min(right, w), min(bottom, h), max(left, 0)))
        
    return encodings, locs

def recognize_faces(frame_bgr, client_ip=""):
    rgb_frame = frame_bgr[:, :, ::-1]
    encodings, locations = encode_face(rgb_frame)
    face_names = []
    known_encs, known_names = face_manager.get_data()
    
    for idx, encoding in enumerate(encodings):
        name = "Unknown"
        match_found = False
        if known_encs.size > 0:
            distances = np.linalg.norm(known_encs - encoding, axis=1)
            min_dist_idx = np.argmin(distances)
            if distances[min_dist_idx] <= 0.6:
                name = known_names[min_dist_idx]
                match_found = True
        
        if not match_found:
            is_transient, status = face_manager.is_transient_or_known(encoding)
            if is_transient: name = status
            else:
                # RECORDING SESSION LOGIC
                if recording_session.active:
                    # Capture for the specific user
                    face_manager.mark_processing(encoding)
                    top, right, bottom, left = locations[idx]
                    padding = 30
                    h, w = frame_bgr.shape[:2]
                    face_img = frame_bgr[max(0, top-padding):min(h, bottom+padding), max(0, left-padding):min(w, right+padding)]
                    
                    # Push with target name
                    capture_queue.put_nowait((face_img, encoding, recording_session.target_name))
                    name = f"Recording {recording_session.target_name}..."
                    
                elif GENERATE_UNKNOWN:
                    face_manager.mark_processing(encoding)
                    top, right, bottom, left = locations[idx]
                    padding = 30
                    h, w = frame_bgr.shape[:2]
                    face_img = frame_bgr[max(0, top-padding):min(h, bottom+padding), max(0, left-padding):min(w, right+padding)]
                    capture_queue.put_nowait((face_img, encoding, None))
                    name = "Learning..."
                else:
                    name = "Unknown"
        face_names.append(name)

    for (top, right, bottom, left), name in zip(locations, face_names):
        if name == "Learning...": color = (0, 165, 255)
        elif name.startswith("Recording"): color = (0, 255, 0)
        elif name == "Unknown": color = (0, 0, 255)
        else: color = (255, 255, 255)

        l_len, th = 20, 2
        cv2.line(frame_bgr, (left, top), (left + l_len, top), color, th)
        cv2.line(frame_bgr, (left, top), (left, top + l_len), color, th)
        cv2.line(frame_bgr, (right, top), (right - l_len, top), color, th)
        cv2.line(frame_bgr, (right, top), (right, top + l_len), color, th)
        cv2.line(frame_bgr, (left, bottom), (left + l_len, bottom), color, th)
        cv2.line(frame_bgr, (left, bottom), (left, bottom - l_len), color, th)
        cv2.line(frame_bgr, (right, bottom), (right - l_len, bottom), color, th)
        cv2.line(frame_bgr, (right, bottom), (right, bottom - l_len), color, th)
        cv2.putText(frame_bgr, name, (left, bottom + 25), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)

    # Draw Client IP on the frame (Bottom Right)
    # Disabled as requested by user
    # if client_ip:
    #     text = f"Client: {client_ip}"
    #     font = cv2.FONT_HERSHEY_SIMPLEX
    #     scale = 0.5
    #     thick = 1
    #     (t_w, t_h), _ = cv2.getTextSize(text, font, scale, thick)
    #     h, w = frame_bgr.shape[:2]
    #     cv2.rectangle(frame_bgr, (w - t_w - 10, h - t_h - 10), (w, h), (0, 0, 0), -1)
    #     cv2.putText(frame_bgr, text, (w - t_w - 5, h - 5), font, scale, (255, 255, 255), thick)

    return frame_bgr, face_names


# ============================================================
# 6. SERVEUR
# ============================================================

process_stats_cache = {"cpu": 0, "mem": 0, "last_update": 0}

def get_system_stats():
    now = time.time()
    if now - process_stats_cache["last_update"] > 1.0:
        try:
            proc = psutil.Process()
            with proc.oneshot():
                process_stats_cache["cpu"] = proc.cpu_percent()
                process_stats_cache["mem"] = proc.memory_info().rss / (1024 * 1024)
            process_stats_cache["last_update"] = now
        except Exception: pass
    return {
        "cpu_global": psutil.cpu_percent(),
        "mem_global": psutil.virtual_memory().percent,
        "osiris_cpu": process_stats_cache["cpu"],
        "osiris_mem": round(process_stats_cache["mem"], 1)
    }

async def handle_client(websocket):
    # Get client IP early for blacklist check
    client_ip = "Unknown"
    try:
        headers = websocket.request_headers
        client_ip = headers.get("X-Forwarded-For", headers.get("X-Real-IP", ""))
        if not client_ip:
            if hasattr(websocket, 'remote_address'):
                client_ip = websocket.remote_address[0]
        if "," in client_ip: client_ip = client_ip.split(",")[0].strip()
    except: pass

    if client_ip in IP_BLACKLIST:
        print(f"[OSIRIS] Rejected blacklisted IP: {client_ip}")
        await websocket.close(code=4003, reason="Access Denied")
        return

    print(f"[OSIRIS] Client connecté: {client_ip}")
    
    # Register connection
    ACTIVE_CONNECTIONS[websocket] = {
        "ip": client_ip, 
        "city": "Unknown", 
        "lat": 0, 
        "lon": 0, 
        "connected_at": time.time()
    }
    
    geo_sent = False

    try:
        async for message in websocket:
            if isinstance(message, str): 
                # Potential IP message from client
                try:
                    data = json.loads(message)
                    if data.get("type") == "init_ip":
                        # Update with reported IP if available (trusting proxy headers more usually, but this is fallback)
                        # We stick to the socket IP usually, but let's store what they sent too if needed
                        reported_ip = data.get("ip", "")
                        if reported_ip and reported_ip != client_ip:
                            # If behind proxy without headers, this might be the real public IP
                            client_ip = reported_ip 
                            ACTIVE_CONNECTIONS[websocket]["ip"] = client_ip
                        
                        print(f"[GEO] IP reçue du client: {client_ip}")
                        
                        # Trigger Geo logic
                        if not geo_sent and client_ip:
                            lat, lon, city_name = await geolocate_ip_async(client_ip)
                            
                            # Update connection info
                            ACTIVE_CONNECTIONS[websocket].update({
                                "city": city_name,
                                "lat": lat,
                                "lon": lon
                            })

                            closest_city, city_b64 = get_closest_city_image(lat, lon)
                            
                            await websocket.send(json.dumps({
                                "type": "geo",
                                "client_ip": client_ip,
                                "detected_city": city_name,
                                "closest_city": closest_city,
                                "image_b64": city_b64
                            }))
                            
                            # Fetch and send Weather
                            weather_data = await asyncio.get_event_loop().run_in_executor(None, get_weather_data, lat, lon)
                            if weather_data:
                                icon_name = get_weather_icon_name(weather_data['code'])
                                icon_b64 = WEATHER_ICONS.get(icon_name, "")
                                # Static temp icon
                                temp_icon_b64 = WEATHER_ICONS.get("device_thermostat_24dp_E3E3E3_FILL0_wght200_GRAD0_opsz24.svg", "")
                                
                                await websocket.send(json.dumps({
                                    "type": "weather",
                                    "temp": weather_data['temp'],
                                    "humidity": weather_data['humidity'],
                                    "icon_b64": icon_b64,
                                    "temp_icon_b64": temp_icon_b64
                                }))

                            geo_sent = True

                    elif data.get("type") == "toggle_generation":
                        global GENERATE_UNKNOWN
                        GENERATE_UNKNOWN = data.get("enabled", False)
                        print(f"[OSIRIS] Generation Unknown set to: {GENERATE_UNKNOWN}")

                    # --- NEW RECORDING HANDLERS ---
                    elif data.get("type") == "start_recording":
                        name = data.get("name", "User").strip()
                        if not name:
                            await websocket.send(json.dumps({"type": "recording_error", "message": "Name cannot be empty"}))
                        elif face_manager.name_exists(name):
                            await websocket.send(json.dumps({"type": "recording_error", "message": f"User '{name}' already exists. Please use a different name."}))
                        else:
                            recording_session.start(name)
                            await websocket.send(json.dumps({"type": "recording_started", "name": name}))

                    elif data.get("type") == "stop_recording":
                        # End of the 6s timer
                        count = recording_session.stop()
                        if count > 0:
                            await websocket.send(json.dumps({"type": "recording_stopped", "status": "success", "count": count}))
                        else:
                            await websocket.send(json.dumps({"type": "recording_stopped", "status": "error", "message": "No face detected during recording"}))

                    elif data.get("type") == "validate_recording":
                        count = recording_session.validate()
                        await websocket.send(json.dumps({"type": "recording_validated", "count": count, "message": "User saved successfully!"}))

                    elif data.get("type") == "cancel_recording":
                        recording_session.cancel()
                        # Note: We don't reload immediately on cancel to avoid thread-safety issues
                        # The temporary files are deleted, and they won't be in memory anyway
                        # If needed, a reload can be triggered manually or on next server restart
                        await websocket.send(json.dumps({"type": "recording_cancelled"}))
                    # -------------------------------

                except: pass
                continue
            
            # Binary Image Data
            data = np.frombuffer(message, np.uint8)
            frame = cv2.imdecode(data, cv2.IMREAD_COLOR)
            if frame is None: continue

            # Pass client_ip to recognize_faces (IP overlay is disabled inside function but parameter remains)
            # Always process frames even during recording to prevent freeze
            frame_out, names = recognize_faces(frame, client_ip)
            stats = get_system_stats()

            ok, buf = cv2.imencode(".jpg", frame_out)
            if ok:
                await websocket.send(buf.tobytes())
                await websocket.send(json.dumps({"type": "faces", "names": names, "stats": stats}))

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[OSIRIS][ERROR] Connection error: {e}")
    finally: 
        print(f"[OSIRIS] Client déconnecté: {client_ip}")
        if websocket in ACTIVE_CONNECTIONS:
            del ACTIVE_CONNECTIONS[websocket]

# ============================================================
# 7. INTERNAL ADMIN API (HTTP 8881)
# ============================================================
async def admin_get_users(request):
    """List active connections"""
    users = []
    for ws, info in ACTIVE_CONNECTIONS.items():
        users.append({
            "ip": info["ip"],
            "city": info["city"],
            "lat": info["lat"],
            "lon": info["lon"],
            "connected_at": info["connected_at"],
            "id": id(ws) # Use memory address as ID
        })
    return web.json_response({"users": users})

async def admin_kill_user(request):
    """Kill a specific user connection"""
    try:
        data = await request.json()
        target_id = data.get("id")
        killed = False
        
        # Find websocket by ID
        target_ws = None
        for ws in list(ACTIVE_CONNECTIONS.keys()):
            if id(ws) == target_id:
                target_ws = ws
                break
        
        if target_ws:
            await target_ws.close(code=4000, reason="Killed by Admin")
            killed = True
            
        return web.json_response({"status": "success", "killed": killed})
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=500)

async def admin_block_ip(request):
    """Block an IP address"""
    try:
        data = await request.json()
        ip_to_block = data.get("ip")
        
        if ip_to_block:
            IP_BLACKLIST.add(ip_to_block)
            print(f"[ADMIN] IP Blacklisted: {ip_to_block}")
            
            # Kill existing connections from this IP
            count = 0
            for ws, info in list(ACTIVE_CONNECTIONS.items()):
                if info["ip"] == ip_to_block:
                    await ws.close(code=4003, reason="IP Banned")
                    count += 1
            
            return web.json_response({"status": "success", "ip": ip_to_block, "killed_connections": count})
        return web.json_response({"status": "error", "message": "No IP provided"}, status=400)
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=500)

async def start_admin_server():
    app = web.Application()
    app.router.add_get('/users', admin_get_users)
    app.router.add_post('/kill', admin_kill_user)
    app.router.add_post('/block', admin_block_ip)
    
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, '127.0.0.1', 8881)
    print("[ADMIN] Internal Admin API running on 127.0.0.1:8881")
    await site.start()

async def main():
    print("[OSIRIS] Démarrage serveur...")
    
    # Start Admin API
    await start_admin_server()
    
    # Start WebSocket Server
    async with websockets.serve(handle_client, "0.0.0.0", 8878, max_size=None):
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())
