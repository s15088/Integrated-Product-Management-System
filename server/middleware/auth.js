const jwt = require('jsonwebtoken');
const { getDB } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret';

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { queryOne } = getDB();
    const user = queryOne('SELECT user_id, username, name, role, email, status FROM user WHERE user_id = ?', [decoded.userId]);
    
    if (!user || user.status !== 'active') {
      return res.status(401).json({ error: 'Invalid or inactive user' });
    }
    
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function requirePermission(permissionKey) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const { queryOne } = getDB();
    const perm = queryOne('SELECT allowed FROM permission WHERE role = ? AND permission_key = ?', [req.user.role, permissionKey]);
    
    if (!perm || !perm.allowed) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    next();
  };
}

function logAudit(operationType, objectType, objectId) {
  return (req, res, next) => {
    // We'll log after the operation is successful
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300 && req.user) {
        const { run } = getDB();
        const auditId = generateId();
        const ip = req.ip || req.connection.remoteAddress;
        run(`
          INSERT INTO audit_log (audit_id, operator, role, operation_type, object_type, object_id, ip_address, result)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [auditId, req.user.user_id, req.user.role, operationType, objectType, objectId || null, ip, 'success']);
      }
    });
    next();
  };
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

module.exports = { authMiddleware, requirePermission, logAudit, generateId };
