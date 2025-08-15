import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import './myProposalPage.css';

import Sidebar from '../components/sideBar';
import HeaderBar from '../components/headerBar';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5000';

export default function SubmitProposalPage() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState(null);

  const [supervisors, setSupervisors] = useState([]);
  const [loadingSup, setLoadingSup] = useState(true);
  const [supError, setSupError] = useState('');
  const [supervisorId, setSupervisorId] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [fileKey, setFileKey] = useState(0); // reset file input

  const token = localStorage.getItem('token');
  const authHeaders = useMemo(
    () => ({ Authorization: token ? `Bearer ${token}` : '' }),
    [token]
  );

  // Load supervisors from /supervisor-list
  useEffect(() => {
    let mounted = true;
    (async () => {
      setSupError('');
      setLoadingSup(true);
      try {
        const { data } = await axios.get(`${API}/supervisor-list`, {
          headers: authHeaders,
        });
        if (mounted) setSupervisors(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Error fetching supervisors:', err);
        if (mounted) {
          setSupError('Could not load supervisors.');
          setSupervisors([]);
        }
      } finally {
        if (mounted) setLoadingSup(false);
      }
    })();
    return () => { mounted = false; };
  }, [API, authHeaders]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!supervisorId || !title.trim() || !description.trim()) {
      alert('Please fill in title, description, and choose a supervisor.');
      return;
    }

    const fd = new FormData();
    fd.append('title', title.trim());
    fd.append('description', description.trim());
    fd.append('supervisor_id', supervisorId); // student_id comes from JWT on the server
    if (file) fd.append('file', file);

    try {
      setSubmitting(true);
      await axios.post(`${API}/proposals`, fd, { headers: authHeaders });
      alert('Proposal submitted successfully!');
      // reset form
      setTitle('');
      setDescription('');
      setSupervisorId('');
      setFile(null);
      setFileKey((k) => k + 1);
    } catch (err) {
      console.error('Submission error:', err);
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
          {/* Global header, visually attached to the sidebar */}
          <HeaderBar />

          <div className="page-inner">
            <h2>Submit Your Proposal</h2>

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
                  <option key={s.supervisor_id} value={s.supervisor_id}>
                    {s.name} {s.email ? `(${s.email})` : ''}
                  </option>
                ))}
              </select>
              {loadingSup && <small>Loading supervisors…</small>}
              {!loadingSup && supError && <small style={{ color: '#b00' }}>{supError}</small>}
              {!loadingSup && !supError && supervisors.length === 0 && (
                <small style={{ color: '#b00' }}>No supervisors available.</small>
              )}

              <label htmlFor="file">Upload File (optional)</label>
              <input
                key={fileKey}
                id="file"
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />

              <button type="submit" disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit Proposal'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
