#!/usr/bin/env bash
# install-deps.sh: Main script to install all dependencies
# Usage: First run 'nix develop', then run './install-deps.sh'

set -euo pipefail

# Verify we're in a nix environment
if ! command -v node >/dev/null 2>&1; then
    echo "Error: Node.js not found. Please run 'nix develop' first."
    exit 1
fi

# Verify Node.js version
if [[ $(node --version) != v18* ]]; then
    echo "Error: Wrong Node.js version. Expected v18.x, got $(node --version)"
    echo "Please run 'nix develop' to get the correct environment."
    exit 1
fi

echo "=== Installing Server Dependencies ==="
./install-server-deps.sh || {
    echo "Server dependencies installation failed!"
    exit 1
}

#echo "=== Installing Chrome Extension Dependencies ==="
#./install-extension-deps.sh || {
#   echo "Chrome extension dependencies installation failed!"
#   exit 1
#}

echo "=== All Dependencies Installed Successfully ==="
echo "Server build: build/src/"
echo "Extension build: chrome_extension/dist/" 
