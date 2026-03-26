import API from './api';

export const passageService = {
  getPassages: async () => {
    const { data } = await API.get('/passages');
    return data;
  },
  
  createPassage: async (payload) => {
    const { data } = await API.post('/passages', payload);
    return data;
  },

  updatePassage: async (id, payload) => {
    const { data } = await API.put(`/passages/${id}`, payload);
    return data;
  },

  deletePassage: async (id) => {
    const { data } = await API.delete(`/passages/${id}`);
    return data;
  }
};
