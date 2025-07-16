from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
import os
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
import json
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
import datetime # Add this import

print("<<<<<< HELLO FROM THE VERY TOP OF MAIN.PY - NEW VERSION RUNNING IF YOU SEE THIS - VERSION XYZ >>>>>>") # DIAGNOSTIC PRINT

# Load environment variables
load_dotenv()
# Try to load from parent directory if not found in current directory
if not os.path.exists('.env') and os.path.exists('../.env'):
    load_dotenv('../.env')

# Database connection parameters
db_params = {
    'host': os.getenv('DB_HOST'),
    'port': os.getenv('DB_PORT', '5432'),
    'database': os.getenv('DB_NAME'),
    'user': os.getenv('DB_USER'),
    'password': os.getenv('DB_PASSWORD'),
    'sslmode': 'require'  # Required for Azure PostgreSQL
}

app = FastAPI(title="ZentroQ Inventory API")

# Enable CORS for all origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for debugging
    allow_credentials=False,  # Must be False when using wildcard origins
    allow_methods=["*"],
    allow_headers=["*"],
    max_age=600,  # Cache preflight requests for 10 minutes
)

# Custom JSON response class to handle infinity values
class CustomJSONResponse(JSONResponse):
    def render(self, content) -> bytes:
        def sanitize_values(obj):
            if isinstance(obj, dict):
                for key, value in obj.items():
                    if isinstance(value, float):
                        if value == float('inf'):
                            obj[key] = "Infinity"
                        elif value == float('-inf'):
                            obj[key] = "-Infinity"
                        elif value != value:  # NaN
                            obj[key] = None
                    elif isinstance(value, (dict, list)):
                        sanitize_values(value)
            elif isinstance(obj, list):
                for i, item in enumerate(obj):
                    if isinstance(item, (dict, list)):
                        sanitize_values(item)
            return obj
        # Sanitize the content
        sanitized_content = sanitize_values(content)
        return json.dumps(
            jsonable_encoder(sanitized_content),
            ensure_ascii=False,
            allow_nan=False,
            indent=None,
            separators=(",", ":"),
        ).encode("utf-8")

# Use custom response class
app.router.default_response_class = CustomJSONResponse

# Data models
class InventoryItem(BaseModel):
    id: int
    entity: str
    branch: str
    partNumber: str
    mfgName: str
    mfgPartNumber: str
    description: str
    family: Optional[str] = None
    category: Optional[str] = None
    inventoryBalance: float
    quantityOnHand: int
    averageCost: float
    latestCost: float
    quantityOnOrder: int
    t3mQtyUsed: Optional[int] = 0
    t6mQtyUsed: Optional[int] = 0
    ttmQtyUsed: Optional[int] = 0
    monthsOfCoverage: float
    lastReceipt: Optional[str] = None
    status: str
    companyStatus: Optional[str] = None

# NEW Pydantic Models for Order Requests
class OrderRequestItem(BaseModel):
    mfg_part_number: str
    internal_part_number: Optional[str] = None
    item_description: Optional[str] = None
    quantity_requested: int
    vendor_name: Optional[str] = None
    notes: Optional[str] = None
    requesting_branch: str
    requested_by_user_email: Optional[str] = None # Should be captured from authenticated user if possible
    # snapshot_unit_price: Optional[float] = None # Assuming frontend sends this if available

class SubmitOrdersRequest(BaseModel):
    orders: List[OrderRequestItem] # This will likely change if we submit by user email
    user_email: Optional[str] = None # Added for new submit logic

class AddToActiveOrderRequest(OrderRequestItem): # Inherits fields from OrderRequestItem
    # user_email is already in OrderRequestItem as requested_by_user_email, we'll use that
    pass

class UpdateActiveOrderItemQuantityRequest(BaseModel):
    quantity: int
    user_email: str # To ensure user owns this item

# NEW Pydantic Models for Transfer Requests
class TransferRequestItem(BaseModel):
    mfg_part_number: str
    internal_part_number: Optional[str] = None
    item_description: Optional[str] = None
    quantity_requested: int
    source_branch: str
    destination_branch: str
    requested_by_user_email: str 
    notes: Optional[str] = None # Ensure notes is present here

class SubmitTransferRequestsRequest(BaseModel):
    transfers: List[TransferRequestItem]
    # user_email: Optional[str] = None # requested_by_user_email is in each item

# Helper function to safely convert values
def safe_convert(value, convert_func, default=0):
    """Safely convert values handling None, empty string, and other edge cases"""
    if value is None or value == "":
        return default
    if isinstance(value, str) and value.lower() in ["infinity", "inf", "nan"]:
        if value.lower() in ["infinity", "inf"]:
            return 999.0  # Large value instead of infinity
        return 0.0  # Default for NaN
    try:
        # Corrected logic: return the converted value directly.
        # The 'or default' was causing issues for falsy successful conversions (e.g., 0, 0.0).
        return convert_func(value)
    except (ValueError, TypeError):
        return default

# Helper function to determine inventory status
def determine_inventory_status(row):
    """
    Determine inventory status based on business rules
    - Excess: More than 6 months of supply
    - Dead: No usage in past 12 months but has inventory
    - Low: Less than 1 month of supply and has usage
    - Optimal: All other cases
    """
    months_of_cover = safe_convert(row.get("Sum of Months of Cover"), float, 999.0)
    ttm_qty_used = safe_convert(row.get("Sum of TTM Qty Used"), int)
    quantity_on_hand = safe_convert(row.get("Sum of Quantity On Hand"), int)
    
    # Existing status from database (if present)
    existing_status = row.get("status")
    if existing_status:
        return existing_status
    
    # Apply business rules
    if months_of_cover > 6:
        return "excess"
    elif ttm_qty_used == 0 and quantity_on_hand > 0:
        return "dead"
    elif months_of_cover < 1 and ttm_qty_used > 0:
        return "low"
    else:
        return "optimal"

# Helper functions to determine company-wide status for part numbers
def determine_company_status(mfg_part_number):
    """
    Determine company-wide status across all branches for a given manufacturer part number
    based on aggregate data using the same business rules:
    - Excess: More than 6 months of supply
    - Dead: No usage in past 12 months but has inventory
    - Low: Less than 1 month of supply and has usage
    - Optimal: All other cases
    """
    # Use the batch function with a single part number
    status_dict = get_company_statuses([mfg_part_number])
    return status_dict.get(mfg_part_number, "unknown")

def get_company_statuses(mfg_part_numbers):
    """
    Efficiently determine company-wide status for multiple manufacturer part numbers in a single database query.
    Returns a dictionary mapping manufacturer part numbers to their company-wide status.
    """
    if not mfg_part_numbers:
        return {}

    # Remove duplicates while preserving order
    unique_mfg_part_numbers = []
    seen = set()
    for pn in mfg_part_numbers:
        if pn not in seen:
            seen.add(pn)
            unique_mfg_part_numbers.append(pn)
    
    conn = None
    status_dict = {}
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Build a query that returns data for all manufacturer part numbers in one go
        placeholders = ', '.join(['%s'] * len(unique_mfg_part_numbers))
        
        query = f"""
            SELECT
                mfgpartnbr,
                SUM("Sum of Quantity On Hand") AS total_quantity_on_hand,
                SUM("Sum of TTM Qty Used") AS total_ttm_qty_used,
                SUM("Inventory Balance") AS total_inventory_balance,
                CASE
                    WHEN SUM("Sum of TTM Qty Used") > 0 THEN SUM("Sum of Quantity On Hand") / (SUM("Sum of TTM Qty Used") / 12.0)
                    ELSE 999.0
                END AS company_months_of_cover
            FROM inventory_management.demo_inventory
            WHERE mfgpartnbr IN ({placeholders}) AND "branch" != 'Corporate'
            GROUP BY mfgpartnbr
        """
        
        cursor.execute(query, unique_mfg_part_numbers)
        rows = cursor.fetchall()
        cursor.close()
        
        # Process each part's aggregated data
        for row in rows:
            mfg_part_number = row["mfgpartnbr"]

            # Apply the same business rules with aggregate data
            months_of_cover = safe_convert(row["company_months_of_cover"], float, 999.0)
            ttm_qty_used = safe_convert(row["total_ttm_qty_used"], int)
            quantity_on_hand = safe_convert(row["total_quantity_on_hand"], int)

            # Apply business rules
            if months_of_cover > 6:
                status_dict[mfg_part_number] = "excess"
            elif ttm_qty_used == 0 and quantity_on_hand > 0:
                status_dict[mfg_part_number] = "dead"
            elif months_of_cover < 1 and ttm_qty_used > 0:
                status_dict[mfg_part_number] = "low"
            else:
                status_dict[mfg_part_number] = "optimal"
        
        # Set unknown status for any parts that weren't found
        for part in unique_mfg_part_numbers:
            if part not in status_dict:
                status_dict[part] = "unknown"

        return status_dict

    except Exception as e:
        print(f"Error determining company statuses: {str(e)}")
        # Return unknown status for all manufacturer part numbers on error
        return {pn: "unknown" for pn in unique_mfg_part_numbers}
    finally:
        if conn:
            conn.close()

# Helper function to convert a single DB row to API format
def convert_db_row_to_api_format(row, index=0):
    """
    Convert a database row to the API format
    
    Args:
        row: The database row data
        index: The index for the ID field (default 0)
    """
    months_of_cover = safe_convert(row.get("Sum of Months of Cover"), float, 
                                  999.0 if row.get("Sum of Months of Cover") in ["Infinity", "inf"] else 0)
    
    # Get manufacturer part number (primary) and internal part number (secondary)
    mfg_part_number = row.get("mfgpartnbr", "")
    part_number = row.get("partnbr", "")

    # Determine local branch status
    branch_status = determine_inventory_status(row)

    # Get company-wide status directly from the "Network Status" column
    company_status = row.get("Network Status", "unknown") # Corrected to use "Network Status"
    if company_status is None: # Explicitly handle None to ensure "unknown" is used
        company_status = "unknown"

    # Format lastReceipt
    raw_last_receipt = row.get("Last Receipt")
    formatted_last_receipt = None
    if isinstance(raw_last_receipt, (datetime.date, datetime.datetime)):
        formatted_last_receipt = raw_last_receipt.isoformat() # Convert date/datetime to ISO string
    elif isinstance(raw_last_receipt, str):
        # If it's already a string, use it as is (or perform further validation if needed)
        formatted_last_receipt = raw_last_receipt
    # If it's None or any other type, it will remain None, which is acceptable for Optional[str]

    months_of_coverage = row.get("Months of Coverage")
    # Handle the months of coverage value
    if months_of_coverage == "Infinity":
        months_of_coverage = float('inf')
    elif months_of_coverage is not None:
        try:
            months_of_coverage = float(months_of_coverage)
        except (ValueError, TypeError):
            months_of_coverage = None

    return {
        "id": index + 1,
        "entity": row.get("entity", ""),
        "branch": row.get("branch", ""),
        "partNumber": part_number,
        "mfgName": row.get("mfgname", ""),
        "mfgPartNumber": mfg_part_number,
        "description": row.get("description", ""),
        "family": row.get("family", ""),
        "category": row.get("category", ""),
        "inventoryBalance": safe_convert(row.get("Inventory Balance"), float),
        "quantityOnHand": safe_convert(row.get("Sum of Quantity On Hand"), int),
        "averageCost": safe_convert(row.get("_Average Cost"), float),
        "latestCost": safe_convert(row.get("Sum of Latest Cost"), float),
        "quantityOnOrder": safe_convert(row.get("Sum of Quantity On Order"), int),
        "t3mQtyUsed": safe_convert(row.get("Sum of T3M Qty Used"), int),
        "t6mQtyUsed": safe_convert(row.get("Sum of T6M Qty Used"), int),
        "ttmQtyUsed": safe_convert(row.get("Sum of TTM Qty Used"), int, 0),
        "monthsOfCoverage": months_of_coverage,
        "lastReceipt": formatted_last_receipt, # Use the formatted date string
        "status": branch_status,
        "companyStatus": company_status
    }

# Function to convert multiple DB rows to API format efficiently
def convert_db_rows_to_api_format(rows, start_index=0):
    """
    Convert multiple database rows to API format efficiently.
    This version correctly gets the network status from the row data.
    """
    if not rows:
        return []
    
    # Convert each row. No pre-fetching needed since Network Status is in the row.
    result = []
    for i, row in enumerate(rows):
        item = convert_db_row_to_api_format(row, i + start_index)
        result.append(item)
    
    return result

# Database connection helper
def get_db_connection():
    """Establishes a new database connection using environment variables."""
    # Make sure environment variables are loaded (idempotent)
    load_dotenv() 
    if not os.path.exists('.env') and os.path.exists('../.env'):
        load_dotenv('../.env')

    current_db_params = {
        'host': os.getenv('DB_HOST'),
        'port': os.getenv('DB_PORT', '5432'),
        'database': os.getenv('DB_NAME'),
        'user': os.getenv('DB_USER'),
        'password': os.getenv('DB_PASSWORD'),
        'sslmode': 'require' 
    }
    # Diagnostic print to check connection parameters
    # print(f"DB Connection Params in get_db_connection: {current_db_params}") 
    
    try:
        conn = psycopg2.connect(**current_db_params)
        return conn
    except Exception as e:
        print(f"Database connection error in get_db_connection: {e}")
        raise HTTPException(status_code=503, detail=f"Database connection error: {str(e)}")

