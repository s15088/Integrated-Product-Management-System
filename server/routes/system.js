const express = require('express');
const bcrypt = require('bcryptjs');
const { getDB } = require('../db');
const { authMiddleware, requirePermission, generateId } = require('../middleware/auth');

const router = express.Router();

// All routes require auth
router.use(authMiddleware);

// ============================================================
// Helper: generate random password (8 characters)
// ============================================================
function generateRandomPassword(length = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ============================================================
// Helper: escape CSV field
// ============================================================
function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// ============================================================
// GET /api/system/users/simple - Lightweight user list for dropdowns
// Only requires authentication (no admin permission needed)
// Returns: [{ user_id, username, name, role }]
// ============================================================
router.get('/users/simple', authMiddleware, (req, res) => {
  try {
    const { queryAll } = getDB();
    const users = queryAll(
      'SELECT user_id, username, name, role FROM user WHERE status = "active" ORDER BY name ASC',
      []
    );
    res.json({ items: users });
  } catch (err) {
    console.error('List simple users error:', err);
    res.status(500).json({ error: '获取用户列表失败: ' + err.message });
  }
});

// ============================================================
// GET /api/system/users - List users (admin only)
// ============================================================
router.get('/users', requirePermission('系统.用户管理'), (req, res) => {
  try {
    const { queryAll, queryOne } = getDB();
    const { status, role, search, page = 1, pageSize = 10 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    let where = 'WHERE 1=1';
    const params = [];

    if (status) {
      where += ' AND u.status = ?';
      params.push(status);
    }
    if (role) {
      where += ' AND u.role = ?';
      params.push(role);
    }
    if (search) {
      where += ' AND (u.username LIKE ? OR u.name LIKE ? OR u.email LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const countRow = queryOne(`
      SELECT COUNT(*) as total FROM user u ${where}
    `, params);
    const total = countRow.total;

    const items = queryAll(`
      SELECT u.user_id, u.username, u.name, u.role, u.email, u.status, u.created_at, u.updated_at
      FROM user u
      ${where}
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(pageSize), offset]);

    res.json({ items, total, page: parseInt(page), pageSize: parseInt(pageSize) });
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ error: '获取用户列表失败: ' + err.message });
  }
});

// ============================================================
// POST /api/system/users - Create user
// ============================================================
router.post('/users', requirePermission('系统.用户管理'), (req, res) => {
  try {
    const { queryOne, run } = getDB();
    const { username, name, role, email, password } = req.body;

    // Validate required fields
    if (!username || !username.trim()) {
      return res.status(400).json({ error: '用户名不能为空' });
    }
    if (!role) {
      return res.status(400).json({ error: '角色不能为空' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: '密码不能为空且长度不能少于6位' });
    }

    // Check if username already exists
    const existing = queryOne('SELECT user_id FROM user WHERE username = ?', [username.trim()]);
    if (existing) {
      return res.status(409).json({ error: '用户名已存在' });
    }

    const user_id = generateId();
    const password_hash = bcrypt.hashSync(password, 10);

    run(`
      INSERT INTO user (user_id, username, name, role, email, password_hash, status)
      VALUES (?, ?, ?, ?, ?, ?, 'active')
    `, [user_id, username.trim(), name || null, role, email || null, password_hash]);

    const created = queryOne(`
      SELECT user_id, username, name, role, email, status, created_at, updated_at
      FROM user WHERE user_id = ?
    `, [user_id]);

    res.status(201).json({ ...created, message: '用户创建成功' });
  } catch (err) {
    console.error('Create user error:', err);
    if (err.message && err.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: '用户名已存在' });
    }
    res.status(500).json({ error: '创建用户失败: ' + err.message });
  }
});

// ============================================================
// PUT /api/system/users/:id - Update user
// ============================================================
router.put('/users/:id', requirePermission('系统.用户管理'), (req, res) => {
  try {
    const { queryOne, run } = getDB();
    const existing = queryOne('SELECT * FROM user WHERE user_id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const { username, name, role, email, status } = req.body;

    // Check username uniqueness if changed
    if (username && username.trim() !== existing.username) {
      const dup = queryOne('SELECT user_id FROM user WHERE username = ? AND user_id != ?', [username.trim(), req.params.id]);
      if (dup) {
        return res.status(409).json({ error: '用户名已存在' });
      }
    }

    run(`
      UPDATE user
      SET username = COALESCE(?, username),
          name = COALESCE(?, name),
          role = COALESCE(?, role),
          email = COALESCE(?, email),
          status = COALESCE(?, status),
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `, [
      username ? username.trim() : null,
      name !== undefined ? name : null,
      role || null,
      email !== undefined ? email : null,
      status || null,
      req.params.id
    ]);

    const updated = queryOne(`
      SELECT user_id, username, name, role, email, status, created_at, updated_at
      FROM user WHERE user_id = ?
    `, [req.params.id]);

    res.json({ ...updated, message: '用户更新成功' });
  } catch (err) {
    console.error('Update user error:', err);
    if (err.message && err.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: '用户名已存在' });
    }
    res.status(500).json({ error: '更新用户失败: ' + err.message });
  }
});

