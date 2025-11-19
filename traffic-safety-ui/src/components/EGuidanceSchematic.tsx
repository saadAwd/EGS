import React, { useEffect, useRef, useState, useCallback } from 'react';

interface TrafficLightArrow {
  id: number;
  device_id: number;
  direction: 'left' | 'straight' | 'right';
  is_on: boolean;
  last_updated: string;
}

interface RoutePolicy {
  routeId: number;
  zoneId: number;
  zoneName: string;
  windDirection: string;
}

interface IntersectionConfig {
  id: string;
  x: number;
  y: number;
  size: number;
  type: 'cross' | 't-junction' | 'y-junction' | 'roundabout';
  connections: Array<{
    direction: 'north' | 'south' | 'east' | 'west' | 'northeast' | 'northwest' | 'southeast' | 'southwest';
    roadWidth: number;
    roadType: 'horizontal' | 'vertical' | 'diagonal';
    enabled: boolean;
  }>;
  style?: {
    fillColor?: string;
    strokeColor?: string;
    strokeWidth?: number;
    opacity?: number;
  };
}

const EGuidanceSchematic: React.FC = () => {
  const svgRef = useRef<SVGSVGElement>(null);

  // Responsive UI scale for strokes/text to look crisp on large displays
  const [uiScale, setUiScale] = useState<number>(1);
  useEffect(() => {
    const computeScale = () => {
      const baseW = 1920; // baseline desktop width
      const baseH = 1080; // baseline desktop height
      const scaleW = window.innerWidth / baseW;
      const scaleH = window.innerHeight / baseH;
      const s = Math.min(scaleW, scaleH);
      const clamped = Math.max(0.8, Math.min(2.5, s));
      setUiScale(clamped);
    };
    computeScale();
    window.addEventListener('resize', computeScale);
    return () => window.removeEventListener('resize', computeScale);
  }, []);
  
  // State for zones and wind directions
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [selectedWind, setSelectedWind] = useState<string | null>(null);
  const [routePolicy, setRoutePolicy] = useState<any>(null);
  const [activeRoute, setActiveRoute] = useState<any>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [activeDevices, setActiveDevices] = useState<number>(0);
  const [totalDevices, setTotalDevices] = useState<number>(0);
  const [totalZones, setTotalZones] = useState<number>(9);
  const [lastUpdated, setLastUpdated] = useState<string>('Never');
  const [routePolicies, setRoutePolicies] = useState<Record<string, RoutePolicy[]>>({});
  const [policyStatus, setPolicyStatus] = useState('Loading route policies...');
  const [connectionStatus, setConnectionStatus] = useState('Checking backend connection...');
  const [routePath, setRoutePath] = useState<string>('');
  const [availableZones, setAvailableZones] = useState<string[]>([]);
  const [availableWindDirections, setAvailableWindDirections] = useState<string[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Backend configuration
  const BACKEND_URL = 'http://localhost:8002';

  // Test backend connection
  const testBackendConnection = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/zones/`);
      if (response.ok) {
        console.log('Backend connection successful');
        return true;
      } else {
        console.warn('Backend responded but with error:', response.status);
        return false;
      }
    } catch (error) {
      console.error('Backend connection failed:', error);
      return false;
    }
  };

  // Fetch route policies from backend
  const fetchRoutePolicies = async () => {
    try {
      // Test backend connection first
      const connected = await testBackendConnection();
      if (!connected) {
        setPolicyStatus('Backend not accessible - check if server is running on port 8002');
        setConnectionStatus('Backend not accessible');
        setIsConnected(false);
        return;
      }
      setConnectionStatus('Backend accessible');
      setIsConnected(true);
      
      // Fetch zones and routes from backend
      const zonesResponse = await fetch(`${BACKEND_URL}/api/zones/`);
      const routesResponse = await fetch(`${BACKEND_URL}/api/routes/`);
      
      if (!zonesResponse.ok || !routesResponse.ok) {
        console.warn('Failed to fetch zones/routes from backend');
        setPolicyStatus(`Backend error: ${zonesResponse.status} / ${routesResponse.status}`);
        return;
      }
      
      const zones = await zonesResponse.json();
      const routes = await routesResponse.json();
      
      console.log('Raw zones data:', zones);
      console.log('Raw routes data:', routes);
      
      // Build route policies for each wind direction
      const policies: Record<string, RoutePolicy[]> = {};
      routes.forEach((route: any) => {
        const wind = route.wind_direction;
        if (!policies[wind]) {
          policies[wind] = [];
        }
        const zoneName = zones.find((z: any) => z.id === route.zone_id)?.name || `Zone ${route.zone_id}`;
        console.log(`Route ${route.id}: zone_id=${route.zone_id}, zone_name=${zoneName}, wind=${wind}`);
        policies[wind].push({
          routeId: route.id,
          zoneId: route.zone_id,
          zoneName: zoneName,
          windDirection: wind
        });
      });
      
      setRoutePolicies(policies);
      console.log('Route policies loaded:', policies);
      setPolicyStatus(`Policies loaded: ${Object.keys(policies).length} wind directions`);
      
      // Extract available zones and wind directions from the data
      const availableZoneIds = [...new Set(routes.map((route: any) => route.zone_id.toString()))] as string[];
      const availableWindDirs = [...new Set(routes.map((route: any) => route.wind_direction))] as string[];
      
      setAvailableZones(availableZoneIds);
      setAvailableWindDirections(availableWindDirs);
      
      console.log('Available zones:', availableZoneIds);
      console.log('Available wind directions:', availableWindDirs);
    } catch (error: any) {
      console.error('Error fetching route policies:', error);
      setPolicyStatus(`Connection error: ${error.message}`);
      setConnectionStatus('Connection error');
      setIsConnected(false);
    }
  };

  // Fetch route policy and compute path
  const fetchRoutePolicy = async (routeId: number, zoneId: string, wind: string) => {
    console.log('=== FETCH ROUTE POLICY START ===');
    console.log('Fetching policy for routeId:', routeId, 'zoneId:', zoneId, 'wind:', wind);
    
    try {
      const url = `${BACKEND_URL}/api/routes/${routeId}/policy`;
      console.log('Making API call to:', url);
      
      const response = await fetch(url);
      console.log('API response status:', response.status, 'ok:', response.ok);
      
      if (!response.ok) {
        console.warn(`Failed to fetch policy for route ${routeId}`);
        console.log('Response status:', response.status);
        console.log('Response statusText:', response.statusText);
        return null;
      }
      
      const policy: TrafficLightArrow[] = await response.json();
      console.log('Received policy:', policy);
      
      if (!policy || policy.length === 0) {
        console.warn(`No policy found for route ${routeId}`);
        return null;
      }
      
      console.log('=== FETCH ROUTE POLICY END ===');
      return {
        policy,
        startTL: 'TL1',
        zoneId,
        wind
      };
    } catch (error) {
      console.error('Error fetching route policy:', error);
      console.log('=== FETCH ROUTE POLICY END WITH ERROR ===');
      return null;
    }
  };

  // Compute route based on actual policy sequence
  const computeRoute = async (zoneId: string, wind: string) => {
    console.log('=== COMPUTE ROUTE START ===');
    console.log('Computing route for:', { zoneId, wind, routePolicies });
    
    // Find the route for this zone and wind direction
    const routes = routePolicies[wind] || [];
    console.log('Available routes for wind', wind, ':', routes);
    
    if (routes.length === 0) {
      console.log('No routes found for wind direction:', wind);
      console.log('Available wind directions in policies:', Object.keys(routePolicies));
      return null;
    }
    
    // Find route by zone name - try multiple matching patterns
    const route = routes.find(r => {
      console.log('Checking route:', r, 'against zoneId:', zoneId);
      console.log('Route zoneName:', r.zoneName, 'Looking for:', `Zone ${zoneId}`);
      
      // Try multiple matching patterns
      const zonePatterns = [
        `Zone ${zoneId}`,           // "Zone A", "Zone B", etc.
        `Zone ${zoneId.toUpperCase()}`, // "Zone A", "Zone B", etc.
        `Zone ${zoneId.toLowerCase()}`, // "Zone a", "Zone b", etc.
        zoneId,                     // Just "A", "B", etc.
        zoneId.toUpperCase(),       // "A", "B", etc.
        zoneId.toLowerCase(),       // "a", "b", etc.
        parseInt(zoneId).toString() // Convert to integer string for backend matching
      ];
      
      const matches = zonePatterns.some(pattern => r.zoneName === pattern);
      console.log('Zone patterns to try:', zonePatterns);
      console.log('Route zoneName matches any pattern:', matches);
      
      return matches;
    });
    
    if (!route) {
      console.warn(`No route found for Zone ${zoneId} with wind ${wind}`);
      console.log('Available routes:', routes);
      console.log('Available zone names:', routes.map(r => r.zoneName));
      return null;
    }
    
    console.log('Found route:', route);
    console.log('=== COMPUTE ROUTE END ===');
    
    // Fetch the actual policy sequence from backend
    return await fetchRoutePolicy(route.routeId, zoneId, wind);
  };

  // Handle zone selection - send to backend
  const handleZoneClick = async (zoneId: string) => {
    console.log('Zone clicked:', zoneId);
    setSelectedZone(zoneId);
    
    try {
      // Send zone selection to backend using the correct endpoint
      const response = await fetch(`${BACKEND_URL}/api/zones/${parseInt(zoneId)}/status`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (response.ok) {
        const zoneStatus = await response.json();
        console.log('Zone status retrieved:', zoneStatus);
      } else {
        console.warn('Failed to get zone status from backend:', response.status);
      }
    } catch (error) {
      console.error('Error getting zone status from backend:', error);
    }
  };

  // Handle wind direction selection
  const handleWindSelect = async (wind: string) => {
    console.log('Wind selected:', wind);
    setSelectedWind(wind);
  };

  // Handle route activation - send to backend
  const handleActivate = async () => {
    console.log('=== ACTIVATION START ===');
    console.log('Activate clicked, selectedZone:', selectedZone, 'selectedWind:', selectedWind);
    console.log('Available zones:', availableZones);
    console.log('Available wind directions:', availableWindDirections);
    console.log('Current routePolicies:', routePolicies);
    console.log('Is connected:', isConnected);
    
    if (!selectedZone || !selectedWind) {
      console.log('Missing zone or wind selection');
      return;
    }
    
    if (!isConnected) {
      console.log('Backend not connected');
      return;
    }
    
    try {
      // Send activation request to backend using the correct endpoint
      const requestBody = { 
        zone_id: parseInt(selectedZone), 
        wind_direction: selectedWind
      };
      console.log('Sending activation request:', requestBody);
      console.log('Request URL:', `${BACKEND_URL}/api/activate/`);
      
      const response = await fetch(`${BACKEND_URL}/api/activate/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        console.warn('Failed to activate route on backend:', response.status);
        const errorText = await response.text();
        console.error('Backend error response:', errorText);
        return;
      }
      
      const activationResult = await response.json();
      console.log('Backend activation result:', activationResult);
      
      // Get the route from backend response - the backend returns active_route
      let route = activationResult.active_route;
      if (!route) {
        console.log('No active_route in backend response, computing locally...');
        route = await computeRoute(selectedZone, selectedWind);
      }
      
      // If we have a route from backend, we need to fetch its policy
      if (route && route.id) {
        console.log('Fetching policy for route:', route.id);
        const policyResponse = await fetch(`${BACKEND_URL}/api/routes/${route.id}/policy`);
        if (policyResponse.ok) {
          const policy = await policyResponse.json();
          console.log('Route policy:', policy);
          route = {
            ...route,
            policy: policy
          };
        }
      }
    
    if (route) {
      console.log('Route activated successfully:', route);
      setActiveRoute(route);
      
      // Generate route path
      const zoneCenter = getZoneCenter(selectedZone);
      const tl1Pos = getTLPosition('TL1');
      
      console.log('Zone center:', zoneCenter, 'TL1 position:', tl1Pos);
      
      if (zoneCenter && tl1Pos) {
          // Build path: TL1 (entry) -> policy sequence -> zone center
          const points: [number, number][] = [tl1Pos];
        
        // Add each TL in the policy sequence
          if (route.policy && Array.isArray(route.policy)) {
        route.policy.forEach((item: any) => {
          const tlPos = getTLPosition(`TL${item.device_id}`);
          console.log(`TL${item.device_id} position:`, tlPos);
          if (tlPos) {
            points.push(tlPos);
          }
        });
          } else {
            console.log('No policy found in route:', route);
          }
          
          // End at the selected zone center
          points.push(zoneCenter);
        
        console.log('Route points:', points);
        
        // Generate SVG path
        const pathData = generateSVGPath(points);
        console.log('Generated SVG path:', pathData);
        setRoutePath(pathData);
      } else {
        console.log('Failed to get zone center or TL1 position');
      }
    } else {
      console.log('Route computation failed');
      }
    } catch (error) {
      console.error('Error activating route on backend:', error);
    }
    console.log('=== ACTIVATION END ===');
  };

  // Handle clear - notify backend and clear all
  const handleClear = async () => {
    console.log('=== CLEAR ALL START ===');
    
    try {
      // First, get all active zones from backend
      const zonesResponse = await fetch(`${BACKEND_URL}/api/zones/`);
      if (zonesResponse.ok) {
        const zones = await zonesResponse.json();
        const activeZones = zones.filter((zone: any) => zone.is_active);
        
        console.log('Found active zones to deactivate:', activeZones);
        
        // Deactivate each active zone
        for (const zone of activeZones) {
          try {
            const response = await fetch(`${BACKEND_URL}/api/deactivate/`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ zone_id: zone.id })
            });
            
            if (response.ok) {
              console.log(`Zone ${zone.name} (ID: ${zone.id}) deactivated successfully`);
            } else {
              console.warn(`Failed to deactivate zone ${zone.name}:`, response.status);
            }
          } catch (error) {
            console.error(`Error deactivating zone ${zone.name}:`, error);
          }
        }
        
        console.log('All active zones deactivated');
      } else {
        console.warn('Failed to fetch zones for deactivation');
      }
    } catch (error) {
      console.error('Error during deactivation process:', error);
    }
    
    // Clear local state immediately for better UX
    setSelectedZone(null);
    setSelectedWind(null);
    setActiveRoute(null);
    setRoutePath('');
    
    console.log('=== CLEAR ALL END ===');
  };

  // Handle refresh
  const handleRefresh = () => {
    setConnectionStatus('Refreshing...');
    setPolicyStatus('Refreshing policies...');
    fetchRoutePolicies();
  };

  // Get zone center coordinates
  const getZoneCenter = (zoneId: string): [number, number] | null => {
    const zone = LAYOUT_CONFIG.zones[zoneId];
    if (!zone) return null;
    return [zone.x + zone.width / 2, zone.y + zone.height / 2];
  };

  // Get TL position coordinates
  const getTLPosition = (tlId: string): [number, number] | null => {
    const tl = LAYOUT_CONFIG.trafficLights[tlId];
    if (!tl) return null;
    return [tl.x, tl.y];
  };

  // Generate SVG path from points
  const generateSVGPath = (points: [number, number][]): string => {
    if (points.length === 0) return '';
    const [x, y] = points[0];
    let path = `M ${x} ${y}`;
    for (let i = 1; i < points.length; i++) {
      path += ` L ${points[i][0]} ${points[i][1]}`;
    }
    return path;
  };

  // Render intersection component
  const renderIntersection = (intersection: IntersectionConfig) => {
    const { x, y, size, type, connections, style } = intersection;
    const fillColor = style?.fillColor || '#4b5563';
    const strokeColor = style?.strokeColor || '#1f2937';
    const strokeWidth = style?.strokeWidth || 2;
    const opacity = style?.opacity || 0.8;

    const renderConnection = (conn: any, index: number) => {
      if (!conn.enabled) return null;
      
      const roadLength = size * 0.8;
      let roadPath = '';
      
      switch (conn.direction) {
        case 'north':
          roadPath = `M ${x},${y - size/2} L ${x},${y - size/2 - roadLength}`;
          break;
        case 'south':
          roadPath = `M ${x},${y + size/2} L ${x},${y + size/2 + roadLength}`;
          break;
        case 'east':
          roadPath = `M ${x + size/2},${y} L ${x + size/2 + roadLength},${y}`;
          break;
        case 'west':
          roadPath = `M ${x - size/2},${y} L ${x - size/2 - roadLength},${y}`;
          break;
        case 'northeast':
          roadPath = `M ${x + size/2},${y - size/2} L ${x + size/2 + roadLength},${y - size/2 - roadLength}`;
          break;
        case 'northwest':
          roadPath = `M ${x - size/2},${y - size/2} L ${x - size/2 - roadLength},${y - size/2 - roadLength}`;
          break;
        case 'southeast':
          roadPath = `M ${x + size/2},${y + size/2} L ${x + size/2 + roadLength},${y + size/2 + roadLength}`;
          break;
        case 'southwest':
          roadPath = `M ${x - size/2},${y + size/2} L ${x - size/2 - roadLength},${y + size/2 + roadLength}`;
          break;
      }
      
      return (
        <g key={`${intersection.id}-conn-${index}`}>
          {/* Road surface */}
          <path
            d={roadPath}
            stroke="#374151"
            strokeWidth={conn.roadWidth}
            fill="none"
            opacity={0.9}
          />
          {/* Center line */}
          <path
            d={roadPath}
            stroke="white"
            strokeWidth={3}
            fill="none"
            strokeDasharray="8,4"
            opacity={0.8}
          />
        </g>
      );
    };

    const renderIntersectionBody = () => {
      switch (type) {
        case 'cross':
          return (
            <rect
              x={x - size / 2}
              y={y - size / 2}
              width={size}
              height={size}
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              opacity={opacity}
            />
          );

        case 't-junction':
          return (
            <path
              d={`M ${x - size/2},${y - size/2} L ${x + size/2},${y - size/2} L ${x + size/2},${y + size/2} L ${x - size/2},${y + size/2} Z`}
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              opacity={opacity}
            />
          );

        case 'roundabout':
          return (
            <>
              <circle
                cx={x}
                cy={y}
                r={size / 2}
                fill={fillColor}
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                opacity={opacity}
              />
              <circle
                cx={x}
                cy={y}
                r={size / 3}
                fill="#374151"
                stroke="none"
                opacity={0.9}
              />
            </>
          );

        case 'y-junction':
          return (
            <path
              d={`M ${x},${y + size/2} L ${x - size/2},${y - size/2} L ${x + size/2},${y - size/2} Z`}
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              opacity={opacity}
            />
          );

        default:
          return null;
      }
    };

    return (
      <g key={intersection.id}>
        {/* Connection roads */}
        {connections.map((conn, index) => renderConnection(conn, index))}
        
        {/* Intersection body */}
        {renderIntersectionBody()}
        
        {/* Intersection ID label - removed for cleaner appearance */}
      </g>
    );
  };

  // Layout Configuration
  const LAYOUT_CONFIG: {
    viewBox: { width: number; height: number };
    zones: Record<string, { x: number; y: number; width: number; height: number; color: string }>;
    trafficLights: Record<string, { x: number; y: number; isEntryPoint: boolean; color: string }>;
    streets: Array<{
      id: string;
      type: 'horizontal' | 'vertical' | 'diagonal' | 'perimeter' | 'internal' | 'positioned' | 'curved';
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      start?: { x: number; y: number };
      end?: { x: number; y: number };
      radius?: number;
      startAngle?: number;
      endAngle?: number;
      color?: string;
      strokeDasharray?: string;
    }>;
    intersections: IntersectionConfig[];
    plantBoundary: {
      type: 'ellipse' | 'custom';
      points?: Array<{ x: number; y: number }>;
      color: string;
      strokeColor: string;
      strokeWidth: number;
    };
  } = {
    // Plant boundaries and viewport
    viewBox: { width: 2000, height: 1600 },
    
    // Zone positions and sizes - All 9 zones (A-K, IDs 1-9)
    zones: {
      '1': { x: 200, y: 150, width: 180, height: 80, color: '#22c55e' },   // Zone A - Green by default
      '2': { x: 450, y: 150, width: 180, height: 80, color: '#22c55e' },   // Zone B - Green by default
      '3': { x: 700, y: 150, width: 180, height: 80, color: '#22c55e' },   // Zone C - Green by default
      '4': { x: 950, y: 150, width: 180, height: 80, color: '#22c55e' },   // Zone D - Green by default
      '5': { x: 1200, y: 150, width: 180, height: 80, color: '#22c55e' },  // Zone E - Green by default
      '6': { x: 1450, y: 150, width: 180, height: 80, color: '#22c55e' },  // Zone F - Green by default
      '7': { x: 200, y: 400, width: 180, height: 80, color: '#22c55e' },   // Zone G - Green by default
      '8': { x: 450, y: 400, width: 180, height: 80, color: '#22c55e' },   // Zone H - Green by default
      '9': { x: 700, y: 400, width: 180, height: 80, color: '#22c55e' }    // Zone K - Green by default
    },
    
    // Traffic light positions - Include all devices from backend policy
    trafficLights: {
      'TL1': { x: 1161, y: 70, isEntryPoint: true, color: '#14b8a6' },
      'TL2': { x: 1161, y: 220, isEntryPoint: false, color: '#94a3b8' },
      'TL4': { x: 1275, y: 400, isEntryPoint: false, color: '#94a3b8' },
      'TL6': { x: 955, y: 890, isEntryPoint: false, color: '#94a3b8' },
      'TL8': { x: 445, y: 510, isEntryPoint: false, color: '#94a3b8' },
      'TL9': { x: 450, y: 70, isEntryPoint: false, color: '#94a3b8' },
      'TL10': { x: 855, y: 210, isEntryPoint: false, color: '#94a3b8' },
      'TL13': { x: 100, y: 510, isEntryPoint: false, color: '#94a3b8' },
      'TL14': { x: 1275, y: 890, isEntryPoint: false, color: '#94a3b8' }
    },
    
    // Street layout
    streets: [
      // Main perimeter road
      { 
        id: 'perimeter-main',
        type: 'perimeter',
        start: { x:1170, y: 250 },
        end: { x: 1250, y: 370 },
        width: 30
      },
      // Perimeter road top section
      { 
        id: 'perimeter-top',
        type: 'horizontal',
        x: 75,         // Start position from left (reduced indentation)
        y: 1200,         // Vertical position
        width: 1850,  // Width from start position (utilizing more space)
        height: 30
      },
      // Perimeter road bottom section
      { 
        id: 'perimeter-bottom-right',
        type: 'horizontal',
        x: 1305,         // Start position from left (reduced indentation)
        y: 900,        // Compact height
        width: 210,  // Width from start position (utilizing more space)
        height: 30
      },
      { 
        id: 'perimeter-bottom-left',
        type: 'horizontal',
        x: 180,         // Start position from left (reduced indentation)
        y: 900,        // Compact height
        width: 1270,  // Width from start position (utilizing more space)
        height: 30
      },
      // Main vertical center road
      { 
        id: 'main-vertical-ZoneH-Right',
        type: 'vertical',
        x: 1595,
        y: 200,         // Start from top (reduced indentation)
        width: 30,
        height: 620    // Compact height
      },
      { 
        id: 'main-vertical-Junction-down',
        type: 'vertical',
        x: 1275,
        y: 400,         // Start from top (reduced indentation)
        width: 30,
        height: 500    // Compact height
      },
      // Top cross road
      { 
        id: 'cross-top',
        type: 'horizontal',
        y: 220,
        x: 780,
        width: 400,
        height: 30
      },
      { 
        id: 'cross-top-right',
        type: 'horizontal',
        y: 80,
        x: 180,
        width: 550,
        height: 30
      },
      // Middle cross road
      { 
        id: 'cross-middle-Y-junction',
        type: 'horizontal',
        y: 295,
        x: 1379,
        width: 190,
        height: 30
      },
      { 
        id: 'cross-middle-right-end',
        type: 'horizontal',
        y: 120,
        x: 1675,
        width: 205,
        height: 30
      },
      { 
        id: 'cross-middle-left-end',
        type: 'horizontal',
        y: 520,
        x: 120,
        width: 400,
        height: 30
      },
      // Left internal road
      { 
        id: 'left-internal',
        type: 'vertical',
        x: 1162,
        y: 40,
        width: 30,
        height: 155
      },
      // Right internal road
      { 
        id: 'right-internal',
        type: 'vertical',
        x: 1900,        // Horizontal position
        y: 160,         // Start at y=200 (this will now work!)
        width: 30,      // Road width
        height: 250     // Height from start position
      },
      { 
        id: 'right-internal-bottom',
        type: 'vertical',
        x: 955,        // Horizontal position
        y: 790,         // Start at y=200 (this will now work!)
        width: 30,      // Road width
        height: 100     // Height from start position
      },
      { 
        id: 'right-internal-top',
        type: 'vertical',
        x: 855,        // Horizontal position
        y: 190,         // Start at y=200 (this will now work!)
        width: 30,      // Road width
        height: 100     // Height from start position
      },
      { 
        id: 'left-internal',
        type: 'vertical',
        x: 100,        // Horizontal position
        y: 160,         // Start at y=200 (this will now work!)
        width: 30,      // Road width
        height: 665     // Height from start position
      },
      { 
        id: 'left-internal-top',
        type: 'vertical',
        x: 450,        // Horizontal position
        y: 110,         // Start at y=200 (this will now work!)
        width: 30,      // Road width
        height: 480     // Height from start position
      },
        
        // === CURVED ROAD PIECES FOR CORNERS ===
      // Top-left corner curve (90° turn from horizontal to vertical)
      {
        id: 'corner-bottomC-left',
        type: 'curved',
        x: 180,        // Center point of the curve
        y: 820,         // Center point of the curve
        radius: 80,    // Radius of the curve
        startAngle: 90, // Start at 0° (right direction)
        endAngle: 180,  // End at 90° (down direction)
        width: 30      // Road width
      },
      // Top-right corner curve (90° turn from horizontal to vertical)
      {
        id: 'corner-top-right',
        type: 'curved',
        x: 1900,       // Center point of the curve
        y: 120,         // Center point of the curve
        radius: 40,    // Radius of the curve
        startAngle: 180, // Start at 90° (down direction)
        endAngle: 90, // End at 180° (left direction)
        width: 30      // Road width
      },
      {
        id: 'corner-top-right',
        type: 'curved',
        x: 855,       // Center point of the curve
        y: 80,         // Center point of the curve
        radius: 125,    // Radius of the curve
        startAngle: 180, // Start at 90° (down direction)
        endAngle: 90, // End at 180° (left direction)
        width: 30      // Road width
      },
      {
        id: 'angle-Y-junction-top',
        type: 'curved',
        x: 1380,       // Center point of the curve - moved to connect with perimeter
        y: 375,         // Center point of the curve - aligned with perimeter start
        radius: 80,    // Larger radius for smoother curve
        startAngle: 180, // Start at 180° (left direction)
        endAngle: 270, // End at 270° (up direction)
        width: 30      // Road width
      },
      {
        id: 'angle-Y-junction-bottom',
        type: 'curved',
        x: 1675,       // Center point of the curve - moved to connect with perimeter
        y: 200,         // Center point of the curve - aligned with perimeter start
        radius: 80,    // Larger radius for smoother curve
        startAngle: 180, // Start at 180° (left direction)
        endAngle: 270, // End at 270° (up direction)
        width: 30      // Road width
      },
      {
        id: 'left-side--top',
        type: 'curved',
        x: 180,       // Center point of the curve - moved to connect with perimeter
        y: 160,         // Center point of the curve - aligned with perimeter start
        radius: 80,    // Larger radius for smoother curve
        startAngle: 180, // Start at 180° (left direction)
        endAngle: 270, // End at 270° (up direction)
        width: 30      // Road width
      },
      // Bottom-right corner curve (180° turn from horizontal to vertical)
      {
        id: 'corner-bottom-right',
        type: 'curved',
        x: 1515,       // Center point of the curve
        y: 820,         // Center point of the curve
        radius: 80,    // Radius of the curve
        startAngle: 0, // Start at 90° (down direction)
        endAngle: 90, // End at 180° (left direction)
        width: 30      // Road width
      }
    ],
    
    // Intersections - One of each type for connecting road portions
    intersections: [
      /*
      // Cross intersection - connects main vertical and horizontal roads
      {
        id: 'intersection-cross-1',
        x: 1160,
        y: 230,
        size: 80,
        type: 'cross',
        connections: [
          { direction: 'north', roadWidth: 40, roadType: 'vertical', enabled: false },
          { direction: 'south', roadWidth: 40, roadType: 'vertical', enabled: true },
          { direction: 'east', roadWidth: 40, roadType: 'horizontal', enabled: true },
          { direction: 'west', roadWidth: 40, roadType: 'horizontal', enabled: true }
        ],
        style: {
          fillColor: '#4b5563',
          strokeColor: '#1f2937',
          strokeWidth: 2,
          opacity: 0.8
        }
      },*/
      
      // T-junction - connects to the top cross road
      {
        id: 'intersection-t-1',
        x: 1595,
        y: 295,
        size: 60,
        type: 't-junction',
        connections: [
          { direction: 'north', roadWidth: 40, roadType: 'vertical', enabled: false },
          { direction: 'east', roadWidth: 40, roadType: 'horizontal', enabled: false },
          { direction: 'west', roadWidth: 40, roadType: 'horizontal', enabled: false }
        ],
        style: {
          fillColor: '#4b5563',
          strokeColor: '#1f2937',
          strokeWidth: 2,
          opacity: 1
        }
      },
      {
        id: 'intersection-t-2',
        x: 1275,
        y: 900,
        size: 60,
        type: 't-junction',
        connections: [
          { direction: 'north', roadWidth: 40, roadType: 'vertical', enabled: false },
          { direction: 'east', roadWidth: 40, roadType: 'horizontal', enabled: false },
          { direction: 'west', roadWidth: 40, roadType: 'horizontal', enabled: false }
        ],
        style: {
          fillColor: '#4b5563',
          strokeColor: '#1f2937',
          strokeWidth: 2,
          opacity: 1
        }
      },
      {
        id: 'intersection-t-3',
        x: 955,
        y: 900,
        size: 60,
        type: 't-junction',
        connections: [
          { direction: 'north', roadWidth: 40, roadType: 'vertical', enabled: false },
          { direction: 'east', roadWidth: 40, roadType: 'horizontal', enabled: false },
          { direction: 'west', roadWidth: 40, roadType: 'horizontal', enabled: false }
        ],
        style: {
          fillColor: '#4b5563',
          strokeColor: '#1f2937',
          strokeWidth: 2,
          opacity: 1
        }
      },
      {
        id: 'intersection-t-4',
        x: 855,
        y: 220,
        size: 60,
        type: 't-junction',
        connections: [
          { direction: 'north', roadWidth: 40, roadType: 'vertical', enabled: false },
          { direction: 'east', roadWidth: 40, roadType: 'horizontal', enabled: false },
          { direction: 'west', roadWidth: 40, roadType: 'horizontal', enabled: false }
        ],
        style: {
          fillColor: '#4b5563',
          strokeColor: '#1f2937',
          strokeWidth: 2,
          opacity: 1
        }
      },
      {
        id: 'intersection-t-5',
        x: 100,
        y: 520,
        size: 60,
        type: 't-junction',
        connections: [
          { direction: 'north', roadWidth: 40, roadType: 'vertical', enabled: false },
          { direction: 'east', roadWidth: 40, roadType: 'horizontal', enabled: false },
          { direction: 'west', roadWidth: 40, roadType: 'horizontal', enabled: false }
        ],
        style: {
          fillColor: '#4b5563',
          strokeColor: '#1f2937',
          strokeWidth: 2,
          opacity: 1
        }
      },
      {
        id: 'intersection-t-6',
        x: 450,
        y: 80,
        size: 60,
        type: 't-junction',
        connections: [
          { direction: 'north', roadWidth: 40, roadType: 'vertical', enabled: false },
          { direction: 'east', roadWidth: 40, roadType: 'horizontal', enabled: false },
          { direction: 'west', roadWidth: 40, roadType: 'horizontal', enabled: false }
        ],
        style: {
          fillColor: '#4b5563',
          strokeColor: '#1f2937',
          strokeWidth: 2,
          opacity: 1
        }
      },
      {
        id: 'intersection-t-7',
        x: 445,
        y: 520,
        size: 60,
        type: 't-junction',
        connections: [
          { direction: 'north', roadWidth: 40, roadType: 'vertical', enabled: false },
          { direction: 'east', roadWidth: 40, roadType: 'horizontal', enabled: false },
          { direction: 'west', roadWidth: 40, roadType: 'horizontal', enabled: false }
        ],
        style: {
          fillColor: '#4b5563',
          strokeColor: '#1f2937',
          strokeWidth: 2,
          opacity: 1
        }
      },
      
      // Roundabout - connects multiple roads in the center area
      {
        id: 'intersection-roundabout-1',
        x: 1160,
        y: 225,
        size: 80,
        type: 'roundabout',
        connections: [
          { direction: 'north', roadWidth: 40, roadType: 'vertical', enabled: false },
          { direction: 'south', roadWidth: 40, roadType: 'vertical', enabled: false },
          { direction: 'east', roadWidth: 40, roadType: 'horizontal', enabled: false },
          { direction: 'west', roadWidth: 40, roadType: 'horizontal', enabled: false }
        ],
        style: {
          fillColor: '#4b5563',
          strokeColor: '#1f2937',
          strokeWidth: 2,
          opacity: 0.8
        }
      },
      
      // Y-junction - connects diagonal roads
      {
        id: 'intersection-y-1',
        x: 1275,
        y: 415,
        size: 110,
        type: 'y-junction',
        connections: [
          { direction: 'south', roadWidth: 40, roadType: 'vertical', enabled: false },
          { direction: 'southeast', roadWidth: 40, roadType: 'diagonal', enabled: false },
          { direction: 'southwest', roadWidth: 40, roadType: 'diagonal', enabled: false }
        ],
        style: {
          fillColor: '#4b5563',
          strokeColor: '#1f2937',
          strokeWidth: 2, 
          opacity: 1.0
        }
      },
    ],
    
    // Plant boundary - Scales with expanded viewBox height for responsiveness
    plantBoundary: {
      type: 'custom',
      points: [
        { x: 75, y: 50 },
        { x: 1925, y: 50 },
        { x: 1925, y: 1500 },
        { x: 75, y: 1500 }
      ],
      color: '#fef3c7',
      strokeColor: '#d97706',
      strokeWidth: 4
    }
  };

  // Initialize on component mount
  useEffect(() => {
    console.log('E-Guidance Schematic initializing...');
    console.log('Backend URL:', BACKEND_URL);
    console.log('LAYOUT_CONFIG:', LAYOUT_CONFIG);
    fetchRoutePolicies();
  }, []);

  // Set up polling to sync with emergency portal
  useEffect(() => {
    const syncInterval = setInterval(() => {
      syncWithBackend();
    }, 2000); // Poll every 2 seconds
    
    return () => clearInterval(syncInterval);
  }, [selectedZone, selectedWind, routePolicies]); // Dependencies for sync function

  // Sync with backend to get current activation state
  const syncWithBackend = async () => {
    try {
      setIsSyncing(true);
      
      // Get current zones to check for active ones
      const zonesResponse = await fetch(`${BACKEND_URL}/api/zones/`);
      if (zonesResponse.ok) {
        const zones = await zonesResponse.json();
        const activeZone = zones.find((zone: any) => zone.is_active);
        
        if (activeZone) {
          console.log('Found active zone from backend:', activeZone);
          
          // Update frontend state to match backend
          const zoneId = activeZone.id.toString();
          const windDirection = activeZone.active_wind_direction;
          
          if (zoneId !== selectedZone || windDirection !== selectedWind) {
            console.log('Syncing with backend - Zone:', zoneId, 'Wind:', windDirection);
            setSelectedZone(zoneId);
            setSelectedWind(windDirection);
            
            // Fetch and set the active route
            await fetchAndSetActiveRoute(zoneId, windDirection);
          }
        } else if (selectedZone || selectedWind) {
          // No active zone in backend, clear frontend state
          console.log('No active zone in backend, clearing frontend state');
          setSelectedZone(null);
          setSelectedWind(null);
          setActiveRoute(null);
          setRoutePath('');
        }
      }
    } catch (error) {
      console.error('Error syncing with backend:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  // Fetch and set active route based on zone and wind
  const fetchAndSetActiveRoute = async (zoneId: string, windDirection: string) => {
    try {
      // Find the route for this zone and wind
      const routes = routePolicies[windDirection] || [];
      const route = routes.find(r => r.zoneId.toString() === zoneId);
      
      if (route) {
        // Fetch the policy for this route
        const policyResponse = await fetch(`${BACKEND_URL}/api/routes/${route.routeId}/policy`);
        if (policyResponse.ok) {
          const policy = await policyResponse.json();
          const fullRoute = {
            ...route,
            policy: policy
          };
          
          setActiveRoute(fullRoute);
          
          // Generate route path
          const zoneCenter = getZoneCenter(zoneId);
          const tl1Pos = getTLPosition('TL1');
          
          if (zoneCenter && tl1Pos) {
            const points: [number, number][] = [tl1Pos];
            
            if (policy && Array.isArray(policy)) {
              policy.forEach((item: any) => {
                const tlPos = getTLPosition(`TL${item.device_id}`);
                if (tlPos) {
                  points.push(tlPos);
                }
              });
            }
            
            points.push(zoneCenter);
            
            const pathData = generateSVGPath(points);
            setRoutePath(pathData);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching active route:', error);
    }
  };

  // Use dynamic zones and wind directions from backend
  const windDirections = availableWindDirections;
  const zones = availableZones;

  return (
    <div className="min-h-screen relative w-full" style={{ zIndex: 1, backgroundColor: 'var(--color-background)', color: 'var(--color-text)' }}>
      <style>
        {`
          @keyframes dash {
            to {
              stroke-dashoffset: -200;
            }
          }
          @keyframes pulse {
            0% { opacity: 0.75; }
            50% { opacity: 1; }
            100% { opacity: 0.75; }
          }
          .tl.active {
            animation: pulse 1.2s ease-in-out infinite;
          }
          
          /* Responsive SVG scaling - 4K/TV friendly */
          .schematic-svg {
            width: 100%;
            height: 92vh; /* fill most of the screen while leaving room for controls */
            min-height: 600px;
            max-height: 96vh;
            display: block;
            margin: 0 auto;
          }
          
          /* SVG container centering - Reduced margins */
          .svg-container {
            display: flex;
            justify-content: center;
            align-items: center;
            width: 100%;
            overflow: hidden;
            margin: 0;
            padding: 0;
          }
          
          /* Mobile responsiveness */
          @media (max-width: 768px) {
            .schematic-svg {
              height: 75vh;
              min-height: 500px;
            }
          }
          
          @media (max-width: 480px) {
            .schematic-svg {
              height: 70vh;
              min-height: 500px;
            }
          }
        `}
      </style>
      
      {/* Removed header - title integrated into control panel */}
      
      <main className="w-full relative" style={{ zIndex: 20 }}>
        {/* Ultra-Compact Control Panel - Integrated Title */}
        <div className="w-full glass-card p-2 space-y-2 relative" style={{ zIndex: 100 }}>
          {/* Title Row - Integrated with Controls */}
          <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>Emergency E‑Guidance Schematic</h1>
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Click zones on map • Select wind • Activate route</span>
            </div>
            <div className="text-xs">
              <span className={isConnected ? 'text-green-400' : 'text-red-400'}>
                {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
              </span>
              {isSyncing && (
                <span className="ml-2 text-blue-400">
                  🔄 Syncing...
                </span>
              )}
            </div>
          </div>

          {/* Controls Row - All in One Line */}
          <div className="flex items-center justify-between gap-3">
            {/* Left Side - Wind & Selection */}
            <div className="flex items-center gap-3">
              {/* Wind Directions */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Wind:</span>
                {windDirections.map(wind => (
                  <button
                    key={wind}
                    onClick={() => handleWindSelect(wind)}
                    className={`px-2 py-1 rounded text-xs font-medium transition-all duration-200 ${
                      selectedWind === wind 
                        ? 'btn-primary shadow-lg' 
                        : 'btn-secondary hover:shadow-md'
                    }`}
                    disabled={!isConnected}
                    style={{ zIndex: 101 }}
                  >
                    {wind}
                  </button>
                ))}
              </div>

              {/* Selection Status */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Zone:</span>
                <span className="rounded px-2 py-1 text-xs border" style={{ backgroundColor: 'var(--color-surface-secondary)', borderColor: 'var(--color-border)' }}>
                  <span className="font-medium" style={{ color: 'var(--color-primary)' }}>{selectedZone || '—'}</span>
                </span>
              </div>

              {/* Zone Status Information - Between Zone and Action Buttons */}
              <div className="flex items-center gap-2 ml-2 pl-2 border-l" style={{ borderColor: 'var(--color-border)' }}>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-success rounded-full"></div>
                  <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>A: {totalZones}</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-surface-secondary rounded-full"></div>
                  <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>I: {totalZones - activeDevices}</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-primary rounded-full"></div>
                  <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>T: {totalZones}</span>
                </div>
              </div>
            </div>

            {/* Right Side - Action Buttons */}
            <div className="flex gap-2 items-center">
              <button
                onClick={handleActivate}
                disabled={!selectedZone || !selectedWind || !isConnected}
                className="btn-success disabled:btn-disabled px-3 py-1 rounded text-xs font-medium transition-all duration-200 hover:shadow-lg disabled:shadow-none"
                style={{ zIndex: 101 }}
              >
                🚦 Activate
              </button>
              <button
                onClick={handleClear}
                className="btn-secondary px-2 py-1 rounded text-xs font-medium transition-all duration-200 hover:shadow-lg"
                style={{ zIndex: 101 }}
                title="Clear all activations (Emergency Portal + Schematic)"
              >
                🗑️ Clear All
              </button>
              <button
                onClick={handleRefresh}
                className="btn-primary px-2 py-1 rounded text-xs font-medium transition-all duration-200 hover:shadow-lg"
                style={{ zIndex: 101 }}
              >
                🔄 Refresh
              </button>
            </div>
          </div>
        </div>

        {/* Schematic Area - Compact (BELOW Controls) */}
        <section className="w-full relative" style={{ zIndex: 30 }}>
          
          {/* SVG Schematic - Full Width */}
          <div className="svg-container relative px-2 pt-4" style={{ zIndex: 40, backgroundColor: 'var(--color-background)' }}>
            <svg 
              ref={svgRef}
              viewBox={`0 0 ${LAYOUT_CONFIG.viewBox.width} ${LAYOUT_CONFIG.viewBox.height}`}
              className="schematic-svg"
              tabIndex={0}
              aria-label="Facility schematic"
              style={{ zIndex: 50 }}
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="3.5" result="coloredBlur"/>
                  <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
                <marker id="arrow" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#22d3ee"></path>
                </marker>
              </defs>

              {/* Plant Boundary */}
              {LAYOUT_CONFIG.plantBoundary.type === 'custom' ? (
                <polygon
                  points={LAYOUT_CONFIG.plantBoundary.points?.map(p => `${p.x},${p.y}`).join(' ') || ''}
                  fill={LAYOUT_CONFIG.plantBoundary.color}
                  stroke={LAYOUT_CONFIG.plantBoundary.strokeColor}
                  strokeWidth={LAYOUT_CONFIG.plantBoundary.strokeWidth}
                  opacity={0.1}
                />
              ) : (
                <ellipse 
                  cx={LAYOUT_CONFIG.viewBox.width / 2} 
                  cy={LAYOUT_CONFIG.viewBox.height / 2} 
                  rx={LAYOUT_CONFIG.viewBox.width / 2 - 100} 
                  ry={LAYOUT_CONFIG.viewBox.height / 2 - 100}
                  fill={LAYOUT_CONFIG.plantBoundary.color}
                  stroke={LAYOUT_CONFIG.plantBoundary.strokeColor}
                  strokeWidth={LAYOUT_CONFIG.plantBoundary.strokeWidth}
                  opacity={0.1}
                />
              )}

              {/* Streets */}
              {LAYOUT_CONFIG.streets.map((street: any) => {
                if (street.type === 'horizontal') {
                  const startX = street.x || 0;
                  const endX = street.endX || (startX + street.width);
                  return (
                    <g key={street.id}>
                      {/* Main road surface - Dark grey path */}
                      <path
                        d={`M ${startX},${street.y! - (street.height! / 2)} L ${endX},${street.y! - (street.height! / 2)} L ${endX},${street.y! + (street.height! / 2)} L ${startX},${street.y! + (street.height! / 2)} Z`}
                        fill="#374151"
                        opacity={1}
                        stroke="#1f2937"
                        strokeWidth={1 * uiScale}
                      />
                      {/* Center dashed line */}
                      <path
                        d={`M ${startX},${street.y!} L ${endX},${street.y!}`}
                        fill="none"
                        stroke="white"
                        strokeWidth={3 * uiScale}
                        opacity={1}
                        strokeDasharray="12,8"
                      />
                    </g>
                  );
                } else if (street.type === 'vertical') {
                  const startY = street.y || 0;
                  const endY = startY + (street.height || 0);
                  return (
                    <g key={street.id}>
                      {/* Main road surface - Dark grey path */}
                      <path
                        d={`M ${street.x! - (street.width! / 2)},${startY} L ${street.x! + (street.width! / 2)},${startY} L ${street.x! + (street.width! / 2)},${endY} L ${street.x! - (street.width! / 2)},${endY} Z`}
                        fill="#374151"
                        opacity={1}
                        stroke="#1f2937"
                        strokeWidth={1 * uiScale}
                      />
                      {/* Center dashed line */}
                      <path
                        d={`M ${street.x!},${startY} L ${street.x!},${endY}`}
                        fill="none"
                        stroke="white"
                        strokeWidth={3 * uiScale}
                        opacity={1}
                        strokeDasharray="12,8"
                      />
                    </g>
                  );
                } else if (street.type === 'diagonal') {
                  const dx = street.end!.x - street.start!.x;
                  const dy = street.end!.y - street.start!.y;
                  const length = Math.sqrt(dx * dx + dy * dy);
                  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
                  
                  return (
                    <g key={street.id}>
                      {/* Main diagonal road surface - Dark grey */}
                      <rect
                        x={street.start!.x}
                        y={street.start!.y - street.width! / 2}
                        width={length}
                        height={street.width}
                        fill="#374151"
                        opacity={1}
                        stroke="#1f2937"
                        strokeWidth={1 * uiScale}
                        transform={`rotate(${angle} ${street.start!.x} ${street.start!.y})`}
                      />
                      {/* Center dashed line for diagonal roads */}
                      <rect
                        x={street.start!.x}
                        y={street.start!.y - 1.5}
                        width={length}
                        height={3}
                        fill="white"
                        opacity={1}
                        transform={`rotate(${angle} ${street.start!.x} ${street.start!.y})`}
                        strokeDasharray="12,8"
                      />
                    </g>
                  );
                } else if (street.type === 'perimeter') {
                  // Create curved perimeter road sections
                  const dx = street.end!.x - street.start!.x;
                  const dy = street.end!.y - street.start!.y;
                  const length = Math.sqrt(dx * dx + dy * dy);
                  
                  return (
                    <g key={street.id}>
                      {/* Main perimeter road surface - Dark grey */}
                      <path
                        d={`M ${street.start!.x},${street.start!.y} L ${street.end!.x},${street.end!.y}`}
                        fill="none"
                        stroke="#374151"
                        strokeWidth={street.width}
                        opacity={1}
                      />
                      {/* Center dashed line for perimeter roads */}
                      <path
                        d={`M ${street.start!.x},${street.start!.y} L ${street.end!.x},${street.end!.y}`}
                        fill="none"
                        stroke="white"
                        strokeWidth={3}
                        opacity={1}
                        strokeDasharray="12,8"
                      />
                    </g>
                  );
                } else if (street.type === 'curved') {
                  const cx = street.x!;
                  const cy = street.y!;
                  const radius = street.radius!;
                  const startAngle = street.startAngle!;
                  const endAngle = street.endAngle!;
                  const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;
                  const sweepFlag = 1;

                  const startX = cx + radius * Math.cos(startAngle * Math.PI / 180);
                  const startY = cy + radius * Math.sin(startAngle * Math.PI / 180);
                  const endX = cx + radius * Math.cos(endAngle * Math.PI / 180);
                  const endY = cy + radius * Math.sin(endAngle * Math.PI / 180);

                  return (
                    <g key={street.id}>
                      {/* Main curved road surface - Dark grey */}
                      <path
                        d={`M ${startX},${startY} A ${radius},${radius} 0 ${largeArcFlag},${sweepFlag} ${endX},${endY}`}
                        fill="none"
                        stroke="#374151"
                        strokeWidth={street.width! * uiScale}
                        opacity={1}
                      />
                      {/* Center dashed line for curved roads */}
                      <path
                        d={`M ${startX},${startY} A ${radius},${radius} 0 ${largeArcFlag},${sweepFlag} ${endX},${endY}`}
                        fill="none"
                        stroke="white"
                        strokeWidth={3 * uiScale}
                        opacity={1}
                        strokeDasharray="12,8"
                      />
                    </g>
                  );
                } else if (street.type === 'positioned') {
                  // Road positioned exactly at specified X,Y coordinates
                  return (
                    <g key={street.id}>
                      {/* Main road surface - Dark grey path */}
                      <path
                        d={`M ${street.x! - (street.width! / 2)},${street.y! - (street.height! / 2)} L ${street.x! + (street.width! / 2)},${street.y! - (street.height! / 2)} L ${street.x! + (street.width! / 2)},${street.y! + (street.height! / 2)} L ${street.x! - (street.width! / 2)},${street.y! + (street.height! / 2)} Z`}
                        fill="#374151"
                        opacity={1}
                      />
                      {/* Center dashed line (horizontal) */}
                      <path
                        d={`M ${street.x! - (street.width! / 2)},${street.y!} L ${street.x! + (street.width! / 2)},${street.y!}`}
                        fill="none"
                        stroke="white"
                        strokeWidth={3}
                        opacity={1}
                        strokeDasharray="12,8"
                      />
                      {/* Center dashed line (vertical) */}
                      <path
                        d={`M ${street.x!},${street.y! - (street.height! / 2)} L ${street.x!},${street.y! + (street.height! / 2)}`}
                        fill="none"
                        stroke="white"
                        strokeWidth={3}
                        opacity={1}
                        strokeDasharray="12,8"
                      />
                    </g>
                  );
                }
                return null;
              })}

              {/* Intersections */}
              <g id="intersections" style={{ zIndex: 70 }}>
                {LAYOUT_CONFIG.intersections.map(intersection => renderIntersection(intersection))}
              </g>

              {/* Main Entrance Indicator */}
              <g id="entrance" style={{ zIndex: 85 }}>
                {/* Entrance road from outside */}
                <rect
                  x={1100}
                  y={-25}
                  width={130}
                  height={80}
                  fill="#374151"
                  opacity={0.8}
                />
                {/* Entrance sign */}
                <rect
                  x={1120}
                  y={-15}
                  width={85}
                  height={55}
                  fill="#22c55e"
                  rx="4"
                  ry="4"
                />
                <text
                  x={1160}
                  y={5}
                  fill="white"
                  fontSize="12"
                  fontWeight="bold"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  style={{ pointerEvents: 'none' }}
                >
                  MAIN
                </text>
                <text
                  x={1160}
                  y={20}
                  fill="white"
                  fontSize="12"
                  fontWeight="bold"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  style={{ pointerEvents: 'none' }}
                >
                  ENTRANCE
                </text>
                {/* Entrance arrow */}
                <polygon
                  points="1160,55 1150,40 1170,40"
                  fill="#f97316"
                />
              </g>

              {/* Active route path */}
              <path id="route" className="route" markerEnd="url(#arrow)" d={routePath} 
                style={{
                  stroke: '#22d3ee', 
                  strokeWidth: 8 * uiScale, 
                  fill: 'none', 
                  strokeLinecap: 'round', 
                  strokeLinejoin: 'round', 
                  opacity: routePath ? 0.95 : 0,
                  strokeDasharray: routePath ? '12 8' : 'none',
                  animation: routePath ? 'dash 1.25s linear infinite' : 'none'
                }} />

              {/* Zones - Show all zones, green by default, red when active */}
              <g id="zones" style={{ zIndex: 60 }}>
                {Object.entries(LAYOUT_CONFIG.zones)
                  .map(([zoneId, zone]: [string, any]) => {
                    const isAvailableInBackend = availableZones.length > 0 ? availableZones.includes(zoneId) : true;
                    const isActiveZone = selectedZone === zoneId && activeRoute; // Zone is active if selected and has active route
                    const zoneColor = isActiveZone ? '#dc2626' : '#22c55e'; // Red if active, green otherwise
                    console.log(`Zone ${zoneId}: availableZones=${JSON.stringify(availableZones)}, isAvailable=${isAvailableInBackend}, isActive=${isActiveZone}`);
                    return (
                  <g key={zoneId}>
                    <rect 
                      x={zone.x} y={zone.y} width={zone.width} height={zone.height} rx="12" ry="12" 
                      fill={zoneColor}
                      stroke={isAvailableInBackend ? zoneColor : '#666666'}
                      strokeWidth="2"
                      opacity={selectedZone === zoneId ? 0.8 : (isAvailableInBackend ? 0.6 : 0.2)}
                      style={{ 
                        cursor: 'pointer', // Always clickable for now
                        zIndex: 70
                      }}
                      onClick={() => {
                        console.log(`Zone ${zoneId} clicked, availableZones:`, availableZones);
                        handleZoneClick(zoneId);
                      }}
                    />
                    <text 
                      x={zone.x + zone.width / 2} 
                      y={zone.y + zone.height / 2 + 6} 
                      fill={isAvailableInBackend ? "#e5e7eb" : "#888888"} 
                      fontSize={18 * uiScale}
                      fontWeight="600" 
                      textAnchor="middle" 
                      dominantBaseline="middle"
                      style={{ pointerEvents: 'none', zIndex: 71 }}>
                      {(() => {
                        const zoneLabels: Record<string, string> = {
                          '1': 'A', '2': 'B', '3': 'C', '4': 'D', '5': 'E',
                          '6': 'F', '7': 'G', '8': 'H', '9': 'K'
                        };
                        return zoneLabels[zoneId] || zoneId;
                      })()}
                    </text>
                  </g>
                    );
                  })}
              </g>

              {/* Traffic lights */}
              <g id="tls" style={{ zIndex: 80 }}>
                {Object.entries(LAYOUT_CONFIG.trafficLights).map(([tlId, tl]: [string, any]) => {
                  const isInRoute = activeRoute?.policy?.some((item: any) => item.device_id === parseInt(tlId.substring(2)));
                  
                  return (
                    <g 
                      key={tlId} 
                      transform={`translate(${tl.x},${tl.y})`} 
                      className={`tl ${isInRoute ? 'active' : ''}`} 
                      style={{ 
                        zIndex: 81
                      }}
                    >
                      <circle 
                        className="tl-ring" 
                        r={tl.isEntryPoint ? 16 * uiScale : 12 * uiScale}
                        style={{
                          fill: '#0b1220', 
                          stroke: tl.isEntryPoint ? '#22d3ee' : '#0b1220', 
                          strokeWidth: tl.isEntryPoint ? 3 * uiScale : 2 * uiScale, 
                          opacity: tl.isEntryPoint ? 1 : 1
                        }}
                      />
                      <circle 
                        className="tl-dot" 
                        r={tl.isEntryPoint ? 10 * uiScale : 8 * uiScale}
                        style={{
                          fill: tl.isEntryPoint ? tl.color : (isInRoute ? '#22c55e' : tl.color)
                        }}
                      />
                      <text 
                        className="tl-id" 
                        y={tl.isEntryPoint ? 30 : 26} 
                        style={{
                          fill: '#cbd5e1', 
                          fontSize: tl.isEntryPoint ? 16 * uiScale : 16 * uiScale, 
                          textAnchor: 'middle', 
                          dominantBaseline: 'middle', 
                          pointerEvents: 'none'
                        }}
                      >
                        {tlId}
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>
          
          {/* Compact Route Sequence Display */}
          {activeRoute && (
            <div className="mt-2 glass-card rounded p-3" style={{ zIndex: 90 }}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>Active Route</h3>
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Sequence will be sent to gateway</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {activeRoute.policy.map((item: any, index: number) => (
                  <div
                    key={`${item.device_id}-${item.direction}-${index}`}
                    className="px-2 py-1 rounded text-xs font-medium flex items-center space-x-1 bg-success text-white"
                  >
                    <span>TL{item.device_id}</span>
                    <span className="text-sm">
                      {item.direction === 'left' && '←'}
                      {item.direction === 'right' && '→'}
                      {item.direction === 'straight' && '↑'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>


      </main>
    </div>
  );
};

export default EGuidanceSchematic;
