import API from './api';

export const passageService = {
  getPassages: async () => {
    const { data } = await API.get('/passages');
    return data;
  },
  createPassage: async (payload) => {
    const { data } = await API.post('/passages', payload);
    return data;
  }
};
