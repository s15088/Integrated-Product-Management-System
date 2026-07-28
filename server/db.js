const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

let _db = null;
let _SQL = null;

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'db.sqlite');

function saveToFile() {
  if (!_db) return;
  const data = _db.export();
  const buffer = Buffer.from(data);
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(DB_PATH, buffer);
}

function createTables(db) {
  const now = new Date().toISOString();
  const sql = `
    CREATE TABLE IF NOT EXISTS user (
      user_id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT,
      role TEXT NOT NULL, email TEXT, password_hash TEXT NOT NULL,
      status TEXT DEFAULT 'active', created_at TEXT DEFAULT '${now}', updated_at TEXT DEFAULT '${now}'
    );
    CREATE TABLE IF NOT EXISTS product_category (
      category_id TEXT PRIMARY KEY, category_name TEXT NOT NULL, parent_id TEXT,
      description TEXT, sort INTEGER DEFAULT 0, created_at TEXT DEFAULT '${now}', updated_at TEXT DEFAULT '${now}'
    );
    CREATE TABLE IF NOT EXISTS product (
      product_id TEXT PRIMARY KEY, product_code TEXT UNIQUE NOT NULL, product_name TEXT NOT NULL,
      product_type TEXT, category_id TEXT, owner TEXT, status TEXT NOT NULL DEFAULT '规划中',
      description TEXT, created_at TEXT DEFAULT '${now}', updated_at TEXT DEFAULT '${now}'
    );
    CREATE TABLE IF NOT EXISTS version (
      version_id TEXT PRIMARY KEY, product_id TEXT NOT NULL, version_no TEXT NOT NULL,
      version_name TEXT, status TEXT NOT NULL DEFAULT '规划中', baseline_time TEXT,
      planned_release_date TEXT, release_date TEXT, description TEXT,
      created_at TEXT DEFAULT '${now}', updated_at TEXT DEFAULT '${now}'
    );
    CREATE TABLE IF NOT EXISTS change_request (
      change_request_id TEXT PRIMARY KEY, version_id TEXT NOT NULL, change_type TEXT NOT NULL,
      applicant TEXT, reason TEXT, status TEXT NOT NULL DEFAULT '草稿',
      approver TEXT, approved_at TEXT, created_at TEXT DEFAULT '${now}', updated_at TEXT DEFAULT '${now}'
    );
    CREATE TABLE IF NOT EXISTS version_item (
      version_item_id TEXT PRIMARY KEY, version_id TEXT NOT NULL, item_type TEXT NOT NULL,
      item_id TEXT NOT NULL, merge_status TEXT NOT NULL DEFAULT '已合入', source_branch TEXT,
      change_status TEXT DEFAULT '无变更', merged_at TEXT, operator TEXT, change_request_id TEXT,
      created_at TEXT DEFAULT '${now}', updated_at TEXT DEFAULT '${now}'
    );
    CREATE TABLE IF NOT EXISTS requirement (
      requirement_id TEXT PRIMARY KEY, requirement_code TEXT UNIQUE NOT NULL, title TEXT NOT NULL,
      product_id TEXT NOT NULL, module TEXT, source TEXT, proposer TEXT, priority TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT '待评估', expected_date TEXT, evaluate_result TEXT,
      evaluate_opinion TEXT, work_estimate TEXT, schedule_suggest TEXT, description TEXT,
      created_at TEXT DEFAULT '${now}', updated_at TEXT DEFAULT '${now}'
    );
    CREATE TABLE IF NOT EXISTS issue (
      issue_id TEXT PRIMARY KEY, issue_code TEXT UNIQUE NOT NULL, title TEXT NOT NULL,
      product_id TEXT NOT NULL, type TEXT, severity TEXT, priority TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT '分析中', reporter TEXT, assignee TEXT, found_version TEXT,
      module TEXT, analysis_result TEXT, analysis_opinion TEXT, reproduce_steps TEXT, description TEXT,
      created_at TEXT DEFAULT '${now}', updated_at TEXT DEFAULT '${now}'
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      audit_id TEXT PRIMARY KEY, operation_time TEXT DEFAULT '${now}', operator TEXT, role TEXT,
      operation_type TEXT NOT NULL, object_type TEXT, object_id TEXT, ip_address TEXT,
      result TEXT, diff TEXT, created_at TEXT DEFAULT '${now}'
    );
    CREATE TABLE IF NOT EXISTS permission (
      permission_id TEXT PRIMARY KEY, role TEXT NOT NULL, permission_key TEXT NOT NULL,
      allowed INTEGER DEFAULT 1, UNIQUE(role, permission_key)
    );
  `;
  db.exec(sql);
}

