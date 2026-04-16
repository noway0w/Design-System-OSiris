# OSiris Management System - Unstable Version (Dev Snapshot)

**Status: ⚠️ UNSTABLE / WIP**  
**Date: February 4, 2026**

This branch contains the initial implementation of the OSiris Management System, including the Manager Service, Internal Admin API, and Web Dashboard.

## 🚧 Current State

### ✅ Working Features
- **UI/UX**: Dark-themed management dashboard (`/manage/`) loads correctly.
- **3D Visualization**: Globe.gl interactive earth renders and rotates.
- **Nginx Config**: Secure routing for `/manage/` and `/osiris-manage-ws` is applied.
- **Access Control**: Basic auth (code `7777`) is functional.
- **Face Recording UI**: The frontend modal for adding users appears (step 1).

### ❌ Known Issues (Not Working)
- **Live Data Sync**: Dashboard does not receive real-time updates from `osiris_manager.py`.
- **Client Positioning**: Active users do not appear as points on the 3D globe.
- **System Status**: Start/Stop/Restart buttons in the dashboard may not trigger actual process changes or reflect current state.
- **WebSocket Communication**: The connection between Dashboard <-> Manager <-> Server seems fragile or interrupted (500 errors or silence).

## 🛠 Architecture Overview

1.  **Manager Service (`osiris_manager.py` :8880)**
    -   Acts as the backend for the dashboard.
    -   Proxies requests to the Internal Admin API.
    -   Controls the main server process.

2.  **Main Server (`osiris_server.py` :8878)**
    -   Now hosts an **Internal Admin API** on port `8881`.
    -   Exposes endpoints `/users`, `/kill`, `/block`.

3.  **Frontend (`public_html/manage/index.html`)**
    -   Connects via WebSocket to `/osiris-manage-ws` (proxied to :8880).

## 📋 Next Steps for Development

1.  **Debug WebSocket Proxy**: Verify `nginx` is correctly passing WS packets to port 8880.
2.  **Fix Manager <-> Server Bridge**: Ensure `osiris_manager.py` can successfully call `http://127.0.0.1:8881/users`.
3.  **Process Control**: Verify `osiris_manager.py` has permissions to kill/start the `osiris_server.py` process.
4.  **Data Flow**: Trace the JSON packets from Server -> Manager -> Dashboard to fix the empty user lists.

## 🚀 How to Run (Manual)

If services are down, restart them manually:

```bash
# 1. Start Main Server (Video & Admin API)
nohup python3 -u osiris_server.py > server_output.txt 2>&1 &

# 2. Start Manager Service (Dashboard Backend)
nohup python3 osiris_manager.py > manager.log 2>&1 &
```
