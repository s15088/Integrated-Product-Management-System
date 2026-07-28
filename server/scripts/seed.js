require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const path = require('path');
const { initDB, getDB } = require('../db');
const { generateId } = require('../middleware/auth');

// Initialize DB
initDB();
const { queryOne, run } = getDB();

// Create demo product categories
const categories = [
  { category_id: 'cat-001', category_name: '数据安全产品', parent_id: null, sort: 1 },
  { category_id: 'cat-002', category_name: '网络DLP', parent_id: 'cat-001', sort: 1 },
  { category_id: 'cat-003', category_name: '数据库防火墙', parent_id: 'cat-001', sort: 2 },
  { category_id: 'cat-004', category_name: '数据库静态脱敏', parent_id: 'cat-001', sort: 3 },
  { category_id: 'cat-005', category_name: '数据库动态脱敏', parent_id: 'cat-001', sort: 4 },
  { category_id: 'cat-006', category_name: '网络安全产品', parent_id: null, sort: 2 },
  { category_id: 'cat-007', category_name: '下一代防火墙', parent_id: 'cat-006', sort: 1 },
  { category_id: 'cat-008', category_name: '入侵检测', parent_id: 'cat-006', sort: 2 },
];

for (const cat of categories) {
  run('INSERT OR IGNORE INTO product_category (category_id, category_name, parent_id, sort) VALUES (?,?,?,?)',
    [cat.category_id, cat.category_name, cat.parent_id, cat.sort]);
}

// Create demo products
const products = [
  { product_id: 'prod-001', product_code: 'PRD-DLP', product_name: '网络DLP系统', product_type: '软件产品', category_id: 'cat-002', owner: 'pm-001', status: '已发布' },
  { product_id: 'prod-002', product_code: 'PRD-FW', product_name: '数据库防火墙', product_type: '软件产品', category_id: 'cat-003', owner: 'pm-001', status: '开发中' },
  { product_id: 'prod-003', product_code: 'PRD-DM', product_name: '数据脱敏平台', product_type: '软件产品', category_id: 'cat-004', owner: 'pm-001', status: '开发中' },
  { product_id: 'prod-004', product_code: 'PRD-NGFW', product_name: '下一代防火墙', product_type: '硬件产品', category_id: 'cat-007', owner: 'pm-001', status: '已发布' },
];

for (const p of products) {
  run('INSERT OR IGNORE INTO product (product_id, product_code, product_name, product_type, category_id, owner, status, description) VALUES (?,?,?,?,?,?,?,?)',
    [p.product_id, p.product_code, p.product_name, p.product_type, p.category_id, p.owner, p.status, '']);
}

// Create demo versions
const versions = [
  { version_id: 'ver-001', product_id: 'prod-001', version_no: 'v2.1.0', version_name: '网络DLP v2.1', status: '已发布', baseline_time: '2026-01-15', planned_release_date: '2026-03-15', release_date: '2026-03-10' },
  { version_id: 'ver-002', product_id: 'prod-001', version_no: 'v2.2.0', version_name: '网络DLP v2.2', status: '开发中', baseline_time: '2026-04-01', planned_release_date: '2026-06-30' },
  { version_id: 'ver-003', product_id: 'prod-002', version_no: 'v1.0.0', version_name: '数据库防火墙 v1.0', status: '开发中', baseline_time: '2026-02-01', planned_release_date: '2026-05-30' },
  { version_id: 'ver-004', product_id: 'prod-003', version_no: 'v3.0.0', version_name: '数据脱敏平台 v3.0', status: '规划中', baseline_time: null, planned_release_date: '2026-08-01' },
  { version_id: 'ver-005', product_id: 'prod-004', version_no: 'v5.1.0', version_name: '下一代防火墙 v5.1', status: '已发布', baseline_time: '2026-01-01', planned_release_date: '2026-04-01', release_date: '2026-03-28' },
];

for (const v of versions) {
  run('INSERT OR IGNORE INTO version (version_id, product_id, version_no, version_name, status, baseline_time, planned_release_date, release_date) VALUES (?,?,?,?,?,?,?,?)',
    [v.version_id, v.product_id, v.version_no, v.version_name, v.status, v.baseline_time, v.planned_release_date, v.release_date]);
}

