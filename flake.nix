{
  description = "Meet Teams Bot Development Environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/release-24.11";
    flake-utils.url = "github:numtide/flake-utils";
    playwright.url = "github:pietdevries94/playwright-web-flake/1.50.1";
    dream2nix.url = "github:nix-community/dream2nix?ref=main";
  };

  outputs = { self, nixpkgs, flake-utils, playwright, dream2nix }:
    let
      eachSystem = nixpkgs.lib.genAttrs [ "x86_64-linux" ];

      # Define our Node.js package using buildNpmPackage
      nodejsPackage = system: 
        let
          pkgs = nixpkgs.legacyPackages.${system};
          nodejs = pkgs.nodejs_18;
          nodePackages = pkgs.nodePackages.override { inherit nodejs; };
          package = pkgs.buildNpmPackage {
            name = "meet-teams-bot";
            version = "1.0.0";
            src = ./.;
            # Generate a new hash using:
            # nix develop
            # npm i --package-lock-only
            # prefetch-npm-deps package-lock.json
            npmDepsHash = "sha256-0000000000000000000000000000000000000000000000="; # This needs to be updated
            npmBuildScript = "build";
            buildInputs = with pkgs; [
              # Core build dependencies
              python3
              gcc
              gnumake
              pkg-config
              # Image processing dependencies (for Sharp)
              vips
              vips.dev
              glib
              glib.dev
              gobject-introspection
              libpng
              libjpeg
              libwebp
              librsvg
              orc
              expat
              cairo
              pango
              gdk-pixbuf
              # System libraries
              stdenv.cc.cc.lib
              zlib
              openssl
              libstdcxx5
              libuuid
              # X11 and display dependencies (matching Dockerfile)
              xorg.libX11
              xorg.libXcomposite
              xorg.libXdamage
              xorg.libXext
              xorg.libXfixes
              xorg.libXrandr
              xorg.libxcb
              xorg.libXScrnSaver
              xorg.libxshmfence
              libxkbcommon
              # Audio dependencies
              alsa-lib
              pulseaudio
              # Graphics and rendering
              mesa
              libdrm
              # Additional system dependencies
              nss
              nspr
              atk
              at-spi2-atk
              at-spi2-core
              cups
              udev
            ];
            installPhase = ''
              mkdir -p $out/lib/node_modules/meet-teams-bot
              cp -r node_modules $out/lib/node_modules/meet-teams-bot/
              cp -r dist $out/lib/node_modules/meet-teams-bot/
              cp package.json $out/lib/node_modules/meet-teams-bot/

              mkdir -p $out/bin
              cat > $out/bin/meet-teams-bot << EOF
              #!${pkgs.bash}/bin/bash
              ${nodejs}/bin/node $out/lib/node_modules/meet-teams-bot/dist/index.js "\$@"
              EOF
              chmod +x $out/bin/meet-teams-bot
            '';
          };
        in
        package;

      # Custom shell with additional tools
      customShell = system: 
        let
          pkgs = nixpkgs.legacyPackages.${system};
          nodejs = pkgs.nodejs_18;
          nodePackages = pkgs.nodePackages.override { inherit nodejs; };
          # Get the paths to type definitions
          typescript = nodePackages.typescript;
          typescriptDir = "${typescript}/lib/node_modules/typescript";
          playwrightTest = playwright.packages.${system}.playwright-test;
          playwrightTypes = "${playwrightTest}/lib/node_modules/@playwright/test";
          vips = pkgs.vips;
        in
        pkgs.mkShell {
          name = "meet-teams-bot-dev";
          buildInputs = with pkgs; [
            # Node.js and npm
            nodejs
            nodePackages.npm
            nodePackages.node-gyp
            nodePackages.typescript
            nodePackages.typescript-language-server
            # Development tools
            jq
            prefetch-npm-deps
            # Build dependencies (matching Dockerfile)
            python3
            gcc
            gnumake
            pkg-config
            # Image processing dependencies (for Sharp)
            vips
            vips.dev
            glib
            glib.dev
            gobject-introspection
            libpng
            libjpeg
            libwebp
            librsvg
            orc
            expat
            cairo
            pango
            gdk-pixbuf
            # System libraries
            stdenv.cc.cc.lib
            zlib
            openssl
            libstdcxx5
            libuuid
            # X11 and display dependencies (matching Dockerfile)
            xorg.libX11
            xorg.libXcomposite
            xorg.libXdamage
            xorg.libXext
            xorg.libXfixes
            xorg.libXrandr
            xorg.libxcb
            xorg.libXScrnSaver
            xorg.libxshmfence
            libxkbcommon
            # Audio dependencies
            alsa-lib
            pulseaudio
            pulseaudioFull
            pavucontrol
            alsa-utils
            # Graphics and rendering
            mesa
            libdrm
            # Additional system dependencies (matching Dockerfile)
            nss
            nspr
            atk
            at-spi2-atk
            at-spi2-core
            cups
            udev
            # Runtime dependencies
            playwright-test
            playwright-driver
            ffmpeg-full
            imagemagick
            awscli2
            # Additional runtime dependencies
            wget
            gnupg
            dbus
            xvfb-run
            x11vnc
            fluxbox
            xorg.xorgserver
            curl
            unzip
            procps
            netcat-gnu
            nmap
            tmux
          ];

          shellHook = ''
            # Helper functions for colored output
            print_info() { echo -e "\033[0;34mℹ️  $1\033[0m"; }
            print_success() { echo -e "\033[0;32m✅ $1\033[0m"; }
            print_warning() { echo -e "\033[1;33m⚠️  $1\033[0m"; }
            print_error() { echo -e "\033[0;31m❌ $1\033[0m"; }
            print_bot() { echo -e "\033[0;35m🤖 $1\033[0m"; }
            print_env() { echo -e "\033[0;36m🔧 $1\033[0m"; }

	    export RECORDING=true

            # Set up Node.js environment
            export PATH="${nodejs}/bin:$PATH"
            export NPM_CONFIG_PREFIX="$PWD/.npm-global"
            export PATH="$PWD/.npm-global/bin:$PATH"
            
            # Set up library paths for vips
            export LD_LIBRARY_PATH="${vips}/lib:$LD_LIBRARY_PATH"
            export LIBRARY_PATH="${vips}/lib:$LIBRARY_PATH"
            export CPATH="${vips}/include:$CPATH"
            
            # Set up TypeScript type definitions
            export TYPESCRIPT_TYPES_ROOT="${typescriptDir}/lib:$PWD/node_modules/@types"
            export TS_NODE_TYPES_ROOT="${typescriptDir}/lib:$PWD/node_modules/@types"
            export PLAYWRIGHT_TYPES="${playwrightTypes}/types"
            
            # Sharp image processing configuration
            export npm_config_build_from_source=true
            export npm_config_sharp_binary_host=""
            export npm_config_sharp_libvips_binary_host=""
            export SHARP_IGNORE_GLOBAL_LIBVIPS=true
            export SHARP_INSTALL_FORCE=true
            export SHARP_DIST_BASE_URL=""
            export npm_config_sharp_libvips_binary_host=""
            export npm_config_sharp_binary_host=""
            export npm_config_sharp_use_global_libvips=true
            
            # Set up node-gyp environment
            export npm_config_node_gyp="${nodePackages.node-gyp}/lib/node_modules/node-gyp/bin/node-gyp.js"
            export npm_config_python="${pkgs.python3}/bin/python3"
            
            # Create npm global directory if it doesn't exist
            mkdir -p "$NPM_CONFIG_PREFIX"
            
            # Common environment variables (matching Dockerfile)
            export NODE_OPTIONS="--max-old-space-size=2048"
            export FFMPEG_THREAD_COUNT=0
            export FFMPEG_PRESET=ultrafast
            export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
            export PLAYWRIGHT_BROWSERS_PATH="${pkgs.playwright-driver.browsers}"
            export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true
            
            # Configure PulseAudio for virtual audio
            export PULSE_SERVER=127.0.0.1
            export PULSE_RUNTIME_PATH=/tmp/pulse
            export XDG_RUNTIME_DIR=/tmp/pulse
            
            # Chrome browser optimization settings
            export CHROME_DEVEL_SANDBOX=false
            export CHROME_NO_SANDBOX=true
            
            # Disable GPU acceleration to avoid AMD GPU issues
            export LIBGL_ALWAYS_SOFTWARE=1
            export GALLIUM_DRIVER=llvmpipe

            # Create a unique ID for this bot instance
            BOT_ID=$(date +%s)-$RANDOM
            export BOT_RUNTIME_DIR="/tmp/meet-teams-bot-$BOT_ID"
            export BOT_DISPLAY=$((99))  # Random display number between 99-198
            
            # Create isolated runtime directory for this bot instance
            mkdir -p "$BOT_RUNTIME_DIR"
            mkdir -p "$BOT_RUNTIME_DIR/x11"
            
            # Set up isolated environment variables
            export XAUTHORITY="$BOT_RUNTIME_DIR/x11/xauthority"
            export DISPLAY=":$BOT_DISPLAY"
            export SERVERLESS=false  # Changed to false for Redis mode
            export NODE_ENV=production
            
            # Create bot-manager script
            cat > "$PWD/bot-manager" << 'BOT_MANAGER_EOF'
#!${pkgs.bash}/bin/bash

# Helper functions for colored output
print_info() { echo -e "\033[0;34mℹ️  $1\033[0m"; }
print_success() { echo -e "\033[0;32m✅ $1\033[0m"; }
print_warning() { echo -e "\033[1;33m⚠️  $1\033[0m"; }
print_error() { echo -e "\033[0;31m❌ $1\033[0m"; }
print_bot() { echo -e "\033[0;35m🤖 $1\033[0m"; }

# Start Redis-connected bot
start_bot() {
  local bot_number="$1"
  if [ -z "$bot_number" ]; then
    print_error "Please specify a bot number (1-4)"
    return 1
  fi
  
  local window_name="bot-$bot_number"
  print_info "Starting bot $bot_number in Redis mode..."
  
  tmux new-window -t meet-bots -n "$window_name"
  tmux send-keys -t "meet-bots:$window_name" "cd $PWD && source .env && NODE_NAME=nixos-bot-$bot_number node build/src/main.js" Enter
  
  print_success "Bot $bot_number started in window $window_name"
}

# Stop a specific bot
stop_bot() {
  local bot_number="$1"
  if [ -z "$bot_number" ]; then
    print_error "Please specify a bot number (1-4)"
    return 1
  fi
  
  local window_name="bot-$bot_number"
  print_info "Stopping bot $bot_number..."
  
  tmux kill-window -t "meet-bots:$window_name" 2>/dev/null || true
  pkill -f "node build/src/main.js.*nixos-bot-$bot_number" || true
  
  print_success "Bot $bot_number stopped"
}

# Stop all bots
stop_all_bots() {
  print_info "Stopping all bots..."
  pkill -f "node build/src/main.js"
  tmux list-windows -t meet-bots | grep "bot-" | awk '{print $1}' | xargs -I {} tmux kill-window -t "meet-bots:{}" 2>/dev/null || true
  print_success "All bots stopped"
}

# Show logs for a bot
show_logs() {
  local bot_number="$1"
  if [ -z "$bot_number" ]; then
    print_error "Please specify a bot number (1-4)"
    return 1
  fi
  
  local window_name="bot-$bot_number"
  tmux select-window -t "meet-bots:$window_name"
  print_info "Showing logs for bot $bot_number"
  print_info "Press Ctrl-c to stop following logs"
}

# Main command handling
case "$1" in
  "start")
    start_bot "$2"
    ;;
  "stop")
    stop_bot "$2"
    ;;
  "stop-all")
    stop_all_bots
    ;;
  "logs")
    show_logs "$2"
    ;;
  *)
    echo "Meet Teams Bot Manager (Redis Mode)"
    echo
    echo "Usage: ./bot-manager <command> [args]"
    echo
    echo "Commands:"
    echo "  start <number>     - Start a bot (1-4)"
    echo "  stop <number>      - Stop a specific bot"
    echo "  stop-all          - Stop all bots"
    echo "  logs <number>      - Show logs for a bot"
    echo
    echo "Examples:"
    echo "  ./bot-manager start 1"
    echo "  ./bot-manager stop 1"
    echo "  ./bot-manager logs 1"
    ;;
