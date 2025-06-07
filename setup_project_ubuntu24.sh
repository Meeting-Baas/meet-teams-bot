#!/bin/bash
# Setup Meet Teams Bot Project on Ubuntu 24.04 Noble
# Compatible with AWS AMI: amazon/ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-2

set -e

echo "🚀 Setting up Meet Teams Bot on Ubuntu 24.04 Noble..."

# Clone the project
echo "📥 Cloning meet-teams-bot project..."
cd ~
git clone https://github.com/your-username/meet-teams-bot.git
cd meet-teams-bot

# Copy configuration files
echo "📋 Setting up configuration files..."
cp ../setup_ubuntu_vm.sh .
cp ../pm2_ecosystem.config.js .
cp ../performance_test.sh .
chmod +x *.sh

# Setup Nix environment
echo "❄️ Setting up Nix environment..."
source /etc/profile.d/nix.sh
nix-shell --run "echo 'Nix environment ready'"

# Install project dependencies
echo "📦 Installing project dependencies..."
cd recording_server
nix-shell --run "npm install"

# Build the project  
echo "🔨 Building the project..."
nix-shell --run "npm run build"

# Build Chrome extension
echo "🔧 Building Chrome extension..."
cd chrome_extension
nix-shell --run "npm install && npm run build"
cd ..

# Go back to root
cd ..

# Start virtual displays
echo "🖥️ Starting virtual displays..."
./start_displays.sh

# Setup virtual cameras with Ducobu image
echo "📹 Setting up virtual cameras..."
for i in {0..2}; do
    echo "Setting up camera /dev/video$i with Ducobu image..."
    
    # Create a simple script to feed the image to the camera
    cat > "feed_camera_$i.sh" << EOF
#!/bin/bash
# Feed Ducobu image to /dev/video$i
ffmpeg -loop 1 -i /tmp/ducobu.jpg -vf scale=1280:720 -pix_fmt yuv420p -f v4l2 /dev/video$i
EOF
    chmod +x "feed_camera_$i.sh"
    
    # Download Ducobu image if not exists
    if [ ! -f "/tmp/ducobu.jpg" ]; then
        echo "📥 Downloading Ducobu image..."
        wget -O /tmp/ducobu.jpg "https://i.ibb.co/N9YtnDZ/ducobu.jpg"
    fi
    
    # Start feeding the camera in background
    nohup ./feed_camera_$i.sh > /dev/null 2>&1 &
    echo "✅ Camera $i is now streaming Ducobu image"
done

# Setup monitoring 
echo "📊 Final setup check..."
./monitor_resources.sh

echo ""
echo "✅ Setup completed successfully!"
echo ""
echo "🎯 Ready to test! Next steps:"
echo ""
echo "1. **Test single bot:**"
echo "   pm2 start pm2_ecosystem.config.js --only meeting-bot-1"
echo ""
echo "2. **Test all 3 bots:**"
echo "   pm2 start pm2_ecosystem.config.js"
echo ""
echo "3. **Run performance benchmark:**"
echo "   ./performance_test.sh"
echo ""
echo "4. **Monitor bots:**"
echo "   pm2 status"
echo "   pm2 logs"
echo "   pm2 monit"
echo ""
echo "🔍 Useful commands:"
echo "   - Check cameras: ls /dev/video*"
echo "   - Check displays: ps aux | grep Xvfb" 
echo "   - Stop all bots: pm2 delete all"
echo "   - Restart bot: pm2 restart meeting-bot-1"
echo ""
echo "📋 Each bot uses:"
echo "   - Bot 1: DISPLAY=:99, /dev/video0, PORT=3001"
echo "   - Bot 2: DISPLAY=:100, /dev/video1, PORT=3002"  
echo "   - Bot 3: DISPLAY=:101, /dev/video2, PORT=3003"
echo ""
echo "🎊 Your bots are now ready to join meetings with Ducobu's face!" 