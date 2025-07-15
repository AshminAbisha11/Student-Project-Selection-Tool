/**
 * Importing required modules:
**/
const express = require('express');
const cors = require('cors');

const db = require('./config/db');
require('dotenv').config();



const loginRoutes = require('./routes/loginRoutes');
const registerRoutes = require('./routes/registerRoutes');
const studentDashboardRoutes = require('./routes/studentDashboardRoutes');




const app = express();

// Middleware
app.use(cors());
app.use(express.json());


/***
 * To use Routes
 */ 
app.use("/login", loginRoutes);
app.use("/signup" ,registerRoutes);
app.use("/dashboard", studentDashboardRoutes);




// Start server
const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
