#!/bin/bash

# Aerospike UI - Startup Script
# This script starts both the backend and frontend servers

# Set Java 21
export JAVA_HOME="/Library/Java/JavaVirtualMachines/jdk-21.jdk/Contents/Home"
export PATH="$JAVA_HOME/bin:$PATH"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Consistent color output across shells
print_color() {
    printf "%b\n" "$1"
}

print_color "🚀 Starting Aerospike UI..."
print_color ""

# Function to cleanup on exit
cleanup() {
    print_color ""
    print_color "${YELLOW}Shutting down servers...${NC}"
    if [ "$BACKEND_STARTED_BY_SCRIPT" = "1" ] && [ -n "$BACKEND_PID" ]; then
        kill "$BACKEND_PID" 2>/dev/null
    fi
    if [ "$FRONTEND_STARTED_BY_SCRIPT" = "1" ] && [ -n "$FRONTEND_PID" ]; then
        kill "$FRONTEND_PID" 2>/dev/null
    fi
    exit
}

# Set trap to cleanup on CTRL+C
trap cleanup INT TERM

# Track which processes this script starts
BACKEND_PID=""
FRONTEND_PID=""
BACKEND_STARTED_BY_SCRIPT=0
FRONTEND_STARTED_BY_SCRIPT=0

# Stop existing listeners so every run starts fresh code
stop_existing_on_port() {
    local port="$1"
    local service_name="$2"
    local existing_pid
    existing_pid=$(lsof -tiTCP:"$port" -sTCP:LISTEN | head -n 1)

    if [ -n "$existing_pid" ]; then
        print_color "${YELLOW}${service_name} already running on port ${port} (PID: ${existing_pid}). Stopping old process...${NC}"
        kill "$existing_pid" 2>/dev/null
        sleep 1

        if kill -0 "$existing_pid" 2>/dev/null; then
            print_color "${YELLOW}Could not stop PID ${existing_pid}. Please stop it manually and retry.${NC}"
            exit 1
        fi
    fi
}

stop_existing_on_port 8080 "Spring Boot Backend"
stop_existing_on_port 5173 "React Frontend"

# Start Backend
print_color "${BLUE}Starting Spring Boot Backend...${NC}"
cd backend
./mvnw spring-boot:run > ../backend.log 2>&1 &
BACKEND_PID=$!
BACKEND_STARTED_BY_SCRIPT=1
cd ..

# Wait a bit for backend to start
sleep 3

# Start Frontend
print_color "${BLUE}Starting React Frontend...${NC}"
cd ui

# Ensure frontend dependencies are installed (vite is required for npm run dev)
if [ ! -d node_modules ] || [ ! -x node_modules/.bin/vite ]; then
    print_color "${YELLOW}Installing frontend dependencies...${NC}"
    if [ -f package-lock.json ]; then
        npm ci > ../frontend-install.log 2>&1
    else
        npm install > ../frontend-install.log 2>&1
    fi
fi

npm run dev > ../frontend.log 2>&1 &
FRONTEND_PID=$!
FRONTEND_STARTED_BY_SCRIPT=1
cd ..

# Wait for services to be ready
print_color ""
print_color "${YELLOW}Waiting for services to start...${NC}"
sleep 5

# Ensure both services are still running before reporting success
if ! kill -0 $BACKEND_PID 2>/dev/null; then
    print_color ""
    print_color "${YELLOW}Backend failed to start. Check backend.log${NC}"
    exit 1
fi

if ! kill -0 $FRONTEND_PID 2>/dev/null; then
    print_color ""
    print_color "${YELLOW}Frontend failed to start. Check frontend.log (and frontend-install.log if present)${NC}"
    exit 1
fi

print_color ""
print_color "${GREEN}✅ Services started successfully!${NC}"
print_color ""
print_color "📊 Backend:  http://localhost:8080"
print_color "🎨 Frontend: http://localhost:5173"
print_color ""
print_color "📝 Logs:"
print_color "   Backend:  tail -f backend.log"
print_color "   Frontend: tail -f frontend.log"
print_color ""
print_color "${YELLOW}Press CTRL+C to stop all services${NC}"
print_color ""

# Keep script running and show combined logs
touch backend.log frontend.log
tail -f backend.log frontend.log

# Wait for background processes
wait $BACKEND_PID $FRONTEND_PID
