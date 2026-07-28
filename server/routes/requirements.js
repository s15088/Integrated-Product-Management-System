const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const { getDB } = require('../db');
const { authMiddleware, requirePermission, generateId } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// All routes require auth
router.use(authMiddleware);

// ============================================================
// GET /api/requirements/import/template - Download import template
// ============================================================
router.get('/import/template', (req, res) => {
  try {
    const templateData = [
      {
        '标题': '用户登录功能优化',
        '产品ID': 'prod-001',
        '优先级': '高',
        '提出人': 'user-001',
        '模块': '登录模块',
        '来源': '客户反馈',
        '期望日期': '2024-12-31',
        '描述': '优化用户登录流程，支持多种登录方式，提升用户体验',
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '需求导入模板');

    worksheet['!cols'] = [
      { wch: 30 }, { wch: 15 }, { wch: 10 }, { wch: 15 },
      { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 50 },
    ];

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const filename = '需求导入模板.xlsx';

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(buffer);
  } catch (err) {
    console.error('Download requirement template error:', err);
    res.status(500).json({ error: '下载模板失败: ' + err.message });
  }
});

// ============================================================
// Helper: generate requirement code
// ============================================================
function generateRequirementCode() {
  const now = Date.now();
  const seq = Math.random().toString(36).substr(2, 4).toUpperCase();
  return `REQ-${now.toString(36).toUpperCase()}-${seq}`;
}

// ============================================================
// Helper: get version items for a list of requirement IDs
// ============================================================
function getVersionItemsForRequirements(requirementIds) {
  if (!requirementIds || requirementIds.length === 0) return {};
  const { queryAll } = getDB();
  const placeholders = requirementIds.map(() => '?').join(',');
  const rows = queryAll(`
    SELECT vi.item_id, v.version_id, v.version_no, v.version_name, v.status as version_status,
           vi.merge_status, vi.source_branch, vi.merged_at
    FROM version_item vi
    JOIN version v ON vi.version_id = v.version_id
    WHERE vi.item_type = 'requirement' AND vi.item_id IN (${placeholders})
    ORDER BY v.version_no DESC
  `, requirementIds);

  const map = {};
  for (const row of rows) {
    if (!map[row.item_id]) map[row.item_id] = [];
    map[row.item_id].push({
      version_id: row.version_id,
      version_no: row.version_no,
      version_name: row.version_name,
      version_status: row.version_status,
      merge_status: row.merge_status,
      source_branch: row.source_branch,
      merged_at: row.merged_at
    });
  }
  return map;
}

// ============================================================
// POST /api/requirements/import/validate - Validate Excel file without importing
// Must be placed BEFORE /:id routes to avoid route conflict
// ============================================================
router.post('/import/validate', requirePermission('需求.提出'), upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传Excel文件' });
    }

    const { queryOne } = getDB();
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (!rows || rows.length === 0) {
      return res.status(400).json({ error: 'Excel文件中没有数据' });
    }

    const validPriorities = ['高', '中', '低'];
    const preview = [];
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      const title = (row['标题'] || row['title'] || '').toString().trim();
      const productId = (row['产品ID'] || row['product_id'] || '').toString().trim();
      const priority = (row['优先级'] || row['priority'] || '').toString().trim();
      const proposer = (row['提出人'] || row['proposer'] || '').toString().trim();
      const module = (row['模块'] || row['module'] || '').toString().trim();
      const source = (row['来源'] || row['source'] || '').toString().trim();
      const expectedDate = (row['期望日期'] || row['expected_date'] || '').toString().trim();
      const description = (row['描述'] || row['description'] || '').toString().trim();

      const rowErrors = [];
      if (!title) rowErrors.push('标题不能为空');
      if (!productId) rowErrors.push('产品ID不能为空');
      if (!priority) rowErrors.push('优先级不能为空');
      if (priority && !validPriorities.includes(priority)) rowErrors.push(`优先级无效: ${priority}`);

      if (productId) {
        const product = queryOne('SELECT product_id FROM product WHERE product_id = ?', [productId]);
        if (!product) rowErrors.push(`产品不存在: ${productId}`);
      }

      if (proposer) {
        const user = queryOne('SELECT user_id FROM user WHERE user_id = ?', [proposer]);
        if (!user) rowErrors.push(`用户不存在: ${proposer}`);
      }

      if (rowErrors.length > 0) {
        errors.push({ row: rowNum, title: title || '(空)', errors: rowErrors });
      } else {
        preview.push({ row: rowNum, title, product_id: productId, priority, module, source, proposer, expected_date: expectedDate, description });
      }
    }

    res.json({
      valid: preview.length,
      invalid: errors.length,
      total: rows.length,
      preview: preview.slice(0, 20),
      errors
    });
  } catch (err) {
    console.error('Validate import error:', err);
    res.status(500).json({ error: '文件校验失败: ' + (err.message || '未知错误') });
  }
});

