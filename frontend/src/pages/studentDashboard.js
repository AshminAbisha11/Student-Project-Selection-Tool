// src/pages/StudentDashboard.js
import React, { useEffect, useState, useCallback, useRef } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import './studentDashboard.css';
import Sidebar from '../components/sideBar';
import ProfileDropdown from '../components/profileDropdown';
import StudentProposalModal from '../components/studentProposalModal';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5000';

/* ---------- Preferred Projects modal ---------- */
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
            {items.map((pref, i) => (
              <div className="ppm-card" key={pref.preference_id ?? `${pref.project_id}-${i}`}>
                <h4>{i + 1}. {pref.title}</h4>
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

/* ---------- My Allocation modal ---------- */
function AllocationModal({ open, onClose, data, loading, error }) {
  if (!open) return null;
  const fmt = (iso) => (iso ? new Date(iso).toLocaleString() : '');
  const copy = async (t) => { try { await navigator.clipboard.writeText(t); alert('Copied'); } catch {} };
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
                  <button className="ppm-chip" onClick={() => copy(data.supervisor_email)}>Copy</button>
                </div>
              </div>
            )}

            {data.allocated_at && (
              <div className="alloc-row">
                <span className="alloc-label">Allocated</span>
                <span className="alloc-value">{fmt(data.allocated_at)}</span>
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

  // auth
  const token = localStorage.getItem('token');
  const user = (() => { try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; } })();
  const userId = user?.user_id;
  const studentName = user?.name || 'Student';

  // stats
  const [dashboardData, setDashboardData] = useState({ stats: { preferencesSubmitted: 0, proposalsSent: 0 } });

  // modals
  const [showPrefModal, setShowPrefModal] = useState(false);
  const [showProposalModal, setShowProposalModal] = useState(false);

  // allocation
  const [alloc, setAlloc] = useState(null);
  const [allocLoading, setAllocLoading] = useState(false);
  const [allocErr, setAllocErr] = useState('');
  const [showAllocModal, setShowAllocModal] = useState(false);

  // preferences
  const [preferences, setPreferences] = useState([]);
  const [prefLoading, setPrefLoading] = useState(false);
  const [prefErr, setPrefErr] = useState('');

  // cycle status (for banner)
  const [cycle, setCycle] = useState({ hasActiveCycle: false, isSubmissionOpen: false, cycle: null });
  const [cycleLoading, setCycleLoading] = useState(true);

  // refresh control + polling
  const refreshTick = useRef(0);
  const pollRef = useRef(null);

  // ---------- guards ----------
  useEffect(() => {
    if (!token || !user) {
      navigate('/login', { replace: true });
      return;
    }
    if (String(user.role || '').toLowerCase() !== 'student') {
      navigate('/supervisor-dashboard', { replace: true });
    }
  }, [navigate, token, user]);

  // ---------- fetchers ----------
  const authHeader = token ? { Authorization: `Bearer ${token}` } : {};

  const loadStats = useCallback(async () => {
    if (!userId || !token) return;
    try {
      const { data } = await axios.get(`${API}/dashboard/${userId}`, { headers: authHeader });
      setDashboardData(data);
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 403) {
        localStorage.clear();
        navigate('/login', { replace: true });
      }
    }
  }, [API, userId, token]); // eslint-disable-line

  const loadAlloc = useCallback(async () => {
    if (!token) return;
    setAllocLoading(true);
    setAllocErr('');
    try {
      const { data } = await axios.get(`${API}/allocations/me`, { headers: authHeader });
      setAlloc(data ?? null);
    } catch {
      setAlloc(null);
    } finally {
      setAllocLoading(false);
    }
  }, [API, token]); // eslint-disable-line

  const loadCycle = useCallback(async () => {
    setCycleLoading(true);
    try {
      const { data } = await axios.get(`${API}/cycle/status`, { headers: authHeader });
      setCycle({
        hasActiveCycle: Boolean(data?.hasActiveCycle),
        isSubmissionOpen: Boolean(data?.isSubmissionOpen),
        cycle: data?.cycle || null,
      });
    } catch {
      setCycle({ hasActiveCycle: false, isSubmissionOpen: false, cycle: null });
    } finally {
      setCycleLoading(false);
    }
  }, [API, token]); // eslint-disable-line

  // fetch all together (and allow manual refresh)
  const refreshAll = useCallback(async () => {
    refreshTick.current += 1; // bust any stale UI assumptions
    await Promise.all([loadStats(), loadCycle(), loadAlloc()]);
  }, [loadStats, loadCycle, loadAlloc]);

  useEffect(() => { refreshAll(); }, [refreshAll]);

  // light polling so student view updates soon after admin commits
  useEffect(() => {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(() => { refreshAll(); }, 60_000); // every 60s
    return () => clearInterval(pollRef.current);
  }, [refreshAll]);

  // ---------- modal helpers ----------
  useEffect(() => {
    const onEsc = (e) => {
      if (e.key === 'Escape') {
        setShowPrefModal(false);
        setShowProposalModal(false);
        setShowAllocModal(false);
      }
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, []);

  const handleShowPreferences = async () => {
    setPrefErr('');
    setPrefLoading(true);
    try {
      const { data } = await axios.get(`${API}/preferences`, { headers: authHeader });
      setPreferences(Array.isArray(data) ? data : []);
      setShowPrefModal(true);
    } catch {
      setPrefErr('Failed to load preferences.');
    } finally {
      setPrefLoading(false);
    }
  };

  const handleShowProposals = () => setShowProposalModal(true);

  const handleShowAllocation = async () => {
    setAllocErr('');
    setAllocLoading(true);
    try {
      const { data } = await axios.get(`${API}/allocations/me`, { headers: authHeader });
      setAlloc(data ?? null);
      setShowAllocModal(true);
    } catch {
      setAllocErr('Failed to load allocation.');
      setShowAllocModal(true);
    } finally {
      setAllocLoading(false);
    }
  };

  // ---------- Banner (smart messaging) ----------
  const Banner = () => {
    if (cycleLoading) return null;

    // Active cycle (open or closed)
    if (cycle.hasActiveCycle || cycle.isSubmissionOpen) {
      return (
        <div style={{ background: '#e9f7ef', border: '1px solid #b7e0c7', color: '#1e4620', padding: '10px 14px', borderRadius: 10, marginBottom: 12 }}>
          <strong>An allocation cycle is active.</strong>{' '}
          {cycle.isSubmissionOpen ? 'Submissions are open.' : 'Submissions are closed.'}
        </div>
      );
    }

    // No active cycle, but the student DOES have an allocation from the last committed cycle
    if (alloc) {
      return (
        <div style={{ background: '#f5f7ff', border: '1px solid #dfe4ff', color: '#2a2d55', padding: '10px 14px', borderRadius: 10, marginBottom: 12 }}>
          <strong>Last cycle has been committed.</strong> You have been allocated to <em>{alloc.project_title}</em>. You’ll be notified when the next cycle opens.
        </div>
      );
    }

    // No active cycle & no allocation yet
    return (
      <div style={{ background: '#fdecea', border: '1px solid #f5c6cb', color: '#611a15', padding: '10px 14px', borderRadius: 10, marginBottom: 12 }}>
        <strong>No active allocation cycle.</strong> Check back later.
      </div>
    );
  };

  return (
    <div className="dashboard-container" style={{ backgroundImage: "url('/assets/login_background.png')" }}>
      <Sidebar />

      <div className="dashboard-main">
        <header className="dashboard-header">
          <h2>Student Project Selection Portal</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-outline" onClick={refreshAll} title="Refresh data">Refresh</button>
            <ProfileDropdown />
          </div>
        </header>

        <Banner />

        <div className="dashboard-welcome">
          <h3>Welcome, {studentName}!</h3>
          <p>Here’s a quick overview of your project journey</p>
        </div>

        {/* ===== My Allocation ===== */}
        <section className="allocation-section" aria-label="My Allocation">
          <div className="allocation-card">
            <div className="allocation-title-row">
              <h4>My Allocation</h4>
              <button className="allocation-view" onClick={handleShowAllocation}>View details</button>
            </div>

            {allocLoading ? (
              <p className="allocation-muted">Loading…</p>
            ) : !alloc ? (
              <p className="allocation-muted">You haven’t been allocated yet.</p>
            ) : (
              <div className="allocation-brief">
                <div className="allocation-brief-title">{alloc.project_title}</div>
                {alloc.project_description && <p className="allocation-brief-desc">{alloc.project_description}</p>}
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

        {/* ===== Activity / KPI ===== */}
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
