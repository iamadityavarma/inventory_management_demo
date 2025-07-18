#!/bin/bash

# Setup development environment
if [ "$1" == "setup" ]; then
  echo "Setting up development environment..."
  python3 -m venv venv
  source venv/bin/activate
  pip install -r api/requirements.txt
  echo "Setup complete! Activate the virtual environment with: source venv/bin/activate"
  exit 0
fi

# Copy the CSV file into the api directory (for backward compatibility)
echo "Copying CSV file for Docker build..."
#cp inventory\(in\).csv api/app/data.csv

# Build the API image
echo "Building API image..."
cd api
docker build --no-cache --platform linux/amd64 -t iamadityavarma/inventory_management:api .
docker push iamadityavarma/inventory_management:api

cd ..

# Build the Client image
echo "Building Client image..."
cd client
docker build --no-cache --platform linux/amd64 -t iamadityavarma/inventory_management:client \
  --build-arg REACT_APP_API_URL=https://inventory-app-api-fefyd0cfa2bye6c0.centralus-01.azurewebsites.net .
docker push iamadityavarma/inventory_management:client
cd ..

echo "Build and push complete!"