function createDefaultData(db) {
  const users = [
    { user_id: 'admin-001', username: 'admin', name: '系统管理员', role: '系统管理员', email: 'admin@example.com', password: 'admin123' },
    { user_id: 'pm-001', username: 'pm', name: '产品经理', role: '产品经理', email: 'pm@example.com', password: 'pm123' },
    { user_id: 'dev-001', username: 'dev', name: '开发工程师', role: '开发工程师', email: 'dev@example.com', password: 'dev123' },
    { user_id: 'lead-001', username: 'lead', name: '技术负责人', role: '开发负责人', email: 'lead@example.com', password: 'lead123' },
  ];

  for (const u of users) {
    const hash = bcrypt.hashSync(u.password, 10);
    db.run('INSERT INTO user (user_id, username, name, role, email, password_hash) VALUES (?,?,?,?,?,?)',
      [u.user_id, u.username, u.name, u.role, u.email, hash]);
  }

  const perms = [
    ['系统管理员','产品.查看',1],['系统管理员','产品.编辑',1],['系统管理员','产品.分类维护',1],
    ['系统管理员','需求.查看',1],['系统管理员','需求.提出',1],['系统管理员','需求.评估填写',0],['系统管理员','需求.评估审批',1],['系统管理员','需求.合入计划填写',0],['系统管理员','需求.合入审批',1],
    ['系统管理员','问题单.查看',1],['系统管理员','问题单.提出',1],['系统管理员','问题单.分析填写',0],['系统管理员','问题单.分析审批',0],['系统管理员','问题单.合入计划填写',0],['系统管理员','问题单.合入审批',0],
    ['系统管理员','版本.查看',1],['系统管理员','版本.基线新建',1],['系统管理员','版本.合入管理',1],['系统管理员','版本.归档',1],['系统管理员','版本.变更申请',1],['系统管理员','版本.变更审批',1],
    ['系统管理员','系统.用户管理',1],['系统管理员','系统.角色权限',1],['系统管理员','系统.审计查看',1],['系统管理员','系统.审计导出',1],
    ['产品经理','产品.查看',1],['产品经理','产品.编辑',1],['产品经理','产品.分类维护',1],
    ['产品经理','需求.查看',1],['产品经理','需求.提出',1],['产品经理','需求.评估填写',0],['产品经理','需求.评估审批',1],['产品经理','需求.合入计划填写',0],['产品经理','需求.合入审批',1],
    ['产品经理','问题单.查看',1],['产品经理','问题单.提出',1],['产品经理','问题单.分析填写',0],['产品经理','问题单.分析审批',0],['产品经理','问题单.合入计划填写',0],['产品经理','问题单.合入审批',0],
    ['产品经理','版本.查看',1],['产品经理','版本.基线新建',1],['产品经理','版本.合入管理',1],['产品经理','版本.归档',1],['产品经理','版本.变更申请',1],['产品经理','版本.变更审批',1],
    ['产品经理','系统.用户管理',0],['产品经理','系统.角色权限',0],['产品经理','系统.审计查看',1],['产品经理','系统.审计导出',1],
    ['开发工程师','产品.查看',1],['开发工程师','产品.编辑',0],['开发工程师','产品.分类维护',0],
    ['开发工程师','需求.查看',1],['开发工程师','需求.提出',1],['开发工程师','需求.评估填写',1],['开发工程师','需求.评估审批',0],['开发工程师','需求.合入计划填写',1],['开发工程师','需求.合入审批',0],
    ['开发工程师','问题单.查看',1],['开发工程师','问题单.提出',1],['开发工程师','问题单.分析填写',1],['开发工程师','问题单.分析审批',0],['开发工程师','问题单.合入计划填写',1],['开发工程师','问题单.合入审批',0],
    ['开发工程师','版本.查看',1],['开发工程师','版本.基线新建',0],['开发工程师','版本.合入管理',1],['开发工程师','版本.归档',0],['开发工程师','版本.变更申请',1],['开发工程师','版本.变更审批',0],
    ['开发工程师','系统.用户管理',0],['开发工程师','系统.角色权限',0],['开发工程师','系统.审计查看',0],['开发工程师','系统.审计导出',0],
    ['开发负责人','产品.查看',1],['开发负责人','产品.编辑',0],['开发负责人','产品.分类维护',0],
    ['开发负责人','需求.查看',1],['开发负责人','需求.提出',1],['开发负责人','需求.评估填写',1],['开发负责人','需求.评估审批',0],['开发负责人','需求.合入计划填写',1],['开发负责人','需求.合入审批',0],
    ['开发负责人','问题单.查看',1],['开发负责人','问题单.提出',1],['开发负责人','问题单.分析填写',1],['开发负责人','问题单.分析审批',1],['开发负责人','问题单.合入计划填写',1],['开发负责人','问题单.合入审批',1],
    ['开发负责人','版本.查看',1],['开发负责人','版本.基线新建',1],['开发负责人','版本.合入管理',1],['开发负责人','版本.归档',1],['开发负责人','版本.变更申请',1],['开发负责人','版本.变更审批',1],
    ['开发负责人','系统.用户管理',0],['开发负责人','系统.角色权限',0],['开发负责人','系统.审计查看',0],['开发负责人','系统.审计导出',0],
    ['测试负责人','产品.查看',1],['测试负责人','产品.编辑',0],['测试负责人','产品.分类维护',0],
    ['测试负责人','需求.查看',1],['测试负责人','需求.提出',0],['测试负责人','需求.评估填写',0],['测试负责人','需求.评估审批',0],['测试负责人','需求.合入计划填写',0],['测试负责人','需求.合入审批',0],
    ['测试负责人','问题单.查看',1],['测试负责人','问题单.提出',1],['测试负责人','问题单.分析填写',0],['测试负责人','问题单.分析审批',0],['测试负责人','问题单.合入计划填写',0],['测试负责人','问题单.合入审批',0],
    ['测试负责人','版本.查看',1],['测试负责人','版本.基线新建',0],['测试负责人','版本.合入管理',0],['测试负责人','版本.归档',0],['测试负责人','版本.变更申请',0],['测试负责人','版本.变更审批',0],
    ['测试负责人','系统.用户管理',0],['测试负责人','系统.角色权限',0],['测试负责人','系统.审计查看',0],['测试负责人','系统.审计导出',0],
    ['普通成员','产品.查看',1],['普通成员','产品.编辑',0],['普通成员','产品.分类维护',0],
    ['普通成员','需求.查看',1],['普通成员','需求.提出',1],['普通成员','需求.评估填写',0],['普通成员','需求.评估审批',0],['普通成员','需求.合入计划填写',0],['普通成员','需求.合入审批',0],
    ['普通成员','问题单.查看',1],['普通成员','问题单.提出',1],['普通成员','问题单.分析填写',0],['普通成员','问题单.分析审批',0],['普通成员','问题单.合入计划填写',0],['普通成员','问题单.合入审批',0],
    ['普通成员','版本.查看',1],['普通成员','版本.基线新建',0],['普通成员','版本.合入管理',0],['普通成员','版本.归档',0],['普通成员','版本.变更申请',0],['普通成员','版本.变更审批',0],
    ['普通成员','系统.用户管理',0],['普通成员','系统.角色权限',0],['普通成员','系统.审计查看',0],['普通成员','系统.审计导出',0],
  ];

  for (const [role, key, allowed] of perms) {
    const pid = `${role}-${key}`.replace(/\./g, '-');
    db.run('INSERT OR IGNORE INTO permission (permission_id, role, permission_key, allowed) VALUES (?,?,?,?)',
      [pid, role, key, allowed]);
  }
}

