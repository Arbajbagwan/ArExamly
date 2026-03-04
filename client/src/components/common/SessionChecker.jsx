import { useEffect, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { authService } from '../../services/authService';

const parseMs = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const INITIAL_DELAY_MS = parseMs(import.meta.env.VITE_SESSION_INITIAL_DELAY_MS, 1500);
const EXAM_POLL_MS = parseMs(import.meta.env.VITE_SESSION_POLL_EXAM_MS, 30000);
const IDLE_POLL_MS = parseMs(import.meta.env.VITE_SESSION_POLL_IDLE_MS, 90000);
const BACKOFF_STEP_MS = parseMs(import.meta.env.VITE_SESSION_BACKOFF_STEP_MS, 10000);
const BACKOFF_MAX_MS = parseMs(import.meta.env.VITE_SESSION_BACKOFF_MAX_MS, 60000);
const MAX_FAILURES = Math.max(1, parseInt(import.meta.env.VITE_SESSION_MAX_FAILURES || '2', 10));

const SessionChecker = ({ children }) => {
    const { user, logout } = useAuth();

    const handleInvalidSession = useCallback(() => {
        // This function can be called to log out the user and show an alert.
        // It's wrapped in useCallback to be stable.
        logout();
        alert('You have logged in on another device. This session will be terminated.');
    }, [logout]);

    useEffect(() => {
        // If no user or user is not an examinee, do nothing.
        if (!user || user.role !== 'examinee') {
            return;
        }

        let timeoutId;
        let stopped = false;
        let failureCount = 0;

        const verifySession = async () => {
            if (stopped || document.visibilityState === 'hidden') {
                scheduleNext();
                return;
            }

            const sessionToken = localStorage.getItem('sessionToken');

            // If there's no session token, it's an invalid state, so log out.
            if (!sessionToken) {
                handleInvalidSession();
                return;
            }

            try {
                await authService.checkSession(sessionToken);
                // If the above line doesn't throw, the session is valid.
                failureCount = 0;
            } catch {
                // If it throws an error (like 401), the session is invalid.
                failureCount += 1;
                if (failureCount >= MAX_FAILURES) {
                    handleInvalidSession();
                    return;
                }
            }

            scheduleNext();
        };

        const getNextDelay = () => {
            const path = window.location.pathname || '';
            const isExamScreen = path.includes('/take-exam') || path.includes('/exam/');
            const baseDelay = isExamScreen ? EXAM_POLL_MS : IDLE_POLL_MS;
            const backoff = Math.min(BACKOFF_MAX_MS, failureCount * BACKOFF_STEP_MS);
            return baseDelay + backoff;
        };

        const scheduleNext = () => {
            if (stopped) return;
            clearTimeout(timeoutId);
            timeoutId = setTimeout(verifySession, getNextDelay());
        };

        const onVisibilityChange = () => {
            if (stopped) return;
            if (document.visibilityState === 'visible') {
                clearTimeout(timeoutId);
                verifySession();
            }
        };

        document.addEventListener('visibilitychange', onVisibilityChange);

        // Start with one initial check after a small delay.
        timeoutId = setTimeout(verifySession, INITIAL_DELAY_MS);

        // Cleanup function: this runs when the component unmounts or user changes.
        return () => {
            stopped = true;
            clearTimeout(timeoutId);
            document.removeEventListener('visibilitychange', onVisibilityChange);
        };
    }, [user, handleInvalidSession]);

    return children;
};

export default SessionChecker;
