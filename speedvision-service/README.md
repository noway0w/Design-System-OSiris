# CarScan realtime (YOLOv8) service

Listens on **127.0.0.1:9001**. Use nginx to publish **`/api/carscan/`** and **`/api/carscan/ws`** (see [`scripts/carscan-nginx-snippets.conf`](../scripts/carscan-nginx-snippets.conf)).

## Setup

```bash
cd /home/OSiris/speedvision-service
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
```

Weights default to **`/home/OSiris/public_html/carscan/yolov8n.pt`** (override with `CARSCAN_WEIGHTS`).

## API

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | /health | — | status, `yolo_loaded`, `weights` path |
| POST | /ingest | raw JPEG | `detections[]`, `inference_ms` (COCO vehicle classes: car, bus, truck, …) |
| WebSocket | /ws | binary JPEG frames, repeated | JSON per frame: `detections`, `inference_ms`, `speed_px_s` (uncalibrated px/s) |

**Env:** `CARSCAN_CONF`, `CARSCAN_VEHICLE_ONLY` (default 1; set 0 for all COCO), `CARSCAN_IMGSZ` (default 640; try 416 on CPU), `CARSCAN_WEIGHTS`.

## systemd (user)

```bash
systemctl --user enable --now speedvision-carscan
```

## CORS

Open for development; restrict `allow_origins` when proxying a single site.
