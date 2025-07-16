import React, { useState, useEffect } from 'react';
import FilterBar from '../components/filterBar';
import ProjectCard from '../components/projectCard';
import HeaderBar from '../components/headerBar';
import './browseProjectsPage.css';

const BrowseProjectsPage = () => {
  const [filters, setFilters] = useState({ supervisor: '', topic: '', keyword: '' });
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);

  // Fetch all projects
  const fetchAllProjects = async () => {
    setLoading(true);
    try {
      const response = await fetch(`http://localhost:5000/projects`);
      const data = await response.json();
      setProjects(data || []);
    } catch (err) {
      console.error('Error fetching all projects:', err);
    }
    setLoading(false);
  };

  // Fetch filtered projects
  const fetchProjects = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams(filters).toString();
      const response = await fetch(`http://localhost:5000/projects/filter?${query}`);
      const data = await response.json();
      setProjects(data.projects || []);
    } catch (err) {
      console.error('Error fetching filtered projects:', err);
    }
    setLoading(false);
  };

  // Load all projects on mount
  useEffect(() => {
    fetchAllProjects();
  }, []);

  const handleChange = (e) => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
  };

  const handleReset = () => {
    setFilters({ supervisor: '', topic: '', keyword: '' });
    fetchAllProjects();
  };

  return (
    <>
      <HeaderBar /> {/* Top header bar */}
      <div className="browse-layout">
        <FilterBar 
          filters={filters}
          onChange={handleChange}
          onSearch={fetchProjects}
          onReset={handleReset}
        />
        <div className="projects-area">
          <h2>Project Listings</h2>
          {loading ? (
            <p>Loading projects...</p>
          ) : (
            <div className="project-grid">
              {projects.length > 0 ? (
                projects.map(project => (
                  <ProjectCard key={project.project_id} project={project} />
                ))
              ) : (
                <p>No projects found.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default BrowseProjectsPage;
