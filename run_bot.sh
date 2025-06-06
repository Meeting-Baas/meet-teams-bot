#!/bin/bash

# Meet Teams Bot - Serverless Runner
# This script provides an easy way to run the bot in serverless mode

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

# Generate UUID
generate_uuid() {
    if command -v uuidgen &> /dev/null; then
        uuidgen | tr '[:lower:]' '[:upper:]'
    elif command -v python3 &> /dev/null; then
        python3 -c "import uuid; print(str(uuid.uuid4()).upper())"
    elif command -v node &> /dev/null; then
        node -e "console.log(require('crypto').randomUUID().toUpperCase())"
    else
        # Fallback: generate a pseudo-UUID using date and random
        date +%s | sha256sum | head -c 8 | tr '[:lower:]' '[:upper:]'
        echo "-$(date +%N | head -c 4 | tr '[:lower:]' '[:upper:]')-$(date +%N | tail -c 4 | tr '[:lower:]' '[:upper:]')-$(shuf -i 1000-9999 -n 1)-$(shuf -i 100000000000-999999999999 -n 1)"
    fi
}

# Check if Docker and Docker Compose are available
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed or not in PATH"
        print_info "Please install Docker: https://docs.docker.com/get-docker/"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        print_error "Docker Compose is not available"
        print_info "Please install Docker Compose or use Docker with compose plugin"
        exit 1
    fi
}

# Build Docker image using Docker Compose
build_image() {
    print_info "Building Meet Teams Bot Docker image with optimized configuration..."
    
    # Use docker-compose if available, otherwise use docker compose
    if command -v docker-compose &> /dev/null; then
        docker-compose build --no-cache
    else
        docker compose build --no-cache
    fi
    
    print_success "Optimized Docker image built successfully"
    print_info "Configuration: 4 CPU cores, 7GB RAM, 6GB Node.js heap"
}

# Create output directory
create_output_dir() {
    local output_dir="./recordings"
    mkdir -p "$output_dir"
    echo "$output_dir"
}

# Process JSON configuration to add UUID if missing
process_config() {
    local config_json=$1
    local use_api_mode=$2
    local bot_uuid=$(generate_uuid)
    
    print_info "Generated new bot_uuid: $bot_uuid" >&2
    
    # Load environment variables from .env file only if needed for API mode
    if [ "$use_api_mode" = "true" ]; then
        if [ -f ".env" ]; then
            source .env
            if [ -z "$API_SERVER_BASEURL" ]; then
                print_error "API_SERVER_BASEURL not found in .env file (required for API mode)"
                exit 1
            fi
        else
            print_error ".env file not found (required for API mode)"
            print_info "Please create a .env file with:"
            print_info "API_SERVER_BASEURL=your_api_url"
            print_info "Or run in serverless mode (default) which doesn't require these"
            exit 1
        fi
    fi
    
    # Check if bot_uuid already exists in the config
    if echo "$config_json" | grep -q '"bot_uuid"[[:space:]]*:[[:space:]]*"[^"]*"'; then
        # Replace existing bot_uuid
        print_info "Replacing existing bot_uuid with new one" >&2
        local result=$(echo "$config_json" | sed 's/"bot_uuid"[[:space:]]*:[[:space:]]*"[^"]*"/"bot_uuid": "'$bot_uuid'"/g')
        echo "$result"
    else
        # Add new bot_uuid to JSON
        print_info "Adding new bot_uuid to configuration" >&2
        local clean_json=$(echo "$config_json" | tr -d '\n' | sed 's/[[:space:]]*$//')
        # Remove the last } and add our field with proper formatting
        local result=$(echo "$clean_json" | sed 's/\(.*\)}$/\1, "bot_uuid": "'$bot_uuid'"}/')
        echo "$result"
    fi
}