// ============================================================
// POST /api/requirements/import - Import from Excel
// Must be placed BEFORE /:id routes to avoid route conflict
// ============================================================
router.post('/import', requirePermission('需求.提出'), upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传Excel文件' });
    }

    const { queryOne, run } = getDB();
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (!rows || rows.length === 0) {
      return res.status(400).json({ error: 'Excel文件中没有数据' });
    }

    const results = { success: 0, failed: 0, errors: [] };
    const validPriorities = ['高', '中', '低'];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // Excel row number (1-indexed, +1 for header)

      // Validate required fields
      const title = (row['标题'] || row['title'] || '').toString().trim();
      const productId = (row['产品ID'] || row['product_id'] || '').toString().trim();
      const priority = (row['优先级'] || row['priority'] || '').toString().trim();
      const proposer = (row['提出人'] || row['proposer'] || '').toString().trim();

      const errors = [];
      if (!title) errors.push('标题不能为空');
      if (!productId) errors.push('产品ID不能为空');
      if (!priority) errors.push('优先级不能为空');
      if (priority && !validPriorities.includes(priority)) errors.push(`优先级无效: ${priority}，有效值: ${validPriorities.join(', ')}`);

      // Validate product exists
      if (productId) {
        const product = queryOne('SELECT product_id FROM product WHERE product_id = ?', [productId]);
        if (!product) errors.push(`产品不存在: ${productId}`);
      }

      // Validate proposer exists
      if (proposer) {
        const user = queryOne('SELECT user_id FROM user WHERE user_id = ?', [proposer]);
        if (!user) errors.push(`用户不存在: ${proposer}`);
      }

      if (errors.length > 0) {
        results.failed++;
        results.errors.push({ row: rowNum, title: title || '(空)', errors });
        continue;
      }

      const requirementId = generateId();
      const requirementCode = generateRequirementCode();
      const module = (row['模块'] || row['module'] || '').toString().trim() || null;
      const source = (row['来源'] || row['source'] || '').toString().trim() || null;
      const status = '待评估';
      const expectedDate = (row['期望日期'] || row['expected_date'] || '').toString().trim() || null;
      const description = (row['描述'] || row['description'] || '').toString().trim() || null;

      run(`
        INSERT INTO requirement (requirement_id, requirement_code, title, product_id, module, source, proposer, priority, status, expected_date, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [requirementId, requirementCode, title, productId, module, source, proposer, priority, status, expectedDate, description]);
      results.success++;
    }

    res.json({
      message: `导入完成: 成功 ${results.success} 条，失败 ${results.failed} 条`,
      ...results
    });
  } catch (err) {
    console.error('Import error:', err);
    res.status(500).json({ error: '导入失败: ' + err.message });
  }
});

// ============================================================
// POST /api/requirements - Create requirement
// ============================================================
router.post('/', requirePermission('需求.提出'), (req, res) => {
  try {
    const { queryOne, run } = getDB();
    const {
      title, product_id, module, source, proposer,
      priority, expected_date, description
    } = req.body;

    // Validate required fields
    if (!title || !title.trim()) {
      return res.status(400).json({ error: '标题不能为空' });
    }
    if (!product_id) {
      return res.status(400).json({ error: '产品ID不能为空' });
    }
    if (!priority) {
      return res.status(400).json({ error: '优先级不能为空' });
    }

    const validPriorities = ['高', '中', '低'];
    if (!validPriorities.includes(priority)) {
      return res.status(400).json({ error: `优先级无效，有效值: ${validPriorities.join(', ')}` });
    }

    // Validate product exists
    const product = queryOne('SELECT product_id FROM product WHERE product_id = ?', [product_id]);
    if (!product) {
      return res.status(404).json({ error: '产品不存在' });
    }

    // Validate proposer exists if provided
    if (proposer) {
      const user = queryOne('SELECT user_id FROM user WHERE user_id = ?', [proposer]);
      if (!user) {
        return res.status(404).json({ error: '提出人不存在' });
      }
    }

    const requirement_id = generateId();
    const requirement_code = generateRequirementCode();
    const status = '待评估';

    run(`
      INSERT INTO requirement (requirement_id, requirement_code, title, product_id, module, source, proposer, priority, status, expected_date, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [requirement_id, requirement_code, title.trim(), product_id, module || null, source || null, proposer || null, priority, status, expected_date || null, description || null]);

    const created = queryOne(`
      SELECT r.*, p.product_name, u.name as proposer_name
      FROM requirement r
      LEFT JOIN product p ON r.product_id = p.product_id
      LEFT JOIN user u ON r.proposer = u.user_id
      WHERE r.requirement_id = ?
    `, [requirement_id]);

    res.status(201).json({ ...created, versions: [] });
  } catch (err) {
    console.error('Create requirement error:', err);
    if (err.message && err.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: '需求编号已存在' });
    }
    res.status(500).json({ error: '创建需求失败: ' + err.message });
  }
});

