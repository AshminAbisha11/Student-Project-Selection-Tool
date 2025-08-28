// StudentDashboard.js
import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import './studentDashboard.css';
import Sidebar from '../components/sideBar';
import ProfileDropdown from '../components/profileDropdown';
import StudentProposalModal from '../components/studentProposalModal';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5000';

/* ---------- Portal modal for Preferred Projects ---------- */
function PreferencesModal({ open, onClose, items, loading, error }) {
  if (!open) return null;

  return createPortal(
    <div className="ppm-overlay" role="dialog" aria-modal="true" aria-label="Preferred Projects" onClick={onClose}>
      <div className="ppm-panel" onClick={(e) => e.stopPropagation()}>
        <button className="ppm-close" onClick={onClose} aria-label="Close">✕</button>
        <h3 className="ppm-title">Preferred Projects</h3>

        {loading ? (
          <p>Loading…</p>
        ) : error ? (
          <p style={{ color: '#b00' }}>{error}</p>
        ) : items.length === 0 ? (
          <p>You haven’t added any preferences yet.</p>
        ) : (
          <div className="ppm-list">
            {items.map((pref, index) => (
              <div className="ppm-card" key={pref.preference_id ?? `${pref.project_id}-${index}`}>
                <h4>{index + 1}. {pref.title}</h4>
                {pref.description && <p>{pref.description}</p>}
                {pref.supervisor_name && <p className="ppm-meta">Supervisor: {pref.supervisor_name}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

/* ---------- My Allocation Modal (tidy + no cycle) ---------- */
function AllocationModal({ open, onClose, data, loading, error }) {
  if (!open) return null;

  const formatDateTime = (iso) => (iso ? new Date(iso).toLocaleString() : '');

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      alert('Copied to clipboard');
    } catch {}
  };

  return createPortal(
    <div className="ppm-overlay" role="dialog" aria-modal="true" aria-label="My Allocation" onClick={onClose}>
      <div className="ppm-panel" onClick={(e) => e.stopPropagation()}>
        <button className="ppm-close" onClick={onClose} aria-label="Close">✕</button>
        <h3 className="ppm-title">My Allocation</h3>

        {loading ? (
          <p>Loading…</p>
        ) : error ? (
          <p style={{ color: '#b00' }}>{error}</p>
        ) : !data ? (
          <div className="ppm-empty">
            <p>You haven’t been allocated yet.</p>
            <p className="ppm-meta">Tip: Make sure you’ve added preferences and contacted a supervisor.</p>
          </div>
        ) : (
          <div className="ppm-card alloc-card">
            <h4 className="alloc-title">{data.project_title}</h4>
            {data.project_description && <p className="alloc-desc">{data.project_description}</p>}

            <div className="alloc-row">
              <span className="alloc-label">Supervisor</span>
              <span className="alloc-value">{data.supervisor_name || '—'}</span>
            </div>

            {data.supervisor_email && (
              <div className="alloc-row">
                <span className="alloc-label">Email</span>
                <div className="alloc-inline">
                  <a className="alloc-email" href={`mailto:${data.supervisor_email}`}>{data.supervisor_email}</a>
                  <button className="ppm-chip" onClick={() => copy(data.supervisor_email)}>Copy email</button>
                </div>
              </div>
            )}

            {data.allocated_at && (
              <div className="alloc-row">
                <span className="alloc-label">Allocated</span>
                <span className="alloc-value">{formatDateTime(data.allocated_at)}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

export default function StudentDashboard() {
  const navigate = useNavigate();

  const [dashboardData, setDashboardData] = useState({
    stats: { preferencesSubmitted: 0, proposalsSent: 0 },
  });

  const token = localStorage.getItem('token');
  const user = (() => { try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; } })();
  const userId = user?.user_id;
  const studentName = user?.name || 'Student';

  const [showPrefModal, setShowPrefModal] = useState(false);
  const [showProposalModal, setShowProposalModal] = useState(false);

  // Allocation state (summary + modal)
  const [showAllocModal, setShowAllocModal] = useState(false);
  const [alloc, setAlloc] = useState(null);
  const [allocLoading, setAllocLoading] = useState(false);
  const [allocErr, setAllocErr] = useState('');

  const [preferences, setPreferences] = useState([]);
  const [prefLoading, setPrefLoading] = useState(false);
  const [prefErr, setPrefErr] = useState('');

  // Auth guard
  useEffect(() => {
    if (!token || !user) {
      navigate('/login', { replace: true });
      return;
    }
    if (String(user.role).toLowerCase() !== 'student') {
      navigate('/supervisor-dashboard', { replace: true });
    }
  }, [navigate, token, user]);

  // Dashboard stats
  useEffect(() => {
    if (!userId || !token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`${API}/dashboard/${userId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!cancelled) setDashboardData(res.data);
      } catch (err) {
        if (err.response?.status === 401 || err.response?.status === 403) {
          alert('Session expired. Please log in again.');
          localStorage.clear();
          navigate('/login', { replace: true });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [userId, token, navigate]);

  // Preload allocation so the top section can show a summary
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`${API}/allocations/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!cancelled) setAlloc(res.data ?? null);
      } catch {
        if (!cancelled) setAlloc(null);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  // ESC closes any modal
  const onEscToClose = useCallback((e) => {
    if (e.key === 'Escape') {
      setShowPrefModal(false);
      setShowProposalModal(false);
      setShowAllocModal(false);
    }
  }, []);
  useEffect(() => {
    if (showPrefModal || showProposalModal || showAllocModal) {
      document.addEventListener('keydown', onEscToClose);
      return () => document.removeEventListener('keydown', onEscToClose);
    }
  }, [showPrefModal, showProposalModal, showAllocModal, onEscToClose]);

  const handleShowPreferences = async () => {
    setPrefErr('');
    setPrefLoading(true);
    try {
      const res = await axios.get(`${API}/preferences`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPreferences(Array.isArray(res.data) ? res.data : []);
      setShowPrefModal(true);
    } catch {
      setPrefErr('Failed to load preferences.');
    } finally {
      setPrefLoading(false);
    }
  };

  const handleShowProposals = () => setShowProposalModal(true);

  // Open My Allocation modal (refetch to be fresh)
  const handleShowAllocation = async () => {
    setAllocErr('');
    setAllocLoading(true);
    try {
      const res = await axios.get(`${API}/allocations/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAlloc(res.data ?? null);
      setShowAllocModal(true);
    } catch {
      setAllocErr('Failed to load allocation.');
      setShowAllocModal(true);
    } finally {
      setAllocLoading(false);
    }
  };

  return (
    <div className="dashboard-container" style={{ backgroundImage: "url('/assets/login_background.png')" }}>
      <Sidebar />

      <div className="dashboard-main">
        <header className="dashboard-header">
          <h2>Student Project Selection Portal</h2>
          <ProfileDropdown />
        </header>

        <div className="dashboard-welcome">
          <h3>Welcome, {studentName}!</h3>
          <p>Here’s a quick overview of your project journey</p>
        </div>

        {/* ===== Prominent My Allocation section ===== */}
        <section className="allocation-section" aria-label="My Allocation">
          <div className="allocation-card">
            <div className="allocation-title-row">
              <h4>My Allocation</h4>
              <button className="allocation-view" onClick={handleShowAllocation}>
                View details
              </button>
            </div>

            {allocLoading ? (
              <p className="allocation-muted">Loading…</p>
            ) : !alloc ? (
              <p className="allocation-muted">You haven’t been allocated yet.</p>
            ) : (
              <div className="allocation-brief">
                <div className="allocation-brief-title">{alloc.project_title}</div>
                {alloc.project_description && (
                  <p className="allocation-brief-desc">{alloc.project_description}</p>
                )}

                <div className="alloc-row">
                  <span className="alloc-label">Supervisor</span>
                  <span className="alloc-value">{alloc.supervisor_name || '—'}</span>
                </div>

                {alloc.supervisor_email && (
                  <div className="alloc-row">
                    <span className="alloc-label">Email</span>
                    <div className="alloc-inline">
                      <a className="alloc-email" href={`mailto:${alloc.supervisor_email}`}>{alloc.supervisor_email}</a>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ===== Activity / KPI section (highlighted + titled) ===== */}
        <section className="kpi-section" aria-labelledby="kpi-title">
          <div className="kpi-header">
            <h4 id="kpi-title" className="kpi-title">Activity</h4>
          </div>

          <div className="dashboard-cards kpi-cards">
            <div
              className="dashboard-card"
              onClick={handleShowPreferences}
              role="button"
              aria-haspopup="dialog"
              aria-label="View Preferred Projects"
            >
              <h4>{dashboardData.stats.preferencesSubmitted}</h4>
              <p>Preferred Projects</p>
            </div>

            <div
              className="dashboard-card"
              onClick={handleShowProposals}
              role="button"
              aria-haspopup="dialog"
              aria-label="View Proposals Sent"
            >
              <h4>{dashboardData.stats.proposalsSent}</h4>
              <p>Proposals Sent</p>
            </div>
          </div>
        </section>

        {/* Account Tools */}
        <div className="dashboard-actions">
          <h4>Account Tools</h4>
          <button onClick={() => navigate('/change-password')}>Change Password</button>
          <button onClick={() => navigate('/help-support')}>Help & Support</button>
        </div>
      </div>

      {/* Preferred Projects (portal) */}
      <PreferencesModal
        open={showPrefModal}
        onClose={() => setShowPrefModal(false)}
        items={preferences}
        loading={prefLoading}
        error={prefErr}
      />

      {/* Proposals (portal) */}
      <StudentProposalModal
        isOpen={showProposalModal}
        onClose={() => setShowProposalModal(false)}
        userId={userId}
        token={token}
      />

      {/* My Allocation (portal) */}
      <AllocationModal
        open={showAllocModal}
        onClose={() => setShowAllocModal(false)}
        data={alloc}
        loading={allocLoading}
        error={allocErr}
      />
    </div>
  );
}
