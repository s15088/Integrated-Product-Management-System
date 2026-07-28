import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Descriptions,
  Tag,
  Button,
  Space,
  Spin,
  Empty,
  Alert,
  Modal,
  Form,
  Select,
  Input,
  Table,
  Steps,
  Tabs,
  Typography,
  message,
  Row,
  Col,
  Progress,
  Popconfirm,
  Divider,
} from 'antd';
import {
  ArrowLeftOutlined,
  CheckOutlined,
  CloseOutlined,
  RocketOutlined,
  InboxOutlined,
  SwapOutlined,
  FlagOutlined,
} from '@ant-design/icons';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import axios from 'axios';

const { Text, Title, Paragraph } = Typography;
const { TextArea } = Input;
const { Option } = Select;

const STATUS_MAP = {
  '规划中': { color: 'blue', text: '规划中' },
  '开发中': { color: 'blue', text: '开发中' },
  '已发布': { color: 'green', text: '已发布' },
  '已归档': { color: 'gray', text: '已归档' },
};

const STATUS_STEPS = [
  { title: '规划中', statusKey: '规划中' },
  { title: '开发中', statusKey: '开发中' },
  { title: '已发布', statusKey: '已发布' },
  { title: '已归档', statusKey: '已归档' },
];

const CHANGE_TYPE_OPTIONS = ['移出合入', '替换合入', '调整合入'];

const VersionDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  // ---------- data ----------
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(null);

  // ---------- tab ----------
  const [activeTab, setActiveTab] = useState('burndown');

  // ---------- status flow ----------
  const [statusLoading, setStatusLoading] = useState(false);

  // ---------- change request modal ----------
  const [crModalOpen, setCrModalOpen] = useState(false);
  const [crLoading, setCrLoading] = useState(false);
  const [crForm] = Form.useForm();

  // ---------- change request approve ----------
  const [crApproveLoading, setCrApproveLoading] = useState(false);

  // ========== fetch helpers ==========

  const fetchVersion = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`/api/versions/${id}`);
      const body = res.data;
      // Backend returns { version, items, changeRequests, mergeRate, burndown, stats }
      // Merge version object fields into the top level so all accessors work correctly
      setVersion({
        ...body.version,
        items: body.items,
        changeRequests: body.changeRequests,
        mergeRate: body.mergeRate,
        burndown: body.burndown,
        stats: body.stats,
      });
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || '获取版本详情失败';
      setError(msg);
      message.error(msg);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchVersion();
  }, [fetchVersion]);

  // ========== derived data ==========

  // Combine items.requirements.items and items.issues.items into one array.
  const versionItems = useMemo(() => {
    const reqItems = version?.items?.requirements?.items || [];
    const issueItems = version?.items?.issues?.items || [];
    return [...reqItems, ...issueItems];
  }, [version]);

  const changeRequests = useMemo(() => version?.changeRequests || [], [version]);

  const requirementItems = useMemo(
    () => versionItems.filter((item) => item.item_type === 'requirement'),
    [versionItems]
  );

  const issueItems = useMemo(
    () => versionItems.filter((item) => item.item_type === 'issue'),
    [versionItems]
  );

  const mergedCount = useMemo(
    () => versionItems.filter((item) => item.merge_status === '已合入').length,
    [versionItems]
  );

  const mergeRate = useMemo(() => {
    if (versionItems.length === 0) return 0;
    return Math.round((mergedCount / versionItems.length) * 100);
  }, [mergedCount, versionItems.length]);

  const burndownData = useMemo(() => {
    const data = version?.burndown || [];
    return data.map((point) => ({
      date: point.date,
      剩余待合入: point.remaining,
    }));
  }, [version]);

  // ========== status helpers ==========

  const getCurrentStepIndex = () => {
    if (!version) return 0;
    const idx = STATUS_STEPS.findIndex((s) => s.statusKey === version.status);
    return idx >= 0 ? idx : 0;
  };

  const getStepStatus = (stepIdx) => {
    const currentIdx = getCurrentStepIndex();
    if (stepIdx < currentIdx) return 'finish';
    if (stepIdx === currentIdx) return 'process';
    return 'wait';
  };

  // ========== handlers ==========

  // ---------- status flow ----------
  const handleStatusAction = async (action) => {
    const actionMap = {
      baseline: { api: 'baseline', label: '建立基线', nextStatus: '开发中' },
      release: { api: 'release', label: '发布', nextStatus: '已发布' },
      archive: { api: 'archive', label: '归档', nextStatus: '已归档' },
    };

    const cfg = actionMap[action];
    if (!cfg) return;

    setStatusLoading(true);
    try {
      await axios.post(`/api/versions/${id}/${cfg.api}`);
      message.success(`${cfg.label}成功`);
      fetchVersion();
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || `${cfg.label}失败`;
      message.error(msg);
    } finally {
      setStatusLoading(false);
    }
  };

  // ---------- change request ----------
  const handleOpenChangeRequest = () => {
    setCrModalOpen(true);
    crForm.resetFields();
  };

  const handleChangeRequestSubmit = async () => {
    try {
      const values = await crForm.validateFields();
      setCrLoading(true);
      await axios.post(`/api/versions/${id}/change-requests`, values);
      message.success('变更申请提交成功');
      setCrModalOpen(false);
      crForm.resetFields();
      fetchVersion();
    } catch (err) {
      if (err?.errorFields) return;
      const msg = err?.response?.data?.message || err.message || '操作失败';
      message.error(msg);
    } finally {
      setCrLoading(false);
    }
  };

  // ---------- change request approve ----------
  const handleCRApprove = async (crId, action) => {
    const actionLabel = action === 'approve' ? '审批通过' : '驳回';
    setCrApproveLoading(true);
    try {
      if (action === 'approve') {
        await axios.post(`/api/versions/${id}/change-requests/${crId}/approve`);
      } else if (action === 'reject') {
        await axios.post(`/api/versions/${id}/change-requests/${crId}/reject`);
      }
      message.success(`${actionLabel}成功`);
      fetchVersion();
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || `${actionLabel}失败`;
      message.error(msg);
    } finally {
      setCrApproveLoading(false);
    }
  };

  // ========== render helpers ==========

  const renderActionButtons = () => {
    if (!version) return null;
    const { status } = version;

    const buttons = [];

    if (status === '规划中') {
      buttons.push(
        <Button
          key="baseline"
          type="primary"
          icon={<FlagOutlined />}
          loading={statusLoading}
          onClick={() => handleStatusAction('baseline')}
        >
          建立基线
        </Button>
      );
    }
    if (status === '开发中') {
      buttons.push(
        <Button
          key="release"
          type="primary"
          icon={<RocketOutlined />}
          loading={statusLoading}
          onClick={() => handleStatusAction('release')}
        >
          发布
        </Button>
      );
    }
    if (status === '已发布') {
      buttons.push(
        <Button
          key="archive"
          icon={<InboxOutlined />}
          loading={statusLoading}
          onClick={() => handleStatusAction('archive')}
        >
          归档
        </Button>
      );
    }

    buttons.push(
      <Button key="cr" icon={<SwapOutlined />} onClick={handleOpenChangeRequest}>
        变更申请
      </Button>
    );

    return (
      <Space style={{ marginBottom: 16 }}>
        {buttons}
      </Space>
    );
  };

  // ---------- Tab 1: 合入率 & 燃尽图 ----------
  const renderBurndownTab = () => (
    <Row gutter={[16, 16]}>
      <Col xs={24} md={12}>
        <Card title="合入率" size="small">
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Progress
              type="circle"
              percent={mergeRate}
              format={() => `${mergedCount} / ${versionItems.length}`}
              size={180}
            />
            <div style={{ marginTop: 16 }}>
              <Text type="secondary">
                总合入项 {versionItems.length}，已合入 {mergedCount}，合入率 {mergeRate}%
              </Text>
            </div>
          </div>
        </Card>
      </Col>
      <Col xs={24} md={12}>
        <Card title="燃尽图" size="small">
          {burndownData.length === 0 ? (
            <Empty description="暂无燃尽图数据" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={burndownData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <ReferenceLine
                  y={0}
                  label="理想线"
                  stroke="red"
                  strokeDasharray="3 3"
                />
                <Line
                  type="monotone"
                  dataKey="剩余待合入"
                  stroke="#1890ff"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>
      </Col>
    </Row>
  );

  // ---------- Tab 2: 已合入需求 ----------
  const renderRequirementsTab = () => {
    if (requirementItems.length === 0) {
      return <Empty description="暂无已合入需求" />;
    }

    const columns = [
      { title: '编号', dataIndex: 'item_id', key: 'item_id', width: 120, render: (t) => <Text code>{t || '-'}</Text> },
      {
        title: '合入状态',
        dataIndex: 'merge_status',
        key: 'merge_status',
        width: 90,
        render: (text) => {
          const colorMap = { '已合入': 'green', '待合入': 'orange', '已移除': 'red' };
          return <Tag color={colorMap[text] || 'default'}>{text || '-'}</Tag>;
        },
      },
      { title: '来源分支', dataIndex: 'source_branch', key: 'source_branch', width: 130, render: (t) => t || '-' },
      { title: '合入时间', dataIndex: 'merged_at', key: 'merged_at', width: 130, render: (t) => t || '-' },
      { title: '操作人', dataIndex: 'operator', key: 'operator', width: 100, render: (t) => t || '-' },
      {
        title: '操作',
        key: 'actions',
        width: 100,
        render: (_, record) => (
          <Button
            type="link"
            size="small"
            onClick={() => {
              if (record.item_type === 'requirement') {
                navigate(`/requirements/${record.item_id}`);
              }
            }}
          >
            反查详情
          </Button>
        ),
      },
    ];

    return (
      <div>
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          注：该表仅展示版本合入项的基本信息，详细字段（标题、模块、优先级等）请通过「反查详情」跳转至对应详情页查看。
        </Text>
        <Table
          rowKey={(r) => r.version_item_id || r.item_id}
          columns={columns}
          dataSource={requirementItems}
          pagination={false}
          size="small"
          scroll={{ x: 700 }}
        />
      </div>
    );
  };

  // ---------- Tab 3: 已合入问题单 ----------
  const renderIssuesTab = () => {
    if (issueItems.length === 0) {
      return <Empty description="暂无已合入问题单" />;
    }

    const columns = [
      { title: '编号', dataIndex: 'item_id', key: 'item_id', width: 120, render: (t) => <Text code>{t || '-'}</Text> },
      {
        title: '合入状态',
        dataIndex: 'merge_status',
        key: 'merge_status',
        width: 90,
        render: (text) => {
          const colorMap = { '已合入': 'green', '待合入': 'orange', '已移除': 'red' };
          return <Tag color={colorMap[text] || 'default'}>{text || '-'}</Tag>;
        },
      },
      { title: '来源分支', dataIndex: 'source_branch', key: 'source_branch', width: 130, render: (t) => t || '-' },
      { title: '合入时间', dataIndex: 'merged_at', key: 'merged_at', width: 130, render: (t) => t || '-' },
      { title: '操作人', dataIndex: 'operator', key: 'operator', width: 100, render: (t) => t || '-' },
      {
        title: '操作',
        key: 'actions',
        width: 80,
        render: (_, record) => (
          <Button
            type="link"
            size="small"
            onClick={() => {
              if (record.item_type === 'issue') {
                navigate(`/issues/${record.item_id}`);
              }
            }}
          >
            详情
          </Button>
        ),
      },
    ];

    return (
      <div>
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          注：该表仅展示版本合入项的基本信息，详细字段（标题、严重度、优先级等）请通过「详情」跳转至对应详情页查看。
        </Text>
        <Table
          rowKey={(r) => r.version_item_id || r.item_id}
          columns={columns}
          dataSource={issueItems}
          pagination={false}
          size="small"
          scroll={{ x: 700 }}
        />
      </div>
    );
  };

  // ---------- Tab 4: 版本信息 ----------
  const renderVersionInfoTab = () => {
    if (!version) return null;
    const statusCfg = STATUS_MAP[version.status] || {};

    return (
      <Descriptions bordered column={{ xs: 1, sm: 2, md: 3 }} size="small">
        <Descriptions.Item label="版本号">
          <Text code>{version.version_no || '-'}</Text>
        </Descriptions.Item>
        <Descriptions.Item label="版本名称">{version.version_name || '-'}</Descriptions.Item>
        <Descriptions.Item label="产品">{version.product_name || '-'}</Descriptions.Item>
        <Descriptions.Item label="产品分类">{version.product_category || '-'}</Descriptions.Item>
        <Descriptions.Item label="状态">
          <Tag color={statusCfg.color}>{statusCfg.text}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="基线时间">{version.baseline_time || '-'}</Descriptions.Item>
        <Descriptions.Item label="计划发布日期">{version.planned_release_date || '-'}</Descriptions.Item>
        <Descriptions.Item label="实际发布日期">{version.release_date || '-'}</Descriptions.Item>
        <Descriptions.Item label="合入需求数">{version.requirement_count || 0}</Descriptions.Item>
        <Descriptions.Item label="合入问题单数">{version.issue_count || 0}</Descriptions.Item>
        <Descriptions.Item label="创建时间">{version.created_at || '-'}</Descriptions.Item>
        <Descriptions.Item label="更新时间">{version.updated_at || '-'}</Descriptions.Item>
        <Descriptions.Item label="描述" span={3}>
          <Paragraph style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
            {version.description || '-'}
          </Paragraph>
        </Descriptions.Item>
      </Descriptions>
    );
  };

  // ---------- Tab 5: 变更申请 ----------
  const renderChangeRequestsTab = () => {
    if (changeRequests.length === 0) {
      return <Empty description="暂无变更申请" />;
    }

    const columns = [
      {
        title: '变更类型',
        dataIndex: 'change_type',
        key: 'change_type',
        width: 120,
        render: (text) => {
          const colorMap = { '移出合入': 'orange', '替换合入': 'blue', '调整合入': 'purple' };
          return <Tag color={colorMap[text] || 'default'}>{text || '-'}</Tag>;
        },
      },
      { title: '申请人', dataIndex: 'applicant', key: 'applicant', width: 100, render: (t) => (t?.name || t || '-') },
      {
        title: '原因',
        dataIndex: 'reason',
        key: 'reason',
        ellipsis: true,
        render: (t) => <Text>{t || '-'}</Text>,
      },
      {
        title: '状态',
        dataIndex: 'status',
        key: 'status',
        width: 90,
        render: (text) => {
          const colorMap = { '审批中': 'orange', '已通过': 'green', '已驳回': 'red' };
          return <Tag color={colorMap[text] || 'default'}>{text || '-'}</Tag>;
        },
      },
      { title: '审批人', dataIndex: 'approver', key: 'approver', width: 100, render: (t) => (t?.name || t || '-') },
      { title: '时间', dataIndex: 'created_at', key: 'created_at', width: 130, render: (t) => t || '-' },
      {
        title: '操作',
        key: 'actions',
        width: 180,
        render: (_, record) => {
          if (record.status !== '审批中') return null;
          return (
            <Space size="small">
              <Button
                type="link"
                size="small"
                icon={<CheckOutlined />}
                loading={crApproveLoading}
                onClick={() => handleCRApprove(record.change_request_id, 'approve')}
              >
                审批通过
              </Button>
              <Button
                type="link"
                danger
                size="small"
                icon={<CloseOutlined />}
                loading={crApproveLoading}
                onClick={() => handleCRApprove(record.change_request_id, 'reject')}
              >
                驳回
              </Button>
            </Space>
          );
        },
      },
    ];

    return (
      <Table
        rowKey="change_request_id"
        columns={columns}
        dataSource={changeRequests}
        pagination={false}
        size="small"
        scroll={{ x: 900 }}
      />
    );
  };

  // ========== tab items ==========

  const tabItems = [
    { key: 'burndown', label: '合入率&燃尽图', children: renderBurndownTab() },
    { key: 'requirements', label: '已合入需求', children: renderRequirementsTab() },
    { key: 'issues', label: '已合入问题单', children: renderIssuesTab() },
    { key: 'info', label: '版本信息', children: renderVersionInfoTab() },
    { key: 'changeRequests', label: '变更申请', children: renderChangeRequestsTab() },
  ];

  // ========== loading / error / empty ==========

  if (loading) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ textAlign: 'center', padding: 120 }}>
          <Spin size="large" tip="加载中..." />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 16 }}>
        <Alert
          type="error"
          message="加载失败"
          description={error}
          showIcon
          action={
            <Space>
              <Button size="small" onClick={() => navigate(-1)}>
                返回
              </Button>
              <Button size="small" type="primary" onClick={fetchVersion}>
                重试
              </Button>
            </Space>
          }
        />
      </div>
    );
  }

  if (!version) {
    return (
      <div style={{ padding: 16 }}>
        <Empty description="版本不存在">
          <Button type="primary" onClick={() => navigate('/versions')}>
            返回列表
          </Button>
        </Empty>
      </div>
    );
  }

  const statusCfg = STATUS_MAP[version.status] || {};

  return (
    <div style={{ padding: 16 }}>
      {/* ---------- Header ---------- */}
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/versions')}>
          返回列表
        </Button>
      </Space>

      <Card style={{ marginBottom: 16 }}>
        <Row align="middle" justify="space-between">
          <Col>
            <Space size={16} align="center">
              <Text code style={{ fontSize: 18 }}>
                {version.version_no}
              </Text>
              <Title level={4} style={{ margin: 0 }}>
                {version.version_name}
              </Title>
              <Tag color={statusCfg.color}>{statusCfg.text}</Tag>
            </Space>
          </Col>
        </Row>
      </Card>

      {renderActionButtons()}

      {/* ---------- Status Steps ---------- */}
      <Card title="版本状态流转" style={{ marginBottom: 16 }}>
        <Steps current={getCurrentStepIndex()} size="small">
          {STATUS_STEPS.map((step, idx) => (
            <Steps.Step key={step.statusKey} title={step.title} status={getStepStatus(idx)} />
          ))}
        </Steps>
      </Card>

      {/* ---------- Tabs ---------- */}
      <Card>
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
      </Card>

      {/* ---------- 变更申请 Modal ---------- */}
      <Modal
        title="变更申请"
        open={crModalOpen}
        onOk={handleChangeRequestSubmit}
        onCancel={() => { setCrModalOpen(false); crForm.resetFields(); }}
        confirmLoading={crLoading}
        width={600}
        destroyOnClose
      >
        <Form form={crForm} layout="vertical" preserve={false}>
          <Form.Item
            name="change_type"
            label="变更类型"
            rules={[{ required: true, message: '请选择变更类型' }]}
          >
            <Select placeholder="请选择变更类型">
              {CHANGE_TYPE_OPTIONS.map((t) => (
                <Option key={t} value={t}>{t}</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="item_ids"
            label="选择变更项"
            rules={[{ required: true, message: '请选择至少一个变更项' }]}
          >
            <Select
              mode="multiple"
              placeholder="选择需要变更的合入项"
              showSearch
              optionFilterProp="children"
            >
              {versionItems.map((item) => (
                <Option key={item.version_item_id} value={item.version_item_id}>
                  [{item.item_type}] {item.item_id}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="reason"
            label="变更原因"
            rules={[{ required: true, message: '请输入变更原因' }]}
          >
            <TextArea rows={4} placeholder="请输入变更原因" maxLength={500} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default VersionDetailPage;
