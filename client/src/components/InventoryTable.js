import React from 'react';
import { formatCurrency, formatDate, calculateStockPercentage } from '../utils/inventoryHelpers';
import StatusFilterDropdown from './StatusFilterDropdown';

const InventoryTable = ({ 
  items, 
  sortConfig, 
  onSort, 
  onViewItem,
  networkStatusFilter,
  onNetworkStatusChange,
  activeTab
}) => {
  // Helper to determine the sorting indicator
  const getSortIndicator = (name) => {
    if (sortConfig.key !== name) return null;
    return sortConfig.direction === 'ascending' ? '↑' : '↓';
  };
  
  // Helper to apply sorting styles
  const getSortingClasses = (name) => {
    return sortConfig.key === name 
      ? 'text-indigo-900 font-bold' 
      : 'text-indigo-600 font-medium';
  };
  
  // Status badge mapping
  const statusBadge = {
    excess: { bg: 'bg-red-50 border border-red-200', text: 'text-red-700', label: 'Excess' },
    optimal: { bg: 'bg-green-50 border border-green-200', text: 'text-green-700', label: 'Optimal' },
    low: { bg: 'bg-amber-50 border border-amber-200', text: 'text-amber-700', label: 'Low Stock' },
    dead: { bg: 'bg-gray-50 border border-gray-200', text: 'text-gray-700', label: 'Dead Stock' },
    unknown: { bg: 'bg-gray-50 border border-gray-200', text: 'text-gray-700', label: 'N/A' }
  };

  // Helper to get a sortable value for months of coverage
  const getSortableCoverageValue = (value) => {
    if (value === "Infinity" || value === Infinity) return Number.POSITIVE_INFINITY;
    const num = Number(value);
    return isNaN(num) ? -Infinity : num;
  };

  return (
    <div className="overflow-x-auto">
      {(!items || items.length === 0) ? (
        <div className="text-center py-10">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No items found</h3>
          <p className="mt-1 text-sm text-gray-500">Try adjusting your search or filter criteria.</p>
        </div>
      ) : (
        <>
          <table className="min-w-full divide-y divide-gray-200 relative">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-gray-50 w-16 px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                View
              </th>
              <th
                scope="col"
                className={`px-6 py-3 text-left text-xs uppercase tracking-wider cursor-pointer ${sortConfig.key === 'branch' ? 'text-gray-900 font-bold' : 'text-gray-500 font-medium'}`}
                onClick={() => onSort('branch')}
              >
                Branch {getSortIndicator('branch')}
              </th>
              <th
                scope="col"
                className={`px-6 py-3 text-left text-xs uppercase tracking-wider cursor-pointer ${sortConfig.key === 'mfgPartNumber' ? 'text-gray-900 font-bold' : 'text-gray-500 font-medium'}`}
                onClick={() => onSort('mfgPartNumber')}
              >
                Manufacturer Part Number {getSortIndicator('mfgPartNumber')}
              </th>
              <th
                scope="col"
                className={`px-6 py-3 text-left text-xs uppercase tracking-wider cursor-pointer ${sortConfig.key === 'description' ? 'text-gray-900 font-bold' : 'text-gray-500 font-medium'}`}
                onClick={() => onSort('description')}
              >
                Description {getSortIndicator('description')}
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500 font-medium">
                Class
              </th>
              <th
                scope="col"
                className={`px-6 py-3 text-left text-xs uppercase tracking-wider cursor-pointer ${sortConfig.key === 'quantityOnHand' ? 'text-gray-900 font-bold' : 'text-gray-500 font-medium'}`}
                onClick={() => onSort('quantityOnHand')}
              >
                Current Stock {getSortIndicator('quantityOnHand')}
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500 font-medium">
                Unit Price
              </th>
              <th
                scope="col"
                className={`px-6 py-3 text-left text-xs uppercase tracking-wider cursor-pointer ${sortConfig.key === 'inventoryBalance' ? 'text-gray-900 font-bold' : 'text-gray-500 font-medium'}`}
                onClick={() => onSort('inventoryBalance')}
              >
                Inventory Value {getSortIndicator('inventoryBalance')}
              </th>
              <th
                scope="col"
                className={`px-6 py-3 text-left text-xs uppercase tracking-wider cursor-pointer ${sortConfig.key === 'monthsOfCoverage' ? 'text-gray-900 font-bold' : 'text-gray-500 font-medium'}`}
                onClick={() => onSort('monthsOfCoverage')}
              >
                Months of Coverage {getSortIndicator('monthsOfCoverage')}
              </th>
              {activeTab !== 'deadStock' && (
                <th scope="col" className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500 font-medium">
                  Branch Status
                </th>
              )}
              <th scope="col" className="px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-500 font-medium">
                <div className="flex items-center">
                  <span className="mr-2">Network Status</span>
                  {activeTab !== 'deadStock' && (
                    <StatusFilterDropdown
                      value={networkStatusFilter}
                      onChange={onNetworkStatusChange}
                    />
                  )}
                </div>
              </th>
              <th
                scope="col"
                className={`px-6 py-3 text-right text-xs uppercase tracking-wider cursor-pointer ${sortConfig.key === 'lastReceipt' ? 'text-gray-900 font-bold' : 'text-gray-500 font-medium'}`}
                onClick={() => onSort('lastReceipt')}
              >
                Last Receipt {getSortIndicator('lastReceipt')}
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {items.map((item) => {
              if (!item || !item.id) {
                console.warn('InventoryTable encountered an invalid item:', item);
                return null;
              }

              const stockPercentage = calculateStockPercentage(item);
              const badge = statusBadge[item.status] || statusBadge.unknown;
              
              const companyBadge = item.companyStatus ? (statusBadge[item.companyStatus] || statusBadge.unknown) : statusBadge.unknown;

              return (
                <tr key={item.id} className="hover:bg-gray-50 transition-colors duration-150">
                  <td className="sticky left-0 z-10 bg-white whitespace-nowrap w-16 px-4 py-4 text-center">
                    <button
                      onClick={() => onViewItem(item)}
                      className="group inline-flex items-center justify-center h-8 w-8 rounded-full bg-white bg-opacity-50 hover:bg-opacity-75 backdrop-blur-sm border border-gray-300 hover:border-indigo-400 text-gray-600 hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-75 transition-all duration-150 ease-in-out shadow-sm hover:shadow-md"
                      title="View Item Details"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    </button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-800">
                    {item.branch}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">
                    <div className="font-medium flex items-center">
                      {item.mfgPartNumber}
                      {item.multiBranch && (
                        <span title={`Available in ${item.branchCount} branches - Click eye icon to view all locations`} className="ml-1 px-1.5 py-0.5 text-xs font-semibold rounded-full shadow-sm bg-sky-100 text-sky-700 border border-sky-300">
                          MB
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">{item.partNumber}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-800 max-w-xs truncate">
                    <div className="font-medium">{item.description}</div>
                    <div className="text-xs text-gray-500">{item.mfgName}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {item.family ? (
                      <span className="px-2 py-1 text-xs rounded-md bg-gray-100 text-gray-700 border border-gray-200">
                        {item.family}
                      </span>
                    ) : (
                      <span className="text-gray-400 text-sm">-</span>
                    )}
                    {item.category && (
                      <div className="text-xs text-gray-500 mt-1">{item.category}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="mr-2">
                        <div className="text-sm font-medium text-gray-800">{item.quantityOnHand}</div>
                      </div>
                      
                      {/* Stock level indicator */}
                      <div className="flex-1 max-w-[100px]">
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className={`h-2 rounded-full ${
                              item.status === 'excess' ? 'bg-red-500' :
                              item.status === 'low' ? 'bg-amber-500' :
                              item.status === 'dead' ? 'bg-gray-500' :
                              'bg-green-500'
                            }`}
                            style={{ width: `${stockPercentage}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">
                    {formatCurrency(item.quantityOnHand > 0 ? item.inventoryBalance / item.quantityOnHand : 0)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">
                    {formatCurrency(item.inventoryBalance)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">
                    {item.monthsOfCoverage === Infinity || item.monthsOfCoverage > 9999 || item.monthsOfCoverage === "999.0" ? (
                      <span className="text-gray-500">Infinity</span>
                    ) : (
                      <span>{typeof item.monthsOfCoverage === 'number' ? item.monthsOfCoverage.toFixed(1) : parseFloat(item.monthsOfCoverage).toFixed(1)}</span>
                    )}
                    <div className="text-xs text-gray-500 mt-1">TTM Usage: {item.ttmQtyUsed}</div>
                  </td>
                  {activeTab !== 'deadStock' && (
                    <td className="px-6 py-4 whitespace-nowrap">
                      {activeTab === 'overview' && item.status === 'dead' ? (
                        <span className="text-gray-500">-</span>
                      ) : (
                        <span className={`px-2 py-1 text-xs rounded-md ${badge.bg} ${badge.text}`}>
                          {badge.label}
                        </span>
                      )}
                    </td>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-md ${companyBadge.bg} ${companyBadge.text}`}>
                      {companyBadge.label}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="text-xs text-gray-500">
                      {item.lastReceipt ? formatDate(item.lastReceipt) : ''}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </>
      )}
    </div>
  );
};

export default InventoryTable;