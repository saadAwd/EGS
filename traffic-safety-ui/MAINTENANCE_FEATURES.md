# Traffic Light Maintenance Features

## Overview
The enhanced maintenance panel provides comprehensive monitoring and testing capabilities for all 14 traffic lights across 10 zones (A-J).

## Key Features

### 1. Traffic Light Grid
- **14 Traffic Lights**: Each displayed in individual cards with real-time status
- **Zone Distribution**: Traffic lights distributed across zones A through J
- **Status Indicators**: Visual status showing active/inactive, battery level, and signal strength
- **Hover Effects**: Interactive cards with smooth animations and hover states

### 2. Individual Traffic Light Cards
Each card displays:
- Traffic light name (TL1-TL14)
- Zone location (Zone A, Zone B, etc.)
- Active/Inactive status with color coding
- Battery level percentage with color indicators
- Signal strength percentage with color indicators
- Last seen timestamp
- Test button for individual testing

### 3. Comprehensive Health Pages
Clicking on any traffic light card opens a detailed health page showing:

#### Current Status
- Battery level with visual progress bar
- Signal strength with visual progress bar
- Temperature readings
- Humidity readings
- RSSI (signal strength in dBm)
- SNR (signal quality in dB)

#### Trend Analysis
- 24-hour battery level trend chart
- 24-hour signal strength trend chart
- Hourly data points for monitoring

#### Testing Capabilities
- Individual traffic light testing
- Real-time status updates
- Success/failure feedback

### 4. Search and Filter
- **Search**: Find traffic lights by name or location
- **Zone Filter**: Filter by specific zones (A-J)
- **Results Count**: Shows filtered results vs. total count

### 5. Summary Statistics
- Active traffic lights count and percentage
- Low battery warnings (<20%)
- Weak signal warnings (<50%)
- Total zones (10 zones A-J)

### 6. Interactive Features
- **Refresh Button**: Updates all traffic light data
- **Test Buttons**: Individual testing for each traffic light
- **Responsive Design**: Works on desktop and mobile devices
- **Smooth Animations**: CSS transitions and hover effects

## Color Coding

### Status Colors
- 🟢 **Green**: Active and healthy
- 🟡 **Yellow**: Low battery warning
- 🟠 **Orange**: Weak signal warning
- 🔴 **Red**: Inactive or critical issues

### Battery Levels
- 🟢 **Green**: 50%+ (Good)
- 🟡 **Yellow**: 20-49% (Warning)
- 🔴 **Red**: <20% (Critical)

### Signal Strength
- 🟢 **Green**: 80%+ (Excellent)
- 🟡 **Yellow**: 50-79% (Good)
- 🔴 **Red**: <50% (Poor)

## Usage Instructions

1. **Navigate to Maintenance Tab**: Click on "Maintenance" in the main navigation
2. **View Traffic Lights**: See all 14 traffic lights in the grid layout
3. **Search/Filter**: Use search box or zone dropdown to find specific lights
4. **Test Individual Lights**: Click the "Test" button on any traffic light card
5. **View Detailed Health**: Click on any traffic light card to see comprehensive health data
6. **Monitor Trends**: View 24-hour trend charts for battery and signal strength
7. **Refresh Data**: Use the refresh button to update all traffic light information

## Technical Details

- **Real-time Updates**: Data refreshes every 5 seconds
- **Responsive Grid**: Adapts to different screen sizes
- **CSS Animations**: Smooth transitions and hover effects
- **Mock Data**: Currently uses simulated data for demonstration
- **API Ready**: Designed to integrate with real backend APIs

## Future Enhancements

- Real-time data integration
- Historical data analysis
- Predictive maintenance alerts
- Automated testing schedules
- Integration with traffic management systems
