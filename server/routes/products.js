const express = require('express');
const { getDB } = require('../db');
const { authMiddleware, requirePermission, generateId } = require('../middleware/auth');

const router = express.Router();

// All routes require auth
router.use(authMiddleware);

// ============================================================
// Helper: validate product fields
// ============================================================
function validateProductFields(body, isUpdate = false) {
  const errors = [];
  if (!isUpdate) {
    if (!body.product_code || !body.product_code.trim()) errors.push('产品编码不能为空');
    if (!body.product_name || !body.product_name.trim()) errors.push('产品名称不能为空');
  }
  if (body.product_type) {
    const validTypes = ['软件产品', '硬件产品', '服务'];
    if (!validTypes.includes(body.product_type)) errors.push(`产品类型无效，有效值: ${validTypes.join(', ')}`);
  }
  if (body.status) {
    const validStatuses = ['规划中', '开发中', '已发布', '停止维护'];
    if (!validStatuses.includes(body.status)) errors.push(`状态无效，有效值: ${validStatuses.join(', ')}`);
  }
  return errors;
}

// ============================================================
// GET /api/products/categories/all - List all categories
// Must be placed BEFORE /:id routes to avoid route conflict
// ============================================================
router.get('/categories/all', requirePermission('产品.查看'), (req, res) => {
  try {
    const { queryAll } = getDB();
    const categories = queryAll('SELECT * FROM product_category ORDER BY sort ASC, category_name ASC', []);
    res.json(categories);
  } catch (err) {
    console.error('List categories error:', err);
    res.status(500).json({ error: '获取产品分类列表失败: ' + (err.message || '未知错误') });
  }
});

