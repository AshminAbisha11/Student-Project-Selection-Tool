// controllers/authController.js
const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { addTokenToBlacklist } = require('../models/blacklistModel');

const JWT_SECRET = process.env.JWT_SECRET_KEY || 'dev-secret';
const FRONTEND_ORIGIN =
  process.env.CLIENT_ORIGIN || process.env.FRONTEND_URL || 'http://localhost:3000';

/* ------------ helpers ------------- */
const getBearer = (req) => {
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/.exec(h);
  return m ? m[1].trim() : null;
};
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

const listFromEnv = (val) =>
  String(val || '')
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);

const parseJson = (val) => {
  if (!val) return null;
  if (Array.isArray(val) || typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return null;
  }
};

const pwStrong = (s) =>
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#\$%\^&\*]).{8,}$/.test(String(s || ''));

const normalizeEmail = (e) => String(e || '').trim().toLowerCase();
const emailDomain = (e) => normalizeEmail(e).split('@')[1] || '';

// at the top of the file
const validator = require('validator');

function normalizeEmailKeepPlus(raw) {
  const e = String(raw || '').trim();
  if (!e) return '';
  return validator.normalizeEmail(e, {
    gmail_remove_dots: false,
    gmail_remove_subaddress: false,
    outlookdotcom_remove_subaddress: false,
    yahoo_remove_subaddress: false,
    icloud_remove_subaddress: false,
  }) || e.toLowerCase(); 
}


/* ========== ADMIN SIGNUP ==========
 * POST /auth/admin-signup
 * Body: { name, email, password, inviteCode? }
 * - First ever admin (bootstrap):
 *      If ADMIN_BOOTSTRAP_CODES is set, inviteCode MUST match one of them.
 *      If ADMIN_BOOTSTRAP_ALLOWED_DOMAINS is set, email domain must be allowed.
 * - Otherwise:
 *      inviteCode REQUIRED and validated against admin_invites table.
 * ================================== */
