import { useEffect, useState, useRef } from "react";

const ProctoringWrapper = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const pendingViolations = useRef([]);

  const showToast = (message) => {
    const id = Date.now();

    setToasts((prev) => [...prev, { id, message }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  };

  useEffect(() => {

    const handleVisibilityChange = () => {
      if (document.hidden) {
        pendingViolations.current.push("Switched tab");
      } else {
        // Show warnings when user returns
        pendingViolations.current.forEach((msg) => {
          showToast(`⚠️ ${msg}`);
        });

        pendingViolations.current = [];
      }
    };

    const blockCopy = (e) => {
      e.preventDefault();
      showToast("⚠️ Copy blocked");
    };

    const blockPaste = (e) => {
      e.preventDefault();
      showToast("⚠️ Paste blocked");
    };

    const blockCut = (e) => {
      e.preventDefault();
      showToast("⚠️ Cut blocked");
    };

    const blockContextMenu = (e) => {
      e.preventDefault();
      showToast("⚠️ Right click blocked");
    };

    const handleKeyDown = (e) => {
      if (e.key === "F12") {
        e.preventDefault();
        showToast("⚠️ Developer tools blocked");
      }

      if (e.ctrlKey && e.shiftKey && ["I", "J", "C"].includes(e.key)) {
        e.preventDefault();
        showToast("⚠️ Developer tools blocked");
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("copy", blockCopy);
    document.addEventListener("paste", blockPaste);
    document.addEventListener("cut", blockCut);
    document.addEventListener("contextmenu", blockContextMenu);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("copy", blockCopy);
      document.removeEventListener("paste", blockPaste);
      document.removeEventListener("cut", blockCut);
      document.removeEventListener("contextmenu", blockContextMenu);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <>
      {children}

      <div className="toast toast-top toast-center z-[9999]">
        {toasts.map((toast) => (
          <div key={toast.id} className="alert alert-error">
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </>
  );
};

export default ProctoringWrapper;