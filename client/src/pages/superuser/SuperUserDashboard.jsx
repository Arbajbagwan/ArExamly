import { Link } from 'react-router-dom';
import Navbar from '../../components/common/Navbar';
import Sidebar from '../../components/common/Sidebar';
import Loader from '../../components/common/Loader';
import { useExamContext } from '../../contexts/ExamContext';

const SuperUserDashboard = () => {

  const { exams, questions, examinees, isReady } = useExamContext();

  const stats = {
    exams: exams.length,
    questions: questions.length,
    examinees: examinees.length
  };

  if (!isReady) {
    return <Loader />;
  }

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
              <p className="text-gray-500 mt-1">Welcome back! Here's an overview of your exam portal.</p>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <Link to="/superuser/exams" className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg p-6 text-white hover:shadow-xl transition-shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-blue-100">Total Exams</p>
                    <p className="text-4xl font-bold mt-2">{stats.exams}</p>
                  </div>
                  <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center">
                    <span className="text-2xl">📝</span>
                  </div>
                </div>
                <p className="mt-4 text-blue-100 text-sm">Click to manage →</p>
              </Link>

              <Link to="/superuser/questions" className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow-lg p-6 text-white hover:shadow-xl transition-shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-purple-100">Questions</p>
                    <p className="text-4xl font-bold mt-2">{stats.questions}</p>
                  </div>
                  <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center">
                    <span className="text-2xl">❓</span>
                  </div>
                </div>
                <p className="mt-4 text-purple-100 text-sm">Click to manage →</p>
              </Link>

              <Link to="/superuser/examinees" className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-lg p-6 text-white hover:shadow-xl transition-shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-green-100">Examinees</p>
                    <p className="text-4xl font-bold mt-2">{stats.examinees}</p>
                  </div>
                  <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center">
                    <span className="text-2xl">👥</span>
                  </div>
                </div>
                <p className="mt-4 text-green-100 text-sm">Click to manage →</p>
              </Link>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Quick Actions</h2>
              <div className="flex flex-wrap gap-4">
                <Link to="/superuser/exams" className="inline-flex items-center px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors">
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Create Exam
                </Link>
                <Link to="/superuser/questions" className="inline-flex items-center px-4 py-2 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors">
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Add Question
                </Link>
                <Link to="/superuser/examinees" className="inline-flex items-center px-4 py-2 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors">
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Add Examinee
                </Link>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default SuperUserDashboard;