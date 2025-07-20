import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import FilterBar from '../components/filterBar';
import ProjectCard from '../components/projectCard';
import HeaderBar from '../components/headerBar';
import ProjectDetailsModal from '../components/projectDetailsModal';
import './browseProjectsPage.css';

const BrowseProjectsPage = () => {
  const [filters, setFilters] = useState({ supervisor: '', topic: '', keyword: '' });
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const navigate = useNavigate();

  // Fetch all projects
  const fetchAllProjects = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:5000/projects');
      const data = await response.json();
      setProjects(data || []);
    } catch (err) {
      console.error('Error fetching all projects:', err);
    } finally {
      setLoading(false);
    }
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
    } finally {
      setLoading(false);
    }
  };

  // Fetch full project details
  const handleViewDetails = async (projectId) => {
    try {
      const response = await fetch(`http://localhost:5000/projects/details/${projectId}`);
      const data = await response.json();
      setSelectedProject(data);
    } catch (err) {
      console.error('Error fetching project details:', err);
    }
  };

  // Add project to preferences (uses JWT token)
  const handleAddPreference = async (projectId) => {
    const token = localStorage.getItem('token');

    if (!token) {
      alert('You must be logged in as a student to add preferences.');
      return;
    }

    try {
      const res = await fetch('http://localhost:5000/preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ project_id: projectId }),
      });

      if (res.ok) {
        navigate('/my-preferences');
      } else {
        const errData = await res.json();
        alert(`Failed to add preference: ${errData.message || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Error adding preference:', err);
      alert('Something went wrong. Please try again.');
    }
  };

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
      <HeaderBar />
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
                  <ProjectCard 
                    key={project.project_id}
                    project={project}
                    onViewDetails={() => handleViewDetails(project.project_id)}
                    onAddPreference={() => handleAddPreference(project.project_id)}
                  />
                ))
              ) : (
                <p>No projects found.</p>
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
