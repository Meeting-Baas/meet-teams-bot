#!/bin/bash

# System Performance Profiler for Meet Teams Bot
# Usage: ./system-profiler.sh <container_id>

CONTAINER_ID=${1:-"7b379efacca9"}
MONITOR_DURATION=${2:-60}

echo "🔍 === SYSTEM PERFORMANCE PROFILER ==="
echo "📋 Container: $CONTAINER_ID"
echo "⏱️  Duration: ${MONITOR_DURATION}s"
echo "🎯 Goal: Identify CPU performance bottlenecks"
echo ""

# Function to get timestamp
timestamp() {
    date +"%H:%M:%S"
}

# Function to analyze container processes
analyze_processes() {
    echo "📊 === PROCESS ANALYSIS $(timestamp) ==="
    
    # Get detailed process info from container
    docker exec $CONTAINER_ID ps aux --sort=-%cpu | head -20
    echo ""
    
    # Count total processes
    TOTAL_PROCESSES=$(docker exec $CONTAINER_ID ps aux | wc -l)
    echo "📈 Total processes: $TOTAL_PROCESSES"
    echo ""
    
    # Show top CPU consumers
    echo "🔥 TOP CPU CONSUMERS:"
    docker exec $CONTAINER_ID ps aux --sort=-%cpu | head -10 | awk 'NR>1 {printf "%-15s %6s%% %10s %s\n", $1, $3, $4, $11}'
    echo ""
}

# Function to analyze specific components
analyze_components() {
    echo "🧩 === COMPONENT ANALYSIS $(timestamp) ==="
    
    # Node.js processes
    echo "🟢 Node.js processes:"
    docker exec $CONTAINER_ID ps aux | grep node | grep -v grep || echo "No Node.js processes found"
    echo ""
    
    # FFmpeg processes  
    echo "🎬 FFmpeg processes:"
    docker exec $CONTAINER_ID ps aux | grep ffmpeg | grep -v grep || echo "No FFmpeg processes found"
    echo ""
    
    # Chrome/Chromium processes
    echo "🌐 Chrome/Chromium processes:"
    docker exec $CONTAINER_ID ps aux | grep -E "(chrome|chromium)" | grep -v grep | wc -l | xargs echo "Chrome processes count:"
    docker exec $CONTAINER_ID ps aux | grep -E "(chrome|chromium)" | grep -v grep | head -5
    echo ""
    
    # Playwright processes
    echo "🎭 Playwright processes:"
    docker exec $CONTAINER_ID ps aux | grep playwright | grep -v grep || echo "No Playwright processes found"
    echo ""
}

# Function to analyze threads
analyze_threads() {
    echo "🧵 === THREAD ANALYSIS $(timestamp) ==="
    
    # Show thread count per process
    echo "Thread counts by process:"
    docker exec $CONTAINER_ID find /proc -name "status" -exec grep -l "Name:" {} \; 2>/dev/null | \
    head -20 | while read status_file; do
        if [ -r "$status_file" ]; then
            name=$(docker exec $CONTAINER_ID grep "Name:" "$status_file" 2>/dev/null | cut -f2)
            threads=$(docker exec $CONTAINER_ID grep "Threads:" "$status_file" 2>/dev/null | cut -f2)
            if [ ! -z "$name" ] && [ ! -z "$threads" ]; then
                echo "$name: $threads threads"
            fi
        fi
    done 2>/dev/null | sort -k2 -nr | head -10
    echo ""
}

# Function to analyze I/O
analyze_io() {
    echo "💾 === I/O ANALYSIS $(timestamp) ==="
    
    # Network I/O
    echo "🌐 Network interfaces:"
    docker exec $CONTAINER_ID cat /proc/net/dev | head -5
    echo ""
    
    # Disk usage
    echo "💿 Disk usage:"
    docker exec $CONTAINER_ID df -h | head -5
    echo ""
}

# Function to analyze memory
analyze_memory() {
    echo "🧠 === MEMORY ANALYSIS $(timestamp) ==="
    
    # Memory info
    docker exec $CONTAINER_ID cat /proc/meminfo | head -10
    echo ""
    
    # Top memory consumers
    echo "🔝 Top memory consumers:"
    docker exec $CONTAINER_ID ps aux --sort=-%mem | head -10 | awk 'NR>1 {printf "%-15s %6s%% %10s %s\n", $1, $4, $6, $11}'
    echo ""
}

# Function to get real-time stats
get_realtime_stats() {
    echo "⚡ === REAL-TIME STATS $(timestamp) ==="
    
    # Docker stats
    docker stats --no-stream $CONTAINER_ID
    echo ""
    
    # Load average
    echo "📊 Load average:"
    docker exec $CONTAINER_ID cat /proc/loadavg
    echo ""
    
    # CPU info
    echo "🖥️  CPU info:"
    docker exec $CONTAINER_ID cat /proc/cpuinfo | grep -E "(processor|model name)" | head -4
    echo ""
}

# Main monitoring loop
echo "🚀 Starting system profiler..."
echo ""

for i in $(seq 1 $((MONITOR_DURATION/10))); do
    echo "==================== ITERATION $i/$(($MONITOR_DURATION/10)) ===================="
    
    get_realtime_stats
    analyze_processes
    analyze_components
    
    # Every 3rd iteration, do deeper analysis
    if [ $((i % 3)) -eq 0 ]; then
        analyze_threads
        analyze_memory
        analyze_io
    fi
    
    echo ""
    echo "⏳ Waiting 10 seconds..."
    sleep 10
done

echo "✅ System profiling completed!"
echo ""
echo "🎯 SUMMARY:"
echo "- Look for processes with consistently high CPU usage"
echo "- Check if Chrome/FFmpeg processes are the main consumers"
echo "- Analyze thread counts for excessive threading"
echo "- Review memory usage patterns" 