import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import dayjs from 'dayjs';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
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
  DatePicker,
  message,
  Empty,
  Typography,
  Row,
  Col,
  Divider,
  Result,
  Popconfirm,
  InputNumber,
} from 'antd';
import {
  ArrowLeftOutlined,
  EditOutlined,
  ReloadOutlined,
  FormOutlined,
  CheckOutlined,
  CloseOutlined,
  BranchesOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { TextArea } = Input;

// ==================== 常量 ====================

const STATUS_MAP = {
  待评估: { label: '待评估', color: 'default' },
  评估待审批: { label: '评估待审批', color: 'blue' },
  已规划: { label: '已规划', color: 'blue' },
  开发中: { label: '开发中', color: 'blue' },
  测试中: { label: '测试中', color: 'orange' },
  已实现: { label: '已实现', color: 'green' },
  已关闭: { label: '已关闭', color: 'default' },
  已拒绝: { label: '已拒绝', color: 'red' },
};

const PRIORITY_MAP = {
  高: { label: '高', color: 'red' },
  中: { label: '中', color: 'orange' },
  低: { label: '低', color: 'green' },
};

const SOURCE_MAP = {
  内部: { label: '内部', color: 'blue' },
  客户: { label: '客户', color: 'green' },
  市场: { label: '市场', color: 'purple' },
};

const EVALUATE_RESULT_MAP = {
  通过: { label: '通过', color: 'green' },
  驳回: { label: '驳回', color: 'red' },
  暂缓: { label: '暂缓', color: 'orange' },
};

const MERGE_STATUS_MAP = {
  已合入: { label: '已合入', color: 'green' },
  待合入: { label: '待合入', color: 'orange' },
  有冲突: { label: '有冲突', color: 'red' },
  已取消: { label: '已取消', color: 'default' },
};

const STATUS_FLOW = [
  { key: '待评估', title: '待评估' },
  { key: '评估待审批', title: '评估待审批' },
  { key: '已规划', title: '已规划' },
  { key: '开发中', title: '开发中' },
  { key: '测试中', title: '测试中' },
  { key: '已实现', title: '已实现' },
  { key: '已关闭', title: '已关闭' },
];

const STATUS_ORDER = STATUS_FLOW.map((s) => s.key);

const REJECTED_STEP = { key: '已拒绝', title: '已拒绝' };

// ==================== 组件 ====================

const RequirementDetailPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const [evaluateForm] = Form.useForm();
  const [mergeVersionForm] = Form.useForm();

  // ---------- 请求状态 ----------
  const [pageLoading, setPageLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [evaluateLoading, setEvaluateLoading] = useState(false);
  const [approveLoading, setApproveLoading] = useState(false);
  const [mergeLoading, setMergeLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);

  // ---------- 数据 ----------
  const [requirement, setRequirement] = useState(null);
  const [availableVersions, setAvailableVersions] = useState([]);
  const [products, setProducts] = useState([]);

  // ---------- 弹窗 ----------
  const [evaluateModalVisible, setEvaluateModalVisible] = useState(false);
  const [mergeVersionModalVisible, setMergeVersionModalVisible] = useState(false);

  // ==================== 数据获取 ====================

  const fetchRequirement = useCallback(async () => {
    setDetailLoading(true);
    try {
      const res = await axios.get(`/api/requirements/${id}`);
      const data = res.data;
      setRequirement(data);
      setNotFound(false);
    } catch (err) {
      if (err?.response?.status === 404) {
        setNotFound(true);
      } else {
        const errorMsg = err?.response?.data?.message || err?.message || '获取需求详情失败';
        message.error(errorMsg);
        setError(errorMsg);
      }
    } finally {
      setDetailLoading(false);
    }
  }, [id]);

  const fetchAvailableVersions = useCallback(async (productId) => {
    if (!productId) return;
    try {
      const res = await axios.get('/api/versions', {
        params: { product_id: productId, pageSize: 9999 },
      });
      const data = res.data || {};
      setAvailableVersions(data.items || []);
    } catch (err) {
      const errorMsg = err?.response?.data?.message || err?.message || '获取可选版本列表失败';
      message.error(errorMsg);
    }
  }, []);

  const fetchProducts = useCallback(async () => {
    try {
      const res = await axios.get('/api/products', { params: { pageSize: 9999 } });
      const data = res.data || {};
      setProducts(data.items || []);
    } catch {
      // 静默处理
    }
  }, []);

  const fetchAllData = useCallback(async () => {
    setPageLoading(true);
    setError(null);
    setNotFound(false);
    await Promise.all([fetchProducts()]);
    await fetchRequirement();
    setPageLoading(false);
  }, [fetchRequirement, fetchProducts]);

  useEffect(() => {
    fetchAllData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- 获取到需求数据后，拉取可选版本 ----------
  useEffect(() => {
    if (requirement?.product_id) {
      fetchAvailableVersions(requirement.product_id);
    }
  }, [requirement?.product_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ==================== 评估操作 ====================

  const handleOpenEvaluate = useCallback(() => {
    evaluateForm.resetFields();
    setEvaluateModalVisible(true);
  }, [evaluateForm]);

  const handleEvaluateCancel = useCallback(() => {
    setEvaluateModalVisible(false);
    evaluateForm.resetFields();
  }, [evaluateForm]);

  const handleEvaluateSubmit = useCallback(async () => {
    try {
      const values = await evaluateForm.validateFields();
      setEvaluateLoading(true);
      await axios.post(`/api/requirements/${id}/evaluate`, values);
      message.success('评估提交成功');
      setEvaluateModalVisible(false);
      evaluateForm.resetFields();
      fetchRequirement();
    } catch (err) {
      if (err?.errorFields) {
        return;
      }
      const errorMsg = err?.response?.data?.message || err?.message || '评估提交失败';
      message.error(errorMsg);
    } finally {
      setEvaluateLoading(false);
    }
  }, [evaluateForm, id, fetchRequirement]);

  // ==================== 审批操作 ====================

  const handleApprove = useCallback(async () => {
    setApproveLoading(true);
    try {
      await axios.post(`/api/requirements/${id}/approve-evaluation`, { approved: true });
      message.success('审批通过');
      fetchRequirement();
    } catch (err) {
      const errorMsg = err?.response?.data?.message || err?.message || '审批操作失败';
      message.error(errorMsg);
    } finally {
      setApproveLoading(false);
    }
  }, [id, fetchRequirement]);

  const handleReject = useCallback(async () => {
    setApproveLoading(true);
    try {
      await axios.post(`/api/requirements/${id}/approve-evaluation`, {
        approved: false,
        reject_reason: '驳回',
      });
      message.success('已驳回');
      fetchRequirement();
    } catch (err) {
      const errorMsg = err?.response?.data?.message || err?.message || '驳回操作失败';
      message.error(errorMsg);
    } finally {
      setApproveLoading(false);
    }
  }, [id, fetchRequirement]);

  // ==================== 合入版本操作 ====================

  const handleOpenMergeVersion = useCallback(() => {
    mergeVersionForm.resetFields();
    setMergeVersionModalVisible(true);
  }, [mergeVersionForm]);

  const handleMergeVersionCancel = useCallback(() => {
    setMergeVersionModalVisible(false);
    mergeVersionForm.resetFields();
  }, [mergeVersionForm]);

  const handleMergeVersionSubmit = useCallback(async () => {
    try {
      const values = await mergeVersionForm.validateFields();
      setMergeLoading(true);
      await axios.post(`/api/requirements/${id}/merge`, values);
      message.success('版本合入成功');
      setMergeVersionModalVisible(false);
      mergeVersionForm.resetFields();
      fetchRequirement();
    } catch (err) {
      if (err?.errorFields) {
        return;
      }
      const errorMsg = err?.response?.data?.message || err?.message || '版本合入失败';
      message.error(errorMsg);
    } finally {
      setMergeLoading(false);
    }
  }, [mergeVersionForm, id, fetchRequirement]);

  // ==================== 状态流转步骤 ====================

  const currentStatusIndex = useMemo(() => {
    if (!requirement) return -1;
    return STATUS_ORDER.indexOf(requirement.status);
  }, [requirement]);

  const stepsItems = useMemo(() => {
    const items = STATUS_FLOW.map((s) => ({
      title: s.title,
      description:
        requirement?.status === s.key ? (
          <Tag color={STATUS_MAP[s.key]?.color} style={{ marginTop: 4 }}>
            当前状态
          </Tag>
        ) : null,
    }));

    // 如果状态是已拒绝，追加已拒绝步骤
    if (requirement?.status === '已拒绝') {
      items.push({
        title: REJECTED_STEP.title,
        description: (
          <Tag color="red" style={{ marginTop: 4 }}>
            当前状态
          </Tag>
        ),
      });
    }

    return items;
  }, [requirement]);

  const rejectedStepIndex = useMemo(() => {
    if (requirement?.status === '已拒绝') {
      return STATUS_FLOW.length;
    }
    return -1;
  }, [requirement]);

  // ==================== 版本表格列定义 ====================

  const versionColumns = [
    {
      title: '版本号',
      dataIndex: 'version_no',
      key: 'version_no',
      width: 120,
      ellipsis: true,
      render: (val) => val || '-',
    },
    {
      title: '来源分支',
      dataIndex: 'source_branch',
      key: 'source_branch',
      width: 180,
      ellipsis: true,
      render: (val) => val || '-',
    },
    {
      title: '合入状态',
      dataIndex: 'merge_status',
      key: 'merge_status',
      width: 100,
      render: (val) => {
        const cfg = MERGE_STATUS_MAP[val];
        return cfg ? <Tag color={cfg.color}>{cfg.label}</Tag> : <span>{val || '-'}</span>;
      },
    },
    {
      title: '合入时间',
      dataIndex: 'merged_at',
      key: 'merged_at',
      width: 170,
      render: (val) => (val ? dayjs(val).format('YYYY-MM-DD HH:mm:ss') : '-'),
    },
    {
      title: '操作人',
      dataIndex: 'operator_name',
      key: 'operator_name',
      width: 100,
      ellipsis: true,
      render: (val) => val || '-',
    },
  ];

  // ==================== 标签渲染 ====================

  const renderStatusTag = (status) => {
    const cfg = STATUS_MAP[status];
    return cfg ? <Tag color={cfg.color}>{cfg.label}</Tag> : <span>{status || '-'}</span>;
  };

  const renderPriorityTag = (priority) => {
    const cfg = PRIORITY_MAP[priority];
    return cfg ? <Tag color={cfg.color}>{cfg.label}</Tag> : <span>{priority || '-'}</span>;
  };

  const renderSourceTag = (source) => {
    const cfg = SOURCE_MAP[source];
    return cfg ? <Tag color={cfg.color}>{cfg.label}</Tag> : <span>{source || '-'}</span>;
  };

  const renderEvaluateResultTag = (result) => {
    const cfg = EVALUATE_RESULT_MAP[result];
    return cfg ? <Tag color={cfg.color}>{cfg.label}</Tag> : <span>{result || '-'}</span>;
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
        <Text type="secondary">正在加载需求详情...</Text>
      </div>
    );
  }

  // ==================== 404 状态 ====================

  if (notFound) {
    return (
      <Result
        status="404"
        title="需求不存在"
        subTitle="未找到该需求，可能已被删除或链接无效。"
        extra={
          <Button type="primary" onClick={() => navigate('/requirements')}>
            返回需求列表
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

  // ==================== 数据为空 ====================

  if (!requirement && !detailLoading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '60vh',
        }}
      >
        <Empty description="暂无需求数据" />
      </div>
    );
  }

  // ==================== 主渲染 ====================

  const isPendingEvaluation = requirement?.status === '待评估';
  const isEvaluatingPendingApproval = requirement?.status === '评估待审批';
  const hasEvaluation = !!requirement?.evaluate_result;

  return (
    <div style={{ padding: '0 0 24px' }}>
      {/* 返回按钮 */}
      <div style={{ marginBottom: 16 }}>
        <Button
          type="link"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/requirements')}
          style={{ padding: 0 }}
        >
          返回需求列表
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
              <FormOutlined style={{ fontSize: 24, color: '#1677FF' }} />
              <Title level={3} style={{ margin: 0 }}>
                {requirement.title}
              </Title>
              {renderStatusTag(requirement.status)}
              {renderPriorityTag(requirement.priority)}
            </Space>
          </Col>
          <Col>
            <Space>
              {isPendingEvaluation && (
                <Button
                  type="primary"
                  icon={<EditOutlined />}
                  onClick={handleOpenEvaluate}
                >
                  填写评估
                </Button>
              )}
              {isEvaluatingPendingApproval && (
                <>
                  <Popconfirm
                    title="确认审批通过？"
                    description="通过后该需求将进入已规划状态"
                    onConfirm={handleApprove}
                    okText="确认"
                    cancelText="取消"
                  >
                    <Button
                      type="primary"
                      icon={<CheckOutlined />}
                      loading={approveLoading}
                    >
                      审批通过
                    </Button>
                  </Popconfirm>
                  <Popconfirm
                    title="确认审批驳回？"
                    description="驳回后该需求将回到待评估状态"
                    onConfirm={handleReject}
                    okText="确认"
                    cancelText="取消"
                  >
                    <Button
                      danger
                      icon={<CloseOutlined />}
                      loading={approveLoading}
                    >
                      审批驳回
                    </Button>
                  </Popconfirm>
                </>
              )}
              <Button icon={<BranchesOutlined />} onClick={handleOpenMergeVersion}>
                合入版本
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 需求信息与状态流转 */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          {/* 需求基本信息 */}
          <Card
            title="需求信息"
            style={{ borderRadius: 8 }}
            bodyStyle={{ padding: '24px' }}
          >
            <Spin spinning={detailLoading}>
              <Descriptions bordered column={{ xs: 1, sm: 2 }} size="middle">
                <Descriptions.Item label="编号">
                  {requirement.requirement_code || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="产品">
                  {requirement.product_name || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="模块">
                  {requirement.module || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="来源">
                  {renderSourceTag(requirement.source)}
                </Descriptions.Item>
                <Descriptions.Item label="提出人">
                  {requirement.proposer_name || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="优先级">
                  {renderPriorityTag(requirement.priority)}
                </Descriptions.Item>
                <Descriptions.Item label="期望日期">
                  {requirement.expected_date
                    ? dayjs(requirement.expected_date).format('YYYY-MM-DD')
                    : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="状态">
                  {renderStatusTag(requirement.status)}
                </Descriptions.Item>
                <Descriptions.Item label="创建时间">
                  {requirement.created_at
                    ? dayjs(requirement.created_at).format('YYYY-MM-DD HH:mm:ss')
                    : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="更新时间">
                  {requirement.updated_at
                    ? dayjs(requirement.updated_at).format('YYYY-MM-DD HH:mm:ss')
                    : '-'}
                </Descriptions.Item>
              </Descriptions>
            </Spin>
          </Card>

          {/* 需求描述 */}
          <Card
            title="需求描述"
            style={{ borderRadius: 8, marginTop: 16 }}
            bodyStyle={{ padding: '24px' }}
          >
            <Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
              {requirement.description || '暂无描述'}
            </Paragraph>
          </Card>

          {/* 评估信息 */}
          {hasEvaluation && (
            <Card
              title="评估信息"
              style={{ borderRadius: 8, marginTop: 16 }}
              bodyStyle={{ padding: '24px' }}
            >
              <Descriptions bordered column={1} size="middle">
                <Descriptions.Item label="评估结果">
                  {renderEvaluateResultTag(requirement.evaluate_result)}
                </Descriptions.Item>
                <Descriptions.Item label="评估意见">
                  <Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
                    {requirement.evaluate_opinion || '暂无'}
                  </Paragraph>
                </Descriptions.Item>
                <Descriptions.Item label="工作量估算">
                  {requirement.work_estimate || '暂无'}
                </Descriptions.Item>
                <Descriptions.Item label="排期建议">
                  <Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
                    {requirement.schedule_suggest || '暂无'}
                  </Paragraph>
                </Descriptions.Item>
              </Descriptions>
            </Card>
          )}
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
              current={
                requirement.status === '已拒绝'
                  ? STATUS_FLOW.length
                  : currentStatusIndex >= 0
                    ? currentStatusIndex
                    : 0
              }
              status={
                requirement.status === '已拒绝' ? 'error' : 'process'
              }
              size="small"
              items={stepsItems}
            />
          </Card>
        </Col>
      </Row>

      {/* 合入版本列表 */}
      <Divider style={{ margin: '24px 0 16px' }} />

      <Card
        title={
          <Space>
            <span>合入版本</span>
            <Tag>{(requirement?.versions || []).length}</Tag>
          </Space>
        }
        extra={
          <Space>
            <Button
              type="link"
              icon={<ReloadOutlined />}
              onClick={fetchRequirement}
              loading={detailLoading}
            >
              刷新
            </Button>
            <Button
              type="link"
              icon={<BranchesOutlined />}
              onClick={handleOpenMergeVersion}
            >
              合入版本
            </Button>
          </Space>
        }
        style={{ borderRadius: 8 }}
        bodyStyle={{ padding: '0 24px 24px' }}
      >
        <Table
          dataSource={requirement?.versions || []}
          columns={versionColumns}
          rowKey="version_item_id"
          loading={detailLoading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50'],
            showTotal: (total, range) => `共 ${total} 条，当前 ${range[0]}-${range[1]}`,
          }}
          scroll={{ x: 700 }}
          locale={{
            emptyText: <Empty description="暂未合入任何版本" />,
          }}
        />
      </Card>

      {/* 填写评估弹窗 */}
      <Modal
        title="填写评估"
        open={evaluateModalVisible}
        onCancel={handleEvaluateCancel}
        onOk={handleEvaluateSubmit}
        confirmLoading={evaluateLoading}
        destroyOnClose
        width={600}
        okText="提交评估"
        cancelText="取消"
      >
        <Form
          form={evaluateForm}
          layout="vertical"
          style={{ marginTop: 16 }}
          initialValues={{
            evaluate_result: undefined,
          }}
        >
          <Form.Item
            name="evaluate_result"
            label="评估结果"
            rules={[{ required: true, message: '请选择评估结果' }]}
          >
            <Select placeholder="请选择评估结果">
              {Object.entries(EVALUATE_RESULT_MAP).map(([key, cfg]) => (
                <Option key={key} value={key}>
                  {cfg.label}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="evaluate_opinion"
            label="评估意见"
            rules={[{ required: true, message: '请输入评估意见' }]}
          >
            <TextArea
              placeholder="请输入评估意见"
              rows={4}
              maxLength={2000}
              showCount
            />
          </Form.Item>

          <Form.Item
            name="work_estimate"
            label="工作量估算"
            rules={[{ required: true, message: '请输入工作量估算' }]}
          >
            <Input placeholder="例如：5人天、2周等" maxLength={100} />
          </Form.Item>

          <Form.Item
            name="schedule_suggest"
            label="排期建议"
            rules={[{ required: true, message: '请输入排期建议' }]}
          >
            <TextArea
              placeholder="请输入排期建议"
              rows={3}
              maxLength={1000}
              showCount
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 合入版本弹窗 */}
      <Modal
        title="合入版本"
        open={mergeVersionModalVisible}
        onCancel={handleMergeVersionCancel}
        onOk={handleMergeVersionSubmit}
        confirmLoading={mergeLoading}
        destroyOnClose
        width={560}
        okText="确认合入"
        cancelText="取消"
      >
        <Form
          form={mergeVersionForm}
          layout="vertical"
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="version_ids"
            label="选择版本"
            rules={[{ required: true, message: '请至少选择一个版本' }]}
            extra={`当前产品：${requirement?.product_name || '-'}`}
          >
            <Select
              mode="multiple"
              placeholder="请选择要合入的版本"
              showSearch
              filterOption={(input, option) =>
                (option?.children ?? '').toLowerCase().includes(input.toLowerCase())
              }
              style={{ width: '100%' }}
            >
              {availableVersions.map((v) => (
                <Option key={v.version_id} value={v.version_id}>
                  {v.version_no || v.version_name || `版本${v.version_id}`}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="source_branch" label="来源分支">
            <Input placeholder="请输入来源分支名称，如 feature/xxx" maxLength={100} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default RequirementDetailPage;