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

## Endpoints

- `GET /health` - Check server and OpenFOAM availability
- `POST /run-cfd` - Accept multipart STL (`geometry` field), run CFD, return `{ caseId, streamlinesUrl }`
- `GET /streamlines/:caseId` - Serve `streamlines.json` for a case

## Usage from Corintis

1. Load a CAD model (IGES, STEP, DXF, or IFC)
2. Click **Run Analysis**
3. Wait for OpenFOAM and post-processing to complete
4. Flow lines appear overlaid on the model
5. Click **Re-do** to run again with the same geometry
