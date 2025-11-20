// Zone to lamp ID mappings (from backend logic.py)
// These are the lamp IDs that get activated for each zone/wind combination
const ZONE_LAMP_MAPPINGS: Record<string, Record<string, number[]>> = {
  'zone a': {
    'N-S': [6, 105],
    'S-N': [4, 13, 22, 31, 42, 52, 70, 79, 97],
    'E-W': [6, 105],
    'W-E': [4, 13, 22, 31, 42, 52, 70, 79, 97],
  },
  'zone b': {
    'N-S': [6, 104],
    'S-N': [4, 15],
    'E-W': [4, 15],
    'W-E': [6, 104],
  },
  'zone c': {
    'N-S': [4, 15],
    'S-N': [4, 13, 22, 31, 42, 54, 58],
    'E-W': [4, 13, 22, 31, 42, 54, 60],
    'W-E': [4, 15],
  },
  'zone d': {
    'N-S': [6, 103],
    'S-N': [4, 13, 22, 31, 42, 52, 70, 81, 86],
    'E-W': [6, 103],
    'W-E': [4, 13, 22, 31, 42, 52, 70, 81, 86],
  },
  'zone e': {
    'N-S': [5],
    'S-N': [4, 14],
    'E-W': [4, 14],
    'W-E': [5],
  },
  'zone f': {
    'N-S': [6, 92, 103],
    'S-N': [4, 13, 22, 31, 42, 52, 70, 81, 86],
    'E-W': [6, 92, 103],
    'W-E': [4, 13, 22, 31, 42, 52, 70, 81, 86],
  },
  'zone g': {
    'N-S': [6, 88, 92, 103],
    'S-N': [4, 22, 13, 31, 42, 52, 72],
    'E-W': [4, 22, 13, 31, 42, 52, 72],
    'W-E': [6, 88, 92, 103],
  },
  'zone h': {
    'N-S': [4, 13, 22, 32],
    'S-N': [4, 13, 22, 32],
    'E-W': [4, 13, 23, 114],
    'W-E': [4, 13, 22, 32],
  },
  'zone k': {
    'N-S': [4, 13, 23, 113],
    'S-N': [4, 13, 23, 114, 119],
    'E-W': [4, 13, 22, 31, 41, 126],
    'W-E': [4, 13, 23, 112],
  },
};

/**
 * Get lamp IDs for a given zone and wind direction
 */
export const getZoneLampIds = (zoneName: string, windDirection: string): number[] => {
  const zoneKey = zoneName.toLowerCase().trim();
  const windKey = windDirection.toUpperCase().trim();
  
  const zoneMapping = ZONE_LAMP_MAPPINGS[zoneKey];
  if (!zoneMapping) {
    return [];
  }
  
  return zoneMapping[windKey] || [];
};

/**
 * Check if a lamp ID is part of the active zone
 */
export const isLampInActiveZone = (
  lampId: number,
  activeZone: string | null,
  windDirection: string
): boolean => {
  if (!activeZone) return false;
  const zoneLampIds = getZoneLampIds(activeZone, windDirection);
  return zoneLampIds.includes(lampId);
};

