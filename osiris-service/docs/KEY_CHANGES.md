# Key Changes to osiris_server.py

## Before vs After: recognize_faces() Function

### BEFORE (Original GitHub Version)
```python
def recognize_faces(frame_bgr):
    # Simple loop through faces
    for face_encoding in face_encodings_list:
        # Basic recognition logic
        if KNOWN_FACE_ENCODINGS.size == 0:
            name = "Unknown"
        else:
            # Match against known faces
            distances = np.linalg.norm(KNOWN_FACE_ENCODINGS - face_encoding, axis=1)
            matches = [d <= tolerance for d in distances]
            if True in matches:
                name = KNOWN_FACE_NAMES[first_match]
            else:
                name = "Unknown"
        face_names.append(name)
    # Just drawing, no capture logic
```

### AFTER (New Multi-Face Tracking Version)
```python
def recognize_faces(frame_bgr):
    # Process each face individually with tracking
    for idx, face_encoding in enumerate(face_encodings_list):
        # Recognition logic (same as before)
        name = "Unknown" or known_name
        
        # NEW: Get unique face key for tracking
        face_key = get_face_key(face_encoding, tolerance)
        
        # NEW: Individual face processing logic
        if face_key is not None:
            cache_status, cache_lct = get_face_status(face_key)
            
            # NEW: Capture decision logic
            should_capture = False
            
            if name == "Unknown":
                # Unknown: Capture if not in cooldown
                if cache_status is None or not is_cooldown_active(face_key):
                    should_capture = True
                    update_face_status(face_key, 'Unknown', current_time)
            else:
                # Known: Check cooldown
                if cache_status is None or not is_cooldown_active(face_key):
                    should_capture = True
                    update_face_status(face_key, 'Known', current_time)
            
            # NEW: Non-blocking capture queue
            if should_capture:
                face_region_rgb = rgb_frame[top:bottom, left:right].copy()
                face_capture_queue.put_nowait((face_encoding, face_region_rgb, "known_faces"))
```

## New Components Added

### 1. Face Tracking Cache System
- **Purpose**: Track each face individually with status and timestamp
- **Key Functions**:
  - `get_face_key()`: Creates unique identifier from face embedding
  - `get_face_status()`: Retrieves current status and LCT
  - `update_face_status()`: Updates cache with new data
  - `is_cooldown_active()`: Checks 10-second cooldown

### 2. Background Processing Worker
- **Purpose**: Asynchronously save faces and update database
- **Operations**:
  - Sequential file naming (UnknownGuest_X.jpg)
  - Save to known_faces/ folder
  - Reload known faces database

### 3. Sequential File Numbering
- **Function**: `get_next_sequence_number()`
- **Logic**: Scans existing UnknownGuest_X files, finds max, increments

## Summary of All Changes

| Component | Before | After |
|-----------|--------|-------|
| **Face Processing** | Batch loop | Individual tracking per face |
| **Tracking** | None | Cache with status + LCT |
| **Cooldown** | None | 10 seconds per face |
| **Capture Logic** | None | Conditional based on status/cooldown |
| **File Saving** | None | Background queue + sequential naming |
| **Threading** | None | Background worker thread |
| **Locks** | None | Multiple RLock/Lock for thread safety |

## Code Statistics
- **Lines Added**: ~341
- **Lines Removed**: ~51
- **Net Change**: +290 lines
- **New Functions**: 7
- **New Global Variables**: 6
