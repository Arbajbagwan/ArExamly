import React from 'react';

const Loader = ({ text = 'Loading...' }) => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100">
      <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
      {text && <p className="mt-4 text-gray-600">{text}</p>}
    </div>
  );
};

export default Loader;