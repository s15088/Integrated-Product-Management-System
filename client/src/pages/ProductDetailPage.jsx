import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import dayjs from 'dayjs';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Descriptions,
  Steps,
  Table,
  Card,
  Button,
  Tag,
  Space,
  Spin,
  Modal,
  Form,
  Input,
  Select,
  message,
  Empty,
  Typography,
  Row,
  Col,
  Divider,
  Result,
  TreeSelect,
} from 'antd';
import {
  ArrowLeftOutlined,
  EditOutlined,
  SwapOutlined,
  ReloadOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';

const { Title, Text } = Typography;
const { Option } = Select;

// ==================== 常量 ====================

const STATUS_MAP = {
  planning: { label: '规划中', color: 'default' },
  developing: { label: '开发中', color: 'processing' },
  released: { label: '已发布', color: 'success' },
  maintenance: { label: '停止维护', color: 'warning' },
};

const PRODUCT_TYPE_MAP = {
  software: { label: '软件产品', color: 'blue' },
  hardware: { label: '硬件产品', color: 'orange' },
  service: { label: '服务产品', color: 'purple' },
  platform: { label: '平台产品', color: 'cyan' },
};

const STATUS_FLOW = [
  { key: 'planning', title: '规划中' },
  { key: 'developing', title: '开发中' },
  { key: 'released', title: '已发布' },
  { key: 'maintenance', title: '停止维护' },
];

const STATUS_ORDER = STATUS_FLOW.map((s) => s.key);

const NEXT_STATUS_MAP = {
  planning: 'developing',
  developing: 'released',
  released: 'maintenance',
  maintenance: null,
};

const NEXT_STATUS_LABEL = {
  planning: '进入开发',
  developing: '发布上线',
  released: '停止维护',
  maintenance: null,
};

// ==================== 组件 ====================

const ProductDetailPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [form] = Form.useForm();

  // ---------- 请求状态 ----------
  const [pageLoading, setPageLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [transitionLoading, setTransitionLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);

  // ---------- 数据 ----------
  const [product, setProduct] = useState(null);
  const [versions, setVersions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [users, setUsers] = useState([]);

  // ---------- 弹窗 ----------
  const [editModalVisible, setEditModalVisible] = useState(false);

  // ==================== 构建树形分类数据 ====================

  const buildCategoryTree = useCallback((list) => {
    if (!list || list.length === 0) return [];
    const map = {};
    const roots = [];
    list.forEach((item) => {
      map[item.id] = { ...item, value: item.id, title: item.category_name || item.name, children: [] };
    });
    list.forEach((item) => {
      if (item.parent_id && map[item.parent_id]) {
        map[item.parent_id].children.push(map[item.id]);
      } else {
        roots.push(map[item.id]);
      }
    });
    const clean = (nodes) => {
      nodes.forEach((node) => {
        if (node.children && node.children.length === 0) {
          delete node.children;
        } else if (node.children && node.children.length > 0) {
          clean(node.children);
        }
      });
    };
    clean(roots);
    return roots;
  }, []);

  const categoryTree = buildCategoryTree(categories);

  // ==================== 数据获取 ====================

  const fetchProduct = useCallback(async () => {
    setDetailLoading(true);
    try {
      const res = await axios.get(`/api/products/${id}`);
      const data = res.data || {};
      setProduct(data.data || data);
      setNotFound(false);
    } catch (err) {
      if (err?.response?.status === 404) {
        setNotFound(true);
      } else {
        const errorMsg = err?.response?.data?.message || err?.message || '获取产品详情失败';
        message.error(errorMsg);
        setError(errorMsg);
      }
    } finally {
      setDetailLoading(false);
    }
  }, [id]);

  const fetchVersions = useCallback(async () => {
    setVersionsLoading(true);
    try {
      const res = await axios.get(`/api/products/${id}/versions`);
      const data = res.data || {};
      setVersions(data.list || data.data || []);
    } catch (err) {
      const errorMsg = err?.response?.data?.message || err?.message || '获取版本列表失败';
      message.error(errorMsg);
    } finally {
      setVersionsLoading(false);
    }
  }, [id]);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await axios.get('/api/products/categories/all');
      const data = res.data || {};
      setCategories(data.list || data.data || data || []);
    } catch {
      // 静默处理
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await axios.get('/api/system/users/simple');
      const data = res.data || {};
      setUsers(data.items || []);
    } catch {
      // 静默处理
    }
  }, []);

  const fetchAllData = useCallback(async () => {
    setPageLoading(true);
    setError(null);
    setNotFound(false);
    await Promise.all([fetchCategories(), fetchUsers()]);
    await Promise.all([fetchProduct(), fetchVersions()]);
    setPageLoading(false);
  }, [fetchProduct, fetchVersions, fetchCategories, fetchUsers]);

  useEffect(() => {
    fetchAllData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ==================== 编辑操作 ====================

  const handleOpenEdit = useCallback(() => {
    if (!product) return;
    form.setFieldsValue({
      product_code: product.product_code,
      product_name: product.product_name || product.name,
      product_type: product.product_type,
      category_id: product.category_id,
      owner: product.owner_id || product.owner,
      status: product.status,
      description: product.description,
    });
    setEditModalVisible(true);
  }, [product, form]);

  const handleEditCancel = useCallback(() => {
    setEditModalVisible(false);
    form.resetFields();
  }, [form]);

  const handleEditSubmit = useCallback(async () => {
    try {
      const values = await form.validateFields();
      setSubmitLoading(true);
      await axios.put(`/api/products/${id}`, values);
      message.success('产品更新成功');
      setEditModalVisible(false);
      form.resetFields();
      fetchProduct();
    } catch (err) {
      if (err?.errorFields) {
        return;
      }
      const errorMsg = err?.response?.data?.message || err?.message || '更新失败';
      message.error(errorMsg);
    } finally {
      setSubmitLoading(false);
    }
  }, [form, id, fetchProduct]);

  // ==================== 状态流转 ====================

  const currentStatusIndex = product
    ? STATUS_ORDER.indexOf(product.status)
    : -1;

  const nextStatus = product ? NEXT_STATUS_MAP[product.status] : null;
  const nextStatusLabel = product ? NEXT_STATUS_LABEL[product.status] : null;
  const canTransition = nextStatus !== null;

  const handleStatusTransition = useCallback(async () => {
    if (!nextStatus) return;
    setTransitionLoading(true);
    try {
      await axios.put(`/api/products/${id}/status`, {
        status: nextStatus,
      });
      message.success(`产品状态已变更为「${STATUS_MAP[nextStatus]?.label || nextStatus}」`);
      fetchProduct();
    } catch (err) {
      const errorMsg = err?.response?.data?.message || err?.message || '状态流转失败';
      message.error(errorMsg);
    } finally {
      setTransitionLoading(false);
    }
  }, [id, nextStatus, fetchProduct]);

  // ==================== 版本表格列定义 ====================

  const versionColumns = [
    {
      title: '版本号',
      dataIndex: 'version_code',
      key: 'version_code',
      width: 120,
      ellipsis: true,
    },
    {
      title: '版本名称',
      dataIndex: 'version_name',
      key: 'version_name',
      width: 180,
      ellipsis: true,
      render: (text) => text || '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (val) => {
        const cfg = STATUS_MAP[val];
        return cfg ? <Tag color={cfg.color}>{cfg.label}</Tag> : <span>{val || '-'}</span>;
      },
    },
    {
      title: '基线时间',
      dataIndex: 'baseline_date',
      key: 'baseline_date',
      width: 130,
      render: (val) => (val ? dayjs(val).format('YYYY-MM-DD') : '-'),
    },
    {
      title: '计划发布',
      dataIndex: 'planned_release_date',
      key: 'planned_release_date',
      width: 130,
      render: (val) => (val ? dayjs(val).format('YYYY-MM-DD') : '-'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 140,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            onClick={() => navigate(`/versions/${record.id}`)}
          >
            详情
          </Button>
          <Button
            type="link"
            size="small"
            onClick={() => navigate(`/versions/${record.id}/edit`)}
          >
            编辑
          </Button>
        </Space>
      ),
    },
  ];

  // ==================== 状态标签渲染 ====================

  const renderStatusTag = (status) => {
    const cfg = STATUS_MAP[status];
    return cfg ? <Tag color={cfg.color}>{cfg.label}</Tag> : <span>{status || '-'}</span>;
  };

  const renderProductTypeTag = (type) => {
    const cfg = PRODUCT_TYPE_MAP[type];
    return cfg ? <Tag color={cfg.color}>{cfg.label}</Tag> : <span>{type || '-'}</span>;
  };

  // ==================== 加载状态 ====================

  if (pageLoading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '60vh',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <Spin size="large" />
        <Text type="secondary">正在加载产品详情...</Text>
      </div>
    );
  }

  // ==================== 404 状态 ====================

  if (notFound) {
    return (
      <Result
        status="404"
        title="产品不存在"
        subTitle="未找到该产品，可能已被删除或链接无效。"
        extra={
          <Button type="primary" onClick={() => navigate('/products')}>
            返回产品列表
          </Button>
        }
      />
    );
  }

  // ==================== 错误状态 ====================

  if (error && !detailLoading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '60vh',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <Empty description={error}>
          <Button type="primary" onClick={fetchAllData}>
            重新加载
          </Button>
        </Empty>
      </div>
    );
  }

  // ==================== 产品数据为空 ====================

  if (!product && !detailLoading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '60vh',
        }}
      >
        <Empty description="暂无产品数据" />
      </div>
    );
  }

  // ==================== 主渲染 ====================

  return (
    <div style={{ padding: '0 0 24px' }}>
      {/* 返回按钮 */}
      <div style={{ marginBottom: 16 }}>
        <Button
          type="link"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/products')}
          style={{ padding: 0 }}
        >
          返回产品列表
        </Button>
      </div>

      {/* 顶部名称与操作区 */}
      <Card
        style={{ marginBottom: 16, borderRadius: 8 }}
        bodyStyle={{ padding: '20px 24px' }}
      >
        <Row justify="space-between" align="middle">
          <Col>
            <Space size={12} align="center">
              <AppstoreOutlined style={{ fontSize: 24, color: '#1677FF' }} />
              <Title level={3} style={{ margin: 0 }}>
                {product.product_name || product.name}
              </Title>
              {renderStatusTag(product.status)}
            </Space>
          </Col>
          <Col>
            <Space>
              <Button
                icon={<EditOutlined />}
                onClick={handleOpenEdit}
              >
                编辑
              </Button>
              {canTransition ? (
                <Button
                  type="primary"
                  icon={<SwapOutlined />}
                  onClick={handleStatusTransition}
                  loading={transitionLoading}
                >
                  {nextStatusLabel}
                </Button>
              ) : (
                <Button icon={<SwapOutlined />} disabled>
                  已是最终状态
                </Button>
              )}
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 产品信息与状态流转 */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          {/* 产品基本信息 */}
          <Card
            title="产品信息"
            style={{ borderRadius: 8 }}
            bodyStyle={{ padding: '24px' }}
          >
            <Spin spinning={detailLoading}>
              <Descriptions bordered column={{ xs: 1, sm: 2 }} size="middle">
                <Descriptions.Item label="产品编码">
                  {product.product_code || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="产品名称">
                  {product.product_name || product.name || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="产品类型">
                  {renderProductTypeTag(product.product_type)}
                </Descriptions.Item>
                <Descriptions.Item label="产品分类">
                  {product.category_name ? (
                    <Tag>{product.category_name}</Tag>
                  ) : (
                    '-'
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="负责人">
                  {product.owner_name || product.owner?.name || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="状态">
                  {renderStatusTag(product.status)}
                </Descriptions.Item>
                <Descriptions.Item label="版本数">
                  {product.version_count ?? 0}
                </Descriptions.Item>
                <Descriptions.Item label="需求数">
                  {product.requirement_count ?? 0}
                </Descriptions.Item>
                <Descriptions.Item label="创建时间">
                  {product.created_at
                    ? dayjs(product.created_at).format('YYYY-MM-DD HH:mm:ss')
                    : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="更新时间">
                  {product.updated_at
                    ? dayjs(product.updated_at).format('YYYY-MM-DD HH:mm:ss')
                    : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="描述" span={2}>
                  {product.description || '暂无描述'}
                </Descriptions.Item>
              </Descriptions>
            </Spin>
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          {/* 状态流转 */}
          <Card
            title="状态流转"
            style={{ borderRadius: 8 }}
            bodyStyle={{ padding: '24px' }}
          >
            <Steps
              direction="vertical"
              current={currentStatusIndex >= 0 ? currentStatusIndex : 0}
              size="small"
              items={STATUS_FLOW.map((s) => ({
                title: s.title,
                description:
                  product.status === s.key ? (
                    <Tag color={STATUS_MAP[s.key]?.color} style={{ marginTop: 4 }}>
                      当前状态
                    </Tag>
                  ) : null,
              }))}
            />
          </Card>
        </Col>
      </Row>

      {/* 关联版本列表 */}
      <Divider style={{ margin: '24px 0 16px' }} />

      <Card
        title={
          <Space>
            <span>关联版本</span>
            <Tag>{versions.length}</Tag>
          </Space>
        }
        extra={
          <Button
            type="link"
            icon={<ReloadOutlined />}
            onClick={fetchVersions}
            loading={versionsLoading}
          >
            刷新
          </Button>
        }
        style={{ borderRadius: 8 }}
        bodyStyle={{ padding: '0 24px 24px' }}
      >
        <Table
          dataSource={versions}
          columns={versionColumns}
          rowKey="id"
          loading={versionsLoading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50'],
            showTotal: (total, range) => `共 ${total} 条，当前 ${range[0]}-${range[1]}`,
          }}
          scroll={{ x: 800 }}
          locale={{
            emptyText: <Empty description="暂无关联版本" />,
          }}
        />
      </Card>

      {/* 编辑弹窗 */}
      <Modal
        title="编辑产品"
        open={editModalVisible}
        onCancel={handleEditCancel}
        onOk={handleEditSubmit}
        confirmLoading={submitLoading}
        destroyOnClose
        width={640}
        okText="保存"
        cancelText="取消"
      >
        <Form
          form={form}
          layout="vertical"
          style={{ marginTop: 16 }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="product_code"
                label="产品编码"
                rules={[{ required: true, message: '请输入产品编码' }]}
              >
                <Input placeholder="请输入产品编码" maxLength={50} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="product_name"
                label="产品名称"
                rules={[{ required: true, message: '请输入产品名称' }]}
              >
                <Input placeholder="请输入产品名称" maxLength={100} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="product_type"
                label="产品类型"
                rules={[{ required: true, message: '请选择产品类型' }]}
              >
                <Select placeholder="请选择产品类型">
                  {Object.entries(PRODUCT_TYPE_MAP).map(([key, cfg]) => (
                    <Option key={key} value={key}>
                      {cfg.label}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="category_id"
                label="产品分类"
                rules={[{ required: true, message: '请选择产品分类' }]}
              >
                <TreeSelect
                  placeholder="请选择产品分类"
                  treeData={categoryTree}
                  treeDefaultExpandAll={false}
                  dropdownStyle={{ maxHeight: 400, overflow: 'auto' }}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="owner"
                label="负责人"
                rules={[{ required: true, message: '请选择负责人' }]}
              >
                <Select
                  placeholder="请选择负责人"
                  showSearch
                  filterOption={(input, option) =>
                    (option?.children ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                >
                  {users.map((user) => (
                    <Option key={user.id} value={user.id}>
                      {user.username || user.real_name || user.name || `用户${user.id}`}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="status"
                label="状态"
                rules={[{ required: true, message: '请选择状态' }]}
              >
                <Select placeholder="请选择状态">
                  {Object.entries(STATUS_MAP).map(([key, cfg]) => (
                    <Option key={key} value={key}>
                      {cfg.label}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={24}>
              <Form.Item name="description" label="描述">
                <Input.TextArea
                  placeholder="请输入产品描述"
                  rows={4}
                  maxLength={500}
                  showCount
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
};

export default ProductDetailPage;