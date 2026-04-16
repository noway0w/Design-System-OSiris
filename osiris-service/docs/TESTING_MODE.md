# Testing Mode: Capture Disabled

## Current Status
- **Capture System**: DISABLED (ENABLE_CAPTURE = False)
- **Tracking System**: DISABLED (ENABLE_TRACKING = False)
- **Face Recognition**: ENABLED (should work normally)

## Purpose
Testing if the capture system is causing the freeze when unknown faces are detected.

## Expected Behavior
- Video feed should work smoothly even with unknown faces
- Faces will be detected and labeled "Unknown"
- NO captures will be made
- NO files will be saved

## If This Fixes the Freeze
The issue is in the capture logic (face extraction, queue, or background worker).

## Next Steps
If video works smoothly now:
1. We'll identify which part of capture is blocking
2. Optimize or remove that part
3. Re-enable capture with fixes

## To Re-enable Capture
Change in osiris_server.py:
```python
ENABLE_CAPTURE = True  # Change from False to True
```
