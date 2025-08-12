// Backend/middleware/requireAdmin.js
module.exports = function requireAdmin(req, res, next) {
  // assumes your auth middleware sets req.user with a 'role' field
  if (req.user?.role === 'admin') {
    return next();
  }
  return res.status(403).json({ message: 'Admin only' });
};
