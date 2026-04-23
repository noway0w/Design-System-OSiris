"""
CarScan real-time YOLO API (FastAPI + WebSocket + JPEG frames).
Binds 127.0.0.1:9001 — use nginx to expose /api/carscan/ on HTTPS.

Env:
  CARSCAN_WEIGHTS  — path to yolov8 .pt (default: carscan yolov8n.pt)
  CARSCAN_CONF     — float confidence (default 0.35)
  CARSCAN_VEHICLE_ONLY — 0 to run all COCO classes (default 1 = vehicles)
"""
from __future__ import annotations

import json
import os
import time
from contextlib import asynccontextmanager
from typing import Any

import cv2
import numpy as np
from engine import RealtimeAnalyzer, SpeedTracker
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

DEFAULT_WEIGHTS = "/home/OSiris/public_html/carscan/yolov8n.pt"

_analyzer: RealtimeAnalyzer | None = None


def get_analyzer() -> RealtimeAnalyzer:
    global _analyzer
    if _analyzer is None:
        raise RuntimeError("analyzer not initialised")
    return _analyzer


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _analyzer
    w = os.environ.get("CARSCAN_WEIGHTS", DEFAULT_WEIGHTS)
    conf = float(os.environ.get("CARSCAN_CONF", "0.35"))
    vehicle_only = os.environ.get("CARSCAN_VEHICLE_ONLY", "1") != "0"
    imgsz = int(os.environ.get("CARSCAN_IMGSZ", "640"))
    _analyzer = RealtimeAnalyzer(
        w, conf=conf, vehicle_only=vehicle_only, imgsz=imgsz
    )
    # Warmup (first inference can be slow)
    z = np.zeros((480, 640, 3), dtype=np.uint8)
    _ = _analyzer.predict(z)
    yield
    _analyzer = None


app = FastAPI(title="CarScan realtime", version="0.2.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, Any]:
    ok = _analyzer is not None
    w = os.environ.get("CARSCAN_WEIGHTS", DEFAULT_WEIGHTS)
    return {
        "status": "ok" if ok else "degraded",
        "service": "carscan-realtime",
        "yolo_loaded": ok,
        "weights": w,
    }


@app.post("/ingest")
async def ingest(request: Request) -> JSONResponse:
    body = await request.body()
    if not body:
        return JSONResponse({"ok": False, "error": "empty body"}, status_code=400)
    data = np.frombuffer(body, dtype=np.uint8)
    frame = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if frame is None:
        return JSONResponse({"ok": False, "error": "not a valid image"}, status_code=400)
    t0 = time.perf_counter()
    dets = get_analyzer().predict(frame)
    inf_ms = (time.perf_counter() - t0) * 1000.0
    h, w = frame.shape[:2]
    return JSONResponse(
        {
            "ok": True,
            "width": w,
            "height": h,
            "detections": dets,
            "inference_ms": round(inf_ms, 2),
        }
    )


@app.websocket("/ws")
async def ws_frames(websocket: WebSocket) -> None:
    await websocket.accept()
    tracker = SpeedTracker()
    t_wall = time.perf_counter
    an = get_analyzer()
    try:
        while True:
            msg = await websocket.receive()
            if msg.get("type") == "websocket.disconnect":
                break
            data = msg.get("bytes")
            if not data:
                if msg.get("text") == "ping":
                    await websocket.send_text(json.dumps({"ok": True, "pong": True}))
                continue
            frame = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_COLOR)
            if frame is None:
                await websocket.send_text(json.dumps({"ok": False, "error": "bad_jpeg"}))
                continue
            t = t_wall()
            t0 = time.perf_counter()
            dets = an.predict(frame)
            inf_ms = (time.perf_counter() - t0) * 1000.0
            speed_est = tracker.update(t, dets)
            await websocket.send_text(
                json.dumps(
                    {
                        "ok": True,
                        "detections": dets,
                        "inference_ms": round(inf_ms, 2),
                        "speed_px_s": speed_est,
                    }
                )
            )
    except WebSocketDisconnect:
        pass