// ============================================================
// GET /api/requirements - List requirements with filters
// ============================================================
router.get('/', requirePermission('需求.查看'), (req, res) => {
  try {
    const { queryAll, queryOne } = getDB();
    const { status, priority, product_id, category_id, search, page = 1, pageSize = 10 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    let where = 'WHERE 1=1';
    const params = [];

    if (status) {
      // Support comma-separated statuses
      const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        where += ' AND r.status = ?';
        params.push(statuses[0]);
      } else {
        const placeholders = statuses.map(() => '?').join(',');
        where += ` AND r.status IN (${placeholders})`;
        params.push(...statuses);
      }
    }
    if (priority) {
      where += ' AND r.priority = ?';
      params.push(priority);
    }
    if (product_id) {
      where += ' AND r.product_id = ?';
      params.push(product_id);
    }
    if (category_id) {
      where += ' AND p.category_id = ?';
      params.push(category_id);
    }
    if (search) {
      where += ' AND (r.requirement_code LIKE ? OR r.title LIKE ? OR r.module LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const countRow = queryOne(`
      SELECT COUNT(*) as total
      FROM requirement r
      LEFT JOIN product p ON r.product_id = p.product_id
      ${where}
    `, params);
    const total = countRow.total;

    const items = queryAll(`
      SELECT r.*, p.product_name, u.name as proposer_name
      FROM requirement r
      LEFT JOIN product p ON r.product_id = p.product_id
      LEFT JOIN user u ON r.proposer = u.user_id
      ${where}
      ORDER BY r.updated_at DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(pageSize), offset]);

    // Attach version items to each requirement
    if (items.length > 0) {
      const requirementIds = items.map(item => item.requirement_id);
      const versionMap = getVersionItemsForRequirements(requirementIds);
      for (const item of items) {
        item.versions = versionMap[item.requirement_id] || [];
      }
    } else {
      for (const item of items) {
        item.versions = [];
      }
    }

    res.json({ items, total, page: parseInt(page), pageSize: parseInt(pageSize) });
  } catch (err) {
    console.error('List requirements error:', err);
    res.status(500).json({ error: '获取需求列表失败: ' + err.message });
  }
});

