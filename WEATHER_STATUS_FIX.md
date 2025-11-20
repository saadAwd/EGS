# Weather Status Indicator Fix

## Problem

The weather status indicator in the StatusRibbon shows "Weather: Xs ago" but:
- Only updates when visiting the EGS Dashboard page
- Resets to 0 and becomes idle after the initial update
- Doesn't update in real-time as new weather data arrives

## Root Cause

1. **StatusRibbon** uses `dataUpdatedAt` from React Query's `useWeather()` hook
2. `dataUpdatedAt` only updates when React Query successfully refetches data
3. When a WebSocket `weather_update` message arrives:
   - It invalidates the query (triggers refetch)
   - But `dataUpdatedAt` doesn't update until the refetch completes
   - The age calculation is static until the next refetch

## Solution

### Changes Made

1. **StatusRibbon.tsx**:
   - Added local state to track `lastWeatherUpdateTime` from WebSocket messages
   - Added a 1-second interval to update `currentTime` for real-time age calculation
   - Listen for `weather_update` WebSocket messages and update timestamp immediately
   - Use WebSocket timestamp if available, otherwise fall back to `dataUpdatedAt`
   - Age calculation now updates every second in real-time

### How It Works Now

```
Weather Worker (every 60s)
    ↓ Broadcasts WebSocket: {type: "weather_update", data: {...}}
    ↓
StatusRibbon Component
    ↓ Receives WebSocket message
    ↓ Updates lastWeatherUpdateTime = Date.now()
    ↓
1-Second Interval Timer
    ↓ Updates currentTime every second
    ↓ Recalculates age = currentTime - lastWeatherUpdateTime
    ↓
UI Updates in Real-Time
    ✅ Shows "0s ago", "1s ago", "2s ago", etc.
```

### Benefits

- ✅ Real-time updates: Status shows live countdown (0s, 1s, 2s, ...)
- ✅ Works across all pages: No need to visit EGS Dashboard to refresh
- ✅ Immediate feedback: Updates as soon as WebSocket message arrives
- ✅ Fallback support: Uses `dataUpdatedAt` if WebSocket timestamp not available

## Testing

1. Start the backend server
2. Open the frontend
3. Watch the StatusRibbon weather indicator
4. It should update every second showing the age
5. When weather worker polls (every 60s), the timestamp resets and countdown restarts

## Files Modified

- `traffic-safety-ui/src/components/StatusRibbon.tsx`

