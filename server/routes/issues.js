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
// Helper: generate issue code (ISS-YYYY-XXXXX)
// ============================================================
function generateIssueCode() {
  const year = new Date().getFullYear();
  const seq = Math.random().toString(36).substr(2, 5).toUpperCase();
  return `ISS-${year}-${seq}`;
}

// ============================================================
// Helper: get version items for a list of issue IDs
// ============================================================
function getVersionItemsForIssues(issueIds) {
  if (!issueIds || issueIds.length === 0) return {};
  const { queryAll } = getDB();
  const placeholders = issueIds.map(() => '?').join(',');
  const rows = queryAll(`
    SELECT vi.item_id, v.version_id, v.version_no, v.version_name, v.status as version_status,
           vi.merge_status, vi.source_branch, vi.merged_at
    FROM version_item vi
    JOIN version v ON vi.version_id = v.version_id
    WHERE vi.item_type = 'issue' AND vi.item_id IN (${placeholders})
    ORDER BY v.version_no DESC
  `, issueIds);

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
// Helper: validate issue status transitions
// ============================================================
const VALID_STATUSES = ['分析中', '分析待审批', '开发中', '复测中', '回归通过', '已关闭'];
const VALID_TYPES = ['缺陷', '改进', '任务', '其他'];
const VALID_SEVERITIES = ['致命', '严重', '一般', '轻微'];
const VALID_PRIORITIES = ['高', '中', '低'];

// ============================================================
// POST /api/issues/import - Import from Excel
// Must be placed BEFORE /:id routes to avoid route conflict
// ============================================================
router.post('/import', requirePermission('问题单.提出'), upload.single('file'), (req, res) => {
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

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // Excel row number (1-indexed, +1 for header)

      // Parse fields (support both Chinese and English column headers)
      const title = (row['标题'] || row['title'] || '').toString().trim();
      const productId = (row['产品ID'] || row['product_id'] || '').toString().trim();
      const type = (row['类型'] || row['type'] || '').toString().trim();
      const severity = (row['严重程度'] || row['severity'] || '').toString().trim();
      const priority = (row['优先级'] || row['priority'] || '').toString().trim();
      const reporter = (row['报告人'] || row['reporter'] || '').toString().trim();
      const assignee = (row['处理人'] || row['assignee'] || '').toString().trim();
      const foundVersion = (row['发现版本'] || row['found_version'] || '').toString().trim();
      const module = (row['模块'] || row['module'] || '').toString().trim();
      const reproduceSteps = (row['复现步骤'] || row['reproduce_steps'] || '').toString().trim();
      const description = (row['描述'] || row['description'] || '').toString().trim();

      const rowErrors = [];

      // Validate required fields
      if (!title) rowErrors.push('标题不能为空');
      if (!productId) rowErrors.push('产品ID不能为空');
      if (!priority) rowErrors.push('优先级不能为空');
      if (priority && !VALID_PRIORITIES.includes(priority)) rowErrors.push(`优先级无效: ${priority}，有效值: ${VALID_PRIORITIES.join(', ')}`);
      if (type && !VALID_TYPES.includes(type)) rowErrors.push(`类型无效: ${type}，有效值: ${VALID_TYPES.join(', ')}`);
      if (severity && !VALID_SEVERITIES.includes(severity)) rowErrors.push(`严重程度无效: ${severity}，有效值: ${VALID_SEVERITIES.join(', ')}`);

      // Validate product exists
      if (productId) {
        const product = queryOne('SELECT product_id FROM product WHERE product_id = ?', [productId]);
        if (!product) rowErrors.push(`产品不存在: ${productId}`);
      }

      // Validate reporter exists
      if (reporter) {
        const user = queryOne('SELECT user_id FROM user WHERE user_id = ?', [reporter]);
        if (!user) rowErrors.push(`报告人不存在: ${reporter}`);
      }

      // Validate assignee exists
      if (assignee) {
        const user = queryOne('SELECT user_id FROM user WHERE user_id = ?', [assignee]);
        if (!user) rowErrors.push(`处理人不存在: ${assignee}`);
      }

      if (rowErrors.length > 0) {
        results.failed++;
        results.errors.push({ row: rowNum, title: title || '(空)', errors: rowErrors });
        continue;
      }

      const issueId = generateId();
      const issueCode = generateIssueCode();
      const status = '分析中';

      run(`
        INSERT INTO issue (issue_id, issue_code, title, product_id, type, severity, priority, status, reporter, assignee, found_version, module, reproduce_steps, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        issueId, issueCode, title, productId,
        type || null, severity || null, priority,
        status, reporter || null, assignee || null,
        foundVersion || null, module || null,
        reproduceSteps || null, description || null
      ]);
      results.success++;
    }

    res.json({
      message: `导入完成: 成功 ${results.success} 条，失败 ${results.failed} 条`,
      ...results
    });
  } catch (err) {
    console.error('Import issues error:', err);
    res.status(500).json({ error: '导入失败: ' + err.message });
  }
});

// ============================================================
// GET /api/issues - List issues with filters
// ============================================================
router.get('/', requirePermission('问题单.查看'), (req, res) => {
  try {
    const { queryAll, queryOne } = getDB();
    const { status, severity, priority, product_id, type, search, page = 1, pageSize = 10 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    let where = 'WHERE 1=1';
    const params = [];

    if (status) {
      // Support comma-separated statuses
      const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        where += ' AND i.status = ?';
        params.push(statuses[0]);
      } else {
        const placeholders = statuses.map(() => '?').join(',');
        where += ` AND i.status IN (${placeholders})`;
        params.push(...statuses);
      }
    }
    if (severity) {
      where += ' AND i.severity = ?';
      params.push(severity);
    }
    if (priority) {
      where += ' AND i.priority = ?';
      params.push(priority);
    }
    if (product_id) {
      where += ' AND i.product_id = ?';
      params.push(product_id);
    }
    if (type) {
      where += ' AND i.type = ?';
      params.push(type);
    }
    if (search) {
      where += ' AND (i.issue_code LIKE ? OR i.title LIKE ? OR i.module LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const countRow = queryOne(`
      SELECT COUNT(*) as total
      FROM issue i
      LEFT JOIN product p ON i.product_id = p.product_id
      ${where}
    `, params);
    const total = countRow.total;

    const items = queryAll(`
      SELECT i.*, p.product_name,
             r.name as reporter_name,
             a.name as assignee_name
      FROM issue i
      LEFT JOIN product p ON i.product_id = p.product_id
      LEFT JOIN user r ON i.reporter = r.user_id
      LEFT JOIN user a ON i.assignee = a.user_id
      ${where}
      ORDER BY i.updated_at DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(pageSize), offset]);

    // Attach version items to each issue
    if (items.length > 0) {
      const issueIds = items.map(item => item.issue_id);
      const versionMap = getVersionItemsForIssues(issueIds);
      for (const item of items) {
        item.versions = versionMap[item.issue_id] || [];
      }
    } else {
      for (const item of items) {
        item.versions = [];
      }
    }

    res.json({ items, total, page: parseInt(page), pageSize: parseInt(pageSize) });
  } catch (err) {
    console.error('List issues error:', err);
    res.status(500).json({ error: '获取问题单列表失败: ' + err.message });
  }
});

