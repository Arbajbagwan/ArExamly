import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import API from '../../services/api';
import Timer from './Timer';
import aptaraLogo from '../../assets/aptara.png';

const ExamInterface = () => {
  const resolveBackendBase = () => {
    const envApi = import.meta.env.VITE_API_URL || '';
    const apiBase = API.defaults?.baseURL || envApi || '';

    if (/^https?:\/\//i.test(apiBase)) {
      return apiBase.replace(/\/api\/?$/, '');
    }

    // Relative '/api' style baseURL:
    // - in prod behind reverse proxy, uploads are usually on same origin
    // - in local dev without proxy, backend is typically :5000
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://localhost:5000';
    }
    return window.location.origin;
  };

  const { examId } = useParams();
  const navigate = useNavigate();
  const [exam, setExam] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [visitedQuestions, setVisitedQuestions] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [previewExam, setPreviewExam] = useState(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [starting, setStarting] = useState(false);
  const startedRef = useRef(false);

  const startExam = useCallback(async () => {
    setStarting(true);
    try {
      const { data } = await API.post(`/attempts/${examId}/start`);
      setExam(data.exam);
      setAttempt(data.attempt);

      // Initialize answers from existing attempt
      const existingAnswers = {};
      data.attempt.answers.forEach(ans => {
        existingAnswers[ans.question] = {
          selectedOption: ans.selectedOption,
          textAnswer: ans.textAnswer,
          passageResponses: ans.passageResponses || []
        };
      });
      setAnswers(existingAnswers);
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to start exam');
      navigate('/examinee/dashboard');
    } finally {
      setStarting(false);
      setLoading(false);
    }
  }, [examId, navigate]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const loadPreview = async () => {
      try {
        const { data } = await API.get(`/exams/${examId}`);
        setPreviewExam(data.exam || null);
      } catch (error) {
        alert(error.response?.data?.message || 'Failed to load exam details');
        navigate('/examinee/dashboard');
      } finally {
        setLoading(false);
      }
    };
    loadPreview();
  }, [examId, navigate]);

  const saveAnswer = async (questionId, answer) => {
    try {
      await API.put(`/attempts/${attempt._id}/answer`, {
        questionId,
        ...answer
      });
    } catch (error) {
      console.error('Failed to save answer:', error);
    }
  };

  const handleAnswerChange = (questionId, answer) => {
    if (!attempt?._id) return;

    setAnswers(prev => ({
      ...prev,
      [questionId]: answer
    }));

    // Auto-save
    saveAnswer(questionId, answer);
  };

  const handlePassageAnswerChange = (questionId, subQuestionId, answer) => {
    if (!attempt?._id) return;
    setAnswers((prev) => {
      const current = prev[questionId] || {};
      const list = current.passageResponses || [];
      const idx = list.findIndex((r) => String(r.subQuestionId) === String(subQuestionId));
      const payload = { subQuestionId, ...answer };
      const next = [...list];
      if (idx >= 0) next[idx] = { ...next[idx], ...payload };
      else next.push(payload);
      return {
        ...prev,
        [questionId]: {
          ...current,
          passageResponses: next
        }
      };
    });
    saveAnswer(questionId, { subQuestionId, ...answer });
  };

  useEffect(() => {
    if (!exam?.questions?.length) return;
    const currentId = exam.questions[currentQuestionIndex]?.question?._id;
    if (!currentId) return;
    setVisitedQuestions((prev) => ({ ...prev, [currentId]: true }));
  }, [currentQuestionIndex, exam]);

  const handleSubmit = async () => {
    if (!window.confirm('Are you sure you want to submit? You cannot change answers after submission.')) {
      return;
    }

    setSubmitting(true);
    try {
      await API.post(`/attempts/${attempt._id}/submit`);
      alert('Exam submitted successfully!');
      navigate('/examinee/results');
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to submit exam');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTimeUp = () => {
    alert('Time is up! Your exam will be auto-submitted.');
    handleSubmit();
  };

  if (loading) {
    return <div className="flex justify-center items-center h-screen">Loading exam...</div>;
  }

  if (!exam || !attempt) {
    if (!previewExam) return <div>Error loading exam</div>;

    const qTypeCounts = (previewExam.questions || []).reduce(
      (acc, qWrap) => {
        const t = qWrap?.question?.type;
        if (t === 'mcq') acc.mcq += 1;
        if (t === 'theory') acc.theory += 1;
        if (t === 'passage') acc.passage += 1;
        return acc;
      },
      { mcq: 0, theory: 0, passage: 0 }
    );

    const extraInstructions = [
      ...(previewExam.instructions ? String(previewExam.instructions).split('\n') : []),
      ...(Array.isArray(previewExam.customInstructions) ? previewExam.customInstructions : [])
    ].map((x) => String(x).trim()).filter(Boolean);
    const backendBase = resolveBackendBase();
    const instructionPdfUrl = previewExam.instructionPdf
      ? (String(previewExam.instructionPdf).startsWith('http')
        ? previewExam.instructionPdf
        : `${backendBase}${previewExam.instructionPdf}`)
      : '';

    return (
      <div className="min-h-screen bg-gray-100 p-4 md:p-6">
        <div className="max-w-5xl mx-auto">
          <img className="max-w-32 mb-3" src={aptaraLogo} alt="Logo" />
          <div className="bg-white shadow-lg overflow-hidden rounded-lg p-4 md:p-6">
            <h1 className="text-3xl font-semibold text-[#015b85] mb-4 text-center">General Instructions</h1>
            <div className="space-y-4 text-gray-700">
              <p className="font-semibold">Please read the following instructions carefully before starting the exam:</p>
              <ul className="list-disc ml-6 space-y-2 text-sm md:text-base">
                <li>The total duration of the exam is <b>{previewExam.duration}</b> minutes with <b>{previewExam.questions?.length || 0}</b> questions.</li>
                <li>Question type split: <b>{qTypeCounts.mcq}</b> MCQ, <b>{qTypeCounts.theory}</b> Theory, <b>{qTypeCounts.passage}</b> Passage.</li>
                <li>The countdown timer will display remaining time. When the timer reaches zero, exam will auto-submit.</li>
                <li>Question palette colors: gray = unvisited/unanswered, green = answered, blue = current.</li>
                <li>Use question numbers or Next/Previous buttons for navigation.</li>
                <li>Click <b>Submit Exam</b> to finish.</li>
              </ul>

              {extraInstructions.length > 0 && (
                <div>
                  <p className="font-semibold mt-4">Additional Instructions:</p>
                  <ul className="list-disc ml-6 mt-2 space-y-1 text-sm md:text-base">
                    {extraInstructions.map((instruction, index) => (
                      <li key={`extra-${index}`}>{instruction}</li>
                    ))}
                  </ul>
                </div>
              )}

              {instructionPdfUrl && (
                <div className="mt-4 space-y-1">
                  <a
                    href={instructionPdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-blue-600 hover:underline text-sm md:text-base"
                  >
                    View/Download Instruction PDF
                  </a>
                </div>
              )}
            </div>

            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mt-8">
              <label className="font-medium text-sm md:text-base">
                <input
                  type="checkbox"
                  className="mr-2"
                  checked={consentChecked}
                  onChange={(e) => setConsentChecked(e.target.checked)}
                />
                <span className="text-red-500">*</span> I have read and understood the instructions.
              </label>

              <button
                onClick={startExam}
                disabled={!consentChecked || starting}
                className="px-6 py-2 rounded bg-green-600 text-white hover:bg-green-700 disabled:bg-green-300 disabled:cursor-not-allowed"
              >
                {starting ? 'Starting...' : 'PROCEED'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const currentQuestion = exam.questions[currentQuestionIndex];
  const passage = currentQuestion.question?.passageRef || currentQuestion.question?.passage;

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      {/* Header */}
      <div className="bg-white shadow-md p-4 mb-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">{exam.title}</h1>
          <p className="text-gray-600">Question {currentQuestionIndex + 1} of {exam.questions.length}</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-600">Time Remaining</p>
          <Timer
            duration={exam.duration}
            startTime={attempt.startedAt}
            onTimeUp={handleTimeUp}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Question Navigation */}
        <div className="md:col-span-1">
          <div className="bg-white shadow-md rounded-lg p-4">
            <h3 className="font-bold mb-3">Questions</h3>
            <div className="grid grid-cols-5 md:grid-cols-4 gap-2">
              {exam.questions.map((q, index) => {
                const qid = q.question._id;
                const currentAns = answers[qid] || {};
                const hasTopLevelAnswer =
                  currentAns?.selectedOption !== undefined ||
                  (typeof currentAns?.textAnswer === 'string' && currentAns.textAnswer.trim() !== '');
                const hasPassageAnswer = Array.isArray(currentAns?.passageResponses) &&
                  currentAns.passageResponses.some((r) =>
                    r &&
                    (
                      r.selectedOption !== undefined ||
                      (typeof r.textAnswer === 'string' && r.textAnswer.trim() !== '')
                    )
                  );
                const isAnswered = hasTopLevelAnswer || hasPassageAnswer;
                const isVisited = !!visitedQuestions[qid];
                return (
                  <button
                    key={qid}
                    onClick={() => setCurrentQuestionIndex(index)}
                    className={`p-2 rounded ${currentQuestionIndex === index
                      ? 'bg-blue-500 text-white'
                      : isAnswered
                        ? 'bg-green-200'
                        : isVisited
                          ? 'bg-red-200'
                          : 'bg-gray-200'
                      }`}
                  >
                    {index + 1}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 text-sm">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-4 h-4 bg-green-200 rounded"></div>
                <span>Answered</span>
              </div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-4 h-4 bg-gray-200 rounded"></div>
                <span>Not Visited</span>
              </div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-4 h-4 bg-red-200 rounded"></div>
                <span>Visited</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-blue-500 rounded"></div>
                <span>Current</span>
              </div>
            </div>
          </div>
        </div>

        {/* Question Display */}
        <div className="md:col-span-3">
          <div className="bg-white shadow-md rounded-lg p-6">
            <div className="mb-4">
              {passage?.text && (
                <div className="mb-5 p-4 rounded-lg border border-indigo-200 bg-indigo-50">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="px-2 py-1 text-xs rounded bg-indigo-700 text-white font-semibold">
                      Passage
                    </span>
                    {passage.topic && (
                      <span className="text-xs font-medium text-indigo-700">
                        Topic: {passage.topic}
                      </span>
                    )}
                    {passage.complexity && (
                      <span className="text-xs font-medium uppercase text-indigo-700">
                        {passage.complexity}
                      </span>
                    )}
                    {passage.marksLabel && (
                      <span className="text-xs font-medium text-indigo-700">
                        {passage.marksLabel}
                      </span>
                    )}
                  </div>
                  {passage.title && (
                    <h3 className="text-base font-semibold text-indigo-900 mb-2">{passage.title}</h3>
                  )}
                  <p className="text-sm text-indigo-900 whitespace-pre-wrap leading-relaxed">
                    {passage.text}
                  </p>
                </div>
              )}
              <div className="flex justify-between items-start mb-2">
                <span className="text-sm font-semibold text-gray-600">
                  Question {currentQuestionIndex + 1}
                </span>
                <span className="text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded">
                  {currentQuestion.question.credit} marks
                </span>
              </div>
              <p className="text-lg mb-4">{currentQuestion.question.question}</p>
            </div>

            {/* MCQ Options */}
            {currentQuestion.question.type === 'mcq' && (
              <div className="space-y-3">
                {currentQuestion.question.options.map((option, index) => (
                  <label
                    key={index}
                    className={`block p-4 border-2 rounded-lg cursor-pointer transition ${answers[currentQuestion.question._id]?.selectedOption === index
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-300'
                      }`}
                  >
                    <input
                      type="radio"
                      name={`question-${currentQuestion.question._id}`}
                      checked={answers[currentQuestion.question._id]?.selectedOption === index}
                      onChange={() => handleAnswerChange(currentQuestion.question._id, { selectedOption: Number(index) })}
                      className="mr-3"
                    />
                    {option}
                  </label>
                ))}
              </div>
            )}

            {/* Theory Answer */}
            {currentQuestion.question.type === 'theory' && (
              <textarea
                className="w-full h-48 p-4 border-2 rounded-lg focus:border-blue-500 focus:outline-none"
                placeholder="Type your answer here..."
                value={answers[currentQuestion.question._id]?.textAnswer || ''}
                onChange={(e) => handleAnswerChange(currentQuestion.question._id, { textAnswer: e.target.value })}
              />
            )}

            {currentQuestion.question.type === 'passage' && (
              <div className="space-y-5">
                {(currentQuestion.question.subQuestions || []).map((sq, i) => {
                  const resp = (answers[currentQuestion.question._id]?.passageResponses || [])
                    .find((r) => String(r.subQuestionId) === String(sq._id));
                  return (
                    <div key={sq._id} className="border rounded-lg p-4">
                      <div className="flex justify-between mb-2">
                        <p className="font-medium">Q{i + 1}. {sq.prompt}</p>
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">{sq.credit} marks</span>
                      </div>
                      {sq.type === 'mcq' && (
                        <div className="space-y-2">
                          {(sq.options || []).map((opt, idx) => (
                            <label key={idx} className="block p-2 border rounded cursor-pointer">
                              <input
                                type="radio"
                                className="mr-2"
                                checked={resp?.selectedOption === idx}
                                onChange={() => handlePassageAnswerChange(currentQuestion.question._id, sq._id, { selectedOption: idx })}
                              />
                              {opt}
                            </label>
                          ))}
                        </div>
                      )}
                      {sq.type === 'theory' && (
                        <textarea
                          className="w-full h-28 p-3 border rounded-lg"
                          placeholder="Type your answer..."
                          value={resp?.textAnswer || ''}
                          onChange={(e) => handlePassageAnswerChange(currentQuestion.question._id, sq._id, { textAnswer: e.target.value })}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex justify-between mt-6">
              <button
                onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
                disabled={currentQuestionIndex === 0}
                className="px-6 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50"
              >
                Previous
              </button>

              {currentQuestionIndex === exam.questions.length - 1 ? (
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
                >
                  {submitting ? 'Submitting...' : 'Submit Exam'}
                </button>
              ) : (
                <button
                  onClick={() => setCurrentQuestionIndex(prev => Math.min(exam.questions.length - 1, prev + 1))}
                  className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                >
                  Next
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExamInterface;
