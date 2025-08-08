import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import FilterBar from '../components/filterBar';
import ProjectCard from '../components/projectCard';
import HeaderBar from '../components/headerBar';
import ProjectDetailsModal from '../components/projectDetailsModal';
import './browseProjectsPage.css';

const API = 'http://localhost:5000';

const BrowseProjectsPage = () => {
  const [filters, setFilters] = useState({ supervisor: '', topic: '', keyword: '' });
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [searchMsg, setSearchMsg] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const navigate = useNavigate();

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

  // Header search -> /projects/search?query=...
  const handleGlobalSearch = useCallback(async (term) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ query: term }).toString(); // <-- matches your controller
      const res = await fetch(`${API}/projects/search?${qs}`);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || data.message || 'Search failed');

      if (Array.isArray(data.projects)) {
        setProjects(data.projects);
        setSearchMsg('');
        setSuggestions([]);
      } else {
        // No exact matches: API returns { message, suggestions? }
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
    try {
      const res = await fetch(`${API}/preferences`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ project_id: projectId }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Failed to add preference');
      }
      navigate('/my-preferences');
    } catch (err) {
      console.error('Error adding preference:', err);
      alert(err.message);
    }
  };

  useEffect(() => {
    fetchAllProjects();
  }, [fetchAllProjects]);

  // Filters
  const handleChange = (e) =>
    setFilters((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleReset = () => {
    setFilters({ supervisor: '', topic: '', keyword: '' });
    setSearchMsg('');
    setSuggestions([]);
    fetchAllProjects();
  };

  const handleKeyDown = (e) => { if (e.key === 'Enter') fetchProjects(); };

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
          <h2>Project Listings</h2>

          {/* Search feedback */}
          {searchMsg && (
            <div className="search-feedback" role="status">
              {searchMsg}
              {suggestions.length > 0 && (
                <span> Try: {suggestions.map((s, i) => (
                  <button key={i} className="suggestion-chip" onClick={() => handleGlobalSearch(s)}>
                    {s}
                  </button>
                ))}</span>
              )}
            </div>
          )}

          {loading ? (
            <p>Loading projects...</p>
          ) : (
            <div className="project-grid">
              {projects.length > 0 ? (
                projects.map((project) => (
                  <ProjectCard
                    key={project.project_id}
                    project={project}
                    onViewDetails={() => handleViewDetails(project.project_id)}
                    onAddPreference={() => handleAddPreference(project.project_id)}
                  />
                ))
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
};

export default BrowseProjectsPage;