// ============================================================
// GET /api/issues/:id - Get single issue with version items
// ============================================================
router.get('/:id', requirePermission('问题单.查看'), (req, res) => {
  try {
    const { queryAll, queryOne } = getDB();
    const issue = queryOne(`
      SELECT i.*, p.product_name,
             r.name as reporter_name,
             a.name as assignee_name
      FROM issue i
      LEFT JOIN product p ON i.product_id = p.product_id
      LEFT JOIN user r ON i.reporter = r.user_id
      LEFT JOIN user a ON i.assignee = a.user_id
      WHERE i.issue_id = ?
    `, [req.params.id]);

    if (!issue) {
      return res.status(404).json({ error: '问题单不存在' });
    }

    // Get version items
    const versions = queryAll(`
      SELECT vi.*, v.version_no, v.version_name, v.status as version_status
      FROM version_item vi
      JOIN version v ON vi.version_id = v.version_id
      WHERE vi.item_type = 'issue' AND vi.item_id = ?
      ORDER BY v.version_no DESC
    `, [req.params.id]);

    res.json({ ...issue, versions });
  } catch (err) {
    console.error('Get issue error:', err);
    res.status(500).json({ error: '获取问题单详情失败: ' + err.message });
  }
});

// ============================================================
// POST /api/issues - Create issue
// ============================================================
router.post('/', requirePermission('问题单.提出'), (req, res) => {
  try {
    const { queryOne, run } = getDB();
    const {
      title, product_id, type, severity, priority,
      reporter, assignee, found_version, module,
      reproduce_steps, description
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

    // Validate priority
    if (!VALID_PRIORITIES.includes(priority)) {
      return res.status(400).json({ error: `优先级无效，有效值: ${VALID_PRIORITIES.join(', ')}` });
    }

    // Validate type if provided
    if (type && !VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: `类型无效，有效值: ${VALID_TYPES.join(', ')}` });
    }

    // Validate severity if provided
    if (severity && !VALID_SEVERITIES.includes(severity)) {
      return res.status(400).json({ error: `严重程度无效，有效值: ${VALID_SEVERITIES.join(', ')}` });
    }

    // Validate product exists
    const product = queryOne('SELECT product_id FROM product WHERE product_id = ?', [product_id]);
    if (!product) {
      return res.status(404).json({ error: '产品不存在' });
    }

    // Validate reporter exists if provided
    if (reporter) {
      const user = queryOne('SELECT user_id FROM user WHERE user_id = ?', [reporter]);
      if (!user) {
        return res.status(404).json({ error: '报告人不存在' });
      }
    }

    // Validate assignee exists if provided
    if (assignee) {
      const user = queryOne('SELECT user_id FROM user WHERE user_id = ?', [assignee]);
      if (!user) {
        return res.status(404).json({ error: '处理人不存在' });
      }
    }

    const issue_id = generateId();
    const issue_code = generateIssueCode();
    const initialStatus = '分析中';

    run(`
      INSERT INTO issue (issue_id, issue_code, title, product_id, type, severity, priority, status, reporter, assignee, found_version, module, reproduce_steps, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      issue_id, issue_code, title.trim(), product_id,
      type || null, severity || null, priority,
      initialStatus, reporter || null, assignee || null,
      found_version || null, module || null,
      reproduce_steps || null, description || null
    ]);

    const created = queryOne(`
      SELECT i.*, p.product_name,
             r.name as reporter_name,
             a.name as assignee_name
      FROM issue i
      LEFT JOIN product p ON i.product_id = p.product_id
      LEFT JOIN user r ON i.reporter = r.user_id
      LEFT JOIN user a ON i.assignee = a.user_id
      WHERE i.issue_id = ?
    `, [issue_id]);

    res.status(201).json({ ...created, versions: [] });
  } catch (err) {
    console.error('Create issue error:', err);
    if (err.message && err.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: '问题单编号已存在' });
    }
    res.status(500).json({ error: '创建问题单失败: ' + err.message });
  }
});

// ============================================================
// PUT /api/issues/:id - Update issue
// ============================================================
router.put('/:id', requirePermission('问题单.提出'), (req, res) => {
  try {
    const { queryAll, queryOne, run } = getDB();
    const existing = queryOne('SELECT * FROM issue WHERE issue_id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: '问题单不存在' });
    }

    const {
      title, product_id, type, severity, priority,
      reporter, assignee, found_version, module,
      reproduce_steps, description, status
    } = req.body;

    // Validate priority if provided
    if (priority && !VALID_PRIORITIES.includes(priority)) {
      return res.status(400).json({ error: `优先级无效，有效值: ${VALID_PRIORITIES.join(', ')}` });
    }

    // Validate type if provided
    if (type && !VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: `类型无效，有效值: ${VALID_TYPES.join(', ')}` });
    }

    // Validate severity if provided
    if (severity && !VALID_SEVERITIES.includes(severity)) {
      return res.status(400).json({ error: `严重程度无效，有效值: ${VALID_SEVERITIES.join(', ')}` });
    }

    // Validate status if provided
    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `状态无效，有效值: ${VALID_STATUSES.join(', ')}` });
    }

    // Validate product exists if provided
    if (product_id) {
      const product = queryOne('SELECT product_id FROM product WHERE product_id = ?', [product_id]);
      if (!product) {
        return res.status(404).json({ error: '产品不存在' });
      }
    }

    // Validate reporter exists if provided
    if (reporter) {
      const user = queryOne('SELECT user_id FROM user WHERE user_id = ?', [reporter]);
      if (!user) {
        return res.status(404).json({ error: '报告人不存在' });
      }
    }

    // Validate assignee exists if provided
    if (assignee) {
      const user = queryOne('SELECT user_id FROM user WHERE user_id = ?', [assignee]);
      if (!user) {
        return res.status(404).json({ error: '处理人不存在' });
      }
    }

    run(`
      UPDATE issue
      SET title = COALESCE(?, title),
          product_id = COALESCE(?, product_id),
          type = ?,
          severity = ?,
          priority = COALESCE(?, priority),
          reporter = ?,
          assignee = ?,
          found_version = ?,
          module = ?,
          reproduce_steps = ?,
          description = ?,
          status = COALESCE(?, status),
          updated_at = CURRENT_TIMESTAMP
      WHERE issue_id = ?
    `, [
      title || null,
      product_id || null,
      type !== undefined ? type : null,
      severity !== undefined ? severity : null,
      priority || null,
      reporter !== undefined ? reporter : null,
      assignee !== undefined ? assignee : null,
      found_version !== undefined ? found_version : null,
      module !== undefined ? module : null,
      reproduce_steps !== undefined ? reproduce_steps : null,
      description !== undefined ? description : null,
      status || null,
      req.params.id
    ]);

    const updated = queryOne(`
      SELECT i.*, p.product_name,
             r.name as reporter_name,
             a.name as assignee_name
      FROM issue i
      LEFT JOIN product p ON i.product_id = p.product_id
      LEFT JOIN user r ON i.reporter = r.user_id
      LEFT JOIN user a ON i.assignee = a.user_id
      WHERE i.issue_id = ?
    `, [req.params.id]);

    // Get version items
    const versions = queryAll(`
      SELECT vi.*, v.version_no, v.version_name, v.status as version_status
      FROM version_item vi
      JOIN version v ON vi.version_id = v.version_id
      WHERE vi.item_type = 'issue' AND vi.item_id = ?
      ORDER BY v.version_no DESC
    `, [req.params.id]);

    res.json({ ...updated, versions });
  } catch (err) {
    console.error('Update issue error:', err);
    res.status(500).json({ error: '更新问题单失败: ' + err.message });
  }
});

// ============================================================
// DELETE /api/issues/:id - Delete issue
// ============================================================
router.delete('/:id', requirePermission('问题单.提出'), (req, res) => {
  try {
    const { queryOne, run } = getDB();
    const existing = queryOne('SELECT * FROM issue WHERE issue_id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: '问题单不存在' });
    }

    // Delete associated version items first
    run("DELETE FROM version_item WHERE item_type = 'issue' AND item_id = ?", [req.params.id]);

    // Delete the issue
    run('DELETE FROM issue WHERE issue_id = ?', [req.params.id]);

    res.json({ message: '问题单已删除' });
  } catch (err) {
    console.error('Delete issue error:', err);
    res.status(500).json({ error: '删除问题单失败: ' + err.message });
  }
});

// ============================================================
// POST /api/issues/:id/analyze - Set analysis
// Auth: 问题单.分析填写
// Changes status to 分析待审批
// ============================================================
router.post('/:id/analyze', requirePermission('问题单.分析填写'), (req, res) => {
  try {
    const { queryOne, run } = getDB();
    const existing = queryOne('SELECT * FROM issue WHERE issue_id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: '问题单不存在' });
    }

    // Only allow analysis when status is 分析中 or 分析待审批
    if (existing.status !== '分析中' && existing.status !== '分析待审批') {
      return res.status(400).json({
        error: `当前状态"${existing.status}"不允许填写分析，仅"分析中"或"分析待审批"状态可填写`
      });
    }

    const { analysis_result, analysis_opinion } = req.body;

    if (!analysis_result && !analysis_opinion) {
      return res.status(400).json({ error: '请提供分析结果(analysis_result)或分析意见(analysis_opinion)' });
    }

    run(`
      UPDATE issue
      SET analysis_result = ?,
          analysis_opinion = ?,
          status = '分析待审批',
          updated_at = CURRENT_TIMESTAMP
      WHERE issue_id = ?
    `, [
      analysis_result !== undefined ? analysis_result : null,
      analysis_opinion !== undefined ? analysis_opinion : null,
      req.params.id
    ]);

    const updated = queryOne(`
      SELECT i.*, p.product_name,
             r.name as reporter_name,
             a.name as assignee_name
      FROM issue i
      LEFT JOIN product p ON i.product_id = p.product_id
      LEFT JOIN user r ON i.reporter = r.user_id
      LEFT JOIN user a ON i.assignee = a.user_id
      WHERE i.issue_id = ?
    `, [req.params.id]);

    res.json({ ...updated, message: '分析已提交，状态已更新为"分析待审批"' });
  } catch (err) {
    console.error('Analyze issue error:', err);
    res.status(500).json({ error: '提交分析失败: ' + err.message });
  }
});

// ============================================================
// POST /api/issues/:id/approve-analysis - Approve/reject analysis
// Auth: 问题单.分析审批
// Approve: status -> 开发中
// Reject: status -> 已关闭
// ============================================================
router.post('/:id/approve-analysis', requirePermission('问题单.分析审批'), (req, res) => {
  try {
    const { queryOne, run } = getDB();
    const existing = queryOne('SELECT * FROM issue WHERE issue_id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: '问题单不存在' });
    }

    // Only allow approval when status is 分析待审批
    if (existing.status !== '分析待审批') {
      return res.status(400).json({
        error: `当前状态"${existing.status}"不允许审批，仅"分析待审批"状态可审批`
      });
    }

    const { approved, reject_reason } = req.body;

    const newStatus = approved ? '开发中' : '已关闭';

    if (approved) {
      run(`
        UPDATE issue SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE issue_id = ?
      `, [newStatus, req.params.id]);
    } else {
      const reason = reject_reason || '未提供拒绝原因';
      // Append reject reason to analysis_opinion
      if (existing.analysis_opinion) {
        run(`
          UPDATE issue SET status = ?, analysis_opinion = ?, updated_at = CURRENT_TIMESTAMP WHERE issue_id = ?
        `, [newStatus, existing.analysis_opinion + ' | 拒绝原因: ' + reason, req.params.id]);
      } else {
        run(`
          UPDATE issue SET status = ?, analysis_opinion = ?, updated_at = CURRENT_TIMESTAMP WHERE issue_id = ?
        `, [newStatus, '拒绝原因: ' + reason, req.params.id]);
      }
    }

    const updated = queryOne(`
      SELECT i.*, p.product_name,
             r.name as reporter_name,
             a.name as assignee_name
      FROM issue i
      LEFT JOIN product p ON i.product_id = p.product_id
      LEFT JOIN user r ON i.reporter = r.user_id
      LEFT JOIN user a ON i.assignee = a.user_id
      WHERE i.issue_id = ?
    `, [req.params.id]);

    const message = approved
      ? '分析已通过，状态已更新为"开发中"'
      : '分析已拒绝，状态已更新为"已关闭"';

    res.json({ ...updated, message });
  } catch (err) {
    console.error('Approve analysis error:', err);
    res.status(500).json({ error: '审批分析失败: ' + err.message });
  }
});

// ============================================================
// POST /api/issues/:id/merge - Merge into versions
// Auth: 问题单.合入计划填写
// Creates version_item records for the issue
// ============================================================
router.post('/:id/merge', requirePermission('问题单.合入计划填写'), (req, res) => {
  try {
    const { queryAll, queryOne, run } = getDB();
    const existing = queryOne('SELECT * FROM issue WHERE issue_id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: '问题单不存在' });
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

    // Validate all versions belong to the issue's product
    for (const version of versions) {
      if (version.product_id !== existing.product_id) {
        return res.status(400).json({
          error: `版本"${version.version_no}"不属于问题单所属产品，版本产品: ${version.product_id}，问题单产品: ${existing.product_id}`
        });
      }
    }

    const createdItems = [];
    const skippedItems = [];

    for (const versionId of version_ids) {
      // Check for duplicate
      const duplicate = queryOne(`
        SELECT version_item_id FROM version_item
        WHERE version_id = ? AND item_type = 'issue' AND item_id = ?
      `, [versionId, req.params.id]);
      if (duplicate) {
        skippedItems.push({ version_id: versionId, reason: '已存在合入记录' });
        continue;
      }

      const versionItemId = generateId();
      const mergeStatus = '已合入';

      run(`
        INSERT INTO version_item (version_item_id, version_id, item_type, item_id, merge_status, source_branch, operator)
        VALUES (?, ?, 'issue', ?, ?, ?, ?)
      `, [versionItemId, versionId, req.params.id, mergeStatus, source_branch || null, req.user.user_id]);
      createdItems.push({ version_item_id: versionItemId, version_id: versionId });
    }

    // Get updated version items
    const updatedVersions = queryAll(`
      SELECT vi.*, v.version_no, v.version_name, v.status as version_status
      FROM version_item vi
      JOIN version v ON vi.version_id = v.version_id
      WHERE vi.item_type = 'issue' AND vi.item_id = ?
      ORDER BY v.version_no DESC
    `, [req.params.id]);

    res.json({
      message: `合入完成: 成功 ${createdItems.length} 条，跳过 ${skippedItems.length} 条`,
      created: createdItems,
      skipped: skippedItems,
      versions: updatedVersions
    });
  } catch (err) {
    console.error('Merge issue error:', err);
    res.status(500).json({ error: '合入版本失败: ' + err.message });
  }
});

module.exports = router;