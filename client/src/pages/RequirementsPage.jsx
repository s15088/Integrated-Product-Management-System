import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import {
  Table,
  Modal,
  Form,
  Select,
  Input,
  Tag,
  Space,
  Button,
  message,
  TreeSelect,
  Card,
  Spin,
  Empty,
  Typography,
  Row,
  Col,
  Upload,
  DatePicker,
  Alert,
  Descriptions,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  UploadOutlined,
  EyeOutlined,
  FormOutlined,
  BranchesOutlined,
  FileExcelOutlined,
  InboxOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
  DownloadOutlined,
} from '@ant-design/icons';

const { Title, Text } = Typography;
const { Option } = Select;
const { Search } = Input;
const { Dragger } = Upload;

// ==================== 常量 ====================

const STATUS_MAP = {
  '待评估': { label: '待评估', color: 'default' },
  '评估待审批': { label: '评估待审批', color: 'blue' },
  '已规划': { label: '已规划', color: 'blue' },
  '开发中': { label: '开发中', color: 'blue' },
  '测试中': { label: '测试中', color: 'orange' },
  '已实现': { label: '已实现', color: 'green' },
  '已关闭': { label: '已关闭', color: 'default' },
  '已拒绝': { label: '已拒绝', color: 'red' },
};

const PRIORITY_MAP = {
  '高': { label: '高', color: 'red' },
  '中': { label: '中', color: 'orange' },
  '低': { label: '低', color: 'green' },
};

const SOURCE_MAP = {
  '内部': { label: '内部', color: 'blue' },
  '客户': { label: '客户', color: 'green' },
  '市场': { label: '市场', color: 'purple' },
};

const DEFAULT_PAGE_SIZE = 10;

// ==================== 组件 ====================

