// routes/projectRoutes.js
const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');
const verifyToken = require('../middleware/authMiddleware');

/* ---------- Public browse/search (no auth) ---------- */

// All (non-archived) projects
router.get('/', projectController.getAllProjects);

// Full details for one project (public view; hides archived)
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

// My projects (use ?archived=0|1|all)
router.get('/my', verifyToken, projectController.getMyProjects);

// Archive / Unarchive my project (keep these BEFORE the generic :projectId routes)
router.patch('/:projectId/archive', verifyToken, projectController.archiveProject);
router.patch('/:projectId/unarchive', verifyToken, projectController.unarchiveProject);

// Fetch one supervisor-owned project (for Edit modal)
router.get('/:projectId', verifyToken, projectController.getMyProjectById);

// Update one supervisor-owned project (from Edit modal)
router.patch('/:projectId', verifyToken, projectController.updateMyProject);

// Delete one supervisor-owned project
router.delete('/:projectId', verifyToken, projectController.deleteMyProject);


module.exports = router;
