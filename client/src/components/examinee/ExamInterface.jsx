import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import API from '../../services/api';
import Timer from './Timer';
import aptaraLogo from '../../assets/aptara.png';
import { useAlert } from '../../contexts/AlertContext';

const ExamInterface = () => {
  // const renderHtml = (html) => ({ __html: String(html || '') });
  const renderHtml = (html) => {
    if (!html) return { __html: '' };
    const cleanedHtml = String(html)
      .replace('<p>', '')
      .replace('</p>', '');

    return { __html: cleanedHtml };
  }
  const resolveBackendBase = () => {
    const apiBase = API.defaults?.baseURL || import.meta.env.VITE_API_URL || '';

    if (!apiBase) return '';

    return apiBase.replace('/api', '');
  };

  const { examId } = useParams();
  const navigate = useNavigate();
  const { showAlert } = useAlert();
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
  const [serverNow, setServerNow] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const startedRef = useRef(false);
  const timeUpHandledRef = useRef(false);
  const pendingSaveTimeoutsRef = useRef(new Map());
  const pendingSavePayloadsRef = useRef(new Map());
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const countAttemptedQuestions = useCallback((answerMap) => (
    Object.values(answerMap || {}).filter((answer) => {
      const hasTopLevelAnswer =
        typeof answer?.selectedOption === 'number' ||
        (typeof answer?.textAnswer === 'string' && answer.textAnswer.trim() !== '');

      const hasPassageAnswer = Array.isArray(answer?.passageResponses) &&
        answer.passageResponses.some((response) =>
          response && (
            typeof response.selectedOption === 'number' ||
            (typeof response.textAnswer === 'string' && response.textAnswer.trim() !== '')
          )
        );

      return hasTopLevelAnswer || hasPassageAnswer;
    }).length
  ), []);

  const startExam = useCallback(async () => {
    setStarting(true);
    try {
      const { data } = await API.post(`/attempts/${examId}/start`);
      setExam(data.exam);
      setAttempt(data.attempt);
      setServerNow(data.serverNow || null);
      setExpiresAt(data.expiresAt || data.attempt?.expiresAt || null);

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
      await showAlert(error.response?.data?.message || 'Failed to start exam', { title: 'Unable to Start Exam' });
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
        await showAlert(error.response?.data?.message || 'Failed to load exam details', { title: 'Unable to Load Exam' });
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

  const getSaveKey = (questionId, subQuestionId) =>
    subQuestionId ? `${questionId}:${subQuestionId}` : `${questionId}:main`;

  const flushPendingSave = useCallback(async (key) => {
    const timeoutId = pendingSaveTimeoutsRef.current.get(key);
    if (timeoutId) {
      clearTimeout(timeoutId);
      pendingSaveTimeoutsRef.current.delete(key);
    }

    const pending = pendingSavePayloadsRef.current.get(key);
    if (!pending) return;

    pendingSavePayloadsRef.current.delete(key);
    await saveAnswer(pending.questionId, pending.answer);
  }, [attempt?._id]);

  const flushAllPendingSaves = useCallback(async () => {
    const keys = Array.from(pendingSavePayloadsRef.current.keys());
    for (const key of keys) {
      await flushPendingSave(key);
    }
  }, [flushPendingSave]);

  const queueTextSave = useCallback((questionId, answer, subQuestionId) => {
    const key = getSaveKey(questionId, subQuestionId);
    const existingTimeout = pendingSaveTimeoutsRef.current.get(key);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    pendingSavePayloadsRef.current.set(key, { questionId, answer });
    const timeoutId = setTimeout(() => {
      flushPendingSave(key);
    }, 800);
    pendingSaveTimeoutsRef.current.set(key, timeoutId);
  }, [flushPendingSave]);

  useEffect(() => {
    return () => {
      for (const timeoutId of pendingSaveTimeoutsRef.current.values()) {
        clearTimeout(timeoutId);
      }
      pendingSaveTimeoutsRef.current.clear();
      pendingSavePayloadsRef.current.clear();
    };
  }, []);

  const handleAnswerChange = (questionId, answer) => {
    if (!attempt?._id) return;

    setAnswers(prev => ({
      ...prev,
      [questionId]: answer
    }));

    if (Object.prototype.hasOwnProperty.call(answer, 'textAnswer')) {
      queueTextSave(questionId, answer);
      return;
    }

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

    if (Object.prototype.hasOwnProperty.call(answer, 'textAnswer')) {
      queueTextSave(questionId, { subQuestionId, ...answer }, subQuestionId);
      return;
    }

    saveAnswer(questionId, { subQuestionId, ...answer });
  };

  useEffect(() => {
    if (!exam?.questions?.length) return;
    const currentId = orderedQuestions[currentQuestionIndex]?.question?._id;
    if (!currentId) return;
    setVisitedQuestions((prev) => ({ ...prev, [currentId]: true }));
  }, [currentQuestionIndex, exam]);

  const handleSubmit = async (force = false, options = {}) => {
    if (!force && !window.confirm('Are you sure you want to submit? You cannot change answers after submission.')) {
      return;
    }

    const minimumAttemptQuestions = Number(exam?.minimumAttemptQuestions || 0);
    const attemptedQuestions = countAttemptedQuestions(answers);
    if (minimumAttemptQuestions > 0 && attemptedQuestions < minimumAttemptQuestions) {
      await showAlert(
        `You must attempt at least ${minimumAttemptQuestions} questions before submitting this exam.`,
        { title: 'Minimum Attempt Required' }
      );
      return;
    }

    if (submitting) return;
    setSubmitting(true);
    try {
      await flushAllPendingSaves();
      await API.post(`/attempts/${attempt._id}/submit`);
      if (options.showSuccessMessage !== false) {
        await showAlert(options.successMessage || 'Exam submitted successfully!', { title: 'Exam Submitted' });
      }
      navigate('/examinee/results');
    } catch (error) {
      await showAlert(error.response?.data?.message || 'Failed to submit exam', { title: 'Submit Failed' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleTimeUp = async () => {
    if (timeUpHandledRef.current) return;
    timeUpHandledRef.current = true;
    if (submitting) return;
    setSubmitting(true);
    try {
      await flushAllPendingSaves();
      await API.post(`/attempts/${attempt._id}/submit`);
      await showAlert('Your exam was auto-submitted because time is over.', {
        title: 'Time Over'
      });
      navigate('/examinee/results');
    } catch (error) {
      await showAlert(error.response?.data?.message || 'Failed to submit exam', { title: 'Submit Failed' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-screen bg-base-200"><span className="loading loading-spinner loading-lg"></span></div>;
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

    return (
      <div className="min-h-screen bg-base-200 p-4 md:p-4">
        <div className="max-w-5xl mx-auto">
          <img className="max-w-32 mb-3" src={aptaraLogo} alt="Logo" />
          <div className="bg-base-100 border border-base-300 shadow-lg overflow-hidden rounded-lg p-2 md:p-4">
            <h1 className="text-3xl font-semibold text-primary mb-4 text-center">General Instructions</h1>
            <div className="space-y-4 text-base-content">
              <p className="font-semibold">Please read the following instructions carefully before starting the exam:</p>
              <ul className="list-disc ml-6 space-y-2 text-sm md:text-base">
                <li>The total duration of the exam is <b>{previewExam.duration}</b> minutes with <b>{previewExam.questions?.length || 0}</b> questions.</li>
                <li>Question type split: <b>{qTypeCounts.mcq}</b> MCQ, <b>{qTypeCounts.theory}</b> Theory, <b>{qTypeCounts.passage}</b> Passage.</li>
                {Number(previewExam.minimumAttemptQuestions || 0) > 0 && (
                  <li>You must attempt at least <b>{previewExam.minimumAttemptQuestions}</b> questions before manual submission.</li>
                )}
                <li>The countdown timer in the top right corner will display the remaining time for the exam and when the timer reaches zero, the exam will get automatically submitted.</li>
                <li className="flex items-center">
                  Question palette colors:
                  <span className="w-4 h-4 bg-gray-300 mx-1 block"></span> gray = unvisited,
                  <span className="w-4 h-4 bg-green-200 mx-1 block"></span> green = answered,
                  <span className="w-4 h-4 bg-red-200 mx-1 block"></span> unanswered,
                  <span className="w-4 h-4 bg-blue-500 mx-1 block"></span> blue = current.
                </li>
                <li>To navigate questions, you can click on the question number in the Question Palette or use the Next/previous buttons.</li>
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

              <button onClick={startExam} disabled={!consentChecked || starting} className="btn btn-success">
                {starting ? 'Starting...' : 'PROCEED'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Group questions by type: mcq -> theory -> passage
  const orderedQuestions = [...exam.questions].sort((a, b) => {
    const order = { mcq: 1, theory: 2, passage: 3 };
    return order[a.question.type] - order[b.question.type];
  });

  const currentQuestion = orderedQuestions[currentQuestionIndex];
  const passage = currentQuestion.question?.passageRef || currentQuestion.question?.passage;

  const totalQuestions = orderedQuestions.length;

  const answeredCount = countAttemptedQuestions(answers);

  const visitedCount = Object.keys(visitedQuestions).length;
  const notAnswered = visitedCount - answeredCount;
  const notVisited = totalQuestions - visitedCount;

  return (
    <div className="min-h-screen bg-base-200 p-4">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-base-200 pb-2">
        <div className="bg-base-100 border border-base-300 shadow-md rounded-lg p-4 flex items-center justify-between">

          {/* Left - Exam Info */}
          <div>
            <h1 className="text-2xl font-bold">{exam.title}</h1>
          </div>

          <div className="text-sm flex gap-3 mt-1 justify-center">

            <span className="badge badge-success">
              Answered: {answeredCount}
            </span>

            <span className="badge badge-warning">
              Not Answered: {notAnswered}
            </span>

            <span className="badge badge-neutral">
              Not Visited: {notVisited}
            </span>

          </div>

          {/* Center - Timer */}
          <div className="text-center">
            <p className="text-sm text-base-content/70">Time Remaining</p>
            <Timer
              duration={exam.duration}
              startTime={attempt.startedAt}
              serverNow={serverNow}
              expiresAt={expiresAt}
              onTimeUp={handleTimeUp}
            />
          </div>

          {/* Right - Submit Button */}
          <div>
            <button
              onClick={() => setShowSubmitModal(true)}
              disabled={submitting}
              className="btn btn-success"
            >
              {submitting ? 'Submitting...' : 'Submit Exam'}
            </button>
          </div>

        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Question Navigation */}
        <div className="md:col-span-1">
          <div className="bg-base-100 border border-base-300 shadow-md rounded-lg p-4">
            <h3 className="font-bold mb-3">Questions</h3>
            <div className="grid grid-cols-5 md:grid-cols-5 lg:grid-cols-6 gap-2">
              {orderedQuestions.map((q, index) => {
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
                    className={`p-2 rounded text-xs ${currentQuestionIndex === index
                      ? 'bg-blue-500 text-white'
                      : isAnswered
                        ? 'bg-green-200'
                        : isVisited
                          ? 'bg-red-200'
                          : 'bg-base-300'
                      }`}
                  >
                    <div>{index + 1}</div>
                    <div className="text-[10px] opacity-70 uppercase">
                      {q.question.type.slice(0, 2).toUpperCase()}
                    </div>
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
                <div className="w-4 h-4 bg-base-300 rounded"></div>
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
          <div className="bg-base-100 border border-base-300 shadow-md rounded-lg p-6">
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
                  <div
                    className="text-sm text-indigo-900 leading-relaxed exam-image"
                    dangerouslySetInnerHTML={renderHtml(passage.text)}
                  />
                </div>
              )}
              <div className="flex justify-between items-start mb-2">
                <span className="text-sm font-semibold text-base-content/70">
                  Question {currentQuestionIndex + 1}
                </span>
                <span className="text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded">
                  {currentQuestion.question.credit} marks
                </span>
              </div>
              <div
                className="text-sm mb-3 exam-image break-words max-w-full overflow-hidden"
                dangerouslySetInnerHTML={renderHtml(currentQuestion.question.question)}
              />
            </div>

            {/* MCQ Options */}
            {currentQuestion.question.type === 'mcq' && (
              <div className="space-y-3">
                {currentQuestion.question.options.map((option, index) => (
                  <label
                    key={index}
                    className={`flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition ${answers[currentQuestion.question._id]?.selectedOption === index
                        ? 'border-primary bg-primary/10'
                        : 'border-base-300 hover:border-primary/40'
                      }`}
                  >
                    <input
                      type="radio"
                      name={`question-${currentQuestion.question._id}`}
                      checked={answers[currentQuestion.question._id]?.selectedOption === index}
                      onChange={() =>
                        handleAnswerChange(currentQuestion.question._id, {
                          selectedOption: Number(index),
                        })
                      }
                      className="mt-1"
                    />

                    <div
                      className="exam-image"
                      dangerouslySetInnerHTML={renderHtml(option)}
                    />
                  </label>
                ))}
              </div>
            )}

            {/* Theory Answer */}
            {currentQuestion.question.type === 'theory' && (
              <textarea
                className="textarea textarea-bordered w-full h-48"
                placeholder="Type your answer here..."
                value={answers[currentQuestion.question._id]?.textAnswer || ''}
                onChange={(e) => handleAnswerChange(currentQuestion.question._id, { textAnswer: e.target.value })}
                onBlur={() => flushPendingSave(getSaveKey(currentQuestion.question._id))}
              />
            )}

            {currentQuestion.question.type === 'passage' && (
              <div className="space-y-5">
                {(currentQuestion.question.subQuestions || []).map((sq, i) => {
                  const resp = (answers[currentQuestion.question._id]?.passageResponses || [])
                    .find((r) => String(r.subQuestionId) === String(sq._id));
                  return (
                    <div key={sq._id} className="border border-base-300 rounded-lg p-4">
                      <div className="flex justify-between mb-2">
                        <p className="font-medium">
                          Q{i + 1}. <span dangerouslySetInnerHTML={renderHtml(sq.prompt)} />
                        </p>
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">{sq.credit} marks</span>
                      </div>
                      {sq.type === 'mcq' && (
                        <div className="space-y-2">
                          {(sq.options || []).map((opt, idx) => (
                            <label key={idx} className="block p-4 border-2 rounded-lg cursor-pointer transition border-base-300 hover:border-primary/40">
                              <input
                                type="radio"
                                className="mr-2"
                                checked={resp?.selectedOption === idx}
                                onChange={() => handlePassageAnswerChange(currentQuestion.question._id, sq._id, { selectedOption: idx })}
                              />
                              <span dangerouslySetInnerHTML={renderHtml(opt)} />
                            </label>
                          ))}
                        </div>
                      )}
                      {sq.type === 'theory' && (
                        <textarea
                          className="textarea textarea-bordered w-full h-28"
                          placeholder="Type your answer..."
                          value={resp?.textAnswer || ''}
                          onChange={(e) => handlePassageAnswerChange(currentQuestion.question._id, sq._id, { textAnswer: e.target.value })}
                          onBlur={() => flushPendingSave(getSaveKey(currentQuestion.question._id, sq._id))}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex items-center justify-between mt-6">

              {/* Previous */}
              <button
                onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
                disabled={currentQuestionIndex === 0}
                className="btn btn-primary"
              >
                Previous
              </button>

              {/* Question Counter */}
              <div className="text-sm font-semibold bg-base-200 px-4 py-2 rounded">
                Question {currentQuestionIndex + 1} of {orderedQuestions.length}
              </div>

              {/* Next */}
              <button
                onClick={() =>
                  setCurrentQuestionIndex(prev =>
                    Math.min(orderedQuestions.length - 1, prev + 1)
                  )
                }
                disabled={currentQuestionIndex === orderedQuestions.length - 1}
                className="btn btn-primary"
              >
                Next
              </button>

            </div>
          </div>
        </div>
      </div>
      {showSubmitModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">

            <h3 className="text-lg font-bold mb-4">Submit Exam?</h3>

            <p className="text-sm mb-4">
              You cannot change answers after submission.
            </p>

            <div className="mb-4 text-sm space-y-1">
              <div>Answered: {answeredCount}</div>
              <div>Not Answered: {notAnswered}</div>
              <div>Not Visited: {notVisited}</div>
              {Number(exam.minimumAttemptQuestions || 0) > 0 && (
                <div>Minimum Required: {exam.minimumAttemptQuestions}</div>
              )}
            </div>

            <div className="flex justify-end gap-3">

              <button
                onClick={() => setShowSubmitModal(false)}
                className="btn btn-ghost"
              >
                Cancel
              </button>

              <button
                onClick={() => handleSubmit(true)}
                className="btn btn-error"
              >
                Submit
              </button>

            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExamInterface;
