#!/bin/bash
# Setup Local Hostname for TSIM Server
# Usage: sudo ./setup_local_hostname.sh [hostname]

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔧 TSIM Local Hostname Setup${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}❌ Please run as root: sudo ./setup_local_hostname.sh${NC}"
    exit 1
fi

# Get hostname from argument or prompt
if [ -n "$1" ]; then
    NEW_HOSTNAME="$1"
else
    CURRENT_HOSTNAME=$(hostname)
    echo -e "${YELLOW}Current hostname: $CURRENT_HOSTNAME${NC}"
    echo -n "Enter new hostname (default: EGS, press Enter to use default): "
    read NEW_HOSTNAME
fi

if [ -z "$NEW_HOSTNAME" ]; then
    NEW_HOSTNAME="EGS"
    echo -e "${YELLOW}Using default hostname: EGS${NC}"
fi

echo ""
echo -e "${YELLOW}Setting hostname to: $NEW_HOSTNAME${NC}"

# Set hostname
hostnamectl set-hostname "$NEW_HOSTNAME"

# Update /etc/hosts
echo -e "${YELLOW}Updating /etc/hosts...${NC}"
if ! grep -q "127.0.0.1.*$NEW_HOSTNAME" /etc/hosts; then
    # Remove old entries for this hostname
    sed -i "/$NEW_HOSTNAME/d" /etc/hosts
    # Add new entry
    echo "127.0.0.1    $NEW_HOSTNAME" >> /etc/hosts
    echo "127.0.0.1    $NEW_HOSTNAME.local" >> /etc/hosts
    echo -e "${GREEN}✅ Updated /etc/hosts${NC}"
else
    echo -e "${YELLOW}⚠️  Hostname already in /etc/hosts${NC}"
fi

# Install and configure Avahi (mDNS) for .local resolution
echo ""
echo -e "${YELLOW}Setting up mDNS (Avahi) for automatic discovery...${NC}"

if command -v apt-get &> /dev/null; then
    # Debian/Ubuntu/Raspberry Pi OS
    if ! command -v avahi-daemon &> /dev/null; then
        echo -e "${YELLOW}Installing Avahi...${NC}"
        apt-get update
        apt-get install -y avahi-daemon
    fi
    
    # Configure Avahi
    if [ -f /etc/avahi/avahi-daemon.conf ]; then
        # Backup
        cp /etc/avahi/avahi-daemon.conf /etc/avahi/avahi-daemon.conf.backup.$(date +%Y%m%d_%H%M%S)
        
        # Update hostname in config
        sed -i "s/^host-name=.*/host-name=$NEW_HOSTNAME/" /etc/avahi/avahi-daemon.conf
        sed -i "s/^domain-name=.*/domain-name=local/" /etc/avahi/avahi-daemon.conf
        
        # Ensure IPv4 is enabled
        sed -i "s/^use-ipv4=.*/use-ipv4=yes/" /etc/avahi/avahi-daemon.conf
        
        echo -e "${GREEN}✅ Configured Avahi${NC}"
    fi
    
    # Restart Avahi
    systemctl restart avahi-daemon
    systemctl enable avahi-daemon
    
    echo -e "${GREEN}✅ Avahi (mDNS) is running${NC}"
else
    echo -e "${YELLOW}⚠️  apt-get not found. Skipping Avahi installation.${NC}"
    echo -e "${YELLOW}   Install manually: sudo apt install avahi-daemon${NC}"
fi

# Get current IP address
CURRENT_IP=$(hostname -I | awk '{print $1}')

echo ""
echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}  Hostname Setup Complete!${NC}"
echo -e "${GREEN}================================${NC}"
echo ""
echo -e "   Hostname: ${GREEN}$NEW_HOSTNAME${NC}"
echo -e "   IP Address: ${GREEN}$CURRENT_IP${NC}"
echo ""
echo -e "${YELLOW}Access your server using:${NC}"
echo -e "   ${GREEN}http://$NEW_HOSTNAME:8002${NC} (backend)"
echo -e "   ${GREEN}http://$NEW_HOSTNAME:3001${NC} (frontend)"
echo ""
echo -e "${YELLOW}Or with .local (mDNS):${NC}"
echo -e "   ${GREEN}http://$NEW_HOSTNAME.local:8002${NC}"
echo -e "   ${GREEN}http://$NEW_HOSTNAME.local:3001${NC}"
echo ""
echo -e "${YELLOW}To access from other devices:${NC}"
echo -e "   1. macOS/iOS: Use ${GREEN}$NEW_HOSTNAME.local${NC} (automatic)"
echo -e "   2. Windows/Linux: Add to hosts file:"
echo -e "      ${GREEN}$CURRENT_IP    $NEW_HOSTNAME${NC}"
echo ""
echo -e "${YELLOW}Test from this server:${NC}"
echo -e "   ${GREEN}ping $NEW_HOSTNAME.local${NC}"

