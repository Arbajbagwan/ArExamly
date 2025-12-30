import React, { useState, useEffect } from 'react';

const Timer = ({ duration, onTimeUp, startTime }) => {
  const [timeLeft, setTimeLeft] = useState(duration * 60); // Convert to seconds

  useEffect(() => {
    // Calculate actual time left based on start time
    const elapsed = Math.floor((Date.now() - new Date(startTime)) / 1000);
    const remaining = (duration * 60) - elapsed;
    setTimeLeft(remaining > 0 ? remaining : 0);
  }, [duration, startTime]);

  useEffect(() => {
    if (timeLeft <= 0) {
      onTimeUp();
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          onTimeUp();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, onTimeUp]);

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