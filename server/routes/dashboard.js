const express = require('express');
const { getDB } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// All routes require auth
router.use(authMiddleware);

// ============================================================
// Helper: build time dimension WHERE clause
// ============================================================
function buildTimeFilter(timeDimension, startDate, endDate, tableAlias, params) {
  const column = timeDimension === 'updated_at' ? 'updated_at' : 'created_at';
  let clause = '';
  if (startDate) {
    clause += ` AND ${tableAlias}.${column} >= ?`;
    params.push(startDate);
  }
  if (endDate) {
    clause += ` AND ${tableAlias}.${column} <= ?`;
    params.push(endDate);
  }
  return clause;
}

// ============================================================
// Helper: build product/category filter for dashboard queries
// ============================================================
function buildProductFilter(product_id, category_id, tableAlias, params) {
  let clause = '';
  if (product_id) {
    clause += ` AND ${tableAlias}.product_id = ?`;
    params.push(product_id);
  }
  if (category_id) {
    clause += ` AND p.category_id = ?`;
    params.push(category_id);
  }
  return clause;
}

// ============================================================
// GET /api/dashboard/stats - Dashboard KPI cards
// ============================================================
router.get('/stats', (req, res) => {
  try {
    const { queryAll, queryOne } = getDB();
    const { timeDimension, startDate, endDate, product_id, category_id } = req.query;
    const params = [];

    // --- Product count ---
    let productCountParams = [];
    let productCountWhere = 'WHERE 1=1';
    if (category_id) {
      productCountWhere += ' AND p.category_id = ?';
      productCountParams.push(category_id);
    }
    const productCount = queryOne(`
      SELECT COUNT(*) as count FROM product p ${productCountWhere}
    `, productCountParams).count;

    // --- Version counts by status ---
    const vParams = [];
    let vWhere = 'WHERE 1=1';
    vWhere += buildTimeFilter(timeDimension, startDate, endDate, 'v', vParams);
    vWhere += buildProductFilter(product_id, category_id, 'v', vParams);

    const versionCounts = queryAll(`
      SELECT v.status, COUNT(*) as count
      FROM version v
      LEFT JOIN product p ON v.product_id = p.product_id
      ${vWhere}
      GROUP BY v.status
    `, vParams);

    // Map version statuses with defaults
    const versionStatuses = ['规划中', '开发中', '已发布', '已归档'];
    const versionCountsMap = {};
    for (const row of versionCounts) {
      versionCountsMap[row.status] = row.count;
    }
    const versionCountsResult = versionStatuses.map(status => ({
      status,
      count: versionCountsMap[status] || 0
    }));

    // --- Requirement counts by status ---
    const rParams = [];
    let rWhere = 'WHERE 1=1';
    rWhere += buildTimeFilter(timeDimension, startDate, endDate, 'r', rParams);
    rWhere += buildProductFilter(product_id, category_id, 'r', rParams);

    const requirementCounts = queryAll(`
      SELECT r.status, COUNT(*) as count
      FROM requirement r
      LEFT JOIN product p ON r.product_id = p.product_id
      ${rWhere}
      GROUP BY r.status
    `, rParams);

    const requirementStatuses = ['待评估', '评估待审批', '已规划', '开发中', '测试中', '已实现', '已关闭', '已拒绝'];
    const requirementCountsMap = {};
    for (const row of requirementCounts) {
      requirementCountsMap[row.status] = row.count;
    }
    const requirementCountsResult = requirementStatuses.map(status => ({
      status,
      count: requirementCountsMap[status] || 0
    }));

    // --- Issue counts by status ---
    const iParams = [];
    let iWhere = 'WHERE 1=1';
    iWhere += buildTimeFilter(timeDimension, startDate, endDate, 'i', iParams);
    iWhere += buildProductFilter(product_id, category_id, 'i', iParams);

    const issueCounts = queryAll(`
      SELECT i.status, COUNT(*) as count
      FROM issue i
      LEFT JOIN product p ON i.product_id = p.product_id
      ${iWhere}
      GROUP BY i.status
    `, iParams);

    const issueStatuses = ['分析中', '分析待审批', '开发中', '复测中', '回归通过', '已关闭'];
    const issueCountsMap = {};
    for (const row of issueCounts) {
      issueCountsMap[row.status] = row.count;
    }
    const issueCountsResult = issueStatuses.map(status => ({
      status,
      count: issueCountsMap[status] || 0
    }));

    // Map to frontend expected format
    const versionCountMap = {};
    for (const row of versionCounts) versionCountMap[row.status] = row.count;
    const reqCountMap = {};
    for (const row of requirementCounts) reqCountMap[row.status] = row.count;
    const issCountMap = {};
    for (const row of issueCounts) issCountMap[row.status] = row.count;

    res.json({
      total_products: productCount,
      planned_versions: versionCountMap['规划中'] || 0,
      released_versions: versionCountMap['已发布'] || 0,
      developing_versions: versionCountMap['开发中'] || 0,
      archived_versions: versionCountMap['已归档'] || 0,
      pending_requirements: reqCountMap['待评估'] || 0,
      developing_requirements: (reqCountMap['开发中'] || 0) + (reqCountMap['已规划'] || 0),
      testing_requirements: reqCountMap['测试中'] || 0,
      implemented_requirements: reqCountMap['已实现'] || 0,
      closed_requirements: reqCountMap['已关闭'] || 0,
      analyzing_issues: issCountMap['分析中'] || 0,
      fixing_issues: issCountMap['开发中'] || 0,
      retesting_issues: issCountMap['复测中'] || 0,
      regression_passed: issCountMap['回归通过'] || 0,
      closed_issues: issCountMap['已关闭'] || 0
    });
  } catch (err) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ error: '获取仪表盘统计数据失败: ' + err.message });
  }
});

