#!/usr/bin/env python3
"""
Test script to verify the corrected lamp-to-pole mapping
"""

# Simulate the corrected mapping logic
def test_mapping():
    lamp_commands = {
        1: {"on": "b", "off": "a"},
        2: {"on": "d", "off": "c"},
        3: {"on": "f", "off": "e"},
        4: {"on": "h", "off": "g"},
        5: {"on": "j", "off": "i"},
        6: {"on": "l", "off": "k"},
        7: {"on": "n", "off": "m"},
        8: {"on": "p", "off": "o"},
        9: {"on": "r", "off": "q"}
    }
    
    command_mapping = {}
    
    # Generate mapping for all 126 lamps (14 poles × 9 lamps each)
    for lamp_id in range(1, 127):  # Lamps 1-126
        pole_id = ((lamp_id - 1) // 9) + 1  # Pole 1-14
        lamp_position = ((lamp_id - 1) % 9) + 1  # Position 1-9 within pole
        device_letter = chr(ord('A') + pole_id - 1)  # Device A-N
        
        # Get the correct command for this lamp position
        lamp_cmd = lamp_commands[lamp_position]
        
        command_mapping[lamp_id] = {
            "device": device_letter,
            "lamp": lamp_position,
            "pole": pole_id,
            "on": lamp_cmd["on"],
            "off": lamp_cmd["off"]
        }
    
    # Test specific mappings
    test_cases = [
        (1, "A", 1, 1, "b", "a"),      # Lamp 1 -> Device A, Lamp 1, Pole 1
        (9, "A", 9, 1, "r", "q"),      # Lamp 9 -> Device A, Lamp 9, Pole 1
        (10, "B", 1, 2, "b", "a"),     # Lamp 10 -> Device B, Lamp 1, Pole 2
        (18, "B", 9, 2, "r", "q"),     # Lamp 18 -> Device B, Lamp 9, Pole 2
        (19, "C", 1, 3, "b", "a"),     # Lamp 19 -> Device C, Lamp 1, Pole 3
        (126, "N", 9, 14, "r", "q"),   # Lamp 126 -> Device N, Lamp 9, Pole 14
    ]
    
    print("Testing Lamp-to-Pole-Device Mapping:")
    print("=" * 60)
    
    for lamp_id, expected_device, expected_lamp, expected_pole, expected_on, expected_off in test_cases:
        mapping = command_mapping[lamp_id]
        device = mapping["device"]
        lamp = mapping["lamp"]
        pole = mapping["pole"]
        on_cmd = mapping["on"]
        off_cmd = mapping["off"]
        
        print(f"Lamp {lamp_id:3d}: Device {device}, Lamp {lamp}, Pole {pole:2d} -> ON: {on_cmd}, OFF: {off_cmd}")
        
        # Verify correctness
        assert device == expected_device, f"Lamp {lamp_id}: Expected device {expected_device}, got {device}"
        assert lamp == expected_lamp, f"Lamp {lamp_id}: Expected lamp {expected_lamp}, got {lamp}"
        assert pole == expected_pole, f"Lamp {lamp_id}: Expected pole {expected_pole}, got {pole}"
        assert on_cmd == expected_on, f"Lamp {lamp_id}: Expected ON command {expected_on}, got {on_cmd}"
        assert off_cmd == expected_off, f"Lamp {lamp_id}: Expected OFF command {expected_off}, got {off_cmd}"
    
    print("\n✅ All mappings are correct!")
    print(f"Total lamps mapped: {len(command_mapping)}")
    
    # Show pole distribution
    print("\nPole Distribution:")
    print("=" * 30)
    for pole in range(1, 15):
        pole_lamps = [lamp_id for lamp_id, mapping in command_mapping.items() if mapping["pole"] == pole]
        device = command_mapping[pole_lamps[0]]["device"] if pole_lamps else "N/A"
        print(f"Pole {pole:2d} (Device {device}): Lamps {min(pole_lamps):3d}-{max(pole_lamps):3d} ({len(pole_lamps)} lamps)")

if __name__ == "__main__":
    test_mapping()
