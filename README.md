# 综合产品管理系统

一款面向软件研发团队的综合产品管理平台，覆盖产品管理、需求跟踪、问题单跟踪、版本管理四大核心模块。

## 功能模块

| 模块 | 功能 |
|------|------|
| **产品管理** | 产品信息维护、产品分类管理、状态流转 |
| **需求跟踪** | 需求提出、评估填写与审批、版本合入计划、Excel 批量导入 |
| **问题单跟踪** | 问题单登记、分析填写与审批、合入计划、Excel 批量导入 |
| **版本管理** | 版本基线建立、合入管理、变更申请与审批、归档 |
| **系统管理** | 用户管理、角色权限配置、审计日志查看与导出 |
| **数据看板** | 统计概览、趋势分析 |

## 技术栈

- **前端**: React 18 + Ant Design 5 + Vite
- **后端**: Node.js + Express
- **数据库**: SQLite (sql.js, 纯 JavaScript 实现，无需编译)
- **认证**: JWT + 角色权限控制 (RBAC)

## 快速开始

### 安装依赖

```bash
# 后端依赖
npm install

# 前端依赖
cd client && npm install
```

### 启动服务

```bash
# 方式一：同时启动前后端
npm run dev

# 方式二：分别启动
npm run dev:server   # 后端 http://localhost:3001
cd client && npx vite  # 前端 http://localhost:5173
```

### 默认账号

| 用户名 | 密码 | 角色 |
|--------|------|------|
| admin | admin123 | 系统管理员 |
| pm | pm123 | 产品经理 |
| dev | dev123 | 开发工程师 |
| lead | lead123 | 技术负责人 |

## 项目结构

```
.
├── client/                 # 前端
│   ├── src/
│   │   ├── api/client.js   # API 客户端（含 token 拦截器）
│   │   ├── components/     # 公共组件
│   │   ├── contexts/       # React Context
│   │   ├── pages/          # 页面组件
│   │   └── main.jsx        # 应用入口
│   └── vite.config.js      # Vite 配置
├── server/
│   ├── db.js               # 数据库初始化与操作
│   ├── index.js            # Express 入口
│   ├── middleware/
│   │   └── auth.js         # 认证与权限中间件
│   └── routes/
│       ├── auth.js         # 认证接口
│       ├── products.js     # 产品管理接口
│       ├── requirements.js # 需求管理接口
│       ├── issues.js       # 问题单管理接口
│       ├── versions.js     # 版本管理接口
│       ├── system.js       # 系统管理接口
│       └── dashboard.js    # 数据看板接口
├── .env                    # 环境变量
└── package.json
```

## 配置说明

`.env` 文件中的可用配置：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3001` | 后端服务端口 |
| `JWT_SECRET` | `default-secret` | JWT 签名密钥 |
| `DB_PATH` | `./data/db.sqlite` | 数据库文件路径 |

## API 设计规范

- 所有接口前缀 `/api`
- 认证方式：`Authorization: Bearer <token>`
- 错误响应格式：`{ error: "具体错误信息" }`
- 成功响应格式视接口而定，列表接口通常为 `{ items: [...], total: N, page: 1, pageSize: 10 }`

### 核心端点

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/auth/login` | POST | 用户登录 |
| `/api/auth/me` | GET | 获取当前用户信息 |
| `/api/products` | GET/POST | 产品列表/创建 |
| `/api/products/:id` | GET/PUT/DELETE | 产品详情/更新/删除 |
| `/api/products/:id/versions` | GET | 产品关联版本列表 |
| `/api/products/:id/status` | PUT | 更新产品状态 |
| `/api/requirements` | GET/POST | 需求列表/创建 |
| `/api/requirements/import` | POST | Excel 导入需求 |
| `/api/issues` | GET/POST | 问题单列表/创建 |
| `/api/issues/import` | POST | Excel 导入问题单 |
| `/api/versions` | GET/POST | 版本列表/创建 |
| `/api/versions/:id/baseline` | POST | 版本基线建立 |
| `/api/versions/:id/release` | POST | 版本发布 |
| `/api/versions/:id/archive` | POST | 版本归档 |
| `/api/system/users` | GET/POST | 用户列表/创建（需管理员权限） |
| `/api/system/users/simple` | GET | 轻量级用户列表（仅需认证） |
| `/api/system/permissions` | GET/PUT | 权限矩阵 |
| `/api/system/audit-logs` | GET | 审计日志 |
| `/api/dashboard/stats` | GET | 统计数据 |
| `/api/dashboard/trends` | GET | 趋势数据 |

## 注意事项

1. 删除数据库文件 `data/db.sqlite` 后重启服务，系统将自动重新初始化并恢复默认账号数据
2. 前端代理配置在 `client/vite.config.js` 中，默认代理 `/api` 到 `http://127.0.0.1:3001`
3. 请勿在 6666 端口启动前端（浏览器安全策略会阻止访问）

## 许可证

MIT
