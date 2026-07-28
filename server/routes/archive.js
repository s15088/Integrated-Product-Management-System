const express = require('express');
const { getDB } = require('../db');
const { authMiddleware, requirePermission, generateId } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

const ARCHIVE_VERSION = '1.0.0';
const SYSTEM_NAME = '综合产品管理系统';

// ============================================================
// Helper: build archive data object for given product_ids
// ============================================================
function buildArchiveData(queryAll, productIds = null) {
  const data = {};

  // --- product categories (all, since they're reference data) ---
  data.product_categories = queryAll('SELECT * FROM product_category ORDER BY sort, category_name');

  // --- products ---
  if (productIds && productIds.length > 0) {
    const placeholders = productIds.map(() => '?').join(',');
    data.products = queryAll(
      `SELECT * FROM product WHERE product_id IN (${placeholders}) ORDER BY created_at DESC`,
      productIds
    );
  } else {
    data.products = queryAll('SELECT * FROM product ORDER BY created_at DESC');
    productIds = data.products.map(p => p.product_id);
  }

  if (productIds.length === 0) {
    data.versions = [];
    data.change_requests = [];
    data.version_items = [];
    data.requirements = [];
    data.issues = [];
    return data;
  }

  const placeholders = productIds.map(() => '?').join(',');

  // --- requirements ---
  data.requirements = queryAll(
    `SELECT * FROM requirement WHERE product_id IN (${placeholders}) ORDER BY created_at DESC`,
    productIds
  );

  // --- issues ---
  data.issues = queryAll(
    `SELECT * FROM issue WHERE product_id IN (${placeholders}) ORDER BY created_at DESC`,
    productIds
  );

  // --- versions ---
  data.versions = queryAll(
    `SELECT * FROM version WHERE product_id IN (${placeholders}) ORDER BY created_at DESC`,
    productIds
  );

  const versionIds = data.versions.map(v => v.version_id);
  if (versionIds.length === 0) {
    data.change_requests = [];
    data.version_items = [];
    return data;
  }

  const vPlaceholders = versionIds.map(() => '?').join(',');

  // --- change requests ---
  data.change_requests = queryAll(
    `SELECT * FROM change_request WHERE version_id IN (${vPlaceholders}) ORDER BY created_at DESC`,
    versionIds
  );

  // --- version items ---
  data.version_items = queryAll(
    `SELECT * FROM version_item WHERE version_id IN (${vPlaceholders}) ORDER BY created_at DESC`,
    versionIds
  );

  return data;
}

// ============================================================
// Helper: compute statistics from archive data
// ============================================================
function computeArchiveStats(data) {
  return {
    product_count: data.products?.length || 0,
    version_count: data.versions?.length || 0,
    requirement_count: data.requirements?.length || 0,
    issue_count: data.issues?.length || 0,
    change_request_count: data.change_requests?.length || 0,
    version_item_count: data.version_items?.length || 0,
    category_count: data.product_categories?.length || 0,
  };
}

// ============================================================
// GET /api/archive/export - Export archive as JSON file
// Query: product_ids (comma-separated, optional = all)
// ============================================================
router.get('/export', requirePermission('系统.数据归档'), (req, res) => {
  try {
    const { queryAll } = getDB();
    const { product_ids } = req.query;

    let productIds = null;
    if (product_ids) {
      productIds = product_ids.split(',').map(s => s.trim()).filter(Boolean);
      if (productIds.length === 0) productIds = null;
    }

    const data = buildArchiveData(queryAll, productIds);
    const stats = computeArchiveStats(data);

    const archive = {
      meta: {
        system: SYSTEM_NAME,
        archive_version: ARCHIVE_VERSION,
        created_at: new Date().toISOString(),
        created_by: req.user?.name || req.user?.username || 'unknown',
        scope: productIds ? 'selected_products' : 'all_products',
        product_count: stats.product_count,
      },
      statistics: stats,
      data,
    };

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const scope = productIds ? `selected-${productIds.length}` : 'full';
    const filename = `ipms-archive-${scope}-${timestamp}.json`;

    const jsonContent = JSON.stringify(archive, null, 2);

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(jsonContent);
  } catch (err) {
    console.error('Export archive error:', err);
    res.status(500).json({ error: '导出归档失败: ' + err.message });
  }
});

