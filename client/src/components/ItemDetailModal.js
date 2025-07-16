import React, { useState, useEffect } from 'react';
import { formatCurrency, formatDate } from '../utils/inventoryHelpers';

const ItemDetailModal = ({ 
  item, 
  allBranchItems, 
  isOpen, 
  onClose, 
  onAddToCart, 
  cart, 
  requestStatus, 
  onSubmitRequest,
  onOpenCartReview,
  onNavigateToOrderCart, // Added new prop for direct navigation to Order Cart tab
  onNavigateToTransferCart, // Added new prop for direct navigation to Transfer Cart
  currentBranch
}) => {
  const [activeTab, setActiveTab] = useState('inventory');
  const [selectedBranch, setSelectedBranch] = useState(null);
  
  // State for "Transfer from Branch" tab
  const [selectedSourceBranchForTransfer, setSelectedSourceBranchForTransfer] = useState('');
  // No separate destination state for "Transfer from Branch" tab, it's implicit (item.branch)

  // State for "Transfer to Branch" tab (destination is selected by user)
  const [selectedDestinationBranchForTransfer, setSelectedDestinationBranchForTransfer] = useState(''); 

  const [orderQuantity, setOrderQuantity] = useState('');
  const [transferQuantity, setTransferQuantity] = useState('');
  const [transferToQuantity, setTransferToQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [vendorName, setVendorName] = useState('');

  // Effect to auto-fill vendor name from item.mfgName when modal opens or item changes
  useEffect(() => {
    if (isOpen && item) {
      if (item.mfgName) {
        setVendorName(item.mfgName);
      } else {
        setVendorName(''); // Clear if no mfgName
      }
      // Reset quantity and notes when item changes or modal re-opens, specific to order tab context
      // setOrderQuantity(''); 
      // setNotes(''); 
      // ^ Decided against resetting these here as user might be tabbing away and back
    } else if (!isOpen) {
      // Clear when modal closes if preferred, or rely on main reset effect
      setVendorName('');
    }
  }, [isOpen, item]);

  // Effect for source branch selection for "Transfer from Branch" tab
  useEffect(() => {
    // This effect might need adjustment or removal if we fully consolidate to one transfer tab
    // For now, let it be, it might pre-fill selectedBranch which could be a starting point
    if (isOpen && activeTab === 'transfer' && allBranchItems && item) {
      const branchesWithStock = allBranchItems.filter(branchItem => 
        branchItem.quantityOnHand > 0 // Show all branches with stock as potential sources
      );
      const sortedBranches = [...branchesWithStock].sort((a, b) => 
        b.quantityOnHand - a.quantityOnHand
      );
      if (sortedBranches.length > 0 && !selectedSourceBranchForTransfer) {
        // Pre-select the item's current branch as a sensible default if it has stock
        const currentItemBranch = sortedBranches.find(b => b.branch === item.branch);
        if (currentItemBranch) {
            setSelectedSourceBranchForTransfer(currentItemBranch.branch);
        } else if (sortedBranches.length > 0) {
            // setSelectedSourceBranchForTransfer(sortedBranches[0].branch); // Or don't pre-select source
        }
      }
    }
  }, [isOpen, activeTab, allBranchItems, item, selectedSourceBranchForTransfer]);
  
  useEffect(() => {
    if (isOpen) {
      // Reset state when modal opens
      setActiveTab('inventory');
      setSelectedBranch(null);
      setSelectedSourceBranchForTransfer(''); 
      setSelectedDestinationBranchForTransfer(''); 
      setOrderQuantity('');
      setTransferQuantity('');
      setTransferToQuantity('');
      setNotes('');
      // setVendorName(''); // Initial vendor name is now handled by the effect above
      
      // Prevent scrolling on body when modal is open
      document.body.classList.add('modal-open');
    } else {
      // Re-enable scrolling when modal is closed
      document.body.classList.remove('modal-open');
    }
    
    // Cleanup function to ensure we always remove the class
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [isOpen]);

  if (!isOpen || !item) return null;

  // Group items by branch for easy display
  // Always use the entire dataset (allBranchItems) regardless of active filter
  const itemsByBranch = allBranchItems.reduce((acc, branchItem) => {
    if (!acc[branchItem.branch]) {
      acc[branchItem.branch] = [];
    }
    acc[branchItem.branch].push(branchItem);
    return acc;
  }, {});

  // Calculate total quantities and values across all branches
  // Always use the entire dataset (allBranchItems) regardless of active filter
  const totals = allBranchItems.reduce(
    (acc, branchItem) => {
      return {
        quantity: acc.quantity + branchItem.quantityOnHand,
        value: acc.value + branchItem.inventoryBalance,
      };
    },
    { quantity: 0, value: 0 }
  );

  // Status badge mapping
  const statusBadge = {
    excess: { bg: 'bg-amber-50 border border-amber-200', text: 'text-amber-700', label: 'Excess' },
    optimal: { bg: 'bg-green-50 border border-green-200', text: 'text-green-700', label: 'Optimal' },
    low: { bg: 'bg-red-50 border border-red-200', text: 'text-red-700', label: 'Low Stock' },
    dead: { bg: 'bg-gray-50 border border-gray-200', text: 'text-gray-700', label: 'Dead Stock' }
  };
  
  // Find all branches with this part (excluding the branch of the currently viewed item)
  // This shows ALL branches regardless of which branch is selected in Filters & Search
  // Using the full allBranchItems dataset, not just currently filtered data
  const otherBranches = allBranchItems.filter(branchItem => 
    // Only exclude the specific branch of the item being viewed
    // and make sure we only include branches with stock
    branchItem.branch !== item.branch && branchItem.quantityOnHand > 0
  );
  
  // Sort branches by quantity (highest first) for easier selection
  const sortedOtherBranches = [...otherBranches].sort((a, b) => 
    b.quantityOnHand - a.quantityOnHand
  );
  
  const handleSubmitOrder = (e) => {
    e.preventDefault();
    // Validate that quantity is a positive number
    const qty = parseInt(orderQuantity, 10);
    if (isNaN(qty) || qty <= 0) {
      alert("Please enter a valid quantity greater than 0");
      return;
    }
    if (!vendorName.trim()) {
      alert("Please enter a vendor name.");
      return;
    }
    
    // Pass item.branch as the requestingBranch (new 7th argument)
    onAddToCart(item, 'order', qty, null, vendorName, notes, item.branch);
    setOrderQuantity('');
    setNotes('');
  };
  
  const handleSubmitTransfer = (e) => {
    e.preventDefault();
    const sourceBranch = selectedSourceBranchForTransfer;
    const destinationBranch = item.branch; // Destination is implicitly the item's current branch
    const qty = parseInt(transferQuantity, 10);

    if (!sourceBranch) {
      alert("Please select a source branch for the transfer.");
      return;
    }
    if (sourceBranch === destinationBranch) {
      alert("Source and destination branches cannot be the same. This item is already at the destination branch.");
      return;
    }
    if (isNaN(qty) || qty <= 0) {
      alert("Please enter a valid quantity greater than 0 for the transfer.");
      return;
    }
    
    // Find the item details for the selected source branch to check stock
    const sourceBranchInventoryItem = allBranchItems.find(bi => 
        bi && bi.branch === sourceBranch && bi.mfgPartNumber === item.mfgPartNumber
    );

    if (!sourceBranchInventoryItem || sourceBranchInventoryItem.quantityOnHand < qty) {
      alert(`Not enough stock at ${sourceBranch}. Available: ${sourceBranchInventoryItem ? sourceBranchInventoryItem.quantityOnHand : 0}.`);
      return;
    }
    
    // Assuming onAddToCart will be updated to handle this new signature for transfers:
    // onAddToCart(type, itemCoreDetails, quantity, sourceBranch, destinationBranch, notes)
    onAddToCart(item, 'transfer', qty, sourceBranch, destinationBranch, notes);
    
    // Reset fields for the "Transfer from Branch" tab
    setSelectedSourceBranchForTransfer('');
    setTransferQuantity('');
    setNotes(''); // Reset notes specifically for transfer, or use a separate transferNotes state
  };
  
  const handleSubmitTransferTo = (e) => {
    e.preventDefault();
    // For "Transfer to Branch", the destination is selected by the user
    const destinationBranch = selectedDestinationBranchForTransfer; 
    const sourceBranch = item.branch; // Source is implicitly the item's current branch
    
    if (!destinationBranch) {
      alert("Please select a destination branch to transfer to.");
      return;
    }
    
    // Find the current branch item 
    if (!item) return;
    
    if (sourceBranch === destinationBranch) {
        alert("Source and destination branches cannot be the same. Cannot transfer to the item's current branch using this tab.");
        return;
    }

    // Validate that quantity is a positive number and not more than available
    const qty = parseInt(transferToQuantity, 10);
    if (isNaN(qty) || qty <= 0) {
      alert("Please enter a valid quantity greater than 0");
      return;
    }
    
    if (qty > item.quantityOnHand) {
      alert("Cannot transfer more than the available quantity");
      return;
    }
    
    // it's a transfer to another branch
    
    const transferNote = `TRANSFER TO ${destinationBranch}: ${notes ? notes : ""}`;
    
    // Use the onAddToCart function to add a normal transfer
    onAddToCart(
      item, // Pass the full item object
      'transfer',
      qty,
      sourceBranch, 
      destinationBranch,
      transferNote  // Include destination branch in notes, or just use notes as is.
    );
    setSelectedDestinationBranchForTransfer(''); // Reset after submission for this tab
    setTransferToQuantity('');
    setNotes('');
  };

  return (
    <div 
      className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center p-4 transition-opacity duration-300 ease-in-out" 
      aria-labelledby="modal-title" 
      role="dialog" 
      aria-modal="true" 
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-xl shadow-2xl w-full max-w-7xl opacity-100" 
        onClick={e => e.stopPropagation()}
        style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Modal content */}
        <div className="relative text-left overflow-hidden flex-grow flex flex-col">
          {/* Header with Close button */}
          <div className="flex items-start justify-between p-5 border-b border-gray-200 sticky top-0 bg-white z-10 rounded-t-xl">
            <div className="flex-grow">
              <h3 className="text-xl font-semibold text-gray-900" id="modal-title">
                {item.description || item.mfgPartNumber}
              </h3>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                <span>MFG Part: <span className="font-medium text-gray-700">{item.mfgPartNumber}</span></span>
                {item.partNumber && <span>Internal Part: <span className="font-medium text-gray-700">{item.partNumber}</span></span>}
                {item.mfgName && <span>Manufacturer: <span className="font-medium text-gray-700">{item.mfgName}</span></span>}
                {item.family && <span className="px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200">{item.family}</span>}
              </div>
            </div>
            <button
              type="button"
              className="p-1.5 ml-4 text-gray-400 hover:text-gray-600 bg-transparent hover:bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 transition-colors"
              onClick={onClose}
              aria-label="Close modal"
            >
              <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Scrollable Content Area */}
          <div className="p-5 flex-grow overflow-y-auto">
            {/* Tab Navigation */}
            <div className="mb-6 border-b border-gray-200">
              <nav className="-mb-px flex space-x-6" aria-label="Tabs">
                {['inventory', 'order', 'transfer', 'transferTo'].map((tabName) => (
              <button
                    key={tabName}
                    onClick={() => setActiveTab(tabName)}
                    className={`whitespace-nowrap py-2 px-3 rounded-md font-medium text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-gray-400
                      ${activeTab === tabName
                        ? 'bg-gray-100 text-gray-700'
                        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                      }
                    `}
                  >
                    {/* Dynamically add cart count to tab titles */}
                    {tabName === 'order' && cart.orders.length > 0 && (
                      <span className="mr-1.5 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-gray-700 rounded-full">{cart.orders.length}</span>
                    )}
                    {tabName === 'transfer' && cart.transfers.length > 0 && (
                       <span className="mr-1.5 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-gray-700 rounded-full">{cart.transfers.length}</span>
                    )}
                    {tabName === 'inventory' ? 'Branch Inventory' : tabName === 'order' ? 'Order from Vendor' : tabName === 'transfer' ? 'Transfer from Branch' : 'Transfer to Branch'}
              </button>
                ))}
            </nav>
          </div>

          {/* Tab content */}
            <div className="mt-6"> {/* Increased top margin for tab content */}
            {/* Inventory Tab */}
            {activeTab === 'inventory' && (
                <div className="space-y-6">
                {/* Consolidated summary */}
                  <div className="bg-gray-50 p-5 rounded-lg border border-gray-200">
                    <h4 className="text-md font-semibold text-gray-800 mb-4">Consolidated View</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                    <div>
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total Quantity</p>
                        <p className="text-2xl font-bold text-gray-900 mt-1">{totals.quantity}</p>
                    </div>
                    <div>
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total Value</p>
                        <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(totals.value)}</p>
                    </div>
                    <div>
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Branches with Stock</p>
                        <p className="text-2xl font-bold text-gray-900 mt-1">{Object.keys(itemsByBranch).length}</p>
                    </div>
                  </div>
                </div>

                {/* Branch breakdown */}
                <div>
                    <h4 className="text-md font-semibold text-gray-800 mb-3">Inventory by Branch</h4>
                    <div className="overflow-x-auto rounded-lg border border-gray-200">
                      <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                            <th scope="col" className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Branch</th>
                            <th scope="col" className="py-3 px-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Quantity</th>
                            <th scope="col" className="py-3 px-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Unit Price</th>
                            <th scope="col" className="py-3 px-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Value</th>
                            <th scope="col" className="py-3 px-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Months of Coverage</th>
                            <th scope="col" className="py-3 px-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">TTM Qty Used</th>
                            <th scope="col" className="py-3 px-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Network Status</th>
                            <th scope="col" className="py-3 px-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Branch Status</th>
                            <th scope="col" className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Last Receipt</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white">
                          {allBranchItems.length > 0 ? allBranchItems.map((branchItem, idx) => {
                            const branchBadge = statusBadge[branchItem.status] || statusBadge.unknown;
                            const companyBadge = statusBadge[item.companyStatus] || statusBadge.unknown; // Assuming item has companyStatus
                          return (
                              <tr key={`${branchItem.branch}-${idx}`} className={`hover:bg-gray-50 ${branchItem.branch === item.branch ? 'bg-gray-100' : ''}`}>
                                <td className="py-3 px-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                {branchItem.branch}
                                {branchItem.branch === item.branch && (
                                    <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-gray-200 text-gray-700">Current</span>
                                )}
                              </td>
                                <td className="py-3 px-4 whitespace-nowrap text-sm text-gray-600 text-right">{branchItem.quantityOnHand}</td>
                                <td className="py-3 px-4 whitespace-nowrap text-sm text-gray-600 text-right">{formatCurrency(branchItem.quantityOnHand > 0 ? branchItem.inventoryBalance / branchItem.quantityOnHand : 0)}</td>
                                <td className="py-3 px-4 whitespace-nowrap text-sm text-gray-600 text-right">{formatCurrency(branchItem.inventoryBalance)}</td>
                                <td className="py-3 px-4 whitespace-nowrap text-sm text-gray-600 text-right">
                                  {branchItem.monthsOfCoverage === Infinity || branchItem.monthsOfCoverage > 9999 ? 'Infinite' : (typeof branchItem.monthsOfCoverage === 'number' ? branchItem.monthsOfCoverage.toFixed(1) : 'N/A')}
                                </td>
                                <td className="py-3 px-4 whitespace-nowrap text-sm text-gray-600 text-right">{branchItem.ttmQtyUsed}</td>
                                <td className="py-3 px-4 whitespace-nowrap text-center">
                                  {item.companyStatus ? (
                                    <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${companyBadge.bg} ${companyBadge.text}`}>
                                      {companyBadge.label}
                                    </span>
                                  ) : 'N/A'}
                              </td>
                                <td className="py-3 px-4 whitespace-nowrap text-center">
                                  <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${branchBadge.bg} ${branchBadge.text}`}>
                                    {branchBadge.label}
                                </span>
                              </td>
                                <td className="py-3 px-4 whitespace-nowrap text-sm text-gray-600">{branchItem.lastReceipt ? formatDate(branchItem.lastReceipt) : 'N/A'}</td>
                            </tr>
                          );
                          }) : (
                            <tr>
                              <td colSpan="7" className="py-10 text-center text-sm text-gray-500">
                                No inventory data available for this part in other branches.
                              </td>
                            </tr>
                          )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Order Tab */}
            {activeTab === 'order' && (
                <div className="space-y-8"> {/* Increased space between elements */}
                  <div className="p-5 space-y-6">
                    <div className="flex items-center space-x-2">
                      <h4 className="text-base font-semibold text-gray-800">Create New Vendor Order</h4>
                      <div className="relative group">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-gray-400 hover:text-gray-600 cursor-pointer">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                        </svg>
                        <div className="absolute left-full top-1/2 transform -translate-y-1/2 ml-2 w-64 p-2 text-xs text-white bg-gray-700 rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-20">
                          This will add an item to the 'Order Cart'. You can review all items in the cart before submitting the final order request.
                          <div className="absolute right-full top-1/2 transform -translate-y-1/2 w-0 h-0 border-y-4 border-y-transparent border-r-4 border-r-gray-700"></div>
                    </div>
                      </div>
                    </div>
                    <form onSubmit={handleSubmitOrder} className="space-y-4">
                      <div>
                        <label htmlFor="vendorName" className="block text-sm font-medium text-gray-700 mb-1">Vendor Name</label>
                        <input
                          type="text"
                          id="vendorName"
                          name="vendorName"
                          value={vendorName}
                          onChange={(e) => setVendorName(e.target.value)}
                          placeholder="Enter vendor name"
                          className="block w-full px-3 py-2 border border-gray-300 rounded-md placeholder-gray-400 focus:outline-none focus:border-gray-500 sm:text-sm transition-colors"
                          required
                        />
                  </div>
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label htmlFor="orderQuantity" className="block text-sm font-medium text-gray-700">Quantity</label>
                          {item.unitPrice !== undefined && item.unitPrice !== null && (
                            <span className="text-sm text-gray-500">Unit Price: {formatCurrency(item.unitPrice)}</span>
                          )}
                </div>
                        <input
                          type="number"
                          id="orderQuantity"
                          name="orderQuantity"
                          value={orderQuantity}
                          onChange={(e) => setOrderQuantity(e.target.value)}
                          placeholder="e.g., 10"
                          className="block w-full px-3 py-2 border border-gray-300 rounded-md placeholder-gray-400 focus:outline-none focus:border-gray-500 sm:text-sm transition-colors"
                          min="1"
                          required
                        />
                      </div>

                      {/* Calculated Total Price Display */}
                      {item.unitPrice !== undefined && item.unitPrice !== null && orderQuantity && !isNaN(parseInt(orderQuantity, 10)) && parseInt(orderQuantity, 10) > 0 && (
                        <div className="pt-2">
                          <p className="text-sm font-medium text-gray-700">Total Price: 
                            <span className="font-semibold text-gray-900 ml-1">
                              {formatCurrency(parseInt(orderQuantity, 10) * item.unitPrice)}
                            </span>
                          </p>
                    </div>
                      )}

                      <div>
                        <label htmlFor="orderNotes" className="block text-sm font-medium text-gray-700 mb-1">Notes (Optional)</label>
                        <textarea
                          id="orderNotes"
                          name="orderNotes"
                          rows="3"
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="Add any specific instructions for this order..."
                          className="block w-full px-3 py-2 border border-gray-300 rounded-md placeholder-gray-400 focus:outline-none focus:border-gray-500 sm:text-sm transition-colors"
                        ></textarea>
                      </div>
                    <button
                      type="submit"
                        className="w-full flex items-center justify-center px-4 py-2.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-gray-600 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
                    >
                        <svg className="w-5 h-5 mr-2 -ml-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                          <path d="M3 1a1 1 0 000 2h1.22l.305 1.222a.997.997 0 00.01.042l1.358 5.43-.893.892C3.74 11.846 4.632 14 6.414 14H15a1 1 0 000-2H6.414l1-1H14a1 1 0 00.894-.553l3-6A1 1 0 0017 3H6.28l-.31-1.243A1 1 0 005 1H3zM16 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM6.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
                      </svg>
                      Add to Order Cart
                    </button>
                </form>
                    {/* Order Cart Display */}
                    {cart.orders.filter(ci => (ci.item && ci.item.mfgPartNumber === item.mfgPartNumber) || ci.mfg_part_number === item.mfgPartNumber).length > 0 && (
                  <div className="mt-8">
                        <h4 className="text-base font-semibold text-gray-800 mb-3">Order Cart ({cart.orders.filter(ci => (ci.item && ci.item.mfgPartNumber === item.mfgPartNumber) || ci.mfg_part_number === item.mfgPartNumber).length} item(s) for this part)</h4>
                        <ul className="divide-y divide-gray-200 border border-gray-200 rounded-md">
                          {cart.orders.filter(ci => (ci.item && ci.item.mfgPartNumber === item.mfgPartNumber) || ci.mfg_part_number === item.mfgPartNumber).map((cartItem, index) => (
                            <li key={`cart-order-${index}-${cartItem.item?.mfgPartNumber || cartItem.mfg_part_number}`} className="p-3 bg-white">
                              <div className="flex justify-between items-center">
                                <div>
                                  <p className="text-sm text-gray-700">
                                    {cartItem.item?.mfgPartNumber || cartItem.mfg_part_number} (Qty: {cartItem.quantity || cartItem.quantity_requested})
                                  </p>
                                  {(cartItem.requestingBranch || cartItem.requesting_branch) && 
                                    <p className="text-xs text-gray-500 mt-0.5">For Branch: <span className="font-medium">{cartItem.requestingBranch || cartItem.requesting_branch}</span></p>
                                  }
                                  {(cartItem.vendorName || cartItem.vendor_name) && 
                                    <p className="text-xs text-gray-500 mt-0.5">Vendor: <span className="font-medium">{cartItem.vendorName || cartItem.vendor_name}</span></p>
                                  }
                                  {cartItem.notes && 
                                    <p className="text-xs text-gray-500 mt-0.5">Notes: {cartItem.notes}</p>
                                  }
                    </div>
                                {/* Removed individual remove button here, submission is for whole cart in CartReviewModal */}
                              </div>
                            </li>
                          ))}
                        </ul>
                      <button
                          onClick={() => { onClose(); onNavigateToOrderCart(); }}
                          className="mt-3 w-full flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors"
                        >
                        Go to Order Cart
                      </button>
                  </div>
                )}
                  </div>
              </div>
            )}

            {/* Transfer Tab */}
            {activeTab === 'transfer' && (
                <div className="space-y-8">
                {otherBranches.length === 0 ? (
                    <div className="text-center p-8 border border-dashed border-gray-300 rounded-lg bg-gray-50">
                      <svg className="h-10 w-10 mx-auto text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                      <h3 className="mt-3 text-md font-medium text-gray-800">No Other Branches with Stock</h3>
                      <p className="mt-1 text-sm text-gray-600">This part is not currently available for transfer from other branches.</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-5">
                      <div>
                        <div className="flex items-center space-x-2 mb-2">
                          <h3 className="text-md font-semibold text-gray-800">Select Source Branch</h3>
                          <div className="relative group">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-gray-400 hover:text-gray-600 cursor-pointer">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                            </svg>
                            <div className="absolute left-full top-1/2 transform -translate-y-1/2 ml-2 w-64 p-2 text-xs text-white bg-gray-700 rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-20">
                              Transfers between branches usually do not require central approval. Your request will be sent to the supplying branch manager.
                              <div className="absolute right-full top-1/2 transform -translate-y-1/2 w-0 h-0 border-y-4 border-y-transparent border-r-4 border-r-gray-700"></div>
                            </div>
                          </div>
                        </div>
                        <div className="rounded-lg border border-gray-200 overflow-hidden">
                            <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                                    <th scope="col" className="w-12 px-4 py-2.5 text-center"></th> {/* For Radio */}
                                    <th scope="col" className="py-2.5 px-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Branch</th>
                                    <th scope="col" className="py-2.5 px-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Available</th>
                                    <th scope="col" className="py-2.5 px-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Unit Price</th>
                                    <th scope="col" className="py-2.5 px-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Value</th>
                                    <th scope="col" className="py-2.5 px-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Months of Coverage</th>
                                    <th scope="col" className="py-2.5 px-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">TTM Qty Used</th>
                                    <th scope="col" className="py-2.5 px-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Network Status</th>
                                    <th scope="col" className="py-2.5 px-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Branch Status</th>
                                    <th scope="col" className="py-2.5 px-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Last Receipt</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white">
                        {sortedOtherBranches.map((branchItem) => {
                                    const branchBadge = statusBadge[branchItem.status] || statusBadge.unknown;
                                    const companyBadge = statusBadge[branchItem.companyStatus] || statusBadge.unknown; // Use branchItem.companyStatus
                          const isSelected = selectedSourceBranchForTransfer === branchItem.branch;
                          return (
                            <tr 
                              key={branchItem.branch} 
                                        className={`hover:bg-gray-50 cursor-pointer ${isSelected ? 'bg-gray-100' : ''}`} 
                              onClick={() => setSelectedSourceBranchForTransfer(branchItem.branch)}
                            >
                                        <td className="px-4 py-3 text-center">
                                        <input 
                                          type="radio" 
                                            name="branch-select-transfer-from" 
                                          checked={isSelected}
                                            readOnly
                                            className="focus:ring-gray-500 h-4 w-4 text-gray-600 border-gray-300"
                                        />
                                      </td>
                                        <td className="py-3 px-3 whitespace-nowrap text-sm font-medium text-gray-900">
                                        {branchItem.branch}
                                      </td>
                                        <td className="py-3 px-3 whitespace-nowrap text-sm semibold text-gray-800 text-right">{branchItem.quantityOnHand}</td>
                                        <td className="py-3 px-3 whitespace-nowrap text-sm text-gray-600 text-right">{formatCurrency(branchItem.quantityOnHand > 0 ? branchItem.inventoryBalance / branchItem.quantityOnHand : 0)}</td>
                                        <td className="py-3 px-3 whitespace-nowrap text-sm text-gray-600 text-right">{formatCurrency(branchItem.inventoryBalance)}</td>
                                        <td className="py-3 px-3 whitespace-nowrap text-sm text-gray-600 text-right">
                                          {branchItem.monthsOfCoverage === Infinity || branchItem.monthsOfCoverage > 9999 ? 'Infinite' : (typeof branchItem.monthsOfCoverage === 'number' ? branchItem.monthsOfCoverage.toFixed(1) : 'N/A')}
                                        </td>
                                        <td className="py-3 px-3 whitespace-nowrap text-sm text-gray-600 text-right">{branchItem.ttmQtyUsed}</td>
                                        <td className="py-3 px-3 whitespace-nowrap text-center">
                                            {branchItem.companyStatus ? (
                                            <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${companyBadge.bg} ${companyBadge.text}`}>
                                                {companyBadge.label}
                                        </span>
                                            ) : 'N/A'}
                                  </td>
                                        <td className="py-3 px-3 whitespace-nowrap text-center">
                                            <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${branchBadge.bg} ${branchBadge.text}`}>{branchBadge.label}</span>
                                  </td>
                                        <td className="py-3 px-3 whitespace-nowrap text-sm text-gray-600">{branchItem.lastReceipt ? formatDate(branchItem.lastReceipt) : 'N/A'}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      
                        <form onSubmit={handleSubmitTransfer} className="bg-white rounded-lg border border-gray-200 p-6">
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div>
                              <label htmlFor="transferQuantity" className="block text-sm font-medium text-gray-700 mb-1">Quantity to Receive</label>
                              <input
                                type="number"
                                name="transferQuantity"
                                id="transferQuantity"
                                min="1"
                                max={selectedSourceBranchForTransfer ? (sortedOtherBranches.find(b => b.branch === selectedSourceBranchForTransfer)?.quantityOnHand || 1) : 1}
                                placeholder="Enter quantity"
                                value={transferQuantity}
                                onChange={(e) => setTransferQuantity(e.target.value)}
                                className="block w-full px-3 py-2 text-sm rounded-md bg-white border border-gray-200 focus:outline-none focus:border-gray-500 transition-colors duration-150 ease-in-out"
                                required
                                disabled={!selectedSourceBranchForTransfer}
                              />
                            </div>
                            <div className="bg-white border border-gray-200 rounded-lg p-4">
                              <div className="flex items-center space-x-2 mb-3">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-gray-600">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                                </svg>
                                <h5 className="text-sm font-semibold text-gray-800">Target Branch</h5>
                              </div>
                              <div className="space-y-2">
                                <div className="flex justify-between">
                                  <span className="text-xs text-gray-600">Branch:</span>
                                  <span className="text-xs font-medium text-gray-900">{item.branch}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-xs text-gray-600">Current Qty:</span>
                                  <span className="text-xs font-medium text-gray-900">{item.quantityOnHand || 0}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-xs text-gray-600">Current Value:</span>
                                  <span className="text-xs font-medium text-gray-900">{formatCurrency(item.inventoryBalance || 0)}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="mt-6">
                              <label htmlFor="transferFromNotes" className="block text-sm font-medium text-gray-700 mb-1">Notes (Optional)</label>
                              <textarea
                                id="transferFromNotes"
                                name="notes"
                                rows="3"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                className="block w-full px-3 py-2 text-sm rounded-md bg-white border border-gray-200 focus:outline-none focus:border-gray-500 transition-colors duration-150 ease-in-out"
                                placeholder="Any special requirements or urgency details..."
                                disabled={!selectedSourceBranchForTransfer}
                              ></textarea>
                          </div>
                          <div className="mt-8 pt-5 border-t border-gray-200">
                              <button
                                type="submit"
                                disabled={!selectedSourceBranchForTransfer || !transferQuantity || isNaN(parseInt(transferQuantity, 10)) || parseInt(transferQuantity, 10) <= 0 || (selectedSourceBranchForTransfer && parseInt(transferQuantity, 10) > (sortedOtherBranches.find(b => b.branch === selectedSourceBranchForTransfer)?.quantityOnHand || 0)) || requestStatus.isSubmitting}
                                className="w-full flex items-center justify-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-gray-800 hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-150"
                              >
                                 <svg className={`-ml-1 mr-2 h-5 w-5 ${requestStatus.isSubmitting ? 'animate-spin' : ''}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      {requestStatus.isSubmitting ? (
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.75V6.25m0 11.5v1.5m8.25-8.25h-1.5M4.75 12H3.25m15.06-5.06l-1.062-1.06M6.062 17.938l-1.06-1.06M17.938 6.062l-1.06 1.06M6.062 6.062l-1.06 1.062M12 12a5 5 0 110-10 5 5 0 010 10z" />
                                      ) : (
                                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                      )}
                                </svg>
                                      {requestStatus.isSubmitting && activeTab === 'transfer' ? 'Adding to Cart...' : 'Add to Transfer Cart'}
                              </button>
                          </div>
                        </form>
                    </div>
                  </>
                )}
                {/* Transfer Cart Display for "Transfer from Branch" tab */}
                {cart.transfers.filter(ci => (ci.item && ci.item.mfgPartNumber === item.mfgPartNumber) || ci.mfg_part_number === item.mfgPartNumber).length > 0 && (
                  <div className="mt-8">
                    <h4 className="text-base font-semibold text-gray-800 mb-3">Transfer Cart ({cart.transfers.filter(ci => (ci.item && ci.item.mfgPartNumber === item.mfgPartNumber) || ci.mfg_part_number === item.mfgPartNumber).length} item(s) for this part)</h4>
                    <ul className="divide-y divide-gray-200 border border-gray-200 rounded-md">
                      {cart.transfers.filter(ci => (ci.item && ci.item.mfgPartNumber === item.mfgPartNumber) || ci.mfg_part_number === item.mfgPartNumber).map((cartItem, index) => (
                        <li key={`cart-transfer-from-${index}-${cartItem.item?.mfgPartNumber || cartItem.mfg_part_number}`} className="p-3 bg-white">
                          <div className="flex justify-between items-center">
                            <div>
                              <p className="text-sm text-gray-700">
                                {cartItem.item?.mfgPartNumber || cartItem.mfg_part_number} (Qty: {cartItem.quantity || cartItem.quantity_requested})
                              </p>
                              <p className="text-xs text-gray-500 mt-0.5">
                                From: <span className="font-medium">{cartItem.sourceBranch || cartItem.source_branch}</span> To: <span className="font-medium">{cartItem.destinationBranch || cartItem.destination_branch}</span>
                              </p>
                              {cartItem.notes && <p className="text-xs text-gray-500 mt-0.5">Notes: {cartItem.notes}</p>}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                    <button
                      onClick={() => { onClose(); onNavigateToTransferCart(); }}
                      className="mt-3 w-full flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-colors"
                    >
                      Go to Transfer Cart
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Transfer To Tab */}
            {activeTab === 'transferTo' && (
                <div className="space-y-8">
                   {allBranchItems.filter(bi => bi.branch !== item.branch).length === 0 ? (
                     <div className="text-center p-8 border border-dashed border-gray-300 rounded-lg bg-gray-50">
                        <svg className="h-10 w-10 mx-auto text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                        <h3 className="mt-3 text-md font-medium text-gray-800">No Other Branches Available</h3>
                        <p className="mt-1 text-sm text-gray-600">There are no other branches defined to transfer this part to.</p>
                    </div>
                  ) : (
                    <>
                    <div className="space-y-3">
                        <div className="flex items-center space-x-2">
                          <h4 className="text-md font-semibold text-gray-800">Select Target Branch</h4>
                          <div className="relative group">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-gray-400 hover:text-gray-600 cursor-pointer">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                            </svg>
                            <div className="absolute left-full top-1/2 transform -translate-y-1/2 ml-2 w-64 p-2 text-xs text-white bg-gray-700 rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-20">
                              {`Items transferred from the current branch (${item.branch}) to another branch. This request will be recorded.`}
                              <div className="absolute right-full top-1/2 transform -translate-y-1/2 w-0 h-0 border-y-4 border-y-transparent border-r-4 border-r-gray-700"></div>
                        </div>
                      </div>
                    </div>
                        <div className="overflow-x-auto rounded-lg border border-gray-200">
                          <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                                <th scope="col" className="w-12 px-4 py-2.5 text-center"></th> {/* For Radio */}
                                <th scope="col" className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Branch</th>
                                <th scope="col" className="py-3 px-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Quantity</th>
                                <th scope="col" className="py-3 px-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Unit Price</th>
                                <th scope="col" className="py-3 px-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Value</th>
                                <th scope="col" className="py-3 px-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Months of Coverage</th>
                                <th scope="col" className="py-3 px-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">TTM Qty Used</th>
                                <th scope="col" className="py-3 px-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Network Status</th>
                                <th scope="col" className="py-3 px-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Branch Status</th>
                                <th scope="col" className="py-3 px-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Last Receipt</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 bg-white">
                              {allBranchItems.filter(bi => bi.branch !== item.branch).map((branchItem, idx) => {
                                const branchBadge = statusBadge[branchItem.status] || statusBadge.unknown;
                                const companyBadge = statusBadge[branchItem.companyStatus] || statusBadge.unknown;
                              const isSelected = selectedDestinationBranchForTransfer === branchItem.branch;
                              return (
                                  <tr key={`${branchItem.branch}-dest-${idx}`} 
                                      className={`hover:bg-gray-50 cursor-pointer ${isSelected ? 'bg-gray-100' : ''}`}
                                  onClick={() => setSelectedDestinationBranchForTransfer(branchItem.branch)}
                                >
                                    <td className="px-4 py-3 text-center">
                                    <input 
                                      type="radio" 
                                        name="branch-select-transfer-to" 
                                      checked={isSelected}
                                        readOnly
                                        className="focus:ring-gray-500 h-4 w-4 text-gray-600 border-gray-300"
                                    />
                                  </td>
                                    <td className="py-3 px-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                    {branchItem.branch}
                                    </td>
                                    <td className="py-3 px-4 whitespace-nowrap text-sm text-gray-600 text-right">{branchItem.quantityOnHand}</td>
                                    <td className="py-3 px-4 whitespace-nowrap text-sm text-gray-600 text-right">{formatCurrency(branchItem.quantityOnHand > 0 ? branchItem.inventoryBalance / branchItem.quantityOnHand : 0)}</td>
                                    <td className="py-3 px-4 whitespace-nowrap text-sm text-gray-600 text-right">{formatCurrency(branchItem.inventoryBalance)}</td>
                                    <td className="py-3 px-4 whitespace-nowrap text-sm text-gray-600 text-right">
                                      {branchItem.monthsOfCoverage === Infinity || branchItem.monthsOfCoverage > 9999 ? 'Infinite' : (typeof branchItem.monthsOfCoverage === 'number' ? branchItem.monthsOfCoverage.toFixed(1) : 'N/A')}
                                    </td>
                                    <td className="py-3 px-4 whitespace-nowrap text-sm text-gray-600 text-right">{branchItem.ttmQtyUsed}</td>
                                    <td className="py-3 px-4 whitespace-nowrap text-center">
                                      {branchItem.companyStatus ? (
                                        <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${companyBadge.bg} ${companyBadge.text}`}>
                                          {companyBadge.label}
                                      </span>
                                      ) : 'N/A'}
                                  </td>
                                    <td className="py-3 px-4 whitespace-nowrap text-center">
                                      <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${branchBadge.bg} ${branchBadge.text}`}>
                                        {branchBadge.label}
                                    </span>
                                  </td>
                                    <td className="py-3 px-4 whitespace-nowrap text-sm text-gray-600">{branchItem.lastReceipt ? formatDate(branchItem.lastReceipt) : 'N/A'}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  
                    <form onSubmit={handleSubmitTransferTo} className="bg-white rounded-lg border border-gray-200 p-6">
                        <div className="flex items-center space-x-2 mb-5">
                          {/* Title is now part of the table section above */}
                        </div>
                        <div className="grid grid-cols-1 gap-y-6 gap-x-4">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                              <div>
                                  <label htmlFor="transferToQuantity" className="block text-sm font-medium text-gray-700 mb-1">Quantity to Transfer</label>
                              <input
                                type="number"
                                name="transferToQuantity"
                                id="transferToQuantity"
                                min="1"
                                      max={item.quantityOnHand || 1}
                                placeholder="Enter quantity"
                                value={transferToQuantity}
                                onChange={(e) => setTransferToQuantity(e.target.value)}
                                      className="block w-full px-3 py-2 text-sm rounded-md bg-white border border-gray-200 focus:outline-none focus:border-gray-500 transition-colors duration-150 ease-in-out"
                                required
                                      disabled={!selectedDestinationBranchForTransfer}
                              />
                                  </div>
                              
                              {/* Source Branch Availability Indicator */}
                              <div className="bg-white border border-gray-200 rounded-lg p-4">
                                <div className="flex items-center space-x-2 mb-3">
                                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-gray-600">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3-6h3.75m-3 3h3.75m-3 3h3.75M7.5 3h9A1.5 1.5 0 0118 4.5v15A1.5 1.5 0 0116.5 21h-9A1.5 1.5 0 016 19.5V4.5A1.5 1.5 0 017.5 3z" />
                                  </svg>
                                  <h5 className="text-sm font-semibold text-gray-800">Source Branch</h5>
                                </div>
                                <div className="space-y-2">
                                  <div className="flex justify-between">
                                    <span className="text-xs text-gray-600">Branch:</span>
                                    <span className="text-xs font-medium text-gray-900">{item.branch}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-xs text-gray-600">Available:</span>
                                    <span className="text-xs font-medium text-gray-900">{item.quantityOnHand || 0}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-xs text-gray-600">Value:</span>
                                    <span className="text-xs font-medium text-gray-900">{formatCurrency(item.inventoryBalance || 0)}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div>
                                <label htmlFor="transferToNotes" className="block text-sm font-medium text-gray-700 mb-1">Notes (Optional)</label>
                            <textarea
                              id="transferToNotes"
                                    name="notes"
                              rows="3"
                              value={notes}
                              onChange={(e) => setNotes(e.target.value)}
                                    className="block w-full px-3 py-2 text-sm rounded-md bg-white border border-gray-200 focus:outline-none focus:border-gray-500 transition-colors duration-150 ease-in-out"
                                placeholder="Any special requirements or urgency details..."
                                    disabled={!selectedDestinationBranchForTransfer}
                            ></textarea>
                          </div>
                        </div>
                         <div className="mt-8 pt-5 border-t border-gray-200">
                        <button
                          type="submit"
                                disabled={!selectedDestinationBranchForTransfer || !transferToQuantity || isNaN(parseInt(transferToQuantity, 10)) || parseInt(transferToQuantity, 10) <= 0 || parseInt(transferToQuantity, 10) > (item.quantityOnHand || 0) || requestStatus.isSubmitting}
                                className="w-full flex items-center justify-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-gray-800 hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-150"
                            >
                               <svg className={`-ml-1 mr-2 h-5 w-5 ${requestStatus.isSubmitting ? 'animate-spin' : ''}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    {requestStatus.isSubmitting ? (
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.75V6.25m0 11.5v1.5m8.25-8.25h-1.5M4.75 12H3.25m15.06-5.06l-1.062-1.06M6.062 17.938l-1.06-1.06M17.938 6.062l-1.06 1.06M6.062 6.062l-1.06 1.062M12 12a5 5 0 110-10 5 5 0 010 10z" />
                                    ) : (
                                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                    )}
                              </svg>
                                    {requestStatus.isSubmitting && activeTab === 'transferTo' ? 'Adding to Cart...' : 'Add to Transfer Cart'}
                              </button>
                          </div>
                        </form>
                    </>
                  )}
                  {/* Transfer Cart Display for "Transfer to Branch" tab */}
                  {cart.transfers.filter(ci => (ci.item && ci.item.mfgPartNumber === item.mfgPartNumber) || ci.mfg_part_number === item.mfgPartNumber).length > 0 && (
                    <div className="mt-8">
                        <h4 className="text-base font-semibold text-gray-800 mb-3">Transfer Cart ({cart.transfers.filter(ci => (ci.item && ci.item.mfgPartNumber === item.mfgPartNumber) || ci.mfg_part_number === item.mfgPartNumber).length} item(s) for this part)</h4>
                        <ul className="divide-y divide-gray-200 border border-gray-200 rounded-md">
                          {cart.transfers.filter(ci => (ci.item && ci.item.mfgPartNumber === item.mfgPartNumber) || ci.mfg_part_number === item.mfgPartNumber).map((cartItem, index) => (
                            <li key={`cart-transfer-to-${index}-${cartItem.item?.mfgPartNumber || cartItem.mfg_part_number}`} className="p-3 bg-white">
                              <div className="flex justify-between items-center">
                                <div>
                                  <p className="text-sm text-gray-700">
                                    {cartItem.item?.mfgPartNumber || cartItem.mfg_part_number} (Qty: {cartItem.quantity || cartItem.quantity_requested})
                                  </p>
                                  <p className="text-xs text-gray-500 mt-0.5">
                                    From: <span className="font-medium">{cartItem.sourceBranch || cartItem.source_branch}</span> To: <span className="font-medium">{cartItem.destinationBranch || cartItem.destination_branch}</span>
                                  </p>
                                  {cartItem.notes && <p className="text-xs text-gray-500 mt-0.5">Notes: {cartItem.notes}</p>}
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                        <button
                          onClick={() => { onClose(); onNavigateToTransferCart(); }}
                          className="mt-3 w-full flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-colors"
                        >
                          Go to Transfer Cart
                        </button>
                    </div>
                  )}
                  </div>
                )}
            </div>

            {/* Global Request Status Message - moved to bottom of modal content */}
                {requestStatus.message && (
              <div className={`mt-6 p-4 rounded-md text-sm border ${requestStatus.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : requestStatus.type === 'error' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-blue-50 border-blue-200 text-blue-700'}`} role="alert">
                <div className="flex items-center">
                    <div className="flex-shrink-0">
                        {requestStatus.type === 'success' && <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                        {requestStatus.type === 'error' && <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>}
                        {requestStatus.type !== 'success' && requestStatus.type !== 'error' && <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>}
                  </div>
                    <div className="ml-3">
                        <p>{requestStatus.message}</p>
              </div>
          </div>
              </div>
            )}
          </div> {/* End Scrollable Content Area */}
        </div>
      </div>
    </div>
  );
};

export default ItemDetailModal;