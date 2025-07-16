import React from 'react';

const TabNavigation = ({ activeTab, onTabChange, metrics, filteredItemsCount, isLoading = false }) => {
  // Use a more stable approach to handle metrics
  const tabs = [
    { 
      id: 'overview', 
      name: 'Inventory Overview', 
      count: isLoading ? null : metrics.totalSKUs,
      color: 'text-gray-800'
    },
    { 
      id: 'excess', 
      name: 'Excess Inventory', 
      count: isLoading ? null : metrics.excessItems, 
      color: 'text-red-600', 
      badge: 'bg-red-50 text-red-700 border border-red-200' 
    },
    { 
      id: 'lowStock', 
      name: 'Low Stock', 
      count: isLoading ? null : metrics.lowStockItems, 
      color: 'text-amber-600', 
      badge: 'bg-amber-50 text-amber-700 border border-amber-200' 
    },
    { 
      id: 'deadStock', 
      name: 'Dead Stock', 
      count: isLoading ? null : metrics.deadStockItems, 
      color: 'text-gray-600', 
      badge: 'bg-gray-50 text-gray-700 border border-gray-200' 
    },
  ];
  
  // Tooltip content for inventory status explanation
  const statusTooltip = `
    • Excess Stock: Items with more than 12 months of supply
    • Low Stock: Items with less than 1 month of supply
    • Dead Stock: Items with no usage in the last 12 months
    • Optimal: Items with 1-12 months of supply
  `;

  return (
    <div className="border-b border-gray-200 mb-6">
      <div className="flex items-center">
        <div className="flex items-center flex-nowrap">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`whitespace-nowrap py-4 px-5 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? `border-gray-500 ${tab.color || 'text-gray-800'}`
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.name}
              {isLoading ? (
                <span className="ml-2 py-0.5 px-2 rounded-full text-xs bg-gray-100 text-gray-400 border border-gray-200">
                  <svg className="animate-pulse h-3 w-3 inline" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </span>
              ) : tab.count > 0 && (
                <span className={`ml-2 py-0.5 px-2 rounded-full text-xs ${
                  tab.badge || 'bg-gray-100 text-gray-800 border border-gray-200'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
        
        {/* MB Legend */}
        <div className="flex items-center ml-2 bg-blue-50 px-2 py-1 rounded-md border border-blue-100">
          <span className="px-1.5 py-0.5 text-xs font-semibold rounded-full shadow-sm bg-sky-100 text-sky-700 border border-sky-300 mr-1.5">
            MB
          </span>
          <span className="text-xs text-blue-700">
            = Multiple Branches (prioritized)
          </span>
        </div>
        
        {/* Info tooltip button */}
        <div className="group relative ml-2">
          <button 
            className="flex items-center justify-center h-6 w-6 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 focus:outline-none"
            aria-label="Inventory status information"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
          <div className="absolute z-50 invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-xs rounded-lg py-2 px-3 left-full ml-2 top-0 min-w-[240px] whitespace-pre-line">
            <div className="font-semibold mb-1">Inventory Status Definitions:</div>
            {statusTooltip}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TabNavigation;