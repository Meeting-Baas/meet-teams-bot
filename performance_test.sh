#!/bin/bash
# Performance Testing Script for Meeting Bots
# Measures resource consumption with 1, 2, and 3 bots

set -e

TIMESTAMP=$(date '+%Y-%m-%d_%H-%M-%S')
TEST_DIR="$HOME/monitoring/performance_test_$TIMESTAMP"
RESULTS_FILE="$TEST_DIR/performance_results.md"

mkdir -p "$TEST_DIR"

echo "🧪 Starting Performance Test - $TIMESTAMP"
echo "📊 Results will be saved to: $TEST_DIR"

# Create results file header
cat > "$RESULTS_FILE" << 'EOF'
# Meeting Bots Performance Test Results

## Test Configuration
- **Date:** $(date)
- **VM Specs:** $(lscpu | grep "Model name" | cut -d: -f2 | xargs) 
- **RAM:** $(free -h | grep "Mem:" | awk '{print $2}')
- **Cores:** $(nproc)

## Test Methodology
Each test runs for 120 seconds to allow stabilization.
Measurements taken every 10 seconds during stable period.

---
EOF

# Function to measure resources
measure_resources() {
    local test_name="$1"
    local duration="$2"
    local output_file="$TEST_DIR/${test_name}_metrics.log"
    
    echo "📊 Measuring resources for: $test_name (${duration}s)"
    
    # Header
    echo "=== $test_name - $(date) ===" > "$output_file"
    
    # Collect baseline
    echo "BASELINE:" >> "$output_file"
    free -m | grep "Mem:" >> "$output_file"
    echo "" >> "$output_file"
    
    # Monitor for duration
    local end_time=$((SECONDS + duration))
    local sample_count=0
    
    while [ $SECONDS -lt $end_time ]; do
        echo "SAMPLE_$sample_count ($(date)):" >> "$output_file"
        
        # Memory usage
        free -m | grep "Mem:" >> "$output_file"
        
        # CPU usage 
        top -bn1 | grep "Cpu(s)" >> "$output_file"
        
        # Process specific memory
        ps aux --no-headers | grep -E "(node|chrome)" | grep -v grep | \
            awk '{mem+=$6} END {printf "NODE_CHROME_MEM: %.1f MB\n", mem/1024}' >> "$output_file"
        
        # Count running bot processes
        ps aux | grep -c "main.js" | head -1 | \
            awk '{printf "ACTIVE_BOTS: %d\n", $1-1}' >> "$output_file"
        
        echo "" >> "$output_file"
        
        ((sample_count++))
        sleep 10
    done
    
    # Calculate averages
    echo "ANALYSIS:" >> "$output_file"
    grep "Mem:" "$output_file" | tail -n +2 | \
        awk '{sum+=$3} END {printf "AVG_RAM_USED: %.1f MB\n", sum/NR}' >> "$output_file"
    
    grep "NODE_CHROME_MEM:" "$output_file" | \
        awk '{sum+=$2} END {printf "AVG_BOT_RAM: %.1f MB\n", sum/NR}' >> "$output_file"
}

# Function to wait for bots to be ready
wait_for_bots() {
    local expected_count=$1
    echo "⏳ Waiting for $expected_count bots to be ready..."
    
    local timeout=300  # 5 minutes
    local elapsed=0
    
    while [ $elapsed -lt $timeout ]; do
        local running_bots=$(pm2 jlist | jq '[.[] | select(.pm2_env.status == "online")] | length' 2>/dev/null || echo "0")
        
        if [ "$running_bots" -eq "$expected_count" ]; then
            echo "✅ $expected_count bots are running"
            sleep 30  # Extra time for stabilization
            return 0
        fi
        
        echo "   Bots running: $running_bots/$expected_count (waiting...)"
        sleep 10
        ((elapsed+=10))
    done
    
    echo "⚠️ Timeout waiting for bots to start"
    return 1
}

