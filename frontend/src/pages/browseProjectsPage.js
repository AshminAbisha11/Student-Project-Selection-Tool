// src/pages/BrowseProjectsPage.js
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import FilterBar from '../components/filterBar';
import ProjectCard from '../components/projectCard';
import HeaderBar from '../components/headerBar';
import ProjectDetailsModal from '../components/projectDetailsModal';
import './browseProjectsPage.css';

const API = 'http://localhost:5000';
const PREF_CAP = 5;

const isIdeaPoolProject = (p) =>
  p?.is_student_pool === 1 ||
  p?.is_student_proposal === 1 ||
  (typeof p?.topic === 'string' &&
    p.topic.trim().toLowerCase() === 'student proposal ideas');

export default function BrowseProjectsPage() {
  const [filters, setFilters] = useState({ supervisor: '', topic: '', keyword: '' });
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);

  // message shown above grid (used when empty)
  const [emptyMsg, setEmptyMsg] = useState('');
  const [suggestions, setSuggestions] = useState([]);

  const [addedPrefs, setAddedPrefs] = useState(() => new Set());
  const [prefIdByProject, setPrefIdByProject] = useState(() => new Map());
  const [prefCount, setPrefCount] = useState(0);

  const navigate = useNavigate();

  const primeAddedPrefs = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const res = await fetch(`${API}/preferences`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const idsSet = new Set((data || []).map(p => p.project_id));
      const idMap  = new Map((data || []).map(p => [p.project_id, p.preference_id]));
      setAddedPrefs(idsSet);
      setPrefIdByProject(idMap);
      setPrefCount(idsSet.size);
    } catch {/* ignore */}
  }, []);

  const buildFilterQS = (f) => {
    const qs = new URLSearchParams();
    if (f.supervisor?.trim()) qs.set('supervisor', f.supervisor.trim());
    if (f.topic?.trim())      qs.set('topic',      f.topic.trim());
    if (f.keyword?.trim())    qs.set('keyword',    f.keyword.trim());
    const s = qs.toString();
    return s ? `?${s}` : '';
  };

  const hasAnyFilter = (f) =>
    Boolean(f.supervisor?.trim() || f.topic?.trim() || f.keyword?.trim());

  const fetchAllProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/projects`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load projects');
      setProjects(Array.isArray(data) ? data : (data.projects || []));
      setEmptyMsg('');
      setSuggestions([]);
    } catch (err) {
      console.error('Error fetching all projects:', err);
      setProjects([]);
      setEmptyMsg('Failed to load projects.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchProjects = useCallback(async () => {
    if (!hasAnyFilter(filters)) {
      fetchAllProjects();
      return;
    }
    setLoading(true);
    try {
      const qs = buildFilterQS(filters);
      const res = await fetch(`${API}/projects/filters${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to fetch filtered projects');

      const list = Array.isArray(data) ? data : (data.projects || []);
      setProjects(list);

      // show empty state with link if none
      setEmptyMsg(list.length ? '' : 'No projects match your filters.');
      setSuggestions([]);
    } catch (err) {
      console.error('Error fetching filtered projects:', err);
      setProjects([]);
      setEmptyMsg(err.message || 'No projects found.');
    } finally {
      setLoading(false);
    }
  }, [filters, fetchAllProjects]);

  const handleGlobalSearch = useCallback(async (rawTerm) => {
    const term = (rawTerm || '').trim();

    // Empty search => show everything
    if (!term) {
      await fetchAllProjects();
      return;
    }

    setLoading(true);
    try {
      const qs = new URLSearchParams({ query: term }).toString();
      const res = await fetch(`${API}/projects/search?${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || 'Search failed');

      const list = Array.isArray(data) ? data : (data.projects || []);
      setProjects(list);

      // Do NOT auto-restore; show the empty state with “Show all projects”
      setEmptyMsg(list.length ? '' : 'No matches found.');
      setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
    } catch (err) {
      console.error('Search error:', err);
      setProjects([]);
      setEmptyMsg(err.message || 'No matches found.');
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [fetchAllProjects]);

  const handleViewDetails = async (projectId) => {
    try {
      const res = await fetch(`${API}/projects/details/${projectId}`);
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

    setAddedPrefs(prev => new Set(prev).add(projectId));
    setPrefCount(c => c + 1);

    try {
      const res = await fetch(`${API}/preferences`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ project_id: projectId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Failed to add preference');

      setPrefIdByProject(prev => {
        const next = new Map(prev);
        next.set(projectId, data.preference_id);
        return next;
      });
    } catch (err) {
      setAddedPrefs(prev => { const n = new Set(prev); n.delete(projectId); return n; });
      setPrefCount(c => Math.max(0, c - 1));
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

    setAddedPrefs(prev => { const n = new Set(prev); n.delete(projectId); return n; });
    setPrefIdByProject(prev => { const n = new Map(prev); n.delete(projectId); return n; });
    setPrefCount(c => Math.max(0, c - 1));

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
      await primeAddedPrefs();
      console.error('Remove preference error:', err);
      alert(err.message);
    }
  };

  const handleSubmitIdea = (project) => {
    navigate(`/submit-proposal?sup=${project.supervisor_id}`);
  };

  useEffect(() => {
    fetchAllProjects();
    primeAddedPrefs();
  }, [fetchAllProjects, primeAddedPrefs]);

  const handleChange = (e) =>
    setFilters(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleReset = () => {
    setFilters({ supervisor: '', topic: '', keyword: '' });
    setEmptyMsg('');
    setSuggestions([]);
    fetchAllProjects();
  };

  // Link action to restore list
  const showAll = async () => {
    setFilters({ supervisor: '', topic: '', keyword: '' });
    setEmptyMsg('');
    setSuggestions([]);
    await fetchAllProjects();
  };

  return (
    <>
      <HeaderBar onSearch={handleGlobalSearch} onClear={fetchAllProjects} />

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
              <span className="pref-badge">Preferences: {prefCount}/{PREF_CAP}</span>
              {prefCount > 0 && (
                <button className="pref-link-btn" onClick={() => navigate('/my-preferences')}>
                  View My Preferences
                </button>
              )}
            </div>
          </div>

          {/* Empty state message with a link to show all */}
          {!loading && projects.length === 0 ? (
            <div className="search-feedback" role="status">
              {emptyMsg || 'No projects found.'}{' '}
              <button className="suggestion-chip" onClick={showAll}>
                Show all projects
              </button>
              {suggestions.length > 0 && (
                <span>
                  {' '}Try:{' '}
                  {suggestions.map((s, i) => (
                    <button key={i} className="suggestion-chip" onClick={() => handleGlobalSearch(s)}>
                      {s}
                    </button>
                  ))}
                </span>
              )}
            </div>
          ) : null}

          {loading ? (
            <p>Loading projects...</p>
          ) : (
            <div className="project-grid">
              {projects.map(project => {
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
                    disableAdd={
                      !ideaPool &&
                      prefCount >= PREF_CAP &&
                      !addedPrefs.has(project.project_id)
                    }
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      {selectedProject && (
        <ProjectDetailsModal
          project={selectedProject}
          onClose={() => setSelectedProject(null)}
        />
      )}
    </>
  );
}
