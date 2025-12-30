import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import API from '../../services/api';
import Timer from './Timer';

const ExamInterface = () => {
  const { examId } = useParams();
  const navigate = useNavigate();
  const [exam, setExam] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    startExam();
  }, [examId]);

  const startExam = async () => {
    try {
      const { data } = await API.post(`/attempts/${examId}/start`);
      setExam(data.exam);
      setAttempt(data.attempt);

      // Initialize answers from existing attempt
      const existingAnswers = {};
      data.attempt.answers.forEach(ans => {
        existingAnswers[ans.question] = {
          selectedOption: ans.selectedOption,
          textAnswer: ans.textAnswer
        };
      });
      setAnswers(existingAnswers);
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to start exam');
      navigate('/examinee/dashboard');
    } finally {
      setLoading(false);
    }
  };

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
    return <div>Error loading exam</div>;
  }

  const currentQuestion = exam.questions[currentQuestionIndex];

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
                const isAnswered = answers[q.question._id]?.selectedOption !== undefined ||
                  answers[q.question._id]?.textAnswer;
                return (
                  <button
                    key={q.question._id}
                    onClick={() => setCurrentQuestionIndex(index)}
                    className={`p-2 rounded ${currentQuestionIndex === index
                      ? 'bg-blue-500 text-white'
                      : isAnswered
                        ? 'bg-green-200'
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
                <span>Not Answered</span>
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