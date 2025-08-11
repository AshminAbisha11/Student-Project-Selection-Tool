const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');
const verifyToken = require('../middleware/authMiddleware'); 


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


//create project by the supervisior 
router.post('/create-project',verifyToken ,  projectController.createProject);



module.exports = router;
