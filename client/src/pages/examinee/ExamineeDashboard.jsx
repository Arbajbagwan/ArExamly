import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import Loader from '../../components/common/Loader';
import { examService } from '../../services/examService';
import AppCard from '../../components/common/AppCard';

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
      let passage = 0;

      exam.questions.forEach(q => {
        const type = q.question?.type || q.type;
        if (type === 'mcq') mcq++;
        if (type === 'theory') theory++;
        if (type === 'passage') passage++;
      });

      return { mcq, theory, passage };
    }

    // Split mode
    if (
      exam.randomConfig &&
      ((exam.randomConfig.mcqCount || 0) + (exam.randomConfig.theoryCount || 0) + (exam.randomConfig.passageCount || 0)) > 0
    ) {
      return {
        mcq: exam.randomConfig.mcqCount || 0,
        theory: exam.randomConfig.theoryCount || 0,
        passage: exam.randomConfig.passageCount || 0
      };
    }

    // Any mode
    return {
      mcq: exam.randomConfig?.totalQuestions || 0,
      theory: 0,
      passage: 0
    };
  };

  const formatDateTime = (exam) => {
    if (exam.startAt && exam.endAt) {
      return `${new Date(exam.startAt).toLocaleString()} - ${new Date(exam.endAt).toLocaleString()}`;
    }
    if (!exam.scheduledDate) return 'Not scheduled';
    const date = new Date(exam.scheduledDate).toLocaleDateString();
    const start = exam.startTime || '';
    const end = exam.endTime || '';
    return start && end ? `${date} | ${start} - ${end}` : date;
  };

  const getExamAction = (exam) => {
    if (exam.myAttemptStatus === 'evaluated') {
      return { type: 'evaluated' };
    }

    const hasSubmittedAt = Boolean(exam.myAttemptSubmittedAt);

    if ((exam.myAttemptStatus === 'submitted' || exam.myAttemptStatus === 'auto-submitted') && hasSubmittedAt) {
      return { type: 'submitted' };
    }

    if (exam.myAttemptStatus === 'in-progress') {
      return {
        type: 'link',
        label: 'Resume Exam',
        href: `/examinee/exam/${exam._id}`
      };
    }

    if (exam.status === 'active' && !exam.myAttemptStatus) {
      return {
        type: 'link',
        label: 'Start Exam',
        href: `/examinee/exam/${exam._id}`
      };
    }

    // Handle inconsistent legacy rows where status says submitted but submittedAt is missing.
    if ((exam.myAttemptStatus === 'submitted' || exam.myAttemptStatus === 'auto-submitted') && !hasSubmittedAt) {
      return {
        type: 'link',
        label: 'Resume Exam',
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
        <main className="flex-1 overflow-y-auto bg-base-200 p-3">
          <div className="max-w-7xl mx-auto">
            <h1 className="text-3xl font-bold mb-6">Exams</h1>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {exams.length === 0 ? (
                <p className="text-gray-600 col-span-full text-center py-8">
                  No exams assigned to you yet.
                </p>
              ) : (
                exams.map((exam) => {
                  const { mcq, theory, passage } = getQuestionCounts(exam);

                  return (
                    <AppCard key={exam._id} className="hover:shadow-md transition-shadow">
                      <h3 className="text-xl font-bold mb-2">{exam.title}</h3>
                      <p className="text-base-content/70 mb-2">{exam.description || 'No description'}</p>

                      <div className="space-y-2 mb-2">

                        <div className="flex justify-between">
                          <span className="text-sm text-base-content/70">Date & Time:</span>
                          <span className="text-sm font-medium">
                            {formatDateTime(exam)}
                          </span>
                        </div>

                        <div className="flex justify-between">
                          <span className="text-sm text-base-content/70">Duration:</span>
                          <span className="text-sm font-medium">{exam.duration} mins</span>
                        </div>

                        <div className="flex justify-between">
                          <span className="text-sm text-base-content/70">Questions:</span>
                          <span className="text-sm font-medium">
                            {mcq} MCQ{theory > 0 && `, ${theory} Theory`}{passage > 0 && `, ${passage} Passage`}
                          </span>
                        </div>

                        <div className="flex justify-between">
                          <span className="text-sm text-base-content/70">Total Marks:</span>
                          <span className="text-sm font-medium">{exam.totalMarks}</span>
                        </div>

                        <div className="flex justify-between">
                          <span className="text-sm text-base-content/70">Status:</span>
                          <span className={`badge badge-sm ${exam.status === 'active' ? 'badge-success' : exam.status === 'scheduled' ? 'badge-info' : 'badge-neutral'}`}>
                            {exam.status.toUpperCase()}
                          </span>
                        </div>
                      </div>

                      {(() => {
                        const action = getExamAction(exam);
                        if (!action) return null;

                        if (action.type === 'submitted') {
                          return (
                            <div className="w-full text-center py-2 rounded-lg bg-warning/20 text-warning font-medium text-sm">
                              Pending Evaluation
                            </div>
                          );
                        }

                        if (action.type === 'evaluated') {
                          return (
                            <Link
                              to="/examinee/results"
                              className="btn btn-success btn-sm w-full"
                            >
                              Completed - View Result
                            </Link>
                          );
                        }

                        return (
                          <Link
                            to={action.href}
                            className="btn btn-primary btn-sm w-full"
                          >
                            {action.label}
                          </Link>
                        );
                      })()}

                    </AppCard>
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
