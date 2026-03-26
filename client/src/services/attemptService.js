import API from './api';

export const attemptService = {
  startExam: async (examId) => {
    const { data } = await API.post(`/attempts/${examId}/start`);
    return data;
  },

  saveAnswer: async (attemptId, answer) => {
    const { data } = await API.put(`/attempts/${attemptId}/answer`, answer);
    return data;
  },

  submitExam: async (attemptId) => {
    const { data } = await API.post(`/attempts/${attemptId}/submit`);
    return data;
  },

  getMyAttempts: async () => {
    const { data } = await API.get('/attempts/my');
    return data;
  },

  getExamAttempts: async (examId) => {
    const { data } = await API.get(`/attempts/exam/${examId}`);
    return data;
  },

  deleteAttempt: async (attemptId) => {
    const { data } = await API.delete(`/attempts/${attemptId}`);
    return data;
  },

  evaluateTheory: async (attemptId, answers) => {
    const { data } = await API.put(`/attempts/${attemptId}/evaluate`, { answers });
    return data;
  },

  downloadAttemptPDF: async (attemptId) => {
    const { data } = await API.get(`/attempts/${attemptId}/pdf`, {
      responseType: 'blob',
    });
    return data;
  }
};