#!/bin/bash

# Check if environment is specified
ENV=${1:-production}

# Check for .env file
if [ ! -f "./.env" ]; then
  echo "Warning: .env file not found in the current directory."
  echo "The application may not be able to connect to the database."
  echo "Please create a .env file with your database connection details."
  echo ""
  echo "Example .env file contents:"
  echo "DB_HOST=your-database-host"
  echo "DB_PORT=5432"
  echo "DB_NAME=your-database-name"
  echo "DB_USER=your-username"
  echo "DB_PASSWORD=your-password"
  echo ""
  read -p "Do you want to continue anyway? (y/n) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

if [ "$ENV" == "dev" ] || [ "$ENV" == "development" ]; then
  echo "Starting in DEVELOPMENT mode..."
  docker-compose -f docker-compose.dev.yml up --build
elif [ "$ENV" == "local" ]; then
  echo "Starting API in LOCAL mode without Docker..."
  
  # Check if virtual environment exists
  if [ ! -d "./venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
    source venv/bin/activate
    pip install -r api/requirements.txt
  else
    source venv/bin/activate
  fi
  
  # Run the API server in the background
  cd api
  ./run_local.sh &
  API_PID=$!
  
  echo "API server started at http://localhost:8000"
  echo "Press Ctrl+C to stop servers"
  
  # Wait for API to start
  sleep 2
  
  # Try to run the client if available
  if [ -d "./client" ]; then
    echo "Starting client development server..."
    cd ../client
    npm start
    
    # When npm start exits, kill the API server
    kill $API_PID
  else
    # If no client, just keep the API running until user presses Ctrl+C
    wait $API_PID
  fi
else
  echo "Starting in PRODUCTION mode..."
  docker-compose up --build
fi