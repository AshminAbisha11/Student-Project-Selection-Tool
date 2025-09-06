const express = require("express");
const router = express.Router();

const report = require("../controllers/reportController");
// Use your existing auth middleware
const auth = require("../middleware/authMiddleware");

// /reports/...
router.get("/allocations.csv", auth, report.allocationsCsv);
router.get("/supervisor-load.csv", auth, report.supervisorLoadCsv);
router.get("/summary.json", auth, report.summaryJson);

module.exports = router;
