/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useState, useEffect } from 'react';
import { useCallback } from 'react';
import API from '../services/api';
import { authService } from '../services/authService';
import { useAlert } from './AlertContext';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const { showAlert } = useAlert();
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem('user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const { data } = await API.get('/auth/me');
      setUser(data.user);
    } catch {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('sessionToken');
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    const onStorage = (e) => {
      if (['token', 'user', 'sessionToken'].includes(e.key || '')) {
        checkAuth();
      }
    };

    window.addEventListener('storage', onStorage);

    return () => {
      window.removeEventListener('storage', onStorage);
    };
  }, [checkAuth]);

  const login = async (username, password) => {
    const { data } = await API.post('/auth/login', { username, password });
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    // Store sessionToken for examinees
    if (data.user.role === 'examinee' && data.sessionToken) {
      localStorage.setItem('sessionToken', data.sessionToken);
    }
    setUser(data.user);
    if (data.message) {
      await showAlert(data.message);
    }
    return data.user;
  };

  const logout = async () => {
    try {
      if (localStorage.getItem('token')) {
        await authService.logout();
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('sessionToken');
      setUser(null);
    }
  };

  const value = {
    user,
    loading,
    login,
    logout,
    checkAuth
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
