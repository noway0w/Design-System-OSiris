# Session Summary: Osiris Project Optimization & Geolocation

## Date: 2025-12-10

### 1. Performance Optimization (Latency Fix)
- **Problem**: 7-second latency in video stream due to buffer buildup (client sending frames faster than server could process).
- **Solution**: Implemented "Flow Control". The client now waits for the server's JSON response (face data) before sending the next frame.
- **Result**: Latency reduced to ~100-200ms (Real-time).

### 2. System Architecture
- **Non-Blocking**: The main video processing loop is now non-blocking. Unknown face capture is offloaded to a background thread to prevent freezes.
- **Incremental Learning**: New faces are added to the in-memory database immediately without reloading the entire dataset from disk.

### 3. Geolocation & IP Detection
- **Initial Issue**: Client IP was detected as `8.8.8.8` or Proxy IP, causing incorrect Geolocation (defaulting to Paris/Royan).
- **Solution**: 
    - **Client-Side**: The HTML client now queries `api.ipify.org` to get its public IP.
    - **Protocol**: Client sends `{"type": "init_ip", "ip": "..."}` as the first message over WebSocket.
    - **Server-Side**: Server uses this IP to query `ip-api.com`.
- **Dynamic City Image**:
    - Server calculates distance between Client Lat/Lon and a list of cities (`CITY_COORDS`).
    - Returns the image of the closest city (e.g., Oslo -> fallback image if Oslo.png missing).
    - **Added**: Oslo coordinates (59.91, 10.75) to the server list.

### 4. Monitoring Dashboard
- **Integrated**: CPU and RAM usage of the OSiris process are calculated on the server and sent in the metadata stream.
- **Display**: HTML client shows Real-time FPS, RAM usage, Server Load, and the detected Location/IP.

### 5. Code Changes
- **osiris_server.py**:
    - Merged monitoring logic.
    - Added `init_ip` handler.
    - Fixed relative path crash (started via `cd /srv/projet/OSiris`).
    - Removed IP video overlay (as requested).
- **HTML Client**:
    - Added `api.ipify.org` fetch.
    - Added Location Card (Image + IP).
    - Removed "CPU OSiris" card.

### 6. Current Status
- **Server PID**: Running in background.
- **Port**: 8878 (WebSocket).
- **Git**: All changes committed and pushed to `main`.

### 7. Files
- `/srv/projet/OSiris/osiris_server.py`: Main logic.
- `/srv/projet/OSiris/Locate/`: Folder containing city images.

