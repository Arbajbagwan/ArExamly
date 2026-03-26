import { Link } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import Loader from '../../components/common/Loader';
import { useExamContext } from '../../contexts/ExamContext';
import AppCard from '../../components/common/AppCard';
import AppStatCard from '../../components/common/AppStatCard';

const SuperUserDashboard = () => {
  const { exams, questions, examinees, isReady } = useExamContext();

  const stats = {
    exams: exams.length,
    questions: questions.length,
    examinees: examinees.length
  };

  if (!isReady) return <Loader />;

  return (
    <div className="flex flex-col h-screen bg-base-200">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-3">
          <div className="max-w-7xl mx-auto">
            <div className="mb-8">
              <h1 className="text-2xl font-bold">Dashboard</h1>
              <p className="text-base-content/70 mt-1">
                Welcome back. Here is an overview of your exam portal.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <AppStatCard
                to="/superuser/exams"
                title="Total Exams"
                value={stats.exams}
                hint="Click to manage exams"
                tone="primary"
              />
              <AppStatCard
                to="/superuser/questions"
                title="Total Questions (All Exams)"
                value={stats.questions}
                hint="Click to manage questions"
                tone="secondary"
              />
              <AppStatCard
                to="/superuser/examinees"
                title="Total Users"
                value={stats.examinees}
                hint="Click to manage Users"
                tone="success"
              />
            </div>

            <AppCard title="Quick Actions">
              <div className="flex flex-wrap gap-3">
                <Link to="/superuser/exams" className="btn btn-primary btn-sm">Create Exam</Link>
                <Link to="/superuser/questions" className="btn btn-secondary btn-sm">Add Question</Link>
                <Link to="/superuser/examinees" className="btn btn-success btn-sm">Add Users</Link>
              </div>
            </AppCard>
          </div>
        </main>
      </div>
    </div>
  );
};

export default SuperUserDashboard;

