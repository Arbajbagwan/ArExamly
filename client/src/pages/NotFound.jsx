import React from 'react';
import { useNavigate } from 'react-router-dom';

const NotFound = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
        <p className="text-8xl font-bold text-blue-600 mb-4">404</p>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Page Not Found</h1>
        <p className="text-gray-500 mb-6">The page you're looking for doesn't exist.</p>
        <button
          onClick={() => navigate('/')}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Go Home
        </button>
      </div>
    </div>
  );
};

export default NotFound;