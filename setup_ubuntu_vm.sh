#!/bin/bash
# Setup Ubuntu VM for 3 Meeting Bots - Performance Testing
# Run this script on fresh Ubuntu 22.04 VM

set -e

echo "🚀 Setting up Ubuntu VM for Meeting Bots Performance Testing..."

# Update system
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install essential packages
echo "🔧 Installing essential packages..."
sudo apt install -y \
    curl wget git build-essential \
    htop iotop nethogs \
    v4l2loopback-dkms v4l2loopback-utils \
    xvfb x11vnc fluxbox \
    pulseaudio pulseaudio-utils \
    ffmpeg \
    nginx \
    monitoring-tools

# Install Node.js 20
echo "📦 Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install Nix package manager
echo "❄️ Installing Nix package manager..."
sh <(curl -L https://nixos.org/nix/install) --daemon --yes
source /etc/profile.d/nix.sh

# Install PM2 globally
echo "⚡ Installing PM2 process manager..."
sudo npm install -g pm2

# Setup virtual cameras (3 bots)
echo "📹 Setting up 3 virtual cameras..."
sudo modprobe v4l2loopback devices=3 video_nr=0,1,2 card_label="Bot1,Bot2,Bot3"

# Make v4l2loopback load at boot
echo "v4l2loopback" | sudo tee -a /etc/modules
echo "options v4l2loopback devices=3 video_nr=0,1,2" | sudo tee -a /etc/modprobe.d/v4l2loopback.conf

# Setup PulseAudio system-wide
echo "🔊 Setting up PulseAudio..."
sudo usermod -a -G audio $USER

# Create monitoring directories
echo "📊 Setting up monitoring..."
mkdir -p ~/monitoring/{logs,reports}

# Setup X11 displays for headless operation
echo "🖥️ Setting up virtual displays..."
cat > ~/start_displays.sh << 'EOF'
#!/bin/bash
# Start 3 virtual displays for 3 bots
Xvfb :99 -screen 0 1280x720x24 &
Xvfb :100 -screen 0 1280x720x24 &
Xvfb :101 -screen 0 1280x720x24 &
echo "Started displays :99, :100, :101"
EOF
chmod +x ~/start_displays.sh

# Create bot environment script
cat > ~/bot_env.sh << 'EOF'
#!/bin/bash
# Environment setup for meeting bots
export DISPLAY=${DISPLAY:-:99}
export CAMERA=${CAMERA:-/dev/video0}
export PORT=${PORT:-3001}
export BOT_ID=${BOT_ID:-1}

# Nix environment
source /etc/profile.d/nix.sh

echo "Bot Environment:"
echo "  DISPLAY: $DISPLAY"
echo "  CAMERA: $CAMERA" 
echo "  PORT: $PORT"
echo "  BOT_ID: $BOT_ID"
EOF
chmod +x ~/bot_env.sh

# Create monitoring script
cat > ~/monitor_resources.sh << 'EOF'
#!/bin/bash
# Resource monitoring script

TIMESTAMP=$(date '+%Y-%m-%d_%H-%M-%S')
LOG_DIR="$HOME/monitoring/logs"
REPORT_FILE="$LOG_DIR/resources_$TIMESTAMP.log"

mkdir -p "$LOG_DIR"

echo "=== RESOURCE MONITORING - $TIMESTAMP ===" > "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# System info
echo "=== SYSTEM INFO ===" >> "$REPORT_FILE"
uname -a >> "$REPORT_FILE"
lscpu | grep -E "Model name|CPU\(s\):" >> "$REPORT_FILE"
free -h >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Process info
echo "=== RUNNING PROCESSES ===" >> "$REPORT_FILE"
ps aux | grep -E "(node|chrome|xvfb)" | grep -v grep >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Memory detailed
echo "=== MEMORY USAGE ===" >> "$REPORT_FILE"
free -m >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# CPU usage
echo "=== CPU USAGE ===" >> "$REPORT_FILE"
top -bn1 | head -20 >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Disk usage
echo "=== DISK USAGE ===" >> "$REPORT_FILE"
df -h >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Network
echo "=== NETWORK ===" >> "$REPORT_FILE"
ss -tuln >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Video devices
echo "=== VIDEO DEVICES ===" >> "$REPORT_FILE"
ls -la /dev/video* >> "$REPORT_FILE" 2>/dev/null || echo "No video devices found" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

echo "Monitoring report saved to: $REPORT_FILE"
tail -n 50 "$REPORT_FILE"
EOF
chmod +x ~/monitor_resources.sh

echo ""
echo "✅ Ubuntu VM setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Clone your meet-teams-bot repository"
echo "2. Run: ./start_displays.sh (start virtual displays)"
echo "3. Run: ./monitor_resources.sh (check baseline resources)"
echo "4. Setup your bots with PM2"
echo ""
echo "🔧 Useful commands:"
echo "  - Check video devices: ls /dev/video*"
echo "  - Monitor real-time: htop"
echo "  - Check displays: ps aux | grep Xvfb"
echo "  - PM2 status: pm2 status"
echo "" 