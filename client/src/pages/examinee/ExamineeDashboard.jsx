import { useState, useEffect } from 'react';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import Loader from '../../components/common/Loader';
import { examService } from '../../services/examService';

const ExamineeDashboard = () => {
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchExams();
  }, []);

  const fetchExams = async () => {
    try {
      const data = await examService.getExams();
      setExams(data.exams || []);
    } catch (error) {
      console.error('Failed to fetch exams:', error);
    } finally {
      setLoading(false);
    }
  };

  const getQuestionCounts = (exam) => {
    // Custom mode
    if (exam.questions && exam.questions.length > 0) {
      let mcq = 0;
      let theory = 0;

      exam.questions.forEach(q => {
        const type = q.question?.type || q.type;
        if (type === 'mcq') mcq++;
        if (type === 'theory') theory++;
      });

      return { mcq, theory };
    }

    // Split mode
    if (
      exam.randomConfig &&
      ((exam.randomConfig.mcqCount || 0) + (exam.randomConfig.theoryCount || 0)) > 0
    ) {
      return {
        mcq: exam.randomConfig.mcqCount || 0,
        theory: exam.randomConfig.theoryCount || 0
      };
    }

    // Any mode
    return {
      mcq: exam.randomConfig?.totalQuestions || 0,
      theory: 0
    };
  };

  const formatDateTime = (exam) => {
    if (!exam.scheduledDate) return 'Not scheduled';

    const date = new Date(exam.scheduledDate).toLocaleDateString();
    const start = exam.startTime || '';
    const end = exam.endTime || '';

    return start && end ? `${date} | ${start} - ${end}` : date;
  };

  const getExamAction = (exam) => {
    if (exam.status !== 'active') return null;

    if (exam.myAttemptStatus === 'submitted') {
      return { type: 'submitted' };
    }

    if (exam.myAttemptStatus === 'in-progress') {
      return {
        type: 'link',
        label: 'Resume Exam',
        href: `/examinee/exam/${exam._id}`
      };
    }

    if (!exam.myAttemptStatus) {
      return {
        type: 'link',
        label: 'Take Exam',
        href: `/examinee/exam/${exam._id}`
      };
    }

    return null;
  };

  if (loading) return <Loader />;

  return (
    <div className="flex flex-col h-screen">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-gray-100 p-6">
          <div className="max-w-7xl mx-auto">
            <h1 className="text-3xl font-bold mb-6">Available Exams</h1>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {exams.length === 0 ? (
                <p className="text-gray-600 col-span-full text-center py-8">
                  No exams assigned to you yet.
                </p>
              ) : (
                exams.map((exam) => {
                  const { mcq, theory } = getQuestionCounts(exam);

                  return (
                    <div
                      key={exam._id}
                      className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition"
                    >
                      <h3 className="text-xl font-bold mb-2">{exam.title}</h3>
                      <p className="text-gray-600 mb-4">{exam.description || 'No description'}</p>

                      <div className="space-y-2 mb-4">

                        <div className="flex justify-between">
                          <span className="text-sm text-gray-500">Date & Time:</span>
                          <span className="text-sm font-medium">
                            {formatDateTime(exam)}
                          </span>
                        </div>

                        <div className="flex justify-between">
                          <span className="text-sm text-gray-500">Duration:</span>
                          <span className="text-sm font-medium">{exam.duration} mins</span>
                        </div>

                        <div className="flex justify-between">
                          <span className="text-sm text-gray-500">Questions:</span>
                          <span className="text-sm font-medium">
                            {mcq} MCQ{theory > 0 && `, ${theory} Theory`}
                          </span>
                        </div>

                        <div className="flex justify-between">
                          <span className="text-sm text-gray-500">Total Marks:</span>
                          <span className="text-sm font-medium">{exam.totalMarks}</span>
                        </div>

                        <div className="flex justify-between">
                          <span className="text-sm text-gray-500">Status:</span>
                          <span
                            className={`text-sm font-medium ${exam.status === 'active'
                              ? 'text-green-600'
                              : exam.status === 'scheduled'
                                ? 'text-blue-600'
                                : 'text-gray-600'
                              }`}
                          >
                            {exam.status.toUpperCase()}
                          </span>
                        </div>
                      </div>

                      {(() => {
                        const action = getExamAction(exam);
                        if (!action) return null;

                        // ✅ SUBMITTED badge (same position as button)
                        if (action.type === 'submitted') {
                          return (
                            <div className="w-full text-center py-2 rounded-lg bg-yellow-100 text-yellow-700 font-medium text-sm">
                              SUBMITTED
                            </div>
                          );
                        }

                        // ✅ Normal button
                        return (
                          <a
                            href={action.href}
                            className="block w-full text-center bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600 transition"
                          >
                            {action.label}
                          </a>
                        );
                      })()}

                    </div>
                  )
                })
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default ExamineeDashboard;