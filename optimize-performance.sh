#!/bin/bash

# Meet Teams Bot - Performance Optimization Script
# This script helps optimize performance by adjusting resources and monitoring system load

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

# Check system resources
check_system_resources() {
    print_info "Checking system resources..."
    
    # Get CPU cores (compatible with macOS and Linux)
    if command -v nproc &> /dev/null; then
        CPU_CORES=$(nproc)
    elif command -v sysctl &> /dev/null; then
        CPU_CORES=$(sysctl -n hw.ncpu)
    else
        CPU_CORES=4  # Default fallback
    fi
    
    # Get memory (compatible with macOS and Linux)
    if command -v free &> /dev/null; then
        MEMORY_GB=$(free -g | awk 'NR==2{printf "%.1f", $2}')
    elif command -v sysctl &> /dev/null; then
        MEMORY_BYTES=$(sysctl -n hw.memsize)
        MEMORY_GB=$(echo "scale=1; $MEMORY_BYTES / 1024 / 1024 / 1024" | bc)
    else
        MEMORY_GB=8.0  # Default fallback
    fi
    
    # Get load average (compatible with macOS and Linux)
    if command -v uptime &> /dev/null; then
        LOAD_AVG=$(uptime | awk '{print $(NF-2)}' | sed 's/,//')
    else
        LOAD_AVG=0.5  # Default fallback
    fi
    
    print_info "System Info:"
    print_info "  CPU Cores: $CPU_CORES"
    print_info "  Memory: ${MEMORY_GB}GB"
    print_info "  Load Average (1min): $LOAD_AVG"
    print_info "  OS: $(uname -s)"
    
    # Calculate optimal settings
    calculate_optimal_settings
}

# Calculate optimal settings based on system resources
calculate_optimal_settings() {
    print_info "Calculating optimal settings..."
    
    # FFmpeg threads (use 1/2 of available cores, min 1, max 4)
    OPTIMAL_THREADS=$(echo "scale=0; $CPU_CORES / 2" | bc)
    if [ $OPTIMAL_THREADS -lt 1 ]; then
        OPTIMAL_THREADS=1
    elif [ $OPTIMAL_THREADS -gt 4 ]; then
        OPTIMAL_THREADS=4
    fi
    
    # Node.js memory (use 70% of available memory, min 2GB, max 8GB)
    OPTIMAL_MEMORY=$(echo "scale=0; $MEMORY_GB * 0.7 * 1024" | bc)
    OPTIMAL_MEMORY=${OPTIMAL_MEMORY%.*}  # Remove decimal part if any
    if [ $OPTIMAL_MEMORY -lt 2048 ]; then
        OPTIMAL_MEMORY=2048
    elif [ $OPTIMAL_MEMORY -gt 8192 ]; then
        OPTIMAL_MEMORY=8192
    fi
    
    # Choose preset based on load
    if (( $(echo "$LOAD_AVG > $CPU_CORES" | bc -l) )); then
        OPTIMAL_PRESET="ultrafast"
        print_warning "High system load detected, using ultrafast preset"
    elif (( $(echo "$LOAD_AVG > $(echo "$CPU_CORES * 0.7" | bc)" | bc -l) )); then
        OPTIMAL_PRESET="faster"
        print_info "Medium system load, using faster preset"
    else
        OPTIMAL_PRESET="medium"
        print_success "Low system load, using medium preset for better quality"
    fi
    
    print_success "Optimal settings calculated:"
    print_success "  FFmpeg: Original configuration preserved (no modifications)"
    print_success "  Node.js Memory: ${OPTIMAL_MEMORY}MB"
    print_success "  Container CPU Limit: $OPTIMAL_THREADS cores"
    
    # Export environment variables (Node.js only, FFmpeg untouched)
    export NODE_OPTIONS="--max-old-space-size=$OPTIMAL_MEMORY"
}

