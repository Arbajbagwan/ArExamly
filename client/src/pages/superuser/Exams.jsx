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
import JSZip from 'jszip';

const Exams = () => {
  const resolveBackendBase = () => {
    const apiBase = API.defaults?.baseURL || import.meta.env.VITE_API_URL || '';
    if (/^https?:\/\//i.test(apiBase)) {
      return apiBase.replace(/\/api\/?$/, '');
    }
    return 'http://localhost:5000';
  };
  const backendBase = resolveBackendBase();
  const toFileUrl = (filePath) => {
    if (!filePath) return '';
    if (String(filePath).startsWith('http')) return filePath;
    return `${backendBase}${filePath}`;
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
    status: '' // active | inactive
  });

  const [autoPickExam, setAutoPickExam] = useState(null);
  const [autoPickForm, setAutoPickForm] = useState({
    useSplit: false,
    totalQuestions: '',
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
    scheduledDate: '',
    startTime: '',
    endTime: '',
    customInstructionsText: '',
    instructionPdfFile: null,
    instructionPdf: '',
    removeInstructionPdf: false,
    shuffleQuestions: false,
    shuffleOptions: false,
  });

  // Evaluation map for theory answers
  const [evaluationMap, setEvaluationMap] = useState({});
  const [evalLoading, setEvalLoading] = useState(false);
  const [evaluatingAttempt, setEvaluatingAttempt] = useState(null);

  const toInt = (v) => {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number.parseInt(String(v), 10);
    return Number.isFinite(n) ? n : null;
  };

  const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

  // poolCounts: compute based on selected filters (subjectIds, difficulty, topic)
  // --- POOL CALCULATIONS ---
  const poolCounts = useMemo(() => {
    const filtered = questions.filter((q) => {
      const sid = String(q.subject?._id || q.subject || '');
      if (autoPickForm.subjectIds.length > 0 && !autoPickForm.subjectIds.includes(sid)) return false;
      if (autoPickForm.difficulty && q.difficulty !== autoPickForm.difficulty) return false;
      if (autoPickForm.topic && !(q.question || '').toLowerCase().includes(autoPickForm.topic.toLowerCase())) return false;
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

  const onMcqChange = (value) => {
    const mcqRaw = toInt(value);
    const total = toInt(autoPickForm.totalQuestions);

    if (!autoPickForm.useSplit) {
      // If split is off, ignore / keep empty
      setAutoPickForm((p) => ({ ...p, mcqCount: '' }));
      return;
    }

    if (!total) {
      alert('Set Total Questions first');
      return;
    }

    const mcq = clamp(mcqRaw ?? 0, 0, Math.min(total, poolCounts.mcq));
    setAutoPickForm((p) => ({ ...p, mcqCount: mcq }));
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

  const onTheoryChange = (value) => {
    const theoryRaw = toInt(value);
    const total = toInt(autoPickForm.totalQuestions);

    if (!autoPickForm.useSplit) {
      setAutoPickForm((p) => ({ ...p, theoryCount: '' }));
      return;
    }

    if (!total) {
      alert('Set Total Questions first');
      return;
    }

    const theory = clamp(theoryRaw ?? 0, 0, Math.min(total, poolCounts.theory));
    setAutoPickForm((p) => ({ ...p, theoryCount: theory }));
  };

  const onPassageChange = (value) => {
    const passageRaw = toInt(value);
    const total = toInt(autoPickForm.totalQuestions);

    if (!autoPickForm.useSplit) {
      setAutoPickForm((p) => ({ ...p, passageCount: '' }));
      return;
    }
    if (!total) {
      alert('Set Total Questions first');
      return;
    }
    const passage = clamp(passageRaw ?? 0, 0, Math.min(total, poolCounts.passage));
    setAutoPickForm((p) => ({ ...p, passageCount: passage }));
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      duration: 60,
      scheduledDate: '',
      startTime: '',
      endTime: '',
      customInstructionsText: '',
      instructionPdfFile: null,
      instructionPdf: '',
      removeInstructionPdf: false,
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormLoading(true);

    try {
      const examData = new FormData();
      examData.append('title', formData.title || '');
      examData.append('description', formData.description || '');
      examData.append('duration', Number(formData.duration));
      examData.append('scheduledDate', formData.scheduledDate || '');
      examData.append('startTime', formData.startTime || '');
      examData.append('endTime', formData.endTime || '');
      examData.append('customInstructions', formData.customInstructionsText || '');
      examData.append('shuffleQuestions', String(!!formData.shuffleQuestions));
      examData.append('shuffleOptions', String(!!formData.shuffleOptions));
      examData.append('removeInstructionPdf', String(!!formData.removeInstructionPdf));
      if (formData.instructionPdfFile) {
        examData.append('instructionPdfFile', formData.instructionPdfFile);
      }

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
      scheduledDate: exam.scheduledDate ? exam.scheduledDate.split('T')[0] : '',
      startTime: exam.startTime || '',
      endTime: exam.endTime || '',
      customInstructionsText: [
        ...(exam.instructions ? String(exam.instructions).split('\n') : []),
        ...(Array.isArray(exam.customInstructions) ? exam.customInstructions : [])
      ].map((x) => String(x).trim()).filter(Boolean).join('\n'),
      instructionPdfFile: null,
      instructionPdf: exam.instructionPdf || '',
      removeInstructionPdf: false,
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
    setQuestionFilter({ subject: '', type: '', difficulty: '' });
    setShowQuestionsModal(true);
  };

  // Open Assign Examinees Modal
  const openExamineesModal = (exam) => {
    setSelectedExam(exam);
    const assignedExamineeIds = exam.assignedTo?.map(e => e._id || e) || [];
    setSelectedExaminees(assignedExamineeIds);
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
      alert('Examinees assigned successfully!');
      setShowExamineesModal(false);
      refreshAll();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to assign examinees');
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
        ex.username.toLowerCase().includes(examineeFilter.search.toLowerCase());

      // active / inactive filter
      const statusMatch =
        !examineeFilter.status ||
        (examineeFilter.status === 'active' && ex.isActive) ||
        (examineeFilter.status === 'inactive' && !ex.isActive);

      return searchMatch && statusMatch;
    });
  };
  const filteredExaminees = getFilteredExaminees();

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
      // Fetch attempts (results)
      const res = await API.get(`/attempts/exam/${examId}`);
      const attempts = res.data.attempts || [];

      if (attempts.length === 0) {
        alert('No students have taken this exam yet.');
        return;
      }

      // Get full exam details for total marks
      const examRes = await API.get(`/exams/${examId}`);
      const exam = examRes.data.exam;

      const safeTitle = examTitle.replace(/[^a-zA-Z0-9]/g, '_');

      // Ask user: PDF or Excel?
      const wantsPDF = window.confirm(
        `Found ${attempts.length} results!\n\n✅ Click OK → Download as PDF\n❌ Click Cancel → Download as Excel`
      );

      if (wantsPDF) {
        generatePDF(exam, attempts, safeTitle);
      } else {
        generateExcel(exam, attempts, safeTitle);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to fetch results. Please try again.');
    }
  };

  const generateExcel = (exam, attempts, safeTitle) => {
    const data = attempts.map((attempt, index) => ({
      'S.No': index + 1,
      'Name': `${attempt.examinee.firstname} ${attempt.examinee.lastname}`,
      'Username': attempt.examinee.username,
      'Marks Obtained': attempt.totalMarksObtained || 0,
      'Total Marks': exam.totalMarks || 100,
      'Percentage': attempt.percentage ? attempt.percentage.toFixed(2) + '%' : '0%',
      'Status': (attempt.percentage || 0) >= (exam.passingMarks || 40) ? 'PASS' : 'FAIL',
      'Time Taken (min)': attempt.timeSpent ? Math.floor(attempt.timeSpent / 60) : 0,
      'Submitted At': new Date(attempt.submittedAt).toLocaleString()
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
        `${a.examinee.firstname} ${a.examinee.lastname}`,
        a.examinee.username,
        a.totalMarksObtained || 0,
        exam.totalMarks || 100,
        a.percentage ? a.percentage.toFixed(1) + '%' : '0%',
        (a.percentage || 0) >= (exam.passingMarks || 40) ? 'PASS' : 'FAIL',
        a.timeSpent ? Math.floor(a.timeSpent / 60) + ' min' : '-',
        new Date(a.submittedAt).toLocaleDateString()
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
      const pass = attempts.filter(a => (a.percentage || 0) >= (exam.passingMarks || 40)).length;
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
      const res = await API.get(`/attempts/${attemptId}/pdf`, {
        responseType: 'blob'
      });

      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `${username}_${examTitle}_result.pdf`.replace(/\s+/g, '_');
      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Failed to download PDF');
      console.error(err);
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
    if (!selectedExam?.resultMap) return;
    const evaluated = Object.values(selectedExam.resultMap).filter(
      (r) => r.status === 'evaluated' && r.attemptId
    );
    if (evaluated.length === 0) {
      alert('No evaluated attempts available for PDF download.');
      return;
    }

    const zip = new JSZip();

    for (const result of evaluated) {
      const user = (selectedExam.assignedTo || []).find(
        (e) => e._id && selectedExam.resultMap[e._id]?.attemptId === result.attemptId
      );
      const username = user?.username || 'examinee';
      // Sequential fetch keeps memory predictable
      const res = await API.get(`/attempts/${result.attemptId}/pdf`, {
        responseType: 'blob'
      });
      const filename = `${username}_${selectedExam.title}_result.pdf`.replace(/\s+/g, '_');
      zip.file(filename, res.data);
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = window.URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedExam.title || 'exam'}_results_pdfs.zip`.replace(/\s+/g, '_');
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  const submitEvaluation = async () => {
    try {
      setEvalLoading(true);

      const answers = Object.values(evaluationMap);

      if (answers.length === 0) {
        alert('Please evaluate at least one question');
        return;
      }

      await attemptService.evaluateTheory(
        evaluatingAttempt._id,
        answers
      );

      alert('Theory answers evaluated successfully');

      closeEvaluateModal();

      // 🔄 Refresh exam view
      openViewModal(selectedExam);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || 'Evaluation failed');
    } finally {
      setEvalLoading(false);
    }
  };

  if (!isReady) return <Loader />;

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
                <h1 className="text-2xl font-bold text-gray-800">Exams</h1>
                <p className="text-gray-500 mt-1">Create and manage your exams</p>
              </div>
              <button
                onClick={openCreateModal}
                className="mt-4 md:mt-0 inline-flex items-center px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
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
                <div className="col-span-full bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-3xl">📝</span>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">No Exams Found</h3>
                  <p className="text-gray-500 mb-4">Get started by creating your first exam.</p>
                  <button onClick={openCreateModal} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                    Create Exam
                  </button>
                </div>
              ) : (
                exams.map((exam) => {
                  const mode = getPickMode(exam);

                  return (
                    <div key={exam._id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
                      <div className="p-6">
                        <div className="flex items-start justify-between mb-3">
                          <h3 className="font-semibold text-gray-800 text-lg">{exam.title}</h3>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(exam.status)}`}>
                            {exam.status}
                          </span>
                        </div>
                        <p className="text-gray-500 text-sm mb-4 line-clamp-2">
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
                            {(() => {
                              const mode = getPickMode(exam);

                              if (mode === 'custom') {
                                return `${exam.questions.length} questions`;
                              }

                              if (mode === 'any') {
                                return `${exam.randomConfig?.totalQuestions || 0} questions`;
                              }

                              if (mode === 'split') {
                                return `${(exam.randomConfig?.mcqCount || 0) + (exam.randomConfig?.theoryCount || 0)} questions`;
                              }

                              return '0 questions';
                            })()}

                          </div>
                          <div className="flex items-center text-gray-600">
                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            {exam.assignedTo?.length || 0} assigned
                          </div>
                          <div className="flex items-center text-gray-600">
                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                            </svg>
                            {exam.selectionMode === 'manual' && (
                              <span>{exam.totalMarks} marks</span>
                            )}

                          </div>
                        </div>
                        <div className="mt-2 text-xs text-emerald-700 bg-emerald-50 px-3 py-1 rounded inline-flex items-center">
                          Completed: {exam.completedUsersCount || 0}
                        </div>

                        {/* Date and Time Info */}
                        {exam.scheduledDate && (
                          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                            <div className="flex items-center text-sm text-gray-600">
                              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              {new Date(exam.scheduledDate).toLocaleDateString()} | {exam.startTime} - {exam.endTime}
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
                          {exam.shuffleQuestions && <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded">Shuffled Q</span>}
                          {exam.shuffleOptions && <span className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded">Shuffled Options</span>}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="px-6 py-3 bg-gray-50 border-t border-gray-200">
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => openViewModal(exam)}
                            className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
                          >
                            👁️ View
                          </button>
                          {(exam.completedUsersCount || 0) > 0 && (
                            <button
                              onClick={() => downloadResults(exam._id, exam.title)}
                              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium text-sm transition shadow-md flex items-center gap-2"
                            >
                              Download Results
                            </button>
                          )}
                          <button
                            onClick={() => openQuestionsModal(exam)}
                            className="px-3 py-1.5 text-sm text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                          >
                            📝 Questions
                          </button>
                          <button
                            onClick={() => openAutoPickModal(exam)}
                            disabled={mode === 'custom'}
                            title={
                              mode === 'custom'
                                ? 'This exam uses Custom questions. Remove them to enable Auto Pick.'
                                : 'Automatically pick questions'
                            }
                            className="px-3 py-1.5 text-sm text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          >
                            🎲 Auto Pick
                          </button>
                          <button
                            onClick={() => openExamineesModal(exam)}
                            className="px-3 py-1.5 text-sm text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          >
                            👥 Examinees
                          </button>
                          <button
                            onClick={() => handleEdit(exam)}
                            className="px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            ✏️ Edit
                          </button>
                          <button
                            onClick={() => handleDelete(exam._id)}
                            className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            🗑️ Delete
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
        title={editingId ? 'Edit Exam' : 'Create Exam'}
        size="medium"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input
              type="text"
              placeholder="Enter exam title"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Shuffle Questions */}
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                className="w-4 h-4"
                checked={formData.shuffleQuestions}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, shuffleQuestions: e.target.checked }))
                }
              />
              Shuffle Questions
            </label>

            {/* Shuffle Options */}
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                className="w-4 h-4"
                checked={formData.shuffleOptions}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, shuffleOptions: e.target.checked }))
                }
              />
              Shuffle MCQ Options
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              placeholder="Enter exam description"
              rows="3"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Extra Instructions (one per line)</label>
            <textarea
              placeholder="Line 1&#10;Line 2&#10;Line 3"
              rows="4"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
              value={formData.customInstructionsText}
              onChange={(e) => setFormData({ ...formData, customInstructionsText: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Instruction PDF</label>
            <input
              type="file"
              accept="application/pdf"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              onChange={(e) => setFormData({
                ...formData,
                instructionPdfFile: e.target.files?.[0] || null,
                removeInstructionPdf: false
              })}
            />
            {formData.instructionPdf && !formData.instructionPdfFile && (
              <div className="mt-2 space-y-2">
                <a
                  href={toFileUrl(formData.instructionPdf)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline"
                >
                  Current PDF: {formData.instructionPdf.split('/').pop()}
                </a>
                {editingId && (
                  <label className="flex items-center gap-2 text-xs text-red-700">
                    <input
                      type="checkbox"
                      checked={!!formData.removeInstructionPdf}
                      onChange={(e) => setFormData((p) => ({
                        ...p,
                        removeInstructionPdf: e.target.checked,
                        instructionPdfFile: e.target.checked ? null : p.instructionPdfFile
                      }))}
                    />
                    Remove current PDF
                  </label>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Duration (minutes) *</label>
              <input
                type="number"
                min="1"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                value={formData.duration}
                onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
              <input
                type="date"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                value={formData.scheduledDate}
                onChange={(e) => setFormData({ ...formData, scheduledDate: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Time *</label>
              <input
                type="time"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                value={formData.startTime}
                onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Time *</label>
              <input
                type="time"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                value={formData.endTime}
                onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                required
              />
            </div>
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
              {editingId ? 'Update Exam' : 'Create Exam'}
            </button>
          </div>
        </form>
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
        <div className="space-y-4">
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-4 border-b border-gray-200">
            <select
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              value={questionFilter.subject}
              onChange={(e) => setQuestionFilter({ ...questionFilter, subject: e.target.value })}
            >
              <option value="">All Subjects</option>
              {(subjects.length > 0 ? subjects : getUniqueSubjects()).map((subject) => (
                <option key={subject._id} value={subject._id}>
                  {subject.name} ({subject.questionCount || subject.count || 0})
                </option>
              ))}
            </select>

            <select
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              value={questionFilter.type}
              onChange={(e) => setQuestionFilter({ ...questionFilter, type: e.target.value })}
            >
              <option value="">All Types</option>
              <option value="mcq">MCQ</option>
              <option value="theory">Theory</option>
            </select>

            <select
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              value={questionFilter.difficulty}
              onChange={(e) => setQuestionFilter({ ...questionFilter, difficulty: e.target.value })}
            >
              <option value="">All Difficulties</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>

          {/* Header with Select All */}
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="selectAllQuestions"
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
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
              <label htmlFor="selectAllQuestions" className="ml-2 text-sm font-medium text-gray-700">
                Select All Filtered ({getFilteredQuestions().length} questions)
              </label>
            </div>
            <span className="text-sm text-gray-500">
              {selectedQuestions.length} selected
            </span>
          </div>

          {/* Questions List */}
          <div className="max-h-96 overflow-y-auto space-y-2">
            {getFilteredQuestions().length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                {questions.length === 0
                  ? 'No questions available. Create questions first.'
                  : 'No questions found with selected filters.'}
              </div>
            ) : (
              getFilteredQuestions().map((question) => (
                <div
                  key={question._id}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors ${selectedQuestions.includes(question._id)
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                    }`}
                  onClick={() => toggleQuestionSelection(question._id)}
                >
                  <div className="flex items-start">
                    <input
                      type="checkbox"
                      className="w-4 h-4 mt-1 text-blue-600 rounded focus:ring-blue-500"
                      checked={selectedQuestions.includes(question._id)}
                      onChange={() => toggleQuestionSelection(question._id)}
                    />
                    <div className="ml-3 flex-1">
                      <p className="text-gray-800">{question.question}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <span
                          className="px-2 py-0.5 rounded text-xs font-medium text-white"
                          style={{ backgroundColor: question.subject?.color || '#6B7280' }}
                        >
                          {question.subject?.name || 'Unknown'}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${question.type === 'mcq' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                          }`}>
                          {question.type?.toUpperCase()}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${question.difficulty === 'easy' ? 'bg-green-100 text-green-700' :
                          question.difficulty === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                          {question.difficulty}
                        </span>
                        <span className="text-xs text-gray-500">{question.credit} marks</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-between items-center pt-4 border-t border-gray-200">
            <div className="text-sm text-gray-600">
              Total Marks: <span className="font-semibold">
                {questions
                  .filter(q => selectedQuestions.includes(q._id))
                  .reduce((sum, q) => sum + (q.credit || 0), 0)}
              </span>
            </div>
            <div className="flex space-x-3">
              <button
                type="button"
                onClick={() => {
                  setShowQuestionsModal(false);
                  setQuestionFilter({ subject: '', type: '', difficulty: '' });
                }}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveAssignedQuestions}
                disabled={formLoading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-blue-400 flex items-center"
              >
                {formLoading && (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                )}
                Save ({selectedQuestions.length} Questions)
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
          setExamineeFilter({ search: '', status: '' });
        }}
        title={`Assign Examinees to "${selectedExam?.title}"`}
        size="large"
      >
        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4 border-b border-gray-200">

          {/* Search */}
          <input
            type="text"
            placeholder="Search by name or username"
            value={examineeFilter.search}
            onChange={(e) =>
              setExamineeFilter({ ...examineeFilter, search: e.target.value })
            }
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
          />

          {/* Status */}
          <select
            value={examineeFilter.status}
            onChange={(e) =>
              setExamineeFilter({ ...examineeFilter, status: e.target.value })
            }
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        <div className="space-y-4">
          {/* Header with Select All */}
          <div className="flex items-center justify-between pb-4 border-b border-gray-200">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="selectAllExaminees"
                className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
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
              <label htmlFor="selectAllExaminees" className="ml-2 text-sm font-medium text-gray-700">
                Select All ({getFilteredExaminees().length} examinees)
              </label>
            </div>
            <span className="text-sm text-gray-500">
              {selectedExaminees.length} selected
            </span>
          </div>

          {/* Examinees List */}
          <div className="max-h-96 overflow-y-auto space-y-2">
            {getFilteredExaminees().length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No examinees available. Create examinees first.
              </div>
            ) : (
              getFilteredExaminees().map((examinee) => (
                <div
                  key={examinee._id}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors ${selectedExaminees.includes(examinee._id)
                    ? 'border-green-500 bg-green-50'
                    : 'border-gray-200 hover:border-gray-300'
                    }`}
                  onClick={() => toggleExamineeSelection(examinee._id)}
                >
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
                      checked={selectedExaminees.includes(examinee._id)}
                      onChange={() => toggleExamineeSelection(examinee._id)}
                    />
                    <div className="ml-3 flex items-center flex-1">
                      <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-white font-semibold mr-3">
                        {examinee.firstname?.charAt(0)}{examinee.lastname?.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-gray-800">
                          {examinee.firstname} {examinee.lastname}
                        </p>
                        <p className="text-sm text-gray-500">@{examinee.username}</p>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${examinee.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                      {examinee.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={() => setShowExamineesModal(false)}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={saveAssignedExaminees}
              disabled={formLoading}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-green-400 flex items-center"
            >
              {formLoading && (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
              )}
              Assign ({selectedExaminees.length} Examinees)
            </button>
          </div>
        </div>
      </Modal>

      {/* View Exam Details Modal */}
      <Modal
        isOpen={showViewModal}
        onClose={() => setShowViewModal(false)}
        title="Exam Details"
        size="large"
      >
        {selectedExam && (
          <div className="space-y-6">
            {/* Basic Info */}
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold text-gray-800">{selectedExam.title}</h3>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(selectedExam.status)}`}>
                {selectedExam.status}
              </span>
            </div>
            <p className="text-gray-500">{selectedExam.description || 'No description'}</p>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg text-center">
                <p className="text-2xl font-bold text-blue-600">{selectedExam.duration}</p>
                <p className="text-sm text-blue-600">Minutes</p>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg text-center">
                <p className="text-2xl font-bold text-purple-600">{selectedExam.questions?.length || 0}</p>
                <p className="text-sm text-purple-600">Questions</p>
              </div>
              <div className="bg-green-50 p-4 rounded-lg text-center">
                <p className="text-2xl font-bold text-green-600">{selectedExam.assignedTo?.length || 0}</p>
                <p className="text-sm text-green-600">Examinees</p>
              </div>
              <div className="bg-yellow-50 p-4 rounded-lg text-center">
                <p className="text-2xl font-bold text-yellow-600">{selectedExam.totalMarks || 0}</p>
                <p className="text-sm text-yellow-600">Total Marks</p>
              </div>
            </div>

            {/* Schedule */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-medium text-gray-800 mb-2">Schedule</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Date:</span>
                  <span className="ml-2 font-medium">
                    {selectedExam.scheduledDate ? new Date(selectedExam.scheduledDate).toLocaleDateString() : 'Not set'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Start Time:</span>
                  <span className="ml-2 font-medium">{selectedExam.startTime || 'Not set'}</span>
                </div>
                <div>
                  <span className="text-gray-500">End Time:</span>
                  <span className="ml-2 font-medium">{selectedExam.endTime || 'Not set'}</span>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-medium text-gray-800 mb-2">Instruction PDF</h4>
              {selectedExam.instructionPdf ? (
                <a
                  href={toFileUrl(selectedExam.instructionPdf)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline"
                >
                  View/Download: {selectedExam.instructionPdf.split('/').pop()}
                </a>
              ) : (
                <p className="text-sm text-gray-500">No PDF uploaded.</p>
              )}
            </div>

            {/* Assigned Questions */}
            <div>
              <h4 className="font-medium text-gray-800 mb-3">Assigned Questions ({selectedExam.questions?.length || 0})</h4>
              {selectedExam.questions?.length > 0 ? (
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {selectedExam.questions.map((q, index) => (
                    <div key={index} className="p-3 bg-gray-50 rounded-lg flex justify-between items-center">
                      <div className="flex-1">
                        <p className="text-sm text-gray-800 truncate">
                          {index + 1}. {q.question?.question || 'Question not found'}
                        </p>
                        {q.question?.subject && (
                          <span
                            className="inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium text-white"
                            style={{ backgroundColor: q.question.subject?.color || '#6B7280' }}
                          >
                            {q.question.subject?.name || 'Unknown'}
                          </span>
                        )}
                      </div>
                      <span className="ml-4 text-xs text-gray-500">
                        {q.question?.credit || 0} marks
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No questions assigned yet.</p>
              )}
            </div>

            {/* Assigned Examinees */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-gray-800">Assigned Examinees ({selectedExam.assignedTo?.length || 0})</h4>
                {Object.values(selectedExam.resultMap || {}).some((r) => r.status === 'evaluated') && (
                  <button
                    onClick={handleDownloadAllPDFs}
                    className="px-3 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700"
                  >
                    Download All PDFs
                  </button>
                )}
              </div>
              {selectedExam.assignedTo?.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  <div className="space-y-2">
                    {selectedExam.assignedTo.map((examinee) => {
                      const result = selectedExam.resultMap?.[examinee._id];

                      return (
                        <div
                          key={examinee._id}
                          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                        >
                          <div>
                            <p className="font-medium text-gray-800">
                              {examinee.firstname} {examinee.lastname}
                            </p>
                            <p className="text-sm text-gray-500">@{examinee.username}</p>
                          </div>

                          {!result ? (
                            <span className="px-3 py-1 text-xs rounded-full bg-gray-200 text-gray-600">
                              Not Attempted
                            </span>
                          ) : (
                            <div className="flex items-center gap-3">

                              {/* ⏳ Evaluation Pending */}
                              {result.status === 'submitted' && (
                                <span className="px-3 py-1 text-xs rounded-full bg-yellow-100 text-yellow-700 font-medium">
                                  Evaluation Pending
                                </span>
                              )}

                              {/* ✅ Evaluated Result */}
                              {result.status === 'evaluated' && (
                                <>
                                  <span className="text-sm font-semibold">
                                    {result.percentage?.toFixed(1)}%
                                  </span>

                                  <span
                                    className={`px-3 py-1 text-xs rounded-full font-medium ${result.percentage >= (selectedExam.passingMarks || 40)
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-red-100 text-red-700'
                                      }`}
                                  >
                                    {result.percentage >= (selectedExam.passingMarks || 40)
                                      ? 'PASS'
                                      : 'FAIL'}
                                  </span>
                                </>
                              )}

                              {/* ✅ Evaluate button */}
                              {result.status === 'submitted' && (
                                <button
                                  onClick={() => openEvaluateModal(result.attemptId)}
                                  className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                                >
                                  Evaluate
                                </button>
                              )}

                              {/* ✅ Download PDF */}
                              {result.status === 'evaluated' && (
                                <button
                                  onClick={() =>
                                    handleDownloadPDF(
                                      result.attemptId,
                                      examinee.username,
                                      selectedExam.title
                                    )
                                  }
                                  className="px-3 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700"
                                >
                                  Download PDF
                                </button>
                              )}
                            </div>
                          )}

                        </div>
                      );
                    })}
                  </div>

                </div>
              ) : (
                <p className="text-sm text-gray-500">No examinees assigned yet.</p>
              )}
            </div>

            {/* Close Button */}
            <div className="flex justify-end pt-4 border-t border-gray-200">
              <button
                onClick={() => setShowViewModal(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Auto Pick Questions Modal */}
      <Modal
        isOpen={showAutoPickModal}
        onClose={closeAutoPickModal}
        title={`Auto Pick Questions${autoPickExam?.title ? ` - ${autoPickExam.title}` : ''}`}
        size="large"
      >
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">Pick Mode</p>

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="radio"
              name="pickMode"
              checked={!autoPickForm.useSplit}
              onChange={() =>
                setAutoPickForm((p) => ({
                  ...p,
                  useSplit: false,
                  mcqCount: '',
                  theoryCount: '',
                  passageCount: '',
                }))
              }
            />
            <span>Any type (pick random from all questions)</span>
          </label>

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="radio"
              name="pickMode"
              checked={autoPickForm.useSplit}
              onChange={() =>
                setAutoPickForm((p) => ({
                  ...p,
                  useSplit: true,
                  mcqCount: p.mcqCount === '' ? 0 : p.mcqCount,
                  theoryCount: p.theoryCount === '' ? 0 : p.theoryCount,
                  passageCount: p.passageCount === '' ? 0 : p.passageCount,
                }))
              }
            />
            <span>Split (MCQ + Theory + Passage must equal Total)</span>
          </label>
        </div>
        <div className="space-y-4">
          {/* Numbers */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Total Questions</label>
              <input
                type="number"
                min="1"
                max={maxTotalAllowed}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                value={autoPickForm.totalQuestions}
                onChange={(e) => onTotalChange(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">
                Available: {poolCounts.total} (MCQ {poolCounts.mcq}, Theory {poolCounts.theory}, Passage {poolCounts.passage})
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">MCQ Count</label>
              <input
                type="number"
                min="0"
                max={maxMcqAllowed}
                disabled={!autoPickForm.useSplit}
                className={`w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 ${!autoPickForm.useSplit ? 'bg-gray-100 cursor-not-allowed' : ''
                  }`}
                value={autoPickForm.mcqCount}
                onChange={(e) => onMcqChange(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">
                Max: {maxMcqAllowed} (pool MCQ: {poolCounts.mcq})
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Theory Count</label>
              <input
                type="number"
                min="0"
                max={maxTheoryAllowed}
                disabled={!autoPickForm.useSplit}
                className={`w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 ${!autoPickForm.useSplit ? 'bg-gray-100 cursor-not-allowed' : ''
                  }`}
                value={autoPickForm.theoryCount}
                onChange={(e) => onTheoryChange(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">
                Max: {maxTheoryAllowed} (pool Theory: {poolCounts.theory})
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Passage Count</label>
              <input
                type="number"
                min="0"
                max={maxPassageAllowed}
                disabled={!autoPickForm.useSplit}
                className={`w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 ${!autoPickForm.useSplit ? 'bg-gray-100 cursor-not-allowed' : ''
                  }`}
                value={autoPickForm.passageCount}
                onChange={(e) => onPassageChange(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">
                Max: {maxPassageAllowed} (pool Passage: {poolCounts.passage})
              </p>
            </div>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Difficulty</label>
              <select
                className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                value={autoPickForm.difficulty}
                onChange={(e) => setAutoPickForm((p) => ({ ...p, difficulty: e.target.value }))}
              >
                <option value="">Any</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Topic contains</label>
              <input
                type="text"
                placeholder="e.g., Arrays, SQL Joins"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                value={autoPickForm.topic}
                onChange={(e) => setAutoPickForm((p) => ({ ...p, topic: e.target.value }))}
              />
            </div>
          </div>

          {/* Subjects */}
          <div>
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700">Subjects</label>
              <span className="text-xs text-gray-500">
                {autoPickForm.subjectIds.length} selected
              </span>
            </div>

            {subjects.length === 0 ? (
              <div className="mt-2 text-sm text-gray-500">
                No subjects found. Create subjects to filter by subject (optional).
              </div>
            ) : (
              <div className="mt-2 max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-3 space-y-2">
                {subjects.map((s) => (
                  <label key={s._id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-4 h-4"
                      checked={autoPickForm.subjectIds.includes(String(s._id))}
                      onChange={() => toggleSubject(s._id)}
                    />
                    <span
                      className="inline-block w-3 h-3 rounded-full"
                      style={{ backgroundColor: s.color || '#6B7280' }}
                    />
                    <span>{s.name}</span>
                    <span className="text-xs text-gray-400">({s.questionCount ?? 0})</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Shuffle */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              className="w-4 h-4"
              checked={autoPickForm.shuffleSelectedQuestions}
              onChange={(e) =>
                setAutoPickForm((p) => ({ ...p, shuffleSelectedQuestions: e.target.checked }))
              }
            />
            <span className="text-sm text-gray-700">Shuffle selected questions</span>
          </div>

          {/* Info */}
          <div className="p-3 rounded-lg bg-blue-50 text-blue-700 text-sm">
            Tip: If you want any-type random selection, keep split off.
            If you want a fixed split, MCQ + Theory + Passage must equal Total.
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={closeAutoPickModal}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={submitAutoPick}
              disabled={formLoading}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-indigo-300 flex items-center"
            >
              {formLoading && (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
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
      >
        {evaluatingAttempt ? (
          <div className="space-y-5">
            {/* Student Info */}
            <div className="bg-gray-50 p-3 rounded-lg">
              <p className="font-medium text-gray-800">
                {evaluatingAttempt.examinee.firstname}{' '}
                {evaluatingAttempt.examinee.lastname}
              </p>
              <p className="text-sm text-gray-500">
                @{evaluatingAttempt.examinee.username}
              </p>
            </div>

            {/* Theory Questions */}
            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              {[
                ...evaluatingAttempt.answers
                  .filter(a => a.question?.type === 'theory')
                  .map((ans) => ({
                    key: ans.question._id,
                    questionId: ans.question._id,
                    prompt: ans.question.question,
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
                        const resp = (ans.passageResponses || []).find((r) => String(r.subQuestionId) === String(sq._id));
                        return {
                          key: `${ans.question._id}-${sq._id}`,
                          questionId: ans.question._id,
                          subQuestionId: sq._id,
                          prompt: `${ans.question.question} | ${sq.prompt}`,
                          maxMarks: sq.credit,
                          textAnswer: resp?.textAnswer || '',
                          existingMarks: resp?.marksObtained ?? ''
                        };
                      })
                  )
              ].map((item, index) => (
                <div key={item.key} className="border border-gray-200 rounded-lg p-4">
                  <p className="font-medium text-gray-800">
                    Q{index + 1}. {item.prompt}
                  </p>

                  <p className="text-xs text-gray-500 mt-1">
                    Max Marks: {item.maxMarks}
                  </p>

                  <div className="mt-3 bg-gray-100 p-3 rounded text-sm text-gray-700 whitespace-pre-wrap">
                    {item.textAnswer || 'No answer submitted'}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                    <input
                      type="number"
                      min="0"
                      max={item.maxMarks}
                      placeholder={`Marks (0 - ${item.maxMarks})`}
                      defaultValue={item.existingMarks}
                      className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      onChange={(e) =>
                        updateEvaluation(item.questionId, {
                          ...(item.subQuestionId ? { subQuestionId: item.subQuestionId } : {}),
                          marksObtained: Number(e.target.value)
                        })
                      }
                    />

                    <input
                      type="text"
                      placeholder="Feedback (optional)"
                      className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      onChange={(e) =>
                        updateEvaluation(item.questionId, {
                          ...(item.subQuestionId ? { subQuestionId: item.subQuestionId } : {}),
                          feedback: e.target.value
                        })
                      }
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
              <button
                onClick={closeEvaluateModal}
                className="px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>

              <button
                onClick={submitEvaluation}
                disabled={evalLoading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400 flex items-center"
              >
                {evalLoading && (
                  <span className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                Submit Evaluation
              </button>
            </div>
          </div>
        ) : (
          <p className="text-gray-500">Loading attempt...</p>
        )}
      </Modal>

    </div>
  );
};

export default Exams;



