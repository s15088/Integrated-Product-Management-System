import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import {
  Table, Modal, Form, Select, Input, Tag, Space, Button, Popconfirm, message,
  TreeSelect, Card, Spin, Empty, Typography, Row, Col,
} from 'antd';
import {
  PlusOutlined, ReloadOutlined, SearchOutlined, EditOutlined, DeleteOutlined,
  EyeOutlined, AppstoreOutlined,
} from '@ant-design/icons';

const { Title } = Typography;
const { Option } = Select;

const STATUS_MAP = {
  '规划中': { label: '规划中', color: 'default' },
  '开发中': { label: '开发中', color: 'processing' },
  '已发布': { label: '已发布', color: 'success' },
  '停止维护': { label: '停止维护', color: 'warning' },
};

const PRODUCT_TYPE_OPTIONS = ['软件产品', '硬件产品', '服务'];

const DEFAULT_PAGE_SIZE = 10;

const ProductsPage = () => {
  const navigate = useNavigate();
  const [form] = Form.useForm();

  const [pageLoading, setPageLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState(null);

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [users, setUsers] = useState([]);

  const [pagination, setPagination] = useState({ current: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0 });

  const [filters, setFilters] = useState({ status: undefined, type: undefined, category_id: undefined, search: '' });

  const [modalVisible, setModalVisible] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

  const buildCategoryTree = useCallback((list) => {
    if (!list || list.length === 0) return [];
    const map = {};
    const roots = [];
    list.forEach((item) => {
      map[item.category_id] = { ...item, value: item.category_id, title: item.category_name, key: item.category_id, children: [] };
    });
    list.forEach((item) => {
      if (item.parent_id && map[item.parent_id]) {
        map[item.parent_id].children.push(map[item.category_id]);
      } else {
        roots.push(map[item.category_id]);
      }
    });
    const clean = (nodes) => {
      nodes.forEach((node) => {
        if (node.children && node.children.length === 0) delete node.children;
        else if (node.children && node.children.length > 0) clean(node.children);
      });
    };
    clean(roots);
    return roots;
  }, []);

  const categoryTree = buildCategoryTree(categories);

  const fetchProducts = useCallback(async (page = 1, pageSize = DEFAULT_PAGE_SIZE) => {
    setTableLoading(true);
    try {
      const params = { page, pageSize };
      if (filters.status) params.status = filters.status;
      if (filters.type) params.type = filters.type;
      if (filters.category_id) params.category_id = filters.category_id;
      if (filters.search) params.search = filters.search;

      const res = await axios.get('/api/products', { params });
      const data = res.data || {};
      const items = data.items || [];
      const total = data.total || 0;

      setProducts(items);
      setPagination({ current: data.page || page, pageSize: data.pageSize || pageSize, total });
    } catch (err) {
      message.error(err?.response?.data?.error || '获取产品列表失败');
    } finally {
      setTableLoading(false);
    }
  }, [filters]);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await axios.get('/api/products/categories/all');
      setCategories(Array.isArray(res.data) ? res.data : []);
    } catch (err) { /* silent */ }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await axios.get('/api/system/users/simple');
      setUsers(res.data?.items || []);
    } catch (err) { /* silent */ }
  }, []);

  const fetchAllData = useCallback(async () => {
    setPageLoading(true);
    setError(null);
    await Promise.all([fetchCategories(), fetchUsers()]);
    await fetchProducts();
    setPageLoading(false);
  }, [fetchCategories, fetchUsers, fetchProducts]);

  useEffect(() => { fetchAllData(); }, []); // eslint-disable-line

  useEffect(() => {
    if (!pageLoading) fetchProducts(1, pagination.pageSize);
  }, [filters]); // eslint-disable-line

  const handleTableChange = useCallback((pag) => { fetchProducts(pag.current, pag.pageSize); }, [fetchProducts]);

  const handleFilterChange = useCallback((key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSearch = useCallback((value) => {
    setFilters((prev) => ({ ...prev, search: value }));
  }, []);

  const handleRefresh = useCallback(() => {
    fetchProducts(pagination.current, pagination.pageSize);
    fetchCategories();
    fetchUsers();
  }, [fetchProducts, fetchCategories, fetchUsers, pagination]);

  const handleOpenCreate = useCallback(() => {
    setEditingProduct(null);
    form.resetFields();
    setModalVisible(true);
  }, [form]);

  const handleOpenEdit = useCallback((record) => {
    setEditingProduct(record);
    form.setFieldsValue({
      product_code: record.product_code,
      product_name: record.product_name,
      product_type: record.product_type,
      category_id: record.category_id,
      owner: record.owner,
      status: record.status,
      description: record.description,
    });
    setModalVisible(true);
  }, [form]);

  const handleModalCancel = useCallback(() => {
    setModalVisible(false);
    setEditingProduct(null);
    form.resetFields();
  }, [form]);

  const handleSubmit = useCallback(async () => {
    try {
      const values = await form.validateFields();
      setSubmitLoading(true);
      if (editingProduct) {
        await axios.put(`/api/products/${editingProduct.product_id}`, values);
        message.success('产品更新成功');
      } else {
        await axios.post('/api/products', values);
        message.success('产品创建成功');
      }
      setModalVisible(false);
      setEditingProduct(null);
      form.resetFields();
      fetchProducts(pagination.current, pagination.pageSize);
    } catch (err) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.error || '操作失败');
    } finally {
      setSubmitLoading(false);
    }
  }, [form, editingProduct, fetchProducts, pagination]);

  const handleDelete = useCallback(async (record) => {
    try {
      await axios.delete(`/api/products/${record.product_id}`);
      message.success('产品删除成功');
      const newPage = products.length === 1 && pagination.current > 1 ? pagination.current - 1 : pagination.current;
      fetchProducts(newPage, pagination.pageSize);
    } catch (err) {
      message.error(err?.response?.data?.error || '删除失败');
    }
  }, [products, pagination, fetchProducts]);

  const columns = [
    { title: '产品编码', dataIndex: 'product_code', key: 'product_code', width: 120, ellipsis: true },
    {
      title: '产品名称', dataIndex: 'product_name', key: 'product_name', width: 180, ellipsis: true,
      render: (text, record) => (
        <a onClick={(e) => { e.stopPropagation(); navigate(`/products/${record.product_id}`); }}>{text}</a>
      ),
    },
    {
      title: '类型', dataIndex: 'product_type', key: 'product_type', width: 100,
      render: (val) => val ? <Tag>{val}</Tag> : '-',
    },
    {
      title: '产品分类', dataIndex: 'category_name', key: 'category_name', width: 120,
      render: (val) => val ? <Tag>{val}</Tag> : '-',
    },
    {
      title: '负责人', dataIndex: 'owner_name', key: 'owner_name', width: 100,
      render: (val) => val || '-',
    },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 100,
      render: (val) => {
        const cfg = STATUS_MAP[val];
        return cfg ? <Tag color={cfg.color}>{cfg.label}</Tag> : <span>{val || '-'}</span>;
      },
    },
    { title: '版本数', dataIndex: 'version_count', key: 'version_count', width: 80, align: 'center', render: (val) => val ?? 0 },
    { title: '需求数', dataIndex: 'requirement_count', key: 'requirement_count', width: 80, align: 'center', render: (val) => val ?? 0 },
    { title: '问题单数', dataIndex: 'issue_count', key: 'issue_count', width: 90, align: 'center', render: (val) => val ?? 0 },
    {
      title: '更新时间', dataIndex: 'updated_at', key: 'updated_at', width: 170,
      render: (val) => val ? dayjs(val).format('YYYY-MM-DD HH:mm:ss') : '-',
    },
    {
      title: '操作', key: 'actions', width: 200, fixed: 'right',
      render: (_, record) => (
        <Space size="small" onClick={(e) => e.stopPropagation()}>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => navigate(`/products/${record.product_id}`)}>详情</Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleOpenEdit(record)}>编辑</Button>
          {record.status === '已发布' ? (
            <Button type="link" size="small" danger icon={<DeleteOutlined />} disabled>删除</Button>
          ) : (
            <Popconfirm title="确定要删除该产品吗？" onConfirm={() => handleDelete(record)} okText="确定" cancelText="取消">
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  if (pageLoading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh', flexDirection: 'column', gap: 16 }}>
      <Spin size="large" /><Typography.Text type="secondary">正在加载产品数据...</Typography.Text>
    </div>;
  }

  if (error && !tableLoading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh', flexDirection: 'column', gap: 16 }}>
      <Empty description={error}><Button type="primary" onClick={fetchAllData}>重新加载</Button></Empty>
    </div>;
  }

  return (
    <div style={{ padding: '0 0 24px' }}>
      <div style={{ marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}><AppstoreOutlined style={{ marginRight: 8, color: '#1677FF' }} />产品管理</Title>
      </div>

      <Card style={{ marginBottom: 16, borderRadius: 8 }} bodyStyle={{ padding: '16px 24px' }}>
        <Row gutter={[16, 12]} align="middle">
          <Col>
            <Space><Typography.Text type="secondary">状态</Typography.Text>
              <Select value={filters.status} onChange={(val) => handleFilterChange('status', val)} allowClear placeholder="全部状态" style={{ width: 140 }}>
                {Object.entries(STATUS_MAP).map(([key, cfg]) => <Option key={key} value={key}>{cfg.label}</Option>)}
              </Select>
            </Space>
          </Col>
          <Col>
            <Space><Typography.Text type="secondary">产品类型</Typography.Text>
              <Select value={filters.type} onChange={(val) => handleFilterChange('type', val)} allowClear placeholder="全部类型" style={{ width: 140 }}>
                {PRODUCT_TYPE_OPTIONS.map((t) => <Option key={t} value={t}>{t}</Option>)}
              </Select>
            </Space>
          </Col>
          <Col>
            <Space><Typography.Text type="secondary">产品分类</Typography.Text>
              <TreeSelect value={filters.category_id} onChange={(val) => handleFilterChange('category_id', val)} allowClear placeholder="全部分类" treeData={categoryTree} style={{ width: 200 }} />
            </Space>
          </Col>
          <Col>
            <Input.Search placeholder="搜索产品名称/编码" value={filters.search} onChange={(e) => handleFilterChange('search', e.target.value)} onSearch={handleSearch} allowClear style={{ width: 240 }} />
          </Col>
          <Col flex="auto" style={{ textAlign: 'right' }}>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={handleRefresh}>刷新</Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenCreate}>新建产品</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Card style={{ borderRadius: 8 }} bodyStyle={{ padding: '0 24px 24px' }}>
        <Table
          dataSource={products}
          columns={columns}
          rowKey="product_id"
          loading={tableLoading}
          pagination={{
            current: pagination.current, pageSize: pagination.pageSize, total: pagination.total,
            showSizeChanger: true, pageSizeOptions: ['10', '20', '50'],
            showTotal: (total, range) => `共 ${total} 条，当前 ${range[0]}-${range[1]}`,
          }}
          onChange={handleTableChange}
          onRow={(record) => ({ onClick: () => navigate(`/products/${record.product_id}`), style: { cursor: 'pointer' } })}
          scroll={{ x: 1400 }}
          locale={{ emptyText: <Empty description="暂无产品数据" /> }}
        />
      </Card>

      <Modal title={editingProduct ? '编辑产品' : '新建产品'} open={modalVisible} onCancel={handleModalCancel} onOk={handleSubmit} confirmLoading={submitLoading} destroyOnClose width={640} okText="保存" cancelText="取消">
        <Form form={form} layout="vertical" style={{ marginTop: 16 }} initialValues={{ status: '规划中' }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="product_code" label="产品编码" rules={[{ required: true, message: '请输入产品编码' }]}>
                <Input placeholder="请输入产品编码" maxLength={50} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="product_name" label="产品名称" rules={[{ required: true, message: '请输入产品名称' }]}>
                <Input placeholder="请输入产品名称" maxLength={100} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="product_type" label="产品类型" rules={[{ required: true, message: '请选择产品类型' }]}>
                <Select placeholder="请选择产品类型">
                  {PRODUCT_TYPE_OPTIONS.map((t) => <Option key={t} value={t}>{t}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="category_id" label="产品分类">
                <TreeSelect placeholder="请选择产品分类" treeData={categoryTree} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="owner" label="负责人">
                <Select placeholder="请选择负责人" showSearch filterOption={(input, option) => (option?.children ?? '').toLowerCase().includes(input.toLowerCase())}>
                  {users.map((user) => <Option key={user.user_id} value={user.user_id}>{user.username || user.name}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="status" label="状态" rules={[{ required: true, message: '请选择状态' }]}>
                <Select placeholder="请选择状态">
                  {Object.entries(STATUS_MAP).map(([key, cfg]) => <Option key={key} value={key}>{cfg.label}</Option>)}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item name="description" label="描述">
                <Input.TextArea placeholder="请输入产品描述" rows={4} maxLength={500} showCount />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
};

export default ProductsPage;