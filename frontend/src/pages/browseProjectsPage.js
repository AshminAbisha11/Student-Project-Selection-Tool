// src/pages/BrowseProjectsPage.js
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import FilterBar from '../components/filterBar';
import ProjectCard from '../components/projectCard';
import HeaderBar from '../components/headerBar';
import ProjectDetailsModal from '../components/projectDetailsModal';
import './browseProjectsPage.css';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const PREF_CAP = 5;

const isIdeaPoolProject = (p) =>
  p?.is_student_pool === 1 ||
  p?.is_student_proposal === 1 ||
  (typeof p?.topic === 'string' && p.topic.trim().toLowerCase() === 'student proposal ideas');

// de-dupe by project_id
const uniqueById = (arr) =>
  Array.from(new Map((arr || []).map((p) => [p.project_id, p])).values());

export default function BrowseProjectsPage() {
  const [filters, setFilters] = useState({ supervisor: '', topic: '', keyword: '' });
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);

  const [emptyMsg, setEmptyMsg] = useState('');
  const [suggestions, setSuggestions] = useState([]);

  const [addedPrefs, setAddedPrefs] = useState(() => new Set());
  const [prefIdByProject, setPrefIdByProject] = useState(() => new Map());
  const [prefCount, setPrefCount] = useState(0);

  // cycle guard UI
  const [blockedMsg, setBlockedMsg] = useState('');
  const [cycleId, setCycleId] = useState(null);

  const navigate = useNavigate();
  const didInit = useRef(false);

  // -------- helpers
  const buildFilterQS = (f) => {
    const qs = new URLSearchParams();
    if (f.supervisor?.trim()) qs.set('supervisor', f.supervisor.trim());
    if (f.topic?.trim()) qs.set('topic', f.topic.trim());
    if (f.keyword?.trim()) qs.set('keyword', f.keyword.trim());
    const s = qs.toString();
    return s ? `?${s}` : '';
  };

  const hasAnyFilter = (f) =>
    Boolean(f.supervisor?.trim() || f.topic?.trim() || f.keyword?.trim());

  // -------- preferences (cycle-aware)
  const primeAddedPrefs = useCallback(
    async (useCycleId) => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;
        // Only fetch if we know which cycle the browsing is for
        const qs = useCycleId ? `?cycle_id=${useCycleId}` : '';
        const res = await fetch(`${API}/preferences${qs}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.preferences || [];
        const idsSet = new Set(list.map((p) => p.project_id));
        const idMap = new Map(list.map((p) => [p.project_id, p.preference_id]));
        setAddedPrefs(idsSet);
        setPrefIdByProject(idMap);
        setPrefCount(idsSet.size);
      } catch {
        /* ignore */
      }
    },
    []
  );

  // -------- fetchers (always via /projects/public)
  const fetchPublicProjects = useCallback(
    async (qs = '') => {
      setLoading(true);
      setBlockedMsg('');
      const ctrl = new AbortController();
      try {
        const headers = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('token');
        if (token && token !== 'null' && token !== 'undefined') {
          headers.Authorization = `Bearer ${token}`; // optional auth
        }

        const res = await fetch(`${API}/projects/public${qs}`, {
          headers,
          signal: ctrl.signal,
          cache: 'no-store',
        });

        // No open cycle
        if (res.status === 409) {
          const data = await res.json().catch(() => ({}));
          setProjects([]);
          setCycleId(null);
          setBlockedMsg(data?.message || 'Project browsing isn’t open yet.');
          setEmptyMsg('');
          setSuggestions([]);
          // Clear local prefs view since there is no open cycle
          setAddedPrefs(new Set());
          setPrefIdByProject(new Map());
          setPrefCount(0);
          return;
        }

        // If endpoint is protected server-side
        if (res.status === 401 || res.status === 403) {
          setProjects([]);
          setCycleId(null);
          setBlockedMsg('Please sign in to view projects.');
          setEmptyMsg('');
          setSuggestions([]);
          return;
        }

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to load projects');

        const list = Array.isArray(data) ? data : data.projects || [];
        const cid = data?.cycle_id ?? null;

        setProjects(uniqueById(list));
        setCycleId(cid);
        setEmptyMsg(list.length ? '' : hasAnyFilter(filters) ? 'No projects match your filters.' : '');
        setSuggestions([]);

        // Sync preferences for this exact cycle (prevents showing prefs from a different cycle)
        if (cid) primeAddedPrefs(cid);
      } catch (err) {
        console.error('Error fetching public projects:', err);
        setProjects([]);
        setCycleId(null);
        setBlockedMsg('');
        setEmptyMsg(err.message || 'Failed to load projects.');
      } finally {
        setLoading(false);
      }
      return () => ctrl.abort();
    },
    [filters, primeAddedPrefs]
  );

  const fetchProjects = useCallback(async () => {
    const qs = hasAnyFilter(filters) ? buildFilterQS(filters) : '';
    await fetchPublicProjects(qs);
  }, [filters, fetchPublicProjects]);

  const handleGlobalSearch = useCallback(
    async (rawTerm) => {
      const term = (rawTerm || '').trim();
      const next = { ...filters, keyword: term };
      setFilters(next);
      const qs = buildFilterQS(next);
      await fetchPublicProjects(qs);
    },
    [filters, fetchPublicProjects]
  );

  // -------- actions
  const handleViewDetails = async (projectId) => {
    try {
      const res = await fetch(`${API}/projects/details/${projectId}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load project details');
      setSelectedProject(data);
    } catch (err) {
      console.error('Error fetching project details:', err);
      alert(err.message);
    }
  };

  const handleAddPreference = async (projectId) => {
    const token = localStorage.getItem('token');
    if (!token) {
      alert('You must be logged in as a student to add preferences.');
      return;
    }
    if (addedPrefs.has(projectId)) return;
    if (prefCount >= PREF_CAP) {
      alert(`You can only add up to ${PREF_CAP} preferences. Remove one to add another.`);
      return;
    }

    // optimistic
    setAddedPrefs((prev) => new Set(prev).add(projectId));
    setPrefCount((c) => c + 1);

    try {
      const res = await fetch(`${API}/preferences`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        // Send cycle_id explicitly so backend uses the same cycle as browsing
        body: JSON.stringify({ project_id: projectId, cycle_id: cycleId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Failed to add preference');

      setPrefIdByProject((prev) => {
        const next = new Map(prev);
        next.set(projectId, data.preference_id);
        return next;
      });
    } catch (err) {
      // revert optimistic
      setAddedPrefs((prev) => {
        const n = new Set(prev);
        n.delete(projectId);
        return n;
      });
      setPrefCount((c) => Math.max(0, c - 1));
      console.error('Error adding preference:', err);
      alert(err.message);
    }
  };

  const handleRemovePreference = async (projectId) => {
    const token = localStorage.getItem('token');
    if (!token) {
      alert('Please log in.');
      return;
    }
    const prefId = prefIdByProject.get(projectId);
    if (!prefId) return;

    // optimistic
    setAddedPrefs((prev) => {
      const n = new Set(prev);
      n.delete(projectId);
      return n;
    });
    setPrefIdByProject((prev) => {
      const n = new Map(prev);
      n.delete(projectId);
      return n;
    });
    setPrefCount((c) => Math.max(0, c - 1));

    try {
      const res = await fetch(`${API}/preferences/${prefId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to remove preference');
      }
    } catch (err) {
      // re-sync from server for this cycle
      await primeAddedPrefs(cycleId);
      console.error('Remove preference error:', err);
      alert(err.message);
    }
  };

  const handleSubmitIdea = (project) => {
    // supervisor_id comes from users.user_id in the backend
    navigate(`/submit-proposal?sup=${project.supervisor_id}`);
  };

  // -------- lifecycle
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    // Initial fetch (no filters)
    fetchPublicProjects('');
  }, [fetchPublicProjects]);

  const handleChange = (e) =>
    setFilters((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleReset = async () => {
    const next = { supervisor: '', topic: '', keyword: '' };
    setFilters(next);
    setEmptyMsg('');
    setSuggestions([]);
    await fetchPublicProjects('');
  };

  const showAll = useCallback(async () => {
    const next = { supervisor: '', topic: '', keyword: '' };
    setFilters(next);
    setEmptyMsg('');
    setSuggestions([]);
    await fetchPublicProjects('');
  }, [fetchPublicProjects]);

  // Even if backend returns dup ids, render unique set
  const renderList = useMemo(() => uniqueById(projects), [projects]);

  // -------- render
  return (
    <>
      <HeaderBar onSearch={handleGlobalSearch} onClear={showAll} />

      <div className="browse-layout">
        <FilterBar
          filters={filters}
          onChange={handleChange}
          onSearch={fetchProjects}
          onReset={handleReset}
        />

        <div className="projects-area">
          <div className="projects-header">
            <h2>Project Listings</h2>
            <div className="pref-actions">
              <span className="pref-badge">
                Preferences: {prefCount}/{PREF_CAP}
              </span>
              {prefCount > 0 && (
                <button className="pref-link-btn" onClick={() => navigate('/my-preferences')}>
                  View My Preferences
                </button>
              )}
            </div>
          </div>

          {/* Cycle guard */}
          {!loading && blockedMsg ? (
            <div className="search-feedback" role="status">
              <strong>{blockedMsg}</strong>
              <p style={{ color: '#6c6892', marginTop: 6 }}>
                Projects become visible when your admin opens an allocation cycle.
              </p>
            </div>
          ) : null}

          {/* Empty states when cycle is open */}
          {!loading && !blockedMsg && renderList.length === 0 ? (
            <div className="search-feedback" role="status">
              {emptyMsg || 'No projects found.'}{' '}
              <button className="suggestion-chip" onClick={showAll}>
                Show all projects
              </button>
              {suggestions.length > 0 && (
                <span>
                  {' '}
                  Try:{' '}
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      className="suggestion-chip"
                      onClick={() => handleGlobalSearch(s)}
                    >
                      {s}
                    </button>
                  ))}
                </span>
              )}
            </div>
          ) : null}

          {loading ? (
            <p>Loading projects...</p>
          ) : !blockedMsg && renderList.length > 0 ? (
            <div className="project-grid">
              {renderList.map((project) => {
                const ideaPool = isIdeaPoolProject(project);
                return (
                  <ProjectCard
                    key={project.project_id}
                    project={project}
                    isAdded={addedPrefs.has(project.project_id)}
                    isIdeaPool={ideaPool}
                    onViewDetails={() => handleViewDetails(project.project_id)}
                    onSubmitIdea={ideaPool ? () => handleSubmitIdea(project) : undefined}
                    onAddPreference={
                      ideaPool
                        ? () => handleSubmitIdea(project)
                        : () => handleAddPreference(project.project_id)
                    }
                    onRemovePreference={() => handleRemovePreference(project.project_id)}
                    disableAdd={!ideaPool && prefCount >= PREF_CAP && !addedPrefs.has(project.project_id)}
                  />
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      {selectedProject && (
        <ProjectDetailsModal project={selectedProject} onClose={() => setSelectedProject(null)} />
      )}
    </>
  );
}