# Apply Docker optimizations
apply_docker_optimizations() {
    print_info "Configuring Docker optimization parameters..."
    
    # Set resource limits for Docker
    DOCKER_MEMORY_LIMIT="${OPTIMAL_MEMORY}m"
    DOCKER_CPU_LIMIT="$OPTIMAL_THREADS.0"
    
    # Display optimal Docker run parameters
    print_success "Optimal Docker parameters calculated:"
    print_success "  CPU Limit: ${DOCKER_CPU_LIMIT} cores"
    print_success "  Memory Limit: ${DOCKER_MEMORY_LIMIT}"
    print_success "  Node.js Heap: ${OPTIMAL_MEMORY}MB"
    
    # Export environment variables for next Docker run
    export DOCKER_MEMORY_LIMIT
    export DOCKER_CPU_LIMIT
    export NODE_OPTIONS="--max-old-space-size=$OPTIMAL_MEMORY"
    export UV_THREADPOOL_SIZE=4
    
    print_info "Environment variables configured for next bot execution"
    print_info "Use: ./run_bot.sh run params.json (with optimized parameters)"
}

# Monitor performance
monitor_performance() {
    print_info "Monitoring performance (Press Ctrl+C to stop)..."
    
    while true; do
        clear
        echo "=== Meet Teams Bot Performance Monitor ==="
        echo "Time: $(date)"
        echo "OS: $(uname -s)"
        echo
        
        # CPU usage (compatible with macOS and Linux)
        if command -v top &> /dev/null; then
            if [[ "$OSTYPE" == "darwin"* ]]; then
                # macOS version
                CPU_USAGE=$(top -l 1 -n 0 | grep "CPU usage" | awk '{print $3}' | sed 's/%//')
            else
                # Linux version
                CPU_USAGE=$(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1}')
            fi
        else
            CPU_USAGE="N/A"
        fi
        echo "CPU Usage: ${CPU_USAGE}%"
        
        # Memory usage (compatible with macOS and Linux)
        if command -v free &> /dev/null; then
            # Linux version
            MEMORY_USAGE=$(free | grep Mem | awk '{printf("%.1f"), $3/$2 * 100.0}')
        elif command -v vm_stat &> /dev/null; then
            # macOS version
            VM_STAT=$(vm_stat)
            PAGE_SIZE=$(vm_stat | head -1 | awk '{print $8}')
            PAGES_FREE=$(echo "$VM_STAT" | grep "Pages free" | awk '{print $3}' | sed 's/\.//')
            PAGES_ACTIVE=$(echo "$VM_STAT" | grep "Pages active" | awk '{print $3}' | sed 's/\.//')
            PAGES_INACTIVE=$(echo "$VM_STAT" | grep "Pages inactive" | awk '{print $3}' | sed 's/\.//')
            PAGES_WIRED=$(echo "$VM_STAT" | grep "Pages wired down" | awk '{print $4}' | sed 's/\.//')
            
            TOTAL_PAGES=$((PAGES_FREE + PAGES_ACTIVE + PAGES_INACTIVE + PAGES_WIRED))
            USED_PAGES=$((PAGES_ACTIVE + PAGES_INACTIVE + PAGES_WIRED))
            
            if [ $TOTAL_PAGES -gt 0 ]; then
                MEMORY_USAGE=$(echo "scale=1; $USED_PAGES * 100 / $TOTAL_PAGES" | bc)
            else
                MEMORY_USAGE="N/A"
            fi
        else
            MEMORY_USAGE="N/A"
        fi
        echo "Memory Usage: ${MEMORY_USAGE}%"
        
        # Load average
        if command -v uptime &> /dev/null; then
            if [[ "$OSTYPE" == "darwin"* ]]; then
                LOAD_AVG=$(uptime | awk '{print $10" "$11" "$12}')
            else
                LOAD_AVG=$(uptime | awk '{print $(NF-2)" "$(NF-1)" "$NF}')
            fi
        else
            LOAD_AVG="N/A"
        fi
        echo "Load Average: $LOAD_AVG"
        
        # Docker container stats if running
        if command -v docker &> /dev/null && docker ps | grep -q meet-teams-bot; then
            echo
            echo "Docker Container Stats:"
            docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}" | grep meet-teams-bot || echo "No container running"
        fi
        
        # Check for issues (only if we have numeric values)
        if [[ "$CPU_USAGE" =~ ^[0-9]+\.?[0-9]*$ ]] && (( $(echo "$CPU_USAGE > 80" | bc -l) )); then
            print_warning "High CPU usage detected!"
        fi
        
        if [[ "$MEMORY_USAGE" =~ ^[0-9]+\.?[0-9]*$ ]] && (( $(echo "$MEMORY_USAGE > 85" | bc -l) )); then
            print_warning "High memory usage detected!"
        fi
        
        echo
        echo "Press Ctrl+C to stop monitoring"
        sleep 5
    done
}

