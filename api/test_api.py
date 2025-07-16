
import requests

endpoints = ["/health", "/inventory", "/metrics", "/entities", "/branches"]

for endpoint in endpoints:
    url = f"http://localhost:8000{endpoint}"
    print(f"Testing {url}...")
    try:
        response = requests.get(url)
        print(f"  Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"  Success\! Data type: {type(data)}")
        else:
            print(f"  Failed: {response.text}")
    except Exception as e:
        print(f"  Error: {e}")

