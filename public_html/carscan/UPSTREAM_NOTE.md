# Upstream SpeedVision vs this deployment

- **Readme.md** in the repository describes a YOLO-based vehicle speed pipeline (`speedvision.py`, trackers, `input/` / `output/`). That structure does not appear in the current **`master` shallow clone** checked in here.
- **`main.py` on `master`** is a desktop **Tkinter** app (“Bill Wizard”): Tesseract invoice OCR, not YOLO inference. No `ultralytics` import in that file.
- **Weights in repo** (`yolov8n.pt`, `yolov8plate.pt`) suggest vehicle/plate work may exist elsewhere; wire those into a headless service under `/home/OSiris/speedvision-service/` when the correct inference entry point is found (fork/branch, or new module).

Next step for full SpeedVision: locate or author a `numpy` frame → detections + speed function, then call it from the stub HTTP server in `speedvision-service/`.