# Health check endpoint
@app.get("/health")
def health_check():
    """Health check endpoint for Docker healthcheck"""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        cursor.close()
        conn.close()
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}
    finally:
        if conn:
            conn.close()

# Get all inventory items with pagination, sorting and filtering
@app.get("/inventory", response_model=Dict[str, Any])
def get_inventory(
    limit: int = 20,
    offset: int = 0,
    search: str = None,
    branch: str = None,
    entity: str = None,
    status: str = None,
    network_status: str = None,
    sort_by: str = "mfgPartNumber",
    sort_dir: str = "asc"
):
    """
    Get all inventory items with efficient pagination, filtering, and sorting
    - limit: Number of items to return (default 20, 0 for all items)
    - offset: Pagination offset (starting position)
    - search: Search text to filter items
    - branch: Filter by branch
    - entity: Filter by entity (optional)
    - status: Filter by status (excess, low, dead)
    - network_status: Filter by network status (optional)
    - sort_by: Field to sort by (mfgPartNumber, inventoryBalance, partNumber, etc.)
    - sort_dir: Sort direction (asc or desc)
    """
    import time
    start_time = time.time()
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Build query parameters
        params = []
        
        # Build base query
        query = """
            SELECT *
            FROM inventory_management.demo_inventory
            WHERE "branch" != 'Corporate'
        """
        
        # Add entity filter if specified
        if entity:
            query += " AND entity = %s"
            params.append(entity)
            
        # Add branch filter if specified
        if branch:
            query += " AND branch = %s"
            params.append(branch)
        
        # Add status filter if specified
        if status:
            if status == 'excess':
                query += " AND status = 'excess'"
            elif status == 'low':
                query += " AND status = 'low'"
            elif status == 'dead':
                query += " AND status = 'dead'"
            # 'overview' or other values don't need filtering
        
        # Add network status filter if specified
        if network_status:
            query += " AND \"Network Status\" = %s"
            params.append(network_status)
        
        # Add search filter if specified
        if search:
            query += """ 
                AND (
                    mfgpartnbr ILIKE %s OR
                    description ILIKE %s OR
                    mfgname ILIKE %s OR
                    partnbr ILIKE %s OR
                    entity ILIKE %s OR
                    branch ILIKE %s
                )
            """
            search_param = f"%{search}%"
            params.extend([search_param, search_param, search_param, search_param, search_param, search_param])
        
        # Get total count and metrics in one efficient query (for pagination)
        count_query = f"""
        SELECT 
            COUNT(*) AS total,
            SUM(CASE WHEN status = 'excess' THEN 1 ELSE 0 END) AS excess_count,
            SUM(CASE WHEN status = 'low' THEN 1 ELSE 0 END) AS low_count,
            SUM(CASE WHEN status = 'dead' THEN 1 ELSE 0 END) AS dead_count,
            SUM("Inventory Balance") AS total_value,
            COUNT(DISTINCT entity) AS entity_count,
            COUNT(DISTINCT branch) AS branch_count
        FROM ({query}) AS filtered
        """
        cursor.execute(count_query, params)
        count_data = cursor.fetchone()
        total_count = count_data["total"]
        
        if total_count == 0:
            # No results found
            return {
                "items": [],
                "totalCount": 0,
                "limit": limit,
                "offset": offset,
                "hasMore": False,
                "metrics": {
                    "totalSKUs": 0,
                    "excessItems": 0,
                    "lowStockItems": 0,
                    "deadStockItems": 0,
                    "totalInventoryValue": 0,
                    "entityCount": 0,
                    "branchCount": 0
                }
            }
        
        # Map API sort fields to database fields
        sort_field_map = {
            "inventoryBalance": "Inventory Balance",
            "mfgPartNumber": "mfgpartnbr",
            "partNumber": "partnbr",
            "description": "description",
            "quantityOnHand": "Sum of Quantity On Hand",
            "monthsOfCoverage": "Months of Coverage",  # Updated from "Months to Burn"
            "ttmQtyUsed": "Sum of TTM Qty Used",
            "entity": "entity",
            "branch": "branch",
            "lastReceipt": "Last Receipt",
            "companyStatus": "Network Status"
            # Add more mappings as needed
        }
        
        # Get the database field name, default to "Inventory Balance" if not mapped
        db_sort_field = sort_field_map.get(sort_by, "Inventory Balance")
        
        # Add sorting with special handling for monthsOfCoverage
        sort_direction = "DESC" if sort_dir.lower() == "desc" else "ASC"
        if sort_by == "monthsOfCoverage":
            # For monthsOfCoverage, treat "Infinity" as the highest value
            query += f''' ORDER BY 
                CASE 
                    WHEN "Months of Coverage" = 'Infinity' THEN 
                        CASE WHEN '{sort_direction}' = 'ASC' THEN 1 ELSE 0 END
                    ELSE 
                        CASE WHEN '{sort_direction}' = 'ASC' THEN 0 ELSE 1 END
                END,
                CAST("Months of Coverage" AS FLOAT) {sort_direction}'''
        else:
            query += f' ORDER BY "{db_sort_field}" {sort_direction}'
        
        # Only add a limit if limit > 0 (limit=0 means no limit)
        if limit > 0:
            query += " LIMIT %s"
            params.append(limit)
            
            # Add offset for pagination
            if offset > 0:
                query += " OFFSET %s"
                params.append(offset)
        
        # Execute query to get paginated results
        print(f"Executing query: {query} with params: {params}")
        cursor.execute(query, params)
        rows = cursor.fetchall()
        
        # Convert to API format with efficient batch processing
        result = convert_db_rows_to_api_format(rows, offset)
        
        # Calculate metrics from the count query results
        metrics = {
            "totalSKUs": safe_convert(count_data["total"], int),
            "excessItems": safe_convert(count_data["excess_count"], int),
            "lowStockItems": safe_convert(count_data["low_count"], int),
            "deadStockItems": safe_convert(count_data["dead_count"], int),
            "totalInventoryValue": safe_convert(count_data["total_value"], float),
            "entityCount": safe_convert(count_data["entity_count"], int),
            "branchCount": safe_convert(count_data["branch_count"], int)
        }
        
        # Calculate inventory turnover only for overall metrics
        # Skip for filtered results to save processing time
        inventory_turns = 0.0
        if not entity and not branch and not status and not search:
            # Calculate for all entities (including HCN)
            turns_query = """
                SELECT 
                    SUM("Inventory Balance") AS total_inventory_value,
                    SUM(("Sum of Quantity On Hand" + COALESCE("Sum of TTM Qty Used", 0)) * COALESCE("_Average Cost", 0)) AS total_cogs
                FROM inventory_management.demo_inventory
                WHERE "branch" != 'Corporate'
            """
            cursor.execute(turns_query)
            turns_row = cursor.fetchone()
            
            if turns_row and turns_row["total_inventory_value"] and turns_row["total_inventory_value"] > 0:
                inventory_turns = turns_row["total_cogs"] / turns_row["total_inventory_value"]
                
            print(f"Overall Inventory Turns: {inventory_turns}")
        
        metrics["inventoryTurnover"] = safe_convert(inventory_turns, float)
        
        cursor.close()
        
        total_time = time.time() - start_time
        print(f"Total API processing time: {total_time:.3f} seconds")
        
        # Return with pagination metadata and metrics
        return {
            "items": result,
            "totalCount": total_count,
            "limit": limit,
            "offset": offset,
            "hasMore": offset + len(result) < total_count,
            "metrics": metrics,
            "executionTime": f"{total_time:.3f}s"
        }
    except Exception as e:
        print(f"Error reading inventory data: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error reading inventory data: {str(e)}")
    finally:
        if conn:
            conn.close()

# Get metrics for advanced filters (multiple entities and branches)
@app.get("/metrics/advanced")
def get_advanced_metrics(
    entities: str = None,
    branches: str = None,
    status_filter: str = None # Renamed for clarity and to avoid conflict with 'status' column
):
    """
    Get consolidated metrics and summaries across multiple entities and branches
    - entities: Comma-separated list of entity names
    - branches: Comma-separated list of branch names
    - status_filter: Optional filter by inventory status (excess, low, dead, overview)
    """
    import time
    start_time = time.time()
    conn = None
    try:
        entity_list = entities.split(',') if entities else []
        branch_list = branches.split(',') if branches else []
        
        print(f"Advanced metrics/summaries request: entities={entity_list}, branches={branch_list}, status_filter={status_filter}")
        
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        where_conditions = []
        params = []
        
        if entity_list:
            placeholders = ', '.join(['%s'] * len(entity_list))
            where_conditions.append(f"entity IN ({placeholders})")
            params.extend(entity_list)
        
        if branch_list:
            placeholders = ', '.join(['%s'] * len(branch_list))
            where_conditions.append(f"branch IN ({placeholders})")
            params.extend(branch_list)
        
        # Parameterized status filter
        if status_filter and status_filter != 'overview': # 'overview' implies no status filter for main counts
            where_conditions.append("status = %s")
            params.append(status_filter)
        
        base_where_clause = " AND ".join(where_conditions) if where_conditions else "1=1"

        # Main query for metrics, summaries, and turnover components
        # This query tries to get everything in one go for the given filters
        query = f"""
            SELECT 
                COUNT(*) AS total_skus,
                SUM(CASE WHEN status = 'excess' THEN 1 ELSE 0 END) AS excess_items,
                SUM(CASE WHEN status = 'low' THEN 1 ELSE 0 END) AS low_stock_items,
                SUM(CASE WHEN status = 'dead' THEN 1 ELSE 0 END) AS dead_stock_items,

                SUM("Inventory Balance") AS overview_total_value,
                SUM("Sum of Quantity On Hand") AS overview_total_quantity,
                SUM(("Sum of Quantity On Hand" + COALESCE("Sum of TTM Qty Used", 0)) * COALESCE("_Average Cost", 0)) AS overview_total_cogs,

                SUM(CASE WHEN status = 'excess' THEN "Inventory Balance" ELSE 0 END) AS excess_total_value,
                SUM(CASE WHEN status = 'excess' THEN "Sum of Quantity On Hand" ELSE 0 END) AS excess_total_quantity,
                SUM(CASE WHEN status = 'excess' THEN ("Sum of Quantity On Hand" + COALESCE("Sum of TTM Qty Used", 0)) * COALESCE("_Average Cost", 0) ELSE 0 END) AS excess_total_cogs,

                SUM(CASE WHEN status = 'low' THEN "Inventory Balance" ELSE 0 END) AS low_total_value,
                SUM(CASE WHEN status = 'low' THEN "Sum of Quantity On Hand" ELSE 0 END) AS low_total_quantity,
                SUM(CASE WHEN status = 'low' THEN ("Sum of Quantity On Hand" + COALESCE("Sum of TTM Qty Used", 0)) * COALESCE("_Average Cost", 0) ELSE 0 END) AS low_total_cogs,

                SUM(CASE WHEN status = 'dead' THEN "Inventory Balance" ELSE 0 END) AS dead_total_value,
                SUM(CASE WHEN status = 'dead' THEN "Sum of Quantity On Hand" ELSE 0 END) AS dead_total_quantity,
                SUM(CASE WHEN status = 'dead' THEN ("Sum of Quantity On Hand" + COALESCE("Sum of TTM Qty Used", 0)) * COALESCE("_Average Cost", 0) ELSE 0 END) AS dead_total_cogs
            FROM inventory_management.demo_inventory
            WHERE {base_where_clause}
        """
        
        print(f"Executing combined metrics/summaries query with params: {params}")
        cursor.execute(query, tuple(params)) # Ensure params is a tuple
        data = cursor.fetchone()

        # Get actual entity and branch counts separately, applying the same filters
        # This is because COUNT(DISTINCT) on the main query would be for the whole filtered set,
        # not necessarily reflecting the input if some entities/branches had no matching items.
        # For the purpose of displaying selected criteria, it's often better to echo back what was asked for,
        # or list what *actually* had results. Let's get what *actually* had results.
        
        count_query_params = []
        count_where_conditions = []
        if entity_list:
            placeholders = ', '.join(['%s'] * len(entity_list))
            count_where_conditions.append(f"entity IN ({placeholders})")
            count_query_params.extend(entity_list)
        if branch_list:
            placeholders = ', '.join(['%s'] * len(branch_list))
            count_where_conditions.append(f"branch IN ({placeholders})")
            count_query_params.extend(branch_list)
        # No status filter for distinct entity/branch list usually
        count_where_clause = " AND ".join(count_where_conditions) if count_where_conditions else "1=1"

        count_query = f"""
            SELECT 
                array_agg(DISTINCT entity) AS actual_entities,
                array_agg(DISTINCT branch) AS actual_branches
            FROM inventory_management.demo_inventory
            WHERE {count_where_clause}
        """
        cursor.execute(count_query, tuple(count_query_params))
        count_data = cursor.fetchone()
        
        actual_entities = count_data.get("actual_entities", []) if count_data else []
        actual_branches = count_data.get("actual_branches", []) if count_data else []


        def calculate_turnover(cogs, value):
            if value and value > 0 and cogs is not None:
                return safe_convert(cogs / value, float)
            return 0.0

        summaries = {
            "overview": {
                "totalValue": safe_convert(data.get("overview_total_value"), float),
                "totalQuantity": safe_convert(data.get("overview_total_quantity"), int),
                "inventoryTurnover": calculate_turnover(data.get("overview_total_cogs"), data.get("overview_total_value")),
                "entityCount": len(actual_entities), # Should reflect entities in the result
                "branchCount": len(actual_branches)  # Should reflect branches in the result
            },
            "excess": {
                "totalValue": safe_convert(data.get("excess_total_value"), float),
                "totalQuantity": safe_convert(data.get("excess_total_quantity"), int),
                "inventoryTurnover": calculate_turnover(data.get("excess_total_cogs"), data.get("excess_total_value")),
                "entityCount": len(actual_entities),
                "branchCount": len(actual_branches)
            },
            "lowStock": {
                "totalValue": safe_convert(data.get("low_total_value"), float),
                "totalQuantity": safe_convert(data.get("low_total_quantity"), int),
                "inventoryTurnover": calculate_turnover(data.get("low_total_cogs"), data.get("low_total_value")),
                "entityCount": len(actual_entities),
                "branchCount": len(actual_branches)
            },
            "deadStock": {
                "totalValue": safe_convert(data.get("dead_total_value"), float),
                "totalQuantity": safe_convert(data.get("dead_total_quantity"), int),
                "inventoryTurnover": calculate_turnover(data.get("dead_total_cogs"), data.get("dead_total_value")),
                "entityCount": len(actual_entities),
                "branchCount": len(actual_branches)
            }
        }
        
        response = {
            "totalSKUs": safe_convert(data.get("total_skus"), int), # This is total SKUs matching the filters
            "excessItems": safe_convert(data.get("excess_items"), int), # SKU count for excess
            "lowStockItems": safe_convert(data.get("low_stock_items"), int), # SKU count for low
            "deadStockItems": safe_convert(data.get("dead_stock_items"), int), # SKU count for dead
            "summaries": summaries,
            "entities_in_result": actual_entities, # For UI to know what entities contributed
            "branches_in_result": actual_branches, # For UI to know what branches contributed
            "executionTime": f"{time.time() - start_time:.3f}s"
        }
        
        return response
    except Exception as e:
        print(f"Error calculating advanced metrics/summaries: {str(e)}")
        # Consider logging the full traceback for e
        raise HTTPException(status_code=500, detail=f"Error calculating advanced metrics/summaries: {str(e)}")
    finally:
        if conn:
            conn.close()

