#!/usr/bin/env python3
"""
Initialize zones in the database with the correct IDs and names.
Zones: A B C D E F G H K (IDs 1-9, skipping I and J)
"""

from database import SessionLocal, engine
from models import Zone as ZoneModel
from sqlalchemy.orm import Session

def initialize_zones():
    """Initialize all zones in the database"""
    db = SessionLocal()
    
    try:
        # Define the zones: A B C D E F G H K with IDs 1-9
        zones_data = [
            {"id": 1, "name": "Zone A"},
            {"id": 2, "name": "Zone B"}, 
            {"id": 3, "name": "Zone C"},
            {"id": 4, "name": "Zone D"},
            {"id": 5, "name": "Zone E"},
            {"id": 6, "name": "Zone F"},
            {"id": 7, "name": "Zone G"},
            {"id": 8, "name": "Zone H"},
            {"id": 9, "name": "Zone K"}
        ]
        
        print("🔄 Initializing zones...")
        
        # Clear existing zones first
        db.query(ZoneModel).delete()
        db.commit()
        print("✅ Cleared existing zones")
        
        # Create new zones
        for zone_data in zones_data:
            zone = ZoneModel(
                id=zone_data["id"],
                name=zone_data["name"],
                is_active=False,
                active_wind_direction=None
            )
            db.add(zone)
            print(f"➕ Added {zone_data['name']} (ID: {zone_data['id']})")
        
        db.commit()
        print("✅ All zones initialized successfully!")
        
        # Verify zones were created
        zones = db.query(ZoneModel).all()
        print(f"\n📊 Total zones in database: {len(zones)}")
        for zone in zones:
            print(f"   ID: {zone.id}, Name: {zone.name}")
            
    except Exception as e:
        print(f"❌ Error initializing zones: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    initialize_zones()
