// routes/projectRoutes.js
const express = require('express');
const router = express.Router();

const projectController = require('../controllers/projectController');
const verifyToken = require('../middleware/authMiddleware');

/* ================================
   Student-safe browse (cycle-gated)
   ================================ */
// PUBLIC: only returns projects when a cycle is OPEN (approved, non-archived, this cycle)
router.get('/public', projectController.listForStudents);

/* ======================================
   Public/dev browse & search (no auth)
   NOTE: Keep these for admin/dev tools only.
   Do NOT use these for the student UI.
   ====================================== */

// All non-archived projects (any cycle) — dev/admin viewing
router.get('/', projectController.getAllProjects);

// Full details for one project (hides archived)
router.get('/details/:projectId', projectController.getProjectDetails);

// Filters
router.get('/supervisor/:supervisor', projectController.filterBySupervisor);
router.get('/topic/:topic', projectController.filterByTopic);
router.get('/keyword', projectController.filterByKeyword);
router.get('/filters', projectController.multiFilteredProjects);

// Search
router.get('/search', projectController.searchProjects);

/* ================================
   Supervisor-only (auth required)
   ================================ */

// Create a project (attaches to active cycle if present, else draft)
router.post('/create-project', verifyToken, projectController.createProject);

// My projects (use ?archived=0|1|all; defaults to 0)
router.get('/my', verifyToken, projectController.getMyProjects);

// Archive / Unarchive my project
router.patch('/:projectId/archive', verifyToken, projectController.archiveProject);
router.patch('/:projectId/unarchive', verifyToken, projectController.unarchiveProject);

/* Keep dynamic :projectId routes LAST */
router.get('/:projectId', verifyToken, projectController.getMyProjectById);
router.patch('/:projectId', verifyToken, projectController.updateMyProject);
router.delete('/:projectId', verifyToken, projectController.deleteMyProject);

module.exports = router;
