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

// Identify the “student ideas” pool cards
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
  const [searchMsg, setSearchMsg] = useState('');
  const [suggestions, setSuggestions] = useState([]);

  // preferences state
  const [addedPrefs, setAddedPrefs] = useState(() => new Set());
  const [prefIdByProject, setPrefIdByProject] = useState(() => new Map());
  const [prefCount, setPrefCount] = useState(0);

  const navigate = useNavigate();

  // Prime existing preferences for this student
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
    } catch { /* ignore */ }
  }, []);

  // Load all projects
  const fetchAllProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/projects`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load projects');
      setProjects(Array.isArray(data) ? data : []);
      setSearchMsg('');
      setSuggestions([]);
    } catch (err) {
      console.error('Error fetching all projects:', err);
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load filtered projects
  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams(filters).toString();
      const res = await fetch(`${API}/projects/filters?${query}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to fetch filtered projects');
      setProjects(data.projects || []);
      setSearchMsg('');
      setSuggestions([]);
    } catch (err) {
      console.error('Error fetching filtered projects:', err);
      alert(err.message);
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Header search
  const handleGlobalSearch = useCallback(async (term) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ query: term }).toString();
      const res = await fetch(`${API}/projects/search?${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || 'Search failed');

      if (Array.isArray(data.projects)) {
        setProjects(data.projects);
        setSearchMsg('');
        setSuggestions([]);
      } else {
        setProjects([]);
        setSearchMsg(data.message || 'No matches found.');
        setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
      }
    } catch (err) {
      console.error('Search error:', err);
      setProjects([]);
      setSearchMsg(err.message);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Details modal
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

  // Add preference (normal projects)
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

    // optimistic update
    setAddedPrefs(prev => new Set(prev).add(projectId));
    setPrefCount(c => c + 1);

    try {
      const res = await fetch(`${API}/preferences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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
      // revert
      setAddedPrefs(prev => { const n = new Set(prev); n.delete(projectId); return n; });
      setPrefCount(c => Math.max(0, c - 1));
      console.error('Error adding preference:', err);
      alert(err.message);
    }
  };

  // Remove preference (normal projects)
  const handleRemovePreference = async (projectId) => {
    const token = localStorage.getItem('token');
    if (!token) {
      alert('Please log in.');
      return;
    }
    const prefId = prefIdByProject.get(projectId);
    if (!prefId) return;

    // optimistic
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
      // re-prime if failure
      await primeAddedPrefs();
      console.error('Remove preference error:', err);
      alert(err.message);
    }
  };

  // Submit proposal for idea pool
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
    setSearchMsg('');
    setSuggestions([]);
    fetchAllProjects();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') fetchProjects();
  };

  return (
    <>
      <HeaderBar onSearch={handleGlobalSearch} />
      <div className="browse-layout">
        <FilterBar
          filters={filters}
          onChange={handleChange}
          onSearch={fetchProjects}
          onReset={handleReset}
          onKeyDown={handleKeyDown}
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

          {searchMsg && (
            <div className="search-feedback" role="status">
              {searchMsg}
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
          )}

          {loading ? (
            <p>Loading projects...</p>
          ) : (
            <div className="project-grid">
              {projects.length > 0 ? (
                projects.map((project) => {
                  const ideaPool = isIdeaPoolProject(project);
                  return (
                    <ProjectCard
                      key={project.project_id}
                      project={project}
                      isAdded={addedPrefs.has(project.project_id)}
                      isIdeaPool={ideaPool} // some card versions use this to change the label
                      onViewDetails={() => handleViewDetails(project.project_id)}
                      // For idea pool cards we pass a dedicated submit handler:
                      onSubmitIdea={ideaPool ? () => handleSubmitIdea(project) : undefined}
                      // For older card versions that reuse onAddPreference as primary handler:
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
                })
              ) : (
                !searchMsg && <p>No projects found.</p>
              )}
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
