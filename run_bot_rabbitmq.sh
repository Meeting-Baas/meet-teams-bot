#!/bin/bash

# Meet Teams Bot - RabbitMQ Consumer Mode
# This script starts the bot as a RabbitMQ consumer (non-serverless mode)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if Nix is available
check_nix() {
    if ! command -v nix-shell &> /dev/null; then
        print_error "Nix is not installed or not in PATH"
        print_info "Please install Nix: https://nixos.org/download.html"
        exit 1
    fi
}

# Setup environment and dependencies
setup_environment() {
    print_info "Setting up Nix environment and dependencies..."
    
    # Install dependencies if not already done
    if [ ! -d "recording_server/node_modules" ] || [ ! -d "recording_server/chrome_extension/node_modules" ]; then
        print_info "Installing dependencies..."
        nix-shell --run "npm install --prefix recording_server && npm install --prefix recording_server/chrome_extension"
    fi
    
    # Build if not already done or if source files are newer
    if [ ! -d "recording_server/build" ] || [ ! -d "recording_server/chrome_extension/dist" ] || \
       [ "recording_server/src" -nt "recording_server/build" ] || \
       [ "recording_server/chrome_extension/src" -nt "recording_server/chrome_extension/dist" ]; then
        print_info "Building projects..."
        nix-shell --run "npm run build --prefix recording_server && npm run build-dev --prefix recording_server/chrome_extension"
    fi
    
    print_success "Environment ready"
}

# Load environment variables
load_env() {
    if [ -f ".env" ]; then
        print_info "Loading environment variables from .env..."
        source .env
        
        # Validate required variables for RabbitMQ mode
        if [ -z "$AMQP_ADDRESS" ]; then
            print_error "AMQP_ADDRESS not found in .env file"
            exit 1
        fi
        
        if [ -z "$API_SERVER_BASEURL" ]; then
            print_error "API_SERVER_BASEURL not found in .env file"
            exit 1
        fi
        
        print_success "Environment variables loaded"
        print_info "RabbitMQ: $AMQP_ADDRESS"
        print_info "API Server: $API_SERVER_BASEURL"
        print_info "Node Name: ${NODE_NAME:-'worker_bot_queue'}"
        
    else
        print_error ".env file not found"
        print_info "Please create a .env file with RabbitMQ configuration"
        exit 1
    fi
}

# Start RabbitMQ consumer
start_consumer() {
    print_info "Starting Meet Teams Bot in RabbitMQ consumer mode..."
    print_info "The bot will wait for messages from the queue: ${NODE_NAME:-'worker_bot_queue'}"
    print_warning "Press Ctrl+C to stop the consumer"
    
    # Export all environment variables
    export SERVERLESS=false
    export AMQP_ADDRESS
    export API_SERVER_BASEURL
    export NODE_NAME
    export POD_IP
    export ENVIRON
    export AWS_S3_VIDEO_BUCKET
    export AWS_S3_TEMPORARY_AUDIO_BUCKET
    export AWS_LOCAL_ACCESS_KEY_ID
    export AWS_LOCAL_SECRET_ACCESS_KEY
    export REDIS_ADDRESS
    export REDIS_PORT
    export S3_BASEURL
    export S3_ARGS
    
    # Start the consumer
    nix-shell --run "cd recording_server && node build/src/main.js"
}

# Show help
show_help() {
    echo "Meet Teams Bot - RabbitMQ Consumer Mode"
    echo
    echo "Usage:"
    echo "  $0 setup     - Setup Nix environment and build dependencies"
    echo "  $0 start     - Start RabbitMQ consumer (waits for messages)"
    echo "  $0 help      - Show this help message"
    echo
    echo "Requirements:"
    echo "  • .env file with RabbitMQ configuration"
    echo "  • Running RabbitMQ server"
    echo "  • Running MeetingBaas backend"
    echo
    echo "The bot will consume messages from the RabbitMQ queue and start"
    echo "recording meetings based on the received parameters."
    echo
    echo "Expected .env variables:"
    echo "  AMQP_ADDRESS=amqp://localhost"
    echo "  API_SERVER_BASEURL=http://localhost:3001"
    echo "  NODE_NAME=test-bot-1"
}

# Main script logic
main() {
    case "${1:-}" in
        "setup")
            check_nix
            setup_environment
            ;;
        "start")
            check_nix
            setup_environment
            load_env
            start_consumer
            ;;
        "help"|"-h"|"--help"|"")
            show_help
            ;;
        *)
            print_error "Unknown command: $1"
            show_help
            exit 1
            ;;
    esac
}

main "$@" 