// ============================================================
// POST /api/system/users/:id/reset-password - Reset password
// ============================================================
router.post('/users/:id/reset-password', requirePermission('系统.用户管理'), (req, res) => {
  try {
    const { queryOne, run } = getDB();
    const existing = queryOne('SELECT * FROM user WHERE user_id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const newPassword = generateRandomPassword(8);
    const password_hash = bcrypt.hashSync(newPassword, 10);

    run(`
      UPDATE user SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?
    `, [password_hash, req.params.id]);

    res.json({
      message: '密码重置成功',
      user_id: req.params.id,
      username: existing.username,
      new_password: newPassword
    });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: '重置密码失败: ' + err.message });
  }
});

// ============================================================
// DELETE /api/system/users/:id - Delete user
// ============================================================
router.delete('/users/:id', requirePermission('系统.用户管理'), (req, res) => {
  try {
    const { queryOne, run } = getDB();

    // Cannot delete self
    if (req.user && req.user.user_id === req.params.id) {
      return res.status(400).json({ error: '不能删除自己的账户' });
    }

    const existing = queryOne('SELECT * FROM user WHERE user_id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // Check if user is referenced as owner/reporter/assignee/etc.
    const refCounts = {
      product_owner: queryOne('SELECT COUNT(*) as count FROM product WHERE owner = ?', [req.params.id]).count,
      requirement_proposer: queryOne('SELECT COUNT(*) as count FROM requirement WHERE proposer = ?', [req.params.id]).count,
      issue_reporter: queryOne('SELECT COUNT(*) as count FROM issue WHERE reporter = ?', [req.params.id]).count,
      issue_assignee: queryOne('SELECT COUNT(*) as count FROM issue WHERE assignee = ?', [req.params.id]).count,
      change_request_applicant: queryOne('SELECT COUNT(*) as count FROM change_request WHERE applicant = ?', [req.params.id]).count,
      change_request_approver: queryOne('SELECT COUNT(*) as count FROM change_request WHERE approver = ?', [req.params.id]).count,
      version_item_operator: queryOne('SELECT COUNT(*) as count FROM version_item WHERE operator = ?', [req.params.id]).count,
      audit_log: queryOne('SELECT COUNT(*) as count FROM audit_log WHERE operator = ?', [req.params.id]).count
    };

    const totalRefs = Object.values(refCounts).reduce((sum, val) => sum + val, 0);
    if (totalRefs > 0) {
      return res.status(400).json({
        error: '该用户存在关联数据，无法删除。请先处理关联数据或停用该用户。',
        references: refCounts
      });
    }

    run('DELETE FROM user WHERE user_id = ?', [req.params.id]);

    res.json({ message: '用户已删除', user_id: req.params.id, username: existing.username });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: '删除用户失败: ' + err.message });
  }
});

// ============================================================
// GET /api/system/permissions - Get permission matrix
// ============================================================
router.get('/permissions', (req, res) => {
  try {
    const { queryAll } = getDB();

    // Get all distinct roles
    const roles = queryAll('SELECT DISTINCT role FROM permission ORDER BY role', []).map(r => r.role);

    // Get all distinct permission keys
    const permissionKeys = queryAll('SELECT DISTINCT permission_key FROM permission ORDER BY permission_key', []).map(p => p.permission_key);

    // Get all permission entries
    const allPerms = queryAll('SELECT role, permission_key, allowed FROM permission ORDER BY role, permission_key', []);

    // Build matrix: { role: { permission_key: allowed } }
    const matrix = {};
    for (const role of roles) {
      matrix[role] = {};
      for (const key of permissionKeys) {
        matrix[role][key] = 0; // default not allowed
      }
    }

    for (const perm of allPerms) {
      if (matrix[perm.role]) {
        matrix[perm.role][perm.permission_key] = perm.allowed;
      }
    }

    res.json({ roles, permissionKeys, matrix });
  } catch (err) {
    console.error('Get permissions error:', err);
    res.status(500).json({ error: '获取权限矩阵失败: ' + err.message });
  }
});

