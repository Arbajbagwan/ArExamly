import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const AlertContext = createContext(null);

export const AlertProvider = ({ children }) => {
  const [alertState, setAlertState] = useState({
    open: false,
    title: 'Notice',
    message: '',
    buttonText: 'OK'
  });

  const [resolver, setResolver] = useState(null);

  const showAlert = useCallback((message, options = {}) => {
    return new Promise((resolve) => {
      setAlertState({
        open: true,
        title: options.title || 'Notice',
        message: String(message || ''),
        buttonText: options.buttonText || 'OK'
      });
      setResolver(() => resolve);
    });
  }, []);

  const closeAlert = useCallback(() => {
    setAlertState((prev) => ({ ...prev, open: false }));
    if (resolver) {
      resolver(true);
      setResolver(null);
    }
  }, [resolver]);

  const value = useMemo(() => ({ showAlert }), [showAlert]);

  useEffect(() => {
    const nativeAlert = window.alert;
    window.alert = (message) => {
      showAlert(message);
    };

    return () => {
      window.alert = nativeAlert;
    };
  }, [showAlert]);

  return (
    <AlertContext.Provider value={value}>
      {children}

      {alertState.open && (
        <div className="modal modal-open">
          <div className="modal-box max-w-md">
            <h3 className="font-bold text-lg">{alertState.title}</h3>
            <p className="py-4 text-sm text-base-content/80 whitespace-pre-line">
              {alertState.message}
            </p>
            <div className="modal-action">
              <button type="button" className="btn btn-primary btn-sm" onClick={closeAlert}>
                {alertState.buttonText}
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={closeAlert} />
        </div>
      )}
    </AlertContext.Provider>
  );
};

export const useAlert = () => {
  const ctx = useContext(AlertContext);
  if (!ctx) {
    throw new Error('useAlert must be used within AlertProvider');
  }
  return ctx;
};
