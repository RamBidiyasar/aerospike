#!/bin/bash

# Aerospike UI - Startup Script
# This script starts both the backend and frontend servers

echo "🚀 Starting Aerospike UI..."
echo ""

# Set Java 21
export JAVA_HOME="/Library/Java/JavaVirtualMachines/jdk-21.jdk/Contents/Home"
export PATH="$JAVA_HOME/bin:$PATH"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "${YELLOW}Shutting down servers...${NC}"
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    exit
}

# Set trap to cleanup on CTRL+C
trap cleanup INT TERM

# Start Backend
echo "${BLUE}Starting Spring Boot Backend...${NC}"
cd backend
./mvnw spring-boot:run > ../backend.log 2>&1 &
BACKEND_PID=$!
cd ..

# Wait a bit for backend to start
sleep 3

# Start Frontend
echo "${BLUE}Starting React Frontend...${NC}"
cd ui
npm run dev > ../frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..

# Wait for services to be ready
echo ""
echo "${YELLOW}Waiting for services to start...${NC}"
sleep 5

echo ""
echo "${GREEN}✅ Services started successfully!${NC}"
echo ""
echo "📊 Backend:  http://localhost:8080"
echo "🎨 Frontend: http://localhost:5173"
echo ""
echo "📝 Logs:"
echo "   Backend:  tail -f backend.log"
echo "   Frontend: tail -f frontend.log"
echo ""
echo "${YELLOW}Press CTRL+C to stop all services${NC}"
echo ""

# Keep script running and show combined logs
tail -f backend.log frontend.log

# Wait for background processes
wait $BACKEND_PID $FRONTEND_PID
