import API from './api';

export const questionService = {
  getQuestions: async (filters = {}) => {
    const { data } = await API.get('/questions', { params: filters });
    return data;
  },

  getQuestion: async (id) => {
    const { data } = await API.get(`/questions/${id}`);
    return data;
  },

  createQuestion: async (questionData) => {
    const { data } = await API.post('/questions', questionData);
    return data;
  },

  updateQuestion: async (id, questionData) => {
    const { data } = await API.put(`/questions/${id}`, questionData);
    return data;
  },

  deleteQuestion: async (id) => {
    const { data } = await API.delete(`/questions/${id}`);
    return data;
  },

  bulkDeleteQuestions: async (questionIds) => {
    const { data } = await API.post('/questions/bulk-delete', { questionIds });
    return data;
  },

  bulkActivateQuestions: async (questionIds) => {
    const { data } = await API.post('/questions/bulk-activate', { questionIds });
    return data;
  },

  bulkUpload: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await API.post('/questions/bulk-upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return data;
  }
};
