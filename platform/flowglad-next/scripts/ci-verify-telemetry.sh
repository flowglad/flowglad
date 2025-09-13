#!/bin/bash

# CI Telemetry Verification Script
# This script starts the dev server and runs telemetry tests
# Exit codes: 0 = success, 1 = failure

set -e

echo "🔬 Starting telemetry verification for production deployment..."

# Check if Unkey credentials are already set (from GitHub secrets)
if [ ! -z "$UNKEY_ROOT_KEY" ] && [ ! -z "$UNKEY_API_ID" ]; then
  echo "Using Unkey credentials from GitHub secrets"
elif [ -f ".env.local" ]; then
  echo "Loading environment variables from .env.local..."
  # Use set -a to automatically export all variables
  set -a
  source .env.local
  set +a
  echo "Environment variables loaded from .env.local"
else
  echo "Warning: No Unkey credentials found in environment or .env.local"
  echo "API key validation will fail without UNKEY_ROOT_KEY and UNKEY_API_ID"
fi

# Debug: Show if critical Unkey variables are set
echo "Debug: UNKEY_ROOT_KEY is ${UNKEY_ROOT_KEY:+set}${UNKEY_ROOT_KEY:-not set}"
echo "Debug: UNKEY_API_ID is ${UNKEY_API_ID:+set}${UNKEY_API_ID:-not set}"

# Show partial values for debugging (safely)
if [ ! -z "$UNKEY_ROOT_KEY" ]; then
  ROOT_KEY_PREFIX=$(echo "$UNKEY_ROOT_KEY" | cut -c1-15)
  echo "Debug: UNKEY_ROOT_KEY prefix: ${ROOT_KEY_PREFIX}..."
fi

if [ ! -z "$UNKEY_API_ID" ]; then
  API_ID_PREFIX=$(echo "$UNKEY_API_ID" | cut -c1-15)
  echo "Debug: UNKEY_API_ID prefix: ${API_ID_PREFIX}..."
fi

# Also check if the test API key matches the environment
if [ ! -z "$TELEMETRY_TEST_API_KEY" ]; then
  KEY_PREFIX=$(echo "$TELEMETRY_TEST_API_KEY" | cut -c1-10)
  echo "Debug: Test API key prefix: $KEY_PREFIX..."
  
  # Check if it's a staging or production key
  if [[ "$TELEMETRY_TEST_API_KEY" == staging_* ]]; then
    echo "Debug: Using staging API key"
  elif [[ "$TELEMETRY_TEST_API_KEY" == sk_live_* ]]; then
    echo "Debug: Using production API key"
  elif [[ "$TELEMETRY_TEST_API_KEY" == sk_test_* ]]; then
    echo "Debug: Using test API key"
  else
    echo "Warning: Unrecognized API key format"
  fi
fi

# Start dev server in background with environment variables
echo "Starting development server with Unkey environment..."
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

# Run telemetry verification (using simplified script with debug output)
echo "Running telemetry tests with debug output..."
echo "Debug: TELEMETRY_TEST_API_KEY is ${TELEMETRY_TEST_API_KEY:+set}${TELEMETRY_TEST_API_KEY:-not set}"
pnpm tsx scripts/verify-telemetry-simple.ts
TEST_RESULT=$?

# Check result
if [ $TEST_RESULT -ne 0 ]; then
  echo "❌ Telemetry verification failed! Blocking production deployment."
  exit 1
fi

echo "✅ Telemetry verification passed!"
exit 0