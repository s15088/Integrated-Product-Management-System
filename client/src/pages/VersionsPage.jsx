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
  DatePicker,
  message,
  Typography,
  Tooltip,
  Empty,
  Spin,
  Alert,
  Popconfirm,
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  ReloadOutlined,
  DeleteOutlined,
  EditOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';

const { Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;

const STATUS_MAP = {
  '规划中': { color: 'blue', text: '规划中' },
  '开发中': { color: 'blue', text: '开发中' },
  '已发布': { color: 'green', text: '已发布' },
  '已归档': { color: 'gray', text: '已归档' },
};

const STATUS_OPTIONS = ['规划中', '开发中', '已发布', '已归档'];

const VersionsPage = () => {
  const navigate = useNavigate();

  // ---------- data ----------
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dataSource, setDataSource] = useState([]);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });

  // ---------- filters ----------
  const [filters, setFilters] = useState({
    product_id: undefined,
    status: undefined,
    keyword: '',
  });

  // ---------- options ----------
  const [productOptions, setProductOptions] = useState([]);

  // ---------- create / edit modal ----------
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [form] = Form.useForm();
  const [editingRecord, setEditingRecord] = useState(null);

  // ========== fetch helpers ==========

  const fetchVersions = useCallback(async () => {
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
      const res = await axios.get('/api/versions', { params });
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
      const msg = err?.response?.data?.message || err.message || '获取版本列表失败';
      setError(msg);
      message.error(msg);
    } finally {
      setLoading(false);
    }
  }, [pagination, filters]);

  const fetchProductOptions = useCallback(async () => {
    try {
      const res = await axios.get('/api/products', { params: { pageSize: 999 } });
      const pd = res.data;
      setProductOptions(Array.isArray(pd?.items) ? pd.items : Array.isArray(pd) ? pd : []);
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  useEffect(() => {
    fetchProductOptions();
  }, [fetchProductOptions]);

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
    setFilters({ product_id: undefined, status: undefined, keyword: '' });
    setPagination({ current: 1, pageSize: 20 });
  };

  // ---------- create / edit ----------
  const handleOpenCreate = () => {
    setEditingRecord(null);
    setFormModalOpen(true);
    form.resetFields();
  };

  const handleOpenEdit = (record) => {
    setEditingRecord(record);
    setFormModalOpen(true);
    form.setFieldsValue({
      product_id: record.product_id,
      version_no: record.version_no,
      version_name: record.version_name,
      description: record.description,
      planned_release_date: record.planned_release_date ? dayjs(record.planned_release_date) : undefined,
      baseline_time: record.baseline_time ? dayjs(record.baseline_time) : undefined,
    });
  };

  const handleFormSubmit = async () => {
    try {
      const values = await form.validateFields();
      setFormLoading(true);

      const payload = { ...values };
      if (payload.planned_release_date && dayjs.isDayjs(payload.planned_release_date)) {
        payload.planned_release_date = payload.planned_release_date.format('YYYY-MM-DD');
      }
      if (payload.baseline_time && dayjs.isDayjs(payload.baseline_time)) {
        payload.baseline_time = payload.baseline_time.format('YYYY-MM-DD HH:mm:ss');
      }

      if (editingRecord) {
        await axios.put(`/api/versions/${editingRecord.version_id}`, payload);
        message.success('版本更新成功');
      } else {
        await axios.post('/api/versions', payload);
        message.success('版本创建成功');
      }
      setFormModalOpen(false);
      form.resetFields();
      setEditingRecord(null);
      fetchVersions();
    } catch (err) {
      if (err?.errorFields) return;
      const msg = err?.response?.data?.message || err.message || '操作失败';
      message.error(msg);
    } finally {
      setFormLoading(false);
    }
  };

  // ---------- archive ----------
  const handleArchive = async (record) => {
    try {
      await axios.post(`/api/versions/${record.version_id}/archive`);
      message.success('归档成功');
      fetchVersions();
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || '归档失败';
      message.error(msg);
    }
  };

  // ---------- delete ----------
  const handleDelete = async (record) => {
    try {
      await axios.delete(`/api/versions/${record.version_id}`);
      message.success('删除成功');
      fetchVersions();
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || '删除失败';
      message.error(msg);
    }
  };

  // ========== columns ==========

  const columns = [
    {
      title: '版本号',
      dataIndex: 'version_no',
      key: 'version_no',
      width: 120,
      render: (text) => <Text code>{text || '-'}</Text>,
    },
    {
      title: '版本名称',
      dataIndex: 'version_name',
      key: 'version_name',
      width: 160,
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
      title: '产品分类',
      dataIndex: 'product_category',
      key: 'product_category',
      width: 120,
      render: (text) => text || '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (text) => {
        const cfg = STATUS_MAP[text];
        return cfg ? <Tag color={cfg.color}>{cfg.text}</Tag> : text || '-';
      },
    },
    {
      title: '基线时间',
      dataIndex: 'baseline_time',
      key: 'baseline_time',
      width: 130,
      render: (text) => text || '-',
    },
    {
      title: '计划发布',
      dataIndex: 'planned_release_date',
      key: 'planned_release_date',
      width: 110,
      render: (text) => text || '-',
    },
    {
      title: '实际发布',
      dataIndex: 'release_date',
      key: 'release_date',
      width: 110,
      render: (text) => text || '-',
    },
    {
      title: '合入需求数',
      dataIndex: 'requirement_count',
      key: 'requirement_count',
      width: 100,
      align: 'center',
      render: (text) => (text !== undefined ? text : 0),
    },
    {
      title: '合入问题单数',
      dataIndex: 'issue_count',
      key: 'issue_count',
      width: 110,
      align: 'center',
      render: (text) => (text !== undefined ? text : 0),
    },
    {
      title: '操作',
      key: 'actions',
      width: 240,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            onClick={(e) => { e.stopPropagation(); navigate(`/versions/${record.version_id}`); }}
          >
            详情
          </Button>
          {record.status === '已发布' && (
            <Button
              type="link"
              size="small"
              onClick={(e) => { e.stopPropagation(); handleArchive(record); }}
            >
              归档
            </Button>
          )}
          <Button
            type="link"
            size="small"
            onClick={(e) => { e.stopPropagation(); handleOpenEdit(record); }}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定删除该版本?"
            onConfirm={(e) => { e?.stopPropagation(); handleDelete(record); }}
            onCancel={(e) => e?.stopPropagation()}
            okText="确定"
            cancelText="取消"
          >
            <Button
              type="link"
              danger
              size="small"
              onClick={(e) => e.stopPropagation()}
            >
              删除
            </Button>
          </Popconfirm>
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
          <Input.Search
            placeholder="搜索版本号/名称"
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
      <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenCreate}>
        新建版本
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
            <Button size="small" onClick={fetchVersions}>
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
      return <Empty description="暂无版本数据" />;
    }
    return (
      <Table
        rowKey="version_id"
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
        scroll={{ x: 1300 }}
        onRow={(record) => ({
          onClick: () => navigate(`/versions/${record.version_id}`),
          style: { cursor: 'pointer' },
        })}
        size="middle"
      />
    );
  };

  return (
    <div style={{ padding: 16 }}>
      <Typography.Title level={4} style={{ marginBottom: 16 }}>
        版本管理
      </Typography.Title>

      {renderFilterBar()}
      {renderToolbar()}
      {renderContent()}

      {/* ---------- 新建/编辑版本 Modal ---------- */}
      <Modal
        title={editingRecord ? '编辑版本' : '新建版本'}
        open={formModalOpen}
        onOk={handleFormSubmit}
        onCancel={() => { setFormModalOpen(false); form.resetFields(); setEditingRecord(null); }}
        confirmLoading={formLoading}
        width={600}
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
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
          <Form.Item
            name="version_no"
            label="版本号"
            rules={[
              { required: true, message: '请输入版本号' },
              { pattern: /^v\d+\.\d+\.\d+$/, message: '版本号格式需为 vX.Y.Z，如 v1.0.0' },
            ]}
          >
            <Input placeholder="v1.0.0" />
          </Form.Item>
          <Form.Item
            name="version_name"
            label="版本名称"
            rules={[{ required: true, message: '请输入版本名称' }]}
          >
            <Input placeholder="请输入版本名称" maxLength={100} />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="planned_release_date" label="计划发布日期">
                <DatePicker style={{ width: '100%' }} placeholder="选择计划发布日期" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="baseline_time" label="基线时间">
                <DatePicker showTime style={{ width: '100%' }} placeholder="选择基线时间" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="描述">
            <TextArea rows={4} placeholder="请输入版本描述" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default VersionsPage;