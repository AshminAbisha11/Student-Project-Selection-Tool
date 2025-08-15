// middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const { isTokenBlacklisted } = require('../models/blacklistModel');

module.exports = async function verifyToken(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    const match = /^Bearer\s+(.+)$/i.exec(auth);
    const token = match ? match[1].trim() : null;

    if (!token || token === 'null' || token === 'undefined') {
      return res.status(401).json({ message: 'No token provided' });
    }

    // Block if this token was revoked via logout
    if (await isTokenBlacklisted(token)) {
      res.set('WWW-Authenticate', 'Bearer error="invalid_token", error_description="revoked"');
      return res.status(401).json({ message: 'Token revoked' });
    }

    // Verify signature & expiry
    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);

    // Attach for downstream handlers
    req.user = decoded;
    req.token = token;

    return next();
  } catch (err) {
    const msg =
      err?.name === 'TokenExpiredError'
        ? 'Token expired'
        : 'Invalid or malformed token';

    res.set('WWW-Authenticate', `Bearer error="invalid_token", error_description="${msg}"`);
    return res.status(401).json({ message: msg });
  }
};
