import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

// Authentication Pages
import RegisterPage from './pages/registerPage';
import LoginPage from './pages/loginPage';
import ForgotPasswordPage from './pages/forgotPasswordPage';
import ResetPasswordPage from './pages/resetPasswordPage';
import LogoutPage from './pages/logoutPage';
import ChangePassword from './pages/changePasswordPage';

// Student Feature Pages
import StudentDashboard from './pages/studentDashboard';
import BrowseProjectsPage from './pages/browseProjectsPage';
import MyPreferencesPage from './pages/myPreferencePage';
import MyProposalPage from './pages/myProposalPage';

// Supervisor Pages
import SupervisorDashboardPage from './pages/supervisorDashboardPage';
import SupervisorCreateProjectPage from './pages/supervisorCreateProjectPage';
import SuperVisorMyProjectsPage from './pages/supervisorMyProjectPage';

// Support Page
import HelpSupportPage from './pages/helpSupportPage';

/** Dynamic root redirect */
function RootRedirect() {
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || 'null');

  if (token && user?.role?.toLowerCase() === 'supervisor') {
    return <Navigate to="/supervisor-dashboard" replace />;
  }
  if (token && user?.role?.toLowerCase() === 'student') {
    return <Navigate to="/student-dashboard" replace />;
  }
  return <Navigate to="/login" replace />;
}

function App() {
  return (
    <Router>
      <Routes>
        {/* Smart root */}
        <Route path="/" element={<RootRedirect />} />

        {/* Auth Routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
        <Route path="/logout" element={<LogoutPage />} />
        <Route path="/change-password" element={<ChangePassword />} />

        {/* Student Routes */}
        <Route path="/student-dashboard" element={<StudentDashboard />} />
        <Route path="/browse-projects" element={<BrowseProjectsPage />} />
        <Route path="/my-preferences" element={<MyPreferencesPage />} />
        <Route path="/my-proposals" element={<MyProposalPage />} />

        {/* Supervisor Routes */}
        <Route path="/supervisor-dashboard" element={<SupervisorDashboardPage />} />
        <Route path="/supervisor/create-project" element={<SupervisorCreateProjectPage />} />

        {/* My Projects (active + archived share same component) */}
        <Route path="/supervisor/my-projects" element={<SuperVisorMyProjectsPage />} />
        <Route path="/supervisor/my-projects/archived" element={<SuperVisorMyProjectsPage />} />

        {/* Back-compat: old path redirects to new */}
        <Route path="/my-projects" element={<Navigate to="/supervisor/my-projects" replace />} />

        {/* Help & Support */}
        <Route path="/help-support" element={<HelpSupportPage />} />

        {/* Fallback -> root redirect */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
