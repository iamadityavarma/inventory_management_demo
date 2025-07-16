import { msalInstance, loginRequest, protectedResources } from "./authConfig";
import { InteractionStatus, InteractionType } from "@azure/msal-browser";
import { useMsal, useIsAuthenticated, MsalAuthenticationTemplate } from "@azure/msal-react";

// import { trasmissioneActiveOrder } from './utils/trasmissioneOrdine'; // Example, adjust as needed
// import { trasmissioneTrasferimento } from './utils/trasmissioneTrasferimento'; // Example, adjust as needed


const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';
// const TEAMS_WEBHOOK_URL_ORDERS = process.env.REACT_APP_TEAMS_WEBHOOK_URL_ORDERS;
// const TEAMS_WEBHOOK_URL_TRANSFERS = process.env.REACT_APP_TEAMS_WEBHOOK_URL_TRANSFERS;


function App() {
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const [activeUser, setActiveUser] = useState(null);
  const [requestStatus, setRequestStatus] = useState({ type: '', message: '' });
  const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false);
  const [showItemDetailModal, setShowItemDetailModal] = useState(false);
  const [selectedItemForModal, setSelectedItemForModal] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false); // State for sidebar toggle
  const [userPreferences, setUserPreferences] = useState(null);
  const [showUserPreferencesModal, setShowUserPreferencesModal] = useState(false);


  // New state for transfer cart, orders are now API driven
  const [transferCart, setTransferCart] = useState({ items: [], requestingBranch: '', destinationBranch: '' });

  // Memoize currentUserEmail
  const currentUserEmail = useMemo(() => {
    if (activeUser && activeUser.signInDetails && activeUser.signInDetails.localAccountId) {
      return activeUser.signInDetails.localAccountId; // Or the correct field for email
    } else if (activeUser && activeUser.username) { // Fallback for older structures or different auth setups
        return activeUser.username;
    }
    return null;
  }, [activeUser]);


  const fetchUserPreferences = useCallback(async () => {
// ... existing code ...
  }, [instance, activeUser]);


  const handleSavePreferences = async (preferences) => {
    if (!activeUser || !currentUserEmail) {
      setRequestStatus({ type: 'error', message: 'User not authenticated.' });
      return;
    }
    try {
      const tokenResponse = await instance.acquireTokenSilent({
        scopes: protectedResources.apiInventory.scopes,
        account: activeUser,
      });
      const response = await fetch(`${API_BASE_URL}/user-preferences`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenResponse.accessToken}`,
        },
        body: JSON.stringify({ user_email: currentUserEmail, preferences }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `Failed to save preferences. Status: ${response.status}`);
      }
      const updatedPreferences = await response.json();
      setUserPreferences(updatedPreferences.preferences);
      setRequestStatus({ type: 'success', message: 'Preferences saved successfully.' });
      setShowUserPreferencesModal(false);
    } catch (error) {
      console.error("Error saving preferences:", error);
      setRequestStatus({ type: 'error', message: `Error saving preferences: ${error.message}` });
    }
  };


  useEffect(() => {
// ... existing code ...
  }, [isAuthenticated, accounts, instance, fetchUserPreferences]);


  // Clear request status message after a delay
  useEffect(() => {
// ... existing code ...
  }, [requestStatus]);


  const handleLogin = () => {
// ... existing code ...
  };


  const handleLogout = () => {
// ... existing code ...
  };
  
  const handleViewItemDetail = (item) => {
// ... existing code ...
  };

  const handleCloseItemDetailModal = () => {
// ... existing code ...
  };

  // ----- New API-driven Active Order Cart Handlers -----

  const handleAddToCartAPI = async (itemData) => {
    if (!currentUserEmail) {
      setRequestStatus({ type: 'error', message: 'User not authenticated. Cannot add item to cart.' });
      console.error("Add to cart failed: User not authenticated.");
      return;
    }

    // Ensure itemData contains all necessary fields
    // mfg_part_number, internal_part_number, item_description, quantity_requested, 
    // vendor_name, notes, requesting_branch
    const payload = {
      ...itemData,
      requested_by_user_email: currentUserEmail,
    };

    console.log("handleAddToCartAPI payload:", payload);

    try {
      const tokenResponse = await instance.acquireTokenSilent({
        scopes: protectedResources.apiInventory.scopes,
        account: activeUser,
      });

      const response = await fetch(`${API_BASE_URL}/active-orders/item`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenResponse.accessToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Error adding item to active order:", errorData);
        setRequestStatus({ type: 'error', message: errorData.detail || `Failed to add item. Status: ${response.status}` });
        return;
      }

      const addedItem = await response.json();
      setRequestStatus({ type: 'success', message: `${addedItem.item_description} added to active order.` });
      // No local state update needed, OrderRequestsPage will re-fetch.
      // If ItemDetailModal is open, you might want to close it or give feedback.
      handleCloseItemDetailModal(); 

    } catch (error) {
      console.error("Error in handleAddToCartAPI:", error);
      setRequestStatus({ type: 'error', message: `Error adding item to cart: ${error.message}` });
    }
  };

  const handleRemoveActiveOrderItemAPI = async (orderRequestItemId) => {
    if (!currentUserEmail) {
      setRequestStatus({ type: 'error', message: 'User not authenticated.' });
      return;
    }
    try {
      const tokenResponse = await instance.acquireTokenSilent({
        scopes: protectedResources.apiInventory.scopes,
        account: activeUser,
      });
      const response = await fetch(`${API_BASE_URL}/active-orders/item/${orderRequestItemId}?user_email=${encodeURIComponent(currentUserEmail)}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${tokenResponse.accessToken}`,
        },
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `Failed to remove item. Status: ${response.status}`);
      }
      setRequestStatus({ type: 'success', message: 'Item removed from active order.' });
      // OrderRequestsPage will re-fetch its data.
    } catch (error) {
      console.error("Error removing active order item:", error);
      setRequestStatus({ type: 'error', message: `Error removing item: ${error.message}` });
    }
  };

  const handleUpdateActiveOrderItemQuantityAPI = async (orderRequestItemId, newQuantity) => {
    if (!currentUserEmail) {
      setRequestStatus({ type: 'error', message: 'User not authenticated.' });
      return;
    }
    if (newQuantity <= 0) {
        // If quantity is zero or less, treat it as a removal.
        // Or, your API might handle this, in which case, adjust this logic.
        // For now, let's assume the API handles quantity validation or deletion on 0.
        // If not, call handleRemoveActiveOrderItemAPI(orderRequestItemId);
        // return;
         console.warn("Attempting to update quantity to zero or less. API should handle this or it should be a delete operation.");
    }

    try {
      const tokenResponse = await instance.acquireTokenSilent({
        scopes: protectedResources.apiInventory.scopes,
        account: activeUser,
      });
      const payload = {
        quantity: newQuantity,
        user_email: currentUserEmail 
      };
      const response = await fetch(`${API_BASE_URL}/active-orders/item/${orderRequestItemId}/quantity`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenResponse.accessToken}`,
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `Failed to update quantity. Status: ${response.status}`);
      }
      setRequestStatus({ type: 'success', message: 'Item quantity updated in active order.' });
      // OrderRequestsPage will re-fetch its data.
    } catch (error) {
      console.error("Error updating active order item quantity:", error);
      setRequestStatus({ type: 'error', message: `Error updating quantity: ${error.message}` });
    }
  };
  
  const handleClearActiveOrderAPI = async () => {
    if (!currentUserEmail) {
      setRequestStatus({ type: 'error', message: 'User not authenticated.' });
      return;
    }
    try {
      const tokenResponse = await instance.acquireTokenSilent({
        scopes: protectedResources.apiInventory.scopes,
        account: activeUser,
      });
      const response = await fetch(`${API_BASE_URL}/active-orders/all?user_email=${encodeURIComponent(currentUserEmail)}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${tokenResponse.accessToken}`,
        },
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `Failed to clear active order. Status: ${response.status}`);
      }
      setRequestStatus({ type: 'success', message: 'Active order cleared.' });
      // OrderRequestsPage will re-fetch its data (which should be empty).
    } catch (error) {
      console.error("Error clearing active order:", error);
      setRequestStatus({ type: 'error', message: `Error clearing active order: ${error.message}` });
    }
  };

  // ----- END New API-driven Active Order Cart Handlers -----


  // ----- Transfer Cart Handlers (Unaffected by this refactor for now) -----
  const handleAddToTransferCart = (item, quantity, requestingBranch, destinationBranch, notes) => {
// ... existing code ...
  };


  const handleUpdateTransferItemQuantity = (itemId, newQuantity) => {
// ... existing code ...
  };


  const handleRemoveTransferItem = (itemId) => {
// ... existing code ...
  };


  const handleClearTransferCart = () => {
// ... existing code ...
  };
  // ----- END Transfer Cart Handlers -----

  const handleSubmitRequest = async (type, additionalData = {}) => {
    if (!currentUserEmail) {
      setRequestStatus({ type: 'error', message: 'User not authenticated. Cannot submit request.' });
      return;
    }

    const tokenResponse = await instance.acquireTokenSilent({
      scopes: protectedResources.apiInventory.scopes,
      account: activeUser,
    });

    if (type === 'orders') {
      // The API now only needs the user_email, as it fetches active orders from the DB.
      const payload = {
        user_email: currentUserEmail,
        // Any additional data can be passed if needed, e.g., notes for the entire order
        ...(additionalData.notes_for_submitter && { notes_for_submitter: additionalData.notes_for_submitter })
      };
      
      console.log("Submitting order with payload:", payload);

      try {
        const response = await fetch(`${API_BASE_URL}/submit-orders`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${tokenResponse.accessToken}`,
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorData = await response.json();
          console.error('Error submitting order request:', errorData.detail || response.statusText);
          setRequestStatus({ type: 'error', message: `Order submission failed: ${errorData.detail || response.statusText}` });
          return; // Return early on failure
        }

        const result = await response.json();
        console.log('Order request submitted successfully:', result);
        setRequestStatus({ type: 'success', message: `Order request ${result.order_request_ids ? result.order_request_ids.join(', ') : ''} submitted successfully!` });
        
        // Clear local active order representation if OrderRequestsPage isn't automatically re-fetching/clearing
        // This is generally handled by OrderRequestsPage re-fetching, so local clear might not be needed.
        // If TEAMS_WEBHOOK_URL_ORDERS is configured, send a notification
        // if (TEAMS_WEBHOOK_URL_ORDERS && result.order_request_ids && result.order_request_ids.length > 0) {
        //   trasmissioneActiveOrder(
        //     result.submitted_orders_details, // Assuming API returns this structure
        //     currentUserEmail, 
        //     TEAMS_WEBHOOK_URL_ORDERS,
        //     result.order_request_ids.join(', '), // Pass combined order IDs
        //     additionalData.notes_for_submitter || ""
        //   );
        // }
        // If deep linking is set up and API returns necessary info:
        if (result.order_request_ids && result.order_request_ids.length > 0 && userPreferences?.teamsDeepLinkOrderRequestEnabled) {
          const orderIdParam = result.order_request_ids.join(',');
          // Construct the deep link URL to your Power Automate flow or Teams app
          // This is an example URL structure, adjust it to your actual Power Automate HTTP trigger URL
          // or your Teams app deep link structure.
          const deepLinkBase = userPreferences?.teamsDeepLinkUrlOrderRequest;
          if (deepLinkBase) {
            const deepLink = `${deepLinkBase}&orderRequestIds=${encodeURIComponent(orderIdParam)}&submittedBy=${encodeURIComponent(currentUserEmail)}`;
            console.log("Generated Teams deep link for order:", deepLink);
            // window.open(deepLink, '_blank'); // Optionally open automatically
            setRequestStatus({ type: 'success', message: `Order ${orderIdParam} submitted! <a href="${deepLink}" target="_blank" rel="noopener noreferrer" class="text-indigo-600 hover:text-indigo-800 underline">Notify Approver via Teams</a>` });
          } else {
             setRequestStatus({ type: 'success', message: `Order ${orderIdParam} submitted! Configure Teams deep link URL in preferences to enable direct notification.` });
          }
        }


      } catch (error) {
        console.error('Error submitting order request:', error);
        setRequestStatus({ type: 'error', message: `Order submission failed: ${error.message}` });
      }
    } else if (type === 'transfers') {
      // Transfer logic remains the same, using local transferCart state
      if (!transferCart || transferCart.items.length === 0) {
// ... existing code ...
        return;
      }
      const payload = {
        user_email: currentUserEmail,
        requesting_branch_id: transferCart.requestingBranch,
        destination_branch_id: transferCart.destinationBranch,
        items: transferCart.items.map(item => ({
// ... existing code ...
        })),
        notes: additionalData.notes || "" // Include notes if provided
      };
      console.log("Submitting transfer with payload:", payload);


      try {
        const tokenResponse = await instance.acquireTokenSilent({
          scopes: protectedResources.apiInventory.scopes,
          account: activeUser,
        });
        const response = await fetch(`${API_BASE_URL}/submit-transfer`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${tokenResponse.accessToken}`,
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorData = await response.json();
          console.error('Error submitting transfer request:', errorData.detail || response.statusText);
          setRequestStatus({ type: 'error', message: `Transfer submission failed: ${errorData.detail || response.statusText}` });
          return;
        }

        const result = await response.json();
        console.log('Transfer request submitted successfully:', result);
        setRequestStatus({ type: 'success', message: `Transfer request ${result.transfer_request_id || ''} submitted successfully!` });
        setTransferCart({ items: [], requestingBranch: '', destinationBranch: '' }); // Clear the local transfer cart

        // Optional: Send Teams notification for transfers
        // if (TEAMS_WEBHOOK_URL_TRANSFERS && result.transfer_request_id) {
        //   trasmissioneTrasferimento(
        //     payload, // Or a more specific details object if API returns one
        //     currentUserEmail, 
        //     TEAMS_WEBHOOK_URL_TRANSFERS, 
        //     result.transfer_request_id,
        //     additionalData.notes || ""
        //   );
        // }

      } catch (error) {
        console.error('Error submitting transfer request:', error);
        setRequestStatus({ type: 'error', message: `Transfer submission failed: ${error.message}` });
      }
    }
  };

  // Main return logic of App component, directly incorporating AuthContent logic

  // If MSAL is not yet initialized, or interaction is in progress, display loading or appropriate UI
  if (inProgress === InteractionStatus.Startup || inProgress === InteractionStatus.HandleRedirect) {
    return <div className="flex justify-center items-center h-screen">Loading authentication status...</div>;
  }
  
  // If user is not authenticated, prompt for login
  if (!isAuthenticated && inProgress === InteractionStatus.None) {
      return (
          <div className="min-h-screen bg-gray-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
              <div className="sm:mx-auto sm:w-full sm:max-w-md">
                  <svg className="mx-auto h-12 w-auto text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.32 0 4.5 4.5 0 01-1.41 8.775H6.75z" />
                  </svg>
                  <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">Sign in to your account</h2>
              </div>
              <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
                  <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
                      <button
                          onClick={handleLogin}
                          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                      >
                          Sign in with Microsoft
                      </button>
                      <p className="mt-2 text-center text-sm text-gray-600">
                         You will be redirected to the Microsoft login page.
                      </p>
                  </div>
              </div>
          </div>
      );
  }

  // Fallback if activeUser is somehow null after authentication
  if (!activeUser && isAuthenticated) {
      return <div className="flex justify-center items-center h-screen">Authenticating... please wait. If this persists, try refreshing.</div>;
  }

  // If initial load (e.g. user preferences) is not complete, show a loading indicator.
  if (!isInitialLoadComplete && isAuthenticated) {
      return (
          <div className="flex justify-center items-center h-screen">
              <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-indigo-500"></div>
              <p className="ml-3 text-gray-700">Loading user data...</p>
          </div>
      );
  }
  
  // Authenticated and initialized: Render the main application UI
  return (
    <>
      <div className="flex h-screen bg-gray-100">
        <Sidebar 
            user={activeUser} 
            onLogout={handleLogout} 
            isOpen={sidebarOpen} 
            setIsOpen={setSidebarOpen} 
            currentUserEmail={currentUserEmail}
            onShowUserPreferences={() => setShowUserPreferencesModal(true)}
        />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header 
            user={activeUser} 
            onLogout={handleLogout} 
            onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
            onShowUserPreferences={() => setShowUserPreferencesModal(true)}
          />
          <main className="flex-1 overflow-y-auto bg-gray-100 p-4 md:p-6">
            <Routes>
              <Route path="/" element={
                <Dashboard 
                  apiBaseUrl={API_BASE_URL} 
                  activeUser={activeUser}
                  onViewItemDetail={handleViewItemDetail} 
                />
              }/>
              <Route path="/inventory" element={
                <InventoryPage 
                  apiBaseUrl={API_BASE_URL} 
                  activeUser={activeUser} 
                  onViewItemDetail={handleViewItemDetail}
                  userPreferences={userPreferences}
                />
              }/>
              <Route path="/item-detail/:itemSKU" element={
                <ItemDetailPage 
                  apiBaseUrl={API_BASE_URL} 
                  activeUser={activeUser} 
                  onAddToCart={handleAddToCartAPI} 
                />
              }/>
              <Route path="/order-requests" element={
                <OrderRequestsPage
                  apiBaseUrl={API_BASE_URL}
                  activeUserEmail={currentUserEmail} 
                  onRemoveActiveOrderItem={handleRemoveActiveOrderItemAPI}
                  onUpdateActiveOrderItemQuantity={handleUpdateActiveOrderItemQuantityAPI}
                  onClearActiveOrderCart={handleClearActiveOrderAPI}
                  onSubmitRequest={handleSubmitRequest}
                  requestStatus={requestStatus} 
                  userPreferences={userPreferences}
                />
              }/>
              <Route path="/transfer-requests" element={
                <TransferRequestsPage
                  apiBaseUrl={API_BASE_URL}
                  activeUser={activeUser} 
                  transferCartItems={transferCart.items}
                  requestingBranch={transferCart.requestingBranch}
                  destinationBranch={transferCart.destinationBranch}
                  onUpdateTransferItemQuantity={handleUpdateTransferItemQuantity}
                  onRemoveTransferItem={handleRemoveTransferItem}
                  onClearTransferCart={handleClearTransferCart}
                  onSubmitRequest={handleSubmitRequest}
                  requestStatus={requestStatus}
                  userPreferences={userPreferences}
                />
              }/>
               <Route path="/submitted-requests" element={
                <SubmittedRequestsPage 
                  apiBaseUrl={API_BASE_URL} 
                  activeUser={activeUser} 
                />
              }/>
            </Routes>
          </main>
        </div>
      </div>
      {showItemDetailModal && selectedItemForModal && (
        <ItemDetailModal 
          item={selectedItemForModal} 
          onClose={handleCloseItemDetailModal}
          onAddToCart={handleAddToCartAPI} 
          apiBaseUrl={API_BASE_URL}
          activeUser={activeUser}
          userPreferences={userPreferences}
        />
      )}
      {showUserPreferencesModal && activeUser && (
        <UserPreferencesModal
            isOpen={showUserPreferencesModal}
            onClose={() => setShowUserPreferencesModal(false)}
            onSave={handleSavePreferences}
            currentPreferences={userPreferences}
            apiBaseUrl={API_BASE_URL}
            activeUser={activeUser}
        />
      )}
      {requestStatus.message && (
        <div 
          className={`fixed bottom-4 right-4 p-4 rounded-md shadow-lg text-white ${requestStatus.type === 'success' ? 'bg-green-500' : 'bg-red-500'} transition-opacity duration-300 animate-fadeInOut`}
          role="alert"
        >
          <span dangerouslySetInnerHTML={{ __html: requestStatus.message }} /> 
        </div>
      )}
    </>
  );
}

// Wrap App with MsalAuthenticationTemplate to protect the entire application
const ProtectedApp = () => (
  <MsalAuthenticationTemplate 
    interactionType={InteractionType.Redirect} 
    authenticationRequest={loginRequest}
  >
    <App />
  </MsalAuthenticationTemplate>
);

export default ProtectedApp; 