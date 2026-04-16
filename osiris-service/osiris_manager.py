import asyncio
import websockets
import json
import os
import signal
import subprocess
import sys
import psutil
import aiohttp
from pathlib import Path
import time

# CONFIG
BASE_DIR = Path(__file__).resolve().parent
MANAGER_PORT = 8880
OSIRIS_INTERNAL_API = "http://127.0.0.1:8881"
FACES_DIR = BASE_DIR / "known_faces"
SERVER_SCRIPT = str(BASE_DIR / "osiris_server.py")
SERVER_OUTPUT = BASE_DIR / "server_output.txt"

def _cmdline_has_server(cmdline):
    if not cmdline:
        return False
    blob = " ".join(cmdline)
    return "osiris_server.py" in blob


async def get_osiris_process():
    """Find the running osiris_server.py process"""
    for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
        try:
            cmdline = proc.info['cmdline']
            if cmdline and "python" in cmdline[0] and _cmdline_has_server(cmdline):
                return proc
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            pass
    return None

async def control_osiris(action):
    """Start/Stop/Restart OSiris"""
    proc = await get_osiris_process()
    
    if action == "status":
        return {"running": proc is not None, "pid": proc.pid if proc else None}
    
    if action == "stop" or action == "restart":
        if proc:
            print(f"[MANAGER] Stopping OSiris (PID {proc.pid})...")
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except psutil.TimeoutExpired:
                proc.kill()
        
        if action == "stop":
            return {"status": "stopped"}

    if action == "start" or action == "restart":
        # Check if already running (if start only)
        if action == "start" and await get_osiris_process():
            return {"status": "already_running"}
            
        print("[MANAGER] Starting OSiris...")
        log = open(SERVER_OUTPUT, "a", buffering=1)
        subprocess.Popen(
            [sys.executable, "-u", SERVER_SCRIPT],
            cwd=str(BASE_DIR),
            stdout=log,
            stderr=subprocess.STDOUT,
        )
        return {"status": "started"}

    return {"error": "Invalid action"}

async def get_faces():
    """List known and unknown faces"""
    known = []
    unknown = []
    
    if not FACES_DIR.exists():
        return {"known": [], "unknown": []}
        
    for f in FACES_DIR.glob("*"):
        if f.suffix.lower() not in ['.jpg', '.jpeg', '.png']:
            continue
            
        name = f.stem
        # Categorize
        if name.startswith("UnknownGuest"):
            unknown.append({"filename": f.name, "name": name})
        else:
            known.append({"filename": f.name, "name": name})
            
    return {"known": known, "unknown": unknown}

async def proxy_admin_request(endpoint, method="GET", data=None):
    """Proxy requests to internal OSiris Admin API"""
    try:
        async with aiohttp.ClientSession() as session:
            url = f"{OSIRIS_INTERNAL_API}/{endpoint}"
            if method == "GET":
                async with session.get(url) as resp:
                    if resp.status == 200:
                        return await resp.json()
            elif method == "POST":
                async with session.post(url, json=data) as resp:
                    if resp.status == 200:
                        return await resp.json()
            return {"error": f"OSiris API returned {resp.status}"}
    except aiohttp.ClientConnectorError:
        return {"error": "OSiris Server is offline"}
    except Exception as e:
        return {"error": str(e)}

async def handle_dashboard(websocket):
    print("[MANAGER] Dashboard connected")
    try:
        async for message in websocket:
            req = json.loads(message)
            msg_type = req.get("type")
            
            response = {"type": msg_type + "_response"}
            
            if msg_type == "get_status":
                response["data"] = await control_osiris("status")
                
            elif msg_type == "control_service":
                action = req.get("action")
                response["data"] = await control_osiris(action)
                
            elif msg_type == "get_faces":
                response["data"] = await get_faces()
                
            elif msg_type == "get_users":
                response["data"] = await proxy_admin_request("users")
                
            elif msg_type == "kill_user":
                user_id = req.get("id")
                response["data"] = await proxy_admin_request("kill", "POST", {"id": user_id})
                
            elif msg_type == "block_ip":
                ip = req.get("ip")
                response["data"] = await proxy_admin_request("block", "POST", {"ip": ip})
                
            await websocket.send(json.dumps(response))
            
    except Exception as e:
        print(f"[MANAGER] Error: {e}")
    finally:
        print("[MANAGER] Dashboard disconnected")

async def main():
    print(f"[MANAGER] Starting Manager Service on port {MANAGER_PORT}...")
    async with websockets.serve(handle_dashboard, "0.0.0.0", MANAGER_PORT):
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())
