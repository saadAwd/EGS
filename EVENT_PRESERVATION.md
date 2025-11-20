# Emergency Events Preservation for Reports

## ✅ Events Are NOT Deleted - Only Status Changed

### Important Clarification
When active zones are cleared, **emergency events are NOT deleted**. They are only marked as `cleared` instead of `active`. This preserves all historical data for report generation.

## How It Works

### 1. Event Lifecycle
```
Active Event → (deactivation) → Cleared Event
   ↓                              ↓
status='active'              status='cleared'
clear_time=null              clear_time=set
                             duration_minutes=calculated
```

### 2. Database Operations
- **Active events**: `status='active'`, `clear_time=NULL`
- **Cleared events**: `status='cleared'`, `clear_time=set`, `duration_minutes=calculated`
- **NO DELETE operations** - all events remain in database

### 3. What Gets Cleared on Startup
Only events with `status='active'` are affected:
```sql
UPDATE emergency_events 
SET status = 'cleared', clear_time = ?, duration_minutes = ?
WHERE status = 'active'  -- ONLY active events
```

**Historical cleared events are NOT touched** - they remain in the database.

## Report Generation

### ✅ Reports Can Access All Events

1. **List All Events** (`GET /api/emergency-events/`)
   - Returns **ALL events** (both active and cleared)
   - No status filter applied
   - Used by frontend to populate event dropdown

2. **Get Event Data** (`GET /api/reports/event/{event_id}/data`)
   - Queries by event ID, not by status
   - Works for both active and cleared events
   - Used for report generation

3. **Frontend Report Component**
   - Loads all events via `/api/emergency-events/`
   - Shows both active and cleared events in dropdown
   - Can generate reports for any event

### Example Query
```sql
-- This returns ALL events (active + cleared)
SELECT * FROM emergency_events 
ORDER BY activation_date DESC, activation_time DESC

-- Reports can access any event by ID
SELECT * FROM emergency_events WHERE id = ?
-- Works for both active and cleared events
```

## Verification

### Check All Events (Including Cleared)
```bash
curl http://localhost:8002/api/emergency-events/
```

Returns both active and cleared events:
```json
[
  {
    "id": 1,
    "zone_name": "Zone A",
    "status": "cleared",  // ← Cleared event, still available
    "clear_time": "14:30:00",
    "duration_minutes": 15
  },
  {
    "id": 2,
    "zone_name": "Zone B",
    "status": "active"  // ← Active event
  }
]
```

### Check Report Generation
1. Open frontend → "Generate Report"
2. Event dropdown shows **all events** (active + cleared)
3. Select any event (cleared or active)
4. Report can be generated for any event

## Data Preservation

### What's Preserved
✅ Event ID  
✅ Zone name  
✅ Wind direction  
✅ Activation date/time  
✅ Clear time (set when cleared)  
✅ Duration (calculated when cleared)  
✅ Status (changed from 'active' to 'cleared')  
✅ All data needed for reports  

### What's NOT Preserved
❌ Nothing - all data is preserved

## Summary

- ✅ **Events are NOT deleted** - only status changes
- ✅ **Historical events remain in database** - available for reports
- ✅ **Reports can access all events** - both active and cleared
- ✅ **Only active events are cleared** - historical cleared events untouched
- ✅ **System preserves all data** - for audit and reporting purposes

## Code References

- `GET /api/emergency-events/` - Returns all events (line 411)
- `GET /api/reports/event/{event_id}/data` - Gets event by ID (line 3102)
- Startup cleanup - Only updates `status='active'` events (line 1200)
- Clear endpoint - Only updates `status='active'` events (line 2272)

