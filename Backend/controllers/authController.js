const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { addTokenToBlacklist } = require('../models/blacklistModel');

exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const [results] = await db.query('SELECT * FROM users WHERE email = ?', [email]);

    if (results.length === 0) {
      return res.status(400).json({ message: 'User not found. Please sign up.' });
    }

    const user = results[0];

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Password does not match' });
    }

    await db.query('UPDATE users SET last_login = NOW() WHERE user_id = ?', [user.user_id]);

    const payload = {
      user_id: user.user_id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
   const token = jwt.sign(
   {
    user_id: user.user_id,
    email: user.email,
    name: user.name,
    role: user.role,
   },
   process.env.JWT_SECRET_KEY,
   { expiresIn: '1h' }
   );

    return res.status(200).json({
      message: 'User login successful',
      token,
      user: payload,
    });

  } catch (error) {
    console.error('User login error:', error.stack);
    return res.status(500).json({ message: 'Internal server error' });
  }
};


// Register User
exports.registerUser = async (req, res) => {
  try {
    const { name, email, password, confirmPassword, programme, role } = req.body;

    //Validate all required fields
    if (!name || !email || !password || !confirmPassword || !programme || !role) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    //Validate email format
    const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Invalid email format.' });
    }

    //Validate password strength
    const passwordStrengthRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#\$%\^&\*])[A-Za-z\d!@#\$%\^&\*]{8,}$/;
    if (!passwordStrengthRegex.test(password)) {
      return res.status(400).json({
        message:
          'Password must be at least 8 characters long, include one uppercase letter, one lowercase, one number, and one special character.',
      });
    }

    //Confirm password match
    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match.' });
    }

    //Check if user already exists
    const [existingUser] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (existingUser.length > 0) {
      return res.status(400).json({ message: 'Email already registered.' });
    }

    //Hash the password
    const hashedPassword = await bcrypt.hash(password,8);

    // Insert user into database
    await db.query(
      'INSERT INTO users (name, email, password, programme, role) VALUES (?, ?, ?, ?, ?)',
      [name, email, hashedPassword, programme, role]
    );

    res.status(201).json({ message: 'User registered successfully.' });
  } catch (error) {
    console.error('Registration error:', error.message);
    res.status(500).json({ message: 'Internal server error.' });
  }
};


exports.forgotPassword = async (req, res) => {
  const { email } = req.body;

  if (!email) return res.status(400).json({ message: 'Email is required.' });

  try {
    const [user] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (!user.length) {
      return res.status(404).json({ message: 'No user with that email.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600000); // 1 hour from now

    await db.query(
      'UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE email = ?',
      [token, expires, email]
    );

    const resetLink = `http://localhost:3000/reset-password/${token}`;

    // Send email using Nodemailer
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD
      }
    });

    await transporter.sendMail({
      to: email,
      subject: 'Password Reset',
      html: `<p>Click <a href="${resetLink}">here</a> to reset your password. This link will expire in 1 hour.</p>`
    });

    res.json({ message: 'Password reset link sent to email.' });

  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
};

//reset - password
exports.resetPassword = async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  if (!token || !password) {
    return res.status(400).json({ message: 'Token and password are required.' });
  }

  try {
    // 1. Find the user with the matching reset token
    const [user] = await db.query(
      'SELECT * FROM users WHERE reset_token = ? AND reset_token_expiry > NOW()',
      [token]
    );

    if (!user.length) {
      return res.status(400).json({ message: 'Invalid or expired token.' });
    }

    // 2. Hash the new password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 3. Update the user's password and clear the reset token
    await db.query(
      'UPDATE users SET password = ?, reset_token = NULL, reset_token_expiry = NULL WHERE reset_token = ?',
      [hashedPassword, token]
    );

    res.json({ message: 'Password reset successful. You can now log in.' });

  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
};

exports.logoutUser = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(400).json({ message: 'Token missing from header' });
    }

    await addTokenToBlacklist(token); 
    return res.status(200).json({ message: 'Logout successful' });

  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({ message: 'Logout failed' });
  }
};

//change password
exports.changePassword = async (req, res) => {
  const userId = req.user.user_id;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Both current and new passwords are required.' });
  }

  try {
    const [users] = await db.query('SELECT password FROM users WHERE user_id = ?', [userId]);
    if (users.length === 0) return res.status(404).json({ message: 'User not found.' });

    const valid = await bcrypt.compare(currentPassword, users[0].password);
    if (!valid) return res.status(401).json({ message: 'Current password is incorrect.' });

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password = ? WHERE user_id = ?', [hashedNewPassword, userId]);

    res.status(200).json({ message: 'Password updated successfully.' });
  } catch (err) {
    console.error('Password change error:', err);
    res.status(500).json({ message: 'Internal server error.' });
  }
};
