import React, { useState, useEffect } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import Loader from '../../components/common/Loader';
import { attemptService } from '../../services/attemptService';

const MyResults = () => {
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAttempts();
  }, []);

  const fetchAttempts = async () => {
    try {
      const data = await attemptService.getMyAttempts();
      setAttempts(data.attempts || []);
    } catch (error) {
      console.error('Failed to fetch attempts:', error);
    } finally {
      setLoading(false);
    }
  };

  const downloadAttemptPDF = async (attempt) => {
    if (attempt.status !== 'evaluated') {
      alert('Result is not evaluated yet.');
      return;
    }
    const jsPDF = (await import('jspdf')).default;
    const doc = new jsPDF();

    const examTitle = attempt.exam.title;
    const username = attempt.examinee?.username || 'user';
    const submittedAt = new Date(attempt.submittedAt).toLocaleString();

    let y = 20;

    // ===== HEADER =====
    doc.setFontSize(11);
    doc.text(`Exam: ${examTitle}`, 14, y);

    y += 10;
    doc.setFontSize(11);
    doc.text(`Username: ${username}`, 14, y);

    y += 6;
    doc.text(`Submitted At: ${submittedAt}`, 14, y);

    y += 6;
    if (attempt.status === 'evaluated') {
      doc.text(
        `Score: ${attempt.totalMarksObtained} / ${attempt.totalMarksPossible}`,
        14,
        y
      );
    } else {
      doc.text('Score: Evaluation Pending', 14, y);
    }

    y += 10;
    doc.line(14, y, 195, y);
    y += 8;

    // ===== QUESTIONS =====
    attempt.answers.forEach((ans, index) => {
      const q = ans.question;

      doc.setFontSize(12);
      doc.text(
        `Q${index + 1}. ${q.question}`,
        14,
        y,
        { maxWidth: 180 }
      );
      y += 8;

      doc.setFontSize(11);

      // ===== MCQ =====
      if (q.type === 'mcq') {
        q.options.forEach((opt, i) => {
          const isSelected = ans.selectedOption === i;
          const marker = isSelected ? 'Selected' : '   ';

          doc.text(
            `${String.fromCharCode(65 + i)}. ${opt} ${marker}`,
            18,
            y
          );
          y += 6;
        });
      }

      // ===== THEORY =====
      if (q.type === 'theory') {
        doc.text(
          `Answer: ${ans.textAnswer || '-'}`,
          18,
          y,
          { maxWidth: 170 }
        );
        y += 8;
      }

      // ===== MARKS + RESULT =====
      doc.text(
        `Marks: ${ans.marksObtained} / ${q.credit}   |   ${ans.isCorrect ? 'Correct' : 'Incorrect'
        }`,
        18,
        y
      );

      y += 10;

      // Page break
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
    });

    const safeExam = examTitle.replace(/[^a-zA-Z0-9]/g, '_');
    doc.save(`${safeExam}_${username}.pdf`);
  };

  if (loading) return <Loader />;

  return (
    <div className="flex flex-col h-screen">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-gray-100 p-6">
          <div className="max-w-7xl mx-auto">
            <h1 className="text-3xl font-bold mb-6">My Exam Results</h1>

            {attempts.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-6 text-center">
                <p className="text-gray-600">You haven't attempted any exams yet.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {attempts.map((attempt) => (
                  <div
                    key={attempt._id}
                    className="bg-white rounded-lg shadow-md p-6"
                  >
                    <div className="flex justify-between items-start mb-4">
                      {attempt.status === 'evaluated' && (
                        <button
                          onClick={() => downloadAttemptPDF(attempt)}
                          className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
                        >
                          📄 Download PDF
                        </button>
                      )}

                      <div>
                        <h3 className="text-xl font-bold">{attempt.exam.title}</h3>
                        <p className="text-sm text-gray-500">
                          Attempted on: {new Date(attempt.submittedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${attempt.status === 'evaluated'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-yellow-100 text-yellow-800'
                        }`}>
                        {attempt.status === 'evaluated'
                          ? 'EVALUATED'
                          : 'EVALUATION PENDING'}

                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div className="text-center p-4 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-500">Total Marks</p>
                        <p className="text-xl font-bold">{attempt.exam.totalMarks}</p>
                      </div>

                      {attempt.status === 'evaluated' ? (
                        <>
                          <div className="text-center p-4 bg-blue-50 rounded-lg">
                            <p className="text-sm text-gray-500">Obtained</p>
                            <p className="text-xl font-bold">{attempt.totalMarksObtained}</p>
                          </div>

                          <div className="text-center p-4 bg-purple-50 rounded-lg">
                            <p className="text-sm text-gray-500">Percentage</p>
                            <p className="text-xl font-bold">
                              {attempt.percentage?.toFixed(1)}%
                            </p>
                          </div>
                        </>
                      ) : (
                        <div className="col-span-2 text-center p-4 bg-yellow-50 rounded-lg">
                          <p className="text-sm text-yellow-700 font-medium">
                            ⏳ Evaluation Pending
                          </p>
                        </div>
                      )}
                    </div>

                    {attempt.status === 'evaluated' && (
                      <div>
                        <h4 className="font-medium text-gray-700 mb-2">Question Analysis</h4>
                        <div className="space-y-2">
                          {attempt.answers.map((answer, index) => (
                            <div
                              key={index}
                              className={`p-3 rounded-lg text-sm ${answer.marksObtained === answer.question.credit
                                ? 'bg-green-50'
                                : 'bg-red-50'
                                }`}
                            >
                              <p className="font-medium">Question {index + 1}</p>
                              <p className="text-gray-600">Marks: {answer.marksObtained}/{answer.question.credit}</p>
                              {answer.feedback && (
                                <p className="mt-1 text-gray-700">{answer.feedback}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default MyResults;