esac
BOT_MANAGER_EOF

            chmod +x "$PWD/bot-manager"

            # Tmux session management
            if [ -z "$TMUX" ] && ! tmux has-session -t meet-bots 2>/dev/null; then
              print_info "Creating new tmux session 'meet-bots'"
              tmux new-session -d -s meet-bots
              tmux rename-window -t meet-bots:0 'control'
              
              # Configure tmux status bar for better visibility
              tmux set-option -g status-left "#[fg=green]🤖 Meet Teams Bot#[default]"
              tmux set-option -g status-right "#[fg=yellow]%H:%M#[default]"
              tmux set-option -g status-interval 1
              
              # Attach to the session
              print_info "Attaching to tmux session 'meet-bots'"
              exec tmux attach-session -t meet-bots
            elif [ -z "$TMUX" ]; then
              # Session exists but we're not in tmux, just attach
              print_info "Attaching to existing tmux session 'meet-bots'"
              exec tmux attach-session -t meet-bots
            else
              # Already in tmux, just print status
              print_info "Already in tmux session"
            fi

            # Start Xvfb for this bot with minimal configuration
            print_bot "Starting virtual display :$BOT_DISPLAY"
            Xvfb ":$BOT_DISPLAY" -screen 0 1280x880x24 -ac +extension GLX +render -noreset -nolisten tcp \
              -fbdir "$BOT_RUNTIME_DIR/x11" &
            XVFB_PID=$!
            
            # Wait for Xvfb to be ready
            for i in $(seq 1 10); do
              if xdpyinfo -display ":$BOT_DISPLAY" >/dev/null 2>&1; then
                print_success "Virtual display :$BOT_DISPLAY ready (PID: $XVFB_PID)"
                break
              fi
              sleep 1
            done

            # Ensure PulseAudio is running
            if pulseaudio --check; then
              echo "PulseAudio was already running."
            else
              pulseaudio --start
              echo "PulseAudio was not running and has now been started."
            fi
            sleep 1
            
            # Create virtual audio devices using system PulseAudio
            print_bot "Setting up virtual audio devices"
            if ! pactl list sinks | grep -q "virtual_speaker"; then
              pactl load-module module-null-sink sink_name=virtual_speaker sink_properties=device.description=Virtual_Speaker
              print_success "Virtual speaker created"
              sleep 1
            fi
            
            if ! pactl list sources | grep -q "virtual_mic"; then
              pactl load-module module-virtual-source source_name=virtual_mic
              print_success "Virtual microphone created"
              sleep 1
            fi

            # Create cleanup script
            cat > "$BOT_RUNTIME_DIR/cleanup" << 'CLEANUP_EOF'
