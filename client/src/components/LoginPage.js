import React, { useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { loginRequest } from '../authConfig';

const LoginPage = () => {
  const { instance } = useMsal();
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLogin = () => {
    setIsLoggingIn(true);
    
    // Force account selection by creating a custom request
    const customRequest = {
      ...loginRequest,
      prompt: 'select_account', // Force Microsoft to show account selection screen
    };
    
    console.log('Starting login redirect with request:', customRequest);
    
    // Use redirect flow with the custom request
    instance.loginRedirect(customRequest)
      .catch(error => {
        console.error('Login redirect error:', error);
        setIsLoggingIn(false);
        if (process.env.NODE_ENV === 'development') {
          alert('Login failed: ' + (error.message || 'Unknown error'));
        }
      });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="relative w-full max-w-md p-8 bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Background design elements */}
        <div className="absolute -right-16 -top-16 w-40 h-40 bg-indigo-50 rounded-full opacity-80"></div>
        <div className="absolute -left-16 -bottom-16 w-40 h-40 bg-indigo-50 rounded-full opacity-80"></div>
        
        {/* Logo */}
        <div className="relative text-center">
          <div className="flex justify-center mb-6">
            <div className="relative">
              <svg width="80" height="80" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="animate-float">
                <path d="M20 5L35 30H5L20 5Z" fill="rgba(0,0,0,0.03)" stroke="#111827" strokeWidth="1.5" />
                <circle cx="20" cy="25" r="10" fill="rgba(0,0,0,0.03)" stroke="#111827" strokeWidth="1.5" />
              </svg>
              <div className="absolute inset-0 bg-gradient-to-r from-gray-200 to-indigo-100 blur-xl opacity-30 animate-pulse-slow rounded-full"></div>
            </div>
          </div>
          
          <h2 className="text-3xl font-bold text-gray-900 tracking-tight">ZentroQ</h2>
          <p className="mt-1 text-gray-500 text-sm tracking-wide">INVENTORY MANAGEMENT SYSTEM</p>
          <div className="mt-8 bg-gray-50 p-5 rounded-lg border border-gray-100">
            <p className="text-base text-gray-700">
              Please sign in with your Microsoft Entra ID account to access the inventory management system.
            </p>
          </div>
        </div>
        
        {/* Sign in button */}
        <div className="mt-8 relative">
          <button
            onClick={handleLogin}
            disabled={isLoggingIn}
            className={`w-full flex items-center justify-center py-3 px-4 text-base font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 shadow-md hover:shadow-lg
              ${isLoggingIn 
                ? 'bg-gray-100 cursor-not-allowed text-gray-500' 
                : 'bg-white text-gray-800 hover:bg-gray-50 border border-gray-200'}`}
          >
            {isLoggingIn ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Signing in...
              </>
            ) : (
              <>
                {/* Microsoft logo */}
                <svg className="w-5 h-5 mr-2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 23 23">
                  <path fill="#f25022" d="M1 1h10v10H1z"/>
                  <path fill="#00a4ef" d="M1 12h10v10H1z"/>
                  <path fill="#7fba00" d="M12 1h10v10H12z"/>
                  <path fill="#ffb900" d="M12 12h10v10H12z"/>
                </svg>
                Sign in with Microsoft
              </>
            )}
          </button>
        </div>
        
        {/* Footer text */}
        <div className="mt-10 text-center text-xs text-gray-500">
          <p>
            Only authorized users will be able to access this application.
          </p>
        </div>
        
        {/* Animation keyframes */}
        <style jsx>{`
          @keyframes float {
            0% { transform: translateY(0px); }
            50% { transform: translateY(-8px); }
            100% { transform: translateY(0px); }
          }
          .animate-float {
            animation: float 6s ease-in-out infinite;
          }
          .animate-pulse-slow {
            animation: pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
          }
        `}</style>
      </div>
    </div>
  );
};

export default LoginPage;