# Clean up resources
cleanup_resources() {
    print_info "Cleaning up resources..."
    
    # Clean Docker system
    docker system prune -f > /dev/null 2>&1 || true
    
    # Clean build artifacts
    if [ -d "recording_server/build" ]; then
        rm -rf recording_server/build
    fi
    
    # Clean node_modules if needed
    if [ "$1" = "--deep" ]; then
        print_warning "Deep cleanup: removing node_modules..."
        find . -name "node_modules" -type d -exec rm -rf {} + 2>/dev/null || true
    fi
    
    print_success "Cleanup completed"
}

# Optimize existing containers
optimize_running_containers() {
    print_info "Optimizing running containers..."
    
    # Set CPU limits for running containers
    for container in $(docker ps --format "{{.Names}}" | grep meet-teams-bot); do
        print_info "Optimizing container: $container"
        
        # Update container with resource limits
        docker update --cpus="$OPTIMAL_THREADS" --memory="${OPTIMAL_MEMORY}m" "$container" 2>/dev/null || print_warning "Could not update container limits"
    done
    
    print_success "Container optimization completed"
}

# Show help
show_help() {
    echo "Meet Teams Bot - Performance Optimization Tool"
    echo
    echo "Usage:"
    echo "  $0 check          - Check system resources and calculate optimal settings"
    echo "  $0 optimize       - Apply optimizations based on current system"
    echo "  $0 monitor        - Monitor system performance in real-time"
    echo "  $0 cleanup        - Clean up Docker and build artifacts"
    echo "  $0 cleanup --deep - Deep cleanup including node_modules"
    echo "  $0 docker         - Configure Docker optimization parameters"
    echo "  $0 containers     - Optimize running containers"
    echo "  $0 help           - Show this help message"
    echo
    echo "Examples:"
    echo "  $0 check && $0 optimize"
    echo "  $0 monitor"
    echo "  $0 cleanup --deep"
}

# Main script logic
main() {
    case "${1:-}" in
        "check")
            check_system_resources
            ;;
        "optimize")
            check_system_resources
            optimize_running_containers
            print_success "System analyzed and running containers optimized!"
            print_info "Note: Default optimizations (4 CPU, 7GB RAM) are built into docker-compose.yml"
            ;;
        "monitor")
            monitor_performance
            ;;
        "cleanup")
            cleanup_resources "$2"
            ;;
        "docker")
            check_system_resources
            print_info "Docker optimizations are built into docker-compose.yml"
            print_success "Default configuration: 4 CPU cores, 7GB RAM, 6GB Node.js heap"
            ;;
        "containers")
            check_system_resources
            optimize_running_containers
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

# Ensure bc is available for calculations
if ! command -v bc &> /dev/null; then
    print_error "bc (calculator) is required but not installed"
    print_info "Install with: apt-get install bc (Ubuntu/Debian) or brew install bc (macOS)"
    exit 1
fi

main "$@" 