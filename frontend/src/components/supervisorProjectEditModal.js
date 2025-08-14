import React, { useEffect, useState } from 'react';
import './supervisorProjectEditModal.css';

const API = 'http://localhost:5000';

export default function SupervisorProjectEditModal({ projectId, token, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: '',
    description: '',
    topic: '',
    keywords: '',
    quota: 1,
    full_description: '',
    prerequisites: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  // Close on ESC
  useEffect(() => {
    const onEsc = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  // Load one project
  useEffect(() => {
    const fetchOne = async () => {
      setLoading(true); setError('');
      try {
        const res = await fetch(`${API}/projects/${projectId}`, {
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(await res.text());
        const p = await res.json();
        setForm({
          title: p?.title || '',
          description: p?.description || '',
          topic: p?.topic || '',
          keywords: p?.keywords || '',
          quota: p?.quota ?? 1,
          full_description: p?.full_description || '',
          prerequisites: p?.prerequisites || '',
        });
      } catch (e) {
        setError(e.message || 'Failed to load project');
      } finally {
        setLoading(false);
      }
    };
    if (projectId) fetchOne();
  }, [projectId, token]);

  const update = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const res = await fetch(`${API}/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          topic: form.topic || null,
          keywords: form.keywords || null,
          quota: Number(form.quota),
          full_description: form.full_description || null,
          prerequisites: form.prerequisites || null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      onSaved?.(data.project);
      onClose?.();
    } catch (e) {
      setError(e.message || 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="spem-backdrop" role="dialog" aria-modal="true" onClick={(e)=>{ if(e.target.classList.contains('spem-backdrop')) onClose?.(); }}>
      <div className="spem-card">
        <div className="spem-head">
          <h3>Edit Project</h3>
          <button className="btn btn-outline spem-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {loading ? (
          <div className="loading" style={{padding:12}}>Loading…</div>
        ) : (
          <form onSubmit={onSubmit}>
            {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

            <div className="spem-field">
              <div className="spem-label">Title</div>
              <input className="spem-input" value={form.title} onChange={update('title')} required />
            </div>

            <div className="spem-field">
              <div className="spem-label">Short Description</div>
              <textarea className="spem-textarea" value={form.description} onChange={update('description')} required />
            </div>

            <div className="spem-grid2">
              <div className="spem-field">
                <div className="spem-label">Topic</div>
                <input className="spem-input" value={form.topic} onChange={update('topic')} />
              </div>
              <div className="spem-field">
                <div className="spem-label">Keywords (comma-separated)</div>
                <input className="spem-input" value={form.keywords} onChange={update('keywords')} />
              </div>
            </div>

            <div className="spem-field">
              <div className="spem-label">Quota</div>
              <input className="spem-input" type="number" min="1" value={form.quota} onChange={update('quota')} required />
            </div>

            <div className="spem-field">
              <div className="spem-label">Full Description</div>
              <textarea className="spem-textarea" value={form.full_description} onChange={update('full_description')} />
            </div>

            <div className="spem-field">
              <div className="spem-label">Prerequisites</div>
              <textarea className="spem-textarea" value={form.prerequisites} onChange={update('prerequisites')} />
            </div>

            <div className="spem-actions">
              <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
