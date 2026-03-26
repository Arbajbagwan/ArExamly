import React, { useState, useEffect, useCallback, useRef } from 'react';

const Timer = ({ duration, onTimeUp, startTime, serverNow, expiresAt }) => {
  const syncedServerMsRef = useRef(0);
  const syncedPerfMsRef = useRef(0);
  const hasTimedOutRef = useRef(false);

  useEffect(() => {
    const parsed = new Date(serverNow).getTime();
    syncedServerMsRef.current = Number.isFinite(parsed) ? parsed : Date.now();
    syncedPerfMsRef.current = performance.now();
  }, [serverNow]);

  const getServerNowMs = useCallback(() => {
    if (!syncedServerMsRef.current) return Date.now();
    return syncedServerMsRef.current + (performance.now() - syncedPerfMsRef.current);
  }, []);

  const getRemainingTime = useCallback(() => {
    const expiryMs = new Date(expiresAt).getTime();
    if (!Number.isFinite(expiryMs)) {
      const elapsed = Math.floor((getServerNowMs() - new Date(startTime)) / 1000);
      const remaining = (duration * 60) - elapsed;
      return remaining > 0 ? remaining : 0;
    }

    const remaining = Math.floor((expiryMs - getServerNowMs()) / 1000);
    return remaining > 0 ? remaining : 0;
  }, [duration, startTime, expiresAt, getServerNowMs]);

  const [timeLeft, setTimeLeft] = useState(getRemainingTime);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(() => {
        const remaining = getRemainingTime();
        if (remaining <= 0) {
          clearInterval(timer);
          if (!hasTimedOutRef.current) {
            hasTimedOutRef.current = true;
            onTimeUp();
          }
          return 0;
        }
        return remaining;
      });
    }, 1000);

    if (getRemainingTime() <= 0) {
      clearInterval(timer);
      if (!hasTimedOutRef.current) {
        hasTimedOutRef.current = true;
        onTimeUp();
      }
    }

    return () => clearInterval(timer);
  }, [getRemainingTime, onTimeUp]);

  const hours = Math.floor(timeLeft / 3600);
  const minutes = Math.floor((timeLeft % 3600) / 60);
  const seconds = timeLeft % 60;

  const getColorClass = () => {
    if (timeLeft > duration * 60 * 0.5) return 'text-green-600';
    if (timeLeft > duration * 60 * 0.25) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className={`text-2xl font-bold ${getColorClass()}`}>
      {hours > 0 && `${hours}:`}
      {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
    </div>
  );
};

export default Timer;