# Get overall metrics
@app.get("/metrics")
def get_metrics():
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Query metrics directly from database
        cursor.execute("""
            SELECT 
                COUNT(*) AS total_skus,
                SUM(CASE WHEN status = 'excess' THEN 1 ELSE 0 END) AS excess_items,
                SUM(CASE WHEN status = 'low' THEN 1 ELSE 0 END) AS low_stock_items,
                SUM(CASE WHEN status = 'dead' THEN 1 ELSE 0 END) AS dead_stock_items,
                SUM("Inventory Balance") AS total_inventory_value
            FROM inventory_management.demo_inventory
        """)
        
        row = cursor.fetchone()
        
        # Calculate inventory turnover rate - including all entities
        # COGS = (Quantity On Hand + TTM Qty Used) * Average Cost
        # Inventory Turns = COGS / Inventory Balance
        cursor.execute("""
            SELECT 
                SUM("Inventory Balance") AS total_inventory_value,
                SUM(("Sum of Quantity On Hand" + COALESCE("Sum of TTM Qty Used", 0)) * COALESCE("_Average Cost", 0)) AS total_cogs
            FROM inventory_management.demo_inventory
        """)
        
        turns_row = cursor.fetchone()
        inventory_turns = 0.0
        
        if turns_row and turns_row["total_inventory_value"] and turns_row["total_inventory_value"] > 0:
            inventory_turns = turns_row["total_cogs"] / turns_row["total_inventory_value"]
            
        # Print for debugging
        print(f"Inventory Turns: {inventory_turns}")
        print(f"Total COGS: {turns_row['total_cogs'] if turns_row else 'N/A'}")
        print(f"Total Inventory Value: {turns_row['total_inventory_value'] if turns_row else 'N/A'}")
        
        # Don't force a fake value, just ensure it's not None
        if inventory_turns is None:
            inventory_turns = 0
        
        # Get HCN percentage for reference
        cursor.execute("""
            SELECT 
                SUM(CASE WHEN entity = 'HCN' THEN "Inventory Balance" ELSE 0 END) AS hcn_value,
                SUM("Inventory Balance") AS total_value
            FROM inventory_management.demo_inventory
        """)
        
        value_row = cursor.fetchone()
        hcn_percentage = 0.0
        
        if value_row and value_row["total_value"] and value_row["total_value"] > 0:
            hcn_percentage = (value_row["hcn_value"] / value_row["total_value"]) * 100
            
        cursor.close()
        
        if not row:
            return {
                "totalSKUs": 0,
                "excessItems": 0,
                "lowStockItems": 0,
                "deadStockItems": 0,
                "totalInventoryValue": 0,
                "inventoryTurnover": 0.0,
                "hcnPercentage": 0.0
            }
        
        return {
            "totalSKUs": safe_convert(row["total_skus"], int),
            "excessItems": safe_convert(row["excess_items"], int),
            "lowStockItems": safe_convert(row["low_stock_items"], int),
            "deadStockItems": safe_convert(row["dead_stock_items"], int),
            "totalInventoryValue": safe_convert(row["total_inventory_value"], float),
            "inventoryTurnover": safe_convert(inventory_turns, float),
            "hcnPercentage": safe_convert(hcn_percentage, float)
        }
    except Exception as e:
        print(f"Error calculating metrics: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error calculating metrics: {str(e)}")
    finally:
        if conn:
            conn.close()

# Get all entities and their branches
@app.get("/entities")
def get_entities():
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get unique entities
        cursor.execute("SELECT DISTINCT entity FROM inventory_management.demo_inventory ORDER BY entity")
        entities = [row["entity"] for row in cursor.fetchall()]
        
        # Get branches for each entity
        entity_branches = {}
        for entity in entities:
            cursor.execute(
                "SELECT DISTINCT branch FROM inventory_management.demo_inventory WHERE entity = %s ORDER BY branch",
                (entity,)
            )
            entity_branches[entity] = [row["branch"] for row in cursor.fetchall()]
        
        cursor.close()
        return {
            "entities": entities,
            "entityBranches": entity_branches
        }
    except Exception as e:
        print(f"Error retrieving entities: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error retrieving entities: {str(e)}")
    finally:
        if conn:
            conn.close()

# Get metrics for a specific entity
@app.get("/metrics/{entity}")
def get_entity_metrics(entity: str):
    import time
    start_time = time.time()
    conn = None
    try:
        print(f"Starting metrics request for entity: {entity}")
        conn = get_db_connection()
        connection_time = time.time()
        print(f"Database connection time: {(connection_time - start_time):.3f} seconds")
        
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # First check if entity exists
        cursor.execute("SELECT COUNT(*) AS count FROM inventory_management.demo_inventory WHERE entity = %s", (entity,))
        entity_check_time = time.time()
        print(f"Entity check time: {(entity_check_time - connection_time):.3f} seconds")
        
        row = cursor.fetchone()
        if not row or row["count"] == 0:
            raise HTTPException(status_code=404, detail=f"Entity '{entity}' not found")
        
        # Enhanced metrics query that includes branch-specific counts and both overall and filtered data
        # This way we can provide metrics for all filtering needs from a single query
        main_query_start = time.time()
        print(f"Starting main metrics query for {entity}")
        cursor.execute("""
            WITH status_counts AS (
                SELECT 
                    branch,
                    COUNT(*) AS item_count,
                    SUM(CASE WHEN status = 'excess' THEN 1 ELSE 0 END) AS excess_count,
                    SUM(CASE WHEN status = 'low' THEN 1 ELSE 0 END) AS low_stock_count,
                    SUM(CASE WHEN status = 'dead' THEN 1 ELSE 0 END) AS dead_stock_count,
                    SUM("Inventory Balance") AS inventory_value
                FROM inventory_management.demo_inventory
                WHERE entity = %s
                GROUP BY branch
            ),
            overall_counts AS (
                SELECT 
                    COUNT(*) AS total_skus,
                    SUM(CASE WHEN status = 'excess' THEN 1 ELSE 0 END) AS excess_items,
                    SUM(CASE WHEN status = 'low' THEN 1 ELSE 0 END) AS low_stock_items,
                    SUM(CASE WHEN status = 'dead' THEN 1 ELSE 0 END) AS dead_stock_items,
                    SUM("Inventory Balance") AS total_inventory_value
                FROM inventory_management.demo_inventory
                WHERE entity = %s
            )
            SELECT 
                oc.total_skus, 
                oc.excess_items, 
                oc.low_stock_items, 
                oc.dead_stock_items, 
                oc.total_inventory_value,
                json_agg(json_build_object(
                    'branch', sc.branch,
                    'itemCount', sc.item_count,
                    'excessCount', sc.excess_count,
                    'lowStockCount', sc.low_stock_count,
                    'deadStockCount', sc.dead_stock_count,
                    'inventoryValue', sc.inventory_value
                )) AS branch_metrics
            FROM overall_counts oc, status_counts sc
            GROUP BY oc.total_skus, oc.excess_items, oc.low_stock_items, oc.dead_stock_items, oc.total_inventory_value
        """, (entity, entity))
        
        main_query_end = time.time()
        print(f"Main metrics query completed in {(main_query_end - main_query_start):.3f} seconds")
        
        metrics = cursor.fetchone()
        
        # Calculate inventory turnover rate
        # COGS = (Quantity On Hand + TTM Qty Used) * Average Cost
        # Inventory Turns = COGS / Inventory Balance
        inventory_turns_start = time.time()
        print(f"Starting inventory turns calculation for {entity}")
        
        inventory_turns = None
        
        # Calculate inventory turns for all entities including HCN
        cursor.execute("""
            SELECT 
                SUM("Inventory Balance") AS total_inventory_value,
                SUM(("Sum of Quantity On Hand" + COALESCE("Sum of TTM Qty Used", 0)) * COALESCE("_Average Cost", 0)) AS total_cogs
            FROM inventory_management.demo_inventory
            WHERE entity = %s
        """, (entity,))
        
        turns_row = cursor.fetchone()
        
        if turns_row and turns_row["total_inventory_value"] and turns_row["total_inventory_value"] > 0:
            inventory_turns = turns_row["total_cogs"] / turns_row["total_inventory_value"]
                
            # Print for debugging
            print(f"Entity: {entity}")
            print(f"Inventory Turns: {inventory_turns}")
            print(f"Total COGS: {turns_row['total_cogs'] if turns_row else 'N/A'}")
            print(f"Total Inventory Value: {turns_row['total_inventory_value'] if turns_row else 'N/A'}")
            
            # Ensure we have a value (but don't force a fake one)
            # Only default to 0 if it's None after calculation
            if inventory_turns is None:
                inventory_turns = 0
                
        inventory_turns_end = time.time()
        print(f"Inventory turns calculation completed in {(inventory_turns_end - inventory_turns_start):.3f} seconds")
                
        # Get branches for this entity
        branches_start = time.time()
        print(f"Starting branches query for {entity}")
        
        cursor.execute(
            "SELECT DISTINCT branch FROM inventory_management.demo_inventory WHERE entity = %s ORDER BY branch",
            (entity,)
        )
        branches = [row["branch"] for row in cursor.fetchall()]
        
        branches_end = time.time()
        print(f"Branches query completed in {(branches_end - branches_start):.3f} seconds")
        
        # Extract branch metrics from the query result
        branch_metrics = metrics["branch_metrics"] if metrics and "branch_metrics" in metrics else []
        
        cursor.close()
        
        response_data = {
            "entity": entity,
            "totalSKUs": safe_convert(metrics["total_skus"], int),
            "excessItems": safe_convert(metrics["excess_items"], int),
            "lowStockItems": safe_convert(metrics["low_stock_items"], int),
            "deadStockItems": safe_convert(metrics["dead_stock_items"], int),
            "totalInventoryValue": safe_convert(metrics["total_inventory_value"], float),
            "inventoryTurnover": safe_convert(inventory_turns, float),
            "branchCount": len(branches),
            "branches": branches,
            "branchMetrics": branch_metrics,  # Add branch-specific metrics for client-side filtering
            "filterCounts": {
                "total": safe_convert(metrics["total_skus"], int),
                "excess": safe_convert(metrics["excess_items"], int),
                "low": safe_convert(metrics["low_stock_items"], int),
                "dead": safe_convert(metrics["dead_stock_items"], int)
            }
        }
        
        total_time = time.time() - start_time
        print(f"Total metrics API processing time for {entity}: {total_time:.3f} seconds")
        
        return response_data
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error calculating entity metrics: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error calculating entity metrics: {str(e)}")
    finally:
        if conn:
            conn.close()