# Run bot with configuration file
run_with_config() {
    local config_file=$1
    local override_meeting_url=$2
    local use_api_mode=$3
    
    if [ ! -f "$config_file" ]; then
        print_error "Configuration file '$config_file' not found"
        print_info "Please create a JSON configuration file. See params.json for example format."
        exit 1
    fi
    
    local output_dir=$(create_output_dir)
    local config_json=$(cat "$config_file")
    
    # Override meeting URL if provided as argument
    if [ -n "$override_meeting_url" ]; then
        print_info "Overriding meeting URL with: $override_meeting_url"
        # Use jq if available, otherwise use sed
        if command -v jq &> /dev/null; then
            config_json=$(echo "$config_json" | jq --arg url "$override_meeting_url" '.meeting_url = $url')
        else
            # Fallback to sed for simple replacement
            config_json=$(echo "$config_json" | sed "s|\"meeting_url\"[[:space:]]*:[[:space:]]*\"[^\"]*\"|\"meeting_url\": \"$override_meeting_url\"|g")
        fi
    fi
    
    local processed_config=$(process_config "$config_json" "$use_api_mode")
    
    print_info "Running Meet Teams Bot with optimized configuration: $config_file"
    if [ -n "$override_meeting_url" ]; then
        print_info "Meeting URL: $override_meeting_url"
    fi
    print_info "Output directory: $output_dir"
    print_info "Performance: 4 CPU cores, 7GB RAM (Docker Compose)"
    
    if [ "$use_api_mode" = "true" ]; then
        print_info "Mode: API (with MeetingBaas backend)"
    else
        print_info "Mode: Serverless (standalone)"
    fi
    
    # Debug: Show what we're sending to Docker (first 200 chars)
    local preview=$(echo "$processed_config" | head -c 200)
    print_info "Config preview: ${preview}..."
    
    # Validate JSON is not empty
    if [ -z "$processed_config" ] || [ "$processed_config" = "{}" ]; then
        print_error "Processed configuration is empty or invalid"
        print_info "Original config: $config_json"
        exit 1
    fi
    
    # Set environment variables for Docker
    if [ "$use_api_mode" = "true" ]; then
        export SERVERLESS=false
        export API_SERVER_BASEURL
    else
        export SERVERLESS=true
    fi
    
    # Run using Docker Compose with optimized configuration
    if command -v docker-compose &> /dev/null; then
        echo "$processed_config" | docker-compose run --rm -T meet-teams-bot
    else
        echo "$processed_config" | docker compose run --rm -T meet-teams-bot
    fi
    
    print_success "Bot execution completed"
    print_info "Recordings saved to: $output_dir"
    
    # List generated files
    if [ -d "$output_dir" ] && [ "$(ls -A $output_dir)" ]; then
        print_success "Generated files:"
        find "$output_dir" -type f -name "*.mp4" -o -name "*.wav" | while read -r file; do
            size=$(du -h "$file" | cut -f1)
            echo -e "  ${GREEN}📁 $file${NC} (${size})"
        done
    fi
}

# Run bot with JSON input
run_with_json() {
    local json_input=$1
    local use_api_mode=$2
    local output_dir=$(create_output_dir)
    local processed_config=$(process_config "$json_input" "$use_api_mode")
    
    print_info "Running Meet Teams Bot with optimized JSON configuration"
    print_info "Output directory: $output_dir"
    print_info "Performance: 4 CPU cores, 7GB RAM (Docker Compose)"
    
    if [ "$use_api_mode" = "true" ]; then
        print_info "Mode: API (with MeetingBaas backend)"
    else
        print_info "Mode: Serverless (standalone)"
    fi
    
    # Debug: Show what we're sending to Docker (first 200 chars)
    local preview=$(echo "$processed_config" | head -c 200)
    print_info "Config preview: ${preview}..."
    
    # Validate JSON is not empty
    if [ -z "$processed_config" ] || [ "$processed_config" = "{}" ]; then
        print_error "Processed configuration is empty or invalid"
        print_info "Original config: $json_input"
        exit 1
    fi
    
    # Set environment variables for Docker
    if [ "$use_api_mode" = "true" ]; then
        export SERVERLESS=false
        export API_SERVER_BASEURL
    else
        export SERVERLESS=true
    fi
    
    # Run using Docker Compose with optimized configuration
    if command -v docker-compose &> /dev/null; then
        echo "$processed_config" | docker-compose run --rm -T meet-teams-bot
    else
        echo "$processed_config" | docker compose run --rm -T meet-teams-bot
    fi
    
    print_success "Bot execution completed"
    print_info "Recordings saved to: $output_dir"
    
    # List generated files
    if [ -d "$output_dir" ] && [ "$(ls -A $output_dir)" ]; then
        print_success "Generated files:"
        find "$output_dir" -type f -name "*.mp4" -o -name "*.wav" | while read -r file; do
            size=$(du -h "$file" | cut -f1)
            echo -e "  ${GREEN}📁 $file${NC} (${size})"
        done
    fi
}

