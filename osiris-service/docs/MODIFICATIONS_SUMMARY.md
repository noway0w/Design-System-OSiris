# Summary of Modifications to osiris_server.py

## Statistics
- **Total changes**: 341 insertions, 51 deletions
- **Net addition**: ~290 lines of code

## Major Additions

### 1. New Imports (Lines ~12-16)
```python
+ import threading
+ import queue
+ import time
+ import re
+ from collections import defaultdict
```

### 2. New Global State Section (Lines ~52-75)
- `FACE_TRACKING_CACHE`: Dictionary for tracking individual faces
- `FACE_TRACKING_LOCK`: Thread-safe lock for cache access
- `COOLDOWN_PERIOD`: 10 seconds cooldown constant
- `face_capture_queue`: Background processing queue
- `sequence_lock`: Lock for sequential file numbering
- `known_faces_lock`: Lock for known faces reload

### 3. New Functions Added

#### Sequential File Numbering
- `get_next_sequence_number()`: Finds highest UnknownGuest_X number and increments

#### Face Tracking Cache Management
- `get_face_key()`: Creates hashable key from face encoding with fuzzy matching
- `get_face_status()`: Retrieves status and LCT from cache
- `update_face_status()`: Updates cache with new status and timestamp
- `is_cooldown_active()`: Checks if 10-second cooldown is active
- `cleanup_expired_cache_entries()`: Removes old cache entries

#### Background Processing
- `background_processing_worker()`: Daemon thread for async DB ingestion

### 4. Modified `recognize_faces()` Function

**Before**: Simple recognition loop, no tracking or capture logic

**After**: 
- Individual face processing with unique tracking keys
- Cooldown logic per face
- Capture decision logic (Unknown vs Known faces)
- Non-blocking queue operations
- Cache management

### 5. Modified `load_known_faces()` Function
- Added support for .heic/.HEIC files
- Improved error handling

### 6. New `reload_known_faces()` Function
- Thread-safe reloading with atomic swap
- Called by background worker after saving new faces

## Key Logic Changes

### Multi-Face Individual Tracking
Each face is now processed independently:
1. Get/create unique face key from embedding
2. Check cache for status and LCT
3. Apply capture logic based on status and cooldown
4. Update cache with new status/timestamp

### Capture Logic
- **Unknown Face**: Capture immediately (if not in cooldown)
- **Known Face (Cooldown Active)**: Skip capture
- **Known Face (Cooldown Expired)**: Capture for updated appearance

### Background Processing
- Face captures queued asynchronously
- Background thread handles file saving and DB reload
- Sequential naming: UnknownGuest_X.jpg

## Performance Optimizations
- Non-blocking queue operations (put_nowait)
- Minimal face region extraction
- Atomic reference swapping for known faces
- Cache cleanup to prevent memory leaks
