from app.main import get_inventory
import traceback

try:
    # Try to call the function directly
    result = get_inventory(branch=None, limit=20, search=None)
    print(f"Function call succeeded: {result}")
except Exception as e:
    print(f"Error type: {type(e).__name__}")
    print(f"Error message: {str(e)}")
    print("\nTraceback:")
    print(traceback.format_exc())
