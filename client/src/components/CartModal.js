import React from 'react';
import { formatCurrency } from '../utils/inventoryHelpers';

const CartModal = ({ 
  isOpen, 
  onClose, 
  cartItems, 
  cartType, 
  onSubmitRequest, 
  requestStatus,
  onRemoveItem 
}) => {
  // Add/remove modal-open class to body when modal opens/closes
  React.useEffect(() => {
    if (isOpen) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
    
    // Cleanup function to ensure we always remove the class
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [isOpen]);
  
  if (!isOpen) return null;

  const isOrder = cartType === 'order';
  const title = isOrder ? 'Order Cart' : 'Transfer Cart';
  const submitText = isOrder ? 'Submit Order for Approval' : 'Submit Transfer Requests';
  const successMessage = isOrder ? 'Orders submitted for manager approval' : 'Transfer requests sent to branch managers';
  const emptyMessage = isOrder 
    ? 'Your order cart is empty. Browse inventory and add items to order from vendors.' 
    : 'Your transfer cart is empty. Browse inventory and add items to transfer from other branches.';
  
  const headerColor = isOrder ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200';
  const headerTextColor = isOrder ? 'text-green-800' : 'text-amber-800';
  const buttonColor = isOrder 
    ? 'bg-green-600 hover:bg-green-700 focus:ring-green-500' 
    : 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500';
  
  const handleSubmit = () => {
    onSubmitRequest(isOrder ? 'orders' : 'transfers');
  };
  
  const handleRemove = (itemId) => {
    onRemoveItem(itemId, cartType);
  };
  
  // Function to handle clearing the cart (with confirmation)
  const handleClearCart = () => {
    // Show confirmation dialog
    if (window.confirm(`Are you sure you want to clear all items from your ${isOrder ? 'order' : 'transfer'} cart?`)) {
      // Clear the specific cart type
      onSubmitRequest(isOrder ? 'orders' : 'transfers');
    }
  };

  // Function to generate a Teams message/chat
  const generateTeamsLink = (cartItems, cartType) => {
    if (cartItems.length === 0) return;
    
    const isOrder = cartType === 'order';
    // Build a simple text message for Teams
    let message = `${isOrder ? 'Inventory Order Request' : 'Inventory Transfer Request'} - ${new Date().toLocaleDateString()}\n\n`;
    message += `Please review the following ${isOrder ? 'order' : 'transfer'} request:\n\n`;
    
    // Add each item with proper details
    cartItems.forEach((item, index) => {
      message += `Item ${index + 1}: ${item.item.partNumber} - ${item.item.description || 'N/A'}\n`;
      if (!isOrder) {
        message += `From: ${item.sourceBranch} → To: ${item.destinationBranch}\n`;
      }
      message += `Quantity: ${item.quantity}\n`;
      if (item.notes) {
        message += `Notes: ${item.notes}\n`;
      }
      message += '\n';
    });
    
    message += `Thank you for processing this request.\n`;
    message += `This request was generated from the ZentroQ Inventory Management System.`;
    
    // Encode for URL
    const encodedMessage = encodeURIComponent(message);
    
    // Use a simple Teams chat URL that's more reliable
    const teamsUrl = `https://teams.microsoft.com/l/chat/0/0?users=&message=${encodedMessage}`;
    
    // Open in a new window/tab
    window.open(teamsUrl, '_blank');
  };
  
  // Function to generate an Outlook email that opens in browser
  const generateOutlookLink = (cartItems, cartType) => {
    if (cartItems.length === 0) return;
    
    const isOrder = cartType === 'order';
    const subject = encodeURIComponent(`${isOrder ? 'Inventory Order Request' : 'Inventory Transfer Request'} - ${new Date().toLocaleDateString()}`);
    
    // Create a simple plain text message (plain text works better with browser Outlook)
    let body = `${isOrder ? 'Inventory Order Request' : 'Inventory Transfer Request'} - ${new Date().toLocaleDateString()}\n\n`;
    body += `Please review the following ${isOrder ? 'order' : 'transfer'} request:\n\n`;
    
    // Add each item with proper details
    cartItems.forEach((item, index) => {
      body += `Item ${index + 1}: ${item.item.partNumber} - ${item.item.description || 'N/A'}\n`;
      if (!isOrder) {
        body += `From: ${item.sourceBranch} → To: ${item.destinationBranch}\n`;
      }
      body += `Quantity: ${item.quantity}\n`;
      if (item.notes) {
        body += `Notes: ${item.notes}\n`;
      }
      body += '\n';
    });
    
    body += `Thank you for processing this request.\n`;
    body += `This request was generated from the ZentroQ Inventory Management System.`;
    
    // Use Office Web App URL with simplified parameters
    // This format is more reliable than the /deeplink/compose URL
    const outlookUrl = `https://outlook.office.com/owa/?path=/mail/action/compose&subject=${subject}&body=${encodeURIComponent(body)}`;
    
    // Open in a new window/tab
    window.open(outlookUrl, '_blank');
  };

  return (
    <div className="modal-overlay" aria-labelledby="modal-title" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-container w-full max-w-4xl p-6" onClick={e => e.stopPropagation()}>
        {/* Modal content */}
        <div className="relative bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl w-full">
          {/* Close button */}
          <div className="absolute top-0 right-0 pt-4 pr-4">
            <button
              type="button"
              className="bg-white rounded-md text-gray-400 hover:text-gray-500 focus:outline-none"
              onClick={onClose}
            >
              <span className="sr-only">Close</span>
              <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Header */}
          <div className={`rounded-md ${headerColor} p-4 mb-6`}>
            <div className="flex">
              <div className="flex-shrink-0">
                {isOrder ? (
                  <svg className="h-5 w-5 text-green-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 2a4 4 0 00-4 4v1H5a1 1 0 00-.994.89l-1 9A1 1 0 004 18h12a1 1 0 00.994-1.11l-1-9A1 1 0 0015 7h-1V6a4 4 0 00-4-4zm2 5V6a2 2 0 10-4 0v1h4zm-6 3a1 1 0 112 0 1 1 0 01-2 0zm7-1a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5 text-amber-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M8 5a1 1 0 100 2h5.586l-1.293 1.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L13.586 5H8zM12 15a1 1 0 100-2H6.414l1.293-1.293a1 1 0 10-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L6.414 15H12z" />
                  </svg>
                )}
              </div>
              <div className="ml-3">
                <h3 className={`text-sm font-medium ${headerTextColor}`}>{title}</h3>
                <div className={`mt-2 text-sm ${headerTextColor}`}>
                  <p>
                    {isOrder 
                      ? 'Orders require manager approval before being sent to vendors' 
                      : 'Transfer requests will be sent directly to the supplying branch managers'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Content */}
          {cartItems.length === 0 ? (
            <div className="text-center py-10">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">Cart Empty</h3>
              <p className="mt-1 text-sm text-gray-500">{emptyMessage}</p>
              <div className="mt-6">
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Browse Inventory
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 rounded-lg">
                <table className="min-w-full divide-y divide-gray-300">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Part Number
                      </th>
                      <th scope="col" className="px-3 py-3.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Description
                      </th>
                      {isOrder ? (
                        <>
                          <th scope="col" className="px-3 py-3.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Quantity
                          </th>
                        </>
                      ) : (
                        <>
                          <th scope="col" className="px-3 py-3.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Source Branch
                          </th>
                          <th scope="col" className="px-3 py-3.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Destination
                          </th>
                          <th scope="col" className="px-3 py-3.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Quantity
                          </th>
                        </>
                      )}
                      <th scope="col" className="px-3 py-3.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Notes
                      </th>
                      <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {cartItems.map((item) => (
                      <tr key={item.id}>
                        <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900">
                          {item.item.partNumber}
                        </td>
                        <td className="px-3 py-4 text-sm text-gray-500">
                          {item.item.description}
                        </td>
                        {isOrder ? (
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                            {item.quantity}
                          </td>
                        ) : (
                          <>
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                              {item.sourceBranch}
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                              {item.destinationBranch}
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                              {item.quantity}
                            </td>
                          </>
                        )}
                        <td className="px-3 py-4 text-sm text-gray-500">
                          {item.notes || '-'}
                        </td>
                        <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium">
                          <button
                            onClick={() => handleRemove(item.id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Share & Submit Buttons */}
              <div className="mt-6 flex flex-col space-y-3">
                <div className="flex-grow bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Share via Microsoft 365</h4>
                  <div className="flex flex-col sm:flex-row gap-3">
                    {/* Microsoft Teams button */}
                    <button
                      type="button"
                      onClick={() => generateTeamsLink(cartItems, cartType)}
                      className="inline-flex justify-center items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
                    >
                      <svg className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <path d="M11.5 4.5C11.5 3.12 12.62 2 14 2C15.38 2 16.5 3.12 16.5 4.5C16.5 5.88 15.38 7 14 7C12.62 7 11.5 5.88 11.5 4.5ZM18 8.5C18 9.88 16.88 11 15.5 11H12.5C11.12 11 10 9.88 10 8.5C10 7.12 11.12 6 12.5 6H15.5C16.88 6 18 7.12 18 8.5ZM8 16.25C8 14.18 6.32 12.5 4.25 12.5C2.18 12.5 0.5 14.18 0.5 16.25C0.5 18.32 2.18 20 4.25 20C6.32 20 8 18.32 8 16.25ZM18.25 20H10.75C9.79 20 9 19.21 9 18.25V15.75C9 14.79 9.79 14 10.75 14H18.25C19.21 14 20 14.79 20 15.75V18.25C20 19.21 19.21 20 18.25 20Z" />
                      </svg>
                      Share via Teams
                    </button>
                    
                    {/* Microsoft Outlook button */}
                    <button
                      type="button"
                      onClick={() => generateOutlookLink(cartItems, cartType)}
                      className="inline-flex justify-center items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                      <svg className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <path d="M18 4H15V3C15 1.34 13.66 0 12 0H8C6.34 0 5 1.34 5 3V4H2C0.9 4 0 4.9 0 6V17C0 18.1 0.9 19 2 19H18C19.1 19 20 18.1 20 17V6C20 4.9 19.1 4 18 4ZM8 3C8 2.45 8.45 2 9 2H11C11.55 2 12 2.45 12 3V4H8V3ZM12 11H8C7.45 11 7 10.55 7 10C7 9.45 7.45 9 8 9H12C12.55 9 13 9.45 13 10C13 10.55 12.55 11 12 11Z" />
                      </svg>
                      Share via Outlook
                    </button>
                  </div>
                </div>
                
                <div className="flex flex-col sm:flex-row justify-between gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full sm:w-auto inline-flex justify-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    Continue Shopping
                  </button>
                  
                  <button
                    type="button"
                    onClick={handleClearCart}
                    className="w-full sm:w-auto inline-flex justify-center items-center px-4 py-2 border border-red-300 shadow-sm text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                  >
                    <svg className="h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Clear Cart
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Status message */}
          {requestStatus.message && (
            <div className={`mt-4 p-4 rounded-md ${
              requestStatus.type === 'success' ? 'bg-green-50 text-green-800' : 
              requestStatus.type === 'error' ? 'bg-red-50 text-red-800' : 
              'bg-blue-50 text-blue-800'
            }`}>
              {requestStatus.message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CartModal;