# Complete cleanup: Docker containers, images, volumes, cache, and files
clean() {
    print_warning "This will perform a COMPLETE cleanup:"
    echo "  • Stop and remove all meet-teams-bot containers"
    echo "  • Remove meet-teams-bot Docker images"
    echo "  • Remove unused Docker volumes and networks"
    echo "  • Clean Docker cache and build cache"
    echo "  • Delete all recordings and temporary files"
    echo
    read -p "Are you sure you want to continue? (y/N): " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Operation cancelled"
        return
    fi
    
    print_info "Starting complete cleanup..."
    
    # 1. Stop and remove containers
    print_info "Stopping and removing meet-teams-bot containers..."
    if command -v docker-compose &> /dev/null; then
        docker-compose down --remove-orphans 2>/dev/null || true
    else
        docker compose down --remove-orphans 2>/dev/null || true
    fi
    
    # Remove any remaining containers
    docker ps -a --filter "ancestor=meet-teams-bot" --format "{{.ID}}" | xargs -r docker rm -f 2>/dev/null || true
    docker ps -a --filter "name=meet-teams-bot" --format "{{.ID}}" | xargs -r docker rm -f 2>/dev/null || true
    
    # 2. Remove images
    print_info "Removing meet-teams-bot Docker images..."
    docker images "meet-teams-bot" --format "{{.ID}}" | xargs -r docker rmi -f 2>/dev/null || true
    
    # 3. Clean Docker system
    print_info "Cleaning Docker system (unused containers, networks, images)..."
    docker system prune -f 2>/dev/null || true
    
    # 4. Clean Docker build cache
    print_info "Cleaning Docker build cache..."
    docker builder prune -f 2>/dev/null || true
    
    # 5. Remove unused volumes
    print_info "Removing unused Docker volumes..."
    docker volume prune -f 2>/dev/null || true
    
    # 6. Clean recordings directory
    print_info "Cleaning recordings directory..."
    local output_dir="./recordings"
    if [ -d "$output_dir" ]; then
        rm -rf "$output_dir"/*
        print_success "Recordings directory cleaned"
    fi
    
    # 7. Clean temporary files
    print_info "Cleaning temporary files..."
    find . -name "*.tmp" -type f -delete 2>/dev/null || true
    find . -name ".DS_Store" -type f -delete 2>/dev/null || true
    find . -name "Thumbs.db" -type f -delete 2>/dev/null || true
    
    # 8. Clean any leftover Chrome profiles or browser data
    print_info "Cleaning browser temporary data..."
    find . -path "**/chrome-*" -type d -exec rm -rf {} + 2>/dev/null || true
    find . -path "**/tmp-*" -type d -exec rm -rf {} + 2>/dev/null || true
    
    print_success "Complete cleanup finished!"
    print_info "Summary:"
    echo "  ✅ Docker containers stopped and removed"
    echo "  ✅ Docker images cleaned"
    echo "  ✅ Docker cache and volumes pruned"
    echo "  ✅ Recordings directory cleaned"
    echo "  ✅ Temporary files removed"
    echo
    print_info "You can now run './run_bot.sh build' to rebuild the optimized image"
}

