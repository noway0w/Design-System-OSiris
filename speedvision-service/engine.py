"""
Real-time YOLOv8 analysis for CarScan. Uses COCO vehicle classes by default.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any

import numpy as np
from ultralytics import YOLO

# COCO indices: car, motorcycle, bus, train, truck
DEFAULT_VEHICLE_CLASSES = frozenset({2, 3, 5, 6, 7})


@dataclass
class TrackState:
    cx: float
    cy: float
    cls: int
    t: float


@dataclass
class SpeedTracker:
    """Greedy same-class matching between consecutive frames; speed in pixels/s (uncalibrated)."""

    max_match_px: float = 200.0
    prev: list[TrackState] = field(default_factory=list)

    def update(
        self, t: float, detections: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        speeds: list[dict[str, Any]] = []
        new_prev: list[TrackState] = []
        unused_prev = set(range(len(self.prev)))
        for d in detections:
            xyxy = d["xyxy"]
            cx = (xyxy[0] + xyxy[2]) / 2.0
            cy = (xyxy[1] + xyxy[3]) / 2.0
            cls = int(d["cls"])
            best_idx = -1
            best_d2 = self.max_match_px**2
            for j in list(unused_prev):
                p = self.prev[j]
                if p.cls != cls:
                    continue
                d2 = (cx - p.cx) ** 2 + (cy - p.cy) ** 2
                if d2 < best_d2:
                    best_d2 = d2
                    best_idx = j
            if best_idx >= 0 and (best_d2**0.5) < self.max_match_px:
                p = self.prev[best_idx]
                unused_prev.discard(best_idx)
                dt = max(t - p.t, 1e-6)
                dist = best_d2**0.5
                spx = dist / dt
                speeds.append(
                    {
                        "cls": cls,
                        "name": d.get("name"),
                        "speed_px_s": round(spx, 1),
                    }
                )
            new_prev.append(TrackState(cx=cx, cy=cy, cls=cls, t=t))
        self.prev = new_prev
        return speeds


class RealtimeAnalyzer:
    def __init__(
        self,
        weights: str,
        *,
        conf: float = 0.35,
        iou: float = 0.5,
        imgsz: int = 640,
        vehicle_only: bool = True,
    ) -> None:
        if not os.path.isfile(weights):
            raise FileNotFoundError(f"weights not found: {weights}")
        self.model = YOLO(weights)
        self.conf = conf
        self.iou = iou
        self.imgsz = imgsz
        self.vehicle_only = vehicle_only
        if vehicle_only:
            self._classes: frozenset[int] = DEFAULT_VEHICLE_CLASSES
        else:
            self._classes = frozenset(range(1000))

    def predict(self, frame_bgr: np.ndarray) -> list[dict[str, Any]]:
        results = self.model.predict(
            frame_bgr,
            conf=self.conf,
            iou=self.iou,
            imgsz=self.imgsz,
            verbose=False,
        )
        r = results[0]
        out: list[dict[str, Any]] = []
        if r.boxes is None or len(r.boxes) == 0:
            return out
        names = r.names
        for b in r.boxes:
            cls = int(b.cls[0])
            if cls not in self._classes:
                continue
            xyxy = b.xyxy[0].cpu().numpy().tolist()
            c = float(b.conf[0])
            out.append(
                {
                    "cls": cls,
                    "name": names.get(cls, str(cls)) if isinstance(names, dict) else names[cls],
                    "conf": round(c, 3),
                    "xyxy": [round(float(x), 1) for x in xyxy],
                }
            )
        return out
