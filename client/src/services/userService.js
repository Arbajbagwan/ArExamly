import API from './api';

export const userService = {
  getUsers: async () => {
    const { data } = await API.get('/users');
    return data;
  },

  getUser: async (id) => {
    const { data } = await API.get(`/users/${id}`);
    return data;
  },

  createUser: async (userData) => {
    const { data } = await API.post('/auth/register', userData);
    return data;
  },

  updateUser: async (id, userData) => {
    const { data } = await API.put(`/users/${id}`, userData);
    return data;
  },

  deleteUser: async (id) => {
    const { data } = await API.delete(`/users/${id}`);
    return data;
  },

  bulkDeleteUsers: async (userIds) => {
    const { data } = await API.post('/users/bulk-delete', { userIds });
    return data;
  },

  bulkActivateUsers: async (userIds) => {
    const { data } = await API.post('/users/bulk-activate', { userIds });
    return data;
  },

  bulkUpload: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await API.post('/users/bulk-upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return data;
  },

  resetPassword: async (id, newPassword) => {
    const { data } = await API.put(`/users/${id}/reset-password`, { newPassword });
    return data;
  }
};