# Show help
show_help() {
    echo "Meet Teams Bot - Optimized Serverless Runner"
    echo
    echo "Usage:"
    echo "  $0 build                          - Build optimized Docker image (Docker Compose)"
    echo "  $0 run <config_file> [url]        - Run bot with configuration file (optional meeting URL override)"
    echo "  $0 run-json '<json>'              - Run bot with JSON configuration"
    echo "  $0 run-api <config_file> [url]    - Run bot in API mode with configuration file"
    echo "  $0 run-api-json '<json>'          - Run bot in API mode with JSON configuration"
    echo "  $0 clean                          - Complete cleanup (Docker + files)"
    echo "  $0 help                           - Show this help message"
    echo
    echo "Examples:"
    echo "  $0 build"
    echo "  $0 run params.json"
    echo "  $0 run params.json 'https://meet.google.com/new-meeting-url'"
    echo "  $0 run-json '{\"meeting_url\":\"https://meet.google.com/abc-def-ghi\", \"bot_name\":\"RecordingBot\"}'"
    echo "  $0 clean"
    echo
    echo "Modes:"
    echo "  • Serverless (default): Standalone operation, saves files locally"
    echo "  • API mode: Connects to MeetingBaas backend, requires authentication"
    echo
    echo "Performance Optimizations (Built-in):"
    echo "  • 4 CPU cores limit for optimal performance"
    echo "  • 7GB RAM allocation for video processing"
    echo "  • 6GB Node.js heap size (optimized)"
    echo "  • Docker Compose with resource management"
    echo "  • Serverless mode enabled by default"
    echo
    echo "Features:"
    echo "  • Automatically generates bot_uuid if not provided"
    echo "  • Override meeting URL by passing it as last argument"
    echo "  • Saves recordings to ./recordings directory"
    echo "  • Lists generated files after completion"
    echo "  • Performance monitoring and resource limits"
    echo
    echo "Clean Command:"
    echo "  The 'clean' command performs a complete cleanup:"
    echo "  • Stops and removes all meet-teams-bot containers"
    echo "  • Removes meet-teams-bot Docker images"
    echo "  • Cleans Docker cache, volumes, and networks"
    echo "  • Deletes all recordings and temporary files"
    echo "  • Removes browser temporary data"
    echo
    echo "Configuration file should contain JSON with meeting parameters."
    echo "See params.json for example format."
    echo
    echo "For API mode, create a .env file with:"
    echo "  API_SERVER_BASEURL=https://api.meeting-baas.com"
}

# Main script logic
main() {
    case "${1:-}" in
        "build")
            check_docker
            build_image
            ;;
        "run")
            if [ -z "${2:-}" ]; then
                print_error "Please specify a configuration file"
                print_info "Usage: $0 run <config_file> [meeting_url]"
                exit 1
            fi
            check_docker
            run_with_config "$2" "$3" "false"
            ;;
        "run-api")
            if [ -z "${2:-}" ]; then
                print_error "Please specify a configuration file"
                print_info "Usage: $0 run-api <config_file> [meeting_url]"
                exit 1
            fi
            check_docker
            run_with_config "$2" "$3" "true"
            ;;
        "run-json")
            if [ -z "${2:-}" ]; then
                print_error "Please provide JSON configuration"
                print_info "Usage: $0 run-json '<json_config>'"
                exit 1
            fi
            check_docker
            run_with_json "$2" "false"
            ;;
        "run-api-json")
            if [ -z "${2:-}" ]; then
                print_error "Please provide JSON configuration"
                print_info "Usage: $0 run-api-json '<json_config>'"
                exit 1
            fi
            check_docker
            run_with_json "$2" "true"
            ;;
        "clean")
            check_docker
            clean
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