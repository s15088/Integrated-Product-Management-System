const express = require('express');
const { getDB } = require('../db');
const { authMiddleware, requirePermission, generateId } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

/**
 * GET /versions - List versions with filters
 */
router.get('/', (req, res) => {
    try {
        const { queryAll, queryOne } = getDB();
        const { product_id, status, search, page = 1, pageSize = 10 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(pageSize);

        let whereClause = 'WHERE 1=1';
        const params = [];

        if (product_id) {
            whereClause += ' AND v.product_id = ?';
            params.push(product_id);
        }
        if (status) {
            whereClause += ' AND v.status = ?';
            params.push(status);
        }
        if (search) {
            whereClause += ' AND (v.version_name LIKE ? OR v.version_no LIKE ? OR v.description LIKE ?)';
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }

        const countRow = queryOne(`
            SELECT COUNT(*) as total FROM version v ${whereClause}
        `, params);
        const total = countRow ? countRow.total : 0;

        const items = queryAll(`
            SELECT v.*, p.product_name, pc.category_name as product_category,
                (SELECT COUNT(*) FROM version_item vi WHERE vi.version_id = v.version_id) as total_items,
                (SELECT COUNT(*) FROM version_item vi WHERE vi.version_id = v.version_id AND vi.item_type = 'requirement') as requirement_count,
                (SELECT COUNT(*) FROM version_item vi WHERE vi.version_id = v.version_id AND vi.item_type = 'issue') as issue_count,
                (SELECT COUNT(*) FROM version_item vi WHERE vi.version_id = v.version_id AND vi.merge_status = '已合入') as merged_count
            FROM version v
            LEFT JOIN product p ON v.product_id = p.product_id
            LEFT JOIN product_category pc ON p.category_id = pc.category_id
            ${whereClause}
            GROUP BY v.version_id
            ORDER BY v.created_at DESC
            LIMIT ? OFFSET ?
        `, [...params, parseInt(pageSize), offset]);

        const versionList = items.map(v => ({
            ...v,
            merge_rate: v.total_items > 0 ? Math.round((v.merged_count / v.total_items) * 100) : 0
        }));

        res.json({
            items: versionList,
            total,
            page: parseInt(page),
            pageSize: parseInt(pageSize)
        });
    } catch (error) {
        console.error('Error listing versions:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /versions/:id - Get version detail
 */
router.get('/:id', (req, res) => {
    try {
        const { queryAll, queryOne } = getDB();
        const { id } = req.params;

        const version = queryOne(`
            SELECT v.*, p.product_name, pc.category_name as product_category
            FROM version v
            LEFT JOIN product p ON v.product_id = p.product_id
            LEFT JOIN product_category pc ON p.category_id = pc.category_id
            WHERE v.version_id = ?
        `, [id]);

        if (!version) {
            return res.status(404).json({ error: '版本不存在' });
        }

        // Get all version items
        const allItems = queryAll(`
            SELECT * FROM version_item WHERE version_id = ? ORDER BY item_type, created_at DESC
        `, [id]);

        const requirements = allItems.filter(item => item.item_type === 'requirement');
        const issues = allItems.filter(item => item.item_type === 'issue');

        const totalItems = allItems.length;
        const mergedItems = allItems.filter(item => item.merge_status === '已合入').length;
        const mergeRate = totalItems > 0 ? Math.round((mergedItems / totalItems) * 100) : 0;

        // Get change requests
        const changeRequests = queryAll(`
            SELECT * FROM change_request WHERE version_id = ? ORDER BY created_at DESC
        `, [id]);

        // Parse JSON fields in change requests
        changeRequests.forEach(cr => {
            if (typeof cr.applicant === 'string') {
                try { cr.applicant = JSON.parse(cr.applicant); } catch (e) { cr.applicant = { name: cr.applicant }; }
            }
            if (typeof cr.approver === 'string' && cr.approver) {
                try { cr.approver = JSON.parse(cr.approver); } catch (e) { cr.approver = { name: cr.approver }; }
            }
        });

        // Build burndown data using substr for date extraction
        const burndownData = [];
        if (allItems.length > 0) {
            const mergedItemsByDate = {};
            const mergedItemsList = allItems.filter(item => item.merge_status === '已合入' && item.merged_at);
            mergedItemsList.forEach(item => {
                const date = (item.merged_at || '').substring(0, 10);
                if (!mergedItemsByDate[date]) mergedItemsByDate[date] = 0;
                mergedItemsByDate[date]++;
            });

            const allDates = allItems.map(item => (item.created_at || '').substring(0, 10)).filter(Boolean);
            const uniqueDates = [...new Set(allDates)].sort();

            let cumulativeMerged = 0;
            uniqueDates.forEach(date => {
                cumulativeMerged += (mergedItemsByDate[date] || 0);
                burndownData.push({
                    date,
                    remaining: totalItems - cumulativeMerged
                });
            });
        }

        res.json({
            version,
            items: {
                requirements: {
                    total: requirements.length,
                    merged: requirements.filter(r => r.merge_status === '已合入').length,
                    items: requirements
                },
                issues: {
                    total: issues.length,
                    merged: issues.filter(i => i.merge_status === '已合入').length,
                    items: issues
                }
            },
            changeRequests,
            mergeRate,
            burndown: burndownData,
            stats: {
                totalItems,
                mergedItems,
                openItems: totalItems - mergedItems
            }
        });
    } catch (error) {
        console.error('Error getting version detail:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /versions - Create version baseline
 */
router.post('/', requirePermission('版本.基线新建'), (req, res) => {
    try {
        const { queryOne, run } = getDB();
        const { product_id, version_no, version_name, planned_release_date, description } = req.body;

        if (!product_id || !version_no || !version_name) {
            return res.status(400).json({ error: '产品ID、版本号和版本名称为必填项' });
        }

        const product = queryOne('SELECT product_id FROM product WHERE product_id = ?', [product_id]);
        if (!product) {
            return res.status(404).json({ error: '产品不存在' });
        }

        const version_id = generateId();
        const now = new Date().toISOString();

        run(`
            INSERT INTO version (version_id, product_id, version_no, version_name, status, planned_release_date, description, created_at, updated_at)
            VALUES (?, ?, ?, ?, '规划中', ?, ?, ?, ?)
        `, [version_id, product_id, version_no, version_name, planned_release_date || null, description || null, now, now]);

        const newVersion = queryOne(`
            SELECT v.*, p.product_name, pc.category_name as product_category
            FROM version v
            LEFT JOIN product p ON v.product_id = p.product_id
            LEFT JOIN product_category pc ON p.category_id = pc.category_id
            WHERE v.version_id = ?
        `, [version_id]);

        res.status(201).json(newVersion);
    } catch (error) {
        console.error('Error creating version:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /versions/:id - Update version
 */
router.put('/:id', (req, res) => {
    try {
        const { queryOne, run } = getDB();
        const { id } = req.params;
        const { version_no, version_name, planned_release_date, description, status } = req.body;

        const existing = queryOne('SELECT * FROM version WHERE version_id = ?', [id]);
        if (!existing) {
            return res.status(404).json({ error: '版本不存在' });
        }

        const now = new Date().toISOString();

        run(`
            UPDATE version
            SET version_no = ?,
                version_name = ?,
                planned_release_date = ?,
                description = ?,
                status = ?,
                updated_at = ?
            WHERE version_id = ?
        `, [
            version_no !== undefined ? version_no : existing.version_no,
            version_name !== undefined ? version_name : existing.version_name,
            planned_release_date !== undefined ? planned_release_date : existing.planned_release_date,
            description !== undefined ? description : existing.description,
            status !== undefined ? status : existing.status,
            now,
            id
        ]);

        const updated = queryOne(`
            SELECT v.*, p.product_name, pc.category_name as product_category
            FROM version v
            LEFT JOIN product p ON v.product_id = p.product_id
            LEFT JOIN product_category pc ON p.category_id = pc.category_id
            WHERE v.version_id = ?
        `, [id]);

        res.json(updated);
    } catch (error) {
        console.error('Error updating version:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /versions/:id/baseline - Set baseline, change status to 开发中
 */
router.post('/:id/baseline', requirePermission('版本.基线新建'), (req, res) => {
    try {
        const { queryOne, run } = getDB();
        const { id } = req.params;

        const existing = queryOne('SELECT * FROM version WHERE version_id = ?', [id]);
        if (!existing) {
            return res.status(404).json({ error: '版本不存在' });
        }

        if (existing.status !== '规划中') {
            return res.status(400).json({ error: '只有规划中状态的版本可以设置基线' });
        }

        const baseline_time = new Date().toISOString();
        const now = new Date().toISOString();

        run('UPDATE version SET status = ?, baseline_time = ?, updated_at = ? WHERE version_id = ?',
            ['开发中', baseline_time, now, id]);

        const updated = queryOne(`
            SELECT v.*, p.product_name, pc.category_name as product_category
            FROM version v
            LEFT JOIN product p ON v.product_id = p.product_id
            LEFT JOIN product_category pc ON p.category_id = pc.category_id
            WHERE v.version_id = ?
        `, [id]);

        res.json({ message: '基线已设置，版本状态变更为开发中', version: updated });
    } catch (error) {
        console.error('Error setting baseline:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /versions/:id/release - Release version
 */
router.post('/:id/release', requirePermission('版本.合入管理'), (req, res) => {
    try {
        const { queryOne, run } = getDB();
        const { id } = req.params;

        const existing = queryOne('SELECT * FROM version WHERE version_id = ?', [id]);
        if (!existing) {
            return res.status(404).json({ error: '版本不存在' });
        }

        if (existing.status !== '开发中') {
            return res.status(400).json({ error: '只有开发中状态的版本可以发布' });
        }

        const release_date = new Date().toISOString();
        const now = new Date().toISOString();

        run('UPDATE version SET status = ?, release_date = ?, updated_at = ? WHERE version_id = ?',
            ['已发布', release_date, now, id]);

        const updated = queryOne(`
            SELECT v.*, p.product_name, pc.category_name as product_category
            FROM version v
            LEFT JOIN product p ON v.product_id = p.product_id
            LEFT JOIN product_category pc ON p.category_id = pc.category_id
            WHERE v.version_id = ?
        `, [id]);

        res.json({ message: '版本已发布', version: updated });
    } catch (error) {
        console.error('Error releasing version:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /versions/:id/archive - Archive version
 */
router.post('/:id/archive', requirePermission('版本.归档'), (req, res) => {
    try {
        const { queryOne, run } = getDB();
        const { id } = req.params;

        const existing = queryOne('SELECT * FROM version WHERE version_id = ?', [id]);
        if (!existing) {
            return res.status(404).json({ error: '版本不存在' });
        }

        if (existing.status !== '已发布') {
            return res.status(400).json({ error: '只有已发布状态的版本可以归档' });
        }

        const inProgressCount = queryOne(`
            SELECT COUNT(*) as count FROM version_item
            WHERE version_id = ? AND merge_status != '已合入'
        `, [id]);

        if (inProgressCount && inProgressCount.count > 0) {
            return res.status(400).json({ error: `仍有 ${inProgressCount.count} 个未合入的项目，无法归档` });
        }

        const now = new Date().toISOString();
        run('UPDATE version SET status = ?, updated_at = ? WHERE version_id = ?', ['已归档', now, id]);

        const updated = queryOne(`
            SELECT v.*, p.product_name, pc.category_name as product_category
            FROM version v
            LEFT JOIN product p ON v.product_id = p.product_id
            LEFT JOIN product_category pc ON p.category_id = pc.category_id
            WHERE v.version_id = ?
        `, [id]);

        res.json({ message: '版本已归档', version: updated });
    } catch (error) {
        console.error('Error archiving version:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /versions/:id - Delete version
 */
router.delete('/:id', (req, res) => {
    try {
        const { queryOne, run } = getDB();
        const { id } = req.params;

        const existing = queryOne('SELECT * FROM version WHERE version_id = ?', [id]);
        if (!existing) {
            return res.status(404).json({ error: '版本不存在' });
        }

        run('DELETE FROM version_item WHERE version_id = ?', [id]);
        run('DELETE FROM change_request WHERE version_id = ?', [id]);
        run('DELETE FROM version WHERE version_id = ?', [id]);

        res.json({ message: '版本已删除' });
    } catch (error) {
        console.error('Error deleting version:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /versions/:id/merge-items - Add items to version
 */
router.post('/:id/merge-items', (req, res) => {
    try {
        const { queryOne, run } = getDB();
        const { id } = req.params;
        const { version_items } = req.body;

        if (!Array.isArray(version_items) || version_items.length === 0) {
            return res.status(400).json({ error: 'version_items 必须是非空数组' });
        }

        const existing = queryOne('SELECT * FROM version WHERE version_id = ?', [id]);
        if (!existing) {
            return res.status(404).json({ error: '版本不存在' });
        }

        if (existing.status === '已归档') {
            return res.status(400).json({ error: '已归档的版本不能添加项目' });
        }

        const now = new Date().toISOString();
        const inserted = [];

        for (const item of version_items) {
            const { item_type, item_id, source_branch } = item;
            if (!item_type || !item_id) continue;

            const existingItem = queryOne(`
                SELECT * FROM version_item WHERE version_id = ? AND item_id = ? AND item_type = ?
            `, [id, item_id, item_type]);

            if (existingItem) continue;

            const version_item_id = generateId();
            run(`
                INSERT INTO version_item (version_item_id, version_id, item_type, item_id, source_branch, merge_status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, '已合入', ?, ?)
            `, [version_item_id, id, item_type, item_id, source_branch || null, now, now]);

            inserted.push({ version_item_id, item_type, item_id });
        }

        run('UPDATE version SET updated_at = ? WHERE version_id = ?', [now, id]);

        res.json({ message: `成功添加 ${inserted.length} 个项目`, inserted, totalAdded: inserted.length });
    } catch (error) {
        console.error('Error adding merge items:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /versions/:id/items/:itemId - Remove item from version
 */
router.delete('/:id/items/:itemId', (req, res) => {
    try {
        const { queryOne, run } = getDB();
        const { id, itemId } = req.params;

        const existing = queryOne('SELECT * FROM version WHERE version_id = ?', [id]);
        if (!existing) {
            return res.status(404).json({ error: '版本不存在' });
        }

        const item = queryOne('SELECT * FROM version_item WHERE version_item_id = ? AND version_id = ?', [itemId, id]);
        if (!item) {
            return res.status(404).json({ error: '项目不存在' });
        }

        if (existing.status === '已归档') {
            return res.status(400).json({ error: '已归档的版本不能删除项目' });
        }

        run('DELETE FROM version_item WHERE version_item_id = ?', [itemId]);
        run('UPDATE version SET updated_at = ? WHERE version_id = ?', [new Date().toISOString(), id]);

        res.json({ message: '项目已从版本中移除' });
    } catch (error) {
        console.error('Error removing item:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /versions/:id/change-requests - Create change request
 */
router.post('/:id/change-requests', requirePermission('版本.变更申请'), (req, res) => {
    try {
        const { queryOne, run } = getDB();
        const { id } = req.params;
        const { change_type, reason } = req.body;
        const applicant_id = req.user.user_id;
        const applicant_name = req.user.name || req.user.username;

        if (!change_type || !reason) {
            return res.status(400).json({ error: '变更类型和变更原因为必填项' });
        }

        const existing = queryOne('SELECT * FROM version WHERE version_id = ?', [id]);
        if (!existing) {
            return res.status(404).json({ error: '版本不存在' });
        }

        if (existing.status === '规划中' || existing.status === '已归档') {
            return res.status(400).json({ error: '当前版本状态不允许申请变更' });
        }

        const change_request_id = generateId();
        const now = new Date().toISOString();

        run(`
            INSERT INTO change_request (change_request_id, version_id, change_type, applicant, reason, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, '审批中', ?, ?)
        `, [change_request_id, id, change_type, JSON.stringify({ id: applicant_id, name: applicant_name }), reason, now, now]);

        const newRequest = queryOne('SELECT * FROM change_request WHERE change_request_id = ?', [change_request_id]);

        res.status(201).json({ message: '变更申请已创建', change_request: newRequest });
    } catch (error) {
        console.error('Error creating change request:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /versions/:id/change-requests - List change requests
 */
router.get('/:id/change-requests', (req, res) => {
    try {
        const { queryAll } = getDB();
        const { id } = req.params;
        const { status } = req.query;

        let whereClause = 'WHERE version_id = ?';
        const params = [id];

        if (status) {
            whereClause += ' AND status = ?';
            params.push(status);
        }

        const changeRequests = queryAll(`
            SELECT * FROM change_request ${whereClause} ORDER BY created_at DESC
        `, params);

        changeRequests.forEach(cr => {
            if (typeof cr.applicant === 'string') {
                try { cr.applicant = JSON.parse(cr.applicant); } catch (e) { cr.applicant = { name: cr.applicant }; }
            }
            if (typeof cr.approver === 'string' && cr.approver) {
                try { cr.approver = JSON.parse(cr.approver); } catch (e) { cr.approver = { name: cr.approver }; }
            }
        });

        res.json({
            list: changeRequests,
            stats: {
                total: changeRequests.length,
                pending: changeRequests.filter(cr => cr.status === '审批中').length,
                approved: changeRequests.filter(cr => cr.status === '已通过').length,
                rejected: changeRequests.filter(cr => cr.status === '已驳回').length
            }
        });
    } catch (error) {
        console.error('Error listing change requests:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /versions/:id/change-requests/:crId/approve - Approve change request
 */
router.post('/:id/change-requests/:crId/approve', requirePermission('版本.变更审批'), (req, res) => {
    try {
        const { queryOne, run } = getDB();
        const { id, crId } = req.params;
        const approver_id = req.user.user_id;
        const approver_name = req.user.name || req.user.username;
        const now = new Date().toISOString();

        const request = queryOne('SELECT * FROM change_request WHERE change_request_id = ? AND version_id = ?', [crId, id]);

        if (!request) {
            return res.status(404).json({ error: '变更申请不存在' });
        }

        if (request.status !== '审批中') {
            return res.status(400).json({ error: '只有审批中状态的变更申请可以批准' });
        }

        run(`
            UPDATE change_request SET status = '已通过', approver = ?, approved_at = ?, updated_at = ? WHERE change_request_id = ?
        `, [JSON.stringify({ id: approver_id, name: approver_name }), now, now, crId]);

        const updated = queryOne('SELECT * FROM change_request WHERE change_request_id = ?', [crId]);

        res.json({ message: '变更申请已批准', change_request: updated });
    } catch (error) {
        console.error('Error approving change request:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /versions/:id/change-requests/:crId/reject - Reject change request
 */
router.post('/:id/change-requests/:crId/reject', requirePermission('版本.变更审批'), (req, res) => {
    try {
        const { queryOne, run } = getDB();
        const { id, crId } = req.params;
        const approver_id = req.user.user_id;
        const approver_name = req.user.name || req.user.username;
        const now = new Date().toISOString();

        const request = queryOne('SELECT * FROM change_request WHERE change_request_id = ? AND version_id = ?', [crId, id]);

        if (!request) {
            return res.status(404).json({ error: '变更申请不存在' });
        }

        if (request.status !== '审批中') {
            return res.status(400).json({ error: '只有审批中状态的变更申请可以驳回' });
        }

        run(`
            UPDATE change_request SET status = '已驳回', approver = ?, approved_at = ?, updated_at = ? WHERE change_request_id = ?
        `, [JSON.stringify({ id: approver_id, name: approver_name }), now, now, crId]);

        const updated = queryOne('SELECT * FROM change_request WHERE change_request_id = ?', [crId]);

        res.json({ message: '变更申请已驳回', change_request: updated });
    } catch (error) {
        console.error('Error rejecting change request:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;