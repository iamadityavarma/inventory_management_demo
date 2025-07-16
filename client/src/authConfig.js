// Configuration for Microsoft Authentication Library (MSAL)
export const msalConfig = {
  auth: {
    clientId: "fe2ac4aa-14a5-425a-9f9b-8bbcd2401720", // DHU Inventory App Client ID
    authority: "https://login.microsoftonline.com/6dd289b3-24f2-4b19-9a3c-a02e4948c5a5", // DHU Tenant ID
    redirectUri: window.location.origin,
    // Support both production and development environments
    // Local: http://localhost:3000/
    // Production: https://inventory-client-web-h2fbacephnhbeaet.eastus-01.azurewebsites.net/
  },
  cache: {
    cacheLocation: "sessionStorage",
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (!containsPii) console.log(message);
      },
      logLevel: "Info" // Enable detailed logging for debugging
    }
  }
};

// Add here the scopes to request when obtaining an access token
export const loginRequest = {
  scopes: ["User.Read", "email", "profile", "openid"], // Explicitly request email and profile information
};

// Add here the endpoints for your API services
export const apiConfig = {
  inventoryApi: {
    uri: process.env.REACT_APP_API_URL || "http://localhost:8000",
    scopes: [`${process.env.REACT_APP_BACKEND_APP_ID_URI || "api://f92abfc2-18b5-4fcf-a8db-3362ea282643"}/access_as_user`],
  },
};

// Define the Azure AD app roles that are allowed to access this application
export const allowedRoles = [
  "Inventory.Admin",   // Full access to all features
  "Inventory.User",    // Standard access to inventory management
  "Inventory.ReadOnly" // View-only access to inventory data
];
