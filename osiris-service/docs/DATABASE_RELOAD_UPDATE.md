# Database Reload Strategy Updated

## New Configuration
- **Frequency**: Every capture (or 30 seconds max interval)
- **Purpose**: Immediate self-learning while preventing excessive reloads

## How It Works
1. After each capture, check if 30+ seconds have passed since last reload
2. If yes → Reload database (face becomes "known")
3. If no → Skip reload (will reload on next capture after 30s)

## Benefits
- ✅ Immediate self-learning (within 30 seconds)
- ✅ Prevents excessive reloads (max once per 30s)
- ✅ Better performance than reloading every single capture
- ✅ Faces become "known" quickly

## Example Timeline
- Capture 1 at 0s → Reload database (face becomes known)
- Capture 2 at 5s → Skip reload (only 5s since last)
- Capture 3 at 35s → Reload database (30s+ passed)
- Capture 4 at 40s → Skip reload (only 5s since last)

## Server Status
- Process: Running
- Database Reload: Every capture (30s max interval)
