import React, { useState, useEffect, useCallback } from 'react';
import {
  Table,
  Drawer,
  DatePicker,
  Select,
  Button,
  Tag,
  Space,
  message,
  Card,
  Descriptions,
  Row,
  Col,
  Typography,
  Divider,
  Empty,
} from 'antd';
import {
  SearchOutlined,
  ExportOutlined,
  ReloadOutlined,
  InfoCircleOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;
const { Text, Paragraph } = Typography;

const OPERATION_TYPE_OPTIONS = [
  { label: '登录', value: '登录' },
  { label: '创建', value: '创建' },
  { label: '更新', value: '更新' },
  { label: '删除', value: '删除' },
  { label: '状态流转', value: '状态流转' },
  { label: '合入版本', value: '合入版本' },
  { label: '变更申请', value: '变更申请' },
  { label: '归档', value: '归档' },
  { label: '权限变更', value: '权限变更' },
  { label: '密码重置', value: '密码重置' },
];

const OBJECT_TYPE_OPTIONS = [
  { label: '产品', value: '产品' },
  { label: '需求', value: '需求' },
  { label: '问题单', value: '问题单' },
  { label: '版本', value: '版本' },
  { label: '用户', value: '用户' },
  { label: '权限', value: '权限' },
  { label: '系统', value: '系统' },
];

const OPERATION_COLORS = {
  '登录': 'blue',
  '创建': 'green',
  '更新': 'orange',
  '删除': 'red',
  '状态流转': 'purple',
  '合入版本': 'cyan',
  '变更申请': 'geekblue',
  '归档': 'magenta',
  '权限变更': 'volcano',
  '密码重置': 'gold',
};

const OBJECT_COLORS = {
  '产品': '#1890ff',
  '需求': '#52c41a',
  '问题单': '#fa8c16',
  '版本': '#722ed1',
  '用户': '#eb2f96',
  '权限': '#13c2c2',
  '系统': '#2f54eb',
};

const ROLE_COLORS_MAP = {
  '系统管理员': 'red',
  '产品经理': 'blue',
  '开发工程师': 'green',
  '开发负责人': 'purple',
  '测试负责人': 'orange',
  '普通成员': 'default',
};

const AuditLogsPage = () => {
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 15, total: 0 });

  // Filters
  const [filters, setFilters] = useState({
    date_range: null,
    operator: undefined,
    operation_type: undefined,
    object_type: undefined,
  });

  // Operator options (fetched dynamically)
  const [operatorOptions, setOperatorOptions] = useState([]);

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);

  // Export
  const [exporting, setExporting] = useState(false);

  // Fetch operator list for filter
  const fetchOperators = useCallback(async () => {
    try {
      const res = await axios.get('/api/system/users/simple');
      const users = res.data?.items || [];
      setOperatorOptions(
        users.map((u) => ({
          label: u.name || u.username,
          value: u.user_id,
        })),
      );
    } catch {
      // non-critical
    }
  }, []);

  // Fetch audit logs
  const fetchLogs = useCallback(
    async (page = 1, pageSize = 15, currentFilters = null) => {
      const f = currentFilters || filters;
      setLoading(true);
      try {
        const params = {
          page,
          pageSize,
        };

        if (f.date_range && f.date_range.length === 2) {
          params.start_time = f.date_range[0].toISOString();
          params.end_time = f.date_range[1].toISOString();
        }
        if (f.operator) params.operator = f.operator;
        if (f.operation_type) params.operation_type = f.operation_type;
        if (f.object_type) params.object_type = f.object_type;

        const res = await axios.get('/api/system/audit-logs', { params });
        const { items, total } = res.data;
        setDataSource(items || []);
        setPagination((prev) => ({ ...prev, current: page, pageSize, total: total || 0 }));
      } catch (err) {
        message.error(err.response?.data?.message || '获取审计日志失败');
      } finally {
        setLoading(false);
      }
    },
    [filters],
  );

  useEffect(() => {
    fetchOperators();
    fetchLogs();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle filter changes
  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  // Search
  const handleSearch = () => {
    fetchLogs(1, pagination.pageSize, filters);
  };

  // Reset filters
  const handleReset = () => {
    const reset = {
      date_range: null,
      operator: undefined,
      operation_type: undefined,
      object_type: undefined,
    };
    setFilters(reset);
    fetchLogs(1, pagination.pageSize, reset);
  };

  // Table change
  const handleTableChange = (pag) => {
    fetchLogs(pag.current, pag.pageSize);
  };

  // Open detail drawer
  const handleOpenDetail = (record) => {
    setSelectedLog(record);
    setDrawerOpen(true);
  };

  // Export
  const handleExport = async () => {
    setExporting(true);
    try {
      const params = {};
      if (filters.date_range && filters.date_range.length === 2) {
        params.start_time = filters.date_range[0].toISOString();
        params.end_time = filters.date_range[1].toISOString();
      }
      if (filters.operator) params.operator = filters.operator;
      if (filters.operation_type) params.operation_type = filters.operation_type;
      if (filters.object_type) params.object_type = filters.object_type;

      const res = await axios.get('/api/system/audit-logs/export', {
        params,
        responseType: 'blob',
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      const filename =
        res.headers['content-disposition']?.split('filename=')[1]?.replace(/"/g, '') ||
        `audit-logs-${dayjs().format('YYYY-MM-DD_HH-mm-ss')}.csv`;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      message.success('导出成功');
    } catch (err) {
      message.error(err.response?.data?.message || '导出失败');
    } finally {
      setExporting(false);
    }
  };

  // ---- Columns ----
  const columns = [
    {
      title: '时间',
      dataIndex: 'operation_time',
      key: 'operation_time',
      width: 180,
      render: (text) => {
        if (!text) return '-';
        return dayjs(text).format('YYYY-MM-DD HH:mm:ss');
      },
    },
    {
      title: '操作人',
      dataIndex: 'operator_name',
      key: 'operator_name',
      width: 120,
      ellipsis: true,
    },
    {
      title: '角色',
      dataIndex: 'operator_role',
      key: 'operator_role',
      width: 110,
      render: (role) => (
        <Tag color={ROLE_COLORS_MAP[role] || 'default'}>{role || '-'}</Tag>
      ),
    },
    {
      title: '操作类型',
      dataIndex: 'operation_type',
      key: 'operation_type',
      width: 100,
      render: (type) => (
        <Tag color={OPERATION_COLORS[type] || 'default'}>{type || '-'}</Tag>
      ),
    },
    {
      title: '对象类型',
      dataIndex: 'object_type',
      key: 'object_type',
      width: 90,
      render: (type) => (
        <Tag color={OBJECT_COLORS[type] || '#108ee9'}>{type || '-'}</Tag>
      ),
    },
    {
      title: '对象ID',
      dataIndex: 'object_id',
      key: 'object_id',
      width: 100,
      ellipsis: true,
      render: (text) => (
        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
          {text || '-'}
        </span>
      ),
    },
    {
      title: 'IP地址',
      dataIndex: 'ip_address',
      key: 'ip_address',
      width: 130,
      ellipsis: true,
      render: (text) => (
        <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#666' }}>
          {text || '-'}
        </span>
      ),
    },
    {
      title: '结果',
      dataIndex: 'result',
      key: 'result',
      width: 80,
      render: (result) => {
        if (result === 'success') {
          return <Tag color="green">成功</Tag>;
        }
        if (result === 'error') {
          return <Tag color="red">失败</Tag>;
        }
        return <Tag>{result || '-'}</Tag>;
      },
    },
    {
      title: '详情',
      key: 'detail',
      width: 80,
      fixed: 'right',
      render: (_, record) => (
        <Button
          type="link"
          size="small"
          icon={<InfoCircleOutlined />}
          onClick={() => handleOpenDetail(record)}
        >
          详情
        </Button>
      ),
    },
  ];

  // Render diff section
  const renderDiff = (diff) => {
    if (!diff) return <Text type="secondary">无变更记录</Text>;
    if (typeof diff === 'string') {
      return <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{diff}</pre>;
    }
    if (typeof diff === 'object') {
      return (
        <div>
          {Object.entries(diff).map(([key, value]) => (
            <div key={key} style={{ marginBottom: 8 }}>
              <Text strong style={{ fontSize: 12, color: '#1890ff' }}>
                {key}
              </Text>
              <div style={{ marginTop: 4 }}>
                {typeof value === 'object' && value !== null ? (
                  <Descriptions size="small" bordered column={2}>
                    <Descriptions.Item label="旧值" span={2}>
                      <Text delete type="danger">
                        {JSON.stringify(value.old ?? value.from ?? '-', null, 2)}
                      </Text>
                    </Descriptions.Item>
                    <Descriptions.Item label="新值" span={2}>
                      <Text code type="success">
                        {JSON.stringify(value.new ?? value.to ?? '-', null, 2)}
                      </Text>
                    </Descriptions.Item>
                  </Descriptions>
                ) : (
                  <Text>{String(value)}</Text>
                )}
              </div>
            </div>
          ))}
        </div>
      );
    }
    return <Text>{String(diff)}</Text>;
  };

  return (
    <div style={{ padding: 24 }}>
      {/* Filter Bar */}
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={12} md={8} lg={6}>
            <RangePicker
              showTime
              format="YYYY-MM-DD HH:mm:ss"
              value={filters.date_range}
              onChange={(dates) => handleFilterChange('date_range', dates)}
              placeholder={['开始时间', '结束时间']}
              style={{ width: '100%' }}
              allowClear
            />
          </Col>
          <Col xs={24} sm={12} md={6} lg={4}>
            <Select
              placeholder="选择操作人"
              allowClear
              showSearch
              optionFilterProp="label"
              value={filters.operator}
              onChange={(val) => handleFilterChange('operator', val)}
              options={operatorOptions}
              style={{ width: '100%' }}
            />
          </Col>
          <Col xs={24} sm={12} md={5} lg={4}>
            <Select
              placeholder="操作类型"
              allowClear
              value={filters.operation_type}
              onChange={(val) => handleFilterChange('operation_type', val)}
              options={OPERATION_TYPE_OPTIONS}
              style={{ width: '100%' }}
            />
          </Col>
          <Col xs={24} sm={12} md={5} lg={4}>
            <Select
              placeholder="对象类型"
              allowClear
              value={filters.object_type}
              onChange={(val) => handleFilterChange('object_type', val)}
              options={OBJECT_TYPE_OPTIONS}
              style={{ width: '100%' }}
            />
          </Col>
          <Col xs={24} sm={24} md={12} lg={6}>
            <Space>
              <Button
                type="primary"
                icon={<SearchOutlined />}
                onClick={handleSearch}
              >
                查询
              </Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>
                重置
              </Button>
              <Button
                icon={<ExportOutlined />}
                onClick={handleExport}
                loading={exporting}
              >
                导出
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Table */}
      <Card>
        <Table
          rowKey="audit_id"
          columns={columns}
          dataSource={dataSource}
          loading={loading}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条记录`,
            pageSizeOptions: ['10', '15', '30', '50'],
          }}
          onChange={handleTableChange}
          scroll={{ x: 1200 }}
          locale={{ emptyText: '暂无审计日志' }}
          size="middle"
        />
      </Card>

      {/* Detail Drawer */}
      <Drawer
        title="审计日志详情"
        placement="right"
        width={600}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedLog(null);
        }}
        open={drawerOpen}
        extra={
          <Button
            type="text"
            icon={<CloseOutlined />}
            onClick={() => {
              setDrawerOpen(false);
              setSelectedLog(null);
            }}
          />
        }
      >
        {selectedLog ? (
          <div>
            <Descriptions
              bordered
              size="small"
              column={1}
              labelStyle={{ width: 100, fontWeight: 600 }}
            >
              <Descriptions.Item label="日志ID">
                <Text code>{selectedLog.audit_id}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="时间">
                {selectedLog.operation_time
                  ? dayjs(selectedLog.operation_time).format('YYYY-MM-DD HH:mm:ss')
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="操作人">
                {selectedLog.operator_name || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="角色">
                <Tag color={ROLE_COLORS_MAP[selectedLog.operator_role] || 'default'}>
                  {selectedLog.operator_role || '-'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="操作类型">
                <Tag color={OPERATION_COLORS[selectedLog.operation_type] || 'default'}>
                  {selectedLog.operation_type || '-'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="对象类型">
                <Tag color={OBJECT_COLORS[selectedLog.object_type] || '#108ee9'}>
                  {selectedLog.object_type || '-'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="对象ID">
                <Text code>{selectedLog.object_id || '-'}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="对象名称">
                {selectedLog.object_name || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="IP地址">
                <Text code>{selectedLog.ip_address || '-'}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="User Agent">
                <Text
                  style={{ fontSize: 12, wordBreak: 'break-all' }}
                  ellipsis={{ tooltip: selectedLog.user_agent }}
                >
                  {selectedLog.user_agent || '-'}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="结果">
                {selectedLog.result === 'success' ? (
                  <Tag color="green">成功</Tag>
                ) : selectedLog.result === 'error' ? (
                  <Tag color="red">失败</Tag>
                ) : (
                  <Tag>{selectedLog.result || '-'}</Tag>
                )}
              </Descriptions.Item>
              {selectedLog.error_message && (
                <Descriptions.Item label="错误信息">
                  <Text type="danger">{selectedLog.error_message}</Text>
                </Descriptions.Item>
              )}
              <Descriptions.Item label="操作描述">
                {selectedLog.description || '-'}
              </Descriptions.Item>
            </Descriptions>

            <Divider />

            <div style={{ marginBottom: 8 }}>
              <Text strong style={{ fontSize: 14 }}>
                变更详情
              </Text>
            </div>
            <div
              style={{
                background: '#fafafa',
                border: '1px solid #f0f0f0',
                borderRadius: 6,
                padding: 16,
                maxHeight: 400,
                overflow: 'auto',
              }}
            >
              {renderDiff(selectedLog.diff)}
            </div>

            {selectedLog.metadata && (
              <>
                <Divider />
                <div style={{ marginBottom: 8 }}>
                  <Text strong style={{ fontSize: 14 }}>
                    附加信息
                  </Text>
                </div>
                <pre
                  style={{
                    background: '#fafafa',
                    border: '1px solid #f0f0f0',
                    borderRadius: 6,
                    padding: 16,
                    fontSize: 12,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    maxHeight: 300,
                    overflow: 'auto',
                  }}
                >
                  {typeof selectedLog.metadata === 'string'
                    ? selectedLog.metadata
                    : JSON.stringify(selectedLog.metadata, null, 2)}
                </pre>
              </>
            )}

            {!selectedLog.diff && !selectedLog.metadata && (
              <Empty
                description="无额外详情"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            )}
          </div>
        ) : (
          <Empty description="未选择日志" />
        )}
      </Drawer>
    </div>
  );
};

export default AuditLogsPage;