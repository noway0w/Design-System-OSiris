# Optimized Capture System

## Changes Made

### 1. Database Reload Disabled
- **Before**: Database reloaded after each capture (very slow)
- **After**: Database reload skipped (files saved, but faces become "known" on restart)
- **Impact**: Eliminates major delay source

### 2. Reduced Face Extraction Padding
- **Before**: 10px padding
- **After**: 5px padding
- **Impact**: Smaller region = faster copy operation

### 3. Smaller Queue
- **Before**: Queue size 20
- **After**: Queue size 5
- **Impact**: Prevents buildup, faster processing

### 4. Minimal Operations
- Face extraction: Minimal region copy
- Queue operation: Non-blocking (put_nowait)
- File saving: Background thread only

## Current Behavior
- Unknown faces: Captured and saved to known_faces/
- File naming: Sequential (UnknownGuest_X.jpg)
- Database: NOT reloaded (for performance)
- Self-learning: Disabled (faces become known on restart)

## Performance
- Capture operations: Minimal overhead
- No database reload: Major speed improvement
- Background processing: Fully asynchronous

## Trade-offs
- **Lost**: Immediate self-learning (faces become known on restart instead)
- **Gained**: Much better performance, no freezing

## To Enable Self-Learning (slower)
Uncomment the database reload code in background_capture_worker()
