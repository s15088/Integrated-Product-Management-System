import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Form, Input, Button, Typography, message, Space, Divider } from 'antd';
import { UserOutlined, LockOutlined, SettingOutlined } from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';

const { Title, Text } = Typography;

const BRAND_BLUE = '#1677FF';

const LoginPage = () => {
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form] = Form.useForm();

  const handleSubmit = async (values) => {
    const { username, password } = values;
    setLoading(true);
    try {
      await login(username, password);
      message.success('登录成功');
      navigate('/');
    } catch (error) {
      const errorMsg =
        error?.response?.data?.message ||
        error?.message ||
        '登录失败，请检查用户名和密码';
      message.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        background: `linear-gradient(135deg, ${BRAND_BLUE}08 0%, ${BRAND_BLUE}18 100%)`,
        padding: '24px',
      }}
    >
      <Card
        style={{
          width: 420,
          borderRadius: 12,
          boxShadow: '0 8px 40px rgba(0, 0, 0, 0.08)',
          border: '1px solid #f0f0f0',
        }}
        bodyStyle={{ padding: '40px 40px 32px' }}
        bordered={false}
      >
        {/* Logo / Title Area */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: `linear-gradient(135deg, ${BRAND_BLUE}, #4096FF)`,
              display: 'inline-flex',
              justifyContent: 'center',
              alignItems: 'center',
              marginBottom: 16,
              boxShadow: `0 4px 16px ${BRAND_BLUE}40`,
            }}
          >
            <SettingOutlined style={{ fontSize: 32, color: '#fff' }} />
          </div>
          <Title
            level={3}
            style={{
              margin: 0,
              fontWeight: 700,
              color: '#1a1a2e',
              letterSpacing: 1,
            }}
          >
            综合产品管理系统
          </Title>
          <Text
            type="secondary"
            style={{ fontSize: 13, marginTop: 4, display: 'block' }}
          >
            Comprehensive Product Management System
          </Text>
        </div>

        <Divider style={{ margin: '0 0 28px' }} />

        {/* Login Form */}
        <Form
          form={form}
          name="login"
          onFinish={handleSubmit}
          autoComplete="off"
          size="large"
          layout="vertical"
          requiredMark={false}
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input
              prefix={<UserOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="用户名"
              autoFocus
              style={{
                borderRadius: 8,
                height: 46,
              }}
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="密码"
              style={{
                borderRadius: 8,
                height: 46,
              }}
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              style={{
                height: 46,
                borderRadius: 8,
                fontSize: 16,
                fontWeight: 600,
                background: `linear-gradient(135deg, ${BRAND_BLUE}, #4096FF)`,
                border: 'none',
                boxShadow: `0 4px 12px ${BRAND_BLUE}40`,
              }}
            >
              {loading ? '登录中...' : '登 录'}
            </Button>
          </Form.Item>
        </Form>

        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            &copy; {new Date().getFullYear()} 综合产品管理系统 v1.0.0
          </Text>
        </div>
      </Card>
    </div>
  );
};

export default LoginPage;