# Get filter counts for a specific entity
@app.get("/filtercounts/{entity}")
def get_filter_counts(entity: str, branch: str = None, search: str = None): # ADDED search parameter
    """Get filtered item counts for tabs (overview, excess, low stock, dead stock)"""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Build the query with optional branch filter
        params = [entity]
        where_clause = "WHERE entity = %s"
        
        if branch:
            where_clause += " AND branch = %s"
            params.append(branch)

        # Add search filter if specified
        search_param_value = None
        if search:
            search_param_value = f"%{search}%"
            search_conditions = []
            search_fields = ["mfgpartnbr", "description", "mfgname", "partnbr"] 
            for field in search_fields:
                search_conditions.append(f"{field} ILIKE %s")
                params.append(search_param_value)
            
            if search_conditions:
                 where_clause += f" AND ({' OR '.join(search_conditions)})"

        print(f"DEBUG: get_filter_counts - WHERE CLAUSE for main query: {where_clause}") # DEBUG
        print(f"DEBUG: get_filter_counts - PARAMS for main query: {params}")       # DEBUG

        # Execute the enhanced query with counts by status AND inventory values
        query = f"""
            SELECT 
                COUNT(*) AS total_items,
                SUM(CASE WHEN status = 'excess' THEN 1 ELSE 0 END) AS excess_items,
                SUM(CASE WHEN status = 'low' THEN 1 ELSE 0 END) AS low_stock_items,
                SUM(CASE WHEN status = 'dead' THEN 1 ELSE 0 END) AS dead_stock_items,
                SUM("Inventory Balance") AS total_value,
                SUM(CASE WHEN status = 'excess' THEN "Inventory Balance" ELSE 0 END) AS excess_value,
                SUM(CASE WHEN status = 'low' THEN "Inventory Balance" ELSE 0 END) AS low_value,
                SUM(CASE WHEN status = 'dead' THEN "Inventory Balance" ELSE 0 END) AS dead_value,
                SUM("Sum of Quantity On Hand") AS total_quantity,
                SUM(CASE WHEN status = 'excess' THEN "Sum of Quantity On Hand" ELSE 0 END) AS excess_quantity,
                SUM(CASE WHEN status = 'low' THEN "Sum of Quantity On Hand" ELSE 0 END) AS low_quantity,
                SUM(CASE WHEN status = 'dead' THEN "Sum of Quantity On Hand" ELSE 0 END) AS dead_quantity,
                COUNT(DISTINCT branch) AS branch_count
            FROM inventory_management.demo_inventory
            {where_clause}
        """
        
        cursor.execute(query, tuple(params)) 
        counts = cursor.fetchone()
        print(f"DEBUG: /filtercounts/{entity} - raw counts from DB (with search='{search}'): {counts}")
        
        # Calculate inventory turnover for each filter type
        # The where_clause and params already include the search filter if it was provided
        print(f"DEBUG: get_filter_counts - WHERE CLAUSE for turnover query: {where_clause}") # DEBUG
        print(f"DEBUG: get_filter_counts - PARAMS for turnover query: {params}")       # DEBUG
        turnover_query = f"""
            WITH filter_data AS (
                SELECT 
                    status,
                    "Inventory Balance",
                    "Sum of Quantity On Hand",
                    COALESCE("Sum of TTM Qty Used", 0) AS ttm_qty,
                    COALESCE("_Average Cost", 0) AS avg_cost
                FROM inventory_management.demo_inventory
                {where_clause}
            )
            SELECT 
                SUM("Inventory Balance") AS total_value,
                SUM(("Sum of Quantity On Hand" + ttm_qty) * avg_cost) AS total_cogs,
                SUM(CASE WHEN status = 'excess' THEN "Inventory Balance" ELSE 0 END) AS excess_value,
                SUM(CASE WHEN status = 'excess' THEN ("Sum of Quantity On Hand" + ttm_qty) * avg_cost ELSE 0 END) AS excess_cogs,
                SUM(CASE WHEN status = 'low' THEN "Inventory Balance" ELSE 0 END) AS low_value,
                SUM(CASE WHEN status = 'low' THEN ("Sum of Quantity On Hand" + ttm_qty) * avg_cost ELSE 0 END) AS low_cogs,
                SUM(CASE WHEN status = 'dead' THEN "Inventory Balance" ELSE 0 END) AS dead_value,
                SUM(CASE WHEN status = 'dead' THEN ("Sum of Quantity On Hand" + ttm_qty) * avg_cost ELSE 0 END) AS dead_cogs
            FROM filter_data
        """
        
        cursor.execute(turnover_query, tuple(params))
        turnover_data = cursor.fetchone()
        
        # Calculate inventory turns for each category
        total_turns = 0.0
        excess_turns = 0.0
        low_turns = 0.0
        dead_turns = 0.0
        
        if turnover_data:
            # Overall turns
            if turnover_data["total_value"] and turnover_data["total_value"] > 0:
                total_turns = turnover_data["total_cogs"] / turnover_data["total_value"]
                
            # Excess turns
            if turnover_data["excess_value"] and turnover_data["excess_value"] > 0:
                excess_turns = turnover_data["excess_cogs"] / turnover_data["excess_value"]
                
            # Low stock turns
            if turnover_data["low_value"] and turnover_data["low_value"] > 0:
                low_turns = turnover_data["low_cogs"] / turnover_data["low_value"]
                
            # Dead stock turns
            if turnover_data["dead_value"] and turnover_data["dead_value"] > 0:
                dead_turns = turnover_data["dead_cogs"] / turnover_data["dead_value"]
        
        cursor.close()
        
        return {
            "entity": entity,
            "branch": branch,
            "totalItems": safe_convert(counts["total_items"], int),
            "excessItems": safe_convert(counts["excess_items"], int),
            "lowStockItems": safe_convert(counts["low_stock_items"], int),
            "deadStockItems": safe_convert(counts["dead_stock_items"], int),
            "summaries": {
                "overview": {
                    "totalValue": safe_convert(counts["total_value"], float),
                    "totalQuantity": safe_convert(counts["total_quantity"], int),
                    "branchCount": safe_convert(counts["branch_count"], int),
                    "inventoryTurnover": safe_convert(total_turns, float)
                },
                "excess": {
                    "totalValue": safe_convert(counts["excess_value"], float),
                    "totalQuantity": safe_convert(counts["excess_quantity"], int),
                    "branchCount": safe_convert(counts["branch_count"], int),
                    "inventoryTurnover": safe_convert(excess_turns, float)
                },
                "lowStock": {
                    "totalValue": safe_convert(counts["low_value"], float),
                    "totalQuantity": safe_convert(counts["low_quantity"], int),
                    "branchCount": safe_convert(counts["branch_count"], int),
                    "inventoryTurnover": safe_convert(low_turns, float)
                },
                "deadStock": {
                    "totalValue": safe_convert(counts["dead_value"], float),
                    "totalQuantity": safe_convert(counts["dead_quantity"], int),
                    "branchCount": safe_convert(counts["branch_count"], int),
                    "inventoryTurnover": safe_convert(dead_turns, float)
                }
            }
        }
    
    except Exception as e:
        print(f"Error fetching filter counts: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching filter counts: {str(e)}")
    finally:
        if conn:
            conn.close()

# Get inventory for a specific entity with options to filter by branch and search text
@app.get("/inventory/{entity}")
def get_entity_inventory(
    entity: str,
    limit: int = 20,
    offset: int = 0,
    search: str = None,
    branch: str = None,
    status: str = None,
    network_status: str = None,
    sort_by: str = "mfgPartNumber",
    sort_dir: str = "asc"
):
    """
    Get inventory items filtered by entity with full pagination, sorting and filtering support
    - limit: Number of items to return (default 20, 0 for all items)
    - offset: Pagination offset (starting position)
    - search: Search text to filter items
    - branch: Filter by branch
    - status: Filter by status (excess, low, dead)
    - network_status: Filter by network status (optional)
    - sort_by: Field to sort by (mfgPartNumber, inventoryBalance, partNumber, etc.)
    - sort_dir: Sort direction (asc or desc)
    """
    import time
    start_time = time.time()
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Build query parameters
        params = [entity]
        
        # Build query
        query = """
            SELECT *
            FROM inventory_management.demo_inventory
            WHERE entity = %s AND "branch" != 'Corporate'
        """
        
        # Add branch filter if specified
        if branch:
            query += " AND branch = %s"
            params.append(branch)
        
        # Add status filter if specified
        if status:
            if status == 'excess':
                query += " AND status = 'excess'"
            elif status == 'low':
                query += " AND status = 'low'"
            elif status == 'dead':
                query += " AND status = 'dead'"
            # 'overview' or other values don't need filtering
        
        # Add network status filter if specified
        if network_status:
            query += " AND \"Network Status\" = %s"
            params.append(network_status)
        
        # Add search filter if specified
        if search:
            query += """ 
                AND (
                    mfgpartnbr ILIKE %s OR
                    description ILIKE %s OR
                    mfgname ILIKE %s OR
                    partnbr ILIKE %s
                )
            """
            search_param = f"%{search}%"
            params.extend([search_param, search_param, search_param, search_param])
        
        # Get total count first (for pagination and metrics)
        count_query = f"""
        SELECT 
            COUNT(*) AS total,
            SUM(CASE WHEN status = 'excess' THEN 1 ELSE 0 END) AS excess_count,
            SUM(CASE WHEN status = 'low' THEN 1 ELSE 0 END) AS low_count,
            SUM(CASE WHEN status = 'dead' THEN 1 ELSE 0 END) AS dead_count,
            SUM("Inventory Balance") AS total_value
        FROM ({query}) AS filtered
        """
        cursor.execute(count_query, params)
        count_data = cursor.fetchone()
        total_count = count_data["total"]
        
        if total_count == 0:
            # No results found
            return {
                "items": [],
                "totalCount": 0,
                "limit": limit,
                "offset": offset,
                "hasMore": False,
                "metrics": {
                    "totalSKUs": 0,
                    "excessItems": 0,
                    "lowStockItems": 0,
                    "deadStockItems": 0,
                    "totalInventoryValue": 0
                }
            }
        
        # Map API sort fields to database fields
        sort_field_map = {
            "inventoryBalance": "Inventory Balance",
            "mfgPartNumber": "mfgpartnbr",
            "partNumber": "partnbr",
            "description": "description",
            "quantityOnHand": "Sum of Quantity On Hand",
            "monthsOfCoverage": "Months of Coverage",  # Updated from "Months to Burn"
            "ttmQtyUsed": "Sum of TTM Qty Used",
            "lastReceipt": "Last Receipt",
            "companyStatus": "Network Status"
            # Add more mappings as needed
        }
        
        # Get the database field name, default to "Inventory Balance" if not mapped
        db_sort_field = sort_field_map.get(sort_by, "Inventory Balance")
        
        # Add sorting with special handling for monthsOfCoverage
        sort_direction = "DESC" if sort_dir.lower() == "desc" else "ASC"
        if sort_by == "monthsOfCoverage":
            # For monthsOfCoverage, treat "Infinity" as the highest value
            query += f''' ORDER BY 
                CASE 
                    WHEN "Months to Burn" = 'Infinity' THEN 
                        CASE WHEN '{sort_direction}' = 'ASC' THEN 1 ELSE 0 END
                    ELSE 
                        CASE WHEN '{sort_direction}' = 'ASC' THEN 0 ELSE 1 END
                END,
                CAST("Months to Burn" AS FLOAT) {sort_direction}'''
        else:
            query += f' ORDER BY "{db_sort_field}" {sort_direction}'
        
        # Only add a limit if limit > 0 (limit=0 means no limit)
        if limit > 0:
            query += " LIMIT %s"
            params.append(limit)
            
            # Add offset for pagination
            if offset > 0:
                query += " OFFSET %s"
                params.append(offset)
        # If limit=0, don't add any limit to the query to return all records
        
        # Execute query
        print(f"Executing query: {query} with params: {params}")
        cursor.execute(query, params)
        rows = cursor.fetchall()
        
        # Convert to API format with efficient batch processing
        result = convert_db_rows_to_api_format(rows, offset)
        
        # Calculate metrics from the count query results
        metrics = {
            "totalSKUs": safe_convert(count_data["total"], int),
            "excessItems": safe_convert(count_data["excess_count"], int),
            "lowStockItems": safe_convert(count_data["low_count"], int),
            "deadStockItems": safe_convert(count_data["dead_count"], int),
            "totalInventoryValue": safe_convert(count_data["total_value"], float)
        }
        
        # Get inventory turnover metrics (only if we don't already have it from another endpoint)
        # Calculate inventory turnover rate if needed (skip this if querying specific status)
        inventory_turns = 0.0
        if not status and entity != 'HCN':
            turns_query = """
                SELECT 
                    SUM("Inventory Balance") AS total_inventory_value,
                    SUM(("Sum of Quantity On Hand" + COALESCE("Sum of TTM Qty Used", 0)) * COALESCE("_Average Cost", 0)) AS total_cogs
                FROM inventory_management.demo_inventory
                WHERE entity = %s AND "branch" != 'Corporate'
            """
            cursor.execute(turns_query, [entity])
            turns_row = cursor.fetchone()
            
            if turns_row and turns_row["total_inventory_value"] and turns_row["total_inventory_value"] > 0:
                inventory_turns = turns_row["total_cogs"] / turns_row["total_inventory_value"]
                
            print(f"Inventory Turns: {inventory_turns}")
            
        metrics["inventoryTurnover"] = safe_convert(inventory_turns, float)
        
        cursor.close()
        
        total_time = time.time() - start_time
        print(f"Total API processing time: {total_time:.3f} seconds")
        
        # Return with pagination metadata and metrics
        return {
            "items": result,
            "totalCount": total_count,
            "limit": limit,
            "offset": offset,
            "hasMore": offset + len(result) < total_count,
            "metrics": metrics,
            "executionTime": f"{total_time:.3f}s"
        }
    except Exception as e:
        print(f"Error retrieving entity inventory: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error retrieving entity inventory: {str(e)}")
    finally:
        if conn:
            conn.close()

