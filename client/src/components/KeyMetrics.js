import React, { useMemo } from 'react';
import { formatCurrency } from '../utils/inventoryHelpers';

const KeyMetrics = ({ metrics, completeData = [], isLoading = false }) => {
  const { totalSKUs, excessItems, lowStockItems, deadStockItems, totalInventoryValue, inventoryTurnover } = metrics;
  
  // Prioritize using the server-provided inventory turnover value directly
  // Only calculate client-side as a fallback when server value is unavailable
  const calculatedTurns = useMemo(() => {
    // First priority: Use the API value if available
    if (inventoryTurnover !== undefined && inventoryTurnover !== null) {
      console.log("KeyMetrics: Using server-calculated turnover value:", inventoryTurnover);
      return inventoryTurnover;
    }
    
    // Second priority: Calculate based on available data
    if (!completeData || completeData.length === 0) {
      console.log("KeyMetrics: No data available for turnover calculation");
      return 0;
    }
    
    // Include all entities (including HCN)
    const allItems = completeData;
    
    // Get total inventory value
    const totalInventoryValue = allItems.reduce((sum, item) => sum + item.inventoryBalance, 0);
    
    // Calculate COGS: (QOH + TTM) * Avg Cost
    const totalCOGS = allItems.reduce((sum, item) => {
      // Explicitly handle null/undefined TTM values
      const ttm = item.ttmQtyUsed !== null && item.ttmQtyUsed !== undefined ? 
        item.ttmQtyUsed : 0;
      
      const qtyTotal = item.quantityOnHand + ttm;
      return sum + (item.averageCost * qtyTotal);
    }, 0);
    
    // Calculate turns
    const turnValue = totalInventoryValue > 0 ? totalCOGS / totalInventoryValue : 0;
    
    // Log for debugging
    console.log("KeyMetrics: Client-calculated turnover details:", {
      totalItems: allItems.length,
      totalInventoryValue,
      totalCOGS,
      turnValue
    });
    
    return turnValue;
  }, [completeData, inventoryTurnover]);
  
  // Check if inventory turnover is null (for HCN entities)
  console.log("KeyMetrics calculated inventory turns:", calculatedTurns);
  const hasInventoryTurns = calculatedTurns !== null && calculatedTurns !== undefined;
  
  // Determine color based on inventory turnover (5+ is good)
  const turnoverColor = !hasInventoryTurns ? 'text-gray-500' : 
    calculatedTurns >= 5 ? 'text-blue-700' : 
    calculatedTurns >= 3 ? 'text-blue-600' : 'text-blue-500';
    
  const turnoverBgColor = !hasInventoryTurns ? 'bg-gray-100' : 
    calculatedTurns >= 5 ? 'bg-blue-100' : 
    calculatedTurns >= 3 ? 'bg-blue-50' : 'bg-gray-100';
  
  return (
    <div>
      <h2 className="text-gray-500 text-xs font-medium tracking-widest uppercase mb-4">KEY METRICS</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        {/* Total SKUs Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 font-medium">Total SKUs</p>
              {isLoading ? (
                <div className="h-8 flex items-center">
                  <div className="animate-pulse h-6 w-16 bg-gray-200 rounded"></div>
                </div>
              ) : (
                <p className="text-2xl font-bold text-gray-900">{totalSKUs}</p>
              )}
            </div>
            <div className="bg-gray-100 p-3 rounded-full">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
              </svg>
            </div>
          </div>
        </div>
        
        {/* Inventory Turnover Card */}
        <div className="bg-white rounded-lg shadow-sm border border-blue-100 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-600 font-medium">Inventory Turns</p>
              {isLoading ? (
                <div className="h-12 flex flex-col justify-center">
                  <div className="animate-pulse h-6 w-16 bg-gray-200 rounded mb-1"></div>
                  <div className="animate-pulse h-3 w-10 bg-gray-200 rounded"></div>
                </div>
              ) : hasInventoryTurns ? (
                <>
                  <p className={`text-2xl font-bold ${turnoverColor}`}>{calculatedTurns.toFixed(2)}x</p>
                  <p className="text-xs text-blue-500 mt-1">
                    {calculatedTurns >= 5 ? 'Target Met' : 'Target: 5+'}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-bold text-gray-500">0.00x</p>
                  <p className="text-xs text-blue-500 mt-1">
                    Target: 5+
                  </p>
                </>
              )}
            </div>
            <div className={`${turnoverBgColor} p-3 rounded-full`}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
          </div>
        </div>
        
        {/* Excess Items Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-red-600 font-medium">Excess Items</p>
              {isLoading ? (
                <div className="h-12 flex flex-col justify-center">
                  <div className="animate-pulse h-6 w-16 bg-gray-200 rounded mb-1"></div>
                  <div className="animate-pulse h-3 w-24 bg-gray-200 rounded"></div>
                </div>
              ) : (
                <>
                  <p className="text-2xl font-bold text-red-700">{excessItems}</p>
                  <p className="text-xs text-red-600 mt-1">
                    {Math.round((excessItems / (totalSKUs || 1)) * 100)}% of inventory
                  </p>
                </>
              )}
            </div>
            <div className="bg-red-100 p-3 rounded-full">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
          </div>
        </div>
        
        {/* Low Stock Items Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-amber-600 font-medium">Low Stock Items</p>
              {isLoading ? (
                <div className="h-12 flex flex-col justify-center">
                  <div className="animate-pulse h-6 w-16 bg-gray-200 rounded mb-1"></div>
                  <div className="animate-pulse h-3 w-24 bg-gray-200 rounded"></div>
                </div>
              ) : (
                <>
                  <p className="text-2xl font-bold text-amber-700">{lowStockItems}</p>
                  <p className="text-xs text-amber-600 mt-1">
                    {Math.round((lowStockItems / (totalSKUs || 1)) * 100)}% of inventory
                  </p>
                </>
              )}
            </div>
            <div className="bg-amber-100 p-3 rounded-full">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
          </div>
        </div>
        
        {/* Total Inventory Value Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-600 font-medium">Inventory Value</p>
              {isLoading ? (
                <div className="h-8 flex items-center">
                  <div className="animate-pulse h-6 w-28 bg-gray-200 rounded"></div>
                </div>
              ) : (
                <p className="text-2xl font-bold text-green-700">{formatCurrency(totalInventoryValue)}</p>
              )}
            </div>
            <div className="bg-green-100 p-3 rounded-full">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KeyMetrics;