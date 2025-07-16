import React from 'react';
import { useMsal, useIsAuthenticated } from '@azure/msal-react';
import { InteractionRequiredAuthError, InteractionStatus } from '@azure/msal-browser';
import { loginRequest, allowedRoles } from '../authConfig';

// API base URL
const API_BASE_URL = window.API_BASE_URL || process.env.REACT_APP_API_URL || 'http://localhost:8000';

const ProtectedRoute = ({ children }) => {
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const [isAuthorized, setIsAuthorized] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [errorMessage, setErrorMessage] = React.useState("");

  React.useEffect(() => {
    const checkUserAccess = async () => {
      // New: Check if MSAL interaction is in progress
      if (inProgress !== InteractionStatus.None) {
        console.log("ProtectedRoute: MSAL interaction is currently in progress. Deferring user access check.");
        // setIsLoading(true); // Optional: ensure loading state remains true if it isn't already
        return; // Defer execution until MSAL is idle
      }

      // Log authentication state before checking
      console.log("Authentication state:", isAuthenticated ? "Authenticated" : "Not authenticated");
      console.log("Accounts available:", accounts.length);
      
      if (!isAuthenticated || accounts.length === 0) {
        console.log("No authenticated account, returning to login");
        setIsLoading(false);
        return;
      }

      try {
        // Get user info
        const currentAccount = accounts[0];
        
        // Request token silently
        await instance.acquireTokenSilent({
          ...loginRequest,
          account: currentAccount
        });
        
        // Check for app roles in the token claims
        console.log("Checking user roles in token:", currentAccount);
        
        // Log the account structure to see all available claims
        console.log("Account details:", JSON.stringify(currentAccount, null, 2));
        
        // Get user roles from ID token claims
        const userRoles = currentAccount.idTokenClaims?.roles || [];
        console.log("User roles from token:", userRoles);
        
        // Check if user has any of the allowed roles
        const hasAllowedRole = allowedRoles.some(role => userRoles.includes(role));
        
        if (hasAllowedRole) {
          // Find which roles the user has
          const userAllowedRoles = userRoles.filter(role => allowedRoles.includes(role));
          console.log("User has allowed role(s):", userAllowedRoles);
          
          setIsAuthorized(true);
          
          // Store the highest priority role for use in the app
          // Order: Admin > User > ReadOnly
          if (userRoles.includes("Inventory.Admin")) {
            localStorage.setItem('userRole', 'Inventory.Admin');
          } else if (userRoles.includes("Inventory.User")) {
            localStorage.setItem('userRole', 'Inventory.User');
          } else if (userRoles.includes("Inventory.ReadOnly")) {
            localStorage.setItem('userRole', 'Inventory.ReadOnly');
          }
          
          // User is authorized, proceed to application
          setIsLoading(false);
          
        } else {
          console.log("User does NOT have any allowed role");
          setIsAuthorized(false);
          setErrorMessage("You don't have the required role to access this application. Please contact your administrator.");
          setIsLoading(false);
        }
        
      } catch (error) {
        if (error instanceof InteractionRequiredAuthError) {
          // If interaction is required, redirect to login
          instance.acquireTokenRedirect(loginRequest);
        } else {
          console.error("Authentication check failed:", error);
          setIsLoading(false);
        }
      }
    };

    checkUserAccess();
  }, [isAuthenticated, accounts, instance, inProgress]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center w-full max-w-md px-6">
          <div className="mb-6 relative">
            <svg className="w-16 h-16 mx-auto opacity-75" viewBox="0 0 100 100">
              <circle 
                className="progress-circle" 
                cx="50" 
                cy="50" 
                r="40" 
                fill="none" 
                strokeWidth="6" 
                stroke="#e2e8f0" 
              />
              <circle 
                className="progress-circle" 
                cx="50" 
                cy="50" 
                r="40" 
                fill="none" 
                strokeWidth="6" 
                stroke="#4f46e5" 
                strokeDasharray="251.2" 
                strokeDashoffset="125.6" 
              />
              <circle 
                className="animate-pulse-slow" 
                cx="50" 
                cy="50" 
                r="30" 
                fill="rgba(79, 70, 229, 0.1)" 
              />
            </svg>
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-100 to-blue-100 blur-xl opacity-30 animate-pulse-slow rounded-full"></div>
          </div>
          <h3 className="text-xl font-semibold text-gray-800 mb-1">Verifying Access</h3>
          <p className="text-gray-500 text-sm">Authenticating your credentials...</p>
          
          {/* CSS for animations */}
          <style>{`
            @keyframes pulse-slow {
              0% { transform: scale(0.95); opacity: 0.7; }
              50% { transform: scale(1); opacity: 0.3; }
              100% { transform: scale(0.95); opacity: 0.7; }
            }
            .progress-circle {
              transition: stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1);
              transform: rotate(-90deg);
              transform-origin: center;
            }
            .animate-pulse-slow {
              animation: pulse-slow 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
            }
          `}</style>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // User is not logged in, redirect will happen via MSAL
    return null;
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <div className="text-red-500 mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="mb-6 text-gray-600">
            {errorMessage || "You don't have permission to access this application. Please contact your administrator to be added to the whitelist."}
          </p>
          <button
            onClick={() => {
              // Use the same logout logic as in Header.js
              const logoutRequest = {
                account: instance.getActiveAccount(),
                postLogoutRedirectUri: window.location.origin,
                mainWindowRedirectUri: window.location.origin,
                onRedirectNavigate: () => false
              };
              localStorage.clear();
              sessionStorage.clear();
              instance.logoutRedirect(logoutRequest);
            }}
            className="px-4 py-2 bg-gray-200 rounded-md text-gray-700 hover:bg-gray-300 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return children;
};

export default ProtectedRoute;