#!${pkgs.bash}/bin/bash

# Cleanup function to remove resources when bot instance exits
cleanup() {
  local bot_dir="$(dirname "$0")"
  local bot_id=$(basename "$bot_dir" | sed 's/meet-teams-bot-//')
  
  print_info "Cleaning up bot instance $bot_id..."
  
  # Kill any running processes
  pkill -f "node build/src/main.js.*$bot_id" || true
  
  # Remove bot directory and symlinks
  rm -rf "$bot_dir"
  rm -f "$PWD/bot-control-$bot_id"
  rm -f "$PWD/rebuild-bot-$bot_id"
  rm -f "$PWD/cleanup-$bot_id"
}

# Run cleanup
cleanup
CLEANUP_EOF

            chmod +x "$BOT_RUNTIME_DIR/cleanup"

            # Create symlink for cleanup
            ln -sf "$BOT_RUNTIME_DIR/cleanup" "$PWD/cleanup-$BOT_ID"

            # Set up cleanup trap
            trap "bash '$BOT_RUNTIME_DIR/cleanup'" EXIT

            # Print bot information and available commands
            print_bot "Bot instance $BOT_ID ready"
            echo "  Display: :$BOT_DISPLAY"
            echo "  Runtime: $BOT_RUNTIME_DIR"
            echo "  Mode: Redis (non-serverless)"
            echo "  Audio:"
            echo "    - Speaker: virtual_speaker"
            echo "    - Microphone: virtual_mic"
            echo
            echo "Use ./bot-manager to control bots:"
            echo "  • ./bot-manager start <number>  - Start a bot (1-4)"
            echo "  • ./bot-manager stop <number>   - Stop a bot"
            echo "  • ./bot-manager stop-all       - Stop all bots"
            echo "  • ./bot-manager logs <number>   - Show bot logs"
            
            echo "=== Development Environment ==="
            echo "Node version: $(node --version)"
            echo "NPM version: $(npm --version)"
            echo "TypeScript version: $(tsc --version)"
            echo "VIPS version: $(vips --version)"
            echo "GLib version: $(pkg-config --modversion glib-2.0)"
            echo ""
            echo "TypeScript type definitions:"
            echo "  TypeScript lib: ${typescriptDir}/lib"
            echo "  Local types: $PWD/node_modules/@types"
            echo "  Playwright types: $PLAYWRIGHT_TYPES"
            echo ""
            echo "Sharp build environment:"
            echo "  Using system libvips: $(pkg-config --modversion vips)"
            echo "  Build from source: true"
            echo "  Force install: true"
            echo ""
            echo "To install dependencies, run: ./install-deps.sh"
            echo "============================"
          '';
        };

    in
    {
      packages = eachSystem (system: {
        default = nodejsPackage system;
      });

      devShells = eachSystem (system: {
        default = customShell system;
      });
    };
} 