// ============================================================
// GET /api/requirements/:id - Get single requirement
// ============================================================
router.get('/:id', requirePermission('需求.查看'), (req, res) => {
  try {
    const { queryAll, queryOne } = getDB();
    const requirement = queryOne(`
      SELECT r.*, p.product_name, u.name as proposer_name
      FROM requirement r
      LEFT JOIN product p ON r.product_id = p.product_id
      LEFT JOIN user u ON r.proposer = u.user_id
      WHERE r.requirement_id = ?
    `, [req.params.id]);

    if (!requirement) {
      return res.status(404).json({ error: '需求不存在' });
    }

    // Get version items
    const versions = queryAll(`
      SELECT vi.*, v.version_no, v.version_name, v.status as version_status
      FROM version_item vi
      JOIN version v ON vi.version_id = v.version_id
      WHERE vi.item_type = 'requirement' AND vi.item_id = ?
      ORDER BY v.version_no DESC
    `, [req.params.id]);

    res.json({ ...requirement, versions });
  } catch (err) {
    console.error('Get requirement error:', err);
    res.status(500).json({ error: '获取需求详情失败: ' + err.message });
  }
});

// ============================================================
// PUT /api/requirements/:id - Update requirement
// ============================================================
router.put('/:id', requirePermission('需求.提出'), (req, res) => {
  try {
    const { queryAll, queryOne, run } = getDB();
    const existing = queryOne('SELECT * FROM requirement WHERE requirement_id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: '需求不存在' });
    }

    const {
      title, product_id, module, source, proposer,
      priority, status, expected_date, description
    } = req.body;

    // Validate priority if provided
    const validPriorities = ['高', '中', '低'];
    if (priority && !validPriorities.includes(priority)) {
      return res.status(400).json({ error: `优先级无效，有效值: ${validPriorities.join(', ')}` });
    }

    // Validate status if provided
    const validStatuses = ['待评估', '评估待审批', '已规划', '开发中', '测试中', '已实现', '已关闭', '已拒绝'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: `状态无效，有效值: ${validStatuses.join(', ')}` });
    }

    // Validate product exists if provided
    if (product_id) {
      const product = queryOne('SELECT product_id FROM product WHERE product_id = ?', [product_id]);
      if (!product) {
        return res.status(404).json({ error: '产品不存在' });
      }
    }

    // Validate proposer exists if provided
    if (proposer) {
      const user = queryOne('SELECT user_id FROM user WHERE user_id = ?', [proposer]);
      if (!user) {
        return res.status(404).json({ error: '提出人不存在' });
      }
    }

    run(`
      UPDATE requirement
      SET title = COALESCE(?, title),
          product_id = COALESCE(?, product_id),
          module = ?,
          source = ?,
          proposer = ?,
          priority = COALESCE(?, priority),
          status = COALESCE(?, status),
          expected_date = ?,
          description = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE requirement_id = ?
    `, [
      title || null,
      product_id || null,
      module !== undefined ? module : null,
      source !== undefined ? source : null,
      proposer !== undefined ? proposer : null,
      priority || null,
      status || null,
      expected_date !== undefined ? expected_date : null,
      description !== undefined ? description : null,
      req.params.id
    ]);

    const updated = queryOne(`
      SELECT r.*, p.product_name, u.name as proposer_name
      FROM requirement r
      LEFT JOIN product p ON r.product_id = p.product_id
      LEFT JOIN user u ON r.proposer = u.user_id
      WHERE r.requirement_id = ?
    `, [req.params.id]);

    // Get version items
    const versions = queryAll(`
      SELECT vi.*, v.version_no, v.version_name, v.status as version_status
      FROM version_item vi
      JOIN version v ON vi.version_id = v.version_id
      WHERE vi.item_type = 'requirement' AND vi.item_id = ?
      ORDER BY v.version_no DESC
    `, [req.params.id]);

    res.json({ ...updated, versions });
  } catch (err) {
    console.error('Update requirement error:', err);
    res.status(500).json({ error: '更新需求失败: ' + err.message });
  }
});

