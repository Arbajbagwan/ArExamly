import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import PrivateRoute from './components/common/PrivateRoute';
import SessionChecker from './components/common/SessionChecker';

// Public Pages 
import Login from './pages/Login';

// Admin Pages
import AdminDashboard from './pages/admin/AdminDashboard';

// SuperUser Pages
import SuperUserDashboard from './pages/superuser/SuperUserDashboard';
import Exams from './pages/superuser/Exams';
import Subjects from './pages/superuser/Subjects';
import Questions from './pages/superuser/Questions';
import Examinees from './pages/superuser/Examinees';

// Examinee Pages
import ExamineeDashboard from './pages/examinee/ExamineeDashboard';
import TakeExam from './pages/examinee/TakeExam';
import MyResults from './pages/examinee/MyResults';

// Common Pages
import Unauthorized from './pages/Unauthorized';
import NotFound from './pages/NotFound';
import ChangePassword from './pages/ChangePassword';
import { ExamProvider } from './contexts/ExamContext';

function App() {
  return (
    <Router>
      <SessionChecker>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/unauthorized" element={<Unauthorized />} />
          <Route path="/change-password" element={<PrivateRoute allowedRoles={['admin', 'superuser', 'examinee']}> <ChangePassword /> </PrivateRoute>
          }
          />

          {/* ADMIN */}
          <Route
            path="/admin/*"
            element={
              <PrivateRoute allowedRoles={['admin']}>
                <AdminDashboard />
              </PrivateRoute>
            }
          />

          {/* SUPERUSER (ONLY place ExamProvider is allowed) */}
          <Route
            path="/superuser/*"
            element={
              <PrivateRoute allowedRoles={['superuser']}>
                <ExamProvider>
                  <Routes>
                    <Route path="dashboard" element={<SuperUserDashboard />} />
                    <Route path="exams" element={<Exams />} />
                    <Route path="subjects" element={<Subjects />} />
                    <Route path="questions" element={<Questions />} />
                    <Route path="examinees" element={<Examinees />} />
                  </Routes>
                </ExamProvider>
              </PrivateRoute>
            }
          />

          {/* EXAMINEE */}
          <Route
            path="/examinee/*"
            element={
              <PrivateRoute allowedRoles={['examinee']}>
                <Routes>
                  <Route path="dashboard" element={<ExamineeDashboard />} />
                  <Route path="exam/:examId" element={<TakeExam />} />
                  <Route path="results" element={<MyResults />} />
                </Routes>
              </PrivateRoute>
            }
          />

          {/* Default Routes */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </SessionChecker>
    </Router>
  );
}

export default App;