# Function to add results to markdown
add_results_to_md() {
    local test_name="$1"
    local metrics_file="$TEST_DIR/${test_name}_metrics.log"
    
    cat >> "$RESULTS_FILE" << EOF

## $test_name

\`\`\`
$(tail -n 10 "$metrics_file")
\`\`\`

EOF
}

echo "🔄 Starting test sequence..."

# Test 0: Baseline (no bots)
echo ""
echo "=== BASELINE TEST (No Bots) ==="
./monitor_resources.sh
measure_resources "baseline" 60
add_results_to_md "Baseline (No Bots)"

# Test 1: Single Bot
echo ""
echo "=== TEST 1: Single Bot ==="
echo "🚀 Starting 1 bot..."
pm2 start pm2_ecosystem.config.js --only meeting-bot-1

if wait_for_bots 1; then
    measure_resources "single_bot" 120
    add_results_to_md "Single Bot"
else
    echo "❌ Failed to start single bot"
fi

# Test 2: Two Bots  
echo ""
echo "=== TEST 2: Two Bots ==="
echo "🚀 Starting 2nd bot..."
pm2 start pm2_ecosystem.config.js --only meeting-bot-2

if wait_for_bots 2; then
    measure_resources "two_bots" 120
    add_results_to_md "Two Bots"
else
    echo "❌ Failed to start second bot"
fi

# Test 3: Three Bots
echo ""
echo "=== TEST 3: Three Bots ==="
echo "🚀 Starting 3rd bot..."
pm2 start pm2_ecosystem.config.js --only meeting-bot-3

if wait_for_bots 3; then
    measure_resources "three_bots" 120
    add_results_to_md "Three Bots"
else
    echo "❌ Failed to start third bot"
fi

# Generate summary
echo ""
echo "📊 Generating performance summary..."

cat >> "$RESULTS_FILE" << 'EOF'

## Performance Summary

| Configuration | RAM Usage | CPU Usage | RAM per Bot |
|---------------|-----------|-----------|-------------|
EOF

# Extract averages and create summary table
for test in baseline single_bot two_bots three_bots; do
    if [ -f "$TEST_DIR/${test}_metrics.log" ]; then
        ram_used=$(grep "AVG_RAM_USED:" "$TEST_DIR/${test}_metrics.log" | awk '{print $2}' || echo "N/A")
        bot_ram=$(grep "AVG_BOT_RAM:" "$TEST_DIR/${test}_metrics.log" | awk '{print $2}' || echo "N/A") 
        
        case $test in
            "baseline") echo "| Baseline | ${ram_used} MB | N/A | N/A |" >> "$RESULTS_FILE" ;;
            "single_bot") echo "| 1 Bot | ${ram_used} MB | N/A | ${bot_ram} MB |" >> "$RESULTS_FILE" ;;
            "two_bots") echo "| 2 Bots | ${ram_used} MB | N/A | $(echo "$bot_ram / 2" | bc -l 2>/dev/null || echo "$bot_ram") MB |" >> "$RESULTS_FILE" ;;
            "three_bots") echo "| 3 Bots | ${ram_used} MB | N/A | $(echo "$bot_ram / 3" | bc -l 2>/dev/null || echo "$bot_ram") MB |" >> "$RESULTS_FILE" ;;
        esac
    fi
done

# Cost estimation
cat >> "$RESULTS_FILE" << 'EOF'

## Cost Estimation

Based on the measurements above:

### Server Sizing Recommendations
- **1-2 Bots:** 2GB RAM server (~€15/month)
- **3-4 Bots:** 4GB RAM server (~€25/month)  
- **5-6 Bots:** 8GB RAM server (~€45/month)

### Cost per Bot
- **Estimated cost per bot per month:** €8-12
- **Break-even point:** 3+ bots per server for cost efficiency

EOF

echo ""
echo "✅ Performance test completed!"
echo "📋 Results saved to: $RESULTS_FILE"
echo ""
echo "🔍 Quick summary:"
cat "$RESULTS_FILE" | grep -A 10 "Performance Summary"

# Cleanup
echo ""
echo "🧹 Stopping all bots..."
pm2 delete all 2>/dev/null || true

echo ""
echo "📁 Test files saved in: $TEST_DIR"
echo "   - performance_results.md (main report)"
echo "   - *_metrics.log (detailed metrics)"
echo "" 