// ============================================================
// PUT /api/system/permissions - Update permission matrix
// ============================================================
router.put('/permissions', requirePermission('系统.角色权限'), (req, res) => {
  try {
    const { run } = getDB();
    const { permissions } = req.body;

    if (!permissions || !Array.isArray(permissions) || permissions.length === 0) {
      return res.status(400).json({ error: '请提供权限数组(permissions)' });
    }

    for (const perm of permissions) {
      const { role, permission_key, allowed } = perm;
      if (!role || !permission_key) {
        continue;
      }
      const permission_id = `${role}-${permission_key}`.replace(/\./g, '-');
      run('INSERT OR REPLACE INTO permission (permission_id, role, permission_key, allowed) VALUES (?, ?, ?, ?)',
        [permission_id, role, permission_key, allowed ? 1 : 0]);
    }

    res.json({ message: '权限矩阵更新成功', updated_count: permissions.length });
  } catch (err) {
    console.error('Update permissions error:', err);
    res.status(500).json({ error: '更新权限矩阵失败: ' + err.message });
  }
});

// ============================================================
// GET /api/system/audit-logs - List audit logs
// ============================================================
router.get('/audit-logs', requirePermission('系统.审计查看'), (req, res) => {
  try {
    const { queryAll, queryOne } = getDB();
    const {
      start_time, end_time, operator, operation_type,
      object_type, page = 1, pageSize = 10
    } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    let where = 'WHERE 1=1';
    const params = [];

    if (start_time) {
      where += ' AND a.operation_time >= ?';
      params.push(start_time);
    }
    if (end_time) {
      where += ' AND a.operation_time <= ?';
      params.push(end_time);
    }
    if (operator) {
      where += ' AND a.operator = ?';
      params.push(operator);
    }
    if (operation_type) {
      where += ' AND a.operation_type = ?';
      params.push(operation_type);
    }
    if (object_type) {
      where += ' AND a.object_type = ?';
      params.push(object_type);
    }

    const countRow = queryOne(`
      SELECT COUNT(*) as total FROM audit_log a ${where}
    `, params);
    const total = countRow.total;

    const items = queryAll(`
      SELECT a.*, u.username as operator_username, u.name as operator_name
      FROM audit_log a
      LEFT JOIN user u ON a.operator = u.user_id
      ${where}
      ORDER BY a.operation_time DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(pageSize), offset]);

    res.json({ items, total, page: parseInt(page), pageSize: parseInt(pageSize) });
  } catch (err) {
    console.error('List audit logs error:', err);
    res.status(500).json({ error: '获取审计日志失败: ' + err.message });
  }
});

// ============================================================
// GET /api/system/audit-logs/export - Export audit logs as CSV
// ============================================================
router.get('/audit-logs/export', requirePermission('系统.审计导出'), (req, res) => {
  try {
    const { queryAll } = getDB();
    const { start_time, end_time, operator, operation_type, object_type } = req.query;

    let where = 'WHERE 1=1';
    const params = [];

    if (start_time) {
      where += ' AND a.operation_time >= ?';
      params.push(start_time);
    }
    if (end_time) {
      where += ' AND a.operation_time <= ?';
      params.push(end_time);
    }
    if (operator) {
      where += ' AND a.operator = ?';
      params.push(operator);
    }
    if (operation_type) {
      where += ' AND a.operation_type = ?';
      params.push(operation_type);
    }
    if (object_type) {
      where += ' AND a.object_type = ?';
      params.push(object_type);
    }

    const items = queryAll(`
      SELECT a.*, u.username as operator_username, u.name as operator_name
      FROM audit_log a
      LEFT JOIN user u ON a.operator = u.user_id
      ${where}
      ORDER BY a.operation_time DESC
    `, params);

    // Build CSV with BOM for Excel compatibility with Chinese characters
    const headers = [
      '审计ID', '操作时间', '操作人ID', '操作人用户名', '操作人姓名',
      '操作人角色', '操作类型', '对象类型', '对象ID', 'IP地址', '操作结果', '变更详情'
    ];

    const csvRows = [headers.join(',')];

    for (const item of items) {
      const row = [
        escapeCSV(item.audit_id),
        escapeCSV(item.operation_time),
        escapeCSV(item.operator),
        escapeCSV(item.operator_username),
        escapeCSV(item.operator_name),
        escapeCSV(item.role),
        escapeCSV(item.operation_type),
        escapeCSV(item.object_type),
        escapeCSV(item.object_id),
        escapeCSV(item.ip_address),
        escapeCSV(item.result),
        escapeCSV(item.diff)
      ];
      csvRows.push(row.join(','));
    }

    const csvContent = '\uFEFF' + csvRows.join('\n');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `audit-logs-${timestamp}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (err) {
    console.error('Export audit logs error:', err);
    res.status(500).json({ error: '导出审计日志失败: ' + err.message });
  }
});

module.exports = router;