// ============================================================
// POST /api/archive/preview - Preview archive file before import
// Body: { archive: <parsed archive object> }
// Returns: { stats, conflicts, can_import }
// ============================================================
router.post('/preview', requirePermission('系统.数据归档'), (req, res) => {
  try {
    const { queryAll } = getDB();
    const { archive } = req.body;

    if (!archive || !archive.data || !archive.meta) {
      return res.status(400).json({ error: '归档文件格式无效，缺少 meta 或 data 字段' });
    }

    if (archive.meta.archive_version !== ARCHIVE_VERSION) {
      return res.status(400).json({
        error: `归档版本不兼容：文件版本 ${archive.meta.archive_version}，系统版本 ${ARCHIVE_VERSION}`,
      });
    }

    const data = archive.data;
    const stats = computeArchiveStats(data);

    // --- Check conflicts ---
    const conflicts = {
      products: [],
      versions: [],
      requirements: [],
      issues: [],
    };

    // Product conflicts
    if (data.products && data.products.length > 0) {
      const productIds = data.products.map(p => p.product_id);
      const placeholders = productIds.map(() => '?').join(',');
      const existing = queryAll(
        `SELECT product_id, product_code, product_name FROM product WHERE product_id IN (${placeholders})`,
        productIds
      );
      conflicts.products = existing;
    }

    // Version conflicts
    if (data.versions && data.versions.length > 0) {
      const versionIds = data.versions.map(v => v.version_id);
      const placeholders = versionIds.map(() => '?').join(',');
      const existing = queryAll(
        `SELECT version_id, version_no, version_name FROM version WHERE version_id IN (${placeholders})`,
        versionIds
      );
      conflicts.versions = existing;
    }

    // Requirement conflicts
    if (data.requirements && data.requirements.length > 0) {
      const reqIds = data.requirements.map(r => r.requirement_id);
      const placeholders = reqIds.map(() => '?').join(',');
      const existing = queryAll(
        `SELECT requirement_id, requirement_code, title FROM requirement WHERE requirement_id IN (${placeholders})`,
        reqIds
      );
      conflicts.requirements = existing;
    }

    // Issue conflicts
    if (data.issues && data.issues.length > 0) {
      const issueIds = data.issues.map(i => i.issue_id);
      const placeholders = issueIds.map(() => '?').join(',');
      const existing = queryAll(
        `SELECT issue_id, issue_code, title FROM issue WHERE issue_id IN (${placeholders})`,
        issueIds
      );
      conflicts.issues = existing;
    }

    const totalConflicts =
      conflicts.products.length +
      conflicts.versions.length +
      conflicts.requirements.length +
      conflicts.issues.length;

    res.json({
      meta: archive.meta,
      stats,
      conflicts,
      total_conflicts: totalConflicts,
      can_import: true,
      import_modes: ['skip', 'overwrite', 'copy'],
    });
  } catch (err) {
    console.error('Preview archive error:', err);
    res.status(500).json({ error: '预览归档失败: ' + err.message });
  }
});