# NEW ENDPOINT FOR ADVANCED FILTERED INVENTORY ITEMS
@app.get("/inventory/advanced", response_model=Dict[str, Any])
def get_advanced_inventory(
    limit: int = 20,
    offset: int = 0,
    search: str = None,
    entities: str = None, # Comma-separated list of entity names
    branches: str = None, # Comma-separated list of branch names
    status: str = None,
    network_status: str = None,
    sort_by: str = "mfgPartNumber",
    sort_dir: str = "asc"
):
    """
    Get inventory items based on advanced filters with pagination, sorting.
    - entities: Comma-separated list of entity names
    - branches: Comma-separated list of branch names
    """
    import time
    start_time = time.time()
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        entity_list = [e.strip() for e in entities.split(',') if e.strip()] if entities else []
        branch_list = [b.strip() for b in branches.split(',') if b.strip()] if branches else []

        print(f"Advanced inventory request: entities={entity_list}, branches={branch_list}, search={search}, status={status}, limit={limit}, offset={offset}")

        # Build query parameters
        sql_params = []
        
        # Build base query
        query_parts = ["SELECT * FROM inventory_management.demo_inventory WHERE 1=1"]
        count_query_parts = ["SELECT COUNT(*) AS total, SUM(\"Inventory Balance\") AS total_value FROM inventory_management.demo_inventory WHERE 1=1"] # Basic count and value

        # Add entity filter if specified
        if entity_list:
            entity_placeholders = ', '.join(['%s'] * len(entity_list))
            entity_condition = f"entity IN ({entity_placeholders})"
            query_parts.append(f"AND {entity_condition}")
            count_query_parts.append(f"AND {entity_condition}")
            sql_params.extend(entity_list)
            
        # Add branch filter if specified
        if branch_list:
            branch_placeholders = ', '.join(['%s'] * len(branch_list))
            branch_condition = f"branch IN ({branch_placeholders})"
            query_parts.append(f"AND {branch_condition}")
            count_query_parts.append(f"AND {branch_condition}")
            sql_params.extend(branch_list)
        
        # Add status filter if specified
        if status and status != 'overview': # 'overview' or other values don't need specific status filtering for items
            status_condition = "status = %s"
            query_parts.append(f"AND {status_condition}")
            count_query_parts.append(f"AND {status_condition}")
            sql_params.append(status)
        
        # Add network status filter if specified
        if network_status:
            network_status_condition = "\"Network Status\" = %s"
            query_parts.append(f"AND {network_status_condition}")
            count_query_parts.append(f"AND {network_status_condition}")
            sql_params.append(network_status)
        
        # Add search filter if specified
        if search:
            search_condition = """ 
                (
                    mfgpartnbr ILIKE %s OR
                    description ILIKE %s OR
                    mfgname ILIKE %s OR
                    partnbr ILIKE %s OR
                    entity ILIKE %s OR
                    branch ILIKE %s
                )
            """
            query_parts.append(f"AND {search_condition}")
            count_query_parts.append(f"AND {search_condition}")
            search_param = f"%{search}%"
            sql_params.extend([search_param] * 6) # Add search param for each field
        
        # Construct the final WHERE clause for the count query
        # The count query needs its own parameter list if search params are different or not applied in the same way.
        # For simplicity here, we'll assume the sql_params built so far are applicable for the count query as well.
        # If search parameters were structured differently for count vs main query, this would need adjustment.
        
        final_count_query_str = ' '.join(count_query_parts)
        print(f"Executing count query: {final_count_query_str} with params: {sql_params}")
        cursor.execute(final_count_query_str, tuple(sql_params)) # Ensure params is a tuple
        count_data = cursor.fetchone()
        total_count = count_data["total"] if count_data else 0
        total_value_for_filtered_items = count_data["total_value"] if count_data and count_data["total_value"] is not None else 0


        if total_count == 0:
            return {
                "items": [], "totalCount": 0, "limit": limit, "offset": offset, "hasMore": False,
                "metrics": { "totalSKUs": 0, "totalInventoryValue": 0 } # Simplified metrics for item list
            }
        
        # Map API sort fields to database fields
        sort_field_map = {
            "inventoryBalance": "Inventory Balance", "mfgPartNumber": "mfgpartnbr",
            "partNumber": "partnbr", "description": "description",
            "quantityOnHand": "Sum of Quantity On Hand", "monthsOfCoverage": "Months to Burn",
            "ttmQtyUsed": "Sum of TTM Qty Used", "entity": "entity", "branch": "branch",
            "lastReceipt": "Last Receipt",
            "companyStatus": "Network Status"
        }
        db_sort_field = sort_field_map.get(sort_by, "mfgpartnbr") # Default to mfgpartnbr
        sort_direction = "DESC" if sort_dir.lower() == "desc" else "ASC"
        
        query_parts.append(f'ORDER BY "{db_sort_field}" {sort_direction}')
        
        item_query_params = list(sql_params) # Create a copy for item query

        if limit > 0:
            query_parts.append("LIMIT %s")
            item_query_params.append(limit)
            if offset > 0:
                query_parts.append("OFFSET %s")
                item_query_params.append(offset)
        
        final_item_query_str = ' '.join(query_parts)
        print(f"Executing item query: {final_item_query_str} with params: {item_query_params}")
        cursor.execute(final_item_query_str, tuple(item_query_params))
        rows = cursor.fetchall()
        
        result = convert_db_rows_to_api_format(rows, offset)
        cursor.close()
        
        total_time = time.time() - start_time
        return {
            "items": result, "totalCount": total_count, "limit": limit, "offset": offset,
            "hasMore": offset + len(result) < total_count,
            "metrics": { # Basic metrics relevant to the item list shown
                "totalSKUs": total_count, # SKUs matching the advanced filter
                "totalInventoryValue": safe_convert(total_value_for_filtered_items, float)
            },
            "executionTime": f"{total_time:.3f}s"
        }
    except Exception as e:
        print(f"Error retrieving advanced filtered inventory: {str(e)}")
        # Log full traceback here for better debugging if possible
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error retrieving advanced filtered inventory: {str(e)}")
    finally:
        if conn:
            conn.close()

# User authorization models
class UserData(BaseModel):
    email: str
    name: Optional[str] = ""

# Authentication endpoint for Azure AD / Entra ID user whitelist check
@app.post("/auth/verify")
def verify_user(user_data: UserData):
    conn = None
    try:
        email = user_data.email.lower()  # Convert to lowercase for case-insensitive matching
        name = user_data.name
        
        # Log authentication attempt for debugging
        print(f"Authentication attempt - Email: {email}, Name: {name}")
        
        # Validate email format
        if not email or '@' not in email:
            print(f"Invalid email format: {email}")
            return {
                "authorized": False,
                "message": "Invalid email format. Authentication failed."
            }
        
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Debug: Check what users are in the whitelist
        cursor.execute("SELECT email FROM inventory_management.authorized_users WHERE enabled = TRUE")
        whitelist = [row["email"] for row in cursor.fetchall()]
        print(f"Current whitelist: {whitelist}")
        
        # Use a simplified case-insensitive database query 
        # This will match regardless of case differences
        cursor.execute(
            "SELECT * FROM inventory_management.authorized_users WHERE LOWER(email) = LOWER(%s) AND enabled = TRUE",
            (email,)
        )
        
        user = cursor.fetchone()
        
        # Log authorization result
        if user:
            print(f"User authorized: {email}")
        else:
            print(f"User NOT authorized (not in whitelist): {email}")
        
        # Final authorization decision
        if user:
            # User found in whitelist, update last login time and name if provided
            update_query = """
                UPDATE inventory_management.authorized_users 
                SET last_login = CURRENT_TIMESTAMP,
                    name = CASE WHEN %s <> '' AND name IS NULL THEN %s ELSE name END
                WHERE email = %s
            """
            cursor.execute(update_query, (name, name, email))
            
            return {
                "authorized": True,
                "user": {
                    "email": user["email"],
                    "name": name or user["name"],
                    "role": user["role"]
                }
            }
        else:
            # User not found in whitelist
            return {
                "authorized": False,
                "message": "You are not authorized to access this application. Please contact your administrator."
            }
            
    except Exception as e:
        print(f"Error verifying user: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error verifying user: {str(e)}")
    finally:
        if conn:
            conn.close()

# Get complete metrics for all entities
@app.get("/metrics/all/complete")
def get_all_complete_metrics():
    """Get comprehensive metrics across all entities for the KeyMetrics component"""
    print("GET /metrics/all/complete endpoint called!")  # Debug line to confirm endpoint is being hit
    import time
    start_time = time.time()
    conn = None
    try:
        print("Attempting to connect to database for All Entities metrics")
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Enhanced metrics query that includes entity counts and overall data
        # Following the same pattern as entity-specific metrics
        main_query_start = time.time()
        print("Starting main metrics query for All Entities")
        
        # Get basic metrics with status counts
        cursor.execute("""
            WITH status_counts AS (
                SELECT 
                    entity,
                    COUNT(*) AS item_count,
                    SUM(CASE WHEN status = 'excess' THEN 1 ELSE 0 END) AS excess_count,
                    SUM(CASE WHEN status = 'low' THEN 1 ELSE 0 END) AS low_stock_count,
                    SUM(CASE WHEN status = 'dead' THEN 1 ELSE 0 END) AS dead_stock_count,
                    SUM("Inventory Balance") AS inventory_value
                FROM inventory_management.demo_inventory
                GROUP BY entity
            ),
            overall_counts AS (
                SELECT 
                    COUNT(*) AS total_skus,
                    SUM(CASE WHEN status = 'excess' THEN 1 ELSE 0 END) AS excess_items,
                    SUM(CASE WHEN status = 'low' THEN 1 ELSE 0 END) AS low_stock_items,
                    SUM(CASE WHEN status = 'dead' THEN 1 ELSE 0 END) AS dead_stock_items,
                    SUM("Inventory Balance") AS total_inventory_value,
                    COUNT(DISTINCT entity) AS entity_count,
                    COUNT(DISTINCT branch) AS branch_count
                FROM inventory_management.demo_inventory
            )
            SELECT 
                oc.total_skus, 
                oc.excess_items, 
                oc.low_stock_items, 
                oc.dead_stock_items, 
                oc.total_inventory_value,
                oc.entity_count,
                oc.branch_count
            FROM overall_counts oc
        """)
        
        main_query_end = time.time()
        print(f"Main metrics query completed in {(main_query_end - main_query_start):.3f} seconds")
        
        metrics = cursor.fetchone()
        
        # Calculate inventory turnover rate - including all entities
        # COGS = (Quantity On Hand + TTM Qty Used) * Average Cost
        # Inventory Turns = COGS / Inventory Balance
        inventory_turns_start = time.time()
        print("Starting inventory turns calculation for All Entities")
        
        cursor.execute("""
            SELECT 
                SUM("Inventory Balance") AS total_inventory_value,
                SUM(("Sum of Quantity On Hand" + COALESCE("Sum of TTM Qty Used", 0)) * COALESCE("_Average Cost", 0)) AS total_cogs
            FROM inventory_management.demo_inventory
        """)
        
        turns_row = cursor.fetchone()
        inventory_turns = 0.0
        
        if turns_row and turns_row["total_inventory_value"] and turns_row["total_inventory_value"] > 0:
            inventory_turns = turns_row["total_cogs"] / turns_row["total_inventory_value"]
            
        # Print for debugging
        print(f"All Entities Inventory Turns: {inventory_turns}")
        print(f"Total COGS: {turns_row['total_cogs'] if turns_row else 'N/A'}")
        print(f"Total Inventory Value: {turns_row['total_inventory_value'] if turns_row else 'N/A'}")
        
        inventory_turns_end = time.time()
        print(f"Inventory turns calculation completed in {(inventory_turns_end - inventory_turns_start):.3f} seconds")
        
        # Get all entities and branches for completeness
        entity_branches_start = time.time()
        print("Starting entities and branches query for All Entities")
        
        cursor.execute("SELECT DISTINCT entity FROM inventory_management.demo_inventory ORDER BY entity")
        entities = [row["entity"] for row in cursor.fetchall()]
        
        cursor.execute("SELECT DISTINCT branch FROM inventory_management.demo_inventory ORDER BY branch")
        branches = [row["branch"] for row in cursor.fetchall()]
        
        entity_branches_end = time.time()
        print(f"Entities and branches query completed in {(entity_branches_end - entity_branches_start):.3f} seconds")
        
        cursor.close()
        
        # Format the response data to match entity-specific format
        response_data = {
            "entity": "All Entities",
            "totalSKUs": safe_convert(metrics["total_skus"], int),
            "excessItems": safe_convert(metrics["excess_items"], int),
            "lowStockItems": safe_convert(metrics["low_stock_items"], int),
            "deadStockItems": safe_convert(metrics["dead_stock_items"], int),
            "totalInventoryValue": safe_convert(metrics["total_inventory_value"], float),
            "inventoryTurnover": safe_convert(inventory_turns, float),
            "entityCount": safe_convert(metrics["entity_count"], int),
            "branchCount": safe_convert(metrics["branch_count"], int),
            "entities": entities,
            "branches": branches,
            "filterCounts": {
                "total": safe_convert(metrics["total_skus"], int),
                "excess": safe_convert(metrics["excess_items"], int),
                "low": safe_convert(metrics["low_stock_items"], int),
                "dead": safe_convert(metrics["dead_stock_items"], int)
            }
        }
        
        total_time = time.time() - start_time
        print(f"Total metrics API processing time for All Entities: {total_time:.3f} seconds")
        
        return response_data
    except Exception as e:
        print(f"Error calculating complete metrics for all entities: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error calculating complete metrics for all entities: {str(e)}")
    finally:
        if conn:
            conn.close()