// Create demo requirements
const requirements = [
  { requirement_id: 'req-001', requirement_code: 'REQ-2026-0001', title: '支持HTTPS流量解密检测', product_id: 'prod-001', module: '流量检测', source: '客户', proposer: 'pm-001', priority: 'P0', status: '已实现' },
  { requirement_id: 'req-002', requirement_code: 'REQ-2026-0002', title: '新增敏感数据识别规则引擎', product_id: 'prod-001', module: '规则引擎', source: '内部', proposer: 'pm-001', priority: 'P1', status: '开发中' },
  { requirement_id: 'req-003', requirement_code: 'REQ-2026-0003', title: '支持多云环境部署', product_id: 'prod-001', module: '部署', source: '市场', proposer: 'pm-001', priority: 'P2', status: '已规划' },
  { requirement_id: 'req-004', requirement_code: 'REQ-2026-0004', title: '优化大流量场景性能', product_id: 'prod-001', module: '性能', source: '客户', proposer: 'pm-001', priority: 'P1', status: '待评估' },
  { requirement_id: 'req-005', requirement_code: 'REQ-2026-0005', title: 'SQL注入检测增强', product_id: 'prod-002', module: 'SQL检测', source: '内部', proposer: 'pm-001', priority: 'P0', status: '开发中' },
  { requirement_id: 'req-006', requirement_code: 'REQ-2026-0006', title: '支持Oracle数据库防火墙', product_id: 'prod-002', module: '数据库支持', source: '客户', proposer: 'pm-001', priority: 'P1', status: '已规划' },
  { requirement_id: 'req-007', requirement_code: 'REQ-2026-0007', title: '静态脱敏算法优化', product_id: 'prod-003', module: '脱敏引擎', source: '内部', proposer: 'pm-001', priority: 'P1', status: '待评估' },
  { requirement_id: 'req-008', requirement_code: 'REQ-2026-0008', title: '支持国密SM4加密', product_id: 'prod-004', module: '加密', source: '市场', proposer: 'pm-001', priority: 'P0', status: '已实现' },
  { requirement_id: 'req-009', requirement_code: 'REQ-2026-0009', title: '威胁情报联动功能', product_id: 'prod-004', module: '安全情报', source: '客户', proposer: 'pm-001', priority: 'P1', status: '测试中' },
  { requirement_id: 'req-010', requirement_code: 'REQ-2026-0010', title: '日志审计报表导出', product_id: 'prod-004', module: '日志', source: '内部', proposer: 'pm-001', priority: 'P2', status: '评估待审批' },
  { requirement_id: 'req-011', requirement_code: 'REQ-2026-0011', title: 'API接口安全检测', product_id: 'prod-001', module: 'API安全', source: '市场', proposer: 'pm-001', priority: 'P1', status: '已关闭' },
  { requirement_id: 'req-012', requirement_code: 'REQ-2026-0012', title: '动态脱敏策略配置界面', product_id: 'prod-003', module: '脱敏策略', source: '客户', proposer: 'pm-001', priority: 'P2', status: '已规划' },
];

for (const r of requirements) {
  run(`
    INSERT OR IGNORE INTO requirement (requirement_id, requirement_code, title, product_id, module, source, proposer, priority, status, description)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `, [r.requirement_id, r.requirement_code, r.title, r.product_id, r.module, r.source, r.proposer, r.priority, r.status, '']);
}

