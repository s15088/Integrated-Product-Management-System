require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), override: true });
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDB } = require('./db');
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const requirementRoutes = require('./routes/requirements');
const issueRoutes = require('./routes/issues');
const versionRoutes = require('./routes/versions');
const systemRoutes = require('./routes/system');
const dashboardRoutes = require('./routes/dashboard');
const archiveRoutes = require('./routes/archive');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Initialize database and start server
initDB().then(() => {

  // Root path - friendly API info (avoids 404 confusion in dev mode)
  app.get('/', (req, res) => {
    res.json({
      message: '综合产品管理系统 API 服务运行中',
      frontend: 'http://localhost:5173',
      docs: '请访问前端地址进行使用，API 文档请参阅项目 README.md',
    });
  });

  // API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/requirements', requirementRoutes);
  app.use('/api/issues', issueRoutes);
  app.use('/api/versions', versionRoutes);
  app.use('/api/system', systemRoutes);
  app.use('/api/archive', archiveRoutes);

  // Serve static files in production
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
    });
  }

  // 404 handler for unmatched routes
  app.use((req, res) => {
    res.status(404).json({ error: `接口不存在: ${req.method} ${req.path}` });
  });

  // Error handler - catches all uncaught errors
  app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    const message = err && err.message ? err.message : 'Internal Server Error';
    res.status(500).json({ error: message });
  });

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
});
