# Simple Capture System - Enabled

## Status
- **Tracking System**: Disabled (for performance)
- **Capture System**: Enabled (lightweight)
- **Background Worker**: Running

## How It Works

### Capture Logic
1. **Unknown Faces**: Automatically captured and saved
2. **Known Faces**: Not captured (to reduce overhead)
3. **Duplicate Prevention**: Simple set-based check (prevents same-frame duplicates)

### File Naming
- Format: `UnknownGuest_X.jpg`
- Sequential numbering (auto-increments)
- Saved to: `known_faces/` folder

### Performance
- **Non-blocking**: All captures queued asynchronously
- **Lightweight**: Simple duplicate check (no complex cache)
- **Background processing**: File saving happens in separate thread

## Testing
When an Unknown face appears:
1. Face is detected and labeled "Unknown"
2. Face region is extracted
3. Capture is queued for background processing
4. File is saved as `UnknownGuest_X.jpg` in `known_faces/`
5. Database is reloaded (face becomes "Known" in next frame)

## Server Status
- Process: Running
- Port: 8878
- Capture: Active
