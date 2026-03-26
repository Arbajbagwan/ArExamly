import React from 'react';
import { useNavigate } from 'react-router-dom';

const Unauthorized = () => {
  const navigate = useNavigate();
  const appBase = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
  const loginPath = `${appBase || ''}/login`;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <span className="text-3xl">🚫</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Access Denied</h1>
        <p className="text-gray-500 mb-6">You don't have permission to access this page.</p>
        <button
          onClick={() => navigate(loginPath, { replace: true })}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Go to Login
        </button>
      </div>
    </div>
  );
};

export default Unauthorized;