exports.adminSignup = async (req, res) => {
  try {
    let { name, email, password, inviteCode } = req.body || {};
    name = String(name || '').trim();
    email = normalizeEmail(email);

    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ message: 'Name, email and password are required.' });
    }
    if (!pwStrong(password)) {
      return res.status(400).json({
        message:
          'Password must be at least 8 characters with upper, lower, number and special character.',
      });
    }

    // Already registered?
    const [[dup]] = await db.query(
      'SELECT user_id FROM users WHERE email = ? LIMIT 1',
      [email]
    );
    if (dup) return res.status(409).json({ message: 'Email already registered.' });

    // First-ever admin?
    const [[cnt]] = await db.query(
      "SELECT COUNT(*) AS c FROM users WHERE role='admin'"
    );
    const isBootstrap = Number(cnt.c || 0) === 0;

    let invite = null;

    if (isBootstrap) {
      // ---- Bootstrap path (first admin only)
      const envCodes = listFromEnv(process.env.ADMIN_BOOTSTRAP_CODES);
      const envDomains = listFromEnv(
        process.env.ADMIN_BOOTSTRAP_ALLOWED_DOMAINS
      ).map((d) => d.toLowerCase());

      // If bootstrap codes exist in env, require a matching code
      if (envCodes.length) {
        const raw = String(inviteCode || '').trim();
        const code = raw
          .split(/[,\s]+/)
          .map((s) => s.trim())
          .filter(Boolean)[0];
        if (!code || !envCodes.includes(code)) {
          return res
            .status(400)
            .json({ message: 'Invalid or missing bootstrap code.' });
        }
      }

      // If allowed domains are configured, enforce them
      if (envDomains.length) {
        const dom = emailDomain(email).toLowerCase();
        if (!envDomains.includes(dom)) {
          return res
            .status(400)
            .json({ message: 'Email domain not allowed for bootstrap.' });
        }
      }
    } else {
      // ---- Normal path (subsequent admins): require DB invite
      const raw = String(inviteCode || '').trim();
      if (!raw) {
        return res.status(400).json({ message: 'Invite code is required.' });
      }
      const code = raw
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)[0];
      const codeHash = sha256(code);

      const [[row]] = await db.query(
        `SELECT * FROM admin_invites
           WHERE code_hash = ?
             AND role = 'admin'
             AND (expires_at IS NULL OR expires_at > NOW())
             AND uses < max_uses
         LIMIT 1`,
        [codeHash]
      );
      if (!row) {
        return res.status(400).json({ message: 'Invalid or expired invite code.' });
      }

      // Email & domain checks
      const dom = emailDomain(email).toLowerCase();
      if (row.email && row.email.toLowerCase() !== email) {
        return res.status(400).json({ message: 'Invite locked to a different email.' });
      }
      const allowed =
        parseJson(row.allowed_domains_json) ||
        (row.allowed_domain ? [row.allowed_domain] : []);
      if (
        Array.isArray(allowed) &&
        allowed.length &&
        !allowed.map((d) => String(d).toLowerCase()).includes(dom)
      ) {
        return res
          .status(400)
          .json({ message: 'Email domain not allowed for this invite.' });
      }
      invite = row;
    }

    // Create admin user
    const hashed = await bcrypt.hash(password, 10);
    const [ins] = await db.query(
      `INSERT INTO users (name, email, password, role, active, is_email_verified, created_at)
       VALUES (?,?,?,?,1,0,NOW())`,
      [name, email, hashed, 'admin']
    );
    const userId = ins.insertId;

    // Consume invite (if any)
    if (invite) {
      await db.query(
        `UPDATE admin_invites
           SET uses = uses + 1,
               used_up_at = CASE WHEN uses + 1 >= max_uses THEN NOW() ELSE used_up_at END
         WHERE invite_id = ?`,
        [invite.invite_id]
      );
      await db.query(
        `INSERT INTO admin_invite_claims (invite_id, user_id) VALUES (?,?)`,
        [invite.invite_id, userId]
      );
    }

    // Audit
    await db.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, meta)
       VALUES (?,?,?,?,?)`,
      [
        userId,
        isBootstrap ? 'ADMIN_BOOTSTRAP' : 'ADMIN_SIGNUP',
        'user',
        String(userId),
        JSON.stringify({ email }),
      ]
    );

    // JWT
    const payload = { user_id: userId, email, name, role: 'admin' };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });

    return res.status(201).json({ token, role: 'admin', user: payload });
  } catch (e) {
    console.error('adminSignup error', e);
    return res.status(500).json({ message: 'Server error' });
  }
};

/* ========== GENERIC LOGIN ==========
 * POST /auth/login
 * Body: { email, password }
 * ================================== */
exports.loginUser = async (req, res) => {
  try {
    let { email, password } = req.body || {};
    email = normalizeEmail(email);
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const [rows] = await db.query(
      'SELECT user_id, email, name, role, password FROM users WHERE email = ?',
      [email]
    );
    if (rows.length === 0) {
      return res.status(400).json({ message: 'User not found. Please sign up.' });
    }

    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ message: 'Password does not match.' });

    await db.query('UPDATE users SET last_login = NOW() WHERE user_id = ?', [
      user.user_id,
    ]);

    const payload = {
      user_id: user.user_id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });

    return res.status(200).json({ message: 'User login successful', token, user: payload });
  } catch (error) {
    console.error('User login error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/* ========== GENERIC REGISTER ==========
 * POST /auth/register
 * ===================================== */
exports.registerUser = async (req, res) => {
  try {
    let { name, email, password, confirmPassword, programme, role } = req.body || {};
    name = String(name || '').trim();
    email = normalizeEmailKeepPlus(email);    // <-- keep +alias
    role = String(role || '').trim().toLowerCase();

    if (!name || !email || !password || !confirmPassword || !role) {
      return res.status(400).json({ message: 'All fields are required.' });
    }
    if (role === 'student' && !programme) {
      return res.status(400).json({ message: 'Programme is required for students.' });
    }
    if (role !== 'student') programme = null;

    // allow '+' in the local part
    const emailRegex = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Invalid email format.' });
    }

    if (!pwStrong(password)) {
      return res.status(400).json({
        message: 'Password must be at least 8 characters, with upper, lower, number and special character.',
      });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match.' });
    }

    const [existing] = await db.query('SELECT user_id FROM users WHERE email = ?', [email]);
    if (existing.length) {
      return res.status(400).json({ message: 'Email already registered.' });
    }

    const hashed = await bcrypt.hash(password, 10);
    await db.query(
      'INSERT INTO users (name, email, password, programme, role) VALUES (?, ?, ?, ?, ?)',
      [name, email, hashed, programme, role]
    );

    return res.status(201).json({ message: 'User registered successfully.' });
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

/* ========== FORGOT PASSWORD ==========
 * POST /auth/forgot-password
 * ==================================== */
exports.forgotPassword = async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!email) return res.status(400).json({ message: 'Email is required.' });

  try {
    const [user] = await db.query('SELECT user_id FROM users WHERE email = ?', [
      email,
    ]);
    if (!user.length)
      return res.status(404).json({ message: 'No user with that email.' });

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600000); // 1h

    await db.query(
      'UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE email = ?',
      [token, expires, email]
    );

    const resetLink = `${FRONTEND_ORIGIN}/reset-password/${token}`;

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD,
      },
    });

    await transporter.sendMail({
      to: email,
      subject: 'Password Reset',
      html: `<p>Click <a href="${resetLink}">here</a> to reset your password. This link will expire in 1 hour.</p>`,
    });

    return res.json({ message: 'Password reset link sent to email.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/* ========== RESET PASSWORD ==========
 * POST /auth/reset-password/:token
 * =================================== */
exports.resetPassword = async (req, res) => {
  const token = String(req.params?.token || '');
  const password = String(req.body?.password || '');
  if (!token || !password) {
    return res.status(400).json({ message: 'Token and password are required.' });
  }

  try {
    const [user] = await db.query(
      'SELECT user_id FROM users WHERE reset_token = ? AND reset_token_expiry > NOW()',
      [token]
    );
    if (!user.length)
      return res.status(400).json({ message: 'Invalid or expired token.' });

    const hashed = await bcrypt.hash(password, 10);
    await db.query(
      'UPDATE users SET password = ?, reset_token = NULL, reset_token_expiry = NULL WHERE reset_token = ?',
      [hashed, token]
    );

    return res.json({
      message: 'Password reset successful. You can now log in.',
    });
  } catch (err) {
    console.error('Reset password error:', err);
    return res.status(500).json({ message: 'Server error.' });
  }
};

/* ========== LOGOUT ==========
 * POST /auth/logout
 * Header: Authorization: Bearer <token>
 * ===================================== */
exports.logoutUser = async (req, res) => {
  try {
    const token = getBearer(req);
    if (token && token !== 'null' && token !== 'undefined') {
      await addTokenToBlacklist(token);
    }
    return res.status(200).json({ message: 'Logout successful' });
  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({ message: 'Logout failed' });
  }
};

/* ========== CHANGE PASSWORD (protected) ==========
 * POST /auth/change-password
 * ================================================ */
exports.changePassword = async (req, res) => {
  const userId = req.user?.user_id;
  const { currentPassword, newPassword } = req.body || {};
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });
  if (!currentPassword || !newPassword) {
    return res
      .status(400)
      .json({ message: 'Both current and new passwords are required.' });
  }

  try {
    const [users] = await db.query('SELECT password FROM users WHERE user_id = ?', [
      userId,
    ]);
    if (users.length === 0)
      return res.status(404).json({ message: 'User not found.' });

    const valid = await bcrypt.compare(currentPassword, users[0].password);
    if (!valid)
      return res.status(401).json({ message: 'Current password is incorrect.' });

    if (!pwStrong(newPassword)) {
      return res.status(400).json({
        message:
          'New password must be at least 8 characters with upper, lower, number and special character.',
      });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password = ? WHERE user_id = ?', [
      hashed,
      userId,
    ]);

    return res.status(200).json({ message: 'Password updated successfully.' });
  } catch (err) {
    console.error('Password change error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

/* ========== ME (protected) ==========
 * GET /auth/me
 * =================================== */
exports.me = async (req, res) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  return res.json({ user: req.user });
};

/* ========== ADMIN LOGIN ==========
 * POST /auth/admin-login
 * Body: { email, password }
 * - requires role === 'admin'
 * ================================= */
exports.adminLogin = async (req, res) => {
  try {
    let { email, password } = req.body || {};
    email = normalizeEmail(email);

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const [rows] = await db.query(
      'SELECT user_id, email, name, role, password FROM users WHERE email = ? LIMIT 1',
      [email]
    );
    if (rows.length === 0) {
      return res.status(400).json({ message: 'User not found.' });
    }

    const user = rows[0];

    if (String(user.role || '').toLowerCase() !== 'admin') {
      return res.status(403).json({ message: 'This account is not an admin.' });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ message: 'Password does not match.' });

    await db.query('UPDATE users SET last_login = NOW() WHERE user_id = ?', [
      user.user_id,
    ]);

    const payload = {
      user_id: user.user_id,
      email: user.email,
      name: user.name,
      role: 'admin',
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });

    return res
      .status(200)
      .json({ message: 'Admin login successful', token, user: payload });
  } catch (err) {
    console.error('Admin login error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
