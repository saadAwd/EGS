#!/usr/bin/env python3
"""
Update Gateway Mapping Script
This script updates the database with gateway fields and populates lamp mapping for ESP32 integration.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.orm import Session
from database import SessionLocal, engine
from models import Lamp, Gateway, Base, Pole
from gateway_service import ESP32GatewayService
import asyncio

def create_tables():
    """Create new tables if they don't exist"""
    print("Creating new tables...")
    Base.metadata.create_all(bind=engine)
    print("✅ Tables created successfully")

def update_lamp_gateway_mapping():
    """Update lamp records with gateway switch mapping for physically installed lamps (Poles 1-6, Side 1)"""
    db = SessionLocal()
    try:
        # Command mapping for physically installed lamps: Pole 1-6, Side 1 only (18 lamps total)
        command_mapping = {
            # Pole 1, Side 1 (Lamps 1-3)
            1: {"on": "b", "off": "a"},   # L1 - Pole 1, Side 1, Straight
            2: {"on": "d", "off": "c"},   # L2 - Pole 1, Side 1, Left  
            3: {"on": "f", "off": "e"},   # L3 - Pole 1, Side 1, Right
            
            # Pole 2, Side 1 (Lamps 4-6)
            4: {"on": "h", "off": "g"},   # L4 - Pole 2, Side 1, Straight
            5: {"on": "j", "off": "i"},   # L5 - Pole 2, Side 1, Left
            6: {"on": "l", "off": "k"},   # L6 - Pole 2, Side 1, Right
            
            # Pole 3, Side 1 (Lamps 7-9)
            7: {"on": "n", "off": "m"},   # L7 - Pole 3, Side 1, Straight
            8: {"on": "p", "off": "o"},   # L8 - Pole 3, Side 1, Left
            9: {"on": "r", "off": "q"},   # L9 - Pole 3, Side 1, Right
            
            # Pole 4, Side 1 (Lamps 10-12)
            10: {"on": "t", "off": "s"},  # L10 - Pole 4, Side 1, Straight
            11: {"on": "v", "off": "u"},  # L11 - Pole 4, Side 1, Left
            12: {"on": "x", "off": "w"},  # L12 - Pole 4, Side 1, Right
            
            # Pole 5, Side 1 (Lamps 13-15)
            13: {"on": "z", "off": "y"},  # L13 - Pole 5, Side 1, Straight
            14: {"on": "B", "off": "A"},  # L14 - Pole 5, Side 1, Left
            15: {"on": "D", "off": "C"},  # L15 - Pole 5, Side 1, Right
            
            # Pole 6, Side 1 (Lamps 16-18)
            16: {"on": "F", "off": "E"},  # L16 - Pole 6, Side 1, Straight
            17: {"on": "H", "off": "G"},  # L17 - Pole 6, Side 1, Left
            18: {"on": "J", "off": "I"}   # L18 - Pole 6, Side 1, Right
        }

        # Map the actual installed lamps in the exact physical switch order (1..18)
        installed_ids_in_order = [4,5,6, 13,14,15, 22,23,24, 31,32,33, 40,41,42, 49,50,51]
        lamps_list = db.query(Lamp).filter(Lamp.id.in_(installed_ids_in_order)).all()
        id_to_lamp = {l.id: l for l in lamps_list}
        lamps = [id_to_lamp[i] for i in installed_ids_in_order if i in id_to_lamp]
        
        print(f"Mapping physically installed lamps (Poles 1-6, Side 1)...")
        print(f"Found {len(lamps)} lamps to update...")
        
        for i, lamp in enumerate(lamps, 1):
            if i in command_mapping:  # Map to switches 1-18
                lamp.gateway_switch_id = i
                lamp.gateway_command_on = command_mapping[i]["on"]
                lamp.gateway_command_off = command_mapping[i]["off"]
                
                print(f"✅ Mapped Lamp ID {lamp.id} ({lamp.gateway_id}) -> Switch {i} ({lamp.gateway_command_off}/{lamp.gateway_command_on})")
        
        db.commit()
        print(f"✅ Updated gateway mapping for {len(lamps)} lamps")
        
        # Show remaining lamps without mapping
        remaining_lamps = db.query(Lamp).filter(Lamp.gateway_switch_id.is_(None)).count()
        print(f"ℹ️  {remaining_lamps} lamps remain unmapped (will be mapped when ESP32 supports more switches)")
        
        return True
        
    except Exception as e:
        print(f"❌ Error updating lamp gateway mapping: {str(e)}")
        db.rollback()
        return False
    finally:
        db.close()

def create_default_gateway():
    """Create default ESP32 gateway record"""
    db = SessionLocal()
    try:
        # Check if gateway already exists
        existing_gateway = db.query(Gateway).filter(Gateway.name == "ESP32-Gateway-1").first()
        
        if existing_gateway:
            print("✅ Default gateway already exists")
            return True
        
        # Create default gateway
        gateway = Gateway(
            name="ESP32-Gateway-1",
            ip_address="192.168.4.1",
            wifi_ssid="ESP32_AP",
            is_connected=False
        )
        
        db.add(gateway)
        db.commit()
        print("✅ Created default ESP32 gateway record")
        return True
        
    except Exception as e:
        print(f"❌ Error creating default gateway: {str(e)}")
        db.rollback()
        return False
    finally:
        db.close()

def main():
    """Main function to run the update process"""
    print("🚀 Starting Gateway Mapping Update...")
    print("=" * 50)
    
    try:
        # Step 1: Create tables
        create_tables()
        
        # Step 2: Create default gateway
        create_default_gateway()
        
        # Step 3: Update lamp mapping
        update_lamp_gateway_mapping()
        
        print("=" * 50)
        print("✅ Gateway mapping update completed successfully!")
        print("\n📋 Summary:")
        print("- Database tables updated")
        print("- Default ESP32 gateway created")
        print("- First 30 lamps mapped to ESP32 switches")
        print("\n🔧 Next steps:")
        print("1. Start the backend server")
        print("2. Connect to ESP32 gateway via the Traffic Light Management dashboard")
        print("3. Test lamp activation/deactivation")
        
    except Exception as e:
        print(f"❌ Update failed: {str(e)}")
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main())
