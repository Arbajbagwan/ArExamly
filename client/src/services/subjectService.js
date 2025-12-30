import API from './api';

export const subjectService = {
  getSubjects: async () => {
    const { data } = await API.get('/subjects');
    return data;
  },

  getSubject: async (id) => {
    const { data } = await API.get(`/subjects/${id}`);
    return data;
  },

  createSubject: async (subjectData) => {
    const { data } = await API.post('/subjects', subjectData);
    return data;
  },

  updateSubject: async (id, subjectData) => {
    const { data } = await API.put(`/subjects/${id}`, subjectData);
    return data;
  },

  deleteSubject: async (id) => {
    const { data } = await API.delete(`/subjects/${id}`);
    return data;
  },

  getSubjectQuestions: async (id) => {
    const { data } = await API.get(`/subjects/${id}/questions`);
    return data;
  }
};