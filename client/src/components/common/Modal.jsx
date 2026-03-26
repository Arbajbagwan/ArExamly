import React from 'react';

const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'medium',
  backdropZ = 'z-40',
  modalZ = 'z-50'
}) => {
  if (!isOpen) return null;

  const sizeClasses = {
    small: 'max-w-md',
    medium: 'max-w-2xl',
    large: 'max-w-4xl',
    full: 'max-w-7xl'
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className={`fixed inset-0 bg-black/50 ${backdropZ}`}
        onClick={onClose}
      ></div>
      
      {/* Modal */}
      <div className={`fixed inset-0 ${modalZ} flex items-center justify-center p-4`}>
        <div className={`bg-base-100 rounded-lg shadow-xl w-full ${sizeClasses[size]} max-h-[90vh] overflow-y-auto`}>
          {/* Header */}
          <div className="flex justify-between items-center p-2 border-b border-base-300">
            <h3 className="font-bold text-lg">{title}</h3>
            <button 
              onClick={onClose} 
              className="btn btn-sm btn-circle btn-ghost"
            >
              ✕
            </button>
          </div>
          
          {/* Body */}
          <div className="p-2">
            {children}
          </div>
        </div>
      </div>
    </>
  );
};

export default Modal;
