import { useState, useMemo, useEffect } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import Modal from '../../components/common/Modal';
import Loader from '../../components/common/Loader';
import BulkUpload from '../../components/superuser/BulkUpload';
import { useExamContext } from '../../contexts/ExamContext';
import { questionService } from '../../services/questionService';
import { passageService } from '../../services/passageService';

const Questions = () => {
  const { questions, subjects, refreshQuestions, refreshSubjects } = useExamContext();
  const [showModal, setShowModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showPassageModal, setShowPassageModal] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [passages, setPassages] = useState([]);
  const [passageForm, setPassageForm] = useState({
    title: '',
    text: '',
    topic: '',
    complexity: 'simple',
    marksLabel: ''
  });

  const loadPassages = async () => {
    try {
      const res = await passageService.getPassages();
      setPassages(res.passages || []);
    } catch {
      setPassages([]);
    }
  };

  // Filters
  const [filters, setFilters] = useState({
    subject: '',
    type: '',
    difficulty: '',
    search: ''
  });

  const filteredQuestions = useMemo(() => {
    return questions.filter(q => {
      if (filters.subject && q.subject?._id !== filters.subject) return false;
      if (filters.type && q.type !== filters.type) return false;
      if (filters.difficulty && q.difficulty !== filters.difficulty) return false;
      if (
        filters.search &&
        !`${q.question || ''} ${q.passageRef?.title || ''} ${q.passageRef?.topic || ''}`
          .toLowerCase()
          .includes(filters.search.toLowerCase())
      ) return false;
      return true;
    });
  }, [questions, filters]);

  const [formData, setFormData] = useState({
    type: 'mcq',
    question: '',
    options: ['', '', '', ''],
    correctOption: 0,
    credit: 1,
    subject: '',
    topic: 'General',
    difficulty: 'medium',
    explanation: '',
    passageRef: '',
    subQuestions: []
  });

  useEffect(() => {
    if (formData.type !== 'passage') return;
    const total = (formData.subQuestions || []).reduce((sum, sq) => sum + Number(sq.credit || 0), 0);
    if (formData.credit !== total) {
      setFormData((prev) => ({ ...prev, credit: total }));
    }
  }, [formData.type, formData.subQuestions, formData.credit]);

  useEffect(() => {
    if (!showModal) return;
    if (formData.type !== 'passage') return;
    if (passages.length > 0) return;
    loadPassages();
  }, [showModal, formData.type, passages.length]);

  const resetForm = () => {
    setFormData({
      type: 'mcq',
      question: '',
      options: ['', '', '', ''],
      correctOption: 0,
      credit: 1,
      subject: subjects.length > 0 ? subjects[0]._id : '',
      topic: 'General',
      difficulty: 'medium',
      explanation: '',
      passageRef: '',
      subQuestions: []
    });
    setEditingId(null);
  };

  const openCreateModal = () => {
    if (subjects.length === 0) {
      alert('Please create at least one subject first!');
      return;
    }
    resetForm();
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    resetForm();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormLoading(true);

    try {
      const payload = { ...formData };
      if (!payload.passageRef) payload.passageRef = null;
      if (payload.type === 'mcq') {
        payload.options = (payload.options || []).map((opt) => String(opt || '').trim()).filter(opt => opt !== '');
        if (payload.options.length < 2) {
          alert('Please provide at least 2 options for MCQ');
          setFormLoading(false);
          return;
        }
        if (payload.correctOption >= payload.options.length) {
          payload.correctOption = 0;
        }
      } else {
        delete payload.options;
        delete payload.correctOption;
      }
      if (payload.type === 'passage') {
        if (!payload.passageRef) {
          alert('Please select a passage');
          setFormLoading(false);
          return;
        }
        if (!Array.isArray(payload.subQuestions) || payload.subQuestions.length === 0) {
          alert('Please add at least one sub question');
          setFormLoading(false);
          return;
        }
      } else {
        delete payload.subQuestions;
      }

      if (editingId) {
        await questionService.updateQuestion(editingId, payload);
      } else {
        await questionService.createQuestion(payload);
      }
      closeModal();
      await Promise.all([refreshQuestions(), refreshSubjects()]);
    } catch (error) {
      alert(error.response?.data?.message || 'Operation failed');
    } finally {
      setFormLoading(false);
    }
  };

  const handleEdit = async (question) => {
    if (question.type === 'passage' && passages.length === 0) {
      await loadPassages();
    }

    const options = question.options || ['', ''];

    setFormData({
      type: question.type || 'mcq',
      question: question.question || '',
      credit: question.credit || 1,
      subject: question.subject?._id || question.subject || '',
      topic: question.topic || 'General',
      difficulty: question.difficulty || 'medium',
      options: options,
      correctOption: question.correctOption || 0,
      explanation: question.explanation || '',
      passageRef: question.passageRef?._id || '',
      subQuestions: question.subQuestions || []
    });
    setEditingId(question._id);
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this question?')) return;

    try {
      await questionService.deleteQuestion(id);
      await Promise.all([refreshQuestions(), refreshSubjects()]);
    } catch (error) {
      alert(error.response?.data?.message || 'Delete failed');
    }
  };

  const clearFilters = () => {
    setFilters({
      subject: '',
      type: '',
      difficulty: '',
      search: ''
    });
  };

  const getDifficultyColor = (difficulty) => {
    const colors = {
      easy: 'bg-green-100 text-green-700',
      medium: 'bg-yellow-100 text-yellow-700',
      hard: 'bg-red-100 text-red-700'
    };
    return colors[difficulty] || colors.medium;
  };

  const addMcqOption = () => {
    setFormData((prev) => ({
      ...prev,
      options: [...(prev.options || []), '']
    }));
  };

  const removeMcqOption = (index) => {
    setFormData((prev) => {
      const next = [...(prev.options || [])];
      if (next.length <= 2) return prev;
      next.splice(index, 1);
      let nextCorrect = prev.correctOption;
      if (prev.correctOption === index) nextCorrect = 0;
      else if (prev.correctOption > index) nextCorrect = prev.correctOption - 1;
      return {
        ...prev,
        options: next,
        correctOption: nextCorrect
      };
    });
  };

  if (!questions || !subjects) {
    return <Loader />;
  }

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-800">Questions</h1>
                <p className="text-gray-500 mt-1">Create and manage your question bank</p>
              </div>
              <div className="flex flex-wrap gap-3 mt-4 md:mt-0">
                <button
                  onClick={() => setShowBulkModal(true)}
                  className="inline-flex items-center px-4 py-2 border border-green-600 text-green-600 font-medium rounded-lg hover:bg-green-50 transition-colors"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Bulk Upload
                </button>
                <button
                  onClick={openCreateModal}
                  className="inline-flex items-center px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Add Question
                </button>
              </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
              <div className="flex flex-wrap items-center gap-4">
                {/* Search */}
                <div className="flex-1 min-w-[200px]">
                  <div className="relative">
                    <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      placeholder="Search questions..."
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                      value={filters.search}
                      onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                    />
                  </div>
                </div>

                {/* Subject Filter */}
                <select
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  value={filters.subject}
                  onChange={(e) => setFilters({ ...filters, subject: e.target.value })}
                >
                  <option value="">All Subjects</option>
                  {subjects.map((subject) => (
                    <option key={subject._id} value={subject._id}>
                      {subject.name}
                    </option>
                  ))}
                </select>

                {/* Type Filter */}
                <select
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  value={filters.type}
                  onChange={(e) => setFilters({ ...filters, type: e.target.value })}
                >
                  <option value="">All Types</option>
                  <option value="mcq">MCQ</option>
                  <option value="theory">Theory</option>
                  <option value="passage">Passage</option>
                </select>

                {/* Difficulty Filter */}
                <select
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  value={filters.difficulty}
                  onChange={(e) => setFilters({ ...filters, difficulty: e.target.value })}
                >
                  <option value="">All Difficulties</option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>

                {/* Clear Filters */}
                {(filters.subject || filters.type || filters.difficulty || filters.search) && (
                  <button
                    onClick={clearFilters}
                    className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium"
                  >
                    Clear Filters
                  </button>
                )}
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
              <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-200">
                <p className="text-sm text-gray-500">Total Questions</p>
                <p className="text-2xl font-bold text-gray-800">{filteredQuestions.length}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-200">
                <p className="text-sm text-gray-500">MCQ</p>
                <p className="text-2xl font-bold text-blue-600">
                  {filteredQuestions.filter(q => q.type === 'mcq').length}
                </p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-200">
                <p className="text-sm text-gray-500">Theory</p>
                <p className="text-2xl font-bold text-purple-600">
                  {filteredQuestions.filter(q => q.type === 'theory').length}
                </p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-200">
                <p className="text-sm text-gray-500">Passage</p>
                <p className="text-2xl font-bold text-indigo-600">
                  {filteredQuestions.filter(q => q.type === 'passage').length}
                </p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-200">
                <p className="text-sm text-gray-500">Subjects</p>
                <p className="text-2xl font-bold text-green-600">{subjects.length}</p>
              </div>
            </div>

            {/* Questions Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Question</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Subject</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Difficulty</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Credit</th>
                      <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredQuestions.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="px-6 py-12 text-center text-gray-500">
                          {subjects.length === 0
                            ? 'Create subjects first, then add questions.'
                            : 'No questions found. Create your first question.'}
                        </td>
                      </tr>
                    ) : (
                      filteredQuestions.map((question) => (
                        <tr key={question._id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4">
                            <p className="text-gray-800 max-w-md truncate">{question.question}</p>
                            {question.passageRef && (
                              <p className="text-xs text-indigo-600 mt-1 font-medium">
                                Passage-based question
                              </p>
                            )}
                            {question.topic && question.topic !== 'General' && (
                              <p className="text-xs text-gray-400 mt-1">Topic: {question.topic}</p>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-white"
                              style={{ backgroundColor: question.subject?.color || '#6B7280' }}
                            >
                              {question.subject?.name || 'Unknown'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${question.type === 'mcq' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                              }`}>
                              {question.type?.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getDifficultyColor(question.difficulty)}`}>
                              {question.difficulty}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-gray-600">{question.credit}</td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => handleEdit(question)}
                              className="text-blue-600 hover:text-blue-800 font-medium mr-4"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(question._id)}
                              className="text-red-600 hover:text-red-800 font-medium"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={closeModal}
        title={editingId ? 'Edit Question' : 'Add Question'}
        size="large"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Subject and Type Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subject *</label>
              <select
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                required
              >
                <option value="">Select Subject</option>
                {subjects.map((subject) => (
                  <option key={subject._id} value={subject._id}>
                    {subject.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
              <select
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              >
                <option value="mcq">Multiple Choice (MCQ)</option>
                <option value="theory">Theory</option>
                <option value="passage">Passage</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Difficulty</label>
              <select
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                value={formData.difficulty}
                onChange={(e) => setFormData({ ...formData, difficulty: e.target.value })}
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
          </div>

          {/* Topic and Credit Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Topic/Chapter</label>
              <input
                type="text"
                placeholder="e.g., Algebra, Chapter 1"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                value={formData.topic}
                onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Credit (Marks) {formData.type === 'passage' ? '(Auto from sub-questions)' : '*'}
              </label>
              <input
                type="number"
                min="1"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                value={formData.credit}
                onChange={(e) => setFormData({ ...formData, credit: Number(e.target.value) })}
                disabled={formData.type === 'passage'}
                required
              />
            </div>
          </div>

          {/* Question */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {formData.type === 'passage' ? 'Passage Question Title/Instruction *' : 'Question *'}
            </label>
            <textarea
              placeholder={formData.type === 'passage' ? 'e.g., Read the passage and answer all sub-questions.' : 'Enter your question here...'}
              rows="3"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
              value={formData.question}
              onChange={(e) => setFormData({ ...formData, question: e.target.value })}
              required
            />
          </div>

          {/* MCQ Options */}
          {formData.type === 'mcq' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Options * <span className="text-gray-400 font-normal">(Select the correct answer)</span>
              </label>
              <div className="space-y-3">
                {formData.options.map((option, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="correctOption"
                      className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                      checked={formData.correctOption === index}
                      onChange={() => setFormData({ ...formData, correctOption: index })}
                    />
                    <input
                      type="text"
                      placeholder={`Option ${index + 1}`}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                      value={option}
                      onChange={(e) => {
                        const newOptions = [...formData.options];
                        newOptions[index] = e.target.value;
                        setFormData({ ...formData, options: newOptions });
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => removeMcqOption(index)}
                      disabled={formData.options.length <= 2}
                      className="px-3 py-2 text-sm border rounded-lg text-red-600 border-red-200 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addMcqOption}
                  className="px-3 py-2 text-sm border rounded-lg text-blue-700 border-blue-200 hover:bg-blue-50"
                >
                  + Add Option
                </button>
              </div>
            </div>
          )}

          {formData.type === 'passage' && (
            <div className="space-y-3 border border-indigo-200 rounded-lg p-4 bg-indigo-50">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-gray-700">Passage *</label>
                    <button
                      type="button"
                      onClick={async () => {
                        if (passages.length === 0) await loadPassages();
                        setShowPassageModal(true);
                      }}
                      className="text-sm text-indigo-600 hover:text-indigo-800"
                    >
                      + Create Passage
                    </button>
                  </div>
                  <select
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none"
                    value={formData.passageRef}
                    onChange={(e) => setFormData({ ...formData, passageRef: e.target.value })}
                    required
                  >
                    <option value="">Select Passage</option>
                    {passages.map((p) => (
                      <option key={p._id} value={p._id}>{p.title}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    className="px-3 py-2 border rounded-lg text-indigo-700"
                    onClick={() =>
                      setFormData({
                        ...formData,
                        subQuestions: [...formData.subQuestions, { prompt: '', type: 'mcq', options: ['', '', '', ''], correctOption: 0, credit: 1 }]
                      })
                    }
                  >
                    + Add Sub Question
                  </button>
                </div>
              </div>

              {formData.subQuestions.map((sq, i) => (
                <div key={i} className="border rounded-lg p-3 bg-white">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
                    <input
                      type="text"
                      className="md:col-span-2 px-3 py-2 border rounded"
                      placeholder={`Sub Question ${i + 1}`}
                      value={sq.prompt}
                      onChange={(e) => {
                        const arr = [...formData.subQuestions];
                        arr[i].prompt = e.target.value;
                        setFormData({ ...formData, subQuestions: arr });
                      }}
                    />
                    <select
                      className="px-3 py-2 border rounded"
                      value={sq.type}
                      onChange={(e) => {
                        const arr = [...formData.subQuestions];
                        arr[i].type = e.target.value;
                        if (e.target.value === 'theory') {
                          arr[i].options = [];
                          arr[i].correctOption = undefined;
                        } else if (!arr[i].options || arr[i].options.length < 2) {
                          arr[i].options = ['', '', '', ''];
                          arr[i].correctOption = 0;
                        }
                        setFormData({ ...formData, subQuestions: arr });
                      }}
                    >
                      <option value="mcq">MCQ</option>
                      <option value="theory">Theory</option>
                    </select>
                  </div>
                  <div className="flex gap-2 items-center mb-2">
                    <input
                      type="number"
                      min="1"
                      className="w-28 px-3 py-2 border rounded"
                      value={sq.credit}
                      onChange={(e) => {
                        const arr = [...formData.subQuestions];
                        arr[i].credit = Number(e.target.value || 1);
                        setFormData({ ...formData, subQuestions: arr });
                      }}
                    />
                    <button
                      type="button"
                      className="text-red-600 text-sm"
                      onClick={() => {
                        const arr = formData.subQuestions.filter((_, idx) => idx !== i);
                        setFormData({ ...formData, subQuestions: arr });
                      }}
                    >
                      Remove
                    </button>
                  </div>
                  {sq.type === 'mcq' && (
                    <div className="space-y-2">
                      {(sq.options || []).map((opt, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input
                            type="radio"
                            checked={sq.correctOption === idx}
                            onChange={() => {
                              const arr = [...formData.subQuestions];
                              arr[i].correctOption = idx;
                              setFormData({ ...formData, subQuestions: arr });
                            }}
                          />
                          <input
                            type="text"
                            className="flex-1 px-3 py-2 border rounded"
                            placeholder={`Option ${idx + 1}`}
                            value={opt}
                            onChange={(e) => {
                              const arr = [...formData.subQuestions];
                              arr[i].options[idx] = e.target.value;
                              setFormData({ ...formData, subQuestions: arr });
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Explanation */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Explanation (Optional)</label>
            <textarea
              placeholder="Explain the answer..."
              rows="2"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
              value={formData.explanation}
              onChange={(e) => setFormData({ ...formData, explanation: e.target.value })}
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={closeModal}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={formLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-blue-400 flex items-center"
            >
              {formLoading && (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
              )}
              {editingId ? 'Update Question' : 'Create Question'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Bulk Upload Modal */}
      <Modal
        isOpen={showBulkModal}
        onClose={() => setShowBulkModal(false)}
        title="Bulk Upload Questions"
      >
        <BulkUpload
          type="questions"
          subjects={subjects}
          onSuccess={() => {
            Promise.all([refreshQuestions(), refreshSubjects()]);
          }}
        />
      </Modal>

      <Modal
        isOpen={showPassageModal}
        onClose={() => setShowPassageModal(false)}
        title="Create Passage"
      >
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const res = await passageService.createPassage(passageForm);
              setPassages((prev) => [res.passage, ...prev]);
              setFormData((prev) => ({ ...prev, passageRef: res.passage._id }));
              setPassageForm({ title: '', text: '', topic: '', complexity: 'simple', marksLabel: '' });
              setShowPassageModal(false);
            } catch (err) {
              alert(err.response?.data?.message || 'Failed to create passage');
            }
          }}
        >
          <input className="w-full px-3 py-2 border rounded-lg" placeholder="Title" value={passageForm.title} onChange={(e) => setPassageForm({ ...passageForm, title: e.target.value })} required />
          <input className="w-full px-3 py-2 border rounded-lg" placeholder="Topic" value={passageForm.topic} onChange={(e) => setPassageForm({ ...passageForm, topic: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <select className="w-full px-3 py-2 border rounded-lg" value={passageForm.complexity} onChange={(e) => setPassageForm({ ...passageForm, complexity: e.target.value })}>
              <option value="simple">Simple</option>
              <option value="moderate">Moderate</option>
              <option value="complex">Complex</option>
            </select>
            <input className="w-full px-3 py-2 border rounded-lg" placeholder="Marks label" value={passageForm.marksLabel} onChange={(e) => setPassageForm({ ...passageForm, marksLabel: e.target.value })} />
          </div>
          <textarea className="w-full px-3 py-2 border rounded-lg" rows="7" placeholder="Passage text" value={passageForm.text} onChange={(e) => setPassageForm({ ...passageForm, text: e.target.value })} required />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowPassageModal(false)} className="px-4 py-2 border rounded-lg">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg">Save Passage</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Questions;
