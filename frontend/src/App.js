import React, { useEffect, useRef, useState } from 'react';
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

const API = process.env.REACT_APP_API_URL || 'http://localhost:5000';

/* ============================
 * Small auth helpers (client)
 * ==========================*/
function isTokenValid(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload?.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}
function getUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
}
function logoutClient() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

/** Gate for protected pages */
function ProtectedRoute({ roles, children }) {
  const token = localStorage.getItem('token');
  if (!token || !isTokenValid(token)) {
    logoutClient();
    return <Navigate to="/login" replace />;
  }
  const role = getUser()?.role?.toLowerCase();
  if (roles && !roles.includes(role)) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

/** Root redirect that also validates with the server to catch blacklisted tokens */
function RootRedirect() {
  const [checking, setChecking] = useState(true);
  const [ok, setOk] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const controller = new AbortController();

    (async () => {
      const token = localStorage.getItem('token');

      // local checks first
      if (!token || !isTokenValid(token)) {
        logoutClient();
        setOk(false);
        setChecking(false);
        return;
      }

      // server verify (catches blacklisted/revoked)
      try {
        const res = await fetch(`${API}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: 'include',
          signal: controller.signal,
        });
        setOk(res.ok);
        if (!res.ok) logoutClient();
      } catch {
        // network error -> treat as not ok (force re-auth)
        logoutClient();
        setOk(false);
      } finally {
        setChecking(false);
      }
    })();

    return () => controller.abort();
  }, []);

  if (checking) {
    return <div style={{ padding: 24 }}>Checking session…</div>;
  }

  if (!ok) return <Navigate to="/login" replace />;

  const role = getUser()?.role?.toLowerCase();
  if (role === 'supervisor') return <Navigate to="/supervisor-dashboard" replace />;
  if (role === 'student') return <Navigate to="/student-dashboard" replace />;

  // unknown role -> reset
  logoutClient();
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
        <Route
          path="/change-password"
          element={
            <ProtectedRoute roles={['student', 'supervisor']}>
              <ChangePassword />
            </ProtectedRoute>
          }
        />

        {/* Student Routes (protected) */}
        <Route
          path="/student-dashboard"
          element={
            <ProtectedRoute roles={['student']}>
              <StudentDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/browse-projects"
          element={
            <ProtectedRoute roles={['student']}>
              <BrowseProjectsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my-preferences"
          element={
            <ProtectedRoute roles={['student']}>
              <MyPreferencesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my-proposals"
          element={
        <ProtectedRoute roles={['student']}>
        <MyProposalPage />
       </ProtectedRoute>
        }
       />


        {/* Supervisor Routes (protected) */}
        <Route
          path="/supervisor-dashboard"
          element={
            <ProtectedRoute roles={['supervisor']}>
              <SupervisorDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/supervisor/create-project"
          element={
            <ProtectedRoute roles={['supervisor']}>
              <SupervisorCreateProjectPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/supervisor/my-projects"
          element={
            <ProtectedRoute roles={['supervisor']}>
              <SuperVisorMyProjectsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/supervisor/my-projects/archived"
          element={
            <ProtectedRoute roles={['supervisor']}>
              <SuperVisorMyProjectsPage />
            </ProtectedRoute>
          }
        />

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
