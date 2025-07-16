import React, { useState } from 'react';
import { ShoppingCartIcon, HomeIcon, ArrowLeftOnRectangleIcon, UserCircleIcon, ArrowRightCircleIcon } from '@heroicons/react/24/outline';
import { useMsal } from '@azure/msal-react';

const Sidebar = ({ onNavigate, onToggleExpand, currentView }) => {
  const { instance, accounts } = useMsal();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [userProfilePicture, setUserProfilePicture] = useState(null);
  const [profilePictureError, setProfilePictureError] = useState(false);

  // Get current user info
  const currentAccount = accounts[0];
  const user = currentAccount;
  const currentUserEmail = currentAccount?.username || currentAccount?.idTokenClaims?.email || '';

  // Fetch user profile picture from Microsoft Graph
  React.useEffect(() => {
    const fetchProfilePicture = async () => {
      if (!currentAccount) return;

      try {
        // Request token for Microsoft Graph
        const request = {
          scopes: ['User.Read'],
          account: currentAccount
        };

        const response = await instance.acquireTokenSilent(request);
        
        if (response.accessToken) {
          // Fetch profile photo from Microsoft Graph
          const photoResponse = await fetch('https://graph.microsoft.com/v1.0/me/photo/$value', {
            headers: {
              'Authorization': `Bearer ${response.accessToken}`
            }
          });

          if (photoResponse.ok) {
            const photoBlob = await photoResponse.blob();
            const photoUrl = URL.createObjectURL(photoBlob);
            setUserProfilePicture(photoUrl);
            setProfilePictureError(false);
          } else {
            // User doesn't have a profile picture (404) or other error
            setProfilePictureError(true);
          }
        } else {
          setProfilePictureError(true);
        }
      } catch (error) {
        // Silently handle errors - will show default avatar
        setProfilePictureError(true);
      }
    };

    fetchProfilePicture();

    // Cleanup blob URL when component unmounts
    return () => {
      if (userProfilePicture) {
        URL.revokeObjectURL(userProfilePicture);
      }
    };
  }, [currentAccount, instance]);

  // Handle logout
  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogout = () => {
    setIsLoggingOut(true);
    setShowLogoutConfirm(false);
    
    const logoutRequest = {
      account: currentAccount,
      postLogoutRedirectUri: window.location.origin,
      mainWindowRedirectUri: window.location.origin,
      onRedirectNavigate: () => false
    };
    
    // Clear local storage
    localStorage.clear();
    sessionStorage.clear();
    
    // Perform logout
    instance.logoutRedirect(logoutRequest);
  };

  const cancelLogout = () => {
    setShowLogoutConfirm(false);
  };

  const handleMouseEnter = () => {
    setIsExpanded(true);
    if (onToggleExpand) onToggleExpand(true);
  };

  const handleMouseLeave = () => {
    setIsExpanded(false);
    if (onToggleExpand) onToggleExpand(false);
  };

  const navigationItems = [
    {
      name: 'Inventory',
      href: '/inventory',
      icon: HomeIcon,
      current: currentView === 'inventory',
    },
    {
      name: 'Order Requests',
      href: '/order-requests',
      icon: ShoppingCartIcon,
      current: currentView === 'orderRequests',
    },
    {
      name: 'Transfer Requests',
      href: '/transfer-requests',
      icon: ArrowRightCircleIcon,
      current: currentView === 'transferRequests',
    },
  ];

  return (
    <div
      className={`fixed top-0 left-0 h-screen bg-white text-gray-700 transition-all duration-150 ease-in-out z-40 flex flex-col border-r border-gray-200 shadow-sm`}
      style={{ width: isExpanded ? '240px' : '60px' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* User Profile Area - Always visible */}
      <div 
        className={`flex items-center h-16 px-2 border-b border-gray-200 overflow-hidden`}
      >
        <div className={`flex items-center p-2 w-full ${isExpanded ? 'justify-start' : 'justify-center'}`}>
          {/* Profile picture or Microsoft-style default avatar - always visible */}
          <div className="h-8 w-8 flex-shrink-0">
            {userProfilePicture && !profilePictureError ? (
              <img 
                src={userProfilePicture} 
                alt="Profile"
                className="h-8 w-8 rounded-full object-cover border border-gray-200"
                onError={() => setProfilePictureError(true)}
              />
            ) : (
              // Microsoft-style default avatar with user initials
              <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-semibold border border-gray-200">
                {(() => {
                  const name = user?.name || user?.idTokenClaims?.name || user?.username || 'User';
                  const nameParts = name.split(' ');
                  if (nameParts.length >= 2) {
                    return (nameParts[0][0] + nameParts[1][0]).toUpperCase();
                  } else {
                    return name.slice(0, 2).toUpperCase();
                  }
                })()}
              </div>
            )}
          </div>
          {/* User name and email - only visible when expanded */}
          {isExpanded && user && (
            <div className="ml-3 min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-700 truncate" title={user.name || (user.idTokenClaims && user.idTokenClaims.name) || user.username}>
                {user.name || (user.idTokenClaims && user.idTokenClaims.name) || user.username || 'User'}
              </p>
              {(currentUserEmail || user.username) && (
                <p className="text-xs text-gray-500 truncate" title={currentUserEmail || user.username}>
                  {currentUserEmail || user.username}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Top Logout Area */}
      <div className={`flex items-center h-12 px-2 border-b border-gray-200 overflow-hidden`}>
        <button 
          onClick={handleLogout}
          disabled={isLoggingOut}
          title="Logout"
          className={`flex items-center p-2 rounded-md text-gray-500 hover:bg-red-100 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 w-full disabled:opacity-50 disabled:cursor-not-allowed ${isExpanded ? 'justify-start' : 'justify-center'}`}
        >
          {isLoggingOut ? (
            <svg className={`animate-spin h-5 w-5 flex-shrink-0 ${isExpanded ? 'mr-3' : 'mx-auto'}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            <ArrowLeftOnRectangleIcon className={`h-5 w-5 flex-shrink-0 ${isExpanded ? 'mr-3' : 'mx-auto'} text-gray-400 group-hover:text-red-600`} />
          )}
          <span 
            className={`ml-2 text-sm font-medium transition-all duration-100 ease-in-out overflow-hidden whitespace-nowrap ${isExpanded ? 'opacity-100 max-w-xs' : 'opacity-0 max-w-0'}`}
            style={{ transitionDelay: isExpanded ? '50ms' : '0ms' }}
          >
            {isLoggingOut ? 'Signing Out...' : 'Logout'}
          </span>
        </button>
      </div>

      {/* Navigation Links */}
      <nav className={`flex-grow space-y-1 px-2 ${isExpanded && user ? 'pt-2' : 'mt-4'}`}>
        {navigationItems.map((item) => (
          <button
            key={item.name}
            onClick={() => onNavigate(item.href)}
            className={`
              group flex items-center px-3 py-2.5 text-sm font-medium rounded-md w-full overflow-hidden
              hover:bg-indigo-50 hover:text-indigo-700
              ${item.current ? 'bg-indigo-50 text-indigo-600 font-semibold' : 'text-gray-600 hover:text-gray-800'}
            `}
            aria-current={item.current ? 'page' : undefined}
            title={item.name}
          >
            <item.icon
              className={`
                flex-shrink-0 h-6 w-6 transition-all duration-150 ease-in-out
                ${isExpanded ? 'mr-3' : 'mx-auto'}
                ${item.current ? 'text-indigo-500' : 'text-gray-400 group-hover:text-indigo-500'}
              `}
              aria-hidden="true"
            />
            <span 
              className={`truncate transition-all duration-100 ease-in-out overflow-hidden whitespace-nowrap ${isExpanded ? 'opacity-100 max-w-xs' : 'opacity-0 max-w-0'}`}
              style={{ transitionDelay: isExpanded ? '75ms' : '0ms' }} // Delay appearance of text slightly
            >
              {item.name}
            </span>
          </button>
        ))}
      </nav>

      {/* Logout confirmation modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm mx-4 shadow-xl">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Confirm Sign Out</h3>
            <p className="text-sm text-gray-500 mb-6">
              Are you sure you want to sign out? You'll need to log in again to access the inventory system.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={confirmLogout}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2 px-4 rounded-md transition-colors"
              >
                Sign Out
              </button>
              <button
                onClick={cancelLogout}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm font-medium py-2 px-4 rounded-md transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Sidebar; 