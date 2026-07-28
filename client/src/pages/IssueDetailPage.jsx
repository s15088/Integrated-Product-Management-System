import React, { useState, useEffect, useCallback } from 'react';
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
  Typography,
  message,
  Row,
  Col,
  Divider,
} from 'antd';
import {
  ArrowLeftOutlined,
  CheckOutlined,
  CloseOutlined,
  MergeCellsOutlined,
  FormOutlined,
} from '@ant-design/icons';
import axios from 'axios';

const { Text, Title, Paragraph } = Typography;
const { TextArea } = Input;
const { Option } = Select;

const SEVERITY_MAP = {
  '致命': { color: 'red', text: '致命' },
  '严重': { color: 'orange', text: '严重' },
  '一般': { color: 'yellow', text: '一般' },
  '轻微': { color: 'blue', text: '轻微' },
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
  '高': { color: 'orange', text: '高' },
  '中': { color: 'blue', text: '中' },
  '低': { color: 'gray', text: '低' },
};

const STATUS_STEPS = [
  { title: '分析中', statusKey: '分析中' },
  { title: '分析待审批', statusKey: '分析待审批' },
  { title: '开发中', statusKey: '开发中' },
  { title: '复测中', statusKey: '复测中' },
  { title: '回归通过', statusKey: '回归通过' },
  { title: '已关闭', statusKey: '已关闭' },
];

const IssueDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  // ---------- data ----------
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [issue, setIssue] = useState(null);

  // ---------- analysis modal ----------
  const [analysisModalOpen, setAnalysisModalOpen] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisForm] = Form.useForm();

  // ---------- merge modal ----------
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [mergeLoading, setMergeLoading] = useState(false);
  const [mergeForm] = Form.useForm();
  const [versionOptions, setVersionOptions] = useState([]);

  // ---------- approve ----------
  const [approveLoading, setApproveLoading] = useState(false);

  // ========== fetch helpers ==========

  const fetchIssue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`/api/issues/${id}`);
      const body = res.data;
      setIssue(body);
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || '获取问题单详情失败';
      setError(msg);
      message.error(msg);
    } finally {
      setLoading(false);
    }
  }, [id]);

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
    fetchIssue();
  }, [fetchIssue]);

  // ========== status helpers ==========

  const getCurrentStepIndex = () => {
    if (!issue) return 0;
    const idx = STATUS_STEPS.findIndex((s) => s.statusKey === issue.status);
    return idx >= 0 ? idx : 0;
  };

  const getStepStatus = (stepIdx) => {
    const currentIdx = getCurrentStepIndex();
    if (stepIdx < currentIdx) return 'finish';
    if (stepIdx === currentIdx) return 'process';
    return 'wait';
  };

  // ========== handlers ==========

  // ---------- analysis ----------
  const handleOpenAnalysis = () => {
    setAnalysisModalOpen(true);
    analysisForm.resetFields();
  };

  const handleAnalysisSubmit = async () => {
    try {
      const values = await analysisForm.validateFields();
      setAnalysisLoading(true);
      await axios.post(`/api/issues/${id}/analyze`, values);
      message.success('分析提交成功');
      setAnalysisModalOpen(false);
      analysisForm.resetFields();
      fetchIssue();
    } catch (err) {
      if (err?.errorFields) return;
      const msg = err?.response?.data?.message || err.message || '操作失败';
      message.error(msg);
    } finally {
      setAnalysisLoading(false);
    }
  };

  // ---------- approve / reject ----------
  const handleApprove = async (action) => {
    const actionLabel = action === 'approve' ? '通过' : '驳回';
    setApproveLoading(true);
    try {
      const body = action === 'approve'
        ? { approved: true }
        : { approved: false, reject_reason: '驳回' };
      await axios.post(`/api/issues/${id}/approve-analysis`, body);
      message.success(`审批${actionLabel}成功`);
      fetchIssue();
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || `审批${actionLabel}失败`;
      message.error(msg);
    } finally {
      setApproveLoading(false);
    }
  };

  // ---------- merge version ----------
  const handleOpenMerge = () => {
    setMergeModalOpen(true);
    fetchVersionOptions();
    mergeForm.resetFields();
  };

  const handleMergeSubmit = async () => {
    try {
      const values = await mergeForm.validateFields();
      setMergeLoading(true);
      await axios.post(`/api/issues/${id}/merge`, values);
      message.success('合入版本成功');
      setMergeModalOpen(false);
      mergeForm.resetFields();
      fetchIssue();
    } catch (err) {
      if (err?.errorFields) return;
      const msg = err?.response?.data?.message || err.message || '操作失败';
      message.error(msg);
    } finally {
      setMergeLoading(false);
    }
  };

  // ========== render helpers ==========

  const renderActionButtons = () => {
    if (!issue) return null;
    const { status } = issue;

    const buttons = [];

    if (status === '分析中') {
      buttons.push(
        <Button key="analyze" type="primary" icon={<FormOutlined />} onClick={handleOpenAnalysis}>
          填写分析
        </Button>
      );
    }
    if (status === '分析待审批') {
      buttons.push(
        <Button
          key="approve"
          type="primary"
          icon={<CheckOutlined />}
          loading={approveLoading}
          onClick={() => handleApprove('approve')}
        >
          通过
        </Button>,
        <Button
          key="reject"
          danger
          icon={<CloseOutlined />}
          loading={approveLoading}
          onClick={() => handleApprove('reject')}
        >
          驳回
        </Button>
      );
    }
    buttons.push(
      <Button key="merge" icon={<MergeCellsOutlined />} onClick={handleOpenMerge}>
        合入版本
      </Button>
    );

    return (
      <Space style={{ marginBottom: 16 }}>
        {buttons}
      </Space>
    );
  };

  const renderVersionItemsTable = () => {
    const items = issue?.versions || [];
    if (items.length === 0) {
      return <Empty description="暂无合入版本记录" />;
    }

    const columns = [
      { title: '版本号', dataIndex: 'version_no', key: 'version_no', width: 120 },
      { title: '来源分支', dataIndex: 'source_branch', key: 'source_branch', width: 150, render: (t) => t || '-' },
      {
        title: '合入状态',
        dataIndex: 'merge_status',
        key: 'merge_status',
        width: 100,
        render: (text) => {
          const colorMap = { '已合入': 'green', '待合入': 'orange', '已移除': 'red' };
          return <Tag color={colorMap[text] || 'default'}>{text || '-'}</Tag>;
        },
      },
      {
        title: '合入时间',
        dataIndex: 'merged_at',
        key: 'merged_at',
        width: 180,
        render: (text) => text || '-',
      },
    ];

    return (
      <Table
        rowKey={(r) => r.version_item_id || r.version_no}
        columns={columns}
        dataSource={items}
        pagination={false}
        size="small"
      />
    );
  };

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
              <Button size="small" type="primary" onClick={fetchIssue}>
                重试
              </Button>
            </Space>
          }
        />
      </div>
    );
  }

  if (!issue) {
    return (
      <div style={{ padding: 16 }}>
        <Empty description="问题单不存在">
          <Button type="primary" onClick={() => navigate('/issues')}>
            返回列表
          </Button>
        </Empty>
      </div>
    );
  }

  const severityCfg = SEVERITY_MAP[issue.severity] || {};
  const statusCfg = STATUS_MAP[issue.status] || {};
  const priorityCfg = PRIORITY_MAP[issue.priority] || {};

  return (
    <div style={{ padding: 16 }}>
      {/* ---------- Header ---------- */}
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/issues')}>
          返回列表
        </Button>
      </Space>

      <Card style={{ marginBottom: 16 }}>
        <Row align="middle" justify="space-between">
          <Col>
            <Space size={16} align="center">
              <Title level={4} style={{ margin: 0 }}>
                {issue.title}
              </Title>
              <Tag color={statusCfg.color}>{statusCfg.text}</Tag>
              <Tag color={severityCfg.color}>{severityCfg.text}</Tag>
              <Tag color={priorityCfg.color}>{priorityCfg.text}</Tag>
            </Space>
          </Col>
        </Row>
      </Card>

      {renderActionButtons()}

      {/* ---------- Status Steps ---------- */}
      <Card title="处理流程" style={{ marginBottom: 16 }}>
        <Steps current={getCurrentStepIndex()} size="small">
          {STATUS_STEPS.map((step, idx) => (
            <Steps.Step key={step.statusKey} title={step.title} status={getStepStatus(idx)} />
          ))}
        </Steps>
      </Card>

      {/* ---------- Basic Info ---------- */}
      <Card title="基本信息" style={{ marginBottom: 16 }}>
        <Descriptions bordered column={{ xs: 1, sm: 2, md: 3 }} size="small">
          <Descriptions.Item label="编号">
            <Text code>{issue.issue_code || '-'}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="产品">{issue.product_name || '-'}</Descriptions.Item>
          <Descriptions.Item label="类型">{issue.type ? <Tag>{issue.type}</Tag> : '-'}</Descriptions.Item>
          <Descriptions.Item label="严重度">
            {issue.severity ? <Tag color={severityCfg.color}>{severityCfg.text}</Tag> : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="优先级">
            {issue.priority ? <Tag color={priorityCfg.color}>{priorityCfg.text}</Tag> : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="报告人">{issue.reporter_name || '-'}</Descriptions.Item>
          <Descriptions.Item label="处理人">{issue.assignee_name || '-'}</Descriptions.Item>
          <Descriptions.Item label="发现版本">{issue.found_version || '-'}</Descriptions.Item>
          <Descriptions.Item label="模块">{issue.module || '-'}</Descriptions.Item>
          <Descriptions.Item label="创建时间">{issue.created_at || '-'}</Descriptions.Item>
          <Descriptions.Item label="更新时间">{issue.updated_at || '-'}</Descriptions.Item>
        </Descriptions>
      </Card>

      {/* ---------- 复现步骤 & 描述 ---------- */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} md={12}>
          <Card title="复现步骤" style={{ height: '100%' }}>
            <Paragraph style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
              {issue.reproduce_steps || '暂无复现步骤'}
            </Paragraph>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="详细描述" style={{ height: '100%' }}>
            <Paragraph style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
              {issue.description || '暂无详细描述'}
            </Paragraph>
          </Card>
        </Col>
      </Row>

      {/* ---------- Analysis Section (conditional) ---------- */}
      {(issue.analysis_result || issue.status === '分析待审批' || issue.status === '开发中' || issue.status === '复测中' || issue.status === '回归通过' || issue.status === '已关闭') && (
        <Card title="分析信息" style={{ marginBottom: 16 }}>
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="分析结果">
              {issue.analysis_result ? (
                <Tag color={issue.analysis_result === '通过' ? 'green' : 'red'}>
                  {issue.analysis_result}
                </Tag>
              ) : (
                '-'
              )}
            </Descriptions.Item>
            <Descriptions.Item label="分析意见">
              <Paragraph style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                {issue.analysis_opinion || '-'}
              </Paragraph>
            </Descriptions.Item>
          </Descriptions>
        </Card>
      )}

      {/* ---------- 合入版本 Items ---------- */}
      <Card title="合入版本记录" style={{ marginBottom: 16 }}>
        {renderVersionItemsTable()}
      </Card>

      {/* ---------- 分析 Modal ---------- */}
      <Modal
        title="填写分析"
        open={analysisModalOpen}
        onOk={handleAnalysisSubmit}
        onCancel={() => { setAnalysisModalOpen(false); analysisForm.resetFields(); }}
        confirmLoading={analysisLoading}
        destroyOnClose
      >
        <Form form={analysisForm} layout="vertical" preserve={false}>
          <Form.Item
            name="analysis_result"
            label="分析结果"
            rules={[{ required: true, message: '请选择分析结果' }]}
          >
            <Select placeholder="请选择分析结果">
              <Option value="通过">通过</Option>
              <Option value="驳回">驳回</Option>
            </Select>
          </Form.Item>
          <Form.Item name="analysis_opinion" label="分析意见">
            <TextArea rows={5} placeholder="请输入分析意见" />
          </Form.Item>
        </Form>
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

export default IssueDetailPage;