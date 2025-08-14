const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');
const verifyToken = require('../middleware/authMiddleware');

/* ---------- Public browse/search (no auth) ---------- */

// All (non-archived) projects
router.get('/', projectController.getAllProjects);

// Full details for one project
router.get('/details/:projectId', projectController.getProjectDetails);

// Filters
router.get('/supervisor/:supervisor', projectController.filterBySupervisor);
router.get('/topic/:topic', projectController.filterByTopic);
router.get('/keyword', projectController.filterByKeyword);
router.get('/filters', projectController.multiFilteredProjects);

// Search
router.get('/search', projectController.searchProjects);

/* ---------- Supervisor-only (auth required) ---------- */

// Create a project
router.post('/create-project', verifyToken, projectController.createProject);

// My projects (active by default; use ?archived=1 for archived)
router.get('/my', verifyToken, projectController.getMyProjects);

// Archive / Unarchive my project
router.patch('/:projectId/archive', verifyToken, projectController.archiveProject);
router.patch('/:projectId/unarchive', verifyToken, projectController.unarchiveProject);

module.exports = router;
