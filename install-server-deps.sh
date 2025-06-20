#!/usr/bin/env bash
# install-server-deps.sh: Install server dependencies
# Usage: Run from install-deps.sh

set -euo pipefail

# Verify TypeScript environment
if [ -z "${TYPESCRIPT_TYPES_ROOT:-}" ]; then
    echo "Error: TYPESCRIPT_TYPES_ROOT not set in environment"
    echo "Please ensure you're running in the correct nix environment"
    exit 1
fi

# Verify Node.js version
NODE_VERSION=$(node --version)
if [[ "$NODE_VERSION" != "v18.20.8" ]]; then
    echo "Error: Wrong Node.js version. Expected v18.20.8, got $NODE_VERSION"
    echo "Please run 'nix develop' to get the correct environment."
    exit 1
fi

echo "Cleaning server dependencies..."
rm -rf node_modules/
rm -f package.json package-lock.json

# Install type definitions globally
echo "Installing type definitions globally..."
npm install -g --ignore-scripts @types/node@18.19.3 @types/jest@29.5.12 || {
    echo "Failed to install type definitions globally!"
    exit 1
}

# Get the global node_modules path
GLOBAL_NODE_MODULES=$(npm root -g)
echo "Global node_modules path: $GLOBAL_NODE_MODULES"

# Verify global type definitions
if [ ! -d "$GLOBAL_NODE_MODULES/@types/node" ]; then
    echo "Error: @types/node not found in global node_modules"
    echo "Contents of global @types:"
    ls -la "$GLOBAL_NODE_MODULES/@types" || true
    exit 1
fi

if [ ! -d "$GLOBAL_NODE_MODULES/@types/jest" ]; then
    echo "Error: @types/jest not found in global node_modules"
    echo "Contents of global @types:"
    ls -la "$GLOBAL_NODE_MODULES/@types" || true
    exit 1
fi

# Now create the full package.json with all dependencies
echo "Creating full package.json..."
cat > package.json <<EOF
{
  "name": "meet-teams-bot",
  "version": "1.0.0",
  "private": true,
  "devDependencies": {
    "@types/amqplib": "^0.10.1",
    "@types/async": "^3.2.24",
    "@types/body-parser": "^1.19.0",
    "@types/express": "^4.17.11",
    "@types/jest": "^29.5.14",
    "@types/jsdom": "^21.1.6",
    "@types/node": "~14.14.45",
    "@types/ramda": "0.29.1",
    "@types/redis": "^4.0.10",
    "@types/sharp": "^0.31.1",
    "@types/wav-encoder": "1.3.3",
    "@types/ws": "8.5.12",
    "prettier": "3.3.3",
    "rimraf": "~3.0.2",
    "ts-jest": "^29.2.5",
    "ts-node": "^10.9.2",
    "ts-node-dev": "^2.0.0",
    "typescript": "^5.4"
  },
  "dependencies": {
    "@playwright/test": "1.50.1",
    "playwright": "1.50.1",
    "amqplib": "^0.10.3",
    "async": "^3.2.6",
    "axios": "0.21.1",
    "express": "4.17.1",
    "fs": "^0.0.1-security",
    "jsdom": "24.0.0",
    "node": "16.14.0",
    "node-fetch": "^2.7.0",
    "path": "^0.12.7",
    "ramda": "0.29.1",
    "redis": "4.6.7",
    "retry-axios": "^2.5.0",
    "tesseract.js": "^6.0.0",
    "tslib": "^2.8.1",
    "wav-encoder": "1.3.0",
    "winston": "^3.17.0",
    "ws": "8.18.0"
  }
}
EOF

# Create .npmrc to set Node.js options globally
cat > .npmrc <<EOF
node-options=--experimental-modules
EOF

echo "Installing remaining dependencies..."
npm install --no-package-lock --legacy-peer-deps || {
    echo "Failed to install remaining dependencies!"
    exit 1
}

echo "Setting up TypeScript configuration..."
# Get the TypeScript lib directory from the environment
TYPESCRIPT_LIB_DIR="${TYPESCRIPT_TYPES_ROOT%%:*}/lib"
PLAYWRIGHT_TYPES="${PLAYWRIGHT_TYPES%/types}"

