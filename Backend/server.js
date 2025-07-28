/**
 * Importing required modules:
**/
const express = require('express');
const cors = require('cors');

const db = require('./config/db');
require('dotenv').config();


const verifyToken = require('./middleware/authMiddleware');
const loginRoutes = require('./routes/loginRoutes');
const registerRoutes = require('./routes/registerRoutes');
const studentDashboardRoutes = require('./routes/studentDashboardRoutes');
const projectRoutes = require('./routes/projectRoutes');
const preferenceRoutes = require('./routes/preferenceRoutes');
const proposalRoutes = require('./routes/proposalRoutes');
const forgetPasswordRoutes = require('./routes/forgetPasswordRoutes');
const resetPasswordRoutes = require('./routes/resetPasswordRoutes');
const logoutRoutes = require('./routes/logoutRoutes');
const changePasswordRoutes = require('./routes/changePasswordRoutes');


const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

/***
 * To use Routes
 */ 
app.use("/login", loginRoutes);
app.use("/signup" ,registerRoutes);
app.use("/dashboard", studentDashboardRoutes);
app.use("/projects", projectRoutes);
app.use("/preferences", preferenceRoutes);
app.use("/proposals", proposalRoutes);
app.use("/forgot-password", forgetPasswordRoutes);
app.use('/reset-password', resetPasswordRoutes);
app.use('/logout', logoutRoutes);
app.use('/change-password', changePasswordRoutes);


// Start server
const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
