import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import './api/client'; // Register global axios interceptors (token + 401)
import './index.css';

const theme = {
  token: {
    colorPrimary: '#1677FF',
    borderRadius: 8,
    fontFamily: `-apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`,
  },
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfigProvider theme={theme} locale={zhCN}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ConfigProvider>
  </React.StrictMode>
);