const RequirementsPage = () => {
  const navigate = useNavigate();
  const [form] = Form.useForm();

  // ---------- 请求状态 ----------
  const [pageLoading, setPageLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [error, setError] = useState(null);

  // ---------- 数据 ----------
  const [requirements, setRequirements] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [users, setUsers] = useState([]);

  // ---------- 分页 ----------
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    total: 0,
  });

  // ---------- 筛选条件 ----------
  const [filters, setFilters] = useState({
    status: [],
    priority: undefined,
    product_id: undefined,
    category_id: undefined,
    keyword: '',
  });

  // ---------- 弹窗 ----------
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [importModalVisible, setImportModalVisible] = useState(false);

  // ---------- 导入 ----------
  const [importFile, setImportFile] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [importStep, setImportStep] = useState('upload'); // upload | result | importing

  // ==================== 构建树形分类数据 ====================

  const buildCategoryTree = useCallback((list) => {
    if (!list || list.length === 0) return [];
    const map = {};
    const roots = [];
    list.forEach((item) => {
      map[item.category_id] = { ...item, value: item.category_id, title: item.category_name, children: [] };
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

  const fetchRequirements = useCallback(async (page = 1, pageSize = DEFAULT_PAGE_SIZE) => {
    setTableLoading(true);
    try {
      const params = {
        page,
        pageSize,
      };
      if (filters.status && filters.status.length > 0) params.status = filters.status.join(',');
      if (filters.priority) params.priority = filters.priority;
      if (filters.product_id) params.product_id = filters.product_id;
      if (filters.category_id) params.category_id = filters.category_id;
      if (filters.keyword) params.search = filters.keyword;

      const res = await axios.get('/api/requirements', { params });
      const data = res.data || {};
      const list = data.items || [];
      const total = data.total ?? 0;

      setRequirements(list);
      setPagination((prev) => ({
        ...prev,
        current: page,
        pageSize,
        total,
      }));
    } catch (err) {
      const errorMsg = err?.response?.data?.message || err?.message || '获取需求列表失败';
      message.error(errorMsg);
      setError(errorMsg);
    } finally {
      setTableLoading(false);
    }
  }, [filters]);

  const fetchProducts = useCallback(async () => {
    try {
      const res = await axios.get('/api/products', { params: { pageSize: 9999 } });
      const data = res.data || {};
      setProducts(data.items || []);
    } catch (err) {
      const errorMsg = err?.response?.data?.message || err?.message || '获取产品列表失败';
      message.error(errorMsg);
    }
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await axios.get('/api/products/categories/all');
      const data = res.data || {};
      setCategories(Array.isArray(data) ? data : (data.items || []));
    } catch (err) {
      const errorMsg = err?.response?.data?.message || err?.message || '获取分类数据失败';
      message.error(errorMsg);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await axios.get('/api/system/users/simple');
      const data = res.data || {};
      setUsers(data.items || []);
    } catch (err) {
      const errorMsg = err?.response?.data?.message || err?.message || '获取用户列表失败';
      message.error(errorMsg);
    }
  }, []);

  const fetchAllData = useCallback(async () => {
    setPageLoading(true);
    setError(null);
    await Promise.all([fetchProducts(), fetchCategories(), fetchUsers()]);
    await fetchRequirements();
    setPageLoading(false);
  }, [fetchProducts, fetchCategories, fetchUsers, fetchRequirements]);

  useEffect(() => {
    fetchAllData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- 筛选条件变化时重新请求 ----------
  useEffect(() => {
    if (!pageLoading) {
      fetchRequirements(1, pagination.pageSize);
    }
  }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

  // ==================== 操作处理 ====================

  const handleTableChange = useCallback(
    (pag) => {
      fetchRequirements(pag.current, pag.pageSize);
    },
    [fetchRequirements],
  );

  const handleFilterChange = useCallback((key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSearch = useCallback((value) => {
    setFilters((prev) => ({ ...prev, keyword: value }));
  }, []);

  const handleRefresh = useCallback(() => {
    fetchRequirements(pagination.current, pagination.pageSize);
    fetchProducts();
    fetchCategories();
    fetchUsers();
  }, [fetchRequirements, fetchProducts, fetchCategories, fetchUsers, pagination]);

  // ---------- 行点击跳转 ----------

  const handleRowClick = useCallback(
    (record) => {
      navigate(`/requirements/${record.requirement_id}`);
    },
    [navigate],
  );

  // ---------- 新建需求 ----------

  const handleOpenCreate = useCallback(() => {
    form.resetFields();
    setCreateModalVisible(true);
  }, [form]);

  const handleCreateCancel = useCallback(() => {
    setCreateModalVisible(false);
    form.resetFields();
  }, [form]);

  const handleCreateSubmit = useCallback(async () => {
    try {
      const values = await form.validateFields();
      setSubmitLoading(true);

      const payload = { ...values };
      if (payload.expected_date) {
        payload.expected_date = dayjs(payload.expected_date).format('YYYY-MM-DD');
      }

      await axios.post('/api/requirements', payload);
      message.success('需求创建成功');
      setCreateModalVisible(false);
      form.resetFields();
      fetchRequirements(pagination.current, pagination.pageSize);
    } catch (err) {
      if (err?.errorFields) {
        return;
      }
      const errorMsg = err?.response?.data?.message || err?.message || '创建需求失败';
      message.error(errorMsg);
    } finally {
      setSubmitLoading(false);
    }
  }, [form, fetchRequirements, pagination]);

  // ---------- 批量导入 ----------

  const handleOpenImport = useCallback(() => {
    setImportFile(null);
    setImportResult(null);
    setImportStep('upload');
    setImportModalVisible(true);
  }, []);

  const handleImportCancel = useCallback(() => {
    setImportModalVisible(false);
    setImportFile(null);
    setImportResult(null);
    setImportStep('upload');
  }, []);

  const handleUploadChange = useCallback((info) => {
    const { file } = info;
    if (file.status === 'removed') {
      setImportFile(null);
      setImportResult(null);
      setImportStep('upload');
      return;
    }
    if (file.status === 'done' || file.originFileObj) {
      setImportFile(file.originFileObj || file);
    }
  }, []);

  const handleBeforeUpload = useCallback((file) => {
    const isExcel =
      file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.type === 'application/vnd.ms-excel' ||
      file.name.endsWith('.xlsx') ||
      file.name.endsWith('.xls');
    if (!isExcel) {
      message.error('仅支持上传 Excel 文件（.xlsx 或 .xls）');
      return Upload.LIST_IGNORE;
    }
    const isLt10M = file.size / 1024 / 1024 < 10;
    if (!isLt10M) {
      message.error('文件大小不能超过 10MB');
      return Upload.LIST_IGNORE;
    }
    return false;
  }, []);

  const handleValidateImport = useCallback(async () => {
    if (!importFile) {
      message.warning('请先选择要上传的 Excel 文件');
      return;
    }
    setImportLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', importFile);

      const res = await axios.post('/api/requirements/import/validate', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const data = res.data || {};
      setImportResult(data);
      setImportStep('result');
    } catch (err) {
      const errorMsg = err?.response?.data?.message || err?.message || '文件校验失败';
      message.error(errorMsg);
    } finally {
      setImportLoading(false);
    }
  }, [importFile]);

  const handleConfirmImport = useCallback(async () => {
    if (!importFile) {
      message.warning('请先选择要上传的 Excel 文件');
      return;
    }
    setImportLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', importFile);

      const res = await axios.post('/api/requirements/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const data = res.data || {};

      const successCount = data.success_count ?? data.imported ?? 0;
      const failCount = data.fail_count ?? data.failed ?? 0;

      message.success(`导入完成：成功 ${successCount} 条，失败 ${failCount} 条`);
      setImportModalVisible(false);
      setImportFile(null);
      setImportResult(null);
      setImportStep('upload');
      fetchRequirements(1, pagination.pageSize);
    } catch (err) {
      const errorMsg = err?.response?.data?.message || err?.message || '导入失败';
      message.error(errorMsg);
    } finally {
      setImportLoading(false);
    }
  }, [importFile, fetchRequirements, pagination]);

  // ==================== 表格列定义 ====================

  const columns = [
    {
      title: '编号',
      dataIndex: 'requirement_code',
      key: 'requirement_code',
      width: 120,
      ellipsis: true,
      render: (val) => val || '-',
    },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      width: 240,
      ellipsis: true,
      render: (text, record) => (
        <a
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/requirements/${record.requirement_id}`);
          }}
        >
          {text || '-'}
        </a>
      ),
    },
    {
      title: '产品',
      dataIndex: 'product_name',
      key: 'product_name',
      width: 140,
      ellipsis: true,
      render: (val) => val || '-',
    },
    {
      title: '产品分类',
      dataIndex: 'category_name',
      key: 'category_name',
      width: 120,
      ellipsis: true,
      render: (val) => (val ? <Tag>{val}</Tag> : '-'),
    },
    {
      title: '模块',
      dataIndex: 'module',
      key: 'module',
      width: 120,
      ellipsis: true,
      render: (val) => val || '-',
    },
    {
      title: '来源',
      dataIndex: 'source',
      key: 'source',
      width: 80,
      render: (val) => {
        const cfg = SOURCE_MAP[val];
        return cfg ? <Tag color={cfg.color}>{cfg.label}</Tag> : <span>{val || '-'}</span>;
      },
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      width: 80,
      align: 'center',
      render: (val) => {
        const cfg = PRIORITY_MAP[val];
        return cfg ? <Tag color={cfg.color}>{cfg.label}</Tag> : <span>{val || '-'}</span>;
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (val) => {
        const cfg = STATUS_MAP[val];
        return cfg ? <Tag color={cfg.color}>{cfg.label}</Tag> : <span>{val || '-'}</span>;
      },
    },
    {
      title: '提出人',
      dataIndex: 'proposer_name',
      key: 'proposer_name',
      width: 100,
      ellipsis: true,
      render: (val) => val || '-',
    },
    {
      title: '合入版本',
      dataIndex: 'merged_versions',
      key: 'merged_versions',
      width: 180,
      render: (val) => {
        if (!val || !Array.isArray(val) || val.length === 0) return '-';
        return (
          <Space size={[4, 4]} wrap>
            {val.map((v) => (
              <Tag key={v.id || v.version_code || v} color="cyan">
                {v.version_code || v.version_name || v}
              </Tag>
            ))}
          </Space>
        );
      },
    },
    {
      title: '期望日期',
      dataIndex: 'expected_date',
      key: 'expected_date',
      width: 120,
      render: (val) => (val ? dayjs(val).format('YYYY-MM-DD') : '-'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 240,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small" onClick={(e) => e.stopPropagation()}>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/requirements/${record.requirement_id}`)}
          >
            详情
          </Button>
          <Button
            type="link"
            size="small"
            icon={<FormOutlined />}
            onClick={() => navigate(`/requirements/${record.requirement_id}?tab=evaluate`)}
          >
            评估
          </Button>
          <Button
            type="link"
            size="small"
            icon={<BranchesOutlined />}
            onClick={() => navigate(`/requirements/${record.requirement_id}?tab=version`)}
          >
            合入版本
          </Button>
        </Space>
      ),
    },
  ];

  // ==================== 渲染导入结果 ====================

  const renderImportResult = () => {
    if (!importResult) return null;

    const successRows = importResult.success_rows || importResult.success || [];
    const errorRows = importResult.error_rows || importResult.errors || [];
    const totalCount = successRows.length + errorRows.length;
    const successCount = successRows.length;
    const errorCount = errorRows.length;

    return (
      <div>
        <Alert
          type={errorCount > 0 ? 'warning' : 'success'}
          showIcon
          message={
            <Space>
              <span>校验完成</span>
              <Tag color="green" icon={<CheckCircleOutlined />}>
                成功 {successCount} 条
              </Tag>
              {errorCount > 0 && (
                <Tag color="red" icon={<CloseCircleOutlined />}>
                  失败 {errorCount} 条
                </Tag>
              )}
            </Space>
          }
          description={`共 ${totalCount} 条数据，其中 ${successCount} 条通过校验${
            errorCount > 0 ? `，${errorCount} 条存在错误` : ''
          }`}
          style={{ marginBottom: 16 }}
        />

        {errorRows.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <Text type="danger" strong style={{ display: 'block', marginBottom: 8 }}>
              <WarningOutlined /> 错误行详情：
            </Text>
            <Table
              dataSource={errorRows.map((row, index) => ({
                ...row,
                _key: index,
              }))}
              rowKey="_key"
              size="small"
              pagination={false}
              scroll={{ y: 200 }}
              columns={[
                {
                  title: '行号',
                  dataIndex: 'row',
                  key: 'row',
                  width: 70,
                  render: (val) => val ?? '-',
                },
                {
                  title: '标题',
                  dataIndex: 'title',
                  key: 'title',
                  width: 200,
                  ellipsis: true,
                  render: (val) => val || '-',
                },
                {
                  title: '错误信息',
                  dataIndex: 'error',
                  key: 'error',
                  render: (val) => (
                    <Text type="danger" style={{ fontSize: 12 }}>
                      {val || '-'}
                    </Text>
                  ),
                },
              ]}
            />
          </div>
        )}

        {successRows.length > 0 && (
          <div>
            <Text type="success" strong style={{ display: 'block', marginBottom: 8 }}>
              <CheckCircleOutlined /> 通过校验的行（前 5 条预览）：
            </Text>
            <Table
              dataSource={successRows.slice(0, 5).map((row, index) => ({
                ...row,
                _key: index,
              }))}
              rowKey="_key"
              size="small"
              pagination={false}
              scroll={{ y: 200 }}
              columns={[
                {
                  title: '行号',
                  dataIndex: 'row',
                  key: 'row',
                  width: 70,
                  render: (val) => val ?? '-',
                },
                {
                  title: '标题',
                  dataIndex: 'title',
                  key: 'title',
                  width: 200,
                  ellipsis: true,
                  render: (val) => val || '-',
                },
                {
                  title: '产品',
                  dataIndex: 'product_name',
                  key: 'product_name',
                  width: 120,
                  ellipsis: true,
                  render: (val) => val || '-',
                },
                {
                  title: '优先级',
                  dataIndex: 'priority',
                  key: 'priority',
                  width: 80,
                  render: (val) => val || '-',
                },
              ]}
            />
            {successRows.length > 5 && (
              <Text type="secondary" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
                仅显示前 5 条，共 {successRows.length} 条通过校验
              </Text>
            )}
          </div>
        )}
      </div>
    );
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
        <Text type="secondary">正在加载需求数据...</Text>
      </div>
    );
  }

  // ==================== 错误状态 ====================

  if (error && !tableLoading) {
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

  // ==================== 主渲染 ====================

  return (
    <div style={{ padding: '0 0 24px' }}>
      {/* 页面标题 */}
      <div style={{ marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          <FormOutlined style={{ marginRight: 8, color: '#1677FF' }} />
          需求管理
        </Title>
      </div>

      {/* 筛选栏 */}
      <Card style={{ marginBottom: 16, borderRadius: 8 }} bodyStyle={{ padding: '16px 24px' }}>
        <Row gutter={[16, 12]} align="middle">
          <Col>
            <Space>
              <Text type="secondary">状态</Text>
              <Select
                mode="multiple"
                value={filters.status}
                onChange={(val) => handleFilterChange('status', val)}
                allowClear
                placeholder="全部状态"
                style={{ width: 220 }}
                maxTagCount={2}
              >
                {Object.entries(STATUS_MAP).map(([key, cfg]) => (
                  <Option key={key} value={key}>
                    {cfg.label}
                  </Option>
                ))}
              </Select>
            </Space>
          </Col>

          <Col>
            <Space>
              <Text type="secondary">优先级</Text>
              <Select
                value={filters.priority}
                onChange={(val) => handleFilterChange('priority', val)}
                allowClear
                placeholder="全部优先级"
                style={{ width: 130 }}
              >
                {Object.entries(PRIORITY_MAP).map(([key, cfg]) => (
                  <Option key={key} value={key}>
                    {cfg.label}
                  </Option>
                ))}
              </Select>
            </Space>
          </Col>

          <Col>
            <Space>
              <Text type="secondary">产品</Text>
              <Select
                value={filters.product_id}
                onChange={(val) => handleFilterChange('product_id', val)}
                allowClear
                placeholder="全部产品"
                style={{ width: 180 }}
                showSearch
                filterOption={(input, option) =>
                  (option?.children ?? '').toLowerCase().includes(input.toLowerCase())
                }
              >
                {products.map((p) => (
                  <Option key={p.product_id} value={p.product_id}>
                    {p.product_name}
                  </Option>
                ))}
              </Select>
            </Space>
          </Col>

          <Col>
            <Space>
              <Text type="secondary">产品分类</Text>
              <TreeSelect
                value={filters.category_id}
                onChange={(val) => handleFilterChange('category_id', val)}
                allowClear
                placeholder="全部分类"
                treeData={categoryTree}
                style={{ width: 200 }}
                treeDefaultExpandAll={false}
                dropdownStyle={{ maxHeight: 400, overflow: 'auto' }}
              />
            </Space>
          </Col>

          <Col>
            <Search
              placeholder="搜索需求标题/编号"
              value={filters.keyword}
              onChange={(e) => handleFilterChange('keyword', e.target.value)}
              onSearch={handleSearch}
              allowClear
              style={{ width: 240 }}
              enterButton={<SearchOutlined />}
            />
          </Col>

          <Col flex="auto" style={{ textAlign: 'right' }}>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={handleRefresh}>
                刷新
              </Button>
              <Button icon={<UploadOutlined />} onClick={handleOpenImport}>
                批量导入
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenCreate}>
                新建需求
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 表格 */}
      <Card style={{ borderRadius: 8 }} bodyStyle={{ padding: '0 24px 24px' }}>
        <Table
          dataSource={requirements}
          columns={columns}
          rowKey="requirement_id"
          loading={tableLoading}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50'],
            showTotal: (total, range) => `共 ${total} 条，当前 ${range[0]}-${range[1]}`,
          }}
          onChange={handleTableChange}
          onRow={(record) => ({
            onClick: () => handleRowClick(record),
            style: { cursor: 'pointer' },
          })}
          scroll={{ x: 1700 }}
          locale={{
            emptyText: <Empty description="暂无需求数据" />,
          }}
        />
      </Card>

      {/* 新建需求弹窗 */}
      <Modal
        title="新建需求"
        open={createModalVisible}
        onCancel={handleCreateCancel}
        onOk={handleCreateSubmit}
        confirmLoading={submitLoading}
        destroyOnClose
        width={640}
        okText="创建"
        cancelText="取消"
      >
        <Form
          form={form}
          layout="vertical"
          style={{ marginTop: 16 }}
          initialValues={{
            priority: '中',
            source: '内部',
          }}
        >
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item
                name="title"
                label="需求标题"
                rules={[{ required: true, message: '请输入需求标题' }]}
              >
                <Input placeholder="请输入需求标题" maxLength={200} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="product_id"
                label="所属产品"
                rules={[{ required: true, message: '请选择所属产品' }]}
              >
                <Select
                  placeholder="请选择产品"
                  showSearch
                  filterOption={(input, option) =>
                    (option?.children ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                >
                  {products.map((p) => (
                    <Option key={p.product_id} value={p.product_id}>
                      {p.product_name}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="module" label="模块">
                <Input placeholder="请输入模块名称" maxLength={100} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="source"
                label="来源"
                rules={[{ required: true, message: '请选择来源' }]}
              >
                <Select placeholder="请选择来源">
                  {Object.entries(SOURCE_MAP).map(([key, cfg]) => (
                    <Option key={key} value={key}>
                      {cfg.label}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="proposer"
                label="提出人"
                rules={[{ required: true, message: '请选择提出人' }]}
              >
                <Select
                  placeholder="请选择提出人"
                  showSearch
                  filterOption={(input, option) =>
                    (option?.children ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                >
                  {users.map((user) => (
                    <Option key={user.user_id} value={user.user_id}>
                      {user.username || user.name || `用户${user.user_id}`}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="priority"
                label="优先级"
                rules={[{ required: true, message: '请选择优先级' }]}
              >
                <Select placeholder="请选择优先级">
                  {Object.entries(PRIORITY_MAP).map(([key, cfg]) => (
                    <Option key={key} value={key}>
                      {cfg.label}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="expected_date" label="期望日期">
                <DatePicker
                  placeholder="请选择期望日期"
                  style={{ width: '100%' }}
                  disabledDate={(current) => current && current < dayjs().startOf('day')}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={24}>
              <Form.Item name="description" label="需求描述">
                <Input.TextArea
                  placeholder="请输入需求描述"
                  rows={4}
                  maxLength={2000}
                  showCount
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* 批量导入弹窗 */}
      <Modal
        title="批量导入需求"
        open={importModalVisible}
        onCancel={handleImportCancel}
        width={720}
        footer={
          importStep === 'upload'
            ? [
                <Button key="cancel" onClick={handleImportCancel}>
                  取消
                </Button>,
                <Button
                  key="validate"
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  loading={importLoading}
                  disabled={!importFile}
                  onClick={handleValidateImport}
                >
                  校验文件
                </Button>,
              ]
            : importStep === 'result'
              ? [
                  <Button key="back" onClick={() => setImportStep('upload')}>
                    重新选择
                  </Button>,
                  <Button key="cancel" onClick={handleImportCancel}>
                    取消
                  </Button>,
                  <Button
                    key="confirm"
                    type="primary"
                    loading={importLoading}
                    onClick={handleConfirmImport}
                  >
                    确认导入
                  </Button>,
                ]
              : null
        }
        destroyOnClose
      >
        {importStep === 'upload' && (
          <div>
            <Alert
              type="info"
              showIcon
              message="导入说明"
              description="请上传 Excel 文件（.xlsx 或 .xls），文件大小不超过 10MB。第一行应为表头，包含标题、产品、模块、来源、优先级、提出人、期望日期、描述等列。"
              style={{ marginBottom: 16 }}
            />
            <div style={{ marginBottom: 12, textAlign: 'right' }}>
              <Button
                type="link"
                icon={<DownloadOutlined />}
                onClick={() => {
                  window.open('/api/requirements/import/template', '_blank');
                }}
              >
                下载导入模板
              </Button>
            </div>
            <Dragger
              accept=".xlsx,.xls"
              maxCount={1}
              beforeUpload={handleBeforeUpload}
              onChange={handleUploadChange}
              onRemove={() => {
                setImportFile(null);
                setImportResult(null);
              }}
              fileList={importFile ? [{ uid: '-1', name: importFile.name, status: 'done' }] : []}
              style={{ padding: '24px 0' }}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
              <p className="ant-upload-hint">支持 .xlsx、.xls 格式的 Excel 文件</p>
            </Dragger>
          </div>
        )}

        {importStep === 'result' && renderImportResult()}
      </Modal>
    </div>
  );
};

export default RequirementsPage;