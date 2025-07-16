// Status determination functions
export const determineStockStatus = (item) => {
  // The API now determines status based on business rules, but we'll keep this function
  // for any client-side filtering or sorting that might need it
  
  // If the item already has a status from the API, use it
  if (item.status) {
    return item.status;
  }

  // If no usage in trailing 12 months but has stock - dead stock
  if (item.ttmQtyUsed === 0 && item.quantityOnHand > 0) {
    return 'dead';
  }
  
  // Calculate months of supply
  const monthlyUsage = item.ttmQtyUsed / 12;
  const currentStock = item.quantityOnHand;
  
  // If no usage, return some high value
  const monthsOfSupply = monthlyUsage > 0 
    ? currentStock / monthlyUsage 
    : (currentStock > 0 ? Infinity : 0);
  
  // Apply business rules from the requirements
  // - Excess: More than 6 months of supply (not 12 as previously set)
  // - Dead: No usage in past 12 months but has inventory (handled above)
  // - Low: Less than 1 month of supply and has usage
  if (monthsOfSupply > 6) {
    return 'excess';
  } else if (monthsOfSupply < 1 && item.ttmQtyUsed > 0) {
    return 'low';
  } else {
    return 'optimal';
  }
};

// Calculate stock percentage for visual indicators
export const calculateStockPercentage = (item) => {
  // Define thresholds (based on business requirements)
  const minThreshold = 1; // 1 month of supply (low stock threshold)
  const maxThreshold = 6; // 6 months of supply (excess threshold)
  
  // If we can use monthsOfCover directly from the API
  if (item.monthsOfCover !== undefined && item.monthsOfCover !== null) {
    // Parse it if it's a string
    const monthsOfSupply = typeof item.monthsOfCover === 'string' ? 
      parseFloat(item.monthsOfCover) : item.monthsOfCover;
    
    // Handle infinity or very large values
    if (monthsOfSupply === Infinity || monthsOfSupply > 999) {
      return 100; // Show as full/excess
    }
    
    // Calculate percentage based on our thresholds
    let percentage = ((monthsOfSupply - minThreshold) / (maxThreshold - minThreshold)) * 100;
    
    // Ensure percentage is between 0 and 100
    percentage = Math.max(0, Math.min(percentage, 100));
    
    return Math.round(percentage);
  }
  
  // Fallback calculation if monthsOfCover isn't available
  const monthlyUsage = item.ttmQtyUsed / 12;
  const currentStock = item.quantityOnHand;
  
  // Handle division by zero
  if (monthlyUsage === 0 || isNaN(monthlyUsage)) {
    return currentStock > 0 ? 100 : 0; // If we have stock but no usage, show as full
  }
  
  const monthsOfSupply = currentStock / monthlyUsage;
  
  // Calculate percentage based on our thresholds
  let percentage = ((monthsOfSupply - minThreshold) / (maxThreshold - minThreshold)) * 100;
  
  // Ensure percentage is between 0 and 100
  percentage = Math.max(0, Math.min(percentage, 100));
  
  return Math.round(percentage);
};

// Format currency values
export const formatCurrency = (value) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(value);
};

// Format date in a readable format
export const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(date);
};

// Calculate key metrics
export const calculateMetrics = (items) => {
  const totalSKUs = items.length;
  const excessItems = items.filter(item => item.status === 'excess').length;
  const lowStockItems = items.filter(item => item.status === 'low').length;
  const deadStockItems = items.filter(item => item.status === 'dead').length;
  // Previously we had a separate calculation for non-HCN entities
  // Now use all items including HCN
  const allItems = items;
  
  // Total inventory value for all items
  const totalInventoryValue = allItems.reduce((sum, item) => sum + item.inventoryBalance, 0);
  
  // Calculate COGS for TTM using Quantity On Hand + TTM Qty Used
  // COGS = (Quantity On Hand + TTM Qty Used) * Average Cost
  const totalCOGS = allItems.reduce((sum, item) => {
    // Explicitly handle null/undefined TTM values
    const ttm = item.ttmQtyUsed !== null && item.ttmQtyUsed !== undefined ? 
      item.ttmQtyUsed : 0;
    
    const qtyTotal = item.quantityOnHand + ttm;
    return sum + (item.averageCost * qtyTotal);
  }, 0);
  
  // Calculate inventory turnover (Turns = COGS / Inventory Balance)
  // Return 0 if inventory value is 0 to avoid division by zero
  const inventoryTurnover = totalInventoryValue > 0 ? totalCOGS / totalInventoryValue : 0;
  
  // For debugging
  console.log("Frontend Inventory Turns Calculation:");
  console.log(`  - Total Inventory Value: ${totalInventoryValue}`);
  console.log(`  - Total COGS: ${totalCOGS}`);
  console.log(`  - Calculated Inventory Turns: ${inventoryTurnover}`);
  
  return {
    totalSKUs,
    excessItems,
    lowStockItems,
    deadStockItems,
    totalInventoryValue,
    inventoryTurnover
  };
};

// Filter inventory items based on selected filters
export const filterInventoryItems = (items, filters) => {
  return items.filter(item => {
    // Filter by branch (only within the selected entity)
    if (filters.branch && item.branch !== filters.branch) {
      return false;
    }
    
    // Filter by active tab
    if (filters.activeTab === 'excess' && item.status !== 'excess') {
      return false;
    } else if (filters.activeTab === 'lowStock' && item.status !== 'low') {
      return false;
    } else if (filters.activeTab === 'deadStock' && item.status !== 'dead') {
      return false;
    }
    
    return true;
  });
};