// ============================================================
// POST /api/archive/import - Import archive data
// Body: { archive: <parsed archive object>, mode: 'skip'|'overwrite'|'copy' }
// mode: skip = skip existing, overwrite = replace existing, copy = create as new (new IDs)
// ============================================================
router.post('/import', requirePermission('系统.数据归档'), (req, res) => {
  try {
    const { queryAll, queryOne, run, saveDB } = getDB();
    const { archive, mode = 'skip' } = req.body;

    if (!archive || !archive.data || !archive.meta) {
      return res.status(400).json({ error: '归档文件格式无效' });
    }

    if (!['skip', 'overwrite', 'copy'].includes(mode)) {
      return res.status(400).json({ error: '无效的导入模式，支持 skip、overwrite、copy' });
    }

    const data = archive.data;
    const result = {
      mode,
      imported: {
        product_categories: 0,
        products: 0,
        versions: 0,
        requirements: 0,
        issues: 0,
        change_requests: 0,
        version_items: 0,
      },
      skipped: {
        products: 0,
        versions: 0,
        requirements: 0,
        issues: 0,
      },
      errors: [],
    };

    const now = new Date().toISOString();
    const idMap = {}; // maps old IDs to new IDs (for copy mode)

    // --- Helper: insert or skip a record ---
    function insertRecord(table, idField, record, existingSet) {
      const id = record[idField];
      if (mode === 'skip' && existingSet.has(id)) {
        return { action: 'skipped', id };
      }
      if (mode === 'overwrite' && existingSet.has(id)) {
        // Update existing
        const fields = Object.keys(record).filter(k => k !== idField);
        if (fields.length === 0) return { action: 'skipped', id };
        const setClause = fields.map(f => `${f} = ?`).join(', ');
        const values = fields.map(f => record[f]);
        run(`UPDATE ${table} SET ${setClause}, updated_at = ? WHERE ${idField} = ?`, [...values, now, id]);
        return { action: 'updated', id };
      }
      if (mode === 'copy') {
        // Create new record with new ID
        const newId = generateId();
        const newRecord = { ...record, [idField]: newId, created_at: now, updated_at: now };
        // Handle unique constraints: add copy suffix to unique code fields
        if (newRecord.product_code) newRecord.product_code = newRecord.product_code + '_copy_' + Date.now().toString(36).slice(-4);
        if (newRecord.requirement_code) newRecord.requirement_code = newRecord.requirement_code + '_copy_' + Date.now().toString(36).slice(-4);
        if (newRecord.issue_code) newRecord.issue_code = newRecord.issue_code + '_copy_' + Date.now().toString(36).slice(-4);
        const fields = Object.keys(newRecord);
        const placeholders = fields.map(() => '?').join(',');
        const values = fields.map(f => newRecord[f]);
        run(`INSERT INTO ${table} (${fields.join(', ')}) VALUES (${placeholders})`, values);
        return { action: 'created', id: newId, oldId: id };
      }
      // mode === 'skip' but not existing, or mode === 'overwrite' but not existing
      const fields = Object.keys(record);
      const placeholders = fields.map(() => '?').join(',');
      const values = fields.map(f => record[f]);
      run(`INSERT INTO ${table} (${fields.join(', ')}) VALUES (${placeholders})`, values);
      return { action: 'created', id };
    }

    // --- Step 1: Product categories (reference data, always skip existing) ---
    if (data.product_categories && data.product_categories.length > 0) {
      const existingCats = queryAll('SELECT category_id FROM product_category').map(r => r.category_id);
      const catSet = new Set(existingCats);
      for (const cat of data.product_categories) {
        if (!catSet.has(cat.category_id)) {
          const fields = Object.keys(cat);
          const placeholders = fields.map(() => '?').join(',');
          const values = fields.map(f => cat[f]);
          run(`INSERT INTO product_category (${fields.join(', ')}) VALUES (${placeholders})`, values);
          result.imported.product_categories++;
        }
      }
    }

    // --- Step 2: Products ---
    if (data.products && data.products.length > 0) {
      const existingProducts = queryAll('SELECT product_id FROM product').map(r => r.product_id);
      const productSet = new Set(existingProducts);
      idMap.products = {};

      for (const product of data.products) {
        const res = insertRecord('product', 'product_id', product, productSet);
        if (res.action === 'created') result.imported.products++;
        else if (res.action === 'updated') result.imported.products++;
        else if (res.action === 'skipped') result.skipped.products++;

        if (mode === 'copy') {
          idMap.products[product.product_id] = res.id;
        }
      }
    }

    // --- Step 3: Requirements ---
    if (data.requirements && data.requirements.length > 0) {
      const existingReqs = queryAll('SELECT requirement_id FROM requirement').map(r => r.requirement_id);
      const reqSet = new Set(existingReqs);
      idMap.requirements = {};

      for (const req of data.requirements) {
        const record = { ...req };
        if (mode === 'copy' && idMap.products?.[req.product_id]) {
          record.product_id = idMap.products[req.product_id];
        }
        const res = insertRecord('requirement', 'requirement_id', record, reqSet);
        if (res.action === 'created') result.imported.requirements++;
        else if (res.action === 'updated') result.imported.requirements++;
        else if (res.action === 'skipped') result.skipped.requirements++;

        if (mode === 'copy') {
          idMap.requirements[req.requirement_id] = res.id;
        }
      }
    }

    // --- Step 4: Issues ---
    if (data.issues && data.issues.length > 0) {
      const existingIssues = queryAll('SELECT issue_id FROM issue').map(r => r.issue_id);
      const issueSet = new Set(existingIssues);
      idMap.issues = {};

      for (const issue of data.issues) {
        const record = { ...issue };
        if (mode === 'copy' && idMap.products?.[issue.product_id]) {
          record.product_id = idMap.products[issue.product_id];
        }
        const res = insertRecord('issue', 'issue_id', record, issueSet);
        if (res.action === 'created') result.imported.issues++;
        else if (res.action === 'updated') result.imported.issues++;
        else if (res.action === 'skipped') result.skipped.issues++;

        if (mode === 'copy') {
          idMap.issues[issue.issue_id] = res.id;
        }
      }
    }

    // --- Step 5: Versions ---
    if (data.versions && data.versions.length > 0) {
      const existingVersions = queryAll('SELECT version_id FROM version').map(r => r.version_id);
      const versionSet = new Set(existingVersions);
      idMap.versions = {};

      for (const version of data.versions) {
        const record = { ...version };
        if (mode === 'copy' && idMap.products?.[version.product_id]) {
          record.product_id = idMap.products[version.product_id];
        }
        const res = insertRecord('version', 'version_id', record, versionSet);
        if (res.action === 'created') result.imported.versions++;
        else if (res.action === 'updated') result.imported.versions++;
        else if (res.action === 'skipped') result.skipped.versions++;

        if (mode === 'copy') {
          idMap.versions[version.version_id] = res.id;
        }
      }
    }

    // --- Step 6: Change requests ---
    if (data.change_requests && data.change_requests.length > 0) {
      idMap.change_requests = {};
      const existingCRs = queryAll('SELECT change_request_id FROM change_request').map(r => r.change_request_id);
      const crSet = new Set(existingCRs);

      for (const cr of data.change_requests) {
        const record = { ...cr };
        if (idMap.versions?.[cr.version_id]) {
          record.version_id = idMap.versions[cr.version_id];
        }
        const res = insertRecord('change_request', 'change_request_id', record, crSet);
        if (res.action === 'created' || res.action === 'updated') result.imported.change_requests++;
        if (mode === 'copy') {
          idMap.change_requests[cr.change_request_id] = res.id;
        }
      }
    }

    // --- Step 7: Version items ---
    if (data.version_items && data.version_items.length > 0) {
      for (const item of data.version_items) {
        const record = { ...item };
        if (idMap.versions?.[item.version_id]) {
          record.version_id = idMap.versions[item.version_id];
        }
        if (mode === 'copy') {
          if (item.item_type === 'requirement' && idMap.requirements?.[item.item_id]) {
            record.item_id = idMap.requirements[item.item_id];
          } else if (item.item_type === 'issue' && idMap.issues?.[item.item_id]) {
            record.item_id = idMap.issues[item.item_id];
          }
          if (item.change_request_id && idMap.change_requests?.[item.change_request_id]) {
            record.change_request_id = idMap.change_requests[item.change_request_id];
          }
          record.version_item_id = generateId();
          record.created_at = now;
          record.updated_at = now;
        }

        const fields = Object.keys(record);
        const placeholders = fields.map(() => '?').join(',');
        const values = fields.map(f => record[f]);
        try {
          run(`INSERT INTO version_item (${fields.join(', ')}) VALUES (${placeholders})`, values);
          result.imported.version_items++;
        } catch (e) {
          // Skip if duplicate (unique constraint)
          if (e.message && e.message.includes('UNIQUE')) {
            result.skipped.version_items = (result.skipped.version_items || 0) + 1;
          } else {
            result.errors.push(`version_item ${item.version_item_id}: ${e.message}`);
          }
        }
      }
    }

    saveDB();

    res.json({
      message: '导入完成',
      result,
      total_imported: Object.values(result.imported).reduce((a, b) => a + b, 0),
      total_skipped: Object.values(result.skipped).reduce((a, b) => a + b, 0),
    });
  } catch (err) {
    console.error('Import archive error:', err);
    res.status(500).json({ error: '导入归档失败: ' + err.message });
  }
});

module.exports = router;