# Get filter counts for all entities
@app.get("/filtercounts/all")
def get_all_filter_counts(search: str = None):
    """Get filter counts across all entities (overview, excess, low stock, dead stock)"""
    print("---- CHECKING API CODE VERSION FOR /filtercounts/all ----") # NEW MARKER
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # ADD DEBUGGING FOR SESSION CONTEXT
        cursor.execute("SELECT current_user, session_user, current_setting('search_path') AS search_path;")
        session_context = cursor.fetchone()
        print(f"DEBUG: /filtercounts/all - DB Session Context: User={session_context['current_user']}, SessionUser={session_context['session_user']}, SearchPath={session_context['search_path']}")
        
        # Build the query with optional search filter
        params = []
        where_clause = ""
        if search:
            search_param = f"%{search}%"
            # Updated search fields to be more comprehensive
            search_fields = ["mfgpartnbr", "description", "mfgname", "partnbr", "entity", "branch"]
            search_conditions = []
            for field in search_fields:
                # Corrected: Removed double quotes around the field name
                search_conditions.append(f'{field} ILIKE %s')
                params.append(search_param)
            where_clause = f"WHERE {' OR '.join(search_conditions)}"
            print(f"DEBUG: /filtercounts/all - Constructed WHERE clause: {where_clause}")


        # Execute the query with counts by status AND inventory values
        query = f"""
            SELECT 
                COUNT(*) AS total_items,
                SUM(CASE WHEN status = 'excess' THEN 1 ELSE 0 END) AS excess_items,
                SUM(CASE WHEN status = 'low' THEN 1 ELSE 0 END) AS low_stock_items,
                SUM(CASE WHEN status = 'dead' THEN 1 ELSE 0 END) AS dead_stock_items,
                SUM("Inventory Balance") AS total_value,
                SUM(CASE WHEN status = 'excess' THEN "Inventory Balance" ELSE 0 END) AS excess_value,
                SUM(CASE WHEN status = 'low' THEN "Inventory Balance" ELSE 0 END) AS low_value,
                SUM(CASE WHEN status = 'dead' THEN "Inventory Balance" ELSE 0 END) AS dead_value,
                SUM("Sum of Quantity On Hand") AS total_quantity,
                SUM(CASE WHEN status = 'excess' THEN "Sum of Quantity On Hand" ELSE 0 END) AS excess_quantity,
                SUM(CASE WHEN status = 'low' THEN "Sum of Quantity On Hand" ELSE 0 END) AS low_quantity,
                SUM(CASE WHEN status = 'dead' THEN "Sum of Quantity On Hand" ELSE 0 END) AS dead_quantity,
                COUNT(DISTINCT entity) AS entity_count,
                COUNT(DISTINCT branch) AS branch_count
            FROM inventory_management.demo_inventory
            {where_clause}
        """
        
        cursor.execute(query, tuple(params))
        counts = cursor.fetchone()
        print(f"DEBUG: /filtercounts/all - raw counts from DB (with search='{search}'): {counts}")
        
        # Calculate inventory turnover for each filter type
        # The where_clause and params already include the search filter if it was provided
        turnover_query = f"""
            WITH filter_data AS (
                SELECT 
                    status,
                    "Inventory Balance",
                    "Sum of Quantity On Hand",
                    COALESCE("Sum of TTM Qty Used", 0) AS ttm_qty,
                    COALESCE("_Average Cost", 0) AS avg_cost
                FROM inventory_management.demo_inventory
                {where_clause}
            )
            SELECT 
                SUM("Inventory Balance") AS total_value,
                SUM(("Sum of Quantity On Hand" + ttm_qty) * avg_cost) AS total_cogs,
                SUM(CASE WHEN status = 'excess' THEN "Inventory Balance" ELSE 0 END) AS excess_value,
                SUM(CASE WHEN status = 'excess' THEN ("Sum of Quantity On Hand" + ttm_qty) * avg_cost ELSE 0 END) AS excess_cogs,
                SUM(CASE WHEN status = 'low' THEN "Inventory Balance" ELSE 0 END) AS low_value,
                SUM(CASE WHEN status = 'low' THEN ("Sum of Quantity On Hand" + ttm_qty) * avg_cost ELSE 0 END) AS low_cogs,
                SUM(CASE WHEN status = 'dead' THEN "Inventory Balance" ELSE 0 END) AS dead_value,
                SUM(CASE WHEN status = 'dead' THEN ("Sum of Quantity On Hand" + ttm_qty) * avg_cost ELSE 0 END) AS dead_cogs
            FROM filter_data
        """
        
        cursor.execute(turnover_query, tuple(params))
        turnover_data = cursor.fetchone()
        
        # Calculate inventory turns for each category
        total_turns = 0.0
        excess_turns = 0.0
        low_turns = 0.0
        dead_turns = 0.0
        
        if turnover_data:
            # Overall turns
            if turnover_data["total_value"] and turnover_data["total_value"] > 0:
                total_turns = turnover_data["total_cogs"] / turnover_data["total_value"]
                
            # Excess turns
            if turnover_data["excess_value"] and turnover_data["excess_value"] > 0:
                excess_turns = turnover_data["excess_cogs"] / turnover_data["excess_value"]
                
            # Low stock turns
            if turnover_data["low_value"] and turnover_data["low_value"] > 0:
                low_turns = turnover_data["low_cogs"] / turnover_data["low_value"]
                
            # Dead stock turns
            if turnover_data["dead_value"] and turnover_data["dead_value"] > 0:
                dead_turns = turnover_data["dead_cogs"] / turnover_data["dead_value"]
        
        cursor.close()
        
        return {
            "totalItems": safe_convert(counts["total_items"], int),
            "excessItems": safe_convert(counts["excess_items"], int),
            "lowStockItems": safe_convert(counts["low_stock_items"], int),
            "deadStockItems": safe_convert(counts["dead_stock_items"], int),
            "summaries": {
                "overview": {
                    "totalValue": safe_convert(counts["total_value"], float),
                    "totalQuantity": safe_convert(counts["total_quantity"], int),
                    "entityCount": safe_convert(counts["entity_count"], int),
                    "branchCount": safe_convert(counts["branch_count"], int),
                    "inventoryTurnover": safe_convert(total_turns, float)
                },
                "excess": {
                    "totalValue": safe_convert(counts["excess_value"], float),
                    "totalQuantity": safe_convert(counts["excess_quantity"], int),
                    "entityCount": safe_convert(counts["entity_count"], int),
                    "branchCount": safe_convert(counts["branch_count"], int),
                    "inventoryTurnover": safe_convert(excess_turns, float)
                },
                "lowStock": {
                    "totalValue": safe_convert(counts["low_value"], float),
                    "totalQuantity": safe_convert(counts["low_quantity"], int),
                    "entityCount": safe_convert(counts["entity_count"], int),
                    "branchCount": safe_convert(counts["branch_count"], int),
                    "inventoryTurnover": safe_convert(low_turns, float)
                },
                "deadStock": {
                    "totalValue": safe_convert(counts["dead_value"], float),
                    "totalQuantity": safe_convert(counts["dead_quantity"], int),
                    "entityCount": safe_convert(counts["entity_count"], int),
                    "branchCount": safe_convert(counts["branch_count"], int),
                    "inventoryTurnover": safe_convert(dead_turns, float)
                }
            }
        }
    
    except Exception as e:
        print(f"Error fetching all filter counts: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching all filter counts: {str(e)}")
    finally:
        if conn:
            conn.close()

@app.get("/")
def read_root():
    return {"message": "Welcome to ZentroQ Inventory API", "backend": "PostgreSQL"}

@app.get("/part-branch-summary", response_model=Dict[str, List[str]])
async def get_part_branch_summary():
    """
    Provides a summary of which branches each part number exists in.
    Returns a dictionary where keys are part numbers and values are lists of branch names.
    """
    conn = None
    part_branch_map = {}
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Query to get part numbers and an aggregated list of their distinct branches
        # Assuming 'mfgpartnbr' for part number and 'branch' for branch name from 'inventory_management.demo_inventory'
        query = """
            SELECT
                mfgpartnbr AS part_number,
                array_agg(DISTINCT branch) AS branches
            FROM
                inventory_management.demo_inventory
            WHERE
                mfgpartnbr IS NOT NULL AND mfgpartnbr <> '' AND
                branch IS NOT NULL AND branch <> ''
            GROUP BY
                mfgpartnbr;
        """
        cursor.execute(query)
        rows = cursor.fetchall()
        
        for row in rows:
            part_number = row["part_number"]
            branches = row["branches"]
            if part_number and branches: # Ensure part_number and branches list are not null/empty
                part_branch_map[part_number] = sorted(list(set(branches))) # Ensure uniqueness and sort for consistency
        
        cursor.close()
        return part_branch_map
    except psycopg2.Error as db_err:
        print(f"Database error in /part-branch-summary: {db_err}")
        raise HTTPException(status_code=500, detail=f"Database query error: {str(db_err)}")
    except Exception as e:
        print(f"Unexpected error in /part-branch-summary: {e}")
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")
    finally:
        if conn:
            conn.close()

