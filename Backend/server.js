/**
 * Importing required modules:
**/
require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const db = require('./config/db');

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
const feedbackRoutes = require('./routes/feedbackRoutes');
const allocationRoutes = require('./routes/allocationRoutes');
const userRoutes = require('./routes/userRoutes');
const supervisorDashboardRoutes = require('./routes/supervisorDashboardRoutes');
const supervisorRoutes = require('./routes/supervisorRoutes');
const cycleRoutes = require('./routes/cycleRoutes');
const adminRoutes = require('./routes/adminRoutes');
const adminRegisterRoutes = require('./routes/adminRegisterRoutes');
const adminLoginRoutes = require('./routes/adminLoginRoutes');
const reportRoutes = require("./routes/reportRoutes");


const app = express();

/* ---------------------------
   CORS (explicit origin + creds)
   --------------------------- */
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:3000';

const corsOptions = {
  origin: (origin, cb) => {
    // allow Postman/curl (no origin) and your SPA origin
    if (!origin || origin === CLIENT_ORIGIN) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

app.use(cors(corsOptions)); // this already handles preflights

// If you want to be extra explicit without using '*', you can use a regex:
// app.options(/^\/.*/i, cors(corsOptions));

/* ---------------------------
   Body & static
   --------------------------- */
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

/* ---------------------------
   Simple health & auth helpers
   --------------------------- */
app.get('/healthz', (_req, res) => res.json({ ok: true }));

app.get('/auth/me', verifyToken, (req, res) => {
  res.json({ user: req.user || null });
});

/* ---------------------------
   Routes
   --------------------------- */
app.use('/login', loginRoutes);
app.use('/signup', registerRoutes);
app.use('/dashboard', studentDashboardRoutes);
app.use('/projects', projectRoutes);
app.use('/preferences', preferenceRoutes);
app.use('/proposals', proposalRoutes);
app.use('/forgot-password', forgetPasswordRoutes);
app.use('/reset-password', resetPasswordRoutes);
app.use('/logout', logoutRoutes);
app.use('/change-password', changePasswordRoutes);
app.use('/feedback', feedbackRoutes);
app.use('/allocations', allocationRoutes);
app.use('/cycle', cycleRoutes);
app.use('/users', userRoutes);
app.use('/supervisor', supervisorDashboardRoutes);
app.use('/supervisor', supervisorRoutes);
app.use('/admin', adminRoutes);
app.use('/admin-signup', adminRegisterRoutes);
app.use('/admin-login', adminLoginRoutes);
app.use('/reports', reportRoutes);




/* ---------------------------
   Start server
   --------------------------- */
const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
  console.log(`Allowed client origin: ${CLIENT_ORIGIN}`);
});