async function initDB() {
  const SQL = await initSqlJs();
  _SQL = SQL;

  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    _db = new SQL.Database(buf);
  } else {
    _db = new SQL.Database();
  }

  _db.run('PRAGMA foreign_keys = ON;');

  const existing = _db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='user'");
  if (!existing.length) {
    createTables(_db);
    createDefaultData(_db);
    saveToFile();
  }

  console.log('Database initialized successfully');
  return _db;
}

function getDB() {
  if (!_db) throw new Error('Database not initialized');
  return {
    db: _db,
    queryAll,
    queryOne,
    run,
    saveDB: saveToFile
  };
}

function queryAll(sql, params = []) {
  try {
    const stmt = _db.prepare(sql);
    if (params.length) stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  } catch (err) {
    const msg = (err && err.message) ? err.message : String(err);
    throw new Error(`数据库查询失败: ${msg} | SQL: ${sql.substring(0, 100)}`);
  }
}

function queryOne(sql, params = []) {
  try {
    const stmt = _db.prepare(sql);
    if (params.length) stmt.bind(params);
    let row = null;
    if (stmt.step()) row = stmt.getAsObject();
    stmt.free();
    return row;
  } catch (err) {
    const msg = (err && err.message) ? err.message : String(err);
    throw new Error(`数据库查询失败: ${msg} | SQL: ${sql.substring(0, 100)}`);
  }
}

function run(sql, params = []) {
  try {
    _db.run(sql, params);
  } catch (err) {
    // sql.js may throw Error or string; normalize to Error with message
    const msg = (err && err.message) ? err.message : String(err);
    throw new Error(`数据库操作失败: ${msg} | SQL: ${sql.substring(0, 100)}`);
  }
  saveToFile();
  return { changes: _db.getRowsModified() };
}

module.exports = { initDB, getDB, queryAll, queryOne, run, saveToFile };