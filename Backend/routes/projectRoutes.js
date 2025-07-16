const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');

// All projects
router.get('/', projectController.getAllProjects);

//each project
router.get('/details/:projectId', projectController.getProjectDetails);


// Filtered by supervisor/topic/keyword
router.get('/supervisor/:supervisor', projectController.filterBySupervisor);
router.get('/topic/:topic', projectController.filterByTopic);
router.get('/keyword', projectController.filterByKeyword);
router.get('/filters', projectController.multiFilteredProjects);

// Search by keyword
router.get('/search', projectController.searchProjects);

module.exports = router;
