const jwt = require('jsonwebtoken');
require('dotenv').config(); 
const { isTokenBlacklisted } = require('../models/blacklistModel');



const verifyToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  const blacklisted = await isTokenBlacklisted(token);
  if (blacklisted) {
    return res.status(403).json({ message: 'Token has been blacklisted.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ message: 'Invalid or expired token.' });
  }
};

module.exports = verifyToken;