// Create demo issues
const issues = [
  { issue_id: 'iss-001', issue_code: 'ISS-2026-0001', title: 'HTTPS解密后内存泄漏', product_id: 'prod-001', type: '缺陷', severity: '严重', priority: '高', status: '回归通过', reporter: 'pm-001', assignee: 'dev-001' },
  { issue_id: 'iss-002', issue_code: 'ISS-2026-0002', title: '规则引擎匹配速率低', product_id: 'prod-001', type: '优化', severity: '一般', priority: '中', status: '开发中', reporter: 'pm-001', assignee: 'dev-001' },
  { issue_id: 'iss-003', issue_code: 'ISS-2026-0003', title: '大文件上传导致OOM', product_id: 'prod-001', type: '缺陷', severity: '致命', priority: '紧急', status: '分析中', reporter: 'pm-001', assignee: 'dev-001' },
  { issue_id: 'iss-004', issue_code: 'ISS-2026-0004', title: '防火墙规则配置不生效', product_id: 'prod-002', type: '缺陷', severity: '严重', priority: '高', status: '复测中', reporter: 'pm-001', assignee: 'dev-001' },
  { issue_id: 'iss-005', issue_code: 'ISS-2026-0005', title: '脱敏后数据格式异常', product_id: 'prod-003', type: '缺陷', severity: '严重', priority: '高', status: '分析待审批', reporter: 'pm-001', assignee: 'dev-001' },
  { issue_id: 'iss-006', issue_code: 'ISS-2026-0006', title: '防火墙吞吐量不达标', product_id: 'prod-004', type: '优化', severity: '一般', priority: '中', status: '已关闭', reporter: 'pm-001', assignee: 'dev-001' },
  { issue_id: 'iss-007', issue_code: 'ISS-2026-0007', title: 'SM4加密性能优化', product_id: 'prod-004', type: '优化', severity: '提示', priority: '低', status: '开发中', reporter: 'pm-001', assignee: 'dev-001' },
  { issue_id: 'iss-008', issue_code: 'ISS-2026-0008', title: '产品使用咨询', product_id: 'prod-001', type: '咨询', severity: '提示', priority: '低', status: '已关闭', reporter: 'pm-001', assignee: 'dev-001' },
];

for (const i of issues) {
  run(`
    INSERT OR IGNORE INTO issue (issue_id, issue_code, title, product_id, type, severity, priority, status, reporter, assignee, description)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `, [i.issue_id, i.issue_code, i.title, i.product_id, i.type, i.severity, i.priority, i.status, i.reporter, i.assignee, '']);
}

// Create demo version items (many-to-many relationships)
const versionItems = [
  { version_id: 'ver-001', item_type: '需求', item_id: 'req-001', merge_status: '已合入', source_branch: 'trunk', operator: 'dev-001' },
  { version_id: 'ver-001', item_type: '需求', item_id: 'req-011', merge_status: '已合入', source_branch: 'trunk', operator: 'dev-001' },
  { version_id: 'ver-001', item_type: '需求', item_id: 'req-008', merge_status: '已合入', source_branch: 'trunk', operator: 'dev-001' },
  { version_id: 'ver-001', item_type: '问题单', item_id: 'iss-001', merge_status: '已合入', source_branch: 'trunk', operator: 'dev-001' },
  { version_id: 'ver-001', item_type: '问题单', item_id: 'iss-006', merge_status: '已合入', source_branch: 'trunk', operator: 'dev-001' },
  { version_id: 'ver-002', item_type: '需求', item_id: 'req-002', merge_status: '已合入', source_branch: 'trunk', operator: 'dev-001' },
  { version_id: 'ver-002', item_type: '需求', item_id: 'req-001', merge_status: '已合入', source_branch: 'release-2.2', operator: 'dev-001' },
  { version_id: 'ver-002', item_type: '问题单', item_id: 'iss-002', merge_status: '已合入', source_branch: 'trunk', operator: 'dev-001' },
  { version_id: 'ver-003', item_type: '需求', item_id: 'req-005', merge_status: '已合入', source_branch: 'trunk', operator: 'dev-001' },
  { version_id: 'ver-003', item_type: '问题单', item_id: 'iss-004', merge_status: '已合入', source_branch: 'trunk', operator: 'dev-001' },
  { version_id: 'ver-005', item_type: '需求', item_id: 'req-008', merge_status: '已合入', source_branch: 'trunk', operator: 'dev-001' },
  { version_id: 'ver-005', item_type: '需求', item_id: 'req-009', merge_status: '已合入', source_branch: 'trunk', operator: 'dev-001' },
  { version_id: 'ver-005', item_type: '问题单', item_id: 'iss-006', merge_status: '已合入', source_branch: 'trunk', operator: 'dev-001' },
];

for (const vi of versionItems) {
  const viId = generateId();
  run(`
    INSERT OR IGNORE INTO version_item (version_item_id, version_id, item_type, item_id, merge_status, source_branch, operator, merged_at)
    VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
  `, [viId, vi.version_id, vi.item_type, vi.item_id, vi.merge_status, vi.source_branch, vi.operator]);
}

console.log('Demo data seeded successfully!');
console.log('Default accounts:');
console.log('  admin / admin123 (系统管理员)');
console.log('  pm / pm123 (产品经理)');
console.log('  dev / dev123 (开发工程师)');
console.log('  lead / lead123 (技术负责人)');