# Performance Investigation Results

## Findings

### 1. Cooldown Check (FIXED)
- Hash is 12.7x faster than tuple
- **Status**: Cooldown check now disabled entirely for testing

### 2. Face Recognition (LIKELY BOTTLENECK)
- **Operation**: `np.linalg.norm(KNOWN_FACE_ENCODINGS - face_encoding, axis=1)`
- **Known faces**: 35 files loaded
- **Cost**: ~0.5-1ms per face per frame
- **Impact**: With 2-3 faces, this is 1-3ms per frame
- **This is likely the main performance issue!**

### 3. Face Detection (dlib)
- Cannot be optimized (external library)
- Inherently slow but necessary

## Current Status
- Cooldown: DISABLED (testing)
- Capture: ENABLED (minimal operations)
- Database reload: Every 5 captures or 30s

## Next Steps
If performance is still bad with cooldown disabled:
1. The issue is likely face recognition distance calculation
2. Options:
   - Reduce known faces database size
   - Optimize distance calculation (use squared distance)
   - Cache recognition results
   - Use approximate nearest neighbor search

## Test Results Needed
Please test and report:
1. Is performance better with cooldown disabled?
2. How many faces are typically in frame?
3. What's the frame rate?
