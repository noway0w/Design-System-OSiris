# Phase 1: Context Analysis - COMPLETE

## Structure Identified

### 1. Main Video Processing Loop
- **Location**: `handle_client()` function (line 275)
- **Type**: Async WebSocket handler
- **Flow**: Receives frames → calls `recognize_faces()` → sends annotated frame back

### 2. Face Detection & Recognition Loop
- **Location**: `recognize_faces()` function (line 169)
- **Current Loop**: Line 184 - `for face_encoding in face_encodings_list:`
- **Current Logic**: Simple recognition against KNOWN_FACE_ENCODINGS, no tracking/capture

### 3. Face Embedding Generation
- **Location**: `encode_face()` function (line 50)
- **Output**: 128D numpy arrays (face_encodings_list)
- **Storage**: Currently only in KNOWN_FACE_ENCODINGS global variable

### 4. Known Faces Directory
- **Path**: `known_faces/` (relative to script location)
- **Current Usage**: Loaded at startup via `load_known_faces("known_faces")` (line 163)
- **Files**: Contains .jpg, .JPG, .jpeg, .JPEG, .png, .PNG files

## Key Points for Implementation
- Face embeddings are 128D numpy arrays
- Recognition happens in `recognize_faces()` function
- Main loop is in `handle_client()` async function
- No current tracking or capture mechanism exists
- Need to add threading/async for background file operations