// ============================================================
// GET /api/products - List products with filters
// ============================================================
router.get('/', requirePermission('产品.查看'), (req, res) => {
  try {
    const { queryAll, queryOne } = getDB();
    const { status, type, category_id, search, page = 1, pageSize = 10 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    let where = 'WHERE 1=1';
    const params = [];

    if (status) { where += ' AND p.status = ?'; params.push(status); }
    if (type) { where += ' AND p.product_type = ?'; params.push(type); }
    if (category_id) { where += ' AND p.category_id = ?'; params.push(category_id); }
    if (search) { where += ' AND (p.product_code LIKE ? OR p.product_name LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

    const countRow = queryOne(`SELECT COUNT(*) as total FROM product p ${where}`, params);
    const count = countRow ? countRow.total : 0;

    const items = queryAll(`
      SELECT p.*, pc.category_name, u.name as owner_name,
        (SELECT COUNT(*) FROM version v WHERE v.product_id = p.product_id) as version_count,
        (SELECT COUNT(*) FROM requirement r WHERE r.product_id = p.product_id) as requirement_count,
        (SELECT COUNT(*) FROM issue i WHERE i.product_id = p.product_id) as issue_count
      FROM product p
      LEFT JOIN product_category pc ON p.category_id = pc.category_id
      LEFT JOIN user u ON p.owner = u.user_id
      ${where}
      ORDER BY p.updated_at DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(pageSize), offset]);

    res.json({ items, total: count, page: parseInt(page), pageSize: parseInt(pageSize) });
  } catch (err) {
    console.error('List products error:', err);
    res.status(500).json({ error: '获取产品列表失败: ' + (err.message || '未知错误') });
  }
});

// ============================================================
// GET /api/products/:id - Get single product detail
// ============================================================
router.get('/:id', requirePermission('产品.查看'), (req, res) => {
  try {
    const { queryAll, queryOne } = getDB();
    const product = queryOne(`
      SELECT p.*, pc.category_name, u.name as owner_name
      FROM product p
      LEFT JOIN product_category pc ON p.category_id = pc.category_id
      LEFT JOIN user u ON p.owner = u.user_id
      WHERE p.product_id = ?
    `, [req.params.id]);

    if (!product) return res.status(404).json({ error: '产品不存在' });

    const versions = queryAll('SELECT * FROM version WHERE product_id = ? ORDER BY created_at DESC', [req.params.id]);

    res.json({ ...product, versions });
  } catch (err) {
    console.error('Get product error:', err);
    res.status(500).json({ error: '获取产品详情失败: ' + (err.message || '未知错误') });
  }
});

// ============================================================
// GET /api/products/:id/versions - Get versions for a product
// ============================================================
router.get('/:id/versions', requirePermission('产品.查看'), (req, res) => {
  try {
    const { queryAll, queryOne } = getDB();
    const product = queryOne('SELECT product_id FROM product WHERE product_id = ?', [req.params.id]);
    if (!product) return res.status(404).json({ error: '产品不存在' });

    const versions = queryAll(`
      SELECT v.*,
        (SELECT COUNT(*) FROM version_item vi WHERE vi.version_id = v.version_id) as total_items,
        (SELECT COUNT(*) FROM version_item vi WHERE vi.version_id = v.version_id AND vi.merge_status = '已合入') as merged_count
      FROM version v
      WHERE v.product_id = ?
      ORDER BY v.created_at DESC
    `, [req.params.id]);

    const versionList = versions.map(v => ({
      ...v,
      merge_rate: v.total_items > 0 ? Math.round((v.merged_count / v.total_items) * 100) : 0
    }));

    res.json({ list: versionList, total: versionList.length });
  } catch (err) {
    console.error('Get product versions error:', err);
    res.status(500).json({ error: '获取产品版本列表失败: ' + (err.message || '未知错误') });
  }
});

// ============================================================
// PUT /api/products/:id/status - Update product status
// ============================================================
router.put('/:id/status', requirePermission('产品.编辑'), (req, res) => {
  try {
    const { queryOne, run } = getDB();
    const existing = queryOne('SELECT * FROM product WHERE product_id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: '产品不存在' });
    }

    const { status } = req.body;
    const validStatuses = ['规划中', '开发中', '已发布', '停止维护'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: `状态无效，有效值: ${validStatuses.join(', ')}` });
    }

    run('UPDATE product SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE product_id = ?', [status, req.params.id]);

    const updated = queryOne(`
      SELECT p.*, pc.category_name, u.name as owner_name
      FROM product p
      LEFT JOIN product_category pc ON p.category_id = pc.category_id
      LEFT JOIN user u ON p.owner = u.user_id
      WHERE p.product_id = ?
    `, [req.params.id]);

    res.json({ ...updated, message: '产品状态更新成功' });
  } catch (err) {
    console.error('Update product status error:', err);
    res.status(500).json({ error: '更新产品状态失败: ' + (err.message || '未知错误') });
  }
});

// ============================================================
// POST /api/products - Create product
// ============================================================
router.post('/', requirePermission('产品.编辑'), (req, res) => {
  try {
    const { queryOne, run } = getDB();
    const { product_code, product_name, product_type, category_id, owner, description, status = '规划中' } = req.body;

    // Validate required fields
    const errors = validateProductFields(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join('; ') });
    }

    // Check for duplicate product_code
    const existing = queryOne('SELECT product_id FROM product WHERE product_code = ?', [product_code.trim()]);
    if (existing) {
      return res.status(409).json({ error: `产品编码"${product_code}"已存在` });
    }

    // Validate category_id if provided
    if (category_id) {
      const category = queryOne('SELECT category_id FROM product_category WHERE category_id = ?', [category_id]);
      if (!category) {
        return res.status(400).json({ error: '产品分类不存在' });
      }
    }

    // Validate owner if provided
    if (owner) {
      const user = queryOne('SELECT user_id FROM user WHERE user_id = ?', [owner]);
      if (!user) {
        return res.status(400).json({ error: '负责人不存在' });
      }
    }

    const product_id = generateId();

    run(`
      INSERT INTO product (product_id, product_code, product_name, product_type, category_id, owner, status, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [product_id, product_code.trim(), product_name.trim(), product_type || null, category_id || null, owner || null, status, description || null]);

    const created = queryOne(`
      SELECT p.*, pc.category_name, u.name as owner_name
      FROM product p
      LEFT JOIN product_category pc ON p.category_id = pc.category_id
      LEFT JOIN user u ON p.owner = u.user_id
      WHERE p.product_id = ?
    `, [product_id]);

    res.status(201).json({ ...created, message: '产品创建成功' });
  } catch (err) {
    console.error('Create product error:', err);
    if (err.message && err.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: '产品编码已存在' });
    }
    res.status(500).json({ error: '创建产品失败: ' + (err.message || '未知错误') });
  }
});

// ============================================================
// PUT /api/products/:id - Update product
// ============================================================
router.put('/:id', requirePermission('产品.编辑'), (req, res) => {
  try {
    const { queryOne, run } = getDB();
    const existing = queryOne('SELECT * FROM product WHERE product_id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: '产品不存在' });
    }

    const { product_code, product_name, product_type, category_id, owner, status, description } = req.body;

    // Validate fields if provided
    const errors = validateProductFields({ ...req.body, product_code: product_code || existing.product_code, product_name: product_name || existing.product_name }, true);
    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join('; ') });
    }

    // Check for duplicate product_code if changed
    if (product_code && product_code.trim() !== existing.product_code) {
      const dup = queryOne('SELECT product_id FROM product WHERE product_code = ? AND product_id != ?', [product_code.trim(), req.params.id]);
      if (dup) {
        return res.status(409).json({ error: `产品编码"${product_code}"已存在` });
      }
    }

    // Validate category_id if provided
    if (category_id) {
      const category = queryOne('SELECT category_id FROM product_category WHERE category_id = ?', [category_id]);
      if (!category) {
        return res.status(400).json({ error: '产品分类不存在' });
      }
    }

    // Validate owner if provided
    if (owner) {
      const user = queryOne('SELECT user_id FROM user WHERE user_id = ?', [owner]);
      if (!user) {
        return res.status(400).json({ error: '负责人不存在' });
      }
    }

    run(`
      UPDATE product SET product_code=?, product_name=?, product_type=?, category_id=?, owner=?, status=?, description=?, updated_at=CURRENT_TIMESTAMP
      WHERE product_id=?
    `, [
      product_code ? product_code.trim() : existing.product_code,
      product_name ? product_name.trim() : existing.product_name,
      product_type !== undefined ? (product_type || null) : existing.product_type,
      category_id !== undefined ? (category_id || null) : existing.category_id,
      owner !== undefined ? (owner || null) : existing.owner,
      status || existing.status,
      description !== undefined ? (description || null) : existing.description,
      req.params.id
    ]);

    const updated = queryOne(`
      SELECT p.*, pc.category_name, u.name as owner_name
      FROM product p
      LEFT JOIN product_category pc ON p.category_id = pc.category_id
      LEFT JOIN user u ON p.owner = u.user_id
      WHERE p.product_id = ?
    `, [req.params.id]);

    res.json({ ...updated, message: '产品更新成功' });
  } catch (err) {
    console.error('Update product error:', err);
    if (err.message && err.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: '产品编码已存在' });
    }
    res.status(500).json({ error: '更新产品失败: ' + (err.message || '未知错误') });
  }
});

// ============================================================
// DELETE /api/products/:id - Delete product
// ============================================================
router.delete('/:id', requirePermission('产品.编辑'), (req, res) => {
  try {
    const { queryOne, run } = getDB();
    const product = queryOne('SELECT status FROM product WHERE product_id = ?', [req.params.id]);
    if (!product) {
      return res.status(404).json({ error: '产品不存在' });
    }
    if (product.status === '已发布') {
      return res.status(400).json({ error: '不能删除已发布的产品' });
    }

    // Check for associated data
    const versionCount = queryOne('SELECT COUNT(*) as count FROM version WHERE product_id = ?', [req.params.id]).count;
    const reqCount = queryOne('SELECT COUNT(*) as count FROM requirement WHERE product_id = ?', [req.params.id]).count;
    const issueCount = queryOne('SELECT COUNT(*) as count FROM issue WHERE product_id = ?', [req.params.id]).count;

    if (versionCount > 0 || reqCount > 0 || issueCount > 0) {
      return res.status(400).json({
        error: `产品存在关联数据（版本${versionCount}个、需求${reqCount}个、问题单${issueCount}个），无法删除`,
        references: { versions: versionCount, requirements: reqCount, issues: issueCount }
      });
    }

    run('DELETE FROM product WHERE product_id = ?', [req.params.id]);
    res.json({ message: '产品删除成功' });
  } catch (err) {
    console.error('Delete product error:', err);
    res.status(500).json({ error: '删除产品失败: ' + (err.message || '未知错误') });
  }
});

