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

// Support Page
import HelpSupportPage from './pages/helpSupportPage';

function App() {
  return (
    <Router>
      <Routes>
        {/* Redirect root path to login */}
        <Route path="/" element={<Navigate to="/login" />} />

        {/* Auth Routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
        <Route path="/logout" element={<LogoutPage />} />
        <Route path="/change-password" element={<ChangePassword />} />

        {/* Student Dashboard Routes */}
        <Route path="/student-dashboard" element={<StudentDashboard />} />
        <Route path="/browse-projects" element={<BrowseProjectsPage />} />
        <Route path="/my-preferences" element={<MyPreferencesPage />} />
        <Route path="/my-proposals" element={<MyProposalPage />} />

        {/* Help & Support */}
        <Route path="/help-support" element={<HelpSupportPage />} />
      </Routes>
    </Router>
  );
}

export default App;
