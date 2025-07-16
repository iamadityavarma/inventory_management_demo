import React, { useState, useEffect, useCallback } from 'react';
import { 
  ArrowPathIcon, 
  CheckCircleIcon,
  XCircleIcon,
  PencilSquareIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline'; 
import { TrashIcon, ArrowRightIcon, ExclamationTriangleIcon } from '@heroicons/react/24/solid';

const TransferRequestsPage = ({
  activeUserEmail,
  activeTransferCartItems,
  onRemoveActiveTransferItem,
  onClearActiveTransferCart,
  onSubmitTransferRequest,
  isSubmittingTransferCart,
  
  requestStatus,
  initialSection = 'activeCart',
  apiBaseUrl
}) => {
  console.log('[TransferRequestsPage] onSubmitTransferRequest prop on render:', onSubmitTransferRequest);

  const [activeSection, setActiveSection] = useState(initialSection);

  const [activeTransferItems, setActiveTransferItems] = useState([]);
  const [isLoadingActiveCart, setIsLoadingActiveCart] = useState(false);
  const [activeCartError, setActiveCartError] = useState(null);

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  const [pendingTransfers, setPendingTransfers] = useState([]);
  const [isLoadingPending, setIsLoadingPending] = useState(false);
  const [pendingError, setPendingError] = useState(null);
  const [isClearingTransferId, setIsClearingTransferId] = useState(null);
  const [clearTransferError, setClearTransferError] = useState(null);
  const [transferToConfirmClear, setTransferToConfirmClear] = useState(null);
  const [confirmPopupPosition, setConfirmPopupPosition] = useState({ top: 0, left: 0, visible: false });
  const [isRefreshTooltipVisible, setIsRefreshTooltipVisible] = useState(false);
  const currentActiveRefreshTooltip = React.useRef(null);

  const [completedTransfers, setCompletedTransfers] = useState([]);
  const [isLoadingCompleted, setIsLoadingCompleted] = useState(false);
  const [completedError, setCompletedError] = useState(null);

  const [cancelledTransfers, setCancelledTransfers] = useState([]);
  const [isLoadingCancelled, setIsLoadingCancelled] = useState(false);
  const [cancelledError, setCancelledError] = useState(null);
  
  const [transferToUpdate, setTransferToUpdate] = useState(null);
  const [statusUpdatePopupPosition, setStatusUpdatePopupPosition] = useState({ top: 0, left: 0, visible: false });
  const [isUpdatingStatusTransferId, setIsUpdatingStatusTransferId] = useState(null);
  const [statusUpdateError, setStatusUpdateError] = useState(null);

  const [pageRequestStatus, setPageRequestStatus] = useState({ type: '', message: '' });

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
        hour12: true,
      });
    } catch (error) {
      console.error("Error formatting date:", dateString, error);
      return dateString;
    }
  };

  const fetchActiveTransferItems = useCallback(async () => {
    if (!apiBaseUrl || !activeUserEmail) {
      setActiveCartError('API URL or User Email not configured for active transfer cart.');
      console.warn('fetchActiveTransferItems skipped: API URL or User Email not configured.');
      return;
    }
    setIsLoadingActiveCart(true);
    setActiveCartError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/active-transfers?user_email=${encodeURIComponent(activeUserEmail)}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: `HTTP error ${response.status}` }));
        throw new Error(errorData.detail || `Failed to fetch active transfer items: ${response.statusText}`);
      }
      const data = await response.json();
      setActiveTransferItems(data || []);
    } catch (error) {
      console.error("Error fetching active transfer items:", error);
      setActiveCartError(error.message);
      setActiveTransferItems([]);
    } finally {
      setIsLoadingActiveCart(false);
    }
  }, [apiBaseUrl, activeUserEmail]);

  const fetchPendingTransfers = useCallback(async () => {
    if (!apiBaseUrl) {
      setPendingError('API URL not configured');
      return;
    }
    setIsLoadingPending(true);
    setPendingError(null);
    setStatusUpdateError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/pending-transfers`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: `HTTP error ${response.status}` }));
        throw new Error(errorData.detail || `Failed to fetch pending transfers: ${response.statusText}`);
      }
      const data = await response.json();
      setPendingTransfers(data || []);
    } catch (error) {
      console.error("Error fetching pending transfers:", error);
      setPendingError(error.message);
      setPendingTransfers([]);
    } finally {
      setIsLoadingPending(false);
    }
  }, [apiBaseUrl]);

  const fetchCompletedTransfers = useCallback(async () => {
    setIsLoadingCompleted(true);
    setCompletedError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/completed-transfers`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: `HTTP error ${response.status}` }));
        throw new Error(errorData.detail || `Failed to fetch completed transfers: ${response.statusText}`);
      }
      const data = await response.json();
      setCompletedTransfers(data || []);
    } catch (error) {
      console.error("Error fetching completed transfers:", error);
      setCompletedError(error.message);
    } finally {
      setIsLoadingCompleted(false);
    }
  }, [apiBaseUrl]);

  const fetchCancelledTransfers = useCallback(async () => {
    setIsLoadingCancelled(true);
    setCancelledError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/cancelled-transfers`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: `HTTP error ${response.status}` }));
        throw new Error(errorData.detail || `Failed to fetch cancelled transfers: ${response.statusText}`);
      }
      const data = await response.json();
      setCancelledTransfers(data || []);
    } catch (error) {
      console.error("Error fetching cancelled transfers:", error);
      setCancelledError(error.message);
    } finally {
      setIsLoadingCancelled(false);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    if (activeSection === 'pendingTransfers' && apiBaseUrl) {
      fetchPendingTransfers();
    } else if (activeSection === 'completedTransfers' && apiBaseUrl) {
      fetchCompletedTransfers();
    } else if (activeSection === 'cancelledTransfers' && apiBaseUrl) {
      fetchCancelledTransfers();
    } else if (activeSection === 'activeCart' && apiBaseUrl && activeUserEmail) {
      fetchActiveTransferItems();
    } else if (activeSection === 'activeCart') {
      console.warn('TransferRequestsPage: activeCart section is active, but apiBaseUrl or activeUserEmail is not yet available. Fetch will be skipped by fetchActiveTransferItems.');
    }

    setConfirmPopupPosition({ top: 0, left: 0, visible: false });
    setTransferToConfirmClear(null);
    setStatusUpdatePopupPosition({ top: 0, left: 0, visible: false });
    setTransferToUpdate(null);
    setStatusUpdateError(null);
  }, [activeSection, fetchPendingTransfers, fetchCompletedTransfers, fetchCancelledTransfers, fetchActiveTransferItems]);

  useEffect(() => {
    if (requestStatus && requestStatus.type === 'success' && 
        (requestStatus.message.includes('added to active transfer') || 
         requestStatus.message.includes('Item removed from active transfer') ||
         requestStatus.message.includes('Item quantity updated in active transfer') ||
         requestStatus.message.includes('Active transfer cleared'))
       ) {
      if (activeSection === 'activeCart') {
        fetchActiveTransferItems();
      }
    }
  }, [requestStatus, fetchActiveTransferItems, activeSection]);


  const executeConfirmedClear = async () => {
    if (!transferToConfirmClear) return;

    const transferId = transferToConfirmClear;
    setIsClearingTransferId(transferId);
    setClearTransferError(null);
    setPendingError(null);
    
    try {
      const response = await fetch(`${apiBaseUrl}/transfer-request/${transferId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: `HTTP error ${response.status}` }));
        throw new Error(errorData.detail || `Failed to clear transfer request: ${response.statusText}`);
      }
      fetchPendingTransfers();
    } catch (error) {
      console.error(`Error clearing transfer request ${transferId}:`, error);
      setClearTransferError(error.message);
    } finally {
      setIsClearingTransferId(null);
      setTransferToConfirmClear(null);
      setConfirmPopupPosition({ ...confirmPopupPosition, visible: false });
    }
  };

  const cancelClearConfirmation = () => {
    setTransferToConfirmClear(null);
    setConfirmPopupPosition({ ...confirmPopupPosition, visible: false });
  };

  const handleShowUpdateStatusPopup = (transferId, event) => {
    setStatusUpdateError(null);
    setPendingError(null);

    const rect = event.currentTarget.getBoundingClientRect();
    setStatusUpdatePopupPosition({
      top: rect.top + window.scrollY + rect.height / 2,
      left: rect.right + window.scrollX + 10,
      visible: true,
    });
    setTransferToUpdate(transferId);
  };

  const executeConfirmedStatusUpdate = async (newStatus) => {
    if (!transferToUpdate) return;

    setIsUpdatingStatusTransferId(transferToUpdate);
    setStatusUpdateError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/transfer-request/${transferToUpdate}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ new_status: newStatus }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: `HTTP error ${response.status}` }));
        throw new Error(errorData.detail || `Failed to update transfer status: ${response.statusText}`);
      }
      
      setStatusUpdatePopupPosition({ ...statusUpdatePopupPosition, visible: false });
      setTransferToUpdate(null);
      
      fetchPendingTransfers();
      if (newStatus === 'Completed') {
        fetchCompletedTransfers();
      } else if (newStatus === 'Cancelled') {
        fetchCancelledTransfers();
      }

    } catch (error) {
      console.error(`Error updating transfer status to ${newStatus}:`, error);
      setStatusUpdateError(`Failed to update transfer ID ${transferToUpdate} to ${newStatus}: ${error.message}`);
    } finally {
      setIsUpdatingStatusTransferId(null);
    }
  };

  const handleRefresh = () => {
    if (activeSection === 'pendingTransfers') fetchPendingTransfers();
    else if (activeSection === 'completedTransfers' && apiBaseUrl) fetchCompletedTransfers();
    else if (activeSection === 'cancelledTransfers' && apiBaseUrl) fetchCancelledTransfers();
    else if (activeSection === 'activeCart' && apiBaseUrl && activeUserEmail) fetchActiveTransferItems();
  };

  const submitTransfersToDatabase = async (items) => {
    if (!apiBaseUrl) {
      console.error("submitTransfersToDatabase: API Base URL is not configured.");
      // Consider setting a user-facing error state here
      return { success: false, error: "API endpoint not configured." };
    }
    
    // Use the actual logged-in user's email
    const userEmail = activeUserEmail;
    console.log("submitTransfersToDatabase: Using email:", userEmail);
    
    if (!items || items.length === 0) {
      console.log("submitTransfersToDatabase: No items to submit.");
      return { success: false, error: "Transfer cart is empty." };
    }

    const payload = {
      transfers: items.map(cartItem => ({
        mfg_part_number: cartItem.item?.mfgPartNumber || cartItem.item?.mfg_part_number || '', // Ensure fallback
        internal_part_number: cartItem.item?.partNumber || cartItem.item?.internal_part_number,
        item_description: cartItem.item?.description || cartItem.item?.item_description,
        quantity_requested: parseInt(cartItem.quantity, 10) || 0,
        source_branch: cartItem.sourceBranch || '', // Ensure this is correctly populated when adding to cart
        destination_branch: cartItem.destinationBranch || '', // Ensure this is correctly populated
        notes: cartItem.notes || null, // Include notes from cart item
        requested_by_user_email: userEmail 
      }))
    };

    // Validate payload items
    for (const transfer of payload.transfers) {
      if (!transfer.mfg_part_number || !transfer.quantity_requested || !transfer.source_branch || !transfer.destination_branch || !transfer.requested_by_user_email) {
        console.error("submitTransfersToDatabase: Invalid transfer item in payload:", transfer);
        return { success: false, error: "One or more transfer items have missing required fields (MFG Part #, Qty, Source, Destination, User Email)." };
      }
    }

    console.log("Submitting transfers to database with payload:", JSON.stringify(payload, null, 2));

    try {
      const response = await fetch(`${apiBaseUrl}/submit-transfer-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: `HTTP error ${response.status}. Failed to submit transfers.` }));
        console.error("Error submitting transfers to database:", errorData.detail);
        return { success: false, error: errorData.detail || `Failed to submit transfers. Status: ${response.status}` };
      }

      const result = await response.json();
      console.log('Transfers submitted successfully to database:', result);
      return { success: true, message: result.message, transfer_request_ids: result.transfer_request_ids };

    } catch (error) {
      console.error('Network or other error submitting transfers:', error);
      return { success: false, error: error.message || 'An unexpected error occurred while submitting transfers.' };
    }
  };

  const handleShareToTeams = async () => {
    if (!activeTransferCartItems || activeTransferCartItems.length === 0) {
      setPageRequestStatus({ type: 'info', message: 'Transfer cart is empty.' });
      return;
    }
    setPageRequestStatus({ type: 'info', message: 'Submitting transfer to database...' });
    const submissionResult = await submitTransfersToDatabase(activeTransferCartItems);

    if (submissionResult.success) {
      setPageRequestStatus({ type: 'info', message: 'Transfer saved. Preparing Teams message...' });

      const userEmail = activeUserEmail;
      const today = new Date().toISOString().split('T')[0];
      const firstSourceBranch = activeTransferCartItems.length > 0 ? activeTransferCartItems[0].sourceBranch : 'Multiple Sources';
      const firstDestBranch = activeTransferCartItems.length > 0 ? activeTransferCartItems[0].destinationBranch : 'Multiple Destinations';
      const subject = `TRANSFER REQUEST - ${today} - From: ${firstSourceBranch} To: ${firstDestBranch}`;

      let messageBody = `Please process the following internal transfer request:\n\n`;
      messageBody += activeTransferCartItems.map((transfer, index) => {
        const item = transfer.item || {};
        return `-----------------------------------\n` +
               `Item ${index + 1}:\n` +
               `  MFG Part #: ${item.mfgPartNumber || item.mfg_part_number || 'N/A'}\n` +
               (item.partNumber || item.internal_part_number ? `  Internal Part #: ${item.partNumber || item.internal_part_number}\n` : '') +
               `  Description: ${item.description || item.item_description || 'N/A'}\n` +
               `  Quantity: ${transfer.quantity}\n` +
               `  From Branch: ${transfer.sourceBranch || 'N/A'}\n` +
               `  To Branch: ${transfer.destinationBranch || 'N/A'}\n` +
               (transfer.notes ? `  Notes: ${transfer.notes}\n` : '');
      }).join('\n');
      messageBody += `-----------------------------------\nTotal Items: ${activeTransferCartItems.length}\n`;
      messageBody += `Requested by: ${userEmail}\n`;
      messageBody += `\nThank you.`;

      const teamsLink = `https://teams.microsoft.com/l/chat/0/0?users=&topicName=${encodeURIComponent(subject)}&message=${encodeURIComponent(messageBody)}`;
      window.open(teamsLink, '_blank');

      if (onClearActiveTransferCart) {
          onClearActiveTransferCart();
      } else {
          setActiveTransferItems([]);
      }
      setPageRequestStatus({ type: 'success', message: 'Transfer request saved and Teams chat opened!' });
      
      if (activeSection === 'pendingTransfers') {
          fetchPendingTransfers();
      }
    } else {
      setPageRequestStatus({ type: 'error', message: submissionResult.error || 'Failed to save transfer request.' });
    }
  };

  const handleShareToOutlook = async () => {
    if (!activeTransferCartItems || activeTransferCartItems.length === 0) {
      setPageRequestStatus({ type: 'info', message: 'Transfer cart is empty.' });
      return;
    }
    setPageRequestStatus({ type: 'info', message: 'Submitting transfer to database...' });
    const submissionResult = await submitTransfersToDatabase(activeTransferCartItems);

    if (submissionResult.success) {
      setPageRequestStatus({ type: 'info', message: 'Transfer saved. Preparing Outlook message...' });

      const userEmail = activeUserEmail;
      const today = new Date().toISOString().split('T')[0];
      const firstSourceBranch = activeTransferCartItems.length > 0 ? activeTransferCartItems[0].sourceBranch : 'Multiple Sources';
      const firstDestBranch = activeTransferCartItems.length > 0 ? activeTransferCartItems[0].destinationBranch : 'Multiple Destinations';
      const subject = `TRANSFER REQUEST - ${today} - From: ${firstSourceBranch} To: ${firstDestBranch}`;

      let emailBody = `Please process the following internal transfer request:\n\n`;
      emailBody += activeTransferCartItems.map((transfer, index) => {
        const item = transfer.item || {};
        return `-----------------------------------\n` +
               `Item ${index + 1}:\n` +
               `  MFG Part #: ${item.mfgPartNumber || item.mfg_part_number || 'N/A'}\n` +
               (item.partNumber || item.internal_part_number ? `  Internal Part #: ${item.partNumber || item.internal_part_number}\n` : '') +
               `  Description: ${item.description || item.item_description || 'N/A'}\n` +
               `  Quantity: ${transfer.quantity}\n` +
               `  From Branch: ${transfer.sourceBranch || 'N/A'}\n` +
               `  To Branch: ${transfer.destinationBranch || 'N/A'}\n` +
               (transfer.notes ? `  Notes: ${transfer.notes}\n` : '');
      }).join('\n');
      emailBody += `-----------------------------------\nTotal Items: ${activeTransferCartItems.length}\n`;
      emailBody += `Requested by: ${userEmail}\n`;
      emailBody += `\nThank you.`;

      const outlookLink = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`;
      window.open(outlookLink);

      if (onClearActiveTransferCart) {
          onClearActiveTransferCart();
      } else {
          setActiveTransferItems([]);
      }
      setPageRequestStatus({ type: 'success', message: 'Transfer request saved and Outlook message opened!' });

      if (activeSection === 'pendingTransfers') {
          fetchPendingTransfers();
      }
    } else {
      setPageRequestStatus({ type: 'error', message: submissionResult.error || 'Failed to save transfer request.' });
    }
  };

  const generateTeamsLink = async (items) => {
    if (!items || items.length === 0) return;
    
    const submitted = await submitTransfersToDatabase(items);
    if (!submitted) {
      alert('Failed to submit transfers to the database. The message will still be created, but transfers may not be saved.');
    }
    
    let message = `Inventory Transfer Request - ${new Date().toLocaleDateString()}\n\n`;
    message += `Please review the following transfer request:\n\n`;
    
    items.forEach((item, index) => {
      const partNumber = item.internal_part_number || 
                         item.mfg_part_number || 
                         (item.item && item.item.partNumber) || 
                         (item.item && item.item.mfgPartNumber) || 
                         'N/A';
      
      const description = item.item_description || 
                          (item.item && item.item.description) || 
                          'N/A';
      
      const quantity = item.quantity_requested || item.quantity || 0;
      
      const fromBranch = item.sourceBranch || 'N/A';
      const toBranch = item.destinationBranch || 'N/A';
      
      message += `------ ITEM ${index + 1} ------\n`;
      message += `Part Number: ${partNumber}\n`;
      message += `Description: ${description}\n`;
      message += `Quantity: ${quantity}\n`;
      message += `From Branch: ${fromBranch}\n`;
      message += `To Branch: ${toBranch}\n`;
      
      if (item.notes) {
        message += `Notes: ${item.notes}\n`;
      }
      
      message += '\n';
    });
    
    message += `Thank you for processing this transfer request.\n`;
    message += `This request was generated from the ZentroQ Inventory Management System.`;
    
    const encodedMessage = encodeURIComponent(message);
    const teamsUrl = `https://teams.microsoft.com/l/chat/0/0?users=&message=${encodedMessage}`;
    
    window.open(teamsUrl, '_blank');
    
    if (submitted && onClearActiveTransferCart) {
      setTimeout(() => {
        onClearActiveTransferCart();
      }, 500);
    }
  };
  
  const generateOutlookLink = async (items) => {
    if (!items || items.length === 0) return;
    
    const submitted = await submitTransfersToDatabase(items);
    if (!submitted) {
      alert('Failed to submit transfers to the database. The email will still be created, but transfers may not be saved.');
    }
    
    const subject = encodeURIComponent(`Inventory Transfer Request - ${new Date().toLocaleDateString()}`);
    
    let body = `Inventory Transfer Request - ${new Date().toLocaleDateString()}\n\n`;
    body += `Please review the following transfer request:\n\n`;
    
    items.forEach((item, index) => {
      const partNumber = item.internal_part_number || 
                         item.mfg_part_number || 
                         (item.item && item.item.partNumber) || 
                         (item.item && item.item.mfgPartNumber) || 
                         'N/A';
      
      const description = item.item_description || 
                          (item.item && item.item.description) || 
                          'N/A';
      
      const quantity = item.quantity_requested || item.quantity || 0;
      
      const fromBranch = item.sourceBranch || 'N/A';
      const toBranch = item.destinationBranch || 'N/A';
      
      body += `------ ITEM ${index + 1} ------\n`;
      body += `Part Number: ${partNumber}\n`;
      body += `Description: ${description}\n`;
      body += `Quantity: ${quantity}\n`;
      body += `From Branch: ${fromBranch}\n`;
      body += `To Branch: ${toBranch}\n`;
      
      if (item.notes) {
        body += `Notes: ${item.notes}\n`;
      }
      
      body += '\n';
    });
    
    body += `Thank you for processing this transfer request.\n`;
    body += `This request was generated from the ZentroQ Inventory Management System.`;
    
    const outlookUrl = `https://outlook.office.com/owa/?path=/mail/action/compose&subject=${subject}&body=${encodeURIComponent(body)}`;
    
    window.open(outlookUrl, '_blank');
    
    if (submitted && onClearActiveTransferCart) {
      setTimeout(() => {
        onClearActiveTransferCart();
      }, 500);
    }
  };

  const renderTransferCart = () => {
    if (!apiBaseUrl && !activeUserEmail && !onSubmitTransferRequest) {
      return (
        <div className="text-center py-10">
          <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">Transfer Cart Unavailable</h3>
          <p className="mt-1 text-sm text-gray-500">Required information is missing to display the transfer cart.</p>
        </div>
      );
    }

    const hasActiveTransferItems = activeTransferCartItems && activeTransferCartItems.length > 0;

    return (
      <div className="space-y-6">
        <div className="bg-white shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                Active Transfer Cart
              </h3>
              {hasActiveTransferItems && (
                <button
                  onClick={onClearActiveTransferCart}
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-500 disabled:opacity-50"
                  disabled={isSubmittingTransferCart || (requestStatus && requestStatus.isSubmitting)}
                >
                  Clear Cart
                </button>
              )}
            </div>

            {!hasActiveTransferItems ? (
              <div className="text-center py-10 border-2 border-dashed border-gray-300 rounded-lg">
                <ArrowRightIcon className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">Your transfer cart is empty</h3>
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
                              From / To Branch
                            </th>
                            <th scope="col" className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Qty
                            </th>
                            <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Notes
                            </th>
                            <th scope="col" className="relative px-6 py-3">
                              <span className="sr-only">Remove</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {activeTransferCartItems.map((cartItem, index) => {
                            const item = cartItem.item || {};
                            return (
                              <tr key={cartItem.id || item.mfgPartNumber}>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="text-sm font-medium text-gray-900">{item.description || 'N/A'}</div>
                                  <div className="text-xs text-gray-500">MFG P/N: {item.mfgPartNumber || 'N/A'}</div>
                                  <div className="text-xs text-gray-500">Internal P/N: {item.partNumber || 'N/A'}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="text-sm text-gray-900">From: {cartItem.sourceBranch || 'N/A'}</div>
                                  <div className="text-sm text-gray-500">To: {cartItem.destinationBranch || 'N/A'}</div>
                                </td>
                                <td className="px-3 py-4 whitespace-nowrap text-center">
                                  <span className="text-sm text-gray-700">{cartItem.quantity}</span>
                                </td>
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
                                    onClick={() => onRemoveActiveTransferItem(index)}
                                    className="text-red-600 hover:text-red-800 disabled:opacity-50"
                                    aria-label="Remove item"
                                    disabled={isSubmittingTransferCart || (requestStatus && requestStatus.isSubmitting)}
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
                <div className="mt-6 px-4 py-4 sm:px-6 border-t border-gray-200">
                  <div className="flex flex-col sm:flex-row justify-end space-y-3 sm:space-y-0 sm:space-x-3">
                    <button
                      type="button"
                      onClick={() => generateTeamsLink(activeTransferCartItems)}
                      disabled={!hasActiveTransferItems || isSubmittingTransferCart || (requestStatus && requestStatus.isSubmitting)}
                      className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50 transition-colors"
                    >
                      <svg className="w-5 h-5 mr-2 -ml-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 23 23">
                        <path fill="#f25022" d="M1 1h10v10H1z"/>
                        <path fill="#00a4ef" d="M1 12h10v10H1z"/>
                        <path fill="#7fba00" d="M12 1h10v10H12z"/>
                        <path fill="#ffb900" d="M12 12h10v10H12z"/>
                      </svg>
                      Share via Teams
                    </button>
                    <button
                      type="button"
                      onClick={() => generateOutlookLink(activeTransferCartItems)}
                      disabled={!hasActiveTransferItems || isSubmittingTransferCart || (requestStatus && requestStatus.isSubmitting)}
                      className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors"
                    >
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

  const renderTransfersTable = (transfers, isLoading, title, showActions = false) => {
    const currentError = 
      activeSection === 'pendingTransfers' ? pendingError :
      activeSection === 'completedTransfers' ? completedError :
      activeSection === 'cancelledTransfers' ? cancelledError : null;

    if (isLoading) return <div className="text-center py-10"><ArrowPathIcon className="h-8 w-8 text-gray-500 animate-spin mx-auto" /> <p className="mt-2">Loading {title.toLowerCase()}...</p></div>;
    if (currentError && !statusUpdateError) return <div className="text-center py-10 text-red-600 bg-red-50 p-4 rounded-md">Error loading {title.toLowerCase()}: {currentError}</div>;
    if (transfers.length === 0 && !isLoading) return <div className="text-center py-10 text-gray-500">No {title.toLowerCase()} found.</div>;

    const isPendingTableAndHasUpdateError = activeSection === 'pendingTransfers' && statusUpdateError;

    return (
      <section>
        {isPendingTableAndHasUpdateError && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 border border-red-300 rounded-md text-sm">
            {statusUpdateError} 
          </div>
        )}
        <div className="overflow-x-auto bg-white rounded-lg shadow ring-1 ring-black ring-opacity-5 mt-2">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {[
                  'Transfer ID', 'MFG Part #', 'Description', 'From Branch', 
                  'To Branch', 'Qty', 'Notes', 
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
              {transfers.map(transfer => (
                <tr key={transfer.transfer_request_id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{transfer.transfer_request_id}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{transfer.mfg_part_number}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 max-w-md" title={transfer.item_description}>{transfer.item_description || 'N/A'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{transfer.source_branch}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{transfer.destination_branch}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 text-center">{transfer.quantity_requested}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 max-w-sm" title={transfer.notes}>{transfer.notes || 'N/A'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{formatDate(transfer.last_modified_at)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    <span className={`px-2.5 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full
                      ${transfer.status === 'Pending Send' ? 'bg-yellow-100 text-yellow-800' :
                        transfer.status === 'Completed' ? 'bg-green-100 text-green-800' :
                        transfer.status === 'Cancelled' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                      {transfer.status}
                    </span>
                  </td>
                  {showActions && (
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-right">
                      <button
                        type="button"
                        onClick={(e) => handleShowUpdateStatusPopup(transfer.transfer_request_id, e)}
                        disabled={isUpdatingStatusTransferId === transfer.transfer_request_id || !!transferToUpdate}
                        className="text-indigo-600 hover:text-indigo-800 disabled:text-gray-400 disabled:cursor-not-allowed p-1 rounded-md hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-indigo-500 transition-colors"
                        title="Update Status"
                      >
                        {isUpdatingStatusTransferId === transfer.transfer_request_id ? 
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
    { name: 'Transfer Cart', section: 'transferCart', error: activeCartError, isLoading: isLoadingActiveCart, count: activeTransferItems.length },
    { name: 'Pending Transfers', section: 'pendingTransfers', error: pendingError, isLoading: isLoadingPending, count: pendingTransfers.length },
    { name: 'Completed Transfers', section: 'completedTransfers', error: completedError, isLoading: isLoadingCompleted, count: completedTransfers.length },
    { name: 'Cancelled Transfers', section: 'cancelledTransfers', error: cancelledError, isLoading: isLoadingCancelled, count: cancelledTransfers.length },
  ];

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {transferToConfirmClear && confirmPopupPosition.visible && (
        <div 
          style={{ 
            position: 'fixed', 
            top: `${confirmPopupPosition.top}px`, 
            left: `${confirmPopupPosition.left}px`,
            transform: 'translateY(-50%)', 
          }}
          className="z-50 p-3 rounded-md shadow-xl bg-white/80 backdrop-filter backdrop-blur-md border border-gray-200 flex flex-col items-center"
        >
          <p className="text-xs text-gray-700 mb-2 text-center">Clear this transfer request?</p>
          <div className="flex flex-col space-y-2 w-full">
            <button
              onClick={executeConfirmedClear}
              disabled={isClearingTransferId === transferToConfirmClear}
              className="w-full px-3 py-1.5 text-xs font-medium rounded text-white bg-red-500 hover:bg-red-600 disabled:bg-red-300 transition-colors"
              aria-label="Confirm clear action"
            >
              {isClearingTransferId === transferToConfirmClear ? 'Clearing...' : 'Confirm'}
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

      {transferToUpdate && statusUpdatePopupPosition.visible && (
        <div 
          style={{ 
            position: 'fixed', 
            top: `${statusUpdatePopupPosition.top}px`, 
            left: `${statusUpdatePopupPosition.left}px`,
            transform: 'translateY(-50%)', 
          }}
          className="status-update-popup z-50 p-4 rounded-lg shadow-xl bg-white/90 backdrop-filter backdrop-blur-lg border border-gray-300 flex flex-col items-center space-y-3 w-56"
        >
          <p className="text-sm font-medium text-gray-700 text-center">Update status for <br/>Transfer ID: <span className='font-bold'>{transferToUpdate}</span>?</p>
          <div className="flex flex-col space-y-2 w-full">
            <button
              onClick={() => executeConfirmedStatusUpdate('Completed')}
              disabled={!!isUpdatingStatusTransferId}
              className="w-full px-3 py-2 text-sm font-medium rounded-md text-white bg-green-500 hover:bg-green-600 disabled:bg-green-300 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors flex items-center justify-center space-x-2"
            >
              {isUpdatingStatusTransferId === transferToUpdate ? <ArrowPathIcon className="h-4 w-4 animate-spin"/> : <CheckCircleIcon className="h-5 w-5" />}
              <span>Mark Completed</span>
            </button>
            <button
              onClick={() => executeConfirmedStatusUpdate('Cancelled')}
              disabled={!!isUpdatingStatusTransferId}
              className="w-full px-3 py-2 text-sm font-medium rounded-md text-white bg-red-500 hover:bg-red-600 disabled:bg-red-300 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors flex items-center justify-center space-x-2"
            >
              {isUpdatingStatusTransferId === transferToUpdate ? <ArrowPathIcon className="h-4 w-4 animate-spin"/> : <XCircleIcon className="h-5 w-5" />}
              <span>Mark Cancelled</span>
            </button>
            <button
              onClick={() => {
                setStatusUpdatePopupPosition({ ...statusUpdatePopupPosition, visible: false });
                setTransferToUpdate(null);
                setStatusUpdateError(null);
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
              onClick={() => setActiveSection(tab.section)}
            >
              <span>{tab.name}</span>
              {(tab.section === 'pendingTransfers' || tab.section === 'completedTransfers' || tab.section === 'cancelledTransfers') && (
                 <div className="relative ml-1.5 sm:ml-2">
                    <button
                      onClick={(e) => { 
                        e.stopPropagation();
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
                      aria-label={`Refresh ${tab.name}`}
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
                        style={{pointerEvents: 'none'}}
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

      {activeSection === 'transferCart' && renderTransferCart()}
      {activeSection === 'pendingTransfers' && renderTransfersTable(pendingTransfers, isLoadingPending, "Pending Transfers", true)}
      {activeSection === 'completedTransfers' && renderTransfersTable(completedTransfers, isLoadingCompleted, "Completed Transfers", false)}
      {activeSection === 'cancelledTransfers' && renderTransfersTable(cancelledTransfers, isLoadingCancelled, "Cancelled Transfers", false)}

    </div>
  );
};

export default TransferRequestsPage; 