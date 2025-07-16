import React from 'react';
import { formatCurrency } from '../utils/inventoryHelpers'; // Assuming this helper is needed
import Pagination from './Pagination'; // Import the Pagination component

const FilterSummaryDisplay = ({
  activeTab = 'overview',
  isLoading = false,
  branchCount = 0,
  displayedItemsCount = 0,
  totalItemsFromAPI = 0, // This was 'totalCount' prop in InventoryTable
  totalQuantity = 0,
  totalValue = 0,
  inventoryTurnover = 0,
  // Pagination props
  currentPage,
  totalPages,
  onPageChange,
  // useServerDataForTurnover = false, // To replicate logic for turnover label
  // turnoverSource = '', // For debugging turnover
}) => {

  const getTitle = () => {
    switch (activeTab) {
      case 'overview': return 'Inventory Overview';
      case 'excess': return 'Excess Inventory';
      case 'lowStock': return 'Low Stock';
      case 'deadStock': return 'Dead Stock';
      default: return 'Inventory Summary';
    }
  };

  // Debug logging
  console.log(`FilterSummaryDisplay - activeTab: ${activeTab}, totalQuantity: ${totalQuantity}`);

  const summaryTitle = getTitle();
  const valueLabel = 'TOTAL VALUE';
  const quantityLabel = 'TOTAL STOCK';

  // This div will be sticky and have a background
  return (
    <div className="glass-panel mb-6 p-6 sticky top-0 z-20 bg-opacity-90 backdrop-blur-md" style={{ backgroundColor: 'rgba(249, 250, 251, 0.85)' }}> {/* Changed z-10 to z-20 */}
      <div className="flex items-center mb-4">
        <svg className="w-5 h-5 mr-2 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
        <h2 className="font-semibold">
          <span className="text-sm text-gray-500 uppercase tracking-widest">Filter Summary: </span>
          <span className="text-sm text-gray-500 uppercase tracking-widest">{summaryTitle}</span>
        </h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Total Branches/Affected Card */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col justify-center items-center transition-all hover:shadow-md">
          <div className="text-gray-500 text-xs font-medium mb-2 tracking-widest">
            {activeTab === 'overview' ? 'TOTAL BRANCHES' : 'BRANCHES AFFECTED'}
          </div>
          {isLoading ? (
            <div className="flex items-center justify-center h-12">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-300 border-t-blue-500"></div>
            </div>
          ) : (
            <div className="text-gray-800 text-4xl font-bold">{branchCount}</div>
          )}
          {!isLoading && totalItemsFromAPI > 0 && totalItemsFromAPI !== displayedItemsCount && (
            <div className="text-xs text-gray-500 mt-1">Displaying {displayedItemsCount} of {totalItemsFromAPI}</div>
          )}
        </div>
        
        {/* Quantity Box (now Total Stock Box) */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col justify-center items-center transition-all hover:shadow-md">
          <div className="text-gray-500 text-xs font-medium mb-2 tracking-widest">{quantityLabel}</div>
          {isLoading ? (
            <div className="flex items-center justify-center h-12">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-300 border-t-blue-500"></div>
            </div>
          ) : (
            <div className="text-gray-800 text-4xl font-bold" data-testid="total-stock-value">{totalQuantity.toLocaleString()}</div>
          )}
        </div>
        
        {/* Value Box */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col justify-center items-center transition-all hover:shadow-md">
          <div className="text-gray-500 text-xs font-medium mb-2 tracking-widest">{valueLabel}</div>
          {isLoading ? (
            <div className="flex items-center justify-center h-12">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-300 border-t-blue-500"></div>
            </div>
          ) : (
            <div className="text-gray-800 text-4xl font-bold">{formatCurrency(totalValue)}</div>
          )}
        </div>
        
        {/* Inventory Turnover Box */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-blue-100 flex flex-col justify-center items-center transition-all hover:shadow-md">
          <div className="text-blue-500 text-xs font-medium mb-2 tracking-widest">INVENTORY TURNS</div>
          {isLoading ? (
            <div className="flex items-center justify-center h-12">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-200 border-t-blue-500"></div>
            </div>
          ) : (
            <>
              <div className="text-blue-700 text-4xl font-bold">
                {(inventoryTurnover || 0).toFixed(2)}x
              </div>
              <div className="text-xs text-blue-500 mt-1">
                {(inventoryTurnover || 0) >= 5 ? 'Target Met' : 'Target: 5+'}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Render Pagination component if totalPages > 1 */} 
      {totalPages > 0 && (
        <Pagination 
          currentPage={currentPage} 
          totalPages={totalPages} 
          onPageChange={onPageChange} 
        />
      )}
    </div>
  );
};

export default FilterSummaryDisplay; 