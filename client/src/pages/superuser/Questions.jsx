import { useState, useMemo, useEffect } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import Modal from '../../components/common/Modal';
import Loader from '../../components/common/Loader';
import BulkUpload from '../../components/superuser/BulkUpload';
import { useExamContext } from '../../contexts/ExamContext';
import { questionService } from '../../services/questionService';
import { passageService } from '../../services/passageService';
import { ReactQuill, Quill, katex } from '../../utils/quillSetup';
import 'react-quill-new/dist/quill.snow.css';

const Questions = () => {
  const { subjects, questions, isReady, refreshQuestions, refreshSubjects } = useExamContext();
  const [showModal, setShowModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showPassageModal, setShowPassageModal] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingPassageId, setEditingPassageId] = useState(null);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState([]);
  const [passages, setPassages] = useState([]);
  const [passageForm, setPassageForm] = useState({
    title: '',
    text: '',
    topic: '',
    complexity: 'simple',
    marksLabel: ''
  });

  const stripHtml = (html) => {
    const raw = String(html || '');
    if (typeof window !== 'undefined' && typeof window.DOMParser !== 'undefined') {
      const doc = new window.DOMParser().parseFromString(raw, 'text/html');
      return (doc.body.textContent || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    }
    return raw.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  };

  const isEditorEmpty = (html) => {
    const raw = String(html || '');

    // allow image-only content
    if (raw.includes('<img')) return false;
    if (raw.includes('ql-formula') || raw.includes('katex')) return false;
    return stripHtml(raw).length === 0;
  };

  const quillModules = {
    toolbar: [
      [{ header: [1, 2, false] }],
      ['bold', 'italic', 'underline'],
      [{ list: 'ordered' }, { list: 'bullet' }],
      ['link', 'image', 'formula'],
      ['clean']
    ],
  };

  const quillFormats = [
    'header',
    'bold',
    'italic',
    'underline',
    'list',
    'link',
    'image',
    'formula'
  ];

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

  const resetPassageForm = () => {
    setEditingPassageId(null);
    setPassageForm({
      title: '',
      text: '',
      topic: '',
      complexity: 'simple',
      marksLabel: ''
    });
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
      if (isEditorEmpty(formData.question)) {
        alert('Question is required');
        setFormLoading(false);
        return;
      }
      const payload = { ...formData };
      if (!payload.passageRef) payload.passageRef = null;
      if (payload.type === 'mcq') {
        payload.options = (payload.options || []).map((opt) => String(opt || '')).filter((opt) => !isEditorEmpty(opt));
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
        const normalizedSubQuestions = [];
        for (const sq of payload.subQuestions) {
          const normalized = {
            ...sq,
            prompt: String(sq.prompt || '').trim(),
            credit: Number(sq.credit || 0)
          };
          if (!normalized.prompt) {
            alert('Sub question text is required');
            setFormLoading(false);
            return;
          }
          if (normalized.type === 'mcq') {
            const raw = Array.isArray(sq.options) ? sq.options : [];
            const cleaned = raw.filter((opt) => !isEditorEmpty(opt));
            if (cleaned.length < 2) {
              alert('Each passage MCQ sub question must have at least 2 options');
              setFormLoading(false);
              return;
            }
            normalized.options = cleaned;
            const co = Number(sq.correctOption || 0);
            normalized.correctOption = co >= 0 && co < cleaned.length ? co : 0;
          } else {
            normalized.options = [];
            delete normalized.correctOption;
          }
          normalizedSubQuestions.push(normalized);
        }
        payload.subQuestions = normalizedSubQuestions;
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
      setSelectedQuestionIds((prev) => prev.filter((qid) => qid !== id));
    } catch (error) {
      alert(error.response?.data?.message || 'Delete failed');
    }
  };

  const handleBulkDeactivate = async () => {
    if (selectedQuestionIds.length === 0) return;
    if (!window.confirm(`Deactivate ${selectedQuestionIds.length} questions?`)) return;
    try {
      await questionService.bulkDeleteQuestions(selectedQuestionIds);
      setSelectedQuestionIds([]);
      await Promise.all([refreshQuestions(), refreshSubjects()]);
    } catch (error) {
      alert(error.response?.data?.message || 'Bulk deactivate failed');
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

  const addPassageMcqOption = (subIndex) => {
    setFormData((prev) => {
      const arr = [...(prev.subQuestions || [])];
      arr[subIndex] = arr[subIndex] || {};
      arr[subIndex].options = [...(arr[subIndex].options || []), ''];
      if (typeof arr[subIndex].correctOption !== 'number') arr[subIndex].correctOption = 0;
      return { ...prev, subQuestions: arr };
    });
  };

  const removePassageMcqOption = (subIndex, optionIndex) => {
    setFormData((prev) => {
      const arr = [...(prev.subQuestions || [])];
      const sq = { ...(arr[subIndex] || {}) };
      const opts = [...(sq.options || [])];
      if (opts.length <= 2) return prev;
      opts.splice(optionIndex, 1);
      let nextCorrect = Number.isInteger(sq.correctOption) ? sq.correctOption : 0;
      if (nextCorrect === optionIndex) nextCorrect = 0;
      else if (nextCorrect > optionIndex) nextCorrect -= 1;
      sq.options = opts;
      sq.correctOption = nextCorrect;
      arr[subIndex] = sq;
      return { ...prev, subQuestions: arr };
    });
  };

  const [expandedQuestions, setExpandedQuestions] = useState({})

  const toggleQuestion = (id) => {
    setExpandedQuestions(prev => ({
      ...prev,
      [id]: !prev[id]
    }))
  }

  const htmlToText = (html = "") => stripHtml(html);

  const selectedQuestionObjects = filteredQuestions.filter((q) => selectedQuestionIds.includes(q._id));
  const hasActiveSelected = selectedQuestionObjects.some((q) => q.isActive);

  if (!isReady) return <Loader />;

  if (!subjects) {
    return <Loader />;
  }

  return (
    <div className="flex flex-col h-screen bg-base-200">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden p-3">
          <div className="flex flex-col flex-1 min-h-0">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4">
              <div>
                <h1 className="text-2xl font-bold">Questions</h1>
                <p className="text-base-content/70 mt-1">Create and manage your question bank</p>
              </div>
              <div className="flex flex-wrap gap-3 mt-4 md:mt-0">
                <button
                  onClick={() => setShowBulkModal(true)}
                  className="btn btn-outline btn-success"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Upload Questions
                </button>
                <button
                  onClick={openCreateModal}
                  className="btn btn-primary"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Add Question
                </button>
              </div>
            </div>

            {/* Filters */}
            <div className="bg-base-100 border border-base-300 rounded px-2 py-2 mb-2">

              <div className="grid grid-cols-2 md:grid-cols-6 gap-2">

                <input
                  type="text"
                  placeholder="Search..."
                  className="input input-bordered input-xs w-full"
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                />

                <select
                  className="select select-bordered select-xs w-full"
                  value={filters.subject}
                  onChange={(e) => setFilters({ ...filters, subject: e.target.value })}
                >
                  <option value="">Subject</option>
                  {subjects.map((subject) => (
                    <option key={subject._id} value={subject._id}>
                      {subject.name}
                    </option>
                  ))}
                </select>

                <select
                  className="select select-bordered select-xs w-full"
                  value={filters.type}
                  onChange={(e) => setFilters({ ...filters, type: e.target.value })}
                >
                  <option value="">Type</option>
                  <option value="mcq">MCQ</option>
                  <option value="theory">Theory</option>
                  <option value="passage">Passage</option>
                </select>

                <select
                  className="select select-bordered select-xs w-full"
                  value={filters.difficulty}
                  onChange={(e) => setFilters({ ...filters, difficulty: e.target.value })}
                >
                  <option value="">Difficulty</option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>

                <div className="col-span-2 flex gap-1">
                  {selectedQuestionIds.length > 0 && hasActiveSelected && (
                    <button
                      onClick={handleBulkDeactivate}
                      className="btn btn-error btn-xs flex-1 text-white"
                    >
                      Deactivate
                    </button>
                  )}
                  <button
                    onClick={clearFilters}
                    className="btn btn-ghost btn-xs flex-1"
                  >
                    Clear
                  </button>
                </div>

              </div>

            </div>

            {/* Stats */}
            <div className="grid grid-cols-5 gap-2 mb-2 text-xs">

              <div className="bg-base-100 border border-base-300 rounded p-2 text-center">
                <p className="text-base-content/60">Total</p>
                <p className="font-semibold">{filteredQuestions.length}</p>
              </div>

              <div className="bg-base-100 border border-base-300 rounded p-2 text-center">
                <p className="text-base-content/60">MCQ</p>
                <p className="font-semibold text-primary">
                  {filteredQuestions.filter(q => q.type === 'mcq').length}
                </p>
              </div>

              <div className="bg-base-100 border border-base-300 rounded p-2 text-center">
                <p className="text-base-content/60">Theory</p>
                <p className="font-semibold text-secondary">
                  {filteredQuestions.filter(q => q.type === 'theory').length}
                </p>
              </div>

              <div className="bg-base-100 border border-base-300 rounded p-2 text-center">
                <p className="text-base-content/60">Passage</p>
                <p className="font-semibold text-info">
                  {filteredQuestions.filter(q => q.type === 'passage').length}
                </p>
              </div>

              <div className="bg-base-100 border border-base-300 rounded p-2 text-center">
                <p className="text-base-content/60">Subjects</p>
                <p className="font-semibold text-success">{subjects.length}</p>
              </div>

            </div>

            {/* Questions Table */}
            <div className="bg-base-100 border border-base-300 rounded flex flex-col flex-1 overflow-hidden">
              <div className="flex-1 overflow-auto">
                <table className="table table-xs table-zebra table-fixed">
                  <thead className="bg-base-200 sticky top-0 z-10">
                    <tr>
                      <th className="w-[4%]">
                        <input
                          type="checkbox"
                          className="checkbox checkbox-sm"
                          checked={filteredQuestions.length > 0 && selectedQuestionIds.length === filteredQuestions.length}
                          onChange={(e) =>
                            setSelectedQuestionIds(e.target.checked ? filteredQuestions.map((q) => q._id) : [])
                          }
                        />
                      </th>
                      <th className="w-[38%] text-left text-xs font-semibold uppercase tracking-wider">Question</th>
                      <th className="w-[14%] text-left text-xs font-semibold uppercase tracking-wider">Subject</th>
                      <th className="w-[9%] text-left text-xs font-semibold uppercase tracking-wider">Type</th>
                      <th className="w-[9%] text-left text-xs font-semibold uppercase tracking-wider">Difficulty</th>
                      <th className="w-[8%] text-left text-xs font-semibold uppercase tracking-wider">Credit</th>
                      <th className="w-[8%] text-left text-xs font-semibold uppercase tracking-wider">Status</th>
                      <th className="w-[10%] text-right text-xs font-semibold uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredQuestions.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="py-12 text-center text-base-content/70">
                          {subjects.length === 0
                            ? 'Create subjects first, then add questions.'
                            : 'No questions found. Create your first question.'}
                        </td>
                      </tr>
                    ) : (
                      filteredQuestions.map((question) => (
                        <tr key={question._id} className="hover">
                          <td className="w-[4%] align-top">
                            <input
                              type="checkbox"
                              className="checkbox checkbox-sm"
                              checked={selectedQuestionIds.includes(question._id)}
                              onChange={() =>
                                setSelectedQuestionIds((prev) =>
                                  prev.includes(question._id)
                                    ? prev.filter((id) => id !== question._id)
                                    : [...prev, question._id]
                                )
                              }
                            />
                          </td>
                          <td className="w-[38%] align-top">

                            <div className="max-w-full text-xs break-words whitespace-normal">

                              <div
                                className={`exam-image ${expandedQuestions[question._id] ? "" : "line-clamp-2"
                                  }`}
                                dangerouslySetInnerHTML={{ __html: question.question }}
                              />

                              {htmlToText(question.question).length > 120 && (
                                <button
                                  onClick={() => toggleQuestion(question._id)}
                                  className="text-primary text-[11px] mt-1"
                                >
                                  {expandedQuestions[question._id] ? "See less" : "See more"}
                                </button>
                              )}

                            </div>

                          </td>
                          <td className="w-[14%] align-top">
                            <span
                              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-white"
                              style={{ backgroundColor: question.subject?.color || '#6B7280' }}
                            >
                              {question.subject?.name || 'Unknown'}
                            </span>
                          </td>
                          <td className="w-[9%] align-top">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${question.type === 'mcq' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                              }`}>
                              {question.type?.toUpperCase()}
                            </span>
                          </td>
                          <td className="w-[9%] align-top">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getDifficultyColor(question.difficulty)}`}>
                              {question.difficulty}
                            </span>
                          </td>
                          <td className="w-[8%] align-top text-base-content/70">{question.credit}</td>
                          <td className="w-[8%] align-top">
                            <span className={`badge badge-xs ${question.isActive ? 'badge-success' : 'badge-error'}`}>
                              {question.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="w-[10%] align-top">
                            <div className="flex justify-end whitespace-nowrap">
                              <button
                                onClick={() => handleEdit(question)}
                                className="btn btn-ghost btn-xs text-info"
                              >
                                Edit
                              </button>

                              {question.isActive && (
                                <button
                                  onClick={() => handleDelete(question._id)}
                                  className="btn btn-ghost btn-xs text-error"
                                >
                                  Delete
                                </button>
                              )}
                            </div>
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
          <div className="grid grid-cols-3 gap-2">

            <div>
              <label className="text-[11px] text-base-content/70">Subject<span className="text-error">*</span></label>
              <select
                className="select select-bordered select-xs w-full h-8 mt-0.5"
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
              <label className="text-[11px] text-base-content/70">Type<span className="text-error">*</span></label>
              <select
                className="select select-bordered select-xs w-full h-8 mt-0.5"
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              >
                <option value="mcq">MCQ</option>
                <option value="theory">Theory</option>
                <option value="passage">Passage</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] text-base-content/70">Difficulty</label>
              <select
                className="select select-bordered select-xs w-full h-8 mt-0.5"
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
          <div className="grid grid-cols-2 gap-2">

            <div>
              <label className="text-[11px] text-base-content/70">Topic</label>
              <input
                type="text"
                placeholder="e.g. Algebra"
                className="input input-bordered input-xs w-full h-8 mt-0.5"
                value={formData.topic}
                onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
              />
            </div>

            <div>
              <label className="text-[11px] text-base-content/70">
                Credit{formData.type === 'passage' ? '(auto)' : <span className="text-error">*</span>}
              </label>
              <input
                type="number"
                min="1"
                className="input input-bordered input-xs w-full h-8 mt-0.5"
                value={formData.credit}
                onChange={(e) => setFormData({ ...formData, credit: Number(e.target.value) })}
                disabled={formData.type === 'passage'}
                required
              />
            </div>
          </div>

          {/* Question */}
          <div>
            <label className="text-[11px] text-base-content/70">
              {formData.type === 'passage' ? "Passage Instruction" : "Question"}
              <span className="text-error">*</span>
            </label>
            <div className="quill-modal-scope rounded-lg border border-base-300 bg-base-100">
              <ReactQuill
                theme="snow"
                value={formData.question}
                onChange={(value) => setFormData({ ...formData, question: value })}
                modules={quillModules}
                formats={quillFormats}
                bounds=".quill-modal-scope"
                placeholder={formData.type === 'passage' ? 'e.g., Read the passage and answer all sub-questions.' : 'Enter your question here...'}
              />
            </div>
          </div>

          {/* MCQ Options */}
          {formData.type === 'mcq' && (
            <div>
              <label className="text-[11px] text-base-content/70">
                Options<span className="text-error">*</span> <span className="text-gray-400 font-normal">(Select the correct answer)</span>
              </label>
              <div className="space-y-3">
                {formData.options.map((option, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="correctOption"
                      className="radio radio-sm radio-primary mt-4"
                      checked={formData.correctOption === index}
                      onChange={() => setFormData({ ...formData, correctOption: index })}
                    />
                    <div className="quill-modal-scope flex-1 rounded-lg border border-base-300 bg-base-100">
                      <ReactQuill
                        theme="snow"
                        value={option}
                        onChange={(value) => {
                          const newOptions = [...formData.options];
                          newOptions[index] = value;
                          setFormData({ ...formData, options: newOptions });
                        }}
                        modules={quillModules}
                        formats={quillFormats}
                        bounds=".quill-modal-scope"
                        placeholder={`Option ${index + 1}`}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeMcqOption(index)}
                      disabled={formData.options.length <= 2}
                      className="btn btn-outline btn-error btn-sm disabled:opacity-40 mt-1"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addMcqOption}
                  className="btn btn-outline btn-primary btn-sm"
                >
                  + Add Option
                </button>
              </div>
            </div>
          )}

          {/* {Passage} */}
          {formData.type === 'passage' && (
            <div className="space-y-2 border border-info/30 rounded-lg p-3 bg-info/10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] text-base-content/70">Passage<span className="text-error">*</span></label>
                    <button
                      type="button"
                      onClick={async () => {
                        if (passages.length === 0) await loadPassages();
                        resetPassageForm();
                        setShowPassageModal(true);
                      }}
                      className="text-[11px] link link-primary"
                    >
                      + Create Passage
                    </button>
                  </div>
                  <div className="dropdown w-full">
                    {/* The Trigger (looks like a select box) */}
                    <div
                      tabIndex={0}
                      role="button"
                      className="select select-bordered select-xs w-full h-8 flex items-center justify-between"
                    >
                      {passages.find(p => p._id === formData.passageRef)?.title || "Select Passage"}
                    </div>

                    {/* The Menu Content */}
                    <ul
                      tabIndex={0}
                      className="dropdown-content z-[1] menu p-1 shadow bg-base-100 rounded-box w-full max-h-60 overflow-y-auto border"
                    >
                      {passages.map((p) => (
                        <li key={p._id} className="border-b last:border-0">
                          <div className="flex items-center justify-between py-1 text-xs">
                            {/* Clicking the title selects it */}
                            <span
                              className="flex-grow cursor-pointer hover:text-primary"
                              onClick={() => setFormData({ ...formData, passageRef: p._id })}
                            >
                              {p.title}
                            </span>

                            {/* Action Buttons */}
                            <div className="flex gap-1">
                              <button
                                type="button"
                                className="btn btn-xs btn-ghost text-info"
                                onClick={(e) => {
                                  e.stopPropagation(); // Prevents selecting the item when clicking Edit
                                  setPassageForm(p);
                                  setEditingPassageId(p._id);
                                  setShowPassageModal(true);
                                }}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="btn btn-xs btn-ghost text-error"
                                onClick={async (e) => {
                                  e.stopPropagation(); // Prevents selecting the item when clicking Delete
                                  if (!window.confirm("Delete passage?")) return;
                                  await passageService.deletePassage(p._id);
                                  setPassages(prev => prev.filter(x => x._id !== p._id));
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </li>
                      ))}
                      {passages.length === 0 && <li className="p-2 text-center opacity-50">No passages found</li>}
                    </ul>
                  </div>
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    className="btn btn-outline btn-primary btn-sm"
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
                <div key={i} className="border border-base-300 rounded-lg p-3 bg-base-100">
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-2 mb-2 items-center">
                    <input
                      type="text"
                      className="md:col-span-7 input input-bordered"
                      placeholder={`Sub Question ${i + 1}`}
                      value={sq.prompt}
                      onChange={(e) => {
                        const arr = [...formData.subQuestions];
                        arr[i].prompt = e.target.value;
                        setFormData({ ...formData, subQuestions: arr });
                      }}
                    />
                    <select
                      className="md:col-span-3 select select-bordered"
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
                    <input
                      type="number"
                      min="1"
                      className="md:col-span-1 input input-bordered"
                      value={sq.credit}
                      onChange={(e) => {
                        const arr = [...formData.subQuestions];
                        arr[i].credit = Number(e.target.value || 1);
                        setFormData({ ...formData, subQuestions: arr });
                      }}
                    />
                    <button
                      type="button"
                      className="md:col-span-1 btn btn-ghost btn-xs text-error justify-start md:justify-center"
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
                        <div key={idx} className="flex items-start gap-2">
                          <input
                            type="radio"
                            className="radio radio-sm radio-primary"
                            checked={sq.correctOption === idx}
                            onChange={() => {
                              const arr = [...formData.subQuestions];
                              arr[i].correctOption = idx;
                              setFormData({ ...formData, subQuestions: arr });
                            }}
                          />
                          <div className="quill-modal-scope flex-1 rounded-lg border border-base-300 bg-base-100">
                            <ReactQuill
                              theme="snow"
                              value={opt}
                              onChange={(value) => {
                                const arr = [...formData.subQuestions];
                                arr[i].options[idx] = value;
                                setFormData({ ...formData, subQuestions: arr });
                              }}
                              modules={quillModules}
                              formats={quillFormats}
                              bounds=".quill-modal-scope"
                              placeholder={`Option ${idx + 1}`}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => removePassageMcqOption(i, idx)}
                            disabled={(sq.options || []).length <= 2}
                            className="btn btn-outline btn-error btn-xs mt-1 disabled:opacity-40"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                      <div className="flex justify-between mt-4">
                        <button
                          type="button"
                          className="btn btn-outline btn-primary btn-xs"
                          onClick={() =>
                            setFormData({
                              ...formData,
                              subQuestions: [
                                ...formData.subQuestions,
                                {
                                  prompt: '',
                                  type: 'mcq',
                                  options: ['', '', '', ''],
                                  correctOption: 0,
                                  credit: 1
                                }
                              ]
                            })
                          }
                        >
                          + Add Sub Question
                        </button>

                        {formData.subQuestions.length > 0 &&
                          formData.subQuestions[formData.subQuestions.length - 1].type === 'mcq' && (
                            <button
                              type="button"
                              onClick={() => addPassageMcqOption(formData.subQuestions.length - 1)}
                              className="btn btn-outline btn-primary btn-xs"
                            >
                              + Add Option
                            </button>
                          )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Explanation */}
          <div>
            <label className="text-[11px] text-base-content/70">
              Explanation <span className="label-text font-medium">(Optional)</span>
            </label>
            <div className="quill-modal-scope rounded-lg border border-base-300 bg-base-100">
              <ReactQuill
                theme="snow"
                value={formData.explanation}
                onChange={(value) => setFormData({ ...formData, explanation: value })}
                modules={quillModules}
                formats={quillFormats}
                bounds=".quill-modal-scope"
                placeholder="Explain the answer..."
              />
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t border-base-300">
            <button
              type="button"
              onClick={closeModal}
              className="btn btn-ghost btn-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={formLoading}
              className="btn btn-primary btn-sm"
            >
              {formLoading && (
                <span className="loading loading-spinner loading-xs mr-2"></span>
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
        title="Upload Questions"
      >
        <BulkUpload
          type="questions"
          subjects={subjects}
          onSuccess={() => {
            setSelectedQuestionIds([]);
            Promise.all([refreshQuestions(), refreshSubjects()]);
          }}
        />
      </Modal>

      <Modal
        isOpen={showPassageModal}
        onClose={() => setShowPassageModal(false)}
        title={editingPassageId ? "Edit Passage" : "Create Passage"}
      >
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();

            if (!passageForm.title.trim()) {
              alert("Title is required");
              return;
            }

            if (isEditorEmpty(passageForm.text)) {
              alert("Passage text is required");
              return;
            }

            try {
              let res;

              if (editingPassageId) {
                res = await passageService.updatePassage(
                  editingPassageId,
                  passageForm
                );

                setPassages(prev =>
                  prev.map(p =>
                    p._id === editingPassageId ? res.passage : p
                  )
                );

              } else {

                res = await passageService.createPassage(passageForm);

                setPassages(prev => [res.passage, ...prev]);

                setFormData(prev => ({
                  ...prev,
                  passageRef: res.passage._id
                }));

              }

              resetPassageForm();
              setShowPassageModal(false);

            } catch (err) {
              alert(err.response?.data?.message || "Failed to create passage");
            }
          }}
        >

          {/* Title */}
          <div>
            <label className="text-[11px] text-base-content/70">
              Title <span className="text-error">*</span>
            </label>
            <input
              type="text"
              className="input input-bordered input-xs w-full h-8 mt-0.5"
              value={passageForm.title}
              onChange={(e) =>
                setPassageForm({ ...passageForm, title: e.target.value })
              }
            />
          </div>

          {/* Topic */}
          <div>
            <label className="text-[11px] text-base-content/70">
              Topic
            </label>
            <input
              type="text"
              className="input input-bordered input-xs w-full h-8 mt-0.5"
              value={passageForm.topic}
              onChange={(e) =>
                setPassageForm({ ...passageForm, topic: e.target.value })
              }
            />
          </div>

          {/* Complexity + Marks */}
          <div className="grid grid-cols-2 gap-2">

            <div>
              <label className="text-[11px] text-base-content/70">
                Complexity
              </label>
              <select
                className="select select-bordered select-xs w-full h-8 mt-0.5"
                value={passageForm.complexity}
                onChange={(e) =>
                  setPassageForm({ ...passageForm, complexity: e.target.value })
                }
              >
                <option value="simple">Simple</option>
                <option value="moderate">Moderate</option>
                <option value="complex">Complex</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] text-base-content/70">
                Marks Label
              </label>
              <input
                type="text"
                className="input input-bordered input-xs w-full h-8 mt-0.5"
                value={passageForm.marksLabel}
                onChange={(e) =>
                  setPassageForm({ ...passageForm, marksLabel: e.target.value })
                }
              />
            </div>

          </div>

          {/* Passage Text */}
          <div>
            <label className="text-[11px] text-base-content/70">
              Passage Text <span className="text-error">*</span>
            </label>

            <div className="quill-modal-scope rounded-lg border border-base-300 bg-base-100 mt-0.5">
              <ReactQuill
                theme="snow"
                value={passageForm.text}
                onChange={(value) =>
                  setPassageForm({ ...passageForm, text: value })
                }
                modules={quillModules}
                formats={quillFormats}
                bounds=".quill-modal-scope"
                placeholder="Passage text"
              />
            </div>
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setShowPassageModal(false);
                resetPassageForm();
              }}
              className="btn btn-ghost btn-xs"
            >
              Cancel
            </button>

            <button
              type="submit"
              className="btn btn-primary btn-xs"
            >
              Save Passage
            </button>
          </div>

        </form>
      </Modal>
    </div>
  );
};

export default Questions;
