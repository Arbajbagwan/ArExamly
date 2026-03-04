// frontend/src/components/examinee/ProctoringWrapper.jsx
import { useEffect, useState } from 'react';

const ProctoringWrapper = ({ children, onViolation }) => {
  const [violations, setViolations] = useState([]);

  useEffect(() => {
    // Fullscreen enforcement
    const enterFullscreen = () => {
      document.documentElement.requestFullscreen();
    };
    
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        logViolation('Exited fullscreen');
      }
    };

    // Tab visibility detection
    const handleVisibilityChange = () => {
      if (document.hidden) {
        logViolation('Switched tab');
      }
    };

    // Copy prevention
    const handleCopy = (e) => {
      e.preventDefault();
      logViolation('Attempted to copy');
    };

    const logViolation = (type) => {
      const violation = {
        type,
        timestamp: new Date()
      };
      setViolations(prev => [...prev, violation]);
      onViolation(violation);
    };

    enterFullscreen();
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('copy', handleCopy);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('copy', handleCopy);
    };
  }, [onViolation]);

  return (
    <>
      {violations.length > 0 && (
        <div className="fixed top-0 left-0 right-0 bg-red-500 text-white p-2 text-center z-50">
          ⚠️ Warning: {violations.length} violation(s) detected
        </div>
      )}
      {children}
    </>
  );
};

export default ProctoringWrapper;