@app.get("/part-details/all/{part_number_str}", response_model=List[InventoryItem])
async def get_part_details_across_all_branches(part_number_str: str):
    """
    Retrieve all inventory items for a specific part number (either internal or MFG) 
    across all entities and branches.
    """
    conn = None
    cursor = None # Initialize cursor to None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        query = """
            SELECT * 
            FROM inventory_management.demo_inventory
            WHERE partnbr = %s OR mfgpartnbr = %s
        """
        
        cursor.execute(query, (part_number_str, part_number_str))
        rows = cursor.fetchall()
        
        if not rows:
            print(f"No part details found for part number: {part_number_str} across all branches.")
            return []
            
        result = convert_db_rows_to_api_format(rows) 
        
        print(f"Successfully fetched {len(result)} records for part number: {part_number_str} across all branches.")
        return result
        
    except Exception as e:
        print(f"Error retrieving part details for {part_number_str} across all branches: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error retrieving part details: {str(e)}")
    finally:
        if cursor: # Check if cursor exists before closing
            cursor.close()
        if conn:
            conn.close()

# NEW Endpoint to submit orders
@app.post("/submit-orders")
async def submit_orders(payload: SubmitOrdersRequest, db_user_email: Optional[str] = Depends(lambda: None)): # db_user_email for future proper auth
    print("@@@ /submit-orders endpoint HIT! Top of function. (Corrected Version Check) @@@") # DIAGNOSTIC
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        submitted_order_ids = []
        
        for order_item in payload.orders:
            print(f"@@@ Processing order item: {order_item.mfg_part_number}, User Email from payload: {order_item.requested_by_user_email} (Corrected Version Check) @@@") # DIAGNOSTIC
            # Basic validation: Ensure required fields for DB are present
            if not order_item.mfg_part_number or not order_item.quantity_requested or not order_item.requesting_branch:
                raise HTTPException(status_code=400, detail="Missing required fields (mfg_part_number, quantity_requested, requesting_branch) for an order item.")

            # The Pydantic model OrderRequestItem allows requested_by_user_email to be Optional[str], so it can be None.
            # The explicit check for it being None and raising an error is commented out here, as intended.
            # # if order_item.requested_by_user_email is None:
            # #     raise HTTPException(status_code=400, detail="User email is required to submit orders.")

            # Insert into the demo_orders table
            # order_status defaults to 'Pending Send' in the database schema, so not explicitly set here.
            query = """
                INSERT INTO inventory_management.demo_orders (
                    mfg_part_number, internal_part_number, item_description, 
                    quantity_requested, vendor_name, notes, requesting_branch, 
                    requested_by_user_email 
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING order_request_id;
            """
            cursor.execute(query, (
                order_item.mfg_part_number,
                order_item.internal_part_number,
                order_item.item_description,
                order_item.quantity_requested,
                order_item.vendor_name,
                order_item.notes,
                order_item.requesting_branch,
                order_item.requested_by_user_email # This will be NULL if frontend sends null
            ))
            new_order_id = cursor.fetchone()[0]
            submitted_order_ids.append(new_order_id)
            
        conn.commit()
        # cursor.close() # Should be in finally
        return {"message": f"Successfully submitted {len(submitted_order_ids)} orders.", "order_ids": submitted_order_ids}

    except HTTPException as http_exc:
        if conn:
            conn.rollback()
        raise http_exc
    except psycopg2.Error as db_err:
        if conn:
            conn.rollback()
        print(f"Database error in /submit-orders: {db_err}") 
        raise HTTPException(status_code=500, detail=f"Database error: {str(db_err)}")
    except Exception as e:
        if conn:
            conn.rollback()
        print(f"General error in /submit-orders: {e}") 
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")
    finally:
        if conn:
            if cursor: # Ensure cursor exists before trying to close
                cursor.close()
            conn.close()

# NEW Pydantic model for returning pending orders (matches table structure more closely for now)
class PendingOrderResponseItem(BaseModel):
    order_request_id: int
    mfg_part_number: str
    internal_part_number: Optional[str] = None
    item_description: Optional[str] = None
    quantity_requested: int
    vendor_name: Optional[str] = None
    notes: Optional[str] = None
    requesting_branch: str
    requested_by_user_email: Optional[str] = None
    requested_at_utc: datetime.datetime 
    last_modified_at_utc: Optional[datetime.datetime] = None # Added
    order_status: str
    # snapshot_unit_price: Optional[float] = None

# Pydantic model for updating order status
class UpdateOrderStatusRequest(BaseModel):
    new_status: str


# NEW Endpoint to get pending orders
@app.get("/pending-orders", response_model=List[PendingOrderResponseItem])
async def get_pending_orders(user_email: Optional[str] = Depends(lambda: None)): # Placeholder for auth based filtering
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        query = """
            SELECT 
                order_request_id, mfg_part_number, internal_part_number, item_description,
                quantity_requested, vendor_name, notes, requesting_branch, 
                requested_by_user_email, requested_at_utc, last_modified_at_utc, order_status
            FROM inventory_management.demo_orders
            WHERE order_status = 'Pending Send' 
            ORDER BY requested_at_utc DESC;
        """
        cursor.execute(query)
        pending_orders = cursor.fetchall()
        cursor.close()
        
        return pending_orders

    except psycopg2.Error as db_err:
        print(f"Database error fetching pending orders: {db_err}")
        raise HTTPException(status_code=500, detail=f"Database error: {db_err}")
    except Exception as e:
        print(f"Error fetching pending orders: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch pending orders: {str(e)}")
    finally:
        if conn:
            conn.close()

# NEW Endpoint to get completed orders
@app.get("/completed-orders", response_model=List[PendingOrderResponseItem])
async def get_completed_orders(user_email: Optional[str] = Depends(lambda: None)):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        query = """
            SELECT 
                order_request_id, mfg_part_number, internal_part_number, item_description,
                quantity_requested, vendor_name, notes, requesting_branch, 
                requested_by_user_email, requested_at_utc, last_modified_at_utc, order_status
            FROM inventory_management.demo_orders
            WHERE order_status = 'Completed'
            ORDER BY requested_at_utc DESC;
        """
        cursor.execute(query)
        completed_orders = cursor.fetchall()
        cursor.close()
        return completed_orders
    except psycopg2.Error as db_err:
        raise HTTPException(status_code=500, detail=f"Database error: {db_err}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch completed orders: {str(e)}")
    finally:
        if conn:
            conn.close()

# NEW Endpoint to get cancelled orders
@app.get("/cancelled-orders", response_model=List[PendingOrderResponseItem])
async def get_cancelled_orders(user_email: Optional[str] = Depends(lambda: None)):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        query = """
            SELECT 
                order_request_id, mfg_part_number, internal_part_number, item_description,
                quantity_requested, vendor_name, notes, requesting_branch, 
                requested_by_user_email, requested_at_utc, last_modified_at_utc, order_status
            FROM inventory_management.demo_orders
            WHERE order_status = 'Cancelled'
            ORDER BY requested_at_utc DESC;
        """
        cursor.execute(query)
        cancelled_orders = cursor.fetchall()
        cursor.close()
        return cancelled_orders
    except psycopg2.Error as db_err:
        raise HTTPException(status_code=500, detail=f"Database error: {db_err}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch cancelled orders: {str(e)}")
    finally:
        if conn:
            conn.close()

# NEW Endpoint to update order status
@app.put("/order-request/{order_request_id}/status")
async def update_order_status(order_request_id: int, payload: UpdateOrderStatusRequest, user_email: Optional[str] = Depends(lambda: None)):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        valid_statuses = ['Completed', 'Cancelled']
        if payload.new_status not in valid_statuses:
            raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of {valid_statuses}")

        query = """
            UPDATE inventory_management.demo_orders
            SET order_status = %s, last_modified_at_utc = CURRENT_TIMESTAMP
            WHERE order_request_id = %s;
        """
        cursor.execute(query, (payload.new_status, order_request_id))
        
        if cursor.rowcount == 0:
            conn.rollback()
            cursor.close()
            raise HTTPException(status_code=404, detail=f"Order request with ID {order_request_id} not found.")

        conn.commit()
        cursor.close()
        
        return {"message": f"Order request ID {order_request_id} status updated to {payload.new_status}."}

    except psycopg2.Error as db_err:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {db_err}")
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update order status: {str(e)}")
    finally:
        if conn:
            conn.close()

# NEW Endpoint to get active orders for a user
@app.get("/active-orders", response_model=List[PendingOrderResponseItem])
async def get_active_orders(user_email: str = Query(...)):
    if not user_email:
        raise HTTPException(status_code=400, detail="User email query parameter is required.")
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        query = """
            SELECT * FROM inventory_management.demo_orders
            WHERE order_status = 'Active' AND requested_by_user_email = %s
            ORDER BY requested_at_utc ASC;
        """
        cursor.execute(query, (user_email,))
        active_orders = cursor.fetchall()
        cursor.close()
        return active_orders
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch active orders: {str(e)}")
    finally:
        if conn: conn.close()

# NEW Endpoint to add an item to active order (creates or updates quantity)
@app.post("/active-orders/item", response_model=PendingOrderResponseItem)
async def add_or_update_active_order_item(item_payload: AddToActiveOrderRequest):
    conn = None
    user_email = item_payload.requested_by_user_email # Crucial for user-specific cart
    if not user_email:
        raise HTTPException(status_code=400, detail="User email (requested_by_user_email) is required in payload.")

    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        # Check if a similar active item exists for this user, mfg_part_number, and branch
        # For simplicity, vendor_name match could also be added if carts are vendor-specific active carts
        check_query = """
            SELECT * FROM inventory_management.demo_orders
            WHERE requested_by_user_email = %s 
              AND mfg_part_number = %s 
              AND requesting_branch = %s
              AND order_status = 'Active';
        """
        cursor.execute(check_query, (user_email, item_payload.mfg_part_number, item_payload.requesting_branch))
        existing_item = cursor.fetchone()

        if existing_item:
            # Item exists, update its quantity and last_modified_at_utc
            new_quantity = existing_item['quantity_requested'] + item_payload.quantity_requested # Or just set to item_payload.quantity_requested
            update_query = """
                UPDATE inventory_management.demo_orders
                SET quantity_requested = %s, notes = %s, vendor_name = %s, last_modified_at_utc = CURRENT_TIMESTAMP
                WHERE order_request_id = %s
                RETURNING *;
            """
            cursor.execute(update_query, (
                new_quantity, # Or item_payload.quantity_requested if replacing
                item_payload.notes, 
                item_payload.vendor_name,
                existing_item['order_request_id']
            ))
            updated_item = cursor.fetchone()
            conn.commit()
            cursor.close()
            return updated_item
        else:
            # Item does not exist, insert new active order item
            insert_query = """
                INSERT INTO inventory_management.demo_orders (
                    mfg_part_number, internal_part_number, item_description,
                    quantity_requested, vendor_name, notes,
                    requesting_branch, requested_by_user_email, order_status
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'Active')
                RETURNING *;
            """
            cursor.execute(insert_query, (
                item_payload.mfg_part_number,
                item_payload.internal_part_number,
                item_payload.item_description,
                item_payload.quantity_requested,
                item_payload.vendor_name,
                item_payload.notes,
                item_payload.requesting_branch,
                user_email
            ))
            new_item = cursor.fetchone()
            conn.commit()
            cursor.close()
            return new_item

    except psycopg2.Error as db_err:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {db_err}")
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to add/update active order item: {str(e)}")
    finally:
        if conn: conn.close()

# NEW Endpoint to update quantity of a specific active order item
@app.put("/active-orders/item/{order_request_id}/quantity", response_model=PendingOrderResponseItem)
async def update_active_order_item_quantity(order_request_id: int, payload: UpdateActiveOrderItemQuantityRequest):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        query = """
            UPDATE inventory_management.demo_orders
            SET quantity_requested = %s, last_modified_at_utc = CURRENT_TIMESTAMP
            WHERE order_request_id = %s AND requested_by_user_email = %s AND order_status = 'Active'
            RETURNING *;
        """
        cursor.execute(query, (payload.quantity, order_request_id, payload.user_email))
        updated_item = cursor.fetchone()
        if not updated_item:
            raise HTTPException(status_code=404, detail=f"Active order item {order_request_id} not found for user or not active.")
        conn.commit()
        cursor.close()
        return updated_item
    except psycopg2.Error as db_err:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {db_err}")
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update active order item quantity: {str(e)}")
    finally:
        if conn: conn.close()

# NEW Endpoint to remove a specific item from active order
@app.delete("/active-orders/item/{order_request_id}")
async def remove_active_order_item(order_request_id: int, user_email: str = Query(...)):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        query = """
            DELETE FROM inventory_management.demo_orders
            WHERE order_request_id = %s AND requested_by_user_email = %s AND order_status = 'Active';
        """
        cursor.execute(query, (order_request_id, user_email))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail=f"Active order item {order_request_id} not found for user or not active.")
        conn.commit()
        cursor.close()
        return {"message": f"Active order item {order_request_id} removed successfully."}
    except psycopg2.Error as db_err:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {db_err}")
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to remove active order item: {str(e)}")
    finally:
        if conn: conn.close()

# NEW Endpoint to clear all active orders for a user
@app.delete("/active-orders/all")
async def clear_all_active_orders(user_email: str = Query(...)):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        query = """
            DELETE FROM inventory_management.demo_orders
            WHERE requested_by_user_email = %s AND order_status = 'Active';
        """
        cursor.execute(query, (user_email,))
        # cursor.rowcount will tell how many were deleted, can be returned if needed
        conn.commit()
        cursor.close()
        return {"message": f"All active orders for user {user_email} cleared."}
    except psycopg2.Error as db_err:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {db_err}")
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to clear active orders: {str(e)}")
    finally:
        if conn: conn.close()

# ... (get_pending_orders, get_completed_orders, get_cancelled_orders, update_order_status remain the same)

# Ensure this new endpoint is placed logically, e.g., after other submission endpoints
@app.post("/submit-transfer-requests")
async def submit_transfer_requests(payload: SubmitTransferRequestsRequest):
    print(f"<<<<< INSIDE /submit-transfer-requests - Payload received: {payload} >>>>>") # DIAGNOSTIC PRINT
    conn = None
    cursor = None # Initialize cursor to None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        submitted_transfer_ids = []

        for transfer_item in payload.transfers:
            # The 'status' will default to 'Pending Transfer' in the database
            # 'requested_at' and 'last_modified_at' will also default to CURRENT_TIMESTAMP on insert
            insert_query = """
                INSERT INTO inventory_management.demo_transfers (
                    mfg_part_number, internal_part_number, item_description,
                    quantity_requested, source_branch, destination_branch,
                    requested_by_user_email, notes 
                    -- status, requested_at, last_modified_at are handled by DB defaults
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING transfer_request_id;
            """
            cursor.execute(insert_query, (
                transfer_item.mfg_part_number,
                transfer_item.internal_part_number,
                transfer_item.item_description,
                transfer_item.quantity_requested,
                transfer_item.source_branch,
                transfer_item.destination_branch,
                transfer_item.requested_by_user_email,
                transfer_item.notes # Add notes here
            ))
            new_transfer_id_row = cursor.fetchone() # Renamed to avoid conflict
            if new_transfer_id_row:
                submitted_transfer_ids.append(new_transfer_id_row[0])
            print(f"Inserted transfer for {transfer_item.mfg_part_number}, ID: {new_transfer_id_row[0] if new_transfer_id_row else 'Error getting ID'}")

        conn.commit()
        print(f"Successfully committed {len(submitted_transfer_ids)} transfer requests.")
        return {"message": "Transfer requests submitted successfully", "transfer_request_ids": submitted_transfer_ids}

    except psycopg2.Error as e:
        if conn:
            conn.rollback()
        print(f"Database error in /submit-transfer-requests: {e}") # DIAGNOSTIC PRINT
        raise HTTPException(status_code=500, detail=f"Database error: {e}")
    except Exception as e:
        if conn:
            conn.rollback() # Rollback on any other error too
        print(f"General error in /submit-transfer-requests: {e}") # DIAGNOSTIC PRINT
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {e}")
    finally:
        if cursor: # Check if cursor was initialized
            cursor.close()
        if conn:
            conn.close()

# NEW Pydantic model for returning transfer data
class TransferResponseItem(BaseModel):
    transfer_request_id: int
    mfg_part_number: str
    internal_part_number: Optional[str] = None
    item_description: Optional[str] = None
    quantity_requested: int
    source_branch: str
    destination_branch: str
    requested_by_user_email: str
    status: str
    notes: Optional[str] = None # Ensure notes is present and uncommented
    requested_at: datetime.datetime # Changed from requested_at_utc
    last_modified_at: datetime.datetime # Changed from last_modified_at_utc

# Pydantic model for updating transfer status (similar to orders)
class UpdateTransferStatusRequest(BaseModel):
    new_status: str

# NEW Endpoint to get pending transfers
@app.get("/pending-transfers", response_model=List[TransferResponseItem])
async def get_pending_transfers(user_email: Optional[str] = Depends(lambda: None)): # Placeholder for auth
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        query = """
            SELECT 
                transfer_request_id, mfg_part_number, internal_part_number, item_description,
                quantity_requested, source_branch, destination_branch, requested_by_user_email,
                status, notes, requested_at, last_modified_at
            FROM inventory_management.demo_transfers
            WHERE status = 'Pending Transfer' 
            ORDER BY requested_at DESC;
        """
        # In the future, you might want to filter by user_email if only specific users can see pending transfers
        # if user_email:
        #    query += " AND requested_by_user_email = %s"
        #    cursor.execute(query, (user_email,))
        # else:
        #    cursor.execute(query)
        
        cursor.execute(query)
        pending_transfers = cursor.fetchall()
        
        return pending_transfers
    except psycopg2.Error as db_err:
        print(f"Database error fetching pending transfers: {db_err}")
        raise HTTPException(status_code=500, detail=f"Database error: {db_err}")
    except Exception as e:
        print(f"Error fetching pending transfers: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch pending transfers: {str(e)}")
    finally:
        if conn:
            if cursor: cursor.close() # ensure cursor is closed
            conn.close()

# NEW Endpoint to get completed transfers
@app.get("/completed-transfers", response_model=List[TransferResponseItem])
async def get_completed_transfers(user_email: Optional[str] = Depends(lambda: None)): # Placeholder for auth
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        query = """
            SELECT 
                transfer_request_id, mfg_part_number, internal_part_number, item_description,
                quantity_requested, source_branch, destination_branch, requested_by_user_email,
                status, notes, requested_at, last_modified_at
            FROM inventory_management.demo_transfers
            WHERE status = 'Completed'
            ORDER BY last_modified_at DESC; 
        """
        cursor.execute(query)
        completed_transfers = cursor.fetchall()
        return completed_transfers
    except psycopg2.Error as db_err:
        raise HTTPException(status_code=500, detail=f"Database error: {db_err}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch completed transfers: {str(e)}")
    finally:
        if conn:
            if cursor: cursor.close()
            conn.close()

# NEW Endpoint to get cancelled transfers
@app.get("/cancelled-transfers", response_model=List[TransferResponseItem])
async def get_cancelled_transfers(user_email: Optional[str] = Depends(lambda: None)): # Placeholder for auth
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        query = """
            SELECT 
                transfer_request_id, mfg_part_number, internal_part_number, item_description,
                quantity_requested, source_branch, destination_branch, requested_by_user_email,
                status, notes, requested_at, last_modified_at
            FROM inventory_management.demo_transfers
            WHERE status = 'Cancelled'
            ORDER BY last_modified_at DESC;
        """
        cursor.execute(query)
        cancelled_transfers = cursor.fetchall()
        return cancelled_transfers
    except psycopg2.Error as db_err:
        raise HTTPException(status_code=500, detail=f"Database error: {db_err}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch cancelled transfers: {str(e)}")
    finally:
        if conn:
            if cursor: cursor.close()
            conn.close()

# NEW Endpoint to update transfer status
@app.put("/transfer-request/{transfer_id}/status", response_model=TransferResponseItem) # Return the updated item
async def update_transfer_status(transfer_id: int, payload: UpdateTransferStatusRequest, user_email: Optional[str] = Depends(lambda: None)): # Placeholder for auth
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor) # Use RealDictCursor to return the updated row
        
        valid_statuses = ['Completed', 'Cancelled'] # Define valid target statuses
        if payload.new_status not in valid_statuses:
            raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of {valid_statuses}")

        # For now, anyone can update. Later, you might check user_email against requested_by_user_email or a role.
        query = """
            UPDATE inventory_management.demo_transfers
            SET status = %s, last_modified_at = CURRENT_TIMESTAMP
            WHERE transfer_request_id = %s
            RETURNING *; 
        """
        cursor.execute(query, (payload.new_status, transfer_id))
        
        updated_transfer = cursor.fetchone()
        
        if not updated_transfer:
            conn.rollback() # Rollback if no row was updated
            # cursor.close() # Already in finally
            raise HTTPException(status_code=404, detail=f"Transfer request with ID {transfer_id} not found or no change made.")

        conn.commit()
        # cursor.close() # Already in finally
        
        return updated_transfer # Return the full updated transfer item

    except psycopg2.Error as db_err:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {db_err}")
    except HTTPException as http_exc: # Re-raise HTTPExceptions
        if conn: conn.rollback() # Ensure rollback for HTTP exceptions too if they occur before commit
        raise http_exc
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update transfer status: {str(e)}")
    finally:
        if conn:
            if cursor: cursor.close()
            conn.close()

# ACTIVE TRANSFER CART ENDPOINTS (mirroring active orders system)

# Pydantic model for adding to active transfer cart
class AddToActiveTransferRequest(BaseModel):
    mfg_part_number: str
    internal_part_number: Optional[str] = None
    item_description: Optional[str] = None
    quantity_requested: int
    source_branch: str
    destination_branch: str
    requested_by_user_email: str
    notes: Optional[str] = None

# Pydantic model for updating active transfer item quantity
class UpdateActiveTransferItemQuantityRequest(BaseModel):
    new_quantity: int

# Endpoint to get active transfers for a user
@app.get("/active-transfers", response_model=List[TransferResponseItem])
async def get_active_transfers(user_email: str = Query(...)):
    if not user_email:
        raise HTTPException(status_code=400, detail="User email query parameter is required.")
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        query = """
            SELECT * FROM inventory_management.demo_transfers
            WHERE requested_by_user_email = %s AND status = 'Active'
            ORDER BY requested_at DESC;
        """
        cursor.execute(query, (user_email,))
        active_transfers = cursor.fetchall()
        cursor.close()
        return active_transfers
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch active transfers: {str(e)}")
    finally:
        if conn: conn.close()

# Endpoint to add an item to active transfer cart (creates or updates quantity)
@app.post("/active-transfers/item", response_model=TransferResponseItem)
async def add_or_update_active_transfer_item(item_payload: AddToActiveTransferRequest):
    conn = None
    user_email = item_payload.requested_by_user_email
    if not user_email:
        raise HTTPException(status_code=400, detail="User email (requested_by_user_email) is required in payload.")

    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        # Check if a similar active item exists for this user, part, source and destination
        check_query = """
            SELECT * FROM inventory_management.demo_transfers
            WHERE requested_by_user_email = %s 
              AND mfg_part_number = %s 
              AND source_branch = %s
              AND destination_branch = %s
              AND status = 'Active';
        """
        cursor.execute(check_query, (user_email, item_payload.mfg_part_number, item_payload.source_branch, item_payload.destination_branch))
        existing_item = cursor.fetchone()

        if existing_item:
            # Item exists, update quantity by adding to existing
            new_quantity = existing_item['quantity_requested'] + item_payload.quantity_requested
            update_query = """
                UPDATE inventory_management.demo_transfers
                SET quantity_requested = %s, last_modified_at = CURRENT_TIMESTAMP
                WHERE transfer_request_id = %s
                RETURNING *;
            """
            cursor.execute(update_query, (new_quantity, existing_item['transfer_request_id']))
            updated_item = cursor.fetchone()
            conn.commit()
            return updated_item
        else:
            # Item does not exist, insert new active transfer item
            insert_query = """
                INSERT INTO inventory_management.demo_transfers (
                    mfg_part_number, internal_part_number, item_description,
                    quantity_requested, source_branch, destination_branch,
                    requested_by_user_email, notes, status
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING *;
            """
            cursor.execute(insert_query, (
                item_payload.mfg_part_number,
                item_payload.internal_part_number,
                item_payload.item_description,
                item_payload.quantity_requested,
                item_payload.source_branch,
                item_payload.destination_branch,
                item_payload.requested_by_user_email,
                item_payload.notes,
                'Active'  # Status set to Active
            ))
            new_item = cursor.fetchone()
            conn.commit()
            return new_item

    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to add/update active transfer item: {str(e)}")
    finally:
        if conn: conn.close()

# Endpoint to update quantity of a specific active transfer item
@app.put("/active-transfers/item/{transfer_request_id}/quantity", response_model=TransferResponseItem)
async def update_active_transfer_item_quantity(transfer_request_id: int, payload: UpdateActiveTransferItemQuantityRequest):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        query = """
            UPDATE inventory_management.demo_transfers
            SET quantity_requested = %s, last_modified_at = CURRENT_TIMESTAMP
            WHERE transfer_request_id = %s AND status = 'Active'
            RETURNING *;
        """
        cursor.execute(query, (payload.new_quantity, transfer_request_id))
        updated_item = cursor.fetchone()
        
        if not updated_item:
            raise HTTPException(status_code=404, detail=f"Active transfer item with ID {transfer_request_id} not found.")
        
        conn.commit()
        return updated_item
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update active transfer item quantity: {str(e)}")
    finally:
        if conn: conn.close()

# Endpoint to remove a specific item from active transfer cart
@app.delete("/active-transfers/item/{transfer_request_id}")
async def remove_active_transfer_item(transfer_request_id: int, user_email: str = Query(...)):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        query = """
            DELETE FROM inventory_management.demo_transfers
            WHERE transfer_request_id = %s AND requested_by_user_email = %s AND status = 'Active';
        """
        cursor.execute(query, (transfer_request_id, user_email))
        
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail=f"Active transfer item with ID {transfer_request_id} not found for user {user_email}.")
        
        conn.commit()
        return {"message": f"Active transfer item {transfer_request_id} removed successfully."}
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to remove active transfer item: {str(e)}")
    finally:
        if conn: conn.close()

# Endpoint to clear all active transfers for a user
@app.delete("/active-transfers/all")
async def clear_all_active_transfers(user_email: str = Query(...)):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        query = """
            DELETE FROM inventory_management.demo_transfers
            WHERE requested_by_user_email = %s AND status = 'Active';
        """
        cursor.execute(query, (user_email,))
        conn.commit()
        return {"message": f"All active transfers for user {user_email} cleared."}
    except psycopg2.Error as db_err:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {db_err}")
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to clear active transfers: {str(e)}")
    finally:
        if conn: conn.close()

# Endpoint to submit active transfers (convert Active -> Pending Transfer)
@app.post("/submit-active-transfers")
async def submit_active_transfers(user_email: str = Query(...)):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Update all active transfers to 'Pending Transfer' status
        query = """
            UPDATE inventory_management.demo_transfers
            SET status = 'Pending Transfer', last_modified_at = CURRENT_TIMESTAMP
            WHERE requested_by_user_email = %s AND status = 'Active'
            RETURNING transfer_request_id;
        """
        cursor.execute(query, (user_email,))
        submitted_transfer_ids = [row['transfer_request_id'] for row in cursor.fetchall()]
        
        if not submitted_transfer_ids:
            raise HTTPException(status_code=400, detail="No active transfers found to submit.")
        
        conn.commit()
        return {"message": f"Successfully submitted {len(submitted_transfer_ids)} transfers.", "transfer_request_ids": submitted_transfer_ids}
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to submit active transfers: {str(e)}")
    finally:
        if conn: conn.close()

# Endpoint to submit active orders (convert Active -> Pending Send)
@app.post("/submit-active-orders")
async def submit_active_orders(user_email: str = Query(...)):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Update all active orders to 'Pending Send' status
        query = """
            UPDATE inventory_management.demo_orders
            SET order_status = 'Pending Send', last_modified_at = CURRENT_TIMESTAMP
            WHERE requested_by_user_email = %s AND order_status = 'Active'
            RETURNING order_request_id;
        """
        cursor.execute(query, (user_email,))
        submitted_order_ids = [row['order_request_id'] for row in cursor.fetchall()]
        
        if not submitted_order_ids:
            raise HTTPException(status_code=400, detail="No active orders found to submit.")
        
        conn.commit()
        return {"message": f"Successfully submitted {len(submitted_order_ids)} orders.", "order_request_ids": submitted_order_ids}
    except Exception as e:
        if conn: conn.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to submit active orders: {str(e)}")
    finally:
        if conn: conn.close()

# Make sure this is at the very end of the file if it's the main app script
# ... existing code ...