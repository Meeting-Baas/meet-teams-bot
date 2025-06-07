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
            
            # Playwright from maintained flake
            playwright-test
              playwright-driver
            ];
            
          shellHook = ''
            # Set environment variables
            export NODE_OPTIONS="--max-old-space-size=4096"
            export UV_THREADPOOL_SIZE=4
            export CHROME_DEVEL_SANDBOX=false
            export CHROME_NO_SANDBOX=true
            export SERVERLESS=true
            export NODE_ENV=production
            export DISPLAY=:99
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
              rm -f /tmp/.X$display_num-lock
              rm -f /tmp/.X11-unix/X$display_num
              
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
                rm -f /tmp/.X$display_num-lock
                rm -f /tmp/.X11-unix/X$display_num
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
                cat "$1" | jq --arg url "$2" '.meeting_url = $url' | node recording_server/build/src/main.js
              else
                # Otherwise just use the config file as is
                echo "🤖 Starting bot with config file: $1"
                cat "$1" | node recording_server/build/src/main.js
              fi

              # Cleanup will be handled by trap
            }

            function build() {
              echo "🔨 Building bot and Chrome extension..."
              
              if [ ! -d "recording_server/node_modules" ] || [ ! -d "recording_server/chrome_extension/node_modules" ]; then
                echo "📦 Installing dependencies first..."
                npm install --prefix recording_server --include=dev --legacy-peer-deps
                npm install --prefix recording_server/chrome_extension --include=dev --legacy-peer-deps
              fi
              
              echo "🏗️ Building recording server..."
              npm run build --prefix recording_server
              
              echo "🏗️ Building Chrome extension..."
              npm run build-dev --prefix recording_server/chrome_extension
              
              echo "✅ Build complete!"
            }

            function clean() {
              echo "🧹 Cleaning up build artifacts and temporary files..."
              
              # Clean up build directories
              rm -rf recording_server/build
              rm -rf recording_server/chrome_extension/dist
              
              # Clean up node modules
              rm -rf recording_server/node_modules
              rm -rf recording_server/chrome_extension/node_modules
              
              # Clean up lock files
              rm -f recording_server/package-lock.json
              rm -f recording_server/chrome_extension/package-lock.json
              
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

              echo "🚀 Starting $num_bots bot instances..."
              echo "📁 Base config: $base_config"
              [ -n "$meeting_url" ] && echo "🔗 Meeting URL: $meeting_url"
              echo ""

              # Array to track PIDs
              local bot_pids=()

              # Start bots in background
              for i in $(seq 1 $num_bots); do
                echo "🤖 Starting bot $i..."
                
                # Create unique config for this bot
                local temp_config="/tmp/bot_config_$i.json"
                if [ -n "$meeting_url" ]; then
                  cat "$base_config" | jq --arg url "$meeting_url" --arg name "Bot_$i" '.meeting_url = $url | .bot_name = $name' > "$temp_config"
                else
                  cat "$base_config" | jq --arg name "Bot_$i" '.bot_name = $name' > "$temp_config"
                fi

                # Start bot in background
                start-bot "$temp_config" &
                local bot_pid=$!
                bot_pids+=($bot_pid)
                
                echo "✅ Bot $i started (PID: $bot_pid)"
                
                # Small delay between starts to avoid resource conflicts
                sleep 3
              done

              echo ""
              echo "🎉 All $num_bots bots started successfully!"
              echo ""
              echo "Bot PIDs: ''${bot_pids[*]}"
              echo ""
              echo "To stop all bots:"
              echo "  kill ''${bot_pids[*]}"
              echo ""
              echo "To monitor logs:"
              echo "  tail -f /tmp/xvfb_*.log /tmp/fluxbox_*.log"
              echo ""

              # Wait for user input to stop all bots
              echo "Press Enter to stop all bots, or Ctrl+C to leave them running..."
              read -r

              echo "🛑 Stopping all bots..."
              for pid in "''${bot_pids[@]}"; do
                if kill -0 "$pid" 2>/dev/null; then
                  echo "Stopping bot PID: $pid"
                  kill "$pid" 2>/dev/null || true
                fi
              done

              # Clean up temp configs
              rm -f /tmp/bot_config_*.json

              echo "✅ All bots stopped"
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
          '';
        };
      }
    );
} 