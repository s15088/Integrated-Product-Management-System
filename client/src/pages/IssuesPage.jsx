import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table,
  Button,
  Select,
  Input,
  Tag,
  Modal,
  Form,
  Space,
  Card,
  Row,
  Col,
  TreeSelect,
  Upload,
  message,
  Typography,
  Tooltip,
  Empty,
  Spin,
  Alert,
} from 'antd';
import {
  PlusOutlined,
  UploadOutlined,
  SearchOutlined,
  ReloadOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import axios from 'axios';

const { Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;

const SEVERITY_MAP = {
  '致命': { color: 'red', text: '致命' },
  '严重': { color: 'orange', text: '严重' },
  '一般': { color: 'yellow', text: '一般' },
  '提示': { color: 'blue', text: '提示' },
};

const STATUS_MAP = {
  '分析中': { color: 'blue', text: '分析中' },
  '分析待审批': { color: 'blue', text: '分析待审批' },
  '开发中': { color: 'blue', text: '开发中' },
  '复测中': { color: 'orange', text: '复测中' },
  '回归通过': { color: 'green', text: '回归通过' },
  '已关闭': { color: 'gray', text: '已关闭' },
};

const PRIORITY_MAP = {
  '紧急': { color: 'red', text: '紧急' },
  '高': { color: 'orange', text: '高' },
  '中': { color: 'blue', text: '中' },
  '低': { color: 'gray', text: '低' },
};

const TYPE_OPTIONS = ['缺陷', '优化', '咨询'];
const SEVERITY_OPTIONS = ['致命', '严重', '一般', '提示'];
const PRIORITY_OPTIONS = ['紧急', '高', '中', '低'];
const STATUS_OPTIONS = ['分析中', '分析待审批', '开发中', '复测中', '回归通过', '已关闭'];

const IssuesPage = () => {
  const navigate = useNavigate();

  // ---------- data ----------
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dataSource, setDataSource] = useState([]);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });

  // ---------- filters ----------
  const [filters, setFilters] = useState({
    status: undefined,
    severity: undefined,
    priority: undefined,
    product_id: undefined,
    type: undefined,
    category_ids: undefined,
    keyword: '',
  });

  // ---------- filter options ----------
  const [productOptions, setProductOptions] = useState([]);
  const [categoryTree, setCategoryTree] = useState([]);
  const [reporterOptions, setReporterOptions] = useState([]);

  // ---------- create modal ----------
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createForm] = Form.useForm();

  // ---------- import modal ----------
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importLoading, setImportLoading] = useState(false);

  // ---------- merge version modal ----------
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [mergeLoading, setMergeLoading] = useState(false);
  const [mergeForm] = Form.useForm();
  const [currentIssueId, setCurrentIssueId] = useState(null);
  const [versionOptions, setVersionOptions] = useState([]);

  // ========== fetch helpers ==========

  const fetchIssues = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        page: pagination.current,
        pageSize: pagination.pageSize,
      };
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '' && value !== false) {
          const backendKey = key === 'keyword' ? 'search' : key;
          params[backendKey] = value;
        }
      });
      const res = await axios.get('/api/issues', { params });
      const body = res.data;
      if (body && body.items) {
        setDataSource(body.items);
        setTotal(body.total || 0);
      } else if (Array.isArray(body)) {
        setDataSource(body);
        setTotal(body.length);
      } else {
        setDataSource([]);
        setTotal(0);
      }
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || '获取问题单列表失败';
      setError(msg);
      message.error(msg);
    } finally {
      setLoading(false);
    }
  }, [pagination, filters]);

  const fetchFilterOptions = useCallback(async () => {
    try {
      const [prodRes, catRes, userRes] = await Promise.allSettled([
        axios.get('/api/products', { params: { pageSize: 999 } }),
        axios.get('/api/products/categories/all'),
        axios.get('/api/system/users/simple'),
      ]);

      if (prodRes.status === 'fulfilled') {
        const pd = prodRes.value.data;
        setProductOptions(Array.isArray(pd?.items) ? pd.items : Array.isArray(pd) ? pd : []);
      }
      if (catRes.status === 'fulfilled') {
        const cd = catRes.value.data;
        const buildTree = (list) => {
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
        };
        setCategoryTree(buildTree(Array.isArray(cd) ? cd : []));
      }
      if (userRes.status === 'fulfilled') {
        const ud = userRes.value.data;
        setReporterOptions(Array.isArray(ud?.items) ? ud.items : Array.isArray(ud) ? ud : []);
      }
    } catch {
      // non-critical
    }
  }, []);

  const fetchVersionOptions = useCallback(async () => {
    try {
      const res = await axios.get('/api/versions', { params: { pageSize: 999 } });
      const vd = res.data;
      setVersionOptions(Array.isArray(vd?.items) ? vd.items : Array.isArray(vd) ? vd : []);
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    fetchIssues();
  }, [fetchIssues]);

  useEffect(() => {
    fetchFilterOptions();
  }, [fetchFilterOptions]);

  // ========== handlers ==========

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
    setPagination((prev) => ({ ...prev, current: 1 }));
  };

  const handleTableChange = (pag) => {
    setPagination({ current: pag.current, pageSize: pag.pageSize });
  };

  const handleSearch = (value) => {
    handleFilterChange('keyword', value);
  };

  const handleReset = () => {
    setFilters({
      status: undefined,
      severity: undefined,
      priority: undefined,
      product_id: undefined,
      type: undefined,
      category_ids: undefined,
      keyword: '',
    });
    setPagination({ current: 1, pageSize: 20 });
  };

  // ---------- create ----------
  const handleCreateSubmit = async () => {
    try {
      const values = await createForm.validateFields();
      setCreateLoading(true);
      await axios.post('/api/issues', values);
      message.success('问题单创建成功');
      setCreateModalOpen(false);
      createForm.resetFields();
      fetchIssues();
    } catch (err) {
      if (err?.errorFields) return;
      const msg = err?.response?.data?.message || err.message || '创建失败';
      message.error(msg);
    } finally {
      setCreateLoading(false);
    }
  };

  // ---------- import ----------
  const handleImportUpload = async () => {
    if (!importFile) {
      message.warning('请先选择 Excel 文件');
      return;
    }
    setImportLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      await axios.post('/api/issues/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      message.success('批量导入成功');
      setImportModalOpen(false);
      setImportFile(null);
      fetchIssues();
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || '导入失败';
      message.error(msg);
    } finally {
      setImportLoading(false);
    }
  };

  // ---------- merge version ----------
  const handleOpenMerge = (record) => {
    setCurrentIssueId(record.issue_id);
    setMergeModalOpen(true);
    fetchVersionOptions();
    mergeForm.resetFields();
  };

  const handleMergeSubmit = async () => {
    try {
      const values = await mergeForm.validateFields();
      setMergeLoading(true);
      await axios.post(`/api/issues/${currentIssueId}/merge`, values);
      message.success('合入版本成功');
      setMergeModalOpen(false);
      mergeForm.resetFields();
      fetchIssues();
    } catch (err) {
      if (err?.errorFields) return;
      const msg = err?.response?.data?.message || err.message || '操作失败';
      message.error(msg);
    } finally {
      setMergeLoading(false);
    }
  };

  // ========== columns ==========

  const columns = [
    {
      title: '编号',
      dataIndex: 'issue_code',
      key: 'issue_code',
      width: 120,
      render: (text) => <Text code>{text || '-'}</Text>,
    },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      render: (text) => (
        <Tooltip title={text}>
          <Text>{text || '-'}</Text>
        </Tooltip>
      ),
    },
    {
      title: '产品',
      dataIndex: 'product_name',
      key: 'product_name',
      width: 120,
      render: (text) => text || '-',
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 80,
      render: (text) => (text ? <Tag>{text}</Tag> : '-'),
    },
    {
      title: '严重度',
      dataIndex: 'severity',
      key: 'severity',
      width: 80,
      render: (text) => {
        const cfg = SEVERITY_MAP[text];
        return cfg ? <Tag color={cfg.color}>{cfg.text}</Tag> : text || '-';
      },
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      width: 80,
      render: (text) => {
        const cfg = PRIORITY_MAP[text];
        return cfg ? <Tag color={cfg.color}>{cfg.text}</Tag> : text || '-';
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (text) => {
        const cfg = STATUS_MAP[text];
        return cfg ? <Tag color={cfg.color}>{cfg.text}</Tag> : text || '-';
      },
    },
    {
      title: '报告人',
      dataIndex: 'reporter_name',
      key: 'reporter_name',
      width: 100,
      render: (text) => text || '-',
    },
    {
      title: '处理人',
      dataIndex: 'assignee_name',
      key: 'assignee_name',
      width: 100,
      render: (text) => text || '-',
    },
    {
      title: '合入版本',
      dataIndex: 'merged_versions',
      key: 'merged_versions',
      width: 180,
      render: (versions) => {
        if (!versions || !Array.isArray(versions) || versions.length === 0) return '-';
        return (
          <Space size={[0, 4]} wrap>
            {versions.map((v) => (
              <Tag key={v.id || v} color="cyan">
                {v.version_no || v}
              </Tag>
            ))}
          </Space>
        );
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 220,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button type="link" size="small" onClick={(e) => { e.stopPropagation(); navigate(`/issues/${record.issue_id}`); }}>
            详情
          </Button>
          <Button type="link" size="small" onClick={(e) => { e.stopPropagation(); navigate(`/issues/${record.issue_id}`); }}>
            分析
          </Button>
          <Button type="link" size="small" onClick={(e) => { e.stopPropagation(); handleOpenMerge(record); }}>
            合入版本
          </Button>
        </Space>
      ),
    },
  ];

  // ========== render helpers ==========

  const renderFilterBar = () => (
    <Card size="small" style={{ marginBottom: 16 }}>
      <Row gutter={[16, 12]}>
        <Col xs={24} sm={12} md={8} lg={6}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
            <Text strong>状态</Text>
            <Select
              allowClear
              placeholder="全部"
              style={{ flex: 1 }}
              value={filters.status}
              onChange={(v) => handleFilterChange('status', v)}
            >
              {STATUS_OPTIONS.map((s) => (
                <Option key={s} value={s}>{s}</Option>
              ))}
            </Select>
          </span>
        </Col>
        <Col xs={24} sm={12} md={8} lg={6}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
            <Text strong>严重度</Text>
            <Select
              allowClear
              placeholder="全部"
              style={{ flex: 1 }}
              value={filters.severity}
              onChange={(v) => handleFilterChange('severity', v)}
            >
              {SEVERITY_OPTIONS.map((s) => (
                <Option key={s} value={s}>{s}</Option>
              ))}
            </Select>
          </span>
        </Col>
        <Col xs={24} sm={12} md={8} lg={6}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
            <Text strong>优先级</Text>
            <Select
              allowClear
              placeholder="全部"
              style={{ flex: 1 }}
              value={filters.priority}
              onChange={(v) => handleFilterChange('priority', v)}
            >
              {PRIORITY_OPTIONS.map((s) => (
                <Option key={s} value={s}>{s}</Option>
              ))}
            </Select>
          </span>
        </Col>
        <Col xs={24} sm={12} md={8} lg={6}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
            <Text strong>产品</Text>
            <Select
              allowClear
              placeholder="全部"
              style={{ flex: 1 }}
              value={filters.product_id}
              onChange={(v) => handleFilterChange('product_id', v)}
            >
              {productOptions.map((p) => (
                <Option key={p.product_id} value={p.product_id}>{p.product_name}</Option>
              ))}
            </Select>
          </span>
        </Col>
        <Col xs={24} sm={12} md={8} lg={6}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
            <Text strong>类型</Text>
            <Select
              allowClear
              placeholder="全部"
              style={{ flex: 1 }}
              value={filters.type}
              onChange={(v) => handleFilterChange('type', v)}
            >
              {TYPE_OPTIONS.map((s) => (
                <Option key={s} value={s}>{s}</Option>
              ))}
            </Select>
          </span>
        </Col>
        <Col xs={24} sm={12} md={8} lg={6}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
            <Text strong>分类</Text>
            <TreeSelect
              allowClear
              showSearch
              placeholder="全部"
              style={{ flex: 1 }}
              treeDefaultExpandAll
              value={filters.category_ids}
              onChange={(v) => handleFilterChange('category_ids', v)}
              treeData={categoryTree}
              fieldNames={{ label: 'title', value: 'value', children: 'children' }}
              multiple
            />
          </span>
        </Col>
        <Col xs={24} sm={12} md={8} lg={6}>
          <Input.Search
            placeholder="搜索标题/编号"
            allowClear
            value={filters.keyword}
            onChange={(e) => setFilters((prev) => ({ ...prev, keyword: e.target.value }))}
            onSearch={handleSearch}
            enterButton={<SearchOutlined />}
          />
        </Col>
        <Col xs={24} sm={12} md={8} lg={6}>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={handleReset}>
              重置
            </Button>
          </Space>
        </Col>
      </Row>
    </Card>
  );

  const renderToolbar = () => (
    <Space style={{ marginBottom: 16 }}>
      <Button type="primary" icon={<PlusOutlined />} onClick={() => { setCreateModalOpen(true); createForm.resetFields(); }}>
        新建问题单
      </Button>
      <Button icon={<UploadOutlined />} onClick={() => { setImportModalOpen(true); setImportFile(null); }}>
        批量导入
      </Button>
    </Space>
  );

  const renderContent = () => {
    if (error) {
      return (
        <Alert
          type="error"
          message="加载失败"
          description={error}
          showIcon
          action={
            <Button size="small" onClick={fetchIssues}>
              重试
            </Button>
          }
        />
      );
    }
    if (loading && dataSource.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: 80 }}>
          <Spin size="large" tip="加载中..." />
        </div>
      );
    }
    if (!loading && dataSource.length === 0) {
      return <Empty description="暂无问题单数据" />;
    }
    return (
      <Table
        rowKey="issue_id"
        columns={columns}
        dataSource={dataSource}
        loading={loading}
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (t) => `共 ${t} 条`,
          pageSizeOptions: ['10', '20', '50', '100'],
        }}
        onChange={handleTableChange}
        scroll={{ x: 1400 }}
        onRow={(record) => ({
          onClick: () => navigate(`/issues/${record.issue_id}`),
          style: { cursor: 'pointer' },
        })}
        size="middle"
      />
    );
  };

  return (
    <div style={{ padding: 16 }}>
      <Typography.Title level={4} style={{ marginBottom: 16 }}>
        问题单管理
      </Typography.Title>

      {renderFilterBar()}
      {renderToolbar()}
      {renderContent()}

      {/* ---------- 新建问题单 Modal ---------- */}
      <Modal
        title="新建问题单"
        open={createModalOpen}
        onOk={handleCreateSubmit}
        onCancel={() => { setCreateModalOpen(false); createForm.resetFields(); }}
        confirmLoading={createLoading}
        width={640}
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" preserve={false}>
          <Form.Item
            name="title"
            label="标题"
            rules={[{ required: true, message: '请输入标题' }]}
          >
            <Input placeholder="请输入问题单标题" maxLength={200} />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="product_id"
                label="产品"
                rules={[{ required: true, message: '请选择产品' }]}
              >
                <Select placeholder="请选择产品" showSearch optionFilterProp="children">
                  {productOptions.map((p) => (
                    <Option key={p.product_id} value={p.product_id}>{p.product_name}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="type"
                label="类型"
                rules={[{ required: true, message: '请选择类型' }]}
              >
                <Select placeholder="请选择类型">
                  {TYPE_OPTIONS.map((t) => (
                    <Option key={t} value={t}>{t}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="severity"
                label="严重度"
                rules={[{ required: true, message: '请选择严重度' }]}
              >
                <Select placeholder="请选择严重度">
                  {SEVERITY_OPTIONS.map((s) => (
                    <Option key={s} value={s}>{s}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="priority"
                label="优先级"
                rules={[{ required: true, message: '请选择优先级' }]}
              >
                <Select placeholder="请选择优先级">
                  {PRIORITY_OPTIONS.map((s) => (
                    <Option key={s} value={s}>{s}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="reporter"
                label="报告人"
                rules={[{ required: true, message: '请选择报告人' }]}
              >
                <Select placeholder="请选择报告人" showSearch optionFilterProp="children">
                  {reporterOptions.map((u) => (
                    <Option key={u.user_id} value={u.user_id}>{u.name || u.username}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="module" label="模块">
                <Input placeholder="请输入模块名称" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="found_version" label="发现版本">
            <Input placeholder="请输入发现版本号" />
          </Form.Item>
          <Form.Item name="reproduce_steps" label="复现步骤">
            <TextArea rows={4} placeholder="请输入复现步骤" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <TextArea rows={4} placeholder="请输入问题描述" />
          </Form.Item>
        </Form>
      </Modal>

      {/* ---------- 批量导入 Modal ---------- */}
      <Modal
        title="批量导入问题单"
        open={importModalOpen}
        onOk={handleImportUpload}
        onCancel={() => { setImportModalOpen(false); setImportFile(null); }}
        confirmLoading={importLoading}
        destroyOnClose
      >
        <Upload
          accept=".xlsx,.xls"
          maxCount={1}
          beforeUpload={(file) => {
            setImportFile(file);
            return false;
          }}
          onRemove={() => setImportFile(null)}
          fileList={importFile ? [importFile] : []}
        >
          <Button icon={<UploadOutlined />}>选择 Excel 文件</Button>
        </Upload>
        <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
          支持 .xlsx / .xls 格式，请按模板格式上传
        </Text>
      </Modal>

      {/* ---------- 合入版本 Modal ---------- */}
      <Modal
        title="合入版本"
        open={mergeModalOpen}
        onOk={handleMergeSubmit}
        onCancel={() => { setMergeModalOpen(false); mergeForm.resetFields(); }}
        confirmLoading={mergeLoading}
        destroyOnClose
      >
        <Form form={mergeForm} layout="vertical" preserve={false}>
          <Form.Item
            name="version_ids"
            label="选择版本"
            rules={[{ required: true, message: '请选择至少一个版本' }]}
          >
            <Select mode="multiple" placeholder="请选择版本" showSearch optionFilterProp="children">
              {versionOptions.map((v) => (
                <Option key={v.version_id} value={v.version_id}>{v.version_no} - {v.version_name}</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="source_branch" label="来源分支">
            <Input placeholder="请输入来源分支名称" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default IssuesPage;