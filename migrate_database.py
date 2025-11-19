#!/usr/bin/env python3
"""
Database Migration Script
This script adds the new gateway columns to the existing database.
"""

import sqlite3
import sys
import os

def migrate_database():
    """Add new columns to the existing database"""
    db_path = "tsim.db"
    
    if not os.path.exists(db_path):
        print(f"❌ Database file {db_path} not found!")
        return False
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        print("🔧 Starting database migration...")
        
        # Check if columns already exist
        cursor.execute("PRAGMA table_info(lamps)")
        columns = [column[1] for column in cursor.fetchall()]
        
        # Add new columns if they don't exist
        new_columns = [
            ("gateway_switch_id", "INTEGER"),
            ("gateway_command_on", "VARCHAR(5)"),
            ("gateway_command_off", "VARCHAR(5)")
        ]
        
        for column_name, column_type in new_columns:
            if column_name not in columns:
                print(f"➕ Adding column: {column_name}")
                cursor.execute(f"ALTER TABLE lamps ADD COLUMN {column_name} {column_type}")
            else:
                print(f"✅ Column already exists: {column_name}")
        
        # Create gateways table if it doesn't exist
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS gateways (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR(50) UNIQUE NOT NULL,
                ip_address VARCHAR(15) NOT NULL,
                wifi_ssid VARCHAR(50) NOT NULL,
                is_connected BOOLEAN DEFAULT 0,
                last_heartbeat DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        print("✅ Gateways table created/verified")
        
        # Commit changes
        conn.commit()
        print("✅ Database migration completed successfully!")
        
        return True
        
    except Exception as e:
        print(f"❌ Migration failed: {str(e)}")
        if conn:
            conn.rollback()
        return False
    finally:
        if conn:
            conn.close()

def populate_gateway_mapping():
    """Populate the gateway mapping for first 30 lamps"""
    db_path = "tsim.db"
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        print("🔧 Populating gateway mapping...")
        
        # Command mapping based on ESP32 code
        command_mapping = {
            1: {"on": "b", "off": "a"},
            2: {"on": "d", "off": "c"},
            3: {"on": "f", "off": "e"},
            4: {"on": "h", "off": "g"},
            5: {"on": "j", "off": "i"},
            6: {"on": "l", "off": "k"},
            7: {"on": "n", "off": "m"},
            8: {"on": "p", "off": "o"},
            9: {"on": "r", "off": "q"},
            10: {"on": "t", "off": "s"},
            11: {"on": "v", "off": "u"},
            12: {"on": "x", "off": "w"},
            13: {"on": "z", "off": "y"},
            14: {"on": "B", "off": "A"},
            15: {"on": "D", "off": "C"},
            16: {"on": "F", "off": "E"},
            17: {"on": "H", "off": "G"},
            18: {"on": "J", "off": "I"},
            19: {"on": "L", "off": "K"},
            20: {"on": "N", "off": "M"},
            21: {"on": "P", "off": "O"},
            22: {"on": "R", "off": "Q"},
            23: {"on": "T", "off": "S"},
            24: {"on": "V", "off": "U"},
            25: {"on": "X", "off": "W"},
            26: {"on": "Z", "off": "Y"},
            27: {"on": "1", "off": "0"},
            28: {"on": "3", "off": "2"},
            29: {"on": "5", "off": "4"},
            30: {"on": "7", "off": "6"}
        }
        
        # Get first 30 lamps ordered by ID
        cursor.execute("SELECT id, gateway_id FROM lamps ORDER BY id LIMIT 30")
        lamps = cursor.fetchall()
        
        print(f"Found {len(lamps)} lamps to update...")
        
        for i, (lamp_id, gateway_id) in enumerate(lamps, 1):
            if i <= 30:  # Map to switches 1-30
                switch_id = i
                command_on = command_mapping[i]["on"]
                command_off = command_mapping[i]["off"]
                
                cursor.execute("""
                    UPDATE lamps 
                    SET gateway_switch_id = ?, gateway_command_on = ?, gateway_command_off = ?
                    WHERE id = ?
                """, (switch_id, command_on, command_off, lamp_id))
                
                print(f"✅ Updated lamp {gateway_id} -> switch {switch_id} ({command_off}/{command_on})")
        
        # Create default gateway record
        cursor.execute("""
            INSERT OR IGNORE INTO gateways (name, ip_address, wifi_ssid, is_connected)
            VALUES ('ESP32-Gateway-1', '192.168.4.1', 'Aramco_EES', 0)
        """)
        
        conn.commit()
        print(f"✅ Updated gateway mapping for {len(lamps)} lamps")
        print("✅ Created default ESP32 gateway record")
        
        return True
        
    except Exception as e:
        print(f"❌ Population failed: {str(e)}")
        if conn:
            conn.rollback()
        return False
    finally:
        if conn:
            conn.close()

def main():
    """Main function to run the migration"""
    print("🚀 Starting Database Migration...")
    print("=" * 50)
    
    # Step 1: Migrate database schema
    if not migrate_database():
        return 1
    
    # Step 2: Populate gateway mapping
    if not populate_gateway_mapping():
        return 1
    
    print("=" * 50)
    print("✅ Database migration completed successfully!")
    print("\n📋 Summary:")
    print("- Added gateway columns to lamps table")
    print("- Created gateways table")
    print("- Mapped first 30 lamps to ESP32 switches")
    print("- Created default ESP32 gateway record")
    print("\n🔧 Next steps:")
    print("1. Restart the backend server")
    print("2. Test the Traffic Light Management dashboard")
    print("3. Connect to ESP32 gateway")
    
    return 0

if __name__ == "__main__":
    exit(main())

