# ZentroQ Inventory Management System Guide

## Build & Run Commands
- Data Import: `python import_inventory.py inventory(in).csv`
- Data Export: `python export_inventory.py output.csv`
- Data Analysis: `python analyze_inventory.py [options]`
- Generate Reports: `python generate_reports.py --type [report_type]`

## Coding Style Guidelines
- **Imports**: Standard library first, then third-party, then local modules (alphabetically)
- **Formatting**: PEP 8 compliant, 4-space indentation, 100 char line limit
- **Type Hints**: Use Python type hints for all function parameters and return values
- **Naming**:
  - Variables/Functions: snake_case (e.g., inventory_item)
  - Classes: CamelCase (e.g., InventoryItem)
  - Constants: UPPER_SNAKE_CASE (e.g., MAX_ITEMS)
- **Error Handling**: Use try/except blocks with specific exceptions
- **Documentation**: Docstrings for all modules, classes, functions (Google style)
- **Testing**: pytest for unit tests, test files prefixed with "test_"

## CSV Data Format
The inventory CSV contains product details including Entity, Branch, Part Numbers, 
Description, Categories, Quantities, Costs, and Usage statistics.