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

              # Clean up any existing X server
              cleanup_x

              echo "🖥️ Starting virtual display..."
              
              # Start Xvfb with output redirection
              Xvfb :99 -screen 0 1280x720x24 -ac +extension GLX +render -noreset > /tmp/xvfb.log 2>&1 & 
              XVFB_PID=$!
              
              # Wait for Xvfb to start
              sleep 2

              # Check if Xvfb started successfully
              if ! ps -p $XVFB_PID > /dev/null; then
                echo "❌ Failed to start Xvfb. Log output:"
                cat /tmp/xvfb.log
                cleanup_x
                return 1
              fi

              echo "✅ Virtual display started (PID: $XVFB_PID)"

              # Start window manager (important for Chrome extensions)
              echo "🪟 Starting window manager..."
              fluxbox > /tmp/fluxbox.log 2>&1 &
              FLUXBOX_PID=$!
              sleep 1

              echo "✅ Window manager started (PID: $FLUXBOX_PID)"

              # Debug environment variables before starting bot
              echo "🔍 Runtime environment check:"
              echo "  PLAYWRIGHT_BROWSERS_PATH: $PLAYWRIGHT_BROWSERS_PATH"
              echo "  PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS: $PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS"
              echo "  DISPLAY: $DISPLAY"
              echo ""

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

              # Cleanup
              echo "🧹 Cleaning up..."
              kill $FLUXBOX_PID 2>/dev/null || true
              cleanup_x
              rm -f /tmp/xvfb.log /tmp/fluxbox.log
            }

            function build() {
              echo "🔨 Building Meet Teams Bot..."
              
              echo "📦 Installing server dependencies..."
              cd recording_server
              rm -rf node_modules package-lock.json
              npm install --include=dev --legacy-peer-deps
              
              echo "🏗️ Building server..."
              npm run build
              
              echo "📦 Installing extension dependencies..."
              cd chrome_extension
              rm -rf node_modules package-lock.json
              npm install --include=dev --legacy-peer-deps
              
              echo "🏗️ Building extension..."
              npm run build
              cd ../..
              
              if [ ! -f "recording_server/build/src/main.js" ]; then
                echo "❌ Build failed - main.js not found"
                return 1
              fi
              
              echo "✅ Build complete"
            }

            function clean() {
              echo "🧹 Cleaning up..."
              cleanup_x
              rm -rf recordings/*
              rm -rf recording_server/node_modules
              rm -rf recording_server/chrome_extension/node_modules
              rm -rf recording_server/build
              rm -rf recording_server/chrome_extension/dist
              rm -f /tmp/xvfb.log /tmp/fluxbox.log
              echo "✅ Cleanup complete"
            }
          '';
        };
      }
    );
} 