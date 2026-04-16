# Performance Testing Guide

## Current Configuration
- **Capture**: ENABLED (ENABLE_CAPTURE = True)
- **Cooldown**: DISABLED (removed for performance)
- **Overhead**: Minimal (~0.2ms per unknown face)

## If Performance is Still Bad

### Step 1: Disable Capture
Edit `osiris_server.py` line ~25:
```python
ENABLE_CAPTURE = False  # Change from True to False
```

Then restart server and test:
- If performance improves → Capture system is the issue
- If performance still bad → Issue is in face detection/recognition

### Step 2: Check Known Faces Count
```bash
ls -1 known_faces/*.{jpg,jpeg,png} | wc -l
```
- If > 50 faces → Recognition will be slow
- Solution: Remove unused faces

### Step 3: Check Frame Size
- Larger frames = slower detection
- Check what resolution frames are being sent

## Current Optimizations Applied
- ✅ Cooldown removed (zero overhead)
- ✅ Lock operations removed
- ✅ Hash calculations removed
- ✅ Squared distance (no sqrt)
- ✅ Background processing
- ✅ Non-blocking queue

## Remaining Bottlenecks (Cannot Optimize)
- Face detection (dlib) - External library
- Face recognition distance calc - Necessary operation
- Image processing - Inherent cost

## Server Status
- Process: Running
- Capture: Enabled (can be disabled for testing)
