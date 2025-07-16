import React, { useState, useEffect, useCallback } from 'react';
import { formatCurrency } from '../utils/inventoryHelpers'; // Assuming this utility is available
import { 
  ArrowPathIcon, 
  CheckCircleIcon, // For "Completed"
  XCircleIcon,     // For "Cancelled"
  PencilSquareIcon, // For "Update Status"
  InformationCircleIcon
} from '@heroicons/react/24/outline'; 
import { TrashIcon, EyeIcon, ShoppingCartIcon, ExclamationTriangleIcon } from '@heroicons/react/24/solid';

const OrderRequestsPage = ({
  activeUserEmail, // For fetching active orders
  activeOrderCartItems, // Cart items passed directly from App.js
  onRemoveActiveOrderItem, // API handler from App.js
  onUpdateActiveOrderItemQuantity, // API handler from App.js
  onClearActiveOrderCart, // API handler from App.js
  onSubmitRequest, // Unified submit handler from App.js
  isSubmittingOrderCart, // ADDED: To disable buttons during cart submission
  
  requestStatus, // Global request status from App.js
  initialSection = 'activeCart', // Default to activeCart, can be overridden
  apiBaseUrl,
  userPreferences,
  activeUserRole // User's role for conditional rendering
}) => {
  // Add a console.log here to check the prop on render
  console.log('[OrderRequestsPage] onSubmitRequest prop on render:', onSubmitRequest);

  const [activeSection, setActiveSection] = useState(initialSection);

  // State for API-driven active order cart
  const [activeOrderItems, setActiveOrderItems] = useState([]);
  const [isLoadingActiveCart, setIsLoadingActiveCart] = useState(false);
  const [activeCartError, setActiveCartError] = useState(null);
  const [submitOrderNotes, setSubmitOrderNotes] = useState('');
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false); // Local submitting state for UI feedback

  // Effect to update active section if initialSection prop changes (e.g. user clicks button in App.js again)
  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  const hasActiveOrderItems = activeOrderItems && activeOrderItems.length > 0;

  // Placeholder for pending orders data and fetching
  const [pendingOrders, setPendingOrders] = useState([]);
  const [isLoadingPending, setIsLoadingPending] = useState(false);
  const [pendingError, setPendingError] = useState(null);
  const [isClearingOrderId, setIsClearingOrderId] = useState(null); // State for tracking which order is being cleared
  const [clearOrderError, setClearOrderError] = useState(null); // State for specific clear error
  const [orderToConfirmClear, setOrderToConfirmClear] = useState(null); // ID of order requiring confirmation
  const [confirmPopupPosition, setConfirmPopupPosition] = useState({ top: 0, left: 0, visible: false });
  const [isRefreshTooltipVisible, setIsRefreshTooltipVisible] = useState(false);
  const currentActiveRefreshTooltip = React.useRef(null); // To manage which tooltip is active

  // State for Completed Orders
  const [completedOrders, setCompletedOrders] = useState([]);
  const [isLoadingCompleted, setIsLoadingCompleted] = useState(false);
  const [completedError, setCompletedError] = useState(null);

  // State for Cancelled Orders
  const [cancelledOrders, setCancelledOrders] = useState([]);
  const [isLoadingCancelled, setIsLoadingCancelled] = useState(false);
  const [cancelledError, setCancelledError] = useState(null);
  
  // State for the confirmation pop-up for updating status
  const [orderToUpdate, setOrderToUpdate] = useState(null); // ID of order requiring status update confirmation
  const [statusUpdatePopupPosition, setStatusUpdatePopupPosition] = useState({ top: 0, left: 0, visible: false });
  const [isUpdatingStatusOrderId, setIsUpdatingStatusOrderId] = useState(null); // For spinner on confirm buttons
  const [statusUpdateError, setStatusUpdateError] = useState(null);

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        // second: '2-digit', // Optional: if seconds are needed
        hour12: true,
      });
    } catch (error) {
      console.error("Error formatting date:", dateString, error);
      return dateString; // Fallback to original string
    }
  };

  // Fetch API-driven active order items
  const fetchActiveOrderItems = useCallback(async () => {
    if (!apiBaseUrl || !activeUserEmail) {
      setActiveCartError('API URL or User Email not configured for active cart.');
      console.warn('fetchActiveOrderItems skipped: API URL or User Email not configured.');
      return;
    }
    setIsLoadingActiveCart(true);
    setActiveCartError(null);
    try {
      // TODO: Ensure the token is acquired and passed if this endpoint is protected
      // For now, assuming App.js handles token for POST/PUT/DELETE and GET might be simpler or session-based
      // If GET needs auth, this fetch needs to be enhanced similar to App.js API calls.
      const response = await fetch(`${apiBaseUrl}/active-orders?user_email=${encodeURIComponent(activeUserEmail)}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: `HTTP error ${response.status}` }));
        throw new Error(errorData.detail || `Failed to fetch active order items: ${response.statusText}`);
      }
      const data = await response.json();
      setActiveOrderItems(data || []);
    } catch (error) {
      console.error("Error fetching active order items:", error);
      setActiveCartError(error.message);
      setActiveOrderItems([]); // Clear items on error
    } finally {
      setIsLoadingActiveCart(false);
    }
  }, [apiBaseUrl, activeUserEmail]);

  const fetchPendingOrders = useCallback(async () => {
    if (!apiBaseUrl) {
      setPendingError('API URL not configured');
      return;
    }
    setIsLoadingPending(true);
    setPendingError(null);
    setStatusUpdateError(null); // Clear any previous specific update errors
    try {
      const response = await fetch(`${apiBaseUrl}/pending-orders`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: `HTTP error ${response.status}` }));
        throw new Error(errorData.detail || `Failed to fetch pending orders: ${response.statusText}`);
      }
      const data = await response.json();
      setPendingOrders(data || []);
    } catch (error) {
      console.error("Error fetching pending orders:", error);
      setPendingError(error.message);
      setPendingOrders([]);
    } finally {
      setIsLoadingPending(false);
    }
  }, [apiBaseUrl]);

  const fetchCompletedOrders = useCallback(async () => {
    setIsLoadingCompleted(true);
    setCompletedError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/completed-orders`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: `HTTP error ${response.status}` }));
        throw new Error(errorData.detail || `Failed to fetch completed orders: ${response.statusText}`);
      }
      const data = await response.json();
      setCompletedOrders(data || []);
    } catch (error) {
      console.error("Error fetching completed orders:", error);
      setCompletedError(error.message);
    } finally {
      setIsLoadingCompleted(false);
    }
  }, [apiBaseUrl]);

  const fetchCancelledOrders = useCallback(async () => {
    setIsLoadingCancelled(true);
    setCancelledError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/cancelled-orders`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: `HTTP error ${response.status}` }));
        throw new Error(errorData.detail || `Failed to fetch cancelled orders: ${response.statusText}`);
      }
      const data = await response.json();
      setCancelledOrders(data || []);
    } catch (error) {
      console.error("Error fetching cancelled orders:", error);
      setCancelledError(error.message);
    } finally {
      setIsLoadingCancelled(false);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    if (activeSection === 'pendingOrders' && apiBaseUrl) {
      fetchPendingOrders();
    } else if (activeSection === 'completedOrders' && apiBaseUrl) {
      fetchCompletedOrders();
    } else if (activeSection === 'cancelledOrders' && apiBaseUrl) {
      fetchCancelledOrders();
    } else if (activeSection === 'activeCart' && apiBaseUrl && activeUserEmail) { // Ensure email and URL are present
      fetchActiveOrderItems();
    } else if (activeSection === 'activeCart') {
      // If it's the activeCart section but pre-requisites aren't met, 
      // log it or set a specific state. The fetch function itself will also guard.
      console.warn('OrderRequestsPage: activeCart section is active, but apiBaseUrl or activeUserEmail is not yet available. Fetch will be skipped by fetchActiveOrderItems.');
      // Optionally, clear items or show a specific loading/waiting message if not already handled
      // setActiveOrderItems([]); 
      // setIsLoadingActiveCart(true); // Or a different loading state like 'waitingForUser'
    }

    // Clear pop-ups when section changes
    setConfirmPopupPosition({ top: 0, left: 0, visible: false });
    setOrderToConfirmClear(null);
    setStatusUpdatePopupPosition({ top: 0, left: 0, visible: false });
    setOrderToUpdate(null);
    setStatusUpdateError(null); // Clear errors as well
  }, [activeSection, fetchPendingOrders, fetchCompletedOrders, fetchCancelledOrders, fetchActiveOrderItems]);

  // Effect to re-fetch active cart if a global success message related to cart update appears
  // This is a simple way to refresh data after actions in other components (e.g. ItemDetailModal)
  useEffect(() => {
    if (requestStatus && requestStatus.type === 'success' && 
        (requestStatus.message.includes('added to active order') || 
         requestStatus.message.includes('Item removed from active order') ||
         requestStatus.message.includes('Item quantity updated in active order') ||
         requestStatus.message.includes('Active order cleared'))
       ) {
      if (activeSection === 'activeCart') {
        fetchActiveOrderItems();
      }
    }
  }, [requestStatus, fetchActiveOrderItems, activeSection]);

  const handleClearPendingOrder = async (orderId, event) => {
    setClearOrderError(null);
    setPendingError(null);

    const rect = event.currentTarget.getBoundingClientRect();
    setConfirmPopupPosition({
      // Position to the right and vertically centered relative to the button
      // Adjust offsets as needed for aesthetics
      top: rect.top + window.scrollY + rect.height / 2, 
      left: rect.right + window.scrollX + 10, // 10px to the right
      visible: true,
    });
    setOrderToConfirmClear(orderId);
  };

  const executeConfirmedClear = async () => {
    if (!orderToConfirmClear) return;

    const orderId = orderToConfirmClear;
    setIsClearingOrderId(orderId);
    setClearOrderError(null);
    setPendingError(null);
    
    try {
      const response = await fetch(`${apiBaseUrl}/order-request/${orderId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: `HTTP error ${response.status}` }));
        throw new Error(errorData.detail || `Failed to clear order request: ${response.statusText}`);
      }
      fetchPendingOrders(); // Refresh the list
    } catch (error) {
      console.error(`Error clearing order request ${orderId}:`, error);
      setClearOrderError(error.message);
    } finally {
      setIsClearingOrderId(null);
      setOrderToConfirmClear(null); // Hide confirmation on completion
      setConfirmPopupPosition({ ...confirmPopupPosition, visible: false });
    }
  };

  const cancelClearConfirmation = () => {
    setOrderToConfirmClear(null);
    setConfirmPopupPosition({ ...confirmPopupPosition, visible: false });
  };

  const handleShowUpdateStatusPopup = (orderId, event) => {
    setStatusUpdateError(null); // Clear previous errors
    setPendingError(null); // Clear general pending error if any

    const rect = event.currentTarget.getBoundingClientRect();
    setStatusUpdatePopupPosition({
      top: rect.top + window.scrollY + rect.height / 2, // Center vertically relative to the button
      left: rect.right + window.scrollX + 10, // Position to the right with some margin
      visible: true,
    });
    setOrderToUpdate(orderId);
  };

  const executeConfirmedStatusUpdate = async (newStatus) => {
    if (!orderToUpdate) return;

    setIsUpdatingStatusOrderId(orderToUpdate);
    setStatusUpdateError(null); // Clear previous update errors
    // Don't clear general pendingError here, only set specific statusUpdateError if this action fails

    try {
      const response = await fetch(`${apiBaseUrl}/order-request/${orderToUpdate}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ new_status: newStatus }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: `HTTP error ${response.status}` }));
        throw new Error(errorData.detail || `Failed to update order status: ${response.statusText}`);
      }
      
      // Successfully updated
      setStatusUpdatePopupPosition({ ...statusUpdatePopupPosition, visible: false }); // Close pop-up
      setOrderToUpdate(null); // Clear the order ID being updated
      
      // Refresh the relevant lists
      fetchPendingOrders(); // Always refresh pending as an item moves out of it
      if (newStatus === 'Completed') {
        fetchCompletedOrders();
      } else if (newStatus === 'Cancelled') {
        fetchCancelledOrders();
      }

    } catch (error) {
      console.error(`Error updating order status to ${newStatus}:`, error);
      // Set specific error for the pop-up to display
      setStatusUpdateError(`Failed to update order ID ${orderToUpdate} to ${newStatus}: ${error.message}`);
      // Keep pop-up open by not changing its visibility or orderToUpdate
    } finally {
      setIsUpdatingStatusOrderId(null); // Stop loading spinner for this specific action
    }
  };

  const handleRefresh = () => {
    if (activeSection === 'pendingOrders') fetchPendingOrders();
    else if (activeSection === 'completedOrders' && apiBaseUrl) fetchCompletedOrders();
    else if (activeSection === 'cancelledOrders' && apiBaseUrl) fetchCancelledOrders();
    else if (activeSection === 'activeCart' && apiBaseUrl && activeUserEmail) fetchActiveOrderItems();
  };

  // Refactored renderOrderCart to use API-driven state and props
  // Submit orders to the database and return a success flag
  const submitOrdersToDatabase = async (items) => {
    if (!items || items.length === 0 || !apiBaseUrl) return false;
    
    try {
      // First check if all required fields are present in each item
      const ordersToSubmit = items.map(item => {
        // Extract data from various possible formats
        const mfgPartNumber = item.mfg_part_number || 
                             (item.item && item.item.mfgPartNumber) || 
                             'Unknown';
        
        const internalPartNumber = item.internal_part_number || 
                                  (item.item && item.item.partNumber) || 
                                  null;

        const itemDescription = item.item_description || 
                               (item.item && item.item.description) || 
                               'No description';
        
        const quantityRequested = item.quantity_requested || 
                                 item.quantity || 
                                 1;

        const vendorName = item.vendorName || 
                          'Not specified';
        
        const notes = item.notes || null;
        
        const requestingBranch = item.requestingBranch || 
                                'Main Branch';
        
        // Return formatted order object
        return {
          mfg_part_number: mfgPartNumber,
          internal_part_number: internalPartNumber,
          item_description: itemDescription,
          quantity_requested: quantityRequested,
          vendor_name: vendorName,
          notes: notes,
          requesting_branch: requestingBranch,
          // Use the actual logged-in user's email
          requested_by_user_email: activeUserEmail,
          order_status: 'Pending Send'
        };
      });
      
      // Submit orders to the database endpoint
      const response = await fetch(`${apiBaseUrl}/submit-orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orders: ordersToSubmit }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: `HTTP error ${response.status}` }));
        throw new Error(errorData.detail || `Failed to submit orders: ${response.statusText}`);
      }
      
      // Successfully submitted
      console.log('Orders submitted to database:', ordersToSubmit.length);
      return true;
        } catch (error) {
      console.error('Error submitting orders to database:', error);
      return false;
    }
  };

  // Function to generate a Teams message/chat for sharing
  const generateTeamsLink = async (items) => {
    if (!items || items.length === 0) return;
    
    // First submit orders to the database
    const submitted = await submitOrdersToDatabase(items);
    if (!submitted) {
      alert('Failed to submit orders to the database. The message will still be created, but orders may not be saved.');
    }
    
    // Build a comprehensive message for Teams
    let message = `Inventory Order Request - ${new Date().toLocaleDateString()}\n\n`;
    message += `Please review the following order request:\n\n`;
    
    // Add each item with detailed information
    items.forEach((item, index) => {
      // Handle different item structures (from API vs from cart)
      const partNumber = item.internal_part_number || 
                         item.mfg_part_number || 
                         (item.item && item.item.partNumber) || 
                         (item.item && item.item.mfgPartNumber) || 
                         'N/A';
      
      const description = item.item_description || 
                          (item.item && item.item.description) || 
                          'N/A';
      
      const quantity = item.quantity_requested || item.quantity || 0;
      
      const branch = item.requesting_branch || item.requestingBranch || 'N/A';
      const vendor = item.vendor_name || item.vendorName || 'N/A';
      
      // Add item details with more comprehensive information
      message += `------ ITEM ${index + 1} ------\n`;
      message += `Part Number: ${partNumber}\n`;
      message += `Description: ${description}\n`;
      message += `Quantity: ${quantity}\n`;
      message += `Branch: ${branch}\n`;
      message += `Vendor: ${vendor}\n`;
      
      // Add notes if available
      if (item.notes) {
        message += `Notes: ${item.notes}\n`;
    }

      message += '\n';
    });
    
    message += `Thank you for processing this request.\n`;
    message += `This request was generated from the ZentroQ Inventory Management System.`;
    
    // Encode for URL
    const encodedMessage = encodeURIComponent(message);
    
    // Use a simple Teams chat URL
    const teamsUrl = `https://teams.microsoft.com/l/chat/0/0?users=&message=${encodedMessage}`;
    
    // Open in a new window/tab
    window.open(teamsUrl, '_blank');
    
    // Clear the cart after successful submission (if configured)
    if (submitted && onClearActiveOrderCart) {
      setTimeout(() => {
        onClearActiveOrderCart();
      }, 500); // Small delay to ensure UI updates properly
    }
  };
  
  // Function to generate an Outlook email
  const generateOutlookLink = async (items) => {
    if (!items || items.length === 0) return;
    
    // First submit orders to the database
    const submitted = await submitOrdersToDatabase(items);
    if (!submitted) {
      alert('Failed to submit orders to the database. The email will still be created, but orders may not be saved.');
    }
    
    const subject = encodeURIComponent(`Inventory Order Request - ${new Date().toLocaleDateString()}`);
    
    // Create a comprehensive message
    let body = `Inventory Order Request - ${new Date().toLocaleDateString()}\n\n`;
    body += `Please review the following order request:\n\n`;
    
    // Add each item with detailed information
    items.forEach((item, index) => {
      // Handle different item structures (from API vs from cart)
      const partNumber = item.internal_part_number || 
                         item.mfg_part_number || 
                         (item.item && item.item.partNumber) || 
                         (item.item && item.item.mfgPartNumber) || 
                         'N/A';
      
      const description = item.item_description || 
                          (item.item && item.item.description) || 
                          'N/A';
      
      const quantity = item.quantity_requested || item.quantity || 0;
      
      const branch = item.requesting_branch || item.requestingBranch || 'N/A';
      const vendor = item.vendor_name || item.vendorName || 'N/A';
      
      // Add item details with more comprehensive information
      body += `------ ITEM ${index + 1} ------\n`;
      body += `Part Number: ${partNumber}\n`;
      body += `Description: ${description}\n`;
      body += `Quantity: ${quantity}\n`;
      body += `Branch: ${branch}\n`;
      body += `Vendor: ${vendor}\n`;
      
      // Add notes if available
      if (item.notes) {
        body += `Notes: ${item.notes}\n`;
      }
      
      body += '\n';
    });
    
    body += `Thank you for processing this request.\n`;
    body += `This request was generated from the ZentroQ Inventory Management System.`;
    
    // Use Office Web App URL with simplified parameters
    const outlookUrl = `https://outlook.office.com/owa/?path=/mail/action/compose&subject=${subject}&body=${encodeURIComponent(body)}`;
    
    // Open in a new window/tab
    window.open(outlookUrl, '_blank');
    
    // Clear the cart after successful submission (if configured)
    if (submitted && onClearActiveOrderCart) {
      setTimeout(() => {
        onClearActiveOrderCart();
      }, 500); // Small delay to ensure UI updates properly
    }
  };

  const renderOrderCart = () => {
    // Early exit if prerequisites for fetching active cart are not met
    // This check might need adjustment based on how activeOrderCartItems is populated
    if (!apiBaseUrl && !activeUserEmail && !onSubmitRequest) { // Added onSubmitRequest to the check
      return (
        <div className="text-center py-10">
          <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">Order Cart Unavailable</h3>
          <p className="mt-1 text-sm text-gray-500">Required information is missing to display the order cart.</p>
        </div>
      );
    }

    const hasActiveOrderItems = activeOrderCartItems && activeOrderCartItems.length > 0;

    // Calculate total for active order cart
    const activeOrderTotal = hasActiveOrderItems 
      ? activeOrderCartItems.reduce((acc, cartItem) => {
          // Assuming cartItem.item has a 'unitPrice' or similar field
          // If unitPrice is not directly available, it might need to be calculated
          // e.g., from item.inventoryBalance and item.quantityOnHand if those represent unit cost.
          // For now, let's assume a 'unitPrice' field or default to 0.
          // const unitPrice = parseFloat(cartItem.item?.unitPrice || cartItem.item?.inventoryBalance / cartItem.item?.quantityOnHand || 0); // Removed
          // return acc + (parseInt(cartItem.quantity, 10) * unitPrice); // Removed
          return acc; // Modified to just return accumulator as price is removed
        }, 0)
      : 0;

    return (
      <div className="space-y-6">
      <div className="bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                Active Order Cart
              </h3>
            {hasActiveOrderItems && (
              <button
                  onClick={onClearActiveOrderCart}
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-500 disabled:opacity-50"
                  disabled={isSubmittingOrderCart || (requestStatus && requestStatus.isSubmitting)}
              >
                Clear Cart
              </button>
            )}
          </div>

            {!hasActiveOrderItems ? (
              <div className="text-center py-10 border-2 border-dashed border-gray-300 rounded-lg">
                <ShoppingCartIcon className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">Your order cart is empty</h3>
                <p className="mt-1 text-sm text-gray-500">Add items from the inventory to get started.</p>
              </div>
            ) : (
              <div className="flow-root">
                <div className="-my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
                  <div className="py-2 align-middle inline-block min-w-full sm:px-6 lg:px-8">
                    <div className="shadow overflow-hidden border-b border-gray-200 sm:rounded-lg">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Item Details
                            </th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Branch / Vendor
                            </th>
                            <th scope="col" className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Qty
                            </th>
                            {/* <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Unit Price
                            </th>
                            <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Total
                            </th> */}
                            <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Notes
                            </th>
                            <th scope="col" className="relative px-6 py-3">
                              <span className="sr-only">Remove</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {activeOrderCartItems.map((cartItem, index) => {
                            const item = cartItem.item || {};
                            // const unitPrice = parseFloat(item.unitPrice || item.inventoryBalance / item.quantityOnHand || 0); // Removed
                            // const totalItemPrice = parseInt(cartItem.quantity, 10) * unitPrice; // Removed
                            return (
                              <tr key={cartItem.id || item.mfgPartNumber}>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="text-sm font-medium text-gray-900">{item.description || 'N/A'}</div>
                                  <div className="text-xs text-gray-500">MFG P/N: {item.mfgPartNumber || 'N/A'}</div>
                                  <div className="text-xs text-gray-500">Internal P/N: {item.partNumber || 'N/A'}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="text-sm text-gray-900">Branch: {cartItem.requestingBranch || 'N/A'}</div>
                                  <div className="text-sm text-gray-500">Vendor: {cartItem.vendorName || 'N/A'}</div>
                                </td>
                                <td className="px-3 py-4 whitespace-nowrap text-center">
                                  {/* Simplified quantity display for now, can add input for changes later if needed */}
                                  <span className="text-sm text-gray-700">{cartItem.quantity}</span>
                                </td>
                                {/* <td className="px-6 py-4 whitespace-nowrap text-right">
                                  <span className="text-sm text-gray-700">${unitPrice.toFixed(2)}</span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right">
                                  <span className="text-sm font-medium text-gray-900">${totalItemPrice.toFixed(2)}</span>
                                </td> */}
                                <td className="px-6 py-4 whitespace-nowrap text-center">
                                  {cartItem.notes ? (
                                    <div className="group relative">
                                      <InformationCircleIcon className="h-5 w-5 text-blue-500 cursor-pointer" />
                                      <div className="absolute z-10 invisible group-hover:visible bg-gray-800 text-white text-xs rounded py-1 px-2 right-0 bottom-full mb-2 w-48">
                                        {cartItem.notes}
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-xs text-gray-400">-</span>
                                  )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button 
                                    onClick={() => onRemoveActiveOrderItem(index)}
                                    className="text-red-600 hover:text-red-800 disabled:opacity-50"
                                    aria-label="Remove item"
                                    disabled={isSubmittingOrderCart || (requestStatus && requestStatus.isSubmitting)}
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                </div>
          </div>
            </div>
                {/* Total and Submission Area */}
                <div className="mt-6 px-4 py-4 sm:px-6 border-t border-gray-200">
                  <div className="flex justify-end items-center mb-4">
                    {/* <span className="text-sm font-medium text-gray-700 mr-2">Subtotal:</span>
                    <span className="text-lg font-semibold text-gray-900">${activeOrderTotal.toFixed(2)}</span> */}
            </div>
                  
                  <div className="flex flex-col sm:flex-row justify-end space-y-3 sm:space-y-0 sm:space-x-3">
                     {/* Share via Microsoft Teams */}
              <button
                      type="button"
                      onClick={() => generateTeamsLink(activeOrderCartItems)}
                      disabled={!hasActiveOrderItems || isSubmittingOrderCart || (requestStatus && requestStatus.isSubmitting)}
                      className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50 transition-colors"
                    >
                      {/* Microsoft Logo */}
                      <svg className="w-5 h-5 mr-2 -ml-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 23 23">
                        <path fill="#f25022" d="M1 1h10v10H1z"/>
                        <path fill="#00a4ef" d="M1 12h10v10H1z"/>
                        <path fill="#7fba00" d="M12 1h10v10H12z"/>
                        <path fill="#ffb900" d="M12 12h10v10H12z"/>
                      </svg>
                      Share via Teams
                    </button>
                    {/* Share via Microsoft Outlook */}
                    <button
                      type="button"
                      onClick={() => generateOutlookLink(activeOrderCartItems)}
                      disabled={!hasActiveOrderItems || isSubmittingOrderCart || (requestStatus && requestStatus.isSubmitting)}
                      className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors"
                    >
                      {/* Microsoft Logo */}
                      <svg className="w-5 h-5 mr-2 -ml-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 23 23">
                        <path fill="#f25022" d="M1 1h10v10H1z"/>
                        <path fill="#00a4ef" d="M1 12h10v10H1z"/>
                        <path fill="#7fba00" d="M12 1h10v10H12z"/>
                        <path fill="#ffb900" d="M12 12h10v10H12z"/>
                      </svg>
                      Share via Outlook
              </button>
            </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderOrdersTable = (orders, isLoading, error, title, showActions = false, orderType = 'pending') => {
    const currentError = 
      activeSection === 'pendingOrders' ? pendingError :
      activeSection === 'completedOrders' ? completedError :
      activeSection === 'cancelledOrders' ? cancelledError : null;

    if (isLoading) return <div className="text-center py-10"><ArrowPathIcon className="h-8 w-8 text-gray-500 animate-spin mx-auto" /> <p className="mt-2">Loading {title.toLowerCase()}...</p></div>;
    if (currentError && !statusUpdateError) return <div className="text-center py-10 text-red-600 bg-red-50 p-4 rounded-md">Error loading {title.toLowerCase()}: {currentError}</div>;
    if (orders.length === 0 && !isLoading) return <div className="text-center py-10 text-gray-500">No {title.toLowerCase()} found.</div>;

    const isPendingTableAndHasUpdateError = activeSection === 'pendingOrders' && statusUpdateError;

    return (
      <section>
        {isPendingTableAndHasUpdateError && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 border border-red-300 rounded-md text-sm">
            {statusUpdateError} 
          </div>
        )}
        {/* Applying simpler styling inspired by inventory page */}
        <div className="overflow-x-auto bg-white rounded-lg shadow ring-1 ring-black ring-opacity-5 mt-2">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {[
                  'Order ID', 'MFG Part #', 'Description', 'Vendor', 
                  'Req. Branch', 'Qty', 'Notes', 
                  /* 'Requested By', */ // Removed
                  /* 'Requested At', */ // Removed
                  'Last Modified', 'Status', 
                  ...(showActions ? ['Actions'] : [])
                ].map(header => (
                  <th 
                    key={header} 
                    scope="col" 
                    className={`px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider ${header === 'Qty' ? 'text-center' : ''}`}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {orders.map(order => (
                <tr key={order.order_request_id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{order.order_request_id}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{order.mfg_part_number}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 max-w-md" title={order.item_description}>{order.item_description || 'N/A'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{order.vendor_name || 'N/A'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{order.requesting_branch}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 text-center">{order.quantity_requested}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 max-w-sm" title={order.notes}>{order.notes || 'N/A'}</td>
                  {/* The following two <td> were for 'Requested By' and 'Requested At' which are now removed from headers */}
                  {/* <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{order.requested_by_user_email || 'N/A'}</td> */}
                  {/* <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{formatDate(order.requested_at_utc)}</td> */}
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{formatDate(order.last_modified_at_utc)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    <span className={`px-2.5 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full 
                      ${order.order_status === 'Pending Send' ? 'bg-yellow-100 text-yellow-800' :
                      order.order_status === 'Completed' ? 'bg-green-100 text-green-800' :
                        order.order_status === 'Cancelled' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                    }`}>
                      {order.order_status}
                    </span>
                  </td>
                  {showActions && (
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-right">
                      <button
                        type="button" // Important for non-submitting buttons
                        onClick={(e) => handleShowUpdateStatusPopup(order.order_request_id, e)}
                        disabled={isUpdatingStatusOrderId === order.order_request_id || !!orderToUpdate}
                        className="text-indigo-600 hover:text-indigo-800 disabled:text-gray-400 disabled:cursor-not-allowed p-1 rounded-md hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-indigo-500 transition-colors"
                        title="Update Status"
                      >
                        {isUpdatingStatusOrderId === order.order_request_id ? 
                          <ArrowPathIcon className="h-5 w-5 animate-spin" /> :
                          <PencilSquareIcon className="h-5 w-5" />
                        }
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  };

  const tabs = [
    { name: 'Order Cart', section: 'orderCart', error: activeCartError, isLoading: isLoadingActiveCart, count: activeOrderItems.length },
    { name: 'Pending Orders', section: 'pendingOrders', error: pendingError, isLoading: isLoadingPending, count: pendingOrders.length },
    { name: 'Completed Orders', section: 'completedOrders', error: completedError, isLoading: isLoadingCompleted, count: completedOrders.length },
    { name: 'Cancelled Orders', section: 'cancelledOrders', error: cancelledError, isLoading: isLoadingCancelled, count: cancelledOrders.length },
  ];

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Custom Confirmation Pop-up */}
      {orderToConfirmClear && confirmPopupPosition.visible && (
        <div 
          style={{ 
            position: 'fixed', 
            top: `${confirmPopupPosition.top}px`, 
            left: `${confirmPopupPosition.left}px`,
            transform: 'translateY(-50%)', 
          }}
          // Adjusted classes for smaller size, white theme, and vertical buttons
          className="z-50 p-3 rounded-md shadow-xl bg-white/80 backdrop-filter backdrop-blur-md border border-gray-200 flex flex-col items-center"
        >
          <p className="text-xs text-gray-700 mb-2 text-center">Clear this request?</p>
          <div className="flex flex-col space-y-2 w-full">
            <button
              onClick={executeConfirmedClear}
              disabled={isClearingOrderId === orderToConfirmClear}
              className="w-full px-3 py-1.5 text-xs font-medium rounded text-white bg-red-500 hover:bg-red-600 disabled:bg-red-300 transition-colors"
              aria-label="Confirm clear action"
            >
              {isClearingOrderId === orderToConfirmClear ? 'Clearing...' : 'Confirm'}
            </button>
            <button
              onClick={cancelClearConfirmation}
              className="w-full px-3 py-1.5 text-xs font-medium rounded text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
              aria-label="Cancel clear action"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Status Update Confirmation Pop-up */}
      {orderToUpdate && statusUpdatePopupPosition.visible && (
        <div 
          style={{ 
            position: 'fixed', 
            top: `${statusUpdatePopupPosition.top}px`, 
            left: `${statusUpdatePopupPosition.left}px`,
            transform: 'translateY(-50%)', 
          }}
          className="status-update-popup z-50 p-4 rounded-lg shadow-xl bg-white/90 backdrop-filter backdrop-blur-lg border border-gray-300 flex flex-col items-center space-y-3 w-56" // Slightly wider
        >
          <p className="text-sm font-medium text-gray-700 text-center">Update status for <br/>Order ID: <span className='font-bold'>{orderToUpdate}</span>?</p>
          <div className="flex flex-col space-y-2 w-full">
            <button
              onClick={() => executeConfirmedStatusUpdate('Completed')}
              disabled={!!isUpdatingStatusOrderId}
              className="w-full px-3 py-2 text-sm font-medium rounded-md text-white bg-green-500 hover:bg-green-600 disabled:bg-green-300 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors flex items-center justify-center space-x-2"
            >
              {isUpdatingStatusOrderId === orderToUpdate ? <ArrowPathIcon className="h-4 w-4 animate-spin"/> : <CheckCircleIcon className="h-5 w-5" />}
              <span>Mark Completed</span>
            </button>
            <button
              onClick={() => executeConfirmedStatusUpdate('Cancelled')}
              disabled={!!isUpdatingStatusOrderId}
              className="w-full px-3 py-2 text-sm font-medium rounded-md text-white bg-red-500 hover:bg-red-600 disabled:bg-red-300 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors flex items-center justify-center space-x-2"
            >
              {isUpdatingStatusOrderId === orderToUpdate ? <ArrowPathIcon className="h-4 w-4 animate-spin"/> : <XCircleIcon className="h-5 w-5" />}
              <span>Mark Cancelled</span>
            </button>
            <button
              onClick={() => {
                setStatusUpdatePopupPosition({ ...statusUpdatePopupPosition, visible: false });
                setOrderToUpdate(null);
                setStatusUpdateError(null); // Clear error when manually closing
              }}
              className="w-full mt-1 px-3 py-1.5 text-xs font-medium rounded-md text-gray-700 bg-gray-100 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1 transition-colors"
            >
              Close
            </button>
          </div>
          {statusUpdateError && (
             <p className="text-xs text-red-500 mt-2 text-center">{statusUpdateError}</p>
          )}
        </div>
      )}

      {/* Replace any status-update-error with a native alert */}
      {statusUpdateError && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 border border-red-300 rounded-md text-sm">
          {statusUpdateError}
        </div>
      )}

      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex space-x-1 sm:space-x-4 overflow-x-auto pb-px" aria-label="Tabs">
          {tabs.map((tab) => (
            <div key={tab.name} className={`group whitespace-nowrap flex items-center py-3 px-2 sm:px-3 border-b-2 font-medium text-sm transition-colors cursor-pointer
                ${ activeSection === tab.section
                    ? 'border-sky-500 text-sky-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
              onClick={() => setActiveSection(tab.section)} // Make the div clickable for tab activation
            >
              <span>{tab.name}</span> {/* Tab name */} 
              {(tab.section === 'pendingOrders' || tab.section === 'completedOrders' || tab.section === 'cancelledOrders') && (
                 <div className="relative ml-1.5 sm:ml-2"> {/* Wrapper for refresh button and its tooltip */} 
                    <button
                      onClick={(e) => { 
                        e.stopPropagation(); // Prevent tab change if clicking refresh inside tab button area
                        handleRefresh(); 
                      }}
                      disabled={tab.isLoading}
                      onMouseEnter={() => { setIsRefreshTooltipVisible(true); currentActiveRefreshTooltip.current = tab.section; }}
                      onMouseLeave={() => { setIsRefreshTooltipVisible(false); currentActiveRefreshTooltip.current = null; }}
                      className={`p-1 rounded-full transition-colors focus:outline-none focus:ring-1 focus:ring-offset-1
                        ${ activeSection === tab.section 
                            ? 'text-sky-500 hover:bg-sky-100 focus:ring-sky-400' 
                            : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100 focus:ring-gray-400'
                        } 
                        disabled:opacity-50 disabled:cursor-not-allowed
                      `}
                      aria-label={`Refresh ${tab.name}`} // Add aria-label for accessibility
                    >
                      {tab.isLoading ? (
                        <ArrowPathIcon className="h-4 w-4 animate-spin" />
                      ) : (
                        <ArrowPathIcon className="h-4 w-4" />
                      )}
                    </button>
                    {isRefreshTooltipVisible && currentActiveRefreshTooltip.current === tab.section && (
                      <span 
                        className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs text-white bg-gray-700 rounded-md shadow-sm z-20 whitespace-nowrap"
                        style={{pointerEvents: 'none'}} // Prevent tooltip from capturing mouse events
                      >
                        Refresh {tab.name}
                      </span>
                    )}
                  </div>
              )}
            </div>
          ))}
        </nav>
      </div>
      
      {/* General error display area - now handled within renderOrdersTable for specific lists */}
      {/* If needed, a page-level error for non-table issues can be added here */}

      {activeSection === 'orderCart' && renderOrderCart()}
      {activeSection === 'pendingOrders' && renderOrdersTable(pendingOrders, isLoadingPending, pendingError, "Pending Orders", true, 'pending')}
      {activeSection === 'completedOrders' && renderOrdersTable(completedOrders, isLoadingCompleted, completedError, "Completed Orders", false, 'completed')}
      {activeSection === 'cancelledOrders' && renderOrdersTable(cancelledOrders, isLoadingCancelled, cancelledError, "Cancelled Orders", false, 'cancelled')}

    </div>
  );
};

export default OrderRequestsPage; 