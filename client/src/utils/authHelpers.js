import { msalConfig, apiConfig } from '../authConfig';

/**
 * Acquires an access token for the API using the MSAL instance
 * @param {object} instance - The MSAL instance
 * @returns {Promise<string>} The access token or null if there's an error
 */
export const getApiAccessToken = async (instance) => {
  try {
    // Get the active account
    const account = instance.getActiveAccount();
    if (!account) {
      console.error("No active account found");
      return null;
    }

    // Request token silently first to avoid popups if possible
    const request = {
      scopes: apiConfig.inventoryApi.scopes,
      account: account
    };

    console.log("Requesting API access token with scopes:", request.scopes);
    
    // Get token silently
    const response = await instance.acquireTokenSilent(request);
    
    if (response.accessToken) {
      console.log("Acquired API access token successfully");
      return response.accessToken;
    } else {
      console.error("No access token returned");
      return null;
    }
  } catch (error) {
    console.error("Token acquisition failed:", error);
    
    // Handle interaction required errors
    if (error.name === "InteractionRequiredAuthError") {
      // Fall back to redirect for interaction
      console.log("Interaction required, redirecting to login");
      await instance.acquireTokenRedirect({
        scopes: apiConfig.inventoryApi.scopes
      });
      return null;
    }
    
    return null;
  }
};

/**
 * Creates auth headers with bearer token for API requests
 * @param {string} accessToken - The access token
 * @returns {object} Headers object with Authorization
 */
export const createAuthHeaders = (accessToken) => {
  if (!accessToken) {
    return {};
  }
  
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  };
};

/**
 * Makes an authenticated API call
 * @param {string} url - The API endpoint URL
 * @param {object} options - Fetch options (method, body, etc.)
 * @param {object} instance - The MSAL instance
 * @returns {Promise<object>} The API response
 */
export const callProtectedApi = async (url, options = {}, instance) => {
  try {
    // Get access token
    const accessToken = await getApiAccessToken(instance);
    
    if (!accessToken) {
      throw new Error("Failed to acquire access token");
    }
    
    // Create headers with token
    const authHeaders = createAuthHeaders(accessToken);
    
    // Make the API call
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        ...authHeaders
      }
    });
    
    if (!response.ok) {
      // Handle different error status codes
      if (response.status === 401) {
        // Unauthorized - token invalid or expired
        console.error("Authentication token expired or invalid");
        
        // Try to refresh the token
        const newToken = await getApiAccessToken(instance);
        if (newToken) {
          // Retry the request with the new token
          const newAuthHeaders = createAuthHeaders(newToken);
          const retryResponse = await fetch(url, {
            ...options,
            headers: {
              ...options.headers,
              ...newAuthHeaders
            }
          });
          
          if (retryResponse.ok) {
            return await retryResponse.json();
          } else {
            throw new Error(`API retry failed: ${retryResponse.status} ${retryResponse.statusText}`);
          }
        } else {
          // Clear auth state and redirect to login
          localStorage.removeItem('userRole');
          localStorage.removeItem('userProfile');
          window.location.reload();
          throw new Error("Authentication failed, redirecting to login");
        }
      } else if (response.status === 403) {
        // Forbidden - user doesn't have permission
        throw new Error("You don't have permission to access this resource");
      } else {
        // Other errors
        throw new Error(`API call failed: ${response.status} ${response.statusText}`);
      }
    }
    
    return await response.json();
  } catch (error) {
    console.error("Protected API call failed:", error);
    throw error;
  }
};

/**
 * Validates a token with the backend server
 * @param {string} accessToken - The access token to validate
 * @param {string} apiUrl - The API base URL 
 * @returns {Promise<object>} The validation result
 */
export const validateTokenWithBackend = async (accessToken, apiUrl) => {
  try {
    if (!accessToken) {
      return { valid: false, error: "No token provided" };
    }
    
    const headers = createAuthHeaders(accessToken);
    
    const response = await fetch(`${apiUrl}/auth/validate-token`, {
      method: 'POST',
      headers
    });
    
    return await response.json();
  } catch (error) {
    console.error("Token validation failed:", error);
    return { valid: false, error: error.message };
  }
};

/**
 * Gets the user's highest priority role from localStorage
 * @returns {string} The user's role or null if not found
 */
export const getUserRole = () => {
  return localStorage.getItem('userRole') || null;
};

/**
 * Checks if the user has a specific role
 * @param {string} requiredRole - The role to check for
 * @returns {boolean} True if the user has the required role
 */
export const hasRole = (requiredRole) => {
  const userRole = getUserRole();
  
  if (!userRole) {
    return false;
  }
  
  // Handle role hierarchy: Admin > User > ReadOnly
  if (requiredRole === 'Inventory.ReadOnly') {
    // If any role is required, any role will do
    return true;
  } else if (requiredRole === 'Inventory.User') {
    // Only User or Admin roles will do
    return userRole === 'Inventory.User' || userRole === 'Inventory.Admin';
  } else if (requiredRole === 'Inventory.Admin') {
    // Only Admin role will do
    return userRole === 'Inventory.Admin';
  }
  
  return false;
};

/**
 * Saves user information to local storage 
 * @param {object} user - User information to save
 */
export const saveUserInfo = (user) => {
  if (user && user.role) {
    localStorage.setItem('userRole', user.role);
  }
  
  if (user) {
    localStorage.setItem('userProfile', JSON.stringify({
      email: user.email || '',
      name: user.name || '',
      lastLogin: new Date().toISOString()
    }));
  }
};

/**
 * Gets user profile information from localStorage
 * @returns {object} The user profile or null if not found
 */
export const getUserProfile = () => {
  const profile = localStorage.getItem('userProfile');
  return profile ? JSON.parse(profile) : null;
};

