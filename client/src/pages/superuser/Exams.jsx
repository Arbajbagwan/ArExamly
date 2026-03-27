import { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import Modal from '../../components/common/Modal';
import Loader from '../../components/common/Loader';
import { attemptService } from '../../services/attemptService';
import API from '../../services/api';
import { examService } from '../../services/examService';
import { useExamContext } from '../../contexts/ExamContext';
import { useAlert } from '../../contexts/AlertContext';
import JSZip from 'jszip';

const Exams = () => {
  const toPlainText = (html) => {
    const raw = String(html || '');
    if (typeof window !== 'undefined' && typeof window.DOMParser !== 'undefined') {
      const doc = new window.DOMParser().parseFromString(raw, 'text/html');
      return (doc.body.textContent || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    }
    return raw.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  };

  const toDateTimeLocalValue = (value) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  };

  const formatExamWindow = (exam) => {
    const start = exam.startAt ? new Date(exam.startAt) : null;
    const end = exam.endAt ? new Date(exam.endAt) : null;
    if (start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      const formatOptions = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      };
      return `${start.toLocaleString([], formatOptions)} - ${end.toLocaleString([], formatOptions)}`;
    }
    if (exam.scheduledDate) {
      return `${new Date(exam.scheduledDate).toLocaleDateString()} | ${exam.startTime} - ${exam.endTime}`;
    }
    return 'Not scheduled';
  };

  const {
    exams,
    questions,
    examinees,
    subjects,
    refreshAll,
    isReady
  } = useExamContext();

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [showQuestionsModal, setShowQuestionsModal] = useState(false);
  const [showExamineesModal, setShowExamineesModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showAutoPickModal, setShowAutoPickModal] = useState(false);
  const [showEvaluateModal, setShowEvaluateModal] = useState(false);

  const [formLoading, setFormLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [selectedExam, setSelectedExam] = useState(null);

  // Selected items for assignment
  const [selectedQuestions, setSelectedQuestions] = useState([]);
  const [selectedExaminees, setSelectedExaminees] = useState([]);
  const [questionFilter, setQuestionFilter] = useState({
    subject: '',
    type: '',
    difficulty: ''
  });
  const [examineeFilter, setExamineeFilter] = useState({
    search: '',
    status: '', // active | inactive
    sbu: '',
    group: ''
  });

  const [autoPickExam, setAutoPickExam] = useState(null);
  const [assignmentMinimumAttemptQuestions, setAssignmentMinimumAttemptQuestions] = useState(0);
  const [assignmentPassingMarks, setAssignmentPassingMarks] = useState('');
  const [autoPickForm, setAutoPickForm] = useState({
    useSplit: false,
    totalQuestions: '',
    minimumAttemptQuestions: 0,
    passingMarks: '',
    mcqCount: '',
    theoryCount: '',
    passageCount: '',
    subjectIds: [],        // array of subject _id
    difficulty: '',        // '', 'easy', 'medium', 'hard'
    topic: '',             // optional text filter
    shuffleSelectedQuestions: true,
  });

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    duration: 60,
    startAt: '',
    endAt: '',
    customInstructionsText: '',
    shuffleQuestions: false,
    shuffleOptions: false,
  });

  // Evaluation map for theory answers
  const [evaluationMap, setEvaluationMap] = useState({});
  const [evalLoading, setEvalLoading] = useState(false);
  const [evaluatingAttempt, setEvaluatingAttempt] = useState(null);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [downloadData, setDownloadData] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [downloadingSingle, setDownloadingSingle] = useState(null);

  const toInt = (v) => {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number.parseInt(String(v), 10);
    return Number.isFinite(n) ? n : null;
  };

  const clamp = (n, min, max) => Math.min(Math.max(n, min), max);
  const attemptHasTheory = (attempt) => (attempt?.answers || []).some((ans) => {
    const q = ans?.question;
    if (!q) return false;
    if (q.type === 'theory') return true;
    if (q.type === 'passage') return (q.subQuestions || []).some((sq) => sq.type === 'theory');
    return false;
  });

  // poolCounts: compute based on selected filters (subjectIds, difficulty, topic)
  const poolCounts = useMemo(() => {
    const filtered = questions.filter((q) => {
      const sid = String(q.subject?._id || q.subject || '');
      if (autoPickForm.subjectIds.length > 0 && !autoPickForm.subjectIds.includes(sid)) return false;
      if (autoPickForm.difficulty && q.difficulty !== autoPickForm.difficulty) return false;
      if (autoPickForm.topic && !toPlainText(q.question || '').toLowerCase().includes(autoPickForm.topic.toLowerCase())) return false;
      return true;
    });
    return {
      total: filtered.length,
      mcq: filtered.filter(q => q.type === 'mcq').length,
      theory: filtered.filter(q => q.type === 'theory').length,
      passage: filtered.filter(q => q.type === 'passage').length
    };
  }, [questions, autoPickForm.subjectIds, autoPickForm.difficulty, autoPickForm.topic]);

  const totalSelected = toInt(autoPickForm.totalQuestions);

  // total cannot exceed poolCounts.total (recommended)
  const maxTotalAllowed = poolCounts.total;

  // if split enabled, mcq and theory should never exceed total and pool
  const maxMcqAllowed = totalSelected ? Math.min(totalSelected, poolCounts.mcq) : poolCounts.mcq;
  const maxTheoryAllowed = totalSelected ? Math.min(totalSelected, poolCounts.theory) : poolCounts.theory;
  const maxPassageAllowed = totalSelected ? Math.min(totalSelected, poolCounts.passage) : poolCounts.passage;

  const onTotalChange = (value) => {
    const n = toInt(value);
    if (n === null) {
      setAutoPickForm((p) => ({ ...p, totalQuestions: '' }));
      return;
    }

    const clampedTotal = clamp(n, 1, maxTotalAllowed);

    setAutoPickForm((p) => {
      // If not split, just set total
      if (!p.useSplit) return { ...p, totalQuestions: clampedTotal };

      // If split: clamp all three counts to available pool/total
      const currentMcq = toInt(p.mcqCount) ?? 0;
      const currentTheory = toInt(p.theoryCount) ?? 0;
      const currentPassage = toInt(p.passageCount) ?? 0;

      const mcq = clamp(currentMcq, 0, Math.min(clampedTotal, poolCounts.mcq));
      const theory = clamp(currentTheory, 0, Math.min(clampedTotal, poolCounts.theory));
      const passage = clamp(currentPassage, 0, Math.min(clampedTotal, poolCounts.passage));

      const sum = mcq + theory + passage;
      if (sum <= clampedTotal) {
        return { ...p, totalQuestions: clampedTotal, mcqCount: mcq, theoryCount: theory, passageCount: passage };
      }
      // Reduce passage first, then theory, then mcq
      let overflow = sum - clampedTotal;
      let newPassage = passage;
      let newTheory = theory;
      let newMcq = mcq;
      const cutPassage = Math.min(newPassage, overflow);
      newPassage -= cutPassage;
      overflow -= cutPassage;
      if (overflow > 0) {
        const cutTheory = Math.min(newTheory, overflow);
        newTheory -= cutTheory;
        overflow -= cutTheory;
      }
      if (overflow > 0) newMcq = Math.max(0, newMcq - overflow);
      return { ...p, totalQuestions: clampedTotal, mcqCount: newMcq, theoryCount: newTheory, passageCount: newPassage };
    });
  };

  const onMcqChange = (v) => {
    if (!autoPickForm.useSplit) return;

    updateSplitTotal(v, autoPickForm.theoryCount, autoPickForm.passageCount);
  };

  const openAutoPickModal = (exam) => {
    const mode = getPickMode(exam);

    if (mode === 'custom') {
      alert(
        'This exam is in Custom mode.\n\nRemove assigned questions before using Auto Pick.'
      );
      return;
    }

    setAutoPickExam(exam);

    const rc = exam.randomConfig || {};

    const normalizedSubjectIds = Array.isArray(rc.subjectIds)
      ? rc.subjectIds.map((x) => String(x?._id ?? x))
      : [];

    // Decide split based on existing config (or keep previous choice)
    const splitFromConfig = (Number(rc.mcqCount || 0) + Number(rc.theoryCount || 0) + Number(rc.passageCount || 0)) > 0;

    setAutoPickForm({
      useSplit: splitFromConfig,
      totalQuestions: rc.totalQuestions ?? '',
      minimumAttemptQuestions: exam.minimumAttemptQuestions || 0,
      passingMarks: exam.passingMarks || '',
      mcqCount: rc.mcqCount ?? '',
      theoryCount: rc.theoryCount ?? '',
      passageCount: rc.passageCount ?? '',
      subjectIds: normalizedSubjectIds,
      difficulty: rc.difficulty ?? '',
      topic: rc.topic ?? '',
      shuffleSelectedQuestions: rc.shuffleSelectedQuestions ?? true,
    });

    setShowAutoPickModal(true);
  };

  const closeAutoPickModal = () => {
    setShowAutoPickModal(false);
    setAutoPickExam(null);
  };

  const toggleSubject = (subjectId) => {
    const id = String(subjectId);

    setAutoPickForm((prev) => ({
      ...prev,
      subjectIds: prev.subjectIds.includes(id)
        ? prev.subjectIds.filter((x) => x !== id)
        : [...prev.subjectIds, id],
    }));
  };

  const submitAutoPick = async () => {
    if (!autoPickExam?._id) return;

    const total = toInt(autoPickForm.totalQuestions);
    if (!total || total < 1) {
      alert('Total Questions must be >= 1');
      return;
    }

    const minimumAttemptQuestions = Number(autoPickForm.minimumAttemptQuestions || 0);
    const passingMarks = autoPickForm.passingMarks === '' ? 0 : Number(autoPickForm.passingMarks || 0);
    if (minimumAttemptQuestions > total) {
      alert('Minimum attempt cannot be more than total questions');
      return;
    }

    if (passingMarks < 0) {
      alert('Passing marks cannot be negative');
      return;
    }

    const useSplit = !!autoPickForm.useSplit;

    let mcq = 0;
    let theory = 0;
    let passage = 0;

    if (useSplit) {
      mcq = toInt(autoPickForm.mcqCount) ?? 0;
      theory = toInt(autoPickForm.theoryCount) ?? 0;
      passage = toInt(autoPickForm.passageCount) ?? 0;

      if (mcq + theory + passage !== total) {
        alert('MCQ + Theory + Passage must equal Total Questions');
        return;
      }
    }

    if (autoPickForm.useSplit) {
      if (mcq > poolCounts.mcq) {
        alert(`Only ${poolCounts.mcq} MCQ available in pool`);
        return;
      }

      if (theory > poolCounts.theory) {
        alert(`Only ${poolCounts.theory} Theory questions available`);
        return;
      }
      if (passage > poolCounts.passage) {
        alert(`Only ${poolCounts.passage} Passage questions available`);
        return;
      }
    }

    try {
      setFormLoading(true);

      const payload = {
        totalQuestions: total,
        mcqCount: mcq,
        theoryCount: theory,
        passageCount: passage,
        subjectIds: autoPickForm.subjectIds, // already string ids
        difficulty: autoPickForm.difficulty || undefined,
        topic: autoPickForm.topic || undefined,
        shuffleSelectedQuestions: !!autoPickForm.shuffleSelectedQuestions,
      };

      await examService.updateExam(autoPickExam._id, {
        minimumAttemptQuestions,
        passingMarks
      });
      const res = await examService.generateRandomQuestions(autoPickExam._id, payload);

      alert(res.message || 'Questions generated!');
      closeAutoPickModal();
      refreshAll();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || 'Failed to generate questions');
    } finally {
      setFormLoading(false);
    }
  };

  const getPickMode = (exam) => {
    // 🔥 CUSTOM ALWAYS WINS
    if (exam.questions && exam.questions.length > 0) {
      return 'custom';
    }

    if (exam.selectionMode === 'random') {
      const rc = exam.randomConfig || {};
      if ((rc.mcqCount || 0) + (rc.theoryCount || 0) + (rc.passageCount || 0) > 0) {
        return 'split';
      }
      return 'any';
    }

    return 'none';
  };

  const onTheoryChange = (v) => {
    if (!autoPickForm.useSplit) return;

    updateSplitTotal(autoPickForm.mcqCount, v, autoPickForm.passageCount);
  };

  const onPassageChange = (v) => {
    if (!autoPickForm.useSplit) return;

    updateSplitTotal(autoPickForm.mcqCount, autoPickForm.theoryCount, v);
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      duration: 60,
      startAt: '',
      endAt: '',
      customInstructionsText: '',
      shuffleQuestions: false,
      shuffleOptions: false,
    });
    setEditingId(null);
  };

  const openCreateModal = () => {
    resetForm();
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    resetForm();
  };

  // const handleSubmit = async (e) => {
  //   e.preventDefault();
  //   setFormLoading(true);

  //   try {
  //     if (!formData.startAt || !formData.endAt) {
  //       alert('Please provide start and end date-time');
  //       setFormLoading(false);
  //       return;
  //     }
  //     if (new Date(formData.endAt) <= new Date(formData.startAt)) {
  //       alert('End date-time must be after start date-time');
  //       setFormLoading(false);
  //       return;
  //     }

  //     const examData = new FormData();
  //     examData.append('title', formData.title || '');
  //     examData.append('description', formData.description || '');
  //     examData.append('duration', Number(formData.duration));
  //     examData.append('startAt', formData.startAt || '');
  //     examData.append('endAt', formData.endAt || '');
  //     examData.append('customInstructions', formData.customInstructionsText || '');
  //     examData.append('shuffleQuestions', String(!!formData.shuffleQuestions));
  //     examData.append('shuffleOptions', String(!!formData.shuffleOptions));

  //     if (editingId) {
  //       await examService.updateExam(editingId, examData);
  //     } else {
  //       await examService.createExam(examData);
  //     }
  //     closeModal();
  //     refreshAll();
  //   } catch (error) {
  //     alert(error.response?.data?.message || 'Operation failed');
  //   } finally {
  //     setFormLoading(false);
  //   }
  // };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormLoading(true);

    try {
      if (!formData.startAt || !formData.endAt) {
        alert('Please provide start and end date-time');
        setFormLoading(false);
        return;
      }
      if (new Date(formData.endAt) <= new Date(formData.startAt)) {
        alert('End date-time must be after start date-time');
        setFormLoading(false);
        return;
      }

      // ✅ Send a plain object — NOT FormData
      const examData = {
        title: formData.title || '',
        description: formData.description || '',
        duration: Number(formData.duration),
        startAt: formData.startAt,
        endAt: formData.endAt,
        customInstructions: formData.customInstructionsText || '',
        shuffleQuestions: !!formData.shuffleQuestions,
        shuffleOptions: !!formData.shuffleOptions,
      };

      if (editingId) {
        await examService.updateExam(editingId, examData);
      } else {
        await examService.createExam(examData);
      }
      closeModal();
      refreshAll();
    } catch (error) {
      alert(error.response?.data?.message || 'Operation failed');
    } finally {
      setFormLoading(false);
    }
  };

  const handleEdit = (exam) => {
    setFormData({
      title: exam.title || '',
      description: exam.description || '',
      duration: exam.duration || 60,
      startAt: toDateTimeLocalValue(exam.startAt || (exam.scheduledDate && exam.startTime ? `${exam.scheduledDate.split('T')[0]}T${exam.startTime}` : '')),
      endAt: toDateTimeLocalValue(exam.endAt || (exam.scheduledDate && exam.endTime ? `${exam.scheduledDate.split('T')[0]}T${exam.endTime}` : '')),
      customInstructionsText: [
        ...(exam.instructions ? String(exam.instructions).split('\n') : []),
        ...(Array.isArray(exam.customInstructions) ? exam.customInstructions : [])
      ].map((x) => String(x).trim()).filter(Boolean).join('\n'),
      shuffleQuestions: !!exam.shuffleQuestions,
      shuffleOptions: !!exam.shuffleOptions,
    });
    setEditingId(exam._id);
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this exam?')) return;

    try {
      await examService.deleteExam(id);
      refreshAll();
    } catch (error) {
      alert(error.response?.data?.message || 'Delete failed');
    }
  };

  // Open Assign Questions Modal
  const openQuestionsModal = (exam) => {
    const mode = getPickMode(exam);

    if (mode === 'any' || mode === 'split') {
      const ok = window.confirm(
        'This exam uses Auto Pick.\n\nAssigning questions will disable Auto Pick. Continue?'
      );
      if (!ok) return;
    }
    setSelectedExam(exam);
    const assignedQuestionIds = exam.questions?.map(q => q.question?._id || q.question) || [];
    setSelectedQuestions(assignedQuestionIds);
    setAssignmentMinimumAttemptQuestions(exam.minimumAttemptQuestions || 0);
    setAssignmentPassingMarks(exam.passingMarks || '');
    setQuestionFilter({ subject: '', type: '', difficulty: '' });
    setShowQuestionsModal(true);
  };

  // Open Assign Examinees Modal
  const openExamineesModal = (exam) => {
    setSelectedExam(exam);
    const assignedExamineeIds = exam.assignedTo?.map(e => e._id || e) || [];
    setSelectedExaminees(assignedExamineeIds);
    setExamineeFilter({ search: '', status: '', sbu: '', group: '' });
    setShowExamineesModal(true);
  };

  // Open View Details Modal
  const openViewModal = async (exam) => {
    try {
      // Fetch exam details + attempts in parallel
      const [{ exam: examDetails }, attemptsRes] = await Promise.all([
        examService.getExam(exam._id),
        API.get(`/attempts/exam/${exam._id}`)
      ]);

      const attempts = attemptsRes.data.attempts || [];

      /**
       * Build resultMap
       * key   → examinee._id
       * value → result + attemptId (CRITICAL)
       */
      const resultMap = {};

      attempts.forEach((attempt) => {
        if (!attempt.examinee?._id) return;

        resultMap[attempt.examinee._id] = {
          attemptId: attempt._id,              // ✅ REQUIRED for PDF
          percentage: attempt.percentage ?? 0,
          totalMarksObtained: attempt.totalMarksObtained ?? 0,
          totalMarksPossible: attempt.totalMarksPossible ?? 0,
          status: attempt.status               // evaluated | submitted
        };
      });

      // Merge exam details with resultMap
      setSelectedExam({
        ...examDetails,
        resultMap
      });
      setActiveTab("overview");

      setShowViewModal(true);
    } catch (error) {
      console.error('openViewModal error:', error);
      alert('Failed to fetch exam details');
    }
  };

  // Handle question selection
  const toggleQuestionSelection = (questionId) => {
    setSelectedQuestions(prev => {
      if (prev.includes(questionId)) {
        return prev.filter(id => id !== questionId);
      } else {
        return [...prev, questionId];
      }
    });
  };

  // Handle examinee selection
  const toggleExamineeSelection = (examineeId) => {
    setSelectedExaminees(prev => {
      if (prev.includes(examineeId)) {
        return prev.filter(id => id !== examineeId);
      } else {
        return [...prev, examineeId];
      }
    });
  };

  // Save assigned questions
  const saveAssignedQuestions = async () => {
    setFormLoading(true);
    try {
      const minimumAttemptQuestions = Number(assignmentMinimumAttemptQuestions || 0);
      const passingMarks = assignmentPassingMarks === '' ? 0 : Number(assignmentPassingMarks || 0);
      const totalAssignedMarks = questions
        .filter(q => selectedQuestions.includes(q._id))
        .reduce((sum, q) => sum + (q.credit || 0), 0);

      if (minimumAttemptQuestions > selectedQuestions.length) {
        alert('Minimum attempt cannot be more than assigned questions');
        setFormLoading(false);
        return;
      }

      if (passingMarks < 0) {
        alert('Passing marks cannot be negative');
        setFormLoading(false);
        return;
      }

      if (passingMarks > totalAssignedMarks) {
        alert('Passing marks cannot be more than total assigned marks');
        setFormLoading(false);
        return;
      }

      await examService.updateExam(selectedExam._id, {
        minimumAttemptQuestions,
        passingMarks
      });
      await examService.assignQuestions(selectedExam._id, selectedQuestions);
      alert('Questions assigned successfully!');
      setShowQuestionsModal(false);
      setQuestionFilter({ subject: '', type: '', difficulty: '' });
      refreshAll();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to assign questions');
    } finally {
      setFormLoading(false);
    }
  };

  // Save assigned examinees
  const saveAssignedExaminees = async () => {
    setFormLoading(true);
    try {
      await examService.assignExaminees(selectedExam._id, selectedExaminees);
      alert('Users assigned successfully!');
      setShowExamineesModal(false);
      refreshAll();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to assign users');
    } finally {
      setFormLoading(false);
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      draft: 'bg-gray-100 text-gray-700',
      scheduled: 'bg-blue-100 text-blue-700',
      active: 'bg-green-100 text-green-700',
      completed: 'bg-yellow-100 text-yellow-700',
      cancelled: 'bg-red-100 text-red-700'
    };
    return colors[status] || colors.draft;
  };

  const getFilteredQuestions = () => {
    return questions.filter(q => {
      if (questionFilter.subject && (q.subject?._id || q.subject) !== questionFilter.subject) return false;
      if (questionFilter.type && q.type !== questionFilter.type) return false;
      if (questionFilter.difficulty && q.difficulty !== questionFilter.difficulty) return false;
      return true;
    });
  };

  const getFilteredExaminees = () => {
    return examinees.filter((ex) => {
      // search by name or username
      const searchMatch =
        !examineeFilter.search ||
        `${ex.firstname} ${ex.lastname}`.toLowerCase().includes(examineeFilter.search.toLowerCase()) ||
        String(ex.sbu || '').toLowerCase().includes(examineeFilter.search.toLowerCase()) ||
        String(ex.group || '').toLowerCase().includes(examineeFilter.search.toLowerCase()) ||
        ex.username.toLowerCase().includes(examineeFilter.search.toLowerCase());

      // active / inactive filter
      const statusMatch =
        !examineeFilter.status ||
        (examineeFilter.status === 'active' && ex.isActive) ||
        (examineeFilter.status === 'inactive' && !ex.isActive);

      const sbuMatch =
        !examineeFilter.sbu || String(ex.sbu || '') === examineeFilter.sbu;

      const groupMatch =
        !examineeFilter.group || String(ex.group || '') === examineeFilter.group;

      return searchMatch && statusMatch && sbuMatch && groupMatch;
    });
  };
  const filteredExaminees = getFilteredExaminees();
  const sbuFilterOptions = [...new Set(examinees.map((ex) => String(ex.sbu || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const groupFilterOptions = [...new Set(examinees.map((ex) => String(ex.group || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  // Get unique subjects from questions for filter dropdown
  const getUniqueSubjects = () => {
    const subjectMap = new Map();
    questions.forEach(q => {
      if (q.subject) {
        const subjectId = q.subject._id || q.subject;
        const subjectName = q.subject.name || 'Unknown';
        const subjectColor = q.subject.color || '#6B7280';
        if (!subjectMap.has(subjectId)) {
          subjectMap.set(subjectId, { _id: subjectId, name: subjectName, color: subjectColor, count: 1 });
        } else {
          subjectMap.get(subjectId).count++;
        }
      }
    });
    return Array.from(subjectMap.values());
  };

  const downloadResults = async (examId, examTitle) => {
    try {
      const res = await API.get(`/attempts/exam/${examId}`);
      const attempts = res.data.attempts || [];

      const examRes = await API.get(`/exams/${examId}`);
      const exam = examRes.data.exam;
      setSelectedExam(exam);

      const attemptByExamineeId = new Map();
      attempts.forEach((attempt) => {
        const id = String(attempt?.examinee?._id || '');
        if (!id) return;
        const existing = attemptByExamineeId.get(id);
        if (!existing) {
          attemptByExamineeId.set(id, attempt);
          return;
        }
        const existingTime = new Date(existing.submittedAt || existing.updatedAt || 0).getTime();
        const currentTime = new Date(attempt.submittedAt || attempt.updatedAt || 0).getTime();
        if (currentTime >= existingTime) {
          attemptByExamineeId.set(id, attempt);
        }
      });

      const assigned = Array.isArray(exam.assignedTo) ? exam.assignedTo : [];
      const attemptsForTable = assigned.map((examinee) => {
        const id = String(examinee?._id || '');
        const matchedAttempt = attemptByExamineeId.get(id);
        if (matchedAttempt) return matchedAttempt;
        return {
          _id: null,
          status: 'not_attempted',
          totalMarksObtained: 0,
          totalMarksPossible: exam.totalMarks || 0,
          percentage: 0,
          submittedAt: null,
          examinee: {
            _id: examinee._id,
            firstname: examinee.firstname,
            lastname: examinee.lastname,
            username: examinee.username
          }
        };
      });

      const safeTitle = examTitle.replace(/[^a-zA-Z0-9]/g, '_');

      setDownloadData({
        exam,
        attempts: attemptsForTable,
        safeTitle
      });

      setShowDownloadModal(true);

    } catch (err) {
      console.error(err);
      alert('Failed to fetch results.');
    }
  };

  const generateExcel = (exam, attempts, safeTitle) => {
    const isPass = (attempt) => {
      const configuredPassingMarks = Number(exam?.passingMarks || 0);
      if (configuredPassingMarks > 0) {
        return Number(attempt?.totalMarksObtained || 0) >= configuredPassingMarks;
      }
      return Number(attempt?.percentage || 0) >= 40;
    };

    const data = attempts.map((attempt, index) => ({
      'S.No': index + 1,
      'Name': `${attempt.examinee?.firstname || ''} ${attempt.examinee?.lastname || ''}`.trim() || '-',
      'Username': attempt.examinee?.username || '-',
      'Marks Obtained': attempt.totalMarksObtained || 0,
      'Total Marks': exam.totalMarks || 100,
      'Percentage': (attempt.status === 'not_attempted' || attempt.status === 'in-progress' || attempt.status === 'submitted' || (attempt.status === 'auto-submitted' && attemptHasTheory(attempt)))
        ? '-'
        : attempt.percentage
            ? attempt.percentage.toFixed(2) + '%'
            : '0%',
      'Status': attempt.status === 'not_attempted'
        ? 'NOT ATTEMPTED'
        : attempt.status === 'in-progress'
          ? 'IN PROGRESS'
          : (attempt.status === 'submitted' || (attempt.status === 'auto-submitted' && attemptHasTheory(attempt)))
          ? 'EVALUATION PENDING'
          : isPass(attempt)
            ? 'PASS'
            : 'FAIL',
      'Time Taken (min)': attempt.timeSpent ? Math.floor(attempt.timeSpent / 60) : 0,
      'Submitted At': attempt.submittedAt ? new Date(attempt.submittedAt).toLocaleString() : '-'
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Results');

    // Auto-size columns
    ws['!cols'] = [
      { wch: 6 }, { wch: 25 }, { wch: 15 }, { wch: 14 },
      { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 22 }
    ];

    XLSX.writeFile(wb, `${safeTitle}_Results.xlsx`);
  };

  const generatePDF = async (exam, attempts, safeTitle) => {
    try {
      const isPass = (attempt) => {
        const configuredPassingMarks = Number(exam?.passingMarks || 0);
        if (configuredPassingMarks > 0) {
          return Number(attempt?.totalMarksObtained || 0) >= configuredPassingMarks;
        }
        return Number(attempt?.percentage || 0) >= 40;
      };

      // Import jsPDF and autoTable dynamically
      const jsPDF = (await import('jspdf')).default;
      const autoTable = (await import('jspdf-autotable')).default;

      // Create instance
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      // Title
      doc.setFontSize(22);
      doc.setTextColor(59, 130, 246);
      doc.text(exam.title, 14, 25);

      doc.setFontSize(11);
      doc.setTextColor(100);
      doc.text(`Total Students: ${attempts.length} | Total Marks: ${exam.totalMarks || 100}`, 14, 35);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 42);

      // Table data
      const rows = attempts.map((a, i) => [
        i + 1,
        `${a.examinee?.firstname || ''} ${a.examinee?.lastname || ''}`.trim() || '-',
        a.examinee?.username || '-',
        a.totalMarksObtained || 0,
        exam.totalMarks || 100,
        (a.status === 'not_attempted' || a.status === 'in-progress' || a.status === 'submitted' || a.status === 'auto-submitted')
          ? '-'
          : a.percentage
              ? a.percentage.toFixed(1) + '%'
              : '0%',
        a.status === 'not_attempted'
          ? 'NOT ATTEMPTED'
          : a.status === 'in-progress'
            ? 'IN PROGRESS'
          : (a.status === 'submitted' || a.status === 'auto-submitted')
            ? 'EVALUATION PENDING'
            : isPass(a)
              ? 'PASS'
              : 'FAIL',
        a.timeSpent ? Math.floor(a.timeSpent / 60) + ' min' : '-',
        a.submittedAt ? new Date(a.submittedAt).toLocaleDateString() : '-'
      ]);

      // Apply autoTable correctly
      autoTable(doc, {
        head: [['#', 'Name', 'Username', 'Obtained', 'Total', 'Percentage', 'Status', 'Time', 'Date']],
        body: rows,
        startY: 50,
        theme: 'grid',
        headStyles: { fillColor: [59, 130, 246], textColor: 255, fontSize: 11 },
        styles: { fontSize: 10 },
        alternateRowStyles: { fillColor: [248, 250, 252] }
      });

      // Summary
      const pass = attempts.filter((a) => isPass(a)).length;
      doc.setFontSize(12);
      doc.text(`Pass: ${pass} | Fail: ${attempts.length - pass}`, 14, doc.lastAutoTable.finalY + 15);

      doc.save(`${safeTitle}_Results.pdf`);
    } catch (err) {
      console.error('PDF Error:', err);
      alert('Failed to generate PDF. Please try again.');
    }
  };

  const handleDownloadPDF = async (attemptId, username, examTitle) => {
    try {
      setDownloadingSingle(attemptId);

      const res = await API.get(`/attempts/${attemptId}/pdf`, {
        responseType: "blob"
      });

      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `${username}_${examTitle}_result.pdf`.replace(/\s+/g, "_");
      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert("Failed to download PDF");
      console.error(err);
    } finally {
      setDownloadingSingle(null);
    }
  };

  const openEvaluateModal = async (attemptId) => {
    try {
      const res = await API.get(`/attempts/exam/${selectedExam._id}`);
      const attempt = res.data.attempts.find(a => a._id === attemptId);

      if (!attempt) {
        alert('Attempt not found');
        return;
      }

      setEvaluatingAttempt(attempt);
      setEvaluationMap({}); // reset previous
      setShowEvaluateModal(true);
    } catch (err) {
      console.error(err);
      alert('Failed to load attempt');
    }
  };

  const closeEvaluateModal = () => {
    setShowEvaluateModal(false);
    setEvaluatingAttempt(null);
    setEvaluationMap({});
  };

  const updateEvaluation = (questionId, data) => {
    const key = data.subQuestionId ? `${questionId}:${data.subQuestionId}` : questionId;
    setEvaluationMap((prev) => ({
      ...prev,
      [key]: {
        questionId,
        ...(prev[key] || {}),
        ...data
      }
    }));
  };

  const handleDownloadAllPDFs = async () => {
    if (!downloadData?.attempts?.length) return;

    try {
      setDownloadingAll(true);

      const evaluated = (downloadData.attempts || []).filter(
        (attempt) => attempt.status === "evaluated" && attempt._id
      );

      if (evaluated.length === 0) {
        alert("No evaluated attempts available for PDF download.");
        return;
      }

      const zip = new JSZip();

      for (const attempt of evaluated) {
        const username = attempt.examinee?.username || "examinee";

        const res = await API.get(`/attempts/${attempt._id}/pdf`, {
          responseType: "blob"
        });

        const filename = `${username}_${downloadData.exam?.title || "exam"}_result.pdf`.replace(/\s+/g, "_");

        zip.file(filename, res.data);
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });

      const url = window.URL.createObjectURL(zipBlob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `${downloadData.exam?.title || "exam"}_results_pdfs.zip`.replace(/\s+/g, "_");

      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert("Failed to download PDFs");
    } finally {
      setDownloadingAll(false);
    }
  };

  const hasEvaluatedAttempts = (resultMap) => {
    return Object.values(resultMap || {}).some(
      (r) => r.status === "evaluated"
    );
  };

  const submitEvaluation = async () => {
    try {
      setEvalLoading(true);

      const answers = Object.values(evaluationMap);

      if (answers.length === 0) {
        alert('Please evaluate at least one question');
        return;
      }

      for (const ans of answers) {
        if (ans.marksObtained < 0) {
          alert("Marks cannot be negative");
          return;
        }

        if (ans.marksObtained > 100) {
          alert("Marks exceed allowed limit");
          return;
        }
      }

      const confirmed = window.confirm(
        "After evaluation submission, you cannot change the marks.\n\nDo you want to continue?"
      );

      if (!confirmed) return;

      setEvalLoading(true);

      await attemptService.evaluateTheory(
        evaluatingAttempt._id,
        answers
      );

      alert('Theory answers evaluated successfully');

      closeEvaluateModal();

      // Refresh exam view
      openViewModal(selectedExam);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || 'Evaluation failed');
    } finally {
      setEvalLoading(false);
    }
  };

  const updateSplitTotal = (mcq, theory, passage) => {
    const total =
      (Number(mcq) || 0) +
      (Number(theory) || 0) +
      (Number(passage) || 0);

    setAutoPickForm((p) => ({
      ...p,
      mcqCount: mcq,
      theoryCount: theory,
      passageCount: passage,
      totalQuestions: total
    }));
  };

  const [expandedRows, setExpandedRows] = useState({});

  const toggleExpand = (key) => {
    setExpandedRows((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleReappear = async (attemptId, examineeId) => {

    const confirmed = window.confirm(
      "This will delete the attempt and allow the user to reappear. Continue?"
    );

    if (!confirmed) return;

    try {

      await attemptService.deleteAttempt(attemptId);

      alert("Attempt deleted. User can reappear now.");

      setSelectedExam(prev => {

        if (!prev) return prev;

        const newResultMap = { ...(prev.resultMap || {}) };

        delete newResultMap[examineeId];

        return {
          ...prev,
          resultMap: newResultMap
        };

      });

      setDownloadData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          attempts: (prev.attempts || []).map((a) => {
            if (a._id !== attemptId) return a;
            return {
              ...a,
              _id: null,
              status: 'not_attempted',
              totalMarksObtained: 0,
              totalMarksPossible: prev.exam?.totalMarks || 0,
              percentage: 0,
              submittedAt: null
            };
          })
        };
      });

    } catch (err) {

      alert(err.response?.data?.message || "Failed to delete attempt");

    }

  };

  if (!isReady) return <Loader />;

  return (
    <div className="flex flex-col h-screen bg-base-200">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-3">
          <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4">
              <div>
                <h1 className="text-2xl font-bold">Exams</h1>
                <p className="text-base-content/70 mt-1">Create and manage your exams</p>
              </div>
              <button
                onClick={openCreateModal}
                className="btn btn-primary mt-4 md:mt-0"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Create Exam
              </button>
            </div>

            {/* Exam Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {exams.length === 0 ? (
                <div className="col-span-full card bg-base-100 rounded-xl shadow-sm border border-base-300 p-12 text-center">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-3xl">📝</span>
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No Exams Found</h3>
                  <p className="text-base-content/70 mb-4">Get started by creating your first exam.</p>
                  <button onClick={openCreateModal} className="btn btn-primary btn-sm">
                    Create Exam
                  </button>
                </div>
              ) : (
                exams.map((exam) => {
                  const mode = getPickMode(exam);
                  const hasCompletedAttempts = Number(exam.completedUsersCount || 0) > 0;
                  const totalQuestionCount = (() => {
                    if (mode === 'custom') {
                      return Number(exam.questions?.length || 0);
                    }

                    if (mode === 'any') {
                      return Number(exam.randomConfig?.totalQuestions || 0);
                    }

                    if (mode === 'split') {
                      return Number(
                        (exam.randomConfig?.mcqCount || 0) +
                        (exam.randomConfig?.theoryCount || 0) +
                        (exam.randomConfig?.passageCount || 0)
                      );
                    }

                    return 0;
                  })();
                  const isMinimumAttemptInvalid =
                    Number(exam.minimumAttemptQuestions || 0) > totalQuestionCount;
                  return (
                    <div key={exam._id} className="bg-base-100 rounded-xl shadow-sm border border-base-300 overflow-hidden hover:shadow-md transition-shadow">
                      <div className="p-6">
                        <div className="flex items-start justify-between mb-3">
                          <h3 className="font-semibold text-lg">{exam.title}</h3>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(exam.status)}`}>
                            {exam.status}
                          </span>
                        </div>
                        <p className="text-base-content/70 text-sm mb-4 line-clamp-2">
                          {exam.description || 'No description provided'}
                        </p>

                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div className="flex items-center text-gray-600">
                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {exam.duration} mins
                          </div>
                          <div className="flex items-center text-gray-600">
                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                            {`${totalQuestionCount} questions`}

                          </div>
                          <div className="flex items-center text-gray-600">
                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            {exam.assignedTo?.length || 0} assigned
                          </div>
                          <div className={`flex items-center ${isMinimumAttemptInvalid ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Min attempt: {exam.minimumAttemptQuestions || 0}
                          </div>
                          <div className="flex items-center text-gray-600">
                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                            </svg>
                            {exam.selectionMode === 'manual' && (
                              <span>{exam.totalMarks} marks</span>
                            )}

                          </div>
                          <div className="flex items-center text-gray-600">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                            </svg>

                            {exam.completedUsersCount || 0} Completed

                          </div>
                        </div>

                        {/* Date and Time Info */}
                        {(exam.startAt || exam.scheduledDate) && (
                          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                            <div className="flex items-center text-sm text-gray-600">
                              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              {formatExamWindow(exam)}
                            </div>
                          </div>
                        )}

                        {(() => {
                          const mode = getPickMode(exam);

                          if (mode === 'custom') {
                            return (
                              <div className="mt-2 text-xs bg-emerald-50 text-emerald-700 px-3 py-1 rounded">
                                Custom Mode: {exam.questions.length} fixed questions
                              </div>
                            );
                          }

                          if (mode === 'any') {
                            return (
                              <div className="mt-2 text-xs bg-indigo-50 text-indigo-700 px-3 py-1 rounded">
                                Random Mode: Any type ({exam.randomConfig?.totalQuestions || 0})
                              </div>
                            );
                          }

                          if (mode === 'split') {
                            return (
                              <div className="mt-2 text-xs bg-purple-50 text-purple-700 px-3 py-1 rounded">
                                Split Mode: MCQ {exam.randomConfig.mcqCount}, Theory {exam.randomConfig.theoryCount}
                              </div>
                            );
                          }

                          return null;
                        })()}


                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                          {exam.shuffleQuestions && <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded">Shuffled Questions</span>}
                          {exam.shuffleOptions && <span className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded">Shuffled Options</span>}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="p-1 bg-base-200 border-t border-base-300">
                        <div className="flex mb-2">
                          <button
                            onClick={() => handleEdit(exam)}
                            className="btn btn-ghost btn-xs"
                          >
                            Edit Exam
                          </button>
                          <button
                            onClick={() => handleDelete(exam._id)}
                            className="btn btn-ghost btn-xs btn-error"
                          >
                            Delete Exam
                          </button>

                          <div
                            className={!hasCompletedAttempts ? 'tooltip tooltip-left inline-flex' : 'inline-flex'}
                            data-tip={!hasCompletedAttempts ? 'No completed attempts yet' : ''}
                          >
                            <button
                              onClick={() => downloadResults(exam._id, exam.title)}
                              disabled={!hasCompletedAttempts}
                              className="btn btn-ghost btn-xs"
                            >
                              Results
                            </button>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => openQuestionsModal(exam)}
                            className="btn btn-ghost btn-xs"
                          >
                            Assign Questions
                          </button>
                          <div
                            className={mode === 'custom' ? 'tooltip tooltip-top inline-flex' : 'inline-flex'}
                            data-tip={mode === 'custom' ? 'Disable custom mode first.' : ''}
                          >
                            <button
                              onClick={() => openAutoPickModal(exam)}
                              disabled={mode === 'custom'}
                              className="btn btn-ghost btn-xs"
                            >
                              Auto Pick
                            </button>
                          </div>
                          <button
                            onClick={() => openExamineesModal(exam)}
                            className="btn btn-ghost btn-xs"
                          >
                            Assign Users
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Create/Edit Exam Modal */}
      <Modal
        isOpen={showModal}
        onClose={closeModal}
        title={editingId ? "Edit Exam" : "Create Exam"}
        size="medium"
      >
        <div className="max-h-[unset] overflow-visible">

          <form onSubmit={handleSubmit} className="space-y-2 text-sm">

            {/* Title */}
            <div>
              <label className="text-[11px] font-medium text-base-content/70">
                Title<span className="text-error">*</span>
              </label>
              <input
                type="text"
                placeholder="Exam title"
                className="input input-bordered input-xs w-full h-8 mt-0.5"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
              />
            </div>

            {/* Duration + Shuffle */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-end">

              <div>
                <label className="text-[10px] text-base-content/70 whitespace-nowrap">
                  Duration<span className="text-error">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  className="input input-bordered input-xs w-full h-8 mt-0.5"
                  value={formData.duration}
                  onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                />
              </div>

              <div className="flex items-center h-[38px] mt-[18px]">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-base-content/70">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap leading-none">
                    <span>Shuffle Questions</span>
                    <input
                      type="checkbox"
                      className="checkbox checkbox-xs checkbox-primary"
                      checked={!!formData.shuffleQuestions}
                      onChange={(e) =>
                        setFormData((p) => ({
                          ...p,
                          shuffleQuestions: e.target.checked
                        }))
                      }
                    />
                  </label>

                  <label className="inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap leading-none">
                    <span>Shuffle Answers</span>
                    <input
                      type="checkbox"
                      className="checkbox checkbox-xs checkbox-primary"
                      checked={!!formData.shuffleOptions}
                      onChange={(e) =>
                        setFormData((p) => ({
                          ...p,
                          shuffleOptions: e.target.checked
                        }))
                      }
                    />
                  </label>
                </div>
              </div>

            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-2">

              <div>
                <label className="text-[11px] text-base-content/70">
                  Start<span className="text-error">*</span>
                </label>
                <input
                  type="datetime-local"
                  className="input input-bordered input-xs w-full h-8 mt-0.5"
                  value={formData.startAt}
                  onChange={(e) => setFormData({ ...formData, startAt: e.target.value })}
                />
              </div>

              <div>
                <label className="text-[11px] text-base-content/70">
                  End<span className="text-error">*</span>
                </label>
                <input
                  type="datetime-local"
                  className="input input-bordered input-xs w-full h-8 mt-0.5"
                  value={formData.endAt}
                  onChange={(e) => setFormData({ ...formData, endAt: e.target.value })}
                />
              </div>

            </div>

            {/* Description */}
            <div>
              <label className="text-[11px] text-base-content/70">
                Description
              </label>
              <textarea
                rows="1"
                className="textarea textarea-bordered textarea-xs w-full mt-0.5"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder='Enter exam description'
              />
            </div>

            {/* Instructions */}
            <div>
              <label className="text-[11px] text-base-content/70">
                Instructions
              </label>
              <textarea
                rows="1"
                className="textarea textarea-bordered textarea-xs w-full mt-0.5"
                value={formData.customInstructionsText}
                onChange={(e) => setFormData({ ...formData, customInstructionsText: e.target.value })}
                placeholder='Line 1\nLine 2\nLine 3'
              />
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 pt-2 border-t border-base-300">

              <button
                type="button"
                onClick={closeModal}
                className="btn btn-ghost btn-xs h-7"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={formLoading}
                className="btn btn-primary btn-xs h-7"
              >
                {formLoading && <span className="loading loading-spinner loading-xs mr-1"></span>}
                {editingId ? "Update" : "Create"}
              </button>

            </div>

          </form>

        </div>
      </Modal>

      {/* Assign Questions Modal */}
      <Modal
        isOpen={showQuestionsModal}
        onClose={() => {
          setShowQuestionsModal(false);
          setQuestionFilter({ subject: '', type: '', difficulty: '' });
        }}
        title={`Assign Questions to "${selectedExam?.title}"`}
        size="large"
      >
        <div className="space-y-2">
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end pb-2 border-b border-base-300">

            {/* Subject */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-base-content/70">Subject</label>
              <select
                className="select select-bordered select-xs w-full h-7"
                value={questionFilter.subject}
                onChange={(e) =>
                  setQuestionFilter({ ...questionFilter, subject: e.target.value })
                }
              >
                <option value="">All Subjects</option>
                {(subjects.length > 0 ? subjects : getUniqueSubjects()).map((subject) => (
                  <option key={subject._id} value={subject._id}>
                    {subject.name} ({subject.questionCount || subject.count || 0})
                  </option>
                ))}
              </select>
            </div>

            {/* Type */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-base-content/70">Type</label>
              <select
                className="select select-bordered select-xs w-full h-7"
                value={questionFilter.type}
                onChange={(e) =>
                  setQuestionFilter({ ...questionFilter, type: e.target.value })
                }
              >
                <option value="">All Types</option>
                <option value="mcq">MCQ</option>
                <option value="theory">Theory</option>
                <option value="passage">Passage</option>
              </select>
            </div>

            {/* Difficulty */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-base-content/70">Difficulty</label>
              <select
                className="select select-bordered select-xs w-full h-7"
                value={questionFilter.difficulty}
                onChange={(e) =>
                  setQuestionFilter({ ...questionFilter, difficulty: e.target.value })
                }
              >
                <option value="">All Difficulties</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>

          </div>

          {/* Header with Select All */}
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="selectAllQuestions"
                className="checkbox checkbox-sm checkbox-primary"
                checked={selectedQuestions.length === getFilteredQuestions().length && getFilteredQuestions().length > 0}
                onChange={() => {
                  const filteredIds = getFilteredQuestions().map(q => q._id);
                  if (selectedQuestions.length === filteredIds.length) {
                    setSelectedQuestions([]);
                  } else {
                    setSelectedQuestions(filteredIds);
                  }
                }}
              />
              <label htmlFor="selectAllQuestions" className="ml-2 text-sm font-medium">
                Select All Filtered ({getFilteredQuestions().length} questions)
              </label>
            </div>
            <span className="text-sm text-base-content/70">
              {selectedQuestions.length} selected
            </span>
          </div>

          {/* Questions Table */}
          <div className="border border-base-300 rounded-lg overflow-hidden">

            <div className="max-h-[285px] overflow-y-auto">

              <table className="table table-xs">

                <thead className="sticky top-0 bg-base-200 z-10">
                  <tr>
                    <th className="w-10">
                      {/* <input
                        type="checkbox"
                        className="checkbox checkbox-xs checkbox-primary"
                        checked={
                          selectedQuestions.length === getFilteredQuestions().length &&
                          getFilteredQuestions().length > 0
                        }
                        onChange={() => {
                          const filteredIds = getFilteredQuestions().map(q => q._id);
                          if (selectedQuestions.length === filteredIds.length) {
                            setSelectedQuestions([]);
                          } else {
                            setSelectedQuestions(filteredIds);
                          }
                        }}
                      /> */}
                    </th>

                    <th className="w-[55%]">Question</th>
                    <th>Subject</th>
                    <th>Type</th>
                    <th className="text-right">Marks</th>
                  </tr>
                </thead>

                <tbody>

                  {getFilteredQuestions().length === 0 ? (
                    <tr>
                      <td colSpan="5" className="text-center py-6 text-base-content/60">
                        {questions.length === 0
                          ? "No questions available"
                          : "No questions match the filters"}
                      </td>
                    </tr>
                  ) : (
                    getFilteredQuestions().map((question) => (
                      <tr
                        key={question._id}
                        className={`cursor-pointer hover:bg-base-200 ${selectedQuestions.includes(question._id)
                          ? "bg-primary/10"
                          : ""
                          }`}
                        onClick={() => toggleQuestionSelection(question._id)}
                      >
                        <td>
                          <input
                            type="checkbox"
                            className="checkbox checkbox-xs checkbox-primary"
                            checked={selectedQuestions.includes(question._id)}
                            onClick={(e) => e.stopPropagation()}
                            onChange={() => toggleQuestionSelection(question._id)}
                          />
                        </td>

                        <td>
                          <div
                            className="exam-image line-clamp-2 max-w-[500px]"
                            dangerouslySetInnerHTML={{ __html: question.question }}
                          />
                        </td>

                        <td>
                          <span
                            className="px-2 py-0.5 rounded text-[11px] text-white"
                            style={{
                              backgroundColor: question.subject?.color || "#6B7280"
                            }}
                          >
                            {question.subject?.name || "Unknown"}
                          </span>
                        </td>

                        <td>
                          <span
                            className={`badge badge-xs ${question.type === "mcq"
                              ? "badge-info"
                              : question.type === "theory"
                                ? "badge-secondary"
                                : "badge-accent"
                              }`}
                          >
                            {question.type}
                          </span>
                        </td>

                        <td className="text-right font-medium">
                          {question.credit || 0}
                        </td>
                      </tr>
                    ))
                  )}

                </tbody>
              </table>

            </div>

          </div>

          {/* Footer */}
          <div className="flex flex-col gap-3 md:flex-row md:justify-between md:items-end pt-4 border-t border-base-300">
            <div className="text-sm text-base-content/70">
              Total Marks: <span className="font-semibold">
                {questions
                  .filter(q => selectedQuestions.includes(q._id))
                  .reduce((sum, q) => sum + (q.credit || 0), 0)}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full md:w-auto">
              <div className="flex flex-col gap-1 w-full md:w-56">
                <label className="text-[11px] text-base-content/70">
                  Minimum Attempt Questions ({selectedQuestions.length})
                </label>
                <input
                  type="number"
                  min="0"
                  max={selectedQuestions.length}
                  className="input input-bordered input-xs w-full h-7"
                  value={assignmentMinimumAttemptQuestions}
                  onChange={(e) =>
                    setAssignmentMinimumAttemptQuestions(
                      Math.max(0, Number(e.target.value) || 0)
                    )
                  }
                />
              </div>
              <div className="flex flex-col gap-1 w-full md:w-40">
                <label className="text-[11px] text-base-content/70">
                  Passing Marks
                </label>
                <input
                  type="number"
                  min="0"
                  className="input input-bordered input-xs w-full h-7"
                  value={assignmentPassingMarks}
                  onChange={(e) => setAssignmentPassingMarks(e.target.value)}
                  placeholder="Default 40%"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowQuestionsModal(false);
                  setQuestionFilter({ subject: '', type: '', difficulty: '' });
                }}
                className="btn btn-ghost btn-sm"
              >
                Cancel
              </button>
              <button
                onClick={saveAssignedQuestions}
                disabled={formLoading}
                className="btn btn-primary btn-sm"
              >
                {formLoading && (
                  <span className="loading loading-spinner loading-xs mr-2"></span>
                )}
                Assign ({selectedQuestions.length} Questions)
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Assign Examinees Modal */}
      <Modal
        isOpen={showExamineesModal}
        onClose={() => {
          setShowExamineesModal(false);
          setExamineeFilter({ search: '', status: '', sbu: '', group: '' });
        }}
        title={`Assign Users to "${selectedExam?.title}"`}
        size="large"
      >
        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 pb-2 border-b border-base-300">

          {/* Search */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-base-content/70">Search</label>
            <input
              type="text"
              placeholder="Name, username, SBU or group"
              value={examineeFilter.search}
              onChange={(e) =>
                setExamineeFilter({ ...examineeFilter, search: e.target.value })
              }
              className="input input-bordered input-xs w-full h-7"
            />
          </div>

          {/* Status */}
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-base-content/70">Status</label>
            <select
              value={examineeFilter.status}
              onChange={(e) =>
                setExamineeFilter({ ...examineeFilter, status: e.target.value })
              }
              className="select select-bordered select-xs w-full h-7"
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-base-content/70">SBU</label>
            <select
              value={examineeFilter.sbu}
              onChange={(e) =>
                setExamineeFilter({ ...examineeFilter, sbu: e.target.value })
              }
              className="select select-bordered select-xs w-full h-7"
            >
              <option value="">All SBU</option>
              {sbuFilterOptions.map((sbu) => (
                <option key={sbu} value={sbu}>{sbu}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-base-content/70">Group</label>
            <select
              value={examineeFilter.group}
              onChange={(e) =>
                setExamineeFilter({ ...examineeFilter, group: e.target.value })
              }
              className="select select-bordered select-xs w-full h-7"
            >
              <option value="">All Group</option>
              {groupFilterOptions.map((group) => (
                <option key={group} value={group}>{group}</option>
              ))}
            </select>
          </div>

        </div>

        <div className="space-y-4">
          {/* Header with Select All */}
          <div className="flex items-center justify-between p-2 border-b border-base-300">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="selectAllExaminees"
                className="checkbox checkbox-sm checkbox-success"
                checked={
                  filteredExaminees.length > 0 &&
                  selectedExaminees.length === filteredExaminees.length
                }
                onChange={() => {
                  const filteredIds = filteredExaminees.map(e => e._id);
                  if (selectedExaminees.length === filteredIds.length) {
                    setSelectedExaminees([]);
                  } else {
                    setSelectedExaminees(filteredIds);
                  }
                }}
              />
              <label htmlFor="selectAllExaminees" className="ml-2 text-sm font-medium">
                Select All ({getFilteredExaminees().length} users)
              </label>
            </div>
            <span className="text-sm text-base-content/70">
              {selectedExaminees.length} selected
            </span>
          </div>

          {/* Examinees Table */}
          <div className="border border-base-300 rounded-lg overflow-hidden">

            <div className="max-h-[285px] overflow-y-auto">

              <table className="table table-xs">

                <thead className="sticky top-0 bg-base-200 z-10">
                  <tr>

                    <th className="w-10">
                      {/* <input
                        type="checkbox"
                        className="checkbox checkbox-xs checkbox-success"
                        checked={
                          filteredExaminees.length > 0 &&
                          selectedExaminees.length === filteredExaminees.length
                        }
                        onChange={() => {
                          const filteredIds = filteredExaminees.map(e => e._id);
                          if (selectedExaminees.length === filteredIds.length) {
                            setSelectedExaminees([]);
                          } else {
                            setSelectedExaminees(filteredIds);
                          }
                        }}
                      /> */}
                    </th>

                    <th>Name</th>
                    <th>Username</th>
                    <th>SBU</th>
                    <th>Group</th>
                    <th>Status</th>

                  </tr>
                </thead>

                <tbody>

                  {filteredExaminees.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="text-center py-6 text-base-content/60">
                        No users found
                      </td>
                    </tr>
                  ) : (
                    filteredExaminees.map((examinee) => (
                      <tr
                        key={examinee._id}
                        className={`cursor-pointer hover:bg-base-200 ${selectedExaminees.includes(examinee._id)
                          ? "bg-success/10"
                          : ""
                          }`}
                        onClick={() => toggleExamineeSelection(examinee._id)}
                      >

                        <td>
                          <input
                            type="checkbox"
                            className="checkbox checkbox-xs checkbox-success"
                            checked={selectedExaminees.includes(examinee._id)}
                            onClick={(e) => e.stopPropagation()}
                            onChange={() => toggleExamineeSelection(examinee._id)}
                          />
                        </td>

                        <td className="font-medium">
                          {examinee.firstname} {examinee.lastname}
                        </td>

                        <td className="text-base-content/70">
                          @{examinee.username}
                        </td>

                        <td className="text-base-content/70">
                          {examinee.sbu || '-'}
                        </td>

                        <td className="text-base-content/70">
                          {examinee.group || '-'}
                        </td>

                        <td>
                          <span
                            className={`badge badge-xs ${examinee.isActive
                              ? "badge-success"
                              : "badge-error"
                              }`}
                          >
                            {examinee.isActive ? "Active" : "Inactive"}
                          </span>
                        </td>

                      </tr>
                    ))
                  )}

                </tbody>

              </table>

            </div>

          </div>

          {/* Footer */}
          <div className="flex justify-end space-x-3 pt-4 border-t border-base-300">
            <button
              type="button"
              onClick={() => setShowExamineesModal(false)}
              className="btn btn-ghost btn-sm"
            >
              Cancel
            </button>
            <button
              onClick={saveAssignedExaminees}
              disabled={formLoading}
              className="btn btn-success btn-sm"
            >
              {formLoading && (
                <span className="loading loading-spinner loading-xs mr-2"></span>
              )}
              Assign ({selectedExaminees.length} Users)
            </button>
          </div>
        </div>
      </Modal>

      {/* Auto Pick Questions Modal */}
      <Modal
        isOpen={showAutoPickModal}
        onClose={closeAutoPickModal}
        title={`Auto Pick Questions${autoPickExam?.title ? ` - ${autoPickExam.title}` : ''}`}
        size="large"
      >

        <div className="space-y-2 text-sm">
          {/* Pick Mode */}
          <div>
            <label className="text-[11px] font-medium text-base-content/70">
              Pick Mode
            </label>

            <div className="flex gap-4 mt-1">

              <label className="flex items-center gap-1 text-xs cursor-pointer">
                <input
                  type="radio"
                  name="pickMode"
                  className="radio radio-xs radio-primary"
                  checked={!autoPickForm.useSplit}
                  onChange={() =>
                    setAutoPickForm((p) => ({
                      ...p,
                      useSplit: false,
                      mcqCount: "",
                      theoryCount: "",
                      passageCount: "",
                    }))
                  }
                />
                Any type
              </label>

              <label className="flex items-center gap-1 text-xs cursor-pointer">
                <input
                  type="radio"
                  name="pickMode"
                  className="radio radio-xs radio-primary"
                  checked={autoPickForm.useSplit}
                  onChange={() =>
                    setAutoPickForm((p) => ({
                      ...p,
                      useSplit: true,
                      mcqCount: p.mcqCount || 0,
                      theoryCount: p.theoryCount || 0,
                      passageCount: p.passageCount || 0,
                    }))
                  }
                />
                Split
              </label>

            </div>
          </div>
        </div>

        <div className="space-y-4">
          {/* Numbers */}
          <div className="grid grid-cols-1 md:grid-cols-6 gap-2">

            <div>
              <label className="text-[11px] text-base-content/70">Total</label>
              <input
                type="number"
                min="1"
                max={maxTotalAllowed}
                disabled={autoPickForm.useSplit}
                className={`input input-bordered input-xs w-full h-8 mt-0.5 ${autoPickForm.useSplit ? "input-disabled" : ""
                  }`}
                value={autoPickForm.totalQuestions}
                onChange={(e) => onTotalChange(e.target.value)}
              />
              <p className="text-xs text-base-content/60 mt-1">
                Available: {poolCounts.total} (MCQ {poolCounts.mcq}, Theory {poolCounts.theory}, Passage {poolCounts.passage})
              </p>

            </div>

            <div>
              <label className="text-[11px] text-base-content/70">Min Attempt</label>
              <input
                type="number"
                min="0"
                max={totalSelected || maxTotalAllowed || 0}
                className="input input-bordered input-xs w-full h-8 mt-0.5"
                value={autoPickForm.minimumAttemptQuestions}
                onChange={(e) =>
                  setAutoPickForm((prev) => ({
                    ...prev,
                    minimumAttemptQuestions: Math.max(0, Number(e.target.value) || 0)
                  }))
                }
              />
              <p className="text-xs text-base-content/60 mt-1">
                Cannot exceed total questions ({totalSelected || 0}).
              </p>
            </div>

            <div>
              <label className="text-[11px] text-base-content/70">Passing Marks</label>
              <input
                type="number"
                min="0"
                className="input input-bordered input-xs w-full h-8 mt-0.5"
                value={autoPickForm.passingMarks}
                onChange={(e) =>
                  setAutoPickForm((prev) => ({
                    ...prev,
                    passingMarks: e.target.value
                  }))
                }
                placeholder="Default 40%"
              />
              <p className="text-xs text-base-content/60 mt-1">
                Keep empty to use default formula.
              </p>
            </div>

            <div>
              <label className="text-[11px] text-base-content/70">MCQ</label>
              <input
                type="number"
                min="0"
                max={maxMcqAllowed}
                disabled={!autoPickForm.useSplit}
                className="input input-bordered input-xs w-full h-8 mt-0.5"
                value={autoPickForm.mcqCount}
                onChange={(e) => onMcqChange(e.target.value)}
              />
              <p className="text-xs text-base-content/60 mt-1">
                Max: {maxMcqAllowed} (pool MCQ: {poolCounts.mcq})
              </p>

            </div>

            <div>
              <label className="text-[11px] text-base-content/70">Theory</label>
              <input
                type="number"
                min="0"
                max={maxTheoryAllowed}
                disabled={!autoPickForm.useSplit}
                className="input input-bordered input-xs w-full h-8 mt-0.5"
                value={autoPickForm.theoryCount}
                onChange={(e) => onTheoryChange(e.target.value)}
              />
              <p className="text-xs text-base-content/60 mt-1">
                Max: {maxTheoryAllowed} (pool Theory: {poolCounts.theory})
              </p>

            </div>

            <div>
              <label className="text-[11px] text-base-content/70">Passage</label>
              <input
                type="number"
                min="0"
                max={maxPassageAllowed}
                disabled={!autoPickForm.useSplit}
                className="input input-bordered input-xs w-full h-8 mt-0.5"
                value={autoPickForm.passageCount}
                onChange={(e) => onPassageChange(e.target.value)}
              />
              <p className="text-xs text-base-content/60 mt-1">
                Max: {maxPassageAllowed} (pool Passage: {poolCounts.passage})
              </p>

            </div>

          </div>

          {/* Filters */}
          {/* <div className="grid grid-cols-3 gap-2">

            <div>
              <label className="text-[11px] text-base-content/70">Difficulty</label>
              <select
                className="select select-bordered select-xs w-full h-8 mt-0.5"
                value={autoPickForm.difficulty}
                onChange={(e) => setAutoPickForm((p) => ({ ...p, difficulty: e.target.value }))}
              >
                <option value="">Any</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>

            <div className="col-span-2">
              <label className="text-[11px] text-base-content/70">Topic contains</label>
              <input
                type="text"
                placeholder="Arrays, SQL..."
                className="input input-bordered input-xs w-full h-8 mt-0.5"
                value={autoPickForm.topic}
                onChange={(e) => setAutoPickForm((p) => ({ ...p, topic: e.target.value }))}
              />
            </div>

          </div> */}

          {/* Subjects */}
          <div>
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-base-content">Subjects</label>
              <span className="text-xs text-base-content/60">
                {autoPickForm.subjectIds.length} selected
              </span>
            </div>

            {subjects.length === 0 ? (
              <div className="mt-2 text-sm text-base-content/60">
                No subjects found. Create subjects to filter by subject (optional).
              </div>
            ) : (
              <div className="mt-2 max-h-40 overflow-y-auto border border-base-300 rounded-lg p-3 space-y-2 bg-base-100">
                {subjects.map((s) => (
                  <label key={s._id} className="label cursor-pointer justify-start gap-2 py-1">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-sm checkbox-primary"
                      checked={autoPickForm.subjectIds.includes(String(s._id))}
                      onChange={() => toggleSubject(s._id)}
                    />
                    <span
                      className="inline-block w-3 h-3 rounded-full"
                      style={{ backgroundColor: s.color || '#6B7280' }}
                    />
                    <span>{s.name}</span>
                    <span className="text-xs text-base-content/50">({s.questionCount ?? 0})</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Shuffle */}
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              className="checkbox checkbox-xs checkbox-primary"
              checked={autoPickForm.shuffleSelectedQuestions}
              onChange={(e) =>
                setAutoPickForm((p) => ({
                  ...p,
                  shuffleSelectedQuestions: e.target.checked
                }))
              }
            />
            Shuffle selected questions
          </label>

          <div role="alert" className="alert alert-info text-xs">
            Tip: If you want any-type random selection, keep split off.
            If you want a fixed split, MCQ + Theory + Passage must equal Total.
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-base-300">
            <button
              type="button"
              onClick={closeAutoPickModal}
              className="btn btn-ghost btn-sm"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={submitAutoPick}
              disabled={formLoading}
              className="btn btn-primary btn-sm"
            >
              {formLoading && (
                <span className="loading loading-spinner loading-xs mr-2" />
              )}
              Generate & Save
            </button>
          </div>
        </div>
      </Modal>

      {/* Evaluate Theory Answers Modal */}
      <Modal
        isOpen={showEvaluateModal}
        onClose={closeEvaluateModal}
        title="Evaluate Theory Answers"
        size="large"
        backdropZ="z-[70]"
        modalZ="z-[80]"
      >
        {evaluatingAttempt ? (
          <div className="space-y-5">
            <div className="bg-base-200 p-2 rounded-lg">
              <p className="font-medium">
                {evaluatingAttempt.examinee.firstname}{' '}
                {evaluatingAttempt.examinee.lastname}
              </p>
              <p className="text-sm text-base-content/70">
                @{evaluatingAttempt.examinee.username}
              </p>
            </div>

            {/* Theory Questions */}
            <div className="border border-base-300 rounded-lg overflow-hidden">

              <div className="max-h-[285px] overflow-y-auto">

                <table className="table table-xs">

                  <thead className="sticky top-0 bg-base-200 z-10">
                    <tr>
                      <th className="w-10">#</th>
                      <th>Question</th>
                      <th>Answer</th>
                      <th className="text-center">Max</th>
                      <th className="w-24">Marks</th>
                      {/* <th>Feedback</th> */}
                    </tr>
                  </thead>

                  <tbody>

                    {[
                      ...evaluatingAttempt.answers
                        .filter(a => a.question?.type === 'theory')
                        .map((ans) => ({
                          key: ans.question._id,
                          questionId: ans.question._id,
                          prompt: toPlainText(ans.question.question),
                          maxMarks: ans.question.credit,
                          textAnswer: ans.textAnswer || '',
                          existingMarks: ans.marksObtained ?? ''
                        })),

                      ...evaluatingAttempt.answers
                        .filter(a => a.question?.type === 'passage')
                        .flatMap((ans) =>
                          (ans.question?.subQuestions || [])
                            .filter((sq) => sq.type === 'theory')
                            .map((sq) => {
                              const resp = (ans.passageResponses || []).find(
                                (r) => String(r.subQuestionId) === String(sq._id)
                              )

                              return {
                                key: `${ans.question._id}-${sq._id}`,
                                questionId: ans.question._id,
                                subQuestionId: sq._id,
                                prompt: `${toPlainText(ans.question.question)} | ${toPlainText(sq.prompt)}`,
                                maxMarks: sq.credit,
                                textAnswer: resp?.textAnswer || '',
                                existingMarks: resp?.marksObtained ?? ''
                              }
                            })
                        )
                    ].map((item, index) => (

                      <tr key={item.key}>

                        <td>{index + 1}</td>

                        <td className="max-w-[280px]">
                          <div className="text-xs">
                            <div className={`${expandedRows[item.key] ? '' : 'line-clamp-2'}`}>
                              {item.prompt}
                            </div>

                            {item.prompt.length > 120 && (
                              <button
                                type="button"
                                onClick={() => toggleExpand(item.key)}
                                className="text-primary text-[11px] mt-1 hover:underline"
                              >
                                {expandedRows[item.key] ? "Show less" : "Show more"}
                              </button>
                            )}
                          </div>
                        </td>

                        <td className="max-w-[220px]">
                          <div className="text-xs text-base-content/80">

                            <div className={`${expandedRows[item.key + "-answer"] ? "" : "line-clamp-2"}`}>
                              {item.textAnswer || "No answer"}
                            </div>

                            {item.textAnswer?.length > 120 && (
                              <button
                                type="button"
                                onClick={() => toggleExpand(item.key + "-answer")}
                                className="text-primary text-[11px] mt-1 hover:underline"
                              >
                                {expandedRows[item.key + "-answer"] ? "Show less" : "Show more"}
                              </button>
                            )}

                          </div>
                        </td>

                        <td className="text-center font-medium">
                          {item.maxMarks}
                        </td>

                        <td>
                          <input
                            type="number"
                            min="0"
                            max={item.maxMarks}
                            defaultValue={item.existingMarks}
                            className="input input-bordered input-xs w-20"
                            onChange={(e) => {

                              let value = Number(e.target.value)

                              if (value > item.maxMarks) value = item.maxMarks
                              if (value < 0) value = 0

                              e.target.value = value

                              updateEvaluation(item.questionId, {
                                ...(item.subQuestionId
                                  ? { subQuestionId: item.subQuestionId }
                                  : {}),
                                marksObtained: value
                              })

                            }}
                          />
                        </td>

                        {/* <td>
                          <input
                            type="text"
                            placeholder="Feedback"
                            className="input input-bordered input-xs w-full"
                            onChange={(e) =>
                              updateEvaluation(item.questionId, {
                                ...(item.subQuestionId
                                  ? { subQuestionId: item.subQuestionId }
                                  : {}),
                                feedback: e.target.value
                              })
                            }
                          />
                        </td> */}

                      </tr>

                    ))}

                  </tbody>

                </table>

              </div>

            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-base-300">
              <button
                onClick={closeEvaluateModal}
                className="btn btn-ghost btn-sm"
              >
                Cancel
              </button>

              <button
                onClick={submitEvaluation}
                disabled={evalLoading}
                className="btn btn-primary btn-sm"
              >
                {evalLoading && (
                  <span className="loading loading-spinner loading-xs mr-2" />
                )}
                Submit Evaluation
              </button>
            </div>
          </div>
        ) : (
          <p className="text-base-content/60">Loading attempt...</p>
        )}
      </Modal>

      {/* Download Results Modal */}
      <Modal
        isOpen={showDownloadModal}
        onClose={() => setShowDownloadModal(false)}
        title="Download Results"
        size="large"
      >
        {downloadData && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="rounded-lg border border-base-300 bg-base-200 px-3 py-2 text-center">
                <p className="text-lg font-semibold">{downloadData.attempts?.length || 0}</p>
                <p className="text-xs text-base-content/70">Assigned Users</p>
              </div>
              <div className="rounded-lg border border-base-300 bg-base-200 px-3 py-2 text-center">
                <p className="text-lg font-semibold">
                  {downloadData.attempts?.filter((attempt) => attempt.status === 'not_attempted').length || 0}
                </p>
                <p className="text-xs text-base-content/70">Not Attempted</p>
              </div>
              <div className="rounded-lg border border-base-300 bg-base-200 px-3 py-2 text-center">
                <p className="text-lg font-semibold">
                  {downloadData.attempts?.filter((attempt) => attempt.status === 'submitted').length || 0}
                </p>
                <p className="text-xs text-base-content/70">Evaluation Pending</p>
              </div>
              <div className="rounded-lg border border-base-300 bg-base-200 px-3 py-2 text-center">
                <p className="text-lg font-semibold">
                  {downloadData.attempts?.filter((attempt) => attempt.status === 'in-progress').length || 0}
                </p>
                <p className="text-xs text-base-content/70">In Progress</p>
              </div>
              <div className="rounded-lg border border-base-300 bg-base-200 px-3 py-2 text-center">
                <p className="text-lg font-semibold">
                  {downloadData.attempts?.filter((attempt) => attempt.status === 'evaluated').length || 0}
                </p>
                <p className="text-xs text-base-content/70">Evaluated</p>
              </div>
            </div>

            <div className="border border-base-300 rounded-lg overflow-hidden">
              <div className="max-h-80 overflow-y-auto">
                <table className="table table-xs table-zebra">
                  <thead className="sticky top-0 bg-base-100 z-10">
                    <tr>
                      <th>#</th>
                      <th>Name</th>
                      <th>Username</th>
                      <th>Marks</th>
                      <th>Percentage</th>
                      <th>Status</th>
                      <th className="text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {downloadData.attempts?.map((attempt, index) => {
                      const first = attempt.examinee?.firstname || '';
                      const last = attempt.examinee?.lastname || '';
                      const name = `${first} ${last}`.trim() || '-';
                      const username = attempt.examinee?.username ? `@${attempt.examinee.username}` : '-';
                      const totalPossible = attempt.totalMarksPossible ?? downloadData.exam?.totalMarks ?? 0;
                      const totalObtained = Number(attempt.totalMarksObtained ?? 0);
                      const isNotAttempted = attempt.status === 'not_attempted';
                      const isInProgress = attempt.status === 'in-progress';
                      const hasTheoryInAttempt = attemptHasTheory(attempt);
                      const isPendingEvaluation = attempt.status === 'submitted' || (attempt.status === 'auto-submitted' && hasTheoryInAttempt);
                      const marks = isInProgress
                        ? `${totalObtained}/${totalPossible} (live)`
                        : isPendingEvaluation
                        ? `${totalObtained}/${totalPossible} (partial)`
                        : isNotAttempted
                          ? '-'
                          : `${totalObtained}/${totalPossible}`;
                      const percentage = (isPendingEvaluation || isInProgress)
                        ? '-'
                        : isNotAttempted
                          ? '-'
                          : `${Number(attempt.percentage || 0).toFixed(1)}%`;
                      const configuredPassingMarks = Number(downloadData.exam?.passingMarks || 0);
                      const isPass = configuredPassingMarks > 0
                        ? Number(attempt.totalMarksObtained || 0) >= configuredPassingMarks
                        : Number(attempt.percentage || 0) >= 40;
                      const status = isNotAttempted
                        ? 'Not Attempted'
                        : isInProgress
                          ? 'In Progress'
                        : isPendingEvaluation
                          ? 'Evaluation Pending'
                          : isPass
                            ? 'PASS'
                            : 'FAIL';

                      return (
                        <tr key={attempt._id || index}>
                          <td>{index + 1}</td>
                          <td className="font-medium">{name}</td>
                          <td>{username}</td>
                          <td>{marks}</td>
                          <td>{percentage}</td>
                          <td>
                            <span
                              className={`badge badge-sm ${status === 'Not Attempted'
                                ? 'badge-ghost'
                                : status === 'In Progress'
                                  ? 'badge-info'
                                : status === 'Evaluation Pending'
                                  ? 'badge-warning'
                                  : status === 'PASS'
                                    ? 'badge-success'
                                    : 'badge-error'
                                }`}
                            >
                              {status}
                            </span>
                          </td>
                          <td>
                            <div className="flex items-center justify-center gap-2">
                              {(attempt.status === 'submitted' || (attempt.status === 'auto-submitted' && hasTheoryInAttempt)) && (
                                <button
                                  onClick={() => openEvaluateModal(attempt._id)}
                                  className="btn btn-primary btn-xs"
                                >
                                  Evaluate
                                </button>
                              )}

                              {attempt.status === 'evaluated' && (
                                <button
                                  onClick={() =>
                                    handleDownloadPDF(
                                      attempt._id,
                                      attempt.examinee?.username || 'user',
                                      downloadData.exam?.title || 'exam'
                                    )
                                  }
                                  disabled={downloadingSingle === attempt._id}
                                  className="btn btn-info btn-xs"
                                >
                                  {downloadingSingle === attempt._id ? 'Downloading...' : 'Download'}
                                </button>
                              )}

                              {/* Logic for Re-Exam Button vs Not Attempted Text */}
                              {isNotAttempted ? (
                                <span className="badge badge-ghost badge-sm">
                                  Not Attempted
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleReappear(attempt._id, attempt.examinee?._id)}
                                  disabled={!attempt._id}
                                  className="btn btn-error btn-xs"
                                >
                                  Re-Exam
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 justify-center">
              <div
                className={!downloadData.attempts?.some((a) => a.status === 'evaluated') ? "tooltip tooltip" : ""}
                data-tip="No evaluated attempts yet"
              >
                <button
                  className="btn btn-accent btn-sm"
                  onClick={handleDownloadAllPDFs}
                  disabled={downloadingAll || !downloadData.attempts?.some((a) => a.status === 'evaluated')}
                >
                  {downloadingAll ? 'Preparing ZIP...' : `Download all users' Answer PDF`}
                </button>
              </div>

              {/* <button
                className="btn btn-primary btn-sm"
                onClick={() => {
                  generatePDF(
                    downloadData.exam,
                    downloadData.attempts,
                    downloadData.safeTitle
                  );
                  setShowDownloadModal(false);
                }}
              >
                Download PDF
              </button> */}

              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  generateExcel(
                    downloadData.exam,
                    downloadData.attempts,
                    downloadData.safeTitle
                  );
                  setShowDownloadModal(false);
                }}
              >
                Download Result as Excel
              </button>

            </div>
          </div>
        )}
      </Modal>

    </div>
  );
};

export default Exams;



