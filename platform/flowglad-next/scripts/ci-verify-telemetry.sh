#!/bin/bash

# CI Telemetry Verification Script
# This script starts the dev server and runs telemetry tests
# Exit codes: 0 = success, 1 = failure

set -e

echo "🔬 Starting telemetry verification for production deployment..."

# Start dev server in background
echo "Starting development server..."
pnpm dev &
SERVER_PID=$!

# Function to cleanup on exit
cleanup() {
  echo "Cleaning up..."
  if [ ! -z "$SERVER_PID" ]; then
    kill $SERVER_PID 2>/dev/null || true
  fi
}
trap cleanup EXIT

# Wait for server to be ready (max 60 seconds)
echo "Waiting for server to start..."
MAX_ATTEMPTS=30
ATTEMPT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
  if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "✅ Server is ready!"
    break
  fi
  ATTEMPT=$((ATTEMPT + 1))
  echo "  Waiting... ($ATTEMPT/$MAX_ATTEMPTS)"
  sleep 2
done

if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
  echo "❌ Server failed to start after 60 seconds"
  exit 1
fi

# Run telemetry verification
echo "Running telemetry tests..."
pnpm tsx scripts/verify-telemetry.ts
TEST_RESULT=$?

# Check result
if [ $TEST_RESULT -ne 0 ]; then
  echo "❌ Telemetry verification failed! Blocking production deployment."
  exit 1
fi

echo "✅ Telemetry verification passed!"
exit 0