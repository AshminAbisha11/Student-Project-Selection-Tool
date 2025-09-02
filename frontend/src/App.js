// ===== Top-level imports ONLY =====
import React, { useEffect, useRef, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";

// Authentication Pages
import RegisterPage from "./pages/registerPage";
import LoginPage from "./pages/loginPage";
import ForgotPasswordPage from "./pages/forgotPasswordPage";
import ResetPasswordPage from "./pages/resetPasswordPage";
import LogoutPage from "./pages/logoutPage";
import ChangePassword from "./pages/changePasswordPage";

// Student Feature Pages
import StudentDashboard from "./pages/studentDashboard";
import BrowseProjectsPage from "./pages/browseProjectsPage";
import MyPreferencesPage from "./pages/myPreferencePage";
import MyProposalPage from "./pages/myProposalPage";

// Supervisor Pages
import SupervisorDashboardPage from "./pages/supervisorDashboardPage";
import SupervisorCreateProjectPage from "./pages/supervisorCreateProjectPage";
import SuperVisorMyProjectsPage from "./pages/supervisorMyProjectPage";
import SupervisorProposalsPage from "./pages/supervisorProposalPage";
import SupervisorAllocatedStudentsPage from "./pages/supervisorAllocatedStudentsPage";

// Support Pages
import HelpSupportPage from "./pages/helpSupportPage";                 // student help
import SupervisorHelpSupportPage from "./pages/supervisorHelpSupportPage"; // supervisor help
import AdminHelpSupportPage from "./pages/adminHelpSupportPage";       // NEW: admin help

// Admin Pages
import AdminHomePage from "./pages/adminHomePage";
import AdminAllocationsPage from "./pages/adminAllocationPage";
import AdminSignupPage from "./pages/adminSignupPage";
import AdminLoginPage from "./pages/adminLoginPage";
import AdminCyclesPage from "./pages/adminCyclesPage"; // manage cycles (list/create/edit)

// Settings Pages
import ProfileSettingsPage from "./pages/supervisorProfileSettingsPage";

const API = process.env.REACT_APP_API_URL || "http://localhost:5000";

/* ============================
 * Small auth helpers (client)
 * ==========================*/
function parseJwt(token) {
  try {
    const part = token.split(".")[1] || "";
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}
function isTokenValid(token) {
  const payload = parseJwt(token);
  return !!payload && payload.exp * 1000 > Date.now();
}
function getUser() {
  try {
    const saved = JSON.parse(localStorage.getItem("user") || "null");
    if (saved && saved.role) return saved;
  } catch {}
  const token = localStorage.getItem("token");
  const payload = token ? parseJwt(token) : null;
  if (payload && payload.role) return { role: payload.role };
  return null;
}
function logoutClient() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}
function homeFor(role) {
  switch ((role || "").toLowerCase()) {
    case "student":
      return "/student-dashboard";
    case "supervisor":
      return "/supervisor-dashboard";
    case "admin":
      return "/admin";
    default:
      return "/login";
  }
}
function currentRole() {
  const u = getUser();
  return (u?.role || "").toLowerCase();
}

/** Gate for protected pages */
function ProtectedRoute({ roles, children }) {
  const token = localStorage.getItem("token");
  if (!token || !isTokenValid(token)) {
    logoutClient();
    return <Navigate to="/login" replace />;
  }
  const role = currentRole();
  if (roles && !roles.includes(role)) {
    // Send to user's home instead of login on role mismatch
    return <Navigate to={homeFor(role)} replace />;
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
      const token = localStorage.getItem("token");

      if (!token || !isTokenValid(token)) {
        logoutClient();
        setOk(false);
        setChecking(false);
        return;
      }

      try {
        const res = await fetch(`${API}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
          signal: controller.signal,
        });
        setOk(res.ok);
        if (!res.ok) logoutClient();
      } catch {
        logoutClient();
        setOk(false);
      } finally {
        setChecking(false);
      }
    })();

    return () => controller.abort();
  }, []);

  if (checking) return <div style={{ padding: 24 }}>Checking session…</div>;
  if (!ok) return <Navigate to="/login" replace />;

  const role = currentRole();
  if (role === "admin") return <Navigate to="/admin" replace />;
  if (role === "supervisor") return <Navigate to="/supervisor-dashboard" replace />;
  if (role === "student") return <Navigate to="/student-dashboard" replace />;

  logoutClient();
  return <Navigate to="/login" replace />;
}

/** Shared Help route that auto-picks the right page for the logged-in role */
function RoleSwitchHelp() {
  const role = currentRole();
  if (role === "admin") return <AdminHelpSupportPage />;
  if (role === "supervisor") return <SupervisorHelpSupportPage />;
  return <HelpSupportPage />;
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
            <ProtectedRoute roles={["student", "supervisor", "admin"]}>
              <ChangePassword />
            </ProtectedRoute>
          }
        />

        {/* Admin Routes */}
        <Route path="/admin-signup" element={<AdminSignupPage />} />
        <Route path="/admin-login" element={<AdminLoginPage />} />
        <Route
          path="/admin"
          element={
            <ProtectedRoute roles={["admin"]}>
              <AdminHomePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/allocations"
          element={
            <ProtectedRoute roles={["admin"]}>
              <AdminAllocationsPage />
            </ProtectedRoute>
          }
        />
        {/* Manage Cycles (list/create/edit) */}
        <Route
          path="/admin/cycles"
          element={
            <ProtectedRoute roles={["admin"]}>
              <AdminCyclesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/cycle/new"
          element={
            <ProtectedRoute roles={["admin"]}>
              <AdminCyclesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/cycle/:id"
          element={
            <ProtectedRoute roles={["admin"]}>
              <AdminCyclesPage />
            </ProtectedRoute>
          }
        />
        {/* Quick-action alias */}
        <Route path="/admin/invite-admin" element={<AdminSignupPage />} />

        {/* Admin help – dedicated routes */}
        <Route
          path="/admin/help-support"
          element={
            <ProtectedRoute roles={["admin"]}>
              <AdminHelpSupportPage />
            </ProtectedRoute>
          }
        />
        <Route path="/admin/help" element={<Navigate to="/admin/help-support" replace />} />

        {/* Legacy alias */}
        <Route path="/admin/dashboard" element={<Navigate to="/admin" replace />} />

        {/* Student Routes */}
        <Route
          path="/student-dashboard"
          element={
            <ProtectedRoute roles={["student"]}>
              <StudentDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/browse-projects"
          element={
            <ProtectedRoute roles={["student"]}>
              <BrowseProjectsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my-preferences"
          element={
            <ProtectedRoute roles={["student"]}>
              <MyPreferencesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my-proposals"
          element={
            <ProtectedRoute roles={["student"]}>
              <MyProposalPage />
            </ProtectedRoute>
          }
        />

        {/* Supervisor Routes */}
        <Route
          path="/supervisor-dashboard"
          element={
            <ProtectedRoute roles={["supervisor"]}>
              <SupervisorDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/supervisor/create-project"
          element={
            <ProtectedRoute roles={["supervisor"]}>
              <SupervisorCreateProjectPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/supervisor/my-projects"
          element={
            <ProtectedRoute roles={["supervisor"]}>
              <SuperVisorMyProjectsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/supervisor/my-projects/archived"
          element={
            <ProtectedRoute roles={["supervisor"]}>
              <SuperVisorMyProjectsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/supervisor/received-proposals"
          element={
            <ProtectedRoute roles={["supervisor"]}>
              <SupervisorProposalsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/supervisor-list/proposals"
          element={<Navigate to="/supervisor/received-proposals" replace />}
        />
        <Route
          path="/supervisor/allocated-students"
          element={
            <ProtectedRoute roles={["supervisor"]}>
              <SupervisorAllocatedStudentsPage />
            </ProtectedRoute>
          }
        />
        <Route path="/my-projects" element={<Navigate to="/supervisor/my-projects" replace />} />

        {/* Help & Support (role-switch; now supports admin too) */}
        <Route
          path="/help-support"
          element={
            <ProtectedRoute roles={["student", "supervisor", "admin"]}>
              <RoleSwitchHelp />
            </ProtectedRoute>
          }
        />
        <Route path="/help" element={<Navigate to="/help-support" replace />} />
        <Route
          path="/supervisor/help-support"
          element={
            <ProtectedRoute roles={["supervisor"]}>
              <SupervisorHelpSupportPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/supervisor/help"
          element={<Navigate to="/supervisor/help-support" replace />}
        />

        {/* Settings */}
        <Route
          path="/settings/profile"
          element={
            <ProtectedRoute roles={["student", "supervisor", "admin"]}>
              <ProfileSettingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute roles={["student", "supervisor", "admin"]}>
              <ProfileSettingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings/password"
          element={
            <ProtectedRoute roles={["student", "supervisor", "admin"]}>
              <ChangePassword />
            </ProtectedRoute>
          }
        />

        {/* Fallback -> root redirect */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
