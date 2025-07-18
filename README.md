# Inventory Management Demo
ZentroQ Inventory Management System demo app
A modern inventory management system for warehouse managers built with React, Tailwind CSS (with glassmorphism styling), and a Python FastAPI backend.

Features
Modern UI with glassmorphism styling
Responsive Design optimized for desktop
Real-time Inventory Metrics
Advanced Filtering and Sorting
Color-coded Status Indicators
Tabbed Navigation for quick access to problem areas
Key Components
Frontend
React for the UI framework
Tailwind CSS for styling
Glassmorphism Design for a modern look and feel
Backend
FastAPI for a high-performance API
PostgreSQL for database storage
Pandas for data processing
Docker for containerization
Configuration
ZentroQ uses a flexible configuration system that supports multiple deployment scenarios:

Configuration Priority (highest to lowest)
URL Parameters (for SAP plugin integration)
Docker Environment (window.API_BASE_URL from build process)
Build-time Environment Variables (REACT_APP_API_URL)
Development Default (http://localhost:8000)
Current Configuration
The app automatically detects the API URL using this fallback chain:

const API_BASE_URL = window.API_BASE_URL || process.env.REACT_APP_API_URL || 'http://localhost:8000';
Future SAP Integration Ready
When deployed as an SAP plugin, the app can accept configuration via URL parameters:

?api-url=https://customer.sap.com/api - Override API endpoint
?tenant=xyz - Specify tenant ID
?environment=prod - Set environment
Example SAP deployment:

https://sap-system.com/plugins/zentroq/?api-url=https://customer.sap.com/api&tenant=customer123
The app will automatically use the provided configuration while maintaining all existing fallbacks.

Getting Started
Prerequisites
Docker and Docker Compose
Node.js (for local development)
Python 3.10+ (for local development)
PostgreSQL database (Azure PostgreSQL or local instance)
Database Configuration
Create a .env file in the root directory with the following variables:
DB_HOST=your-database-host
DB_PORT=5432
DB_NAME=your-database-name
DB_USER=your-username
DB_PASSWORD=your-password
For local development, run the setup script to create a virtual environment and install dependencies:
./build.sh setup
source venv/bin/activate
Running with Docker
Clone the repository
Navigate to the project directory
Run the application using the provided script:
Production Mode
./run.sh
or

docker-compose up --build
Development Mode (with hot-reloading)
./run.sh dev
or

docker-compose -f docker-compose.dev.yml up --build
Access the application:
Production: http://localhost:8080
Development: http://localhost:3000
Local Development
Frontend
cd client
npm install
npm start
Backend
cd api
pip install -r requirements.txt
uvicorn app.main:app --reload
Data Structure
The system works with inventory data containing the following fields:

Entity
Branch
PARTNBR
MfgName
MFGPARTNBR
DESCRIPTION
Family
Category
Inventory Balance
Sum of Quantity On Hand
_Average Cost
Sum of Latest Cost
Sum of Quantity On Order
Sum of T3M Qty Used
Sum of T6M Qty Used
Sum of TTM Qty Used
Sum of Months of Cover
Last Receipt
Screenshots
[Screenshots will be added here]

Docker Deployment
Building and Pushing to DockerHub
Build and tag both API and client images:

# Build API image
docker build -t jmanikonda/inventory_management:api ./api

# Build client image
docker build -t jmanikonda/inventory_management:client ./client

# Push to DockerHub
docker push jmanikonda/inventory_management:api
docker push jmanikonda/inventory_management:client
Pulling from DockerHub
# Pull API image
docker pull jmanikonda/inventory_management:api

# Pull client image
docker pull jmanikonda/inventory_management:client
