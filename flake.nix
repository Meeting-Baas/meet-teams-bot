{
  description = "Meet Teams Bot - NixOS Development Environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    playwright.url = "github:pietdevries94/playwright-web-flake/1.50.1";
  };

  outputs = { self, nixpkgs, flake-utils, playwright }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        overlay = final: prev: {
          inherit (playwright.packages.${system}) playwright-test playwright-driver;
        };
        pkgs = import nixpkgs {
          inherit system;
          overlays = [ overlay ];
        };
        
        # Environment variables
        nodeEnv = {
          NODE_OPTIONS = "--max-old-space-size=4096";
          UV_THREADPOOL_SIZE = "4";
          CHROME_DEVEL_SANDBOX = "false";
          CHROME_NO_SANDBOX = "true";
          SERVERLESS = "true";
          NODE_ENV = "production";
          DISPLAY = ":99";
          # Playwright configuration using the maintained flake
          PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
          PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
          PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
        };

      in {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            # Node.js and build tools
            nodejs_20
            nodePackages.npm
            nodePackages.typescript
            nodePackages.webpack-cli
            jq  # For JSON manipulation
            
            # RabbitMQ and Redis for API mode
            rabbitmq-server
            redis
            
            # X11 and graphics dependencies
            xorg.libX11
            xorg.libXcomposite
            xorg.libXdamage
            xorg.libXext
            xorg.libXfixes
            xorg.libXrandr
            xorg.libxshmfence
            xorg.libXScrnSaver
            
            # Chrome runtime dependencies (from original Dockerfile)
            nss
            at-spi2-atk  # libatk-bridge2.0-0 equivalent
            libdrm
            libxkbcommon
            libgbm
            
            # Audio dependencies  
            alsa-lib  # libasound2 equivalent
            pulseaudio  # Provides pactl command for audio management
            
            # X11 utilities and window manager (from Dockerfile)
            xorg.xorgserver  # Xvfb
            x11vnc
            fluxbox  # Window manager - important for Chrome extensions
            xorg.xwininfo  # Part of x11-utils
            xorg.xdpyinfo  # Part of x11-utils
            
            # Additional system utilities from Dockerfile
            wget
            gnupg
            curl
            unzip
            
            # Network and debugging tools
            netcat-gnu  # For network testing
            nmap        # For port scanning and debugging
            
            # Cloud and media processing (missing from previous)
            awscli2           # AWS CLI v2 for S3 uploads
            ffmpeg-full       # Full FFmpeg with all codecs
            
            # Playwright from maintained flake
            playwright-test
              playwright-driver
            ];
          
          shellHook = ''
            # Load environment variables from our-env if it exists
            if [ -f "our-env" ]; then
              echo "📝 Loading environment from our-env..."
              # Read and export each line, skipping comments and empty lines
              while IFS= read -r line || [ -n "$line" ]; do
                # Skip comments and empty lines
                [[ "$line" =~ ^#.*$ || -z "$line" ]] && continue
                # Export the variable
                export "$line"
              done < "our-env"
              echo "✅ Environment loaded from our-env"
            else
              echo "⚠️  our-env file not found, using default environment"
            fi

            # Set environment variables
            export NODE_OPTIONS="--max-old-space-size=6144"
            export UV_THREADPOOL_SIZE=4
            export CHROME_DEVEL_SANDBOX=false
            export CHROME_NO_SANDBOX=true
            export NODE_ENV=production
            export DISPLAY=:99
            
            # Serverless mode - can be overridden by individual functions
            export SERVERLESS=true
            
            # Playwright configuration using maintained flake
            export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
            export PLAYWRIGHT_BROWSERS_PATH="${pkgs.playwright-driver.browsers}"
            export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true

            echo "🎥 Meet Teams Bot Development Environment"
            echo "🔍 Debugging Playwright configuration:"
            echo "  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=$PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD"
            echo "  PLAYWRIGHT_BROWSERS_PATH=$PLAYWRIGHT_BROWSERS_PATH"
            echo "  PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=$PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS"
            echo ""
            echo "🔍 Checking Playwright browsers (maintained flake):"
            if [ -d "$PLAYWRIGHT_BROWSERS_PATH" ]; then
              echo "  ✅ Playwright browsers found at: $PLAYWRIGHT_BROWSERS_PATH"
              ls -la "$PLAYWRIGHT_BROWSERS_PATH/"
            else
              echo "  ❌ Playwright browsers NOT found at: $PLAYWRIGHT_BROWSERS_PATH"
            fi
            echo ""
            echo "Commands available:"
            echo "  • start-bot <config_file> [meeting_url] - Start the bot with virtual display"
            echo "  • build                                 - Build the bot and extension"
            echo "  • clean                                 - Clean up temporary files"
            echo "  • multi-bot <num_bots> <base_config_file> [meeting_url] - Start multiple bot instances"
            echo "  • list-bot-processes                    - List active bot processes"
            echo "  • cleanup-all-bots                       - Clean up all bot processes and resources"
            echo "  • emergency-cleanup-multi-bots          - Force cleanup multi-bot instances"
            echo ""
            echo "API Mode Commands:"
            echo "  • start-rabbitmq                        - Start RabbitMQ server"
            echo "  • start-redis                           - Start Redis server" 
            echo "  • start-api-consumer                    - Start bot as RabbitMQ consumer"
            echo "  • multi-api-consumer <num_consumers>    - Start multiple API consumers"
            echo "  • run-api-bot <config_file>             - Run single bot in API mode"
            echo "  • setup-env                             - Create .env template"
            echo ""
            echo "Utility Commands:"
            echo "  • validate-environment                  - Check dependencies and configuration"
            echo "  • monitor-performance                   - Real-time performance monitoring"
            echo "  • docker-compatibility                 - Enable Docker-equivalent settings"

            # Helper functions
            function cleanup_x() {
              # Kill any existing Xvfb processes
              pkill Xvfb || true
              
              # Kill any existing fluxbox processes
              pkill fluxbox || true
              
              # Remove lock files
              rm -f /tmp/.X99-lock
              rm -f /tmp/.X11-unix/X99
              
              # Wait a moment for everything to clean up
              sleep 1
            }

            function start-bot() {
              if [ -z "$1" ]; then
                echo "❌ Usage: start-bot <config_file> [meeting_url]"
                return 1
              fi

              # Generate unique identifiers for this bot instance
              local bot_instance_id=$(date +%s)_$$_$(shuf -i 1000-9999 -n 1)
              local display_num=$((99 + $(shuf -i 1-50 -n 1)))
              local audio_device="virtual_mic_bot_$bot_instance_id"
              local browser_profile="/tmp/bot-profile-$bot_instance_id"
              
              echo "🤖 Starting bot instance: $bot_instance_id"
              echo "📺 Using display: :$display_num"
              echo "🔊 Using audio device: $audio_device"
              echo "🌐 Using browser profile: $browser_profile"

              # Clean up any existing processes for this display
              pkill -f "Xvfb :$display_num" || true
              pkill -f "fluxbox.*DISPLAY=:$display_num" || true
              
              # Remove lock files for this display
              rm -f "/tmp/.X''${display_num}-lock"
              rm -f "/tmp/.X11-unix/X''${display_num}"
              
              # Wait a moment for cleanup
              sleep 1

              echo "🖥️ Starting virtual display :$display_num..."
              
              # Start Xvfb with unique display number
              Xvfb :$display_num -screen 0 1280x720x24 -ac +extension GLX +render -noreset > /tmp/xvfb_$display_num.log 2>&1 & 
              XVFB_PID=$!
              
              # Wait for Xvfb to start
              sleep 2

              # Check if Xvfb started successfully
              if ! ps -p $XVFB_PID > /dev/null; then
                echo "❌ Failed to start Xvfb :$display_num. Log output:"
                cat /tmp/xvfb_$display_num.log
                return 1
              fi

              echo "✅ Virtual display :$display_num started (PID: $XVFB_PID)"

              # Create unique virtual audio device
              echo "🔊 Creating virtual audio device: $audio_device..."
              pulseaudio --daemon 2>/dev/null || true
              pactl load-module module-null-sink sink_name="$audio_device" rate=48000 sink_properties="device.description='Bot_Audio_$bot_instance_id'" > /tmp/audio_module_$bot_instance_id.txt 2>/dev/null || true
              pactl load-module module-virtual-source source_name="''${audio_device}_source" master="''${audio_device}.monitor" source_properties="device.description='Bot_Audio_Source_$bot_instance_id'" >> /tmp/audio_module_$bot_instance_id.txt 2>/dev/null || true

              # Start window manager for this display
              echo "🪟 Starting window manager for :$display_num..."
              DISPLAY=:$display_num fluxbox > /tmp/fluxbox_$display_num.log 2>&1 &
              FLUXBOX_PID=$!
              sleep 1

              echo "✅ Window manager started for :$display_num (PID: $FLUXBOX_PID)"

              # Set up environment variables for this bot instance
              export DISPLAY=:$display_num
              export PULSE_RUNTIME_PATH="/tmp/pulse-$bot_instance_id"
              export BOT_INSTANCE_ID="$bot_instance_id"
              export BOT_BROWSER_PROFILE="$browser_profile"
              export BOT_AUDIO_DEVICE="$audio_device"
              
              # Create isolated pulse runtime directory
              mkdir -p "$PULSE_RUNTIME_PATH"

              # Debug environment variables before starting bot
              echo "🔍 Runtime environment check:"
              echo "  PLAYWRIGHT_BROWSERS_PATH: $PLAYWRIGHT_BROWSERS_PATH"
              echo "  PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS: $PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS"
              echo "  DISPLAY: $DISPLAY"
              echo "  BOT_INSTANCE_ID: $BOT_INSTANCE_ID"
              echo "  BOT_BROWSER_PROFILE: $BOT_BROWSER_PROFILE"
              echo "  BOT_AUDIO_DEVICE: $BOT_AUDIO_DEVICE"
              echo ""

              # Create cleanup function for this instance
              cleanup_instance() {
                echo "🧹 Cleaning up bot instance: $bot_instance_id"
                
                # Kill processes
                kill $FLUXBOX_PID 2>/dev/null || true
                kill $XVFB_PID 2>/dev/null || true
                
                # Unload audio modules
                if [ -f "/tmp/audio_module_$bot_instance_id.txt" ]; then
                  while read module_id; do
                    [ -n "$module_id" ] && pactl unload-module "$module_id" 2>/dev/null || true
                  done < "/tmp/audio_module_$bot_instance_id.txt"
                  rm -f "/tmp/audio_module_$bot_instance_id.txt"
                fi
                
                # Clean up files
                rm -f /tmp/.X''${display_num}-lock
                rm -f /tmp/.X11-unix/X''${display_num}
                rm -rf "$browser_profile"
                rm -rf "$PULSE_RUNTIME_PATH"
                rm -f /tmp/xvfb_$display_num.log /tmp/fluxbox_$display_num.log
                
                echo "✅ Cleanup complete for bot instance: $bot_instance_id"
              }

              # Set trap for cleanup on exit
              trap cleanup_instance EXIT INT TERM

              # Run the bot with arguments
              if [ -n "$2" ]; then
                # If meeting URL is provided, use it
                echo "🤖 Starting bot with meeting URL: $2"
                cat "$1" | jq --arg url "$2" '.meeting_url = $url' | node build/src/main.js
              else
                # Otherwise just use the config file as is
                echo "🤖 Starting bot with config file: $1"
                cat "$1" | node build/src/main.js
              fi

              # Cleanup will be handled by trap
            }

            function build() {
              echo "🔨 Building bot and Chrome extension..."
              
              if [ ! -d "node_modules" ] || [ ! -d "chrome_extension/node_modules" ]; then
                echo "📦 Installing dependencies first..."
                npm install --include=dev --legacy-peer-deps
                npm install --prefix chrome_extension --include=dev --legacy-peer-deps
              fi
              
              echo "🏗️ Building recording server..."
              npm run build
              
              echo "🏗️ Building Chrome extension..."
              npm run build-dev --prefix chrome_extension
              
              echo "✅ Build complete!"
            }

            function clean() {
              echo "🧹 Cleaning up build artifacts and temporary files..."
              
              # Clean up build directories
              rm -rf build
              rm -rf chrome_extension/dist
              
              # Clean up node modules
              rm -rf node_modules
              rm -rf chrome_extension/node_modules
              
              # Clean up lock files
              rm -f package-lock.json
              rm -f chrome_extension/package-lock.json
              
              # Clean up all bot-related temp files
              cleanup-all-bots
              
              echo "✅ Clean complete!"
            }

            function multi-bot() {
              if [ -z "$1" ]; then
                echo "❌ Usage: multi-bot <num_bots> <base_config_file> [meeting_url]"
                echo "   Example: multi-bot 3 config.json https://meet.google.com/abc-def-ghi"
                return 1
              fi

              local num_bots=$1
              local base_config=$2
              local meeting_url=$3

              # Validate inputs
              if ! [[ "$num_bots" =~ ^[0-9]+$ ]] || [ "$num_bots" -lt 1 ] || [ "$num_bots" -gt 10 ]; then
                echo "❌ Number of bots must be between 1 and 10"
                return 1
              fi

              if [ ! -f "$base_config" ]; then
                echo "❌ Config file not found: $base_config"
                return 1
              fi

              # Load Redis configuration from .env if it exists
              if [ -f ".env" ]; then
                echo "📝 Loading Redis configuration from .env..."
                source .env
                echo "🔌 Redis: $REDIS_ADDRESS:$REDIS_PORT"
              else
                echo "⚠️  No .env file found, using default Redis configuration"
                export REDIS_ADDRESS="localhost"
                export REDIS_PORT="6379"
                export REDIS_URL="redis://localhost:6379"
              fi

              echo "🚀 Starting $num_bots bot instances..."
              echo "📁 Base config: $base_config"
              [ -n "$meeting_url" ] && echo "🔗 Meeting URL: $meeting_url"
              echo ""

              # Arrays to track all process information
              local bot_instance_ids=()
              local bot_pids=()
              local xvfb_pids=()
              local fluxbox_pids=()
              local node_pids=()
              local display_nums=()
              local bot_health_status=()  # New array to track bot health
              local bot_ports=()         # New array to track bot ports
              local bot_ws_ports=()      # New array to track bot WebSocket ports

              # Function to find an available port
              find_available_port() {
                local start_port=$1
                local port=$start_port
                while netstat -tuln | grep -q ":$port "; do
                  port=$((port + 1))
                done
                echo $port
              }

              # Function to check if a bot is healthy
              check_bot_health() {
                local bot_pid=$1
                local display_num=$2
                local instance_id=$3
                local port=$4
                local ws_port=$5
                
                # Check if process is running
                if ! kill -0 "$bot_pid" 2>/dev/null; then
                  echo "❌ Bot process $bot_pid is not running"
                  return 1
                fi
                
                # Check if Xvfb is responsive
                if ! DISPLAY=:$display_num xdpyinfo >/dev/null 2>&1; then
                  echo "❌ Xvfb display :$display_num is not responsive"
                  return 1
                fi
                
                # Check if ports are in use
                if ! netstat -tuln | grep -q ":$port "; then
                  echo "❌ Bot port $port is not in use"
                  return 1
                fi
                
                if ! netstat -tuln | grep -q ":$ws_port "; then
                  echo "❌ Bot WebSocket port $ws_port is not in use"
                  return 1
                fi
                
                # Check if browser profile exists and is accessible
                local profile_dir="/tmp/bot-profile-$instance_id"
                if [ ! -d "$profile_dir" ] || [ ! -w "$profile_dir" ]; then
                  echo "❌ Browser profile directory not accessible: $profile_dir"
                  return 1
                fi
                
                # Check if audio device is working
                local audio_device="virtual_mic_bot_$instance_id"
                if ! pactl list sinks | grep -q "$audio_device"; then
                  echo "❌ Audio device $audio_device not found"
                  return 1
                fi
                
                return 0
              }

              # Function to verify bot startup
              verify_bot_startup() {
                local bot_pid=$1
                local display_num=$2
                local instance_id=$3
                local port=$4
                local ws_port=$5
                local max_retries=5
                local retry_count=0
                
                echo "🔍 Verifying bot startup for instance $instance_id..."
                
                while [ $retry_count -lt $max_retries ]; do
                  if check_bot_health "$bot_pid" "$display_num" "$instance_id" "$port" "$ws_port"; then
                    echo "✅ Bot instance $instance_id is healthy"
                    return 0
                  fi
                  
                  echo "⏳ Waiting for bot to become healthy (attempt $((retry_count + 1))/$max_retries)..."
                  sleep 5
                  retry_count=$((retry_count + 1))
                done
                
                echo "❌ Bot instance $instance_id failed health checks after $max_retries attempts"
                return 1
              }

              # Cleanup function for all bots with improved error handling
              cleanup_all_multi_bots() {
                echo ""
                echo "🛑 Stopping all $num_bots bot instances..."
                
                # First try graceful shutdown
                for i in $(seq 0 $((num_bots - 1))); do
                  local pid="''${node_pids[$i]}"
                  local instance_id="''${bot_instance_ids[$i]}"
                  
                  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
                    echo "Stopping bot instance $instance_id (PID: $pid) gracefully..."
                    kill -TERM "$pid" 2>/dev/null || true
                    
                    # Wait for graceful shutdown (max 10 seconds)
                    local wait_count=0
                    while kill -0 "$pid" 2>/dev/null && [ $wait_count -lt 10 ]; do
                      sleep 1
                      wait_count=$((wait_count + 1))
                    done
                  fi
                done
                
                # Force kill remaining processes
                for i in $(seq 0 $((num_bots - 1))); do
                  local pid="''${bot_pids[$i]}"
                  local xvfb_pid="''${xvfb_pids[$i]}"
                  local fluxbox_pid="''${fluxbox_pids[$i]}"
                  local instance_id="''${bot_instance_ids[$i]}"
                  local display_num="''${display_nums[$i]}"
                  
                  # Kill process groups
                  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
                    echo "Force stopping bot process group: $pid"
                    kill -KILL -"$pid" 2>/dev/null || true
                  fi
                  
                  # Kill Xvfb and fluxbox
                  if [ -n "$xvfb_pid" ] && kill -0 "$xvfb_pid" 2>/dev/null; then
                    kill -KILL "$xvfb_pid" 2>/dev/null || true
                  fi
                  
                  if [ -n "$fluxbox_pid" ] && kill -0 "$fluxbox_pid" 2>/dev/null; then
                    kill -KILL "$fluxbox_pid" 2>/dev/null || true
                  fi
                
                  # Clean up resources - properly escape variables in paths
                  rm -f "/tmp/.X''${display_num}-lock"
                  rm -f "/tmp/.X11-unix/X''${display_num}"
                  rm -f "/tmp/bot_config_''${instance_id}.json"
                  rm -rf "/tmp/bot-profile-''${instance_id}"
                  rm -rf "/tmp/pulse-''${instance_id}"
                  
                  # Clean up audio modules
                  if [ -f "/tmp/audio_module_''${instance_id}.txt" ]; then
                    while read module_id; do
                      [ -n "$module_id" ] && pactl unload-module "$module_id" 2>/dev/null || true
                    done < "/tmp/audio_module_''${instance_id}.txt"
                    rm -f "/tmp/audio_module_''${instance_id}.txt"
                  fi
                done
                
                # Clean up log files
                rm -f /tmp/xvfb_multi_*.log /tmp/fluxbox_multi_*.log
                
                echo "✅ All bot instances stopped and cleaned up"
              }

              # Set up signal handlers for proper cleanup
              trap cleanup_all_multi_bots EXIT INT TERM

              # Start bots with improved resource management
              for i in $(seq 1 $num_bots); do
                echo "🤖 Starting bot $i..."
                
                # Generate unique identifiers with better isolation
                local bot_instance_id="multi_$(date +%s)_$$_''${i}"
                local display_num=$((100 + ''${i}))  # Start from display 101
                local audio_device="virtual_mic_multi_bot_''${bot_instance_id}"
                local browser_profile="/tmp/bot-profile-''${bot_instance_id}"
                
                # Find available ports for this bot instance
                local bot_port=$(find_available_port $((8080 + (i-1) * 2)))
                local bot_ws_port=$(find_available_port $((8081 + (i-1) * 2)))
                
                # Store identifiers for cleanup
                bot_instance_ids+=("$bot_instance_id")
                display_nums+=("$display_num")
                bot_ports+=("$bot_port")
                bot_ws_ports+=("$bot_ws_port")
                
                echo "📺 Bot ''${i} using display: :$display_num"
                echo "🔊 Bot ''${i} using audio device: $audio_device"
                echo "🌐 Bot ''${i} using browser profile: $browser_profile"
                echo "🔌 Bot ''${i} using ports: $bot_port (HTTP) and $bot_ws_port (WebSocket)"

                # Clean up any existing processes for this display
                pkill -f "Xvfb :''${display_num}" || true
                pkill -f "fluxbox.*DISPLAY=:''${display_num}" || true
                rm -f "/tmp/.X''${display_num}-lock"
                rm -f "/tmp/.X11-unix/X''${display_num}"
                sleep 1

                # Start Xvfb with better resource limits
                echo "🖥️ Starting virtual display :''${display_num} for bot ''${i}..."
                Xvfb ":''${display_num}" -screen 0 1280x720x24 -ac +extension GLX +render -noreset > "/tmp/xvfb_multi_''${i}.log" 2>&1 & 
                local xvfb_pid=$!
                xvfb_pids+=("$xvfb_pid")
                sleep 2

                # Verify Xvfb started successfully
                if ! ps -p "$xvfb_pid" > /dev/null; then
                  echo "❌ Failed to start Xvfb :''${display_num} for bot ''${i}"
                  cat "/tmp/xvfb_multi_''${i}.log"
                  continue
                fi

                # Start window manager with better resource management
                echo "🪟 Starting window manager for bot ''${i}..."
                DISPLAY=":''${display_num}" fluxbox > "/tmp/fluxbox_multi_''${i}.log" 2>&1 &
                local fluxbox_pid=$!
                fluxbox_pids+=("$fluxbox_pid")
                sleep 1

                # Create unique config for this bot with resource limits and ports
                local temp_config="/tmp/bot_config_''${bot_instance_id}.json"
                if [ -n "$meeting_url" ]; then
                  cat "$base_config" | jq --arg url "$meeting_url" \
                                --arg name "Bot_''${i}" \
                                --argjson resources '{"maxMemory": 4096, "maxCpu": 2}' \
                                --argjson ports "{\"http_port\": $bot_port, \"ws_port\": $bot_ws_port}" \
                                '.meeting_url = $url | .bot_name = $name | .resources = $resources | .ports = $ports' > "$temp_config"
                else
                  cat "$base_config" | jq --arg name "Bot_''${i}" \
                                --argjson resources '{"maxMemory": 4096, "maxCpu": 2}' \
                                --argjson ports "{\"http_port\": $bot_port, \"ws_port\": $bot_ws_port}" \
                                '.bot_name = $name | .resources = $resources | .ports = $ports' > "$temp_config"
                fi

                # Create virtual audio device with better isolation
                echo "🔊 Creating virtual audio device for bot ''${i}..."
                pulseaudio --daemon 2>/dev/null || true
                pactl load-module module-null-sink sink_name="''${audio_device}" rate=48000 sink_properties="device.description='Multi_Bot_Audio_''${i}'" > "/tmp/audio_module_''${bot_instance_id}.txt" 2>/dev/null || true
                pactl load-module module-virtual-source source_name="''${audio_device}_source" master="''${audio_device}.monitor" source_properties="device.description='Multi_Bot_Audio_Source_''${i}'" >> "/tmp/audio_module_''${bot_instance_id}.txt" 2>/dev/null || true

                # Start the bot in a new process group with resource limits
                echo "🤖 Starting bot ''${i} process..."
                (
                  # Create new process group with resource limits
                  setsid bash -c "
                    # Set resource limits
                    ulimit -v 4194304  # 4GB virtual memory
                    ulimit -u 1024     # Max user processes
                    
                    # Export environment variables with proper escaping for nested bash
                    export DISPLAY=:''${display_num}
                    export PULSE_RUNTIME_PATH=\"/tmp/pulse-''${bot_instance_id}\"
                    export BOT_INSTANCE_ID=\"''${bot_instance_id}\"
                    export BOT_BROWSER_PROFILE=\"/tmp/bot-profile-''${bot_instance_id}\"
                    export BOT_AUDIO_DEVICE=\"virtual_mic_multi_bot_''${bot_instance_id}\"
                    export NODE_OPTIONS=\"--max-old-space-size=4096\"
                    export UV_THREADPOOL_SIZE=4
                    export CHROME_DEVEL_SANDBOX=false
                    export CHROME_NO_SANDBOX=true
                    export NODE_ENV=production
                    export SERVERLESS=true
                    export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
                    export PLAYWRIGHT_BROWSERS_PATH=\"''${pkgs.playwright-driver.browsers}\"
                    export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true
                    
                    # Redis configuration
                    export REDIS_ADDRESS=\"''${REDIS_ADDRESS:-localhost}\"
                    export REDIS_PORT=\"''${REDIS_PORT:-6379}\"
                    export REDIS_URL=\"redis://''${REDIS_ADDRESS:-localhost}:''${REDIS_PORT:-6379}\"
                    
                    # Create isolated directories
                    mkdir -p \"$PULSE_RUNTIME_PATH\"
                    mkdir -p \"$BOT_BROWSER_PROFILE\"
                    
                    echo \"🤖 Bot ''${i} environment ready, starting node process...\"
                    BOT_HTTP_PORT=$bot_port BOT_WS_PORT=$bot_ws_port node build/src/main.js < /tmp/bot_config_''${bot_instance_id}.json
                  " 
                ) &
                
                local bot_pid=$!
                bot_pids+=("$bot_pid")
                
                # Get the actual node.js PID (child of the setsid process)
                sleep 3  # Wait for node process to start
                local node_pid=$(pgrep -P "$bot_pid" node 2>/dev/null || echo "")
                if [ -n "$node_pid" ]; then
                  node_pids+=("$node_pid")
                  echo "✅ Bot ''${i} started (Shell PID: $bot_pid, Node PID: $node_pid, Display: :$display_num)"
                  echo "🔌 Bot ''${i} ports: HTTP=$bot_port, WebSocket=$bot_ws_port"
                  
                  # Verify bot startup
                  if verify_bot_startup "$node_pid" "$display_num" "$bot_instance_id" "$bot_port" "$bot_ws_port"; then
                    bot_health_status+=("healthy")
                  else
                    bot_health_status+=("unhealthy")
                    echo "⚠️ Bot ''${i} started but failed health checks"
                  fi
                else
                  node_pids+=("")
                  bot_health_status+=("failed")
                  echo "❌ Bot ''${i} failed to start properly"
                fi
                
                # Small delay between starts to avoid resource conflicts
                sleep 3
              done

              echo ""
              echo "🎉 Bot startup summary:"
              for i in $(seq 0 $((num_bots - 1))); do
                local status="''${bot_health_status[$i]}"
                local instance_id="''${bot_instance_ids[$i]}"
                local node_pid="''${node_pids[$i]}"
                local display_num="''${display_nums[$i]}"
                local bot_port="''${bot_ports[$i]}"
                local bot_ws_port="''${bot_ws_ports[$i]}"
                
                echo "Bot $((i + 1)):"
                echo "  Status: $status"
                echo "  Instance ID: $instance_id"
                echo "  Node PID: $node_pid"
                echo "  Display: :$display_num"
                echo "  Ports: HTTP=$bot_port, WebSocket=$bot_ws_port"
              echo ""
              done

              echo "📊 Management Commands:"
              echo "  • Press ENTER to stop all bots gracefully"
              echo "  • Press Ctrl+C to force stop all bots"
              echo "  • Run 'list-bot-processes' in another terminal to monitor"
              echo "  • Run 'cleanup-all-bots' in another terminal for emergency cleanup"
              echo ""
              echo "📊 Monitoring:"
              echo "  • Logs: tail -f /tmp/xvfb_multi_*.log /tmp/fluxbox_multi_*.log"
              echo "  • Processes: watch 'ps aux | grep -E \"(Xvfb|fluxbox|node.*main.js)\"'"
              echo "  • Health: watch 'for i in \$(seq 0 $((num_bots - 1))); do echo \"Bot \$((i + 1)): \$(check_bot_health \''${node_pids[$i]} \''${display_nums[$i]} \''${bot_instance_ids[$i]} \''${bot_ports[$i]} \''${bot_ws_ports[$i]} && echo healthy || echo unhealthy)\"; done'"
              echo ""

              # Wait for user input with better handling
              echo "⏳ Bots are running... Press ENTER to stop all bots:"
              
              # Use read with timeout so Ctrl+C works better
              if read -t 3600 -r; then  # 1 hour timeout
                echo "🛑 User requested shutdown..."
              else
                echo "🛑 Shutdown requested..."
              fi

              # Cleanup will be handled by trap
            }

            function list-bot-processes() {
              echo "🔍 Active bot processes:"
              echo ""
              
              echo "Xvfb displays:"
              ps aux | grep "Xvfb :" | grep -v grep || echo "  None found"
              echo ""
              
              echo "Fluxbox window managers:"
              ps aux | grep "fluxbox" | grep -v grep || echo "  None found"
              echo ""
              
              echo "Node.js bot processes:"
              ps aux | grep "node.*main.js" | grep -v grep || echo "  None found"
              echo ""
              
              echo "Virtual audio devices:"
              pactl list short sinks | grep "virtual_mic_bot" || echo "  None found"
              echo ""
              
              echo "Lock files:"
              ls -la /tmp/.X*-lock 2>/dev/null || echo "  None found"
            }

            function cleanup-all-bots() {
              echo "🧹 Cleaning up all bot processes and resources..."
              
              # Kill all Xvfb processes
              pkill -f "Xvfb :" || true
              
              # Kill all fluxbox processes
              pkill fluxbox || true
              
              # Kill all node processes running main.js
              pkill -f "node.*main.js" || true
              
              # Remove all lock files
              rm -f /tmp/.X*-lock
              rm -f /tmp/.X11-unix/X*
              
              # Clean up virtual audio devices
              pactl list short modules | grep "virtual_mic_bot" | cut -f1 | while read module_id; do
                [ -n "$module_id" ] && pactl unload-module "$module_id" 2>/dev/null || true
              done
              
              # Clean up temp files
              rm -f /tmp/xvfb_*.log /tmp/fluxbox_*.log /tmp/audio_module_*.txt
              rm -rf /tmp/bot-profile-*
              rm -rf /tmp/pulse-*
              rm -f /tmp/bot_config_*.json
              
              echo "✅ Cleanup complete"
            }

            function emergency-cleanup-multi-bots() {
              echo "🚨 Emergency cleanup for multi-bot instances..."
              
              # More aggressive cleanup for multi-bot instances
              echo "🔪 Force killing all related processes..."
              
              # Kill all processes in a more targeted way
              pkill -9 -f "Xvfb.*:1[0-9][0-9]" || true  # Displays 100+
              pkill -9 -f "fluxbox.*DISPLAY=:1[0-9][0-9]" || true
              pkill -9 -f "node.*main.js" || true
              pkill -9 -f "setsid.*bash" || true
              
              # Clean up multi-bot specific files
              rm -f /tmp/.X1[0-9][0-9]-lock
              rm -f /tmp/.X11-unix/X1[0-9][0-9]
              rm -f /tmp/xvfb_multi_*.log
              rm -f /tmp/fluxbox_multi_*.log
              
              # Clean up multi-bot audio devices
              pactl list short modules | grep -E "(virtual_mic_multi_bot|Multi_Bot_Audio)" | cut -f1 | while read module_id; do
                [ -n "$module_id" ] && pactl unload-module "$module_id" 2>/dev/null || true
              done
              
              # Clean up multi-bot temp files
              rm -f /tmp/bot_config_multi_*.json
              rm -rf /tmp/bot-profile-multi_*
              rm -rf /tmp/pulse-multi_*
              rm -f /tmp/audio_module_multi_*.txt
              
              echo "✅ Emergency cleanup complete"
              echo "💡 You can now restart multi-bot safely"
            }

            # API Mode Functions
            function setup-env() {
              echo "🔧 Creating .env template..."
              cat > .env << 'EOF'
# API Configuration (required for API mode)
API_SERVER_BASEURL=http://localhost:3001
SERVERLESS=false

# RabbitMQ Configuration
AMQP_ADDRESS=amqp://localhost:5672
NODE_NAME=nixos-bot-1

# Redis Configuration (optional)
REDIS_ADDRESS=localhost
REDIS_PORT=6379

# AWS Configuration (optional, for cloud storage)
AWS_S3_VIDEO_BUCKET=
AWS_S3_TEMPORARY_AUDIO_BUCKET=
AWS_LOCAL_ACCESS_KEY_ID=
AWS_LOCAL_SECRET_ACCESS_KEY=
S3_BASEURL=
S3_ARGS=

# Environment info
POD_IP=127.0.0.1
ENVIRON=development
EOF
              echo "✅ .env file created! Edit it with your configuration."
              echo "📝 Key variables to configure:"
              echo "  • API_SERVER_BASEURL - Your MeetingBaas backend URL"
              echo "  • AMQP_ADDRESS - RabbitMQ connection string"
              echo "  • NODE_NAME - Unique name for this bot instance"
            }

            function start-rabbitmq() {
              echo "📨 Starting RabbitMQ server..."
              if pgrep -f rabbitmq-server > /dev/null; then
                echo "⚠️  RabbitMQ is already running"
                return 0
              fi
              
              mkdir -p /tmp/rabbitmq-data
              RABBITMQ_MNESIA_BASE=/tmp/rabbitmq-data rabbitmq-server &
              RABBITMQ_PID=$!
              
              echo "✅ RabbitMQ started (PID: $RABBITMQ_PID)"
              echo "🌐 Management UI will be available at: http://localhost:15672"
              echo "👤 Default credentials: guest/guest"
            }

            function start-redis() {
              echo "⚠️  This function is deprecated. Redis should be started externally."
              return 1
            }

            function start-api-consumer() {
              echo "⚠️  This function is deprecated. Use multi-api-consumer instead."
              return 1
            }

            function run-api-bot() {
              echo "⚠️  This function is deprecated. Use multi-api-consumer instead."
              return 1
            }

            function multi-api-consumer() {
              if [ -z "$1" ]; then
                echo "❌ Usage: multi-api-consumer <num_consumers>"
                echo "   Example: multi-api-consumer 3"
                return 1
              fi

              local num_consumers=$1

              # Validate inputs
              if ! [[ "$num_consumers" =~ ^[0-9]+$ ]] || [ "$num_consumers" -lt 1 ] || [ "$num_consumers" -gt 10 ]; then
                echo "❌ Number of consumers must be between 1 and 10"
                return 1
              fi

              if [ ! -f ".env" ]; then
                echo "❌ .env file not found. Run 'setup-env' first."
                return 1
              fi

              echo "🚀 Starting $num_consumers API consumer instances..."
              echo "🔌 Redis: $REDIS_ADDRESS:$REDIS_PORT"
              echo "📨 RabbitMQ: $AMQP_ADDRESS"
              echo "🌐 API: $API_SERVER_BASEURL"
              echo ""

              # Verify Redis connection
              if ! redis-cli -h "$REDIS_ADDRESS" -p "$REDIS_PORT" ping > /dev/null 2>&1; then
                echo "❌ Redis connection failed at $REDIS_ADDRESS:$REDIS_PORT"
                return 1
              fi

              # Ensure build is ready
              if [ ! -d "build" ]; then
                echo "🔨 Building first..."
                build
              fi

              # Array to track PIDs
              local consumer_pids=()

              # Start consumers in background
              for i in $(seq 1 $num_consumers); do
                local consumer_instance_id=$(date +%s)_$$_$i
                local display_num=$((100 + $i))
                local node_name="''${NODE_NAME:-nixos-bot}-$i"
                local http_port=$((9000 + $i * 2))
                local ws_port=$((9001 + $i * 2))
                
                echo "🤖 Starting consumer $i (Display :$display_num, Ports $http_port/$ws_port)..."
                
                # Clean up any existing processes
                pkill -f "Xvfb :$display_num" || true
                rm -f "/tmp/.X$display_num-lock" "/tmp/.X11-unix/X$display_num"
                
                # Start the consumer with minimal logging
                (
                  setsid bash -c '
                    # Load .env and set core environment
                    source "$PWD/.env"
                    export DISPLAY=":'"$display_num"'"
                    export BOT_INSTANCE_ID="'"$consumer_instance_id"'"
                    export BOT_BROWSER_PROFILE="/tmp/bot-profile-'"$consumer_instance_id"'"
                    export BOT_AUDIO_DEVICE="virtual_mic_api_bot_'"$consumer_instance_id"'"
                    export NODE_NAME="'"$node_name"'"
                    export BOT_HTTP_PORT="'"$http_port"'"
                    export BOT_WS_PORT="'"$ws_port"'"
                    
                    # Copy extension to isolated location
                    extension_path="/tmp/bot-extension-'"$consumer_instance_id"'"
                    rm -rf "$extension_path"
                    cp -r chrome_extension/dist "$extension_path"
                    export CHROME_EXTENSION_PATH="$extension_path"
                    
                    # Start Xvfb (minimal logging)
                    Xvfb ":'"$display_num"'" -screen 0 1280x720x24 -ac +extension GLX +render -noreset > /dev/null 2>&1 &
                    XVFB_PID=$!
                    sleep 1
                    
                    # Start fluxbox (minimal logging)
                    DISPLAY=":'"$display_num"'" fluxbox > /dev/null 2>&1 &
                    FLUXBOX_PID=$!
                    sleep 1
                    
                    # Setup audio
                    pulseaudio --daemon 2>/dev/null || true
                    pactl load-module module-null-sink sink_name="$BOT_AUDIO_DEVICE" rate=48000 > /dev/null 2>&1 || true
                    
                    # Start browser with proper extension support
                    node build/src/main.js --extension-path="$extension_path" --enable-background-pages
                    
                    # Cleanup on exit
                    cleanup() {
                      kill $FLUXBOX_PID 2>/dev/null || true
                      kill $XVFB_PID 2>/dev/null || true
                      rm -f "/tmp/.X'"$display_num"'-lock" "/tmp/.X11-unix/X'"$display_num"'"
                      rm -rf "$BOT_BROWSER_PROFILE"
                      rm -rf "$extension_path"
                      pactl unload-module $(pactl list short modules | grep "$BOT_AUDIO_DEVICE" | cut -f1) 2>/dev/null || true
                    }
                    trap cleanup EXIT INT TERM
                  '
                ) &
                
                local consumer_pid=$!
                consumer_pids+=($consumer_pid)
                echo "✅ Consumer $i started (PID: $consumer_pid)"
                sleep 2
              done

              echo ""
              echo "🎉 All consumers started"
              echo "📊 To monitor:"
              echo "  • Logs: tail -f /tmp/xvfb_api_*.log"
              echo "  • Processes: ps aux | grep node.*main.js"
              echo "  • Redis: redis-cli -h $REDIS_ADDRESS -p $REDIS_PORT client list"
              echo ""
              echo "Press Enter to stop all consumers, or Ctrl+C to leave them running..."

              # Cleanup function
              cleanup_all_consumers() {
                echo "🛑 Stopping consumers..."
                for pid in "''${consumer_pids[@]}"; do
                  kill "$pid" 2>/dev/null || true
                done
                echo "✅ All consumers stopped"
              }
              
              trap cleanup_all_consumers EXIT INT TERM
              read -r
              cleanup_all_consumers
            }

            # Performance and validation functions
            function validate-environment() {
              echo "🔍 Validating environment setup..."
              
              echo "📦 Checking dependencies:"
              echo "  Node.js: $(node --version)"
              echo "  FFmpeg: $(ffmpeg -version | head -1)"
              echo "  AWS CLI: $(aws --version 2>/dev/null || echo 'Not available')"
              echo "  Playwright: $(ls -la $PLAYWRIGHT_BROWSERS_PATH/ | wc -l) browser(s)"
              
              echo ""
              echo "🎛️ Current shell environment:"
              echo "  NODE_OPTIONS: $NODE_OPTIONS"
              echo "  UV_THREADPOOL_SIZE: $UV_THREADPOOL_SIZE"
              echo "  SERVERLESS: $SERVERLESS"
              echo "  DISPLAY: $DISPLAY"
              
              echo ""
              echo "🔧 System resources:"
              echo "  CPU cores: $(nproc)"
              echo "  Memory: $(free -h | grep '^Mem:' | awk '{print $2}')"
              echo "  Disk space: $(df -h . | tail -1 | awk '{print $4}')"
              
              echo ""
              if [ -f ".env" ]; then
                echo "✅ .env file found"
                echo "🔑 .env Configuration (for API mode):"
                grep -E "^(API_SERVER_BASEURL|AMQP_ADDRESS|NODE_NAME|SERVERLESS)" .env || echo "  No API config found"
                
                # Show the difference
                local env_serverless=$(grep "^SERVERLESS=" .env | cut -d'=' -f2)
                if [ "$env_serverless" != "$SERVERLESS" ]; then
                  echo ""
                  echo "⚠️  Mode difference detected:"
                  echo "  Current shell: SERVERLESS=$SERVERLESS"
                  echo "  .env file: SERVERLESS=$env_serverless"
                  echo "  💡 API functions will use .env value ($env_serverless)"
                fi
              else
                echo "⚠️  No .env file (required for API mode)"
              fi
            }

            function monitor-performance() {
              echo "📊 Performance monitoring started..."
              echo "💡 Press Ctrl+C to stop monitoring"
              
              while true; do
                echo "$(date '+%H:%M:%S') | CPU: $(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)% | RAM: $(free | grep Mem | awk '{printf("%.1f%%", $3/$2 * 100.0)}') | Processes: $(pgrep -f 'node.*main.js' | wc -l) bots"
                sleep 5
              done
            }

            function docker-compatibility() {
              echo "🐳 Docker compatibility mode"
              echo "Setting Docker-equivalent environment variables..."
              
              # Match Docker performance settings exactly
              export NODE_OPTIONS="--max-old-space-size=6144"
              export UV_THREADPOOL_SIZE=4
              export NODE_ENV=production
              
              # Docker-like resource limits simulation
              echo "🔧 Simulating Docker resource limits:"
              echo "  CPU limit: 4.0 cores"
              echo "  Memory limit: 7168MB"
              echo "  Node.js heap: 6144MB (85% of container RAM)"
              
              # Create recordings directory structure like Docker
              mkdir -p ./recordings
              
              echo "✅ Docker compatibility mode enabled"
            }
          '';
        };
      }
    );
} 