// ============================================================
// GET /api/dashboard/trends - Dashboard trend data
// ============================================================
router.get('/trends', (req, res) => {
  try {
    const { queryAll } = getDB();
    const { timeDimension, startDate, endDate, product_id, category_id } = req.query;

    // --- Version trends (monthly) ---
    const vParams = [];
    let vWhere = 'WHERE 1=1';
    vWhere += buildTimeFilter(timeDimension, startDate, endDate, 'v', vParams);
    vWhere += buildProductFilter(product_id, category_id, 'v', vParams);

    const timeColumn = timeDimension === 'updated_at' ? 'v.updated_at' : 'v.created_at';
    const versionTrends = queryAll(`
      SELECT strftime('%Y-%m', ${timeColumn}) as month, COUNT(*) as count
      FROM version v
      LEFT JOIN product p ON v.product_id = p.product_id
      ${vWhere}
      GROUP BY month
      ORDER BY month ASC
    `, vParams);

    // --- Requirement status distribution ---
    const rParams = [];
    let rWhere = 'WHERE 1=1';
    rWhere += buildTimeFilter(timeDimension, startDate, endDate, 'r', rParams);
    rWhere += buildProductFilter(product_id, category_id, 'r', rParams);

    const requirementStatusDistribution = queryAll(`
      SELECT r.status, COUNT(*) as count
      FROM requirement r
      LEFT JOIN product p ON r.product_id = p.product_id
      ${rWhere}
      GROUP BY r.status
      ORDER BY count DESC
    `, rParams);

    // --- Issue severity distribution ---
    const iParams = [];
    let iWhere = 'WHERE 1=1';
    iWhere += buildTimeFilter(timeDimension, startDate, endDate, 'i', iParams);
    iWhere += buildProductFilter(product_id, category_id, 'i', iParams);

    const issueSeverityDistribution = queryAll(`
      SELECT i.severity, COUNT(*) as count
      FROM issue i
      LEFT JOIN product p ON i.product_id = p.product_id
      ${iWhere}
      GROUP BY i.severity
      ORDER BY count DESC
    `, iParams);

    res.json({
      version_trend: versionTrends.map(v => ({ month: v.month, count: v.count })),
      requirement_status_distribution: requirementStatusDistribution.map(r => ({ name: r.status, value: r.count })),
      issue_severity_distribution: issueSeverityDistribution.map(i => ({ name: i.severity || '未分类', value: i.count }))
    });
  } catch (err) {
    console.error('Dashboard trends error:', err);
    res.status(500).json({ error: '获取仪表盘趋势数据失败: ' + err.message });
  }
});

module.exports = router;