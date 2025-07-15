const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

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
      role: user.role,
    };
    const token = jwt.sign({ id: user.id, role: user.role },  process.env.JWT_SECRET_KEY, { expiresIn: '1h' });

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