# Create tsconfig.json with both local and global type roots
cat > tsconfig.json <<EOF
{
  "compilerOptions": {
    "target": "esnext",
    "module": "commonjs",
    "moduleResolution": "node",
    "allowSyntheticDefaultImports": true,
    "allowJs": true,
    "importHelpers": true,
    "jsx": "react",
    "strict": true,
    "sourceMap": true,
    "forceConsistentCasingInFileNames": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitReturns": true,
    "noImplicitAny": false,
    "noImplicitThis": false,
    "resolveJsonModule": true,
    "strictNullChecks": false,
    "esModuleInterop": true,
    "types": ["node", "jest"],
    "outDir": "./build",
    "skipLibCheck": true,
    "typeRoots": [
      "$TYPESCRIPT_LIB_DIR",
      "$PWD/node_modules/@types",
      "$GLOBAL_NODE_MODULES/@types"
    ],
    "paths": {
      "@playwright/test": ["${PLAYWRIGHT_TYPES}"]
    },
    "baseUrl": "."
  },
  "include": [
    "src/**/*",
    "__tests__/**/*",
    "jest.config.js",
    "jest.setup.ts"
  ],
  "exclude": ["node_modules"]
}
EOF

# Create tsconfig.release.json
cat > tsconfig.release.json <<EOF
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "build",
    "removeComments": true,
    "resolveJsonModule": true,
    "typeRoots": [
      "$TYPESCRIPT_LIB_DIR",
      "$PWD/node_modules/@types",
      "$GLOBAL_NODE_MODULES/@types"
    ],
    "paths": {
      "@playwright/test": ["${PLAYWRIGHT_TYPES}"]
    },
    "baseUrl": "."
  },
  "include": [
    "src/**/*"
  ]
}
EOF

# Verify Playwright types
if [ -z "$PLAYWRIGHT_TYPES" ]; then
    echo "Warning: PLAYWRIGHT_TYPES environment variable not set"
    echo "Make sure you're running in the nix environment with 'nix develop'"
    exit 1
fi

if [ ! -f "$PLAYWRIGHT_TYPES/index.d.ts" ]; then
    echo "Error: Playwright types not found at $PLAYWRIGHT_TYPES/index.d.ts"
    echo "Make sure you're running in the nix environment with 'nix develop'"
    exit 1
fi

echo "Building sharp..."
rm -rf node_modules/sharp
npm install sharp@0.34.1 --ignore-scripts || {
    echo "sharp install failed!"
    exit 1
}

cd node_modules/sharp
if [ ! -f binding.gyp ]; then
    echo "Error: binding.gyp not found in sharp directory"
    exit 1
fi

# Use the environment variables set by nix
echo "Using node-gyp from: $npm_config_node_gyp"
echo "Using python from: $npm_config_python"

# Build sharp with explicit include paths and library paths
CXXFLAGS="$(pkg-config --cflags glib-2.0 vips)" \
LDFLAGS="$(pkg-config --libs glib-2.0 vips)" \
LD_LIBRARY_PATH="${LD_LIBRARY_PATH:-}" \
node-gyp rebuild || {
    echo "sharp build failed!"
    echo "Environment:"
    echo "  LD_LIBRARY_PATH: $LD_LIBRARY_PATH"
    echo "  LIBRARY_PATH: $LIBRARY_PATH"
    echo "  CPATH: $CPATH"
    echo "  CXXFLAGS: $(pkg-config --cflags glib-2.0 vips)"
    echo "  LDFLAGS: $(pkg-config --libs glib-2.0 vips)"
    exit 1
}
cd ../..

echo "Building server..."
echo "{\"buildDate\": \"$(date -u +'%Y-%m-%dT%H:%M:%SZ')\"}" > src/buildInfo.json
tsc --skipLibCheck -p tsconfig.release.json || {
    echo "Server build failed!"
    echo "TypeScript configuration:"
    cat tsconfig.release.json
    echo "Global type definitions:"
    ls -la "$GLOBAL_NODE_MODULES/@types/node" || true
    ls -la "$GLOBAL_NODE_MODULES/@types/jest" || true
    exit 1
}

# Create a wrapper script to run the server with experimental modules
cat > run-server.sh <<EOF
#!/bin/bash
NODE_OPTIONS="--experimental-modules" node build/src/main.js "\$@"
EOF
chmod +x run-server.sh

echo "Server dependencies installed and built successfully" 