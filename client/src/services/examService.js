import API from './api';

export const examService = {
  getExams: async () => {
    const { data } = await API.get('/exams');
    return data;
  },

  getExam: async (id) => {
    const { data } = await API.get(`/exams/${id}`);
    return data;
  },

  createExam: async (examData) => {
    const { data } = await API.post('/exams', examData);
    return data;
  },

  updateExam: async (id, examData) => {
    const { data } = await API.put(`/exams/${id}`, examData);
    return data;
  },

  deleteExam: async (id) => {
    const { data } = await API.delete(`/exams/${id}`);
    return data;
  },

  assignQuestions: async (examId, questionIds) => {
    const { data } = await API.post(`/exams/${examId}/questions`, { questionIds });
    return data;
  },

  generateRandomQuestions: async (examId, payload) => {
    const { data } = await API.post(`/exams/${examId}/generate-questions`, payload);
    return data;
  },

  assignExaminees: async (examId, examineeIds) => {
    const { data } = await API.post(`/exams/${examId}/assign`, { examineeIds });
    return data;
  }
};