// ============================================================
// DELETE /api/requirements/:id - Delete requirement
// ============================================================
router.delete('/:id', requirePermission('需求.提出'), (req, res) => {
  try {
    const { queryOne, run } = getDB();
    const existing = queryOne('SELECT * FROM requirement WHERE requirement_id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: '需求不存在' });
    }

    // Delete associated version items first
    run("DELETE FROM version_item WHERE item_type = 'requirement' AND item_id = ?", [req.params.id]);

    // Delete the requirement
    run('DELETE FROM requirement WHERE requirement_id = ?', [req.params.id]);

    res.json({ message: '需求已删除' });
  } catch (err) {
    console.error('Delete requirement error:', err);
    res.status(500).json({ error: '删除需求失败: ' + err.message });
  }
});

// ============================================================
// POST /api/requirements/:id/evaluate - Set evaluation
// ============================================================
router.post('/:id/evaluate', requirePermission('需求.评估填写'), (req, res) => {
  try {
    const { queryOne, run } = getDB();
    const existing = queryOne('SELECT * FROM requirement WHERE requirement_id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: '需求不存在' });
    }

    // Only allow evaluation when status is 待评估 or 评估待审批
    if (existing.status !== '待评估' && existing.status !== '评估待审批') {
      return res.status(400).json({ error: `当前状态"${existing.status}"不允许填写评估，仅"待评估"或"评估待审批"状态可填写` });
    }

    const { evaluate_result, evaluate_opinion, work_estimate, schedule_suggest } = req.body;

    run(`
      UPDATE requirement
      SET evaluate_result = ?,
          evaluate_opinion = ?,
          work_estimate = ?,
          schedule_suggest = ?,
          status = '评估待审批',
          updated_at = CURRENT_TIMESTAMP
      WHERE requirement_id = ?
    `, [
      evaluate_result !== undefined ? evaluate_result : null,
      evaluate_opinion !== undefined ? evaluate_opinion : null,
      work_estimate !== undefined ? work_estimate : null,
      schedule_suggest !== undefined ? schedule_suggest : null,
      req.params.id
    ]);

    const updated = queryOne(`
      SELECT r.*, p.product_name, u.name as proposer_name
      FROM requirement r
      LEFT JOIN product p ON r.product_id = p.product_id
      LEFT JOIN user u ON r.proposer = u.user_id
      WHERE r.requirement_id = ?
    `, [req.params.id]);

    res.json({ ...updated, message: '评估已提交，状态已更新为"评估待审批"' });
  } catch (err) {
    console.error('Evaluate requirement error:', err);
    res.status(500).json({ error: '提交评估失败: ' + err.message });
  }
});

// ============================================================
// POST /api/requirements/:id/approve-evaluation - Approve/reject evaluation
// ============================================================
router.post('/:id/approve-evaluation', requirePermission('需求.评估审批'), (req, res) => {
  try {
    const { queryOne, run } = getDB();
    const existing = queryOne('SELECT * FROM requirement WHERE requirement_id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: '需求不存在' });
    }

    // Only allow approval when status is 评估待审批
    if (existing.status !== '评估待审批') {
      return res.status(400).json({ error: `当前状态"${existing.status}"不允许审批，仅"评估待审批"状态可审批` });
    }

    const { approved, reject_reason } = req.body;

    const newStatus = approved ? '已规划' : '已拒绝';

    if (approved) {
      run(`
        UPDATE requirement SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE requirement_id = ?
      `, [newStatus, req.params.id]);
    } else {
      const reason = reject_reason || '未提供拒绝原因';
      // Append reject reason to evaluate_opinion
      if (existing.evaluate_opinion) {
        run(`
          UPDATE requirement SET status = ?, evaluate_opinion = ?, updated_at = CURRENT_TIMESTAMP WHERE requirement_id = ?
        `, [newStatus, existing.evaluate_opinion + ' | 拒绝原因: ' + reason, req.params.id]);
      } else {
        run(`
          UPDATE requirement SET status = ?, evaluate_opinion = ?, updated_at = CURRENT_TIMESTAMP WHERE requirement_id = ?
        `, [newStatus, '拒绝原因: ' + reason, req.params.id]);
      }
    }

    const updated = queryOne(`
      SELECT r.*, p.product_name, u.name as proposer_name
      FROM requirement r
      LEFT JOIN product p ON r.product_id = p.product_id
      LEFT JOIN user u ON r.proposer = u.user_id
      WHERE r.requirement_id = ?
    `, [req.params.id]);

    const message = approved ? '评估已通过，状态已更新为"已规划"' : '评估已拒绝，状态已更新为"已拒绝"';

    res.json({ ...updated, message });
  } catch (err) {
    console.error('Approve evaluation error:', err);
    res.status(500).json({ error: '审批评估失败: ' + err.message });
  }
});

// ============================================================
// POST /api/requirements/:id/merge - Merge into versions
// ============================================================
router.post('/:id/merge', requirePermission('需求.合入计划填写'), (req, res) => {
  try {
    const { queryAll, queryOne, run } = getDB();
    const existing = queryOne('SELECT * FROM requirement WHERE requirement_id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: '需求不存在' });
    }

    const { version_ids, source_branch } = req.body;

    if (!version_ids || !Array.isArray(version_ids) || version_ids.length === 0) {
      return res.status(400).json({ error: '请提供合入的版本ID列表(version_ids)' });
    }

    // Validate all versions exist and belong to the same product
    const versionPlaceholders = version_ids.map(() => '?').join(',');
    const versions = queryAll(`
      SELECT * FROM version WHERE version_id IN (${versionPlaceholders})
    `, version_ids);

    if (versions.length !== version_ids.length) {
      const foundIds = versions.map(v => v.version_id);
      const missingIds = version_ids.filter(id => !foundIds.includes(id));
      return res.status(404).json({ error: `以下版本不存在: ${missingIds.join(', ')}` });
    }

    // Validate all versions belong to the requirement's product
    for (const version of versions) {
      if (version.product_id !== existing.product_id) {
        return res.status(400).json({
          error: `版本"${version.version_no}"不属于需求所属产品，版本产品: ${version.product_id}，需求产品: ${existing.product_id}`
        });
      }
    }

    const createdItems = [];
    const skippedItems = [];

    for (const versionId of version_ids) {
      // Check for duplicate
      const duplicate = queryOne(`
        SELECT version_item_id FROM version_item
        WHERE version_id = ? AND item_type = 'requirement' AND item_id = ?
      `, [versionId, req.params.id]);
      if (duplicate) {
        skippedItems.push({ version_id: versionId, reason: '已存在合入记录' });
        continue;
      }

      const versionItemId = generateId();
      const mergeStatus = '已合入';

      run(`
        INSERT INTO version_item (version_item_id, version_id, item_type, item_id, merge_status, source_branch, operator)
        VALUES (?, ?, 'requirement', ?, ?, ?, ?)
      `, [versionItemId, versionId, req.params.id, mergeStatus, source_branch || null, req.user.user_id]);
      createdItems.push({ version_item_id: versionItemId, version_id: versionId });
    }

    // Get updated version items
    const updatedVersions = queryAll(`
      SELECT vi.*, v.version_no, v.version_name, v.status as version_status
      FROM version_item vi
      JOIN version v ON vi.version_id = v.version_id
      WHERE vi.item_type = 'requirement' AND vi.item_id = ?
      ORDER BY v.version_no DESC
    `, [req.params.id]);

    res.json({
      message: `合入完成: 成功 ${createdItems.length} 条，跳过 ${skippedItems.length} 条`,
      created: createdItems,
      skipped: skippedItems,
      versions: updatedVersions
    });
  } catch (err) {
    console.error('Merge requirement error:', err);
    res.status(500).json({ error: '合入版本失败: ' + err.message });
  }
});

module.exports = router;