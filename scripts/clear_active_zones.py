#!/usr/bin/env python3
"""
Clear All Active Zones Script
Removes all active zones from the system to ensure clean state
"""

import sys
import os
import sqlite3
from datetime import datetime

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Use tsim.db for emergency_events (not database.db)
EMERGENCY_DB_PATH = "tsim.db"
DB_PATH = os.getenv("TSIM_DB_PATH", "database.db")  # For weather/lamps

def clear_all_active_zones():
    """Clear all active zones from database and system"""
    print("🧹 Clearing all active zones from system...")
    
    # 1. Clear all active emergency events from database (tsim.db)
    try:
        conn = sqlite3.connect(EMERGENCY_DB_PATH)
        cursor = conn.cursor()
        
        # Check if table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='emergency_events'")
        if not cursor.fetchone():
            print("   ℹ️  emergency_events table doesn't exist yet (will be created on first activation)")
            conn.close()
            return True
        
        # Get all active events
        cursor.execute('SELECT id, zone_name, wind_direction, activation_date, activation_time FROM emergency_events WHERE status = ?', ('active',))
        active_events = cursor.fetchall()
        
        if active_events:
            print(f"   Found {len(active_events)} active emergency events")
            now = datetime.now()
            clear_time = now.strftime("%H:%M:%S")
            clear_date = now.strftime("%Y-%m-%d")
            
            for event in active_events:
                event_id, zone_name, wind_direction, activation_date, activation_time = event
                # Calculate duration
                try:
                    activation_datetime = datetime.strptime(f"{activation_date} {activation_time}", "%Y-%m-%d %H:%M:%S")
                    clear_datetime = datetime.strptime(f"{clear_date} {clear_time}", "%Y-%m-%d %H:%M:%S")
                    duration = int((clear_datetime - activation_datetime).total_seconds() / 60)
                except:
                    duration = 0
                
                cursor.execute('''
                    UPDATE emergency_events 
                    SET clear_time = ?, duration_minutes = ?, status = 'cleared', updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                ''', (clear_time, duration, event_id))
                print(f"   ✅ Cleared event {event_id}: {zone_name} {wind_direction}")
            
            conn.commit()
            print(f"✅ Cleared {len(active_events)} active emergency events")
        else:
            print("   ✅ No active emergency events found")
        
        conn.close()
    except Exception as e:
        print(f"❌ Error clearing emergency events: {e}")
        return False
    
    # 2. Note: Sync state and gateway service are in-memory only
    # They will be cleared on backend restart or via API endpoint
    print("   ℹ️  Note: Sync state and gateway service are in-memory")
    print("   ℹ️  They will be cleared on backend restart")
    print("   ℹ️  Or call POST /api/system/clear-all-active-zones to clear them now")
    
    print("\n✅ All active zones cleared from database!")
    print("💡 Restart backend to clear in-memory state, or call the API endpoint")
    return True

if __name__ == "__main__":
    success = clear_all_active_zones()
    sys.exit(0 if success else 1)

