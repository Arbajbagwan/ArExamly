import API from './api';

export const authService = {
  login: async (username, password) => {
    const { data } = await API.post('/auth/login', { username, password });
    return data;
  },

  logout: async () => {
    await API.post('/auth/logout');
  },

  getMe: async () => {
    const { data } = await API.get('/auth/me');
    return data;
  },

  changePassword: async (currentPassword, newPassword) => {
    const { data } = await API.put('/auth/change-password', {
      currentPassword,
      newPassword
    });
    return data;
  },

  checkSession: async (sessionToken) => {
    const { data } = await API.post('/auth/check-session', { sessionToken });
    return data;
  }
};