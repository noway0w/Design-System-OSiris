# Performance Diagnosis

## Current State
- Cooldown: REMOVED (zero overhead)
- Lock operations: REMOVED
- Hash calculations: REMOVED
- Real-time path: Minimal (just extraction + queue)

## Remaining Operations in Hot Path
1. Face detection (dlib) - Cannot optimize
2. Face recognition (distance calc) - Optimized (squared distance)
3. Face extraction: `rgb_frame[top:bottom, left:right]` - Fast slice
4. Copy operation: `.copy()` - Necessary for async
5. Queue operation: `put_nowait()` - Non-blocking

## If Performance is Still Bad

The issue is likely:
1. **Face detection (dlib)** - Inherently slow, cannot optimize
2. **Face recognition** - With many known faces, distance calc is slow
3. **Image size** - Larger frames = slower detection
4. **Number of faces** - More faces = more processing

## Possible Solutions

### Option 1: Disable Capture Temporarily
Test if capture is the issue:
- Comment out the capture code
- See if performance improves
- If yes → capture is the problem
- If no → face detection/recognition is the problem

### Option 2: Reduce Known Faces Database
- Fewer known faces = faster recognition
- Remove unused face files

### Option 3: Process Smaller Frames
- Resize frames before processing
- Faster detection on smaller images

## Next Steps
1. Test with capture disabled
2. Check frame size/resolution
3. Count number of known faces
4. Monitor CPU usage
