import React from 'react';
import { formatCurrency } from '../utils/inventoryHelpers';

const CartReviewModal = ({
  isOpen,
  onClose,
  cart,
  onSubmitRequest,
  requestStatus,
  cartViewType,
  onRemoveItemFromCart,
  onClearCart,
  item // General item for context if needed, though cart items have their own item
}) => {
  if (!isOpen) return null;

  const hasOrderItems = cart.orders && cart.orders.length > 0;
  const hasTransferItems = cart.transfers && cart.transfers.length > 0;

  return (
    <div 
      className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center p-4 transition-opacity duration-300 ease-in-out" 
      aria-labelledby="cart-review-modal-title" 
      role="dialog" 
      aria-modal="true" 
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-xl shadow-2xl w-full max-w-3xl opacity-100" 
        onClick={e => e.stopPropagation()}
        style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between p-5 border-b border-gray-200 sticky top-0 bg-white z-10 rounded-t-xl">
          <h3 className="text-xl font-semibold text-gray-900" id="cart-review-modal-title">
            {cartViewType === 'order' && 'Review Your Order Cart'}
            {cartViewType === 'transfer' && 'Review Your Transfer Cart'}
            {(!cartViewType || (cartViewType !== 'order' && cartViewType !== 'transfer')) && 'Review Your Requests'}
          </h3>
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
        <div className="p-6 flex-grow overflow-y-auto space-y-8">

          {/* Order Cart Section - Conditionally render */}
          {(cartViewType === 'order' || !cartViewType) && (
            <section>
              <h4 className="text-lg font-semibold text-gray-800 mb-1">
                Order Cart 
                {hasOrderItems && <span className="ml-2 text-sm font-normal text-gray-500">({cart.orders.length} {cart.orders.length === 1 ? 'item' : 'items'})</span>}
              </h4>
              {hasOrderItems && (
                <button 
                  onClick={() => onClearCart('orders')}
                  className="mb-3 text-xs text-red-600 hover:text-red-800 font-medium transition-colors disabled:opacity-50"
                  disabled={requestStatus.isSubmitting}
                >
                  Clear All Orders
                </button>
              )}
              {hasOrderItems ? (
                <div className="space-y-4">
                  <ul className="divide-y divide-gray-200 border border-gray-200 rounded-md">
                    {cart.orders.map((cartItem, index) => (
                      <li key={`order-${index}-${cartItem.item.mfgPartNumber}`} className="p-4 bg-white hover:bg-gray-50">
                        <div className="flex justify-between items-start">
                          <div className="flex-1 pr-4">
                            <p className="text-sm font-medium text-gray-800">
                              {cartItem.item.description || cartItem.item.mfgPartNumber}
                            </p>
                            <p className="text-xs text-gray-500">
                              MFG Part: {cartItem.item.mfgPartNumber}
                              {cartItem.requestingBranch && <span className="ml-2">| For Branch: <span className="font-medium">{cartItem.requestingBranch}</span></span>}
                              {cartItem.vendorName && <span className="ml-2">| Vendor: <span className="font-medium">{cartItem.vendorName}</span></span>}
                            </p>
                          </div>
                          <div className="ml-4 text-right">
                            <p className="text-sm font-semibold text-gray-800">Qty: {cartItem.quantity}</p>
                            {cartItem.item.unitPrice && <p className="text-xs text-gray-500">{formatCurrency(cartItem.item.unitPrice)} ea.</p>}
                          </div>
                          <button 
                            onClick={() => onRemoveItemFromCart('orders', index)} 
                            className="text-gray-400 hover:text-red-600 transition-colors"
                            aria-label="Remove item"
                            disabled={requestStatus.isSubmitting}
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                        {cartItem.notes && <p className="mt-2 text-xs text-gray-600 bg-gray-50 p-2 rounded-md">Notes: {cartItem.notes}</p>}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => onSubmitRequest('orders', 'teams')}
                    disabled={requestStatus.isSubmitting}
                    className="w-full flex items-center justify-center px-4 py-2.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-[#4A53BC] hover:bg-[#3A43AC] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#4A53BC] disabled:opacity-60 transition-colors"
                  >
                    <svg className={`w-5 h-5 mr-2 -ml-1 ${requestStatus.isSubmitting && cart.submittingType === 'orders' ? 'animate-spin' : ''}`} fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        {requestStatus.isSubmitting && cart.submittingType === 'orders' ? (
                            <path d="M12 4V2A10 10 0 002 12h2a8 8 0 018-8z"/>
                        ) : (
                            <path d="M21.528 9.139c-.208-.63-.708-1.13-1.338-1.338C19.061 7.348 16.391 7 12 7c-4.39 0-7.061.348-8.19.801-.63.208-1.13.708-1.338 1.338C2.348 10.268 2 12.939 2 17c0 4.061.348 6.732.801 7.861.208.63.708 1.13 1.338 1.338C5.268 26.652 7.939 27 12 27c4.061 0 6.732-.348 7.861-.801.63-.208 1.13-.708 1.338-1.338C21.652 23.732 22 21.061 22 17c0-4.061-.348-6.732-.801-7.861zM12 25c-3.639 0-6.139-.311-7.199-.729-.42-.168-.672-.42-.729-.729C3.311 22.391 3 19.891 3 17s.311-5.39.729-6.199c.057-.309.309-.561.729-.729C5.861 9.311 8.361 9 12 9s6.139.311 7.199.729c.42.168.672.42.729.729.771 1.601.729 4.101.729 6.199s-.042 4.598-.729 6.199c-.057.309-.309.561-.729-.729C18.139 24.689 15.639 25 12 25zm3-9h-2v2H9v-2H7V9h2V7h4v2h2v7zm-2-5h-2V9h2v2zm0 4h-2v2h2v-2z"/>
                        )}
                    </svg>
                    {requestStatus.isSubmitting && cart.submittingType === 'orders' ? 'Processing...' : 'Microsoft Teams'}
                  </button>
                </div>
              ) : (
                <p className="text-sm text-gray-500 italic">Your order cart is empty.</p>
              )}
            </section>
          )}

          {/* Transfer Cart Section - Conditionally render */}
          {(cartViewType === 'transfer' || !cartViewType) && (
            <section>
              <h4 className="text-lg font-semibold text-gray-800 mb-1">
                Transfer Cart
                {hasTransferItems && <span className="ml-2 text-sm font-normal text-gray-500">({cart.transfers.length} {cart.transfers.length === 1 ? 'item' : 'items'})</span>}
              </h4>
              {hasTransferItems && (
                <button 
                  onClick={() => onClearCart('transfers')}
                  className="mb-3 text-xs text-red-600 hover:text-red-800 font-medium transition-colors disabled:opacity-50"
                  disabled={requestStatus.isSubmitting}
                >
                  Clear All Transfers
                </button>
              )}
              {hasTransferItems ? (
                <div className="space-y-4">
                  <ul className="divide-y divide-gray-200 border border-gray-200 rounded-md">
                    {cart.transfers.map((cartItem, index) => (
                      <li key={`transfer-${index}-${cartItem.item.mfgPartNumber}`} className="p-4 bg-white hover:bg-gray-50">
                        <div className="flex justify-between items-start">
                          <div className="flex-1 pr-4">
                             <p className="text-sm font-medium text-gray-800">
                              {cartItem.item.description || cartItem.item.mfgPartNumber}
                            </p>
                            <p className="text-xs text-gray-500">
                              MFG Part: {cartItem.item.mfgPartNumber}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              From: <span className="font-medium">{cartItem.sourceBranch}</span> 
                              {cartItem.destinationBranch && <> → To: <span className="font-medium">{cartItem.destinationBranch}</span></>}
                            </p>
                          </div>
                          <div className="ml-4 text-right">
                            <p className="text-sm font-semibold text-gray-800">Qty: {cartItem.quantity}</p>
                             {cartItem.item.unitPrice && <p className="text-xs text-gray-500">{formatCurrency(cartItem.item.unitPrice)} ea.</p>}
                          </div>
                          <button 
                            onClick={() => onRemoveItemFromCart('transfers', index)} 
                            className="text-gray-400 hover:text-red-600 transition-colors"
                            aria-label="Remove item"
                            disabled={requestStatus.isSubmitting}
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                        {cartItem.notes && <p className="mt-2 text-xs text-gray-600 bg-gray-50 p-2 rounded-md">Notes: {cartItem.notes}</p>}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => onSubmitRequest('transfers')}
                    disabled={requestStatus.isSubmitting}
                    className="w-full flex items-center justify-center px-4 py-2.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-60 transition-colors"
                  >
                    <svg className={`w-5 h-5 mr-2 -ml-1 ${requestStatus.isSubmitting && cart.submittingType === 'transfers' ? 'animate-spin' : ''}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                       {requestStatus.isSubmitting && cart.submittingType === 'transfers' ? (
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.75V6.25m0 11.5v1.5m8.25-8.25h-1.5M4.75 12H3.25m15.06-5.06l-1.062-1.06M6.062 17.938l-1.06-1.06M17.938 6.062l-1.06 1.06M6.062 6.062l-1.06 1.062M12 12a5 5 0 110-10 5 5 0 010 10z" />
                        ) : (
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        )}
                    </svg>
                    {requestStatus.isSubmitting && cart.submittingType === 'transfers' ? 'Submitting Transfers...' : 'Submit All Transfers'}
                  </button>
                </div>
              ) : (
                <p className="text-sm text-gray-500 italic">Your transfer cart is empty.</p>
              )}
            </section>
          )}
          
          {/* Global Request Status Message */}
          {requestStatus.message && (
            <div className={`mt-6 p-4 rounded-md text-sm border ${requestStatus.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : requestStatus.type === 'error' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-blue-50 border-blue-200 text-blue-700'}`} role="alert">
              <div className="flex items-center">
                  <div className="flex-shrink-0">
                      {requestStatus.type === 'success' && <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>}
                      {requestStatus.type === 'error' && <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>}
                      {requestStatus.type !== 'success' && requestStatus.type !== 'error' && <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>}
                  </div>
                  <div className="ml-3">
                      <p>{requestStatus.message}</p>
                  </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CartReviewModal; 