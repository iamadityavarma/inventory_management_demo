
import sys
from app.main import app, get_inventory
from fastapi.testclient import TestClient

client = TestClient(app)

try:
    response = client.get("/inventory")
    print(f"Status code: {response.status_code}")
    print(f"Response: {response.text[:500]}")  # Print first 500 chars of response
    if response.status_code \!= 200:
        # Get traceback from the server logs
        print("
Server logs:")
        sys.stderr.flush() # Make sure any errors are visible
        sys.stdout.flush()
except Exception as e:
    print(f"Test client error: {e}")

