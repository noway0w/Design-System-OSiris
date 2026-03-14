# CFD Sidecar

Local OpenFOAM CFD analysis sidecar for the Corintis 3D CAD Explorer. Runs 100% on the user's machine (no cloud, no external APIs).

## Prerequisites

- **OpenFOAM** installed and on PATH (`blockMesh`, `snappyHexMesh`, `simpleFoam`, `foamToVTK`)
- **Python 3** with PyVista and NumPy
- **Node.js** 16+

### Installing Node.js on AlmaLinux / RHEL 9

If `npm` is not found, install Node.js first:

```bash
# Option A: NodeSource (recommended, LTS)
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs

# Option B: AppStream module
sudo dnf module enable -y nodejs:20
sudo dnf install -y nodejs
```

Verify: `node -v` and `npm -v`.

### OpenFOAM: Docker (recommended) or native

If you see "spawn blockMesh ENOENT", the sidecar will **automatically use Docker** when OpenFOAM is not in PATH.

**Docker permission denied?** Add your user to the docker group, then use the Docker-aware start (no logout needed):
```bash
sudo usermod -aG docker $USER
npm run start:docker
```

Or run `newgrp docker` in your terminal, then `npm start`.

**Pull the image** (first time):
```bash
docker pull opencfd/openfoam-default
```

To force Docker mode: `CFD_USE_DOCKER=1 npm start`

**Native install** (optional): Follow the [OpenFOAM installation guide](https://www.openfoam.com/documentation/guides/latest/doc/guide-installation-general.html). Ensure `blockMesh` is on PATH when the sidecar runs.

## Setup

```bash
cd cfd-sidecar
npm install
pip install -r requirements.txt
```

## Run

```bash
npm start
```

Server listens on `http://localhost:8090` by default (avoids conflicts with dev servers). Set `CFD_PORT` to use another port.

## Production deployment (systemd)

For reliable CFD analysis when users connect via the web, install the sidecar as a systemd service. It will start on boot and survive restarts.

**One-time setup:**

```bash
sudo ./install-service.sh
```

This copies the unit file, enables and starts the service, and optionally adds nginx to the docker group for the PHP Start fallback. Check status: `systemctl status cfd-sidecar`.

**Manual control:**

```bash
sudo systemctl start cfd-sidecar   # Start
sudo systemctl stop cfd-sidecar    # Stop
sudo systemctl restart cfd-sidecar # Restart
```

The **Start** button in the Corintis UI is a fallback and may fail if the web server user (nginx) lacks Docker access. The systemd service is the recommended approach for production.

## Endpoints

- `GET /health` - Check server and OpenFOAM availability
- `GET /shutdown` - Gracefully exit (localhost only)
- `POST /run-cfd` - Accept multipart STL (`geometry` field), run CFD, return `{ caseId, streamlinesUrl }`
- `GET /streamlines/:caseId` - Serve `streamlines.json` for a case

## Usage from Corintis

1. Load a CAD model (IGES, STEP, DXF, or IFC)
2. **Start CFD server** (if stopped): Run `sudo systemctl start cfd-sidecar`, or click **Start** in the CFD control block (fallback)
3. Click **Run Analysis**
4. Wait for OpenFOAM and post-processing to complete
5. Flow lines appear overlaid on the model
6. Click **Re-do** to run again with the same geometry
7. **Stop CFD server**: Click **Stop** in the CFD control block, or `sudo systemctl stop cfd-sidecar`

### Browser Start/Stop (fallback)

When Corintis is served from the same machine as the sidecar, you can try starting the sidecar from the UI:

- **CFD: Stopped** → Click **Start** to launch the sidecar (may fail if nginx lacks Docker access)
- **CFD: Running** → Click **Stop** to shut it down

**Recommended**: Use the systemd service (`sudo ./install-service.sh`) for reliable operation. The Start button requires the web server user (nginx) to be in the docker group; run `sudo ./setup-docker-permissions.sh` to add it. If Start fails, run `sudo systemctl start cfd-sidecar`.
