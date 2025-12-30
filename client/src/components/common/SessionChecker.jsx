import { useEffect, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { authService } from '../../services/authService';

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

        let intervalId;

        const verifySession = async () => {
            const sessionToken = localStorage.getItem('sessionToken');

            // If there's no session token, it's an invalid state, so log out.
            if (!sessionToken) {
                handleInvalidSession();
                return;
            }

            try {
                await authService.checkSession(sessionToken);
                // If the above line doesn't throw, the session is valid.
            } catch (error) {
                // If it throws an error (like 401), the session is invalid.
                handleInvalidSession();
            }
        };

        // Start checking after a small delay to avoid race conditions on login.
        const initialCheck = setTimeout(() => {
            verifySession();
            // After the initial check, start the interval.
            intervalId = setInterval(verifySession, 15000); // 15 seconds
        }, 1500); // 1.5 second delay for safety

        // Cleanup function: this runs when the component unmounts or user changes.
        return () => {
            clearTimeout(initialCheck);
            clearInterval(intervalId);
        };
    }, [user, handleInvalidSession]);

    return children;
};

export default SessionChecker;