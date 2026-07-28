import React, { useState, useEffect, useCallback } from 'react';
import {
  Table,
  Modal,
  Form,
  Select,
  Input,
  Tag,
  Button,
  Space,
  Popconfirm,
  message,
  Switch,
  Card,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  KeyOutlined,
  SearchOutlined,
  UserOutlined,
  MailOutlined,
  LockOutlined,
} from '@ant-design/icons';
import axios from 'axios';

const ROLE_OPTIONS = [
  { label: '系统管理员', value: '系统管理员', color: 'red' },
  { label: '产品经理', value: '产品经理', color: 'blue' },
  { label: '开发工程师', value: '开发工程师', color: 'green' },
  { label: '开发负责人', value: '开发负责人', color: 'purple' },
  { label: '测试负责人', value: '测试负责人', color: 'orange' },
  { label: '普通成员', value: '普通成员', color: 'default' },
];

const ROLE_COLOR_MAP = {};
ROLE_OPTIONS.forEach((r) => {
  ROLE_COLOR_MAP[r.value] = r.color;
});

function generatePassword(length = 12) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

const UsersPage = () => {
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10, total: 0 });

  // Create modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [createLoading, setCreateLoading] = useState(false);
  const [autoGeneratePwd, setAutoGeneratePwd] = useState(true);

  // Edit modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editForm] = Form.useForm();
  const [editLoading, setEditLoading] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  // Reset password modal
  const [resetPwdModalOpen, setResetPwdModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [resetPwdLoading, setResetPwdLoading] = useState(false);

  const [currentUser, setCurrentUser] = useState(null);

  // Fetch current user info
  const fetchCurrentUser = useCallback(async () => {
    try {
      const res = await axios.get('/api/auth/me');
      setCurrentUser(res.data.user);
    } catch {
      // not critical
    }
  }, []);

  // Fetch user list
  const fetchUsers = useCallback(
    async (page = 1, pageSize = 10, keyword = '') => {
      setLoading(true);
      try {
        const res = await axios.get('/api/system/users', {
          params: { page, pageSize, search: keyword },
        });
        const { items, total } = res.data;
        setDataSource(items || []);
        setPagination((prev) => ({ ...prev, current: page, pageSize, total: total || 0 }));
      } catch (err) {
        message.error(err.response?.data?.message || '获取用户列表失败');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    fetchCurrentUser();
    fetchUsers();
  }, [fetchCurrentUser, fetchUsers]);

  // Search
  const handleSearch = (value) => {
    setSearchKeyword(value);
    fetchUsers(1, pagination.pageSize, value);
  };

  // Table change
  const handleTableChange = (pag) => {
    fetchUsers(pag.current, pag.pageSize, searchKeyword);
  };

  // ---- Create User ----
  const handleOpenCreate = () => {
    createForm.resetFields();
    setAutoGeneratePwd(true);
    setCreateModalOpen(true);
  };

  const handleCreateSubmit = async () => {
    try {
      const values = await createForm.validateFields();
      setCreateLoading(true);
      const payload = { ...values, auto_generate_password: autoGeneratePwd };
      const res = await axios.post('/api/system/users', payload);
      message.success('用户创建成功');
      setCreateModalOpen(false);
      // If auto-generated password, show it
      if (autoGeneratePwd && res.data?.new_password) {
        setNewPassword(res.data.new_password);
        setResetPwdModalOpen(true);
      }
      fetchUsers(pagination.current, pagination.pageSize, searchKeyword);
    } catch (err) {
      if (err.errorFields) return; // validation error
      message.error(err.response?.data?.message || '创建用户失败');
    } finally {
      setCreateLoading(false);
    }
  };

  // ---- Edit User ----
  const handleOpenEdit = (record) => {
    setEditingUser(record);
    editForm.setFieldsValue({
      name: record.name,
      role: record.role,
      email: record.email,
    });
    setEditModalOpen(true);
  };

  const handleEditSubmit = async () => {
    try {
      const values = await editForm.validateFields();
      setEditLoading(true);
      await axios.put(`/api/system/users/${editingUser.user_id}`, values);
      message.success('用户信息更新成功');
      setEditModalOpen(false);
      fetchUsers(pagination.current, pagination.pageSize, searchKeyword);
    } catch (err) {
      if (err.errorFields) return;
      message.error(err.response?.data?.message || '更新用户失败');
    } finally {
      setEditLoading(false);
    }
  };

  // ---- Reset Password ----
  const handleResetPassword = async (record) => {
    setResetPwdLoading(true);
    try {
      const res = await axios.post(`/api/system/users/${record.user_id}/reset-password`);
      setNewPassword(res.data?.new_password || '');
      setResetPwdModalOpen(true);
      message.success('密码重置成功');
    } catch (err) {
      message.error(err.response?.data?.message || '重置密码失败');
    } finally {
      setResetPwdLoading(false);
    }
  };

  // ---- Toggle Status ----
  const handleToggleStatus = async (record) => {
    const newStatus = record.status === 'active' ? 'disabled' : 'active';
    try {
      await axios.put(`/api/system/users/${record.user_id}`, { status: newStatus });
      message.success(newStatus === 'active' ? '用户已启用' : '用户已禁用');
      fetchUsers(pagination.current, pagination.pageSize, searchKeyword);
    } catch (err) {
      message.error(err.response?.data?.message || '操作失败');
    }
  };

  // ---- Delete User ----
  const handleDelete = async (record) => {
    if (currentUser && currentUser.user_id === record.user_id) {
      message.warning('不能删除自己的账号');
      return;
    }
    try {
      await axios.delete(`/api/system/users/${record.user_id}`);
      message.success('用户已删除');
      fetchUsers(pagination.current, pagination.pageSize, searchKeyword);
    } catch (err) {
      message.error(err.response?.data?.message || '删除用户失败');
    }
  };

  // ---- Columns ----
  const columns = [
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      width: 140,
      ellipsis: true,
    },
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
      width: 120,
      ellipsis: true,
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      width: 130,
      render: (role) => <Tag color={ROLE_COLOR_MAP[role] || 'default'}>{role}</Tag>,
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
      width: 200,
      ellipsis: true,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (status) => (
        <Tag color={status === 'active' ? 'green' : 'red'}>
          {status === 'active' ? '启用' : '禁用'}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 320,
      render: (_, record) => {
        const isSelf = currentUser && currentUser.user_id === record.user_id;
        return (
          <Space size="small" wrap>
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleOpenEdit(record)}
            >
              编辑
            </Button>
            <Popconfirm
              title="确认重置密码？"
              description="重置后将生成新的随机密码。"
              onConfirm={() => handleResetPassword(record)}
              okText="确认"
              cancelText="取消"
            >
              <Button type="link" size="small" icon={<KeyOutlined />} loading={resetPwdLoading}>
                重置密码
              </Button>
            </Popconfirm>
            {record.status === 'active' ? (
              <Popconfirm
                title="确认禁用该用户？"
                onConfirm={() => handleToggleStatus(record)}
                okText="确认"
                cancelText="取消"
              >
                <Button type="link" size="small" danger>
                  禁用
                </Button>
              </Popconfirm>
            ) : (
              <Popconfirm
                title="确认启用该用户？"
                onConfirm={() => handleToggleStatus(record)}
                okText="确认"
                cancelText="取消"
              >
                <Button type="link" size="small">
                  启用
                </Button>
              </Popconfirm>
            )}
            <Popconfirm
              title="确认删除该用户？"
              description={isSelf ? '不能删除自己的账号' : '此操作不可恢复。'}
              onConfirm={() => handleDelete(record)}
              okText="确认"
              cancelText="取消"
              disabled={isSelf}
            >
              <Button
                type="link"
                size="small"
                danger
                icon={<DeleteOutlined />}
                disabled={isSelf}
              >
                删除
              </Button>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card>
        {/* Top bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <Input.Search
            placeholder="搜索用户名、姓名或邮箱"
            allowClear
            onSearch={handleSearch}
            style={{ width: 360 }}
            prefix={<SearchOutlined />}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenCreate}>
            新建用户
          </Button>
        </div>

        {/* Table */}
        <Table
          rowKey="user_id"
          columns={columns}
          dataSource={dataSource}
          loading={loading}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条`,
          }}
          onChange={handleTableChange}
          locale={{ emptyText: '暂无用户数据' }}
          scroll={{ x: 1000 }}
        />
      </Card>

      {/* Create User Modal */}
      <Modal
        title="新建用户"
        open={createModalOpen}
        onOk={handleCreateSubmit}
        onCancel={() => setCreateModalOpen(false)}
        confirmLoading={createLoading}
        okText="创建"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" preserve={false}>
          <Form.Item
            name="username"
            label="用户名"
            rules={[
              { required: true, message: '请输入用户名' },
              { min: 3, max: 32, message: '用户名长度3-32位' },
              { pattern: /^[a-zA-Z][a-zA-Z0-9_]*$/, message: '以字母开头，仅含字母、数字、下划线' },
            ]}
          >
            <Input prefix={<UserOutlined />} placeholder="请输入用户名" />
          </Form.Item>
          <Form.Item
            name="name"
            label="姓名"
            rules={[{ required: true, message: '请输入姓名' }]}
          >
            <Input prefix={<UserOutlined />} placeholder="请输入姓名" />
          </Form.Item>
          <Form.Item
            name="role"
            label="角色"
            rules={[{ required: true, message: '请选择角色' }]}
          >
            <Select placeholder="请选择角色" options={ROLE_OPTIONS} />
          </Form.Item>
          <Form.Item
            name="email"
            label="邮箱"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '邮箱格式不正确' },
            ]}
          >
            <Input prefix={<MailOutlined />} placeholder="请输入邮箱" />
          </Form.Item>
          <Form.Item label="密码">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>自动生成密码</span>
              <Switch
                checked={autoGeneratePwd}
                onChange={setAutoGeneratePwd}
                checkedChildren="开"
                unCheckedChildren="关"
              />
            </div>
          </Form.Item>
          {!autoGeneratePwd && (
            <Form.Item
              name="password"
              label="密码"
              rules={[
                { required: true, message: '请输入密码' },
                { min: 8, message: '密码至少8位' },
              ]}
            >
              <Input.Password prefix={<LockOutlined />} placeholder="请输入密码" />
            </Form.Item>
          )}
        </Form>
      </Modal>

      {/* Edit User Modal */}
      <Modal
        title="编辑用户"
        open={editModalOpen}
        onOk={handleEditSubmit}
        onCancel={() => setEditModalOpen(false)}
        confirmLoading={editLoading}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" preserve={false}>
          <Form.Item
            name="name"
            label="姓名"
            rules={[{ required: true, message: '请输入姓名' }]}
          >
            <Input prefix={<UserOutlined />} placeholder="请输入姓名" />
          </Form.Item>
          <Form.Item
            name="role"
            label="角色"
            rules={[{ required: true, message: '请选择角色' }]}
          >
            <Select placeholder="请选择角色" options={ROLE_OPTIONS} />
          </Form.Item>
          <Form.Item
            name="email"
            label="邮箱"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '邮箱格式不正确' },
            ]}
          >
            <Input prefix={<MailOutlined />} placeholder="请输入邮箱" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Reset Password Result Modal */}
      <Modal
        title="密码重置"
        open={resetPwdModalOpen}
        onOk={() => setResetPwdModalOpen(false)}
        onCancel={() => setResetPwdModalOpen(false)}
        okText="我知道了"
        cancelButtonProps={{ style: { display: 'none' } }}
      >
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <p style={{ marginBottom: 8, color: '#666' }}>新密码已生成，请妥善保管：</p>
          <div
            style={{
              fontSize: 20,
              fontWeight: 'bold',
              fontFamily: 'monospace',
              background: '#f5f5f5',
              padding: '12px 24px',
              borderRadius: 6,
              letterSpacing: 2,
              userSelect: 'all',
            }}
          >
            {newPassword}
          </div>
          <p style={{ marginTop: 12, color: '#ff4d4f', fontSize: 12 }}>
            此密码仅显示一次，请立即复制保存
          </p>
        </div>
      </Modal>
    </div>
  );
};

export default UsersPage;