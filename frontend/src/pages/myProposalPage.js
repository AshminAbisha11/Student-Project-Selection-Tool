import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './myProposalPage.css';
import Sidebar from '../components/sideBar';

const SubmitProposalPage = () => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState(null);
  const [supervisors, setSupervisors] = useState([]);
  const [supervisorId, setSupervisorId] = useState('');

  const token = localStorage.getItem('token');
  const student = JSON.parse(localStorage.getItem('student'));
  const studentId = student?.user_id;

  useEffect(() => {
    const fetchSupervisors = async () => {
      try {
        const res = await axios.get('http://localhost:5000/users?role=supervisor', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setSupervisors(res.data || []);
      } catch (err) {
        console.error('Error fetching supervisors:', err);
      }
    };

    fetchSupervisors();
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!studentId || !supervisorId || !title || !description) {
      alert('All fields except file are required.');
      return;
    }

    const formData = new FormData();
    formData.append('student_id', studentId);
    formData.append('supervisor_id', supervisorId);
    formData.append('title', title);
    formData.append('description', description);
    if (file) formData.append('file', file);

    try {
      await axios.post('http://localhost:5000/proposals', formData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      alert('Proposal submitted successfully!');
      setTitle('');
      setDescription('');
      setFile(null);
      setSupervisorId('');
    } catch (err) {
      console.error('Submission error:', err);
      alert('Failed to submit proposal. Please check console for details.');
    }
  };

  return (
    <div className="proposal-page">
      <Sidebar />
      <div className="proposal-content">
        <h2>Submit Your Proposal</h2>
        <form onSubmit={handleSubmit} className="proposal-form">
          <label htmlFor="title">Project Title</label>
          <input
            type="text"
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />

          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            rows="5"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />

          <label htmlFor="supervisor">Choose Supervisor</label>
          <select
            id="supervisor"
            value={supervisorId}
            onChange={(e) => setSupervisorId(e.target.value)}
            required
          >
            <option value="">-- Select Supervisor --</option>
            {supervisors.map(s => (
              <option key={s.user_id} value={s.user_id}>{s.name}</option>
            ))}
          </select>

          <label htmlFor="file">Upload File (optional)</label>
          <input
            type="file"
            id="file"
            accept=".pdf,.doc,.docx"
            onChange={(e) => setFile(e.target.files[0])}
          />

          <button type="submit">Submit Proposal</button>
        </form>
      </div>
    </div>
  );
};

export default SubmitProposalPage;