// ============================================================
// POST /api/products/categories - Create category
// ============================================================
router.post('/categories', requirePermission('产品.分类维护'), (req, res) => {
  try {
    const { run } = getDB();
    const { category_name, parent_id, description, sort = 0 } = req.body;

    if (!category_name || !category_name.trim()) {
      return res.status(400).json({ error: '分类名称不能为空' });
    }

    const category_id = generateId();
    run('INSERT INTO product_category (category_id, category_name, parent_id, description, sort) VALUES (?,?,?,?,?)',
      [category_id, category_name.trim(), parent_id || null, description || null, sort]);

    res.status(201).json({ category_id, message: '分类创建成功' });
  } catch (err) {
    console.error('Create category error:', err);
    res.status(500).json({ error: '创建分类失败: ' + (err.message || '未知错误') });
  }
});

// ============================================================
// PUT /api/products/categories/:id - Update category
// ============================================================
router.put('/categories/:id', requirePermission('产品.分类维护'), (req, res) => {
  try {
    const { queryOne, run } = getDB();
    const existing = queryOne('SELECT * FROM product_category WHERE category_id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: '分类不存在' });
    }

    const { category_name, parent_id, description, sort } = req.body;

    // Prevent setting parent to self or descendant
    if (parent_id === req.params.id) {
      return res.status(400).json({ error: '不能将分类的父级设置为自己' });
    }

    run('UPDATE product_category SET category_name=?, parent_id=?, description=?, sort=?, updated_at=CURRENT_TIMESTAMP WHERE category_id=?',
      [
        category_name ? category_name.trim() : existing.category_name,
        parent_id !== undefined ? (parent_id || null) : existing.parent_id,
        description !== undefined ? (description || null) : existing.description,
        sort !== undefined ? sort : existing.sort,
        req.params.id
      ]);

    res.json({ message: '分类更新成功' });
  } catch (err) {
    console.error('Update category error:', err);
    res.status(500).json({ error: '更新分类失败: ' + (err.message || '未知错误') });
  }
});

// ============================================================
// DELETE /api/products/categories/:id - Delete category
// ============================================================
router.delete('/categories/:id', requirePermission('产品.分类维护'), (req, res) => {
  try {
    const { queryOne, run } = getDB();
    const childCount = queryOne('SELECT COUNT(*) as count FROM product_category WHERE parent_id = ?', [req.params.id]).count;
    const prodCount = queryOne('SELECT COUNT(*) as count FROM product WHERE category_id = ?', [req.params.id]).count;
    if (childCount > 0 || prodCount > 0) {
      return res.status(400).json({ error: '分类下存在子分类或产品，无法删除' });
    }
    run('DELETE FROM product_category WHERE category_id = ?', [req.params.id]);
    res.json({ message: '分类删除成功' });
  } catch (err) {
    console.error('Delete category error:', err);
    res.status(500).json({ error: '删除分类失败: ' + (err.message || '未知错误') });
  }
});

module.exports = router;
