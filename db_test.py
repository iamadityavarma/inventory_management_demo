import os
import psycopg2
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Database connection parameters
db_params = {
    'host': os.getenv('DB_HOST'),
    'port': os.getenv('DB_PORT', '5432'),
    'database': os.getenv('DB_NAME'),
    'user': os.getenv('DB_USER'),
    'password': os.getenv('DB_PASSWORD'),
    'sslmode': 'require'  # Required for Azure PostgreSQL
}

print("Connecting to PostgreSQL database...")
print(f"Host: {db_params['host']}")
print(f"Database: {db_params['database']}")
print(f"User: {db_params['user']}")

try:
    # Try to establish a connection
    conn = psycopg2.connect(**db_params)
    print("Connection successful!")
    
    # Test a simple query
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM dev_final.dhu_inventory")
    row = cursor.fetchone()
    print(f"Total inventory items: {row[0]}")
    
    # Close connection
    cursor.close()
    conn.close()
    print("Connection closed.")
except Exception as e:
    print(f"Error connecting to database: {e}")