import React, { useState, useMemo } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Avatar, Dropdown, Button, theme } from 'antd';
import {
  DashboardOutlined,
  AppstoreOutlined,
  FileTextOutlined,
  BugOutlined,
  BranchesOutlined,
  SettingOutlined,
  UserOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  DatabaseOutlined,
} from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';

const { Header, Sider, Content } = Layout;

function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const {
    token: { colorBgContainer, colorBgLayout },
  } = theme.useToken();

  const menuItems = useMemo(() => {
    const items = [
      {
        key: '/dashboard',
        icon: <DashboardOutlined />,
        label: '首页',
      },
      {
        key: 'products-group',
        icon: <AppstoreOutlined />,
        label: '产品管理',
        children: [
          {
            key: '/products',
            label: '产品列表',
          },
          {
            key: '/products/categories',
            label: '产品分类',
          },
        ],
      },
      {
        key: '/requirements',
        icon: <FileTextOutlined />,
        label: '需求管理',
      },
      {
        key: '/issues',
        icon: <BugOutlined />,
        label: '问题管理',
      },
      {
        key: '/versions',
        icon: <BranchesOutlined />,
        label: '版本管理',
      },
    ];

    if (user?.role === '系统管理员') {
      items.push({
        key: 'system-group',
        icon: <SettingOutlined />,
        label: '系统管理',
        children: [
          {
            key: '/system/users',
            label: '用户管理',
          },
          {
            key: '/system/permissions',
            label: '权限管理',
          },
          {
            key: '/system/audit',
            label: '审计日志',
          },
          {
            key: '/system/archive',
            label: '数据归档',
          },
        ],
      });
    }

    if (user?.role === '产品经理') {
      items.push({
        key: 'system-group',
        icon: <DatabaseOutlined />,
        label: '系统工具',
        children: [
          {
            key: '/system/audit',
            label: '审计日志',
          },
          {
            key: '/system/archive',
            label: '数据归档',
          },
        ],
      });
    }

    return items;
  }, [user]);

  const selectedKeys = useMemo(() => {
    const path = location.pathname;
    return [path];
  }, [location.pathname]);

  const openKeys = useMemo(() => {
    const path = location.pathname;

    if (path.startsWith('/products')) {
      return ['products-group'];
    }
    if (path.startsWith('/system')) {
      return ['system-group'];
    }

    return [];
  }, [location.pathname]);

  const handleMenuClick = ({ key }) => {
    navigate(key);
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const userDropdownItems = {
    items: [
      {
        key: 'profile',
        icon: <UserOutlined />,
        label: '个人中心',
      },
      {
        type: 'divider',
      },
      {
        key: 'logout',
        icon: <LogoutOutlined />,
        label: '退出登录',
        danger: true,
      },
    ],
    onClick: ({ key }) => {
      if (key === 'logout') {
        handleLogout();
      } else if (key === 'profile') {
        navigate('/system/users');
      }
    },
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        theme="light"
        width={220}
        style={{
          borderRight: '1px solid #f0f0f0',
        }}
      >
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderBottom: '1px solid #f0f0f0',
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: collapsed ? 16 : 20,
              fontWeight: 700,
              color: '#1677ff',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {collapsed ? 'PM' : '产品管理系统'}
          </h1>
        </div>

        <Menu
          theme="light"
          mode="inline"
          selectedKeys={selectedKeys}
          defaultOpenKeys={openKeys}
          items={menuItems}
          onClick={handleMenuClick}
          style={{
            borderRight: 0,
            marginTop: 4,
          }}
        />
      </Sider>

      <Layout>
        <Header
          style={{
            padding: '0 24px',
            background: colorBgContainer,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #f0f0f0',
            height: 64,
            lineHeight: '64px',
          }}
        >
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={{
              fontSize: 16,
              width: 40,
              height: 40,
            }}
          />

          <Dropdown menu={userDropdownItems} placement="bottomRight">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                cursor: 'pointer',
                gap: 8,
              }}
            >
              <Avatar
                size="small"
                icon={<UserOutlined />}
                style={{ backgroundColor: '#1677ff' }}
              />
              <span
                style={{
                  fontSize: 14,
                  maxWidth: 120,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {user?.name || user?.username || '用户'}
              </span>
            </div>
          </Dropdown>
        </Header>

        <Content
          style={{
            margin: 16,
            padding: 24,
            minHeight: 280,
            background: colorBgContainer,
            borderRadius: 8,
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}

export default AppLayout;