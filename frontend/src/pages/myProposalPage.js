// src/pages/SubmitProposalPage.js
import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import './myProposalPage.css';

import Sidebar from '../components/sideBar';
import HeaderBar from '../components/headerBar';
import { useNavigate, useSearchParams } from 'react-router-dom';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5000';

export default function SubmitProposalPage() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState(null);

  // supervisors
  const [supervisors, setSupervisors] = useState([]);
  const [loadingSup, setLoadingSup] = useState(true);
  const [supError, setSupError] = useState('');
  const [supervisorId, setSupervisorId] = useState('');

  // cycle banner (if no active cycle, let the user know)
  const [hasActiveCycle, setHasActiveCycle] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [fileKey, setFileKey] = useState(0);

  // Success modal
  const [successOpen, setSuccessOpen] = useState(false);
  const [submittedTo, setSubmittedTo] = useState(null);
  const modalRef = useRef(null);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectSup = searchParams.get('sup'); // from BrowseProjectsPage deep link

  const token = localStorage.getItem('token');
  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token]
  );

  // Fetch cycle status for banner clarity
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await axios.get(`${API}/cycle/status`, { headers: authHeaders });
        if (!mounted) return;
        setHasActiveCycle(Boolean(data?.hasActiveCycle));
      } catch {
        if (!mounted) return;
        setHasActiveCycle(true); // be permissive if status endpoint unavailable
      }
    })();
    return () => {
      mounted = false;
    };
  }, [authHeaders]);

  // ✅ Load supervisors who are accepting student ideas
  useEffect(() => {
    let mounted = true;
    (async () => {
      setSupError('');
      setLoadingSup(true);
      try {
        const { data } = await axios.get(`${API}/proposals/supervisors/accepting-ideas`, {
          headers: authHeaders,
        });

        if (!mounted) return;

        const list = Array.isArray(data) ? data : [];
        setSupervisors(list);

        // If we deep-linked with ?sup=<id> and that supervisor is in the list, preselect it
        if (preselectSup && list.length) {
          const found = list.find((s) => String(s.supervisor_id) === String(preselectSup));
          if (found) setSupervisorId(String(found.supervisor_id));
        }

        // If list is empty and we know there is no active cycle, show a clear message
        if (list.length === 0 && hasActiveCycle === false) {
          setSupError('No active allocation cycle. Proposals are closed right now.');
        }
      } catch (err) {
        if (!mounted) return;
        console.error('Error loading supervisors:', err);
        if (err?.response?.status === 401 || err?.response?.status === 403) {
          setSupError('Please log in to submit a proposal.');
        } else {
          setSupError(err?.response?.data?.message || 'Could not load supervisors.');
        }
        setSupervisors([]);
      } finally {
        if (mounted) setLoadingSup(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [authHeaders, preselectSup, hasActiveCycle]);

  // ESC to close modal
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setSuccessOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const onBackdropClick = (e) => {
    if (modalRef.current && !modalRef.current.contains(e.target)) {
      setSuccessOpen(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!token) {
      alert('Please log in to submit a proposal.');
      navigate('/login');
      return;
    }

    if (!supervisorId || !title.trim() || !description.trim()) {
      alert('Please fill in title, description, and choose a supervisor.');
      return;
    }

    const sup = supervisors.find((s) => String(s.supervisor_id) === String(supervisorId));
    if (!sup) {
      alert('Selected supervisor is not currently accepting student ideas.');
      return;
    }
    if (sup.seats_left <= 0) {
      alert('Selected supervisor has no seats available.');
      return;
    }

    // Optional: small client-side file guard (~10MB)
    if (file && file.size > 10 * 1024 * 1024) {
      alert('File is too large (max 10 MB).');
      return;
    }

    const fd = new FormData();
    fd.append('title', title.trim());
    fd.append('description', description.trim());
    fd.append('supervisor_id', supervisorId);
    if (file) fd.append('file', file);

    try {
      setSubmitting(true);
      // Let Axios set the multipart boundary automatically:
      await axios.post(`${API}/proposals`, fd, {
        headers: { ...authHeaders },
      });

      setSubmittedTo(sup || null);
      setSuccessOpen(true);

      // reset form
      setTitle('');
      setDescription('');
      setSupervisorId('');
      setFile(null);
      setFileKey((k) => k + 1);

      // Refresh supervisors to reflect updated seats
      try {
        const { data } = await axios.get(`${API}/proposals/supervisors/accepting-ideas`, {
          headers: authHeaders,
        });
        setSupervisors(Array.isArray(data) ? data : []);
      } catch {
        /* ignore refresh errors */
      }
    } catch (err) {
      console.error('Submit proposal error:', err);
      const msg = err?.response?.data?.message || 'Failed to submit proposal.';
      alert(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="proposal-page">
      <div className="page-container">
        <Sidebar />

        <div className="content-area">
          <HeaderBar />

          <div className="page-inner">
            <h2>Submit Your Proposal</h2>
            {!hasActiveCycle && (
              <p className="muted" style={{ color: '#b00' }}>
                There is no active allocation cycle right now. You can draft your proposal,
                but supervisors list will appear once a cycle opens.
              </p>
            )}
            <p className="muted">
              Only supervisors currently accepting student ideas are shown below. Seats update as offers
              are accepted.
            </p>

            <form onSubmit={handleSubmit} className="proposal-form">
              <label htmlFor="title">Project Title</label>
              <input
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />

              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                rows={6}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />

              <label htmlFor="supervisor">Choose Supervisor</label>
              <select
                id="supervisor"
                value={supervisorId}
                onChange={(e) => setSupervisorId(e.target.value)}
                disabled={loadingSup || supervisors.length === 0}
                required
              >
                <option value="">-- Select Supervisor --</option>
                {supervisors.map((s) => (
                  <option key={s.supervisor_id} value={s.supervisor_id} disabled={s.seats_left <= 0}>
                    {s.name} {s.email ? `(${s.email})` : ''} —{' '}
                    {s.seats_left > 0 ? `${s.seats_left} seat${s.seats_left > 1 ? 's' : ''} left` : 'Full'}
                  </option>
                ))}
              </select>
              {loadingSup && <small>Loading supervisors…</small>}
              {!loadingSup && supError && <small style={{ color: '#b00' }}>{supError}</small>}
              {!loadingSup && !supError && supervisors.length === 0 && (
                <small style={{ color: '#b00' }}>
                  No supervisors are currently accepting student proposals.
                </small>
              )}

              <label htmlFor="file">Upload File (optional)</label>
              <input
                key={fileKey}
                id="file"
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />

              <button type="submit" disabled={submitting || loadingSup || supervisors.length === 0}>
                {submitting ? 'Submitting…' : 'Submit Proposal'}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Success Modal */}
      {successOpen && (
        <div className="modal-backdrop" onMouseDown={onBackdropClick} aria-modal="true" role="dialog">
          <div className="modal" ref={modalRef}>
            <div className="modal-icon">✅</div>
            <h3 className="modal-title">Proposal submitted</h3>
            <p className="modal-text">
              Your proposal has been submitted to <strong>{submittedTo?.name || 'the selected supervisor'}</strong>.
              Please wait for their response.
            </p>

            <div className="modal-actions" style={{ textAlign: 'center' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setSuccessOpen(false)}
                style={{ marginRight: 8 }}
              >
                Close
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  setSuccessOpen(false);
                  navigate('/my-proposals');
                }}
              >
                View my proposals
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
