import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import dayjs from 'dayjs';
import {
  Row,
  Col,
  Card,
  Statistic,
  Select,
  DatePicker,
  Radio,
  Button,
  Space,
  Spin,
  Empty,
  Typography,
  message,
} from 'antd';
import {
  AppstoreOutlined,
  CodeOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  BugOutlined,
  ExperimentOutlined,
  DashboardOutlined,
  ReloadOutlined,
  RiseOutlined,
  ScheduleOutlined,
} from '@ant-design/icons';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

// ==================== 常量 ====================

const BRAND_BLUE = '#1677FF';

const REQUIREMENT_COLORS = [
  '#52C41A',
  '#FAAD14',
  '#FF4D4F',
  '#722ED1',
  '#13C2C2',
  '#2F54EB',
  '#FA8C16',
];

const ISSUE_COLORS = [
  '#FF4D4F',
  '#FAAD14',
  '#FF7A45',
  '#52C41A',
  '#1677FF',
  '#722ED1',
];

const TIME_DIMENSION_OPTIONS = [
  { label: '创建时间', value: 'created_at' },
  { label: '更新时间', value: 'updated_at' },
];

const INITIAL_STATS = {
  total_products: 0,
  planned_versions: 0,
  released_versions: 0,
  pending_requirements: 0,
  developing_requirements: 0,
  testing_requirements: 0,
  analyzing_issues: 0,
  regression_passed: 0,
};

const INITIAL_TRENDS = {
  version_trend: [],
  requirement_status_distribution: [],
  issue_severity_distribution: [],
};

// ==================== 组件 ====================

const DashboardPage = () => {
  // ---------- 请求状态 ----------
  const [pageLoading, setPageLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [trendsLoading, setTrendsLoading] = useState(false);
  const [error, setError] = useState(null);

  // ---------- 数据 ----------
  const [stats, setStats] = useState(INITIAL_STATS);
  const [trends, setTrends] = useState(INITIAL_TRENDS);
  const [productList, setProductList] = useState([]);
  const [categoryList, setCategoryList] = useState([]);

  // ---------- 筛选条件 ----------
  const [dateRange, setDateRange] = useState(null);
  const [timeDimension, setTimeDimension] = useState('created_at');
  const [selectedProductId, setSelectedProductId] = useState(undefined);
  const [selectedCategoryId, setSelectedCategoryId] = useState(undefined);

  // ==================== 构建查询参数 ====================

  const buildQueryParams = useCallback(() => {
    const params = {
      timeDimension,
    };
    if (selectedProductId) {
      params.product_id = selectedProductId;
    }
    if (selectedCategoryId) {
      params.category_id = selectedCategoryId;
    }
    if (dateRange && dateRange.length === 2) {
      params.startDate = dateRange[0].format('YYYY-MM-DD');
      params.endDate = dateRange[1].format('YYYY-MM-DD');
    }
    return params;
  }, [dateRange, timeDimension, selectedProductId, selectedCategoryId]);

  // ==================== 数据获取 ====================

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const params = buildQueryParams();
      const res = await axios.get('/api/dashboard/stats', { params });
      setStats(res.data || INITIAL_STATS);
    } catch (err) {
      const errorMsg =
        err?.response?.data?.message || err?.message || '获取统计数据失败';
      message.error(errorMsg);
      setError(errorMsg);
    } finally {
      setStatsLoading(false);
    }
  }, [buildQueryParams]);

  const fetchTrends = useCallback(async () => {
    setTrendsLoading(true);
    try {
      const params = buildQueryParams();
      const res = await axios.get('/api/dashboard/trends', { params });
      setTrends(res.data || INITIAL_TRENDS);
    } catch (err) {
      const errorMsg =
        err?.response?.data?.message || err?.message || '获取趋势数据失败';
      message.error(errorMsg);
    } finally {
      setTrendsLoading(false);
    }
  }, [buildQueryParams]);

  const fetchFilterOptions = useCallback(async () => {
    try {
      const [productRes, categoryRes] = await Promise.all([
        axios.get('/api/products', { params: { pageSize: 9999 } }),
        axios.get('/api/products/categories/all'),
      ]);
      setProductList(productRes.data?.items || []);
      setCategoryList(Array.isArray(categoryRes.data) ? categoryRes.data : []);
    } catch {
      // 筛选选项加载失败时静默处理
    }
  }, []);

  const fetchAllData = useCallback(async () => {
    setPageLoading(true);
    setError(null);
    await Promise.all([fetchStats(), fetchTrends(), fetchFilterOptions()]);
    setPageLoading(false);
  }, [fetchStats, fetchTrends, fetchFilterOptions]);

  // ---------- 初始化 ----------
  useEffect(() => {
    fetchAllData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- 筛选器变化时重新请求 ----------
  const handleFilterChange = useCallback(() => {
    setError(null);
    Promise.all([fetchStats(), fetchTrends()]);
  }, [fetchStats, fetchTrends]);

  const handleRefresh = useCallback(() => {
    setError(null);
    Promise.all([fetchStats(), fetchTrends()]);
  }, [fetchStats, fetchTrends]);

  // ==================== 筛选器渲染 ====================

  const renderFilterBar = () => (
    <Card
      style={{ marginBottom: 16, borderRadius: 8 }}
      bodyStyle={{ padding: '16px 24px' }}
    >
      <Row gutter={[16, 12]} align="middle">
        <Col>
          <Space>
            <Text type="secondary">时间维度</Text>
            <Radio.Group
              value={timeDimension}
              onChange={(e) => {
                setTimeDimension(e.target.value);
                // 延迟触发，等待 state 更新
                setTimeout(handleFilterChange, 0);
              }}
              optionType="button"
              buttonStyle="solid"
              size="small"
              options={TIME_DIMENSION_OPTIONS}
            />
          </Space>
        </Col>

        <Col>
          <Space>
            <Text type="secondary">日期范围</Text>
            <RangePicker
              value={dateRange}
              onChange={(dates) => {
                setDateRange(dates);
                setTimeout(handleFilterChange, 0);
              }}
              allowClear
              placeholder={['开始日期', '结束日期']}
              style={{ width: 240 }}
            />
          </Space>
        </Col>

        <Col>
          <Space>
            <Text type="secondary">产品</Text>
            <Select
              value={selectedProductId}
              onChange={(val) => {
                setSelectedProductId(val);
                setTimeout(handleFilterChange, 0);
              }}
              allowClear
              placeholder="全部产品"
              style={{ width: 180 }}
            >
              {productList.map((product) => (
                <Option key={product.product_id} value={product.product_id}>
                  {product.product_name}
                </Option>
              ))}
            </Select>
          </Space>
        </Col>

        <Col>
          <Space>
            <Text type="secondary">类别</Text>
            <Select
              value={selectedCategoryId}
              onChange={(val) => {
                setSelectedCategoryId(val);
                setTimeout(handleFilterChange, 0);
              }}
              allowClear
              placeholder="全部类别"
              style={{ width: 180 }}
            >
              {categoryList.map((category) => (
                <Option key={category.category_id} value={category.category_id}>
                  {category.category_name}
                </Option>
              ))}
            </Select>
          </Space>
        </Col>

        <Col flex="auto" style={{ textAlign: 'right' }}>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={handleRefresh}>
              刷新
            </Button>
          </Space>
        </Col>
      </Row>
    </Card>
  );

  // ==================== KPI 卡片 ====================

  const formatNumber = (value) => (value == null ? 0 : value);

  const kpiCards = [
    {
      key: 'total_products',
      title: '产品总数',
      value: stats.total_products,
      icon: <AppstoreOutlined />,
      color: '#1677FF',
    },
    {
      key: 'planned_versions',
      title: '规划中版本',
      value: stats.planned_versions,
      icon: <ScheduleOutlined />,
      color: '#722ED1',
    },
    {
      key: 'released_versions',
      title: '已发布版本',
      value: stats.released_versions,
      icon: <CheckCircleOutlined />,
      color: '#52C41A',
    },
    {
      key: 'pending_requirements',
      title: '待评估需求',
      value: stats.pending_requirements,
      icon: <FileTextOutlined />,
      color: '#FAAD14',
    },
    {
      key: 'developing_requirements',
      title: '开发中需求',
      value: stats.developing_requirements,
      icon: <CodeOutlined />,
      color: '#13C2C2',
    },
    {
      key: 'testing_requirements',
      title: '测试中需求',
      value: stats.testing_requirements,
      icon: <ExperimentOutlined />,
      color: '#2F54EB',
    },
    {
      key: 'analyzing_issues',
      title: '分析中Issue',
      value: stats.analyzing_issues,
      icon: <BugOutlined />,
      color: '#FF4D4F',
    },
    {
      key: 'regression_passed',
      title: '回归通过',
      value: stats.regression_passed,
      icon: <RiseOutlined />,
      color: '#FA8C16',
    },
  ];

  const renderKpiCards = () => (
    <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
      {kpiCards.map((kpi) => (
        <Col xs={24} sm={12} md={6} lg={6} xl={3} key={kpi.key}>
          <Card
            hoverable
            style={{
              borderRadius: 8,
              borderTop: `3px solid ${kpi.color}`,
            }}
            bodyStyle={{ padding: '16px 20px' }}
          >
            <Statistic
              title={
                <Space size={6}>
                  <span style={{ color: kpi.color, fontSize: 14 }}>
                    {kpi.icon}
                  </span>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {kpi.title}
                  </Text>
                </Space>
              }
              value={formatNumber(kpi.value)}
              valueStyle={{
                fontSize: 28,
                fontWeight: 700,
                color: kpi.color,
              }}
              loading={statsLoading}
            />
          </Card>
        </Col>
      ))}
    </Row>
  );

  // ==================== 图表区域 ====================

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div
          style={{
            background: '#fff',
            border: '1px solid #f0f0f0',
            borderRadius: 6,
            padding: '8px 12px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          }}
        >
          <Text strong style={{ fontSize: 13 }}>
            {label}
          </Text>
          {payload.map((entry, idx) => (
            <div key={idx} style={{ marginTop: 4 }}>
              <span
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: entry.color,
                  marginRight: 6,
                }}
              />
              <Text style={{ fontSize: 12 }}>
                {entry.name}: {entry.value}
              </Text>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  const renderPieLabel = ({ name, percent }) => {
    return `${name} ${(percent * 100).toFixed(0)}%`;
  };

  const renderCharts = () => {
    const hasVersionTrend =
      trends.version_trend && trends.version_trend.length > 0;
    const hasRequirementDist =
      trends.requirement_status_distribution &&
      trends.requirement_status_distribution.length > 0;
    const hasIssueDist =
      trends.issue_severity_distribution &&
      trends.issue_severity_distribution.length > 0;

    return (
      <Row gutter={[16, 16]}>
        {/* 版本趋势 - 折线图 */}
        <Col xs={24} lg={8}>
          <Card
            title={
              <Space>
                <RiseOutlined style={{ color: BRAND_BLUE }} />
                <span>版本趋势</span>
              </Space>
            }
            style={{ borderRadius: 8, height: '100%' }}
            bodyStyle={{ padding: '16px' }}
          >
            {trendsLoading ? (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  height: 300,
                }}
              >
                <Spin />
              </div>
            ) : !hasVersionTrend ? (
              <Empty
                description="暂无版本趋势数据"
                style={{ padding: '40px 0' }}
              />
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart
                  data={trends.version_trend}
                  margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="count"
                    name="版本数量"
                    stroke={BRAND_BLUE}
                    strokeWidth={2}
                    dot={{ r: 3, fill: BRAND_BLUE }}
                    activeDot={{ r: 5, fill: BRAND_BLUE }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>

        {/* 需求状态分布 - 柱状图 */}
        <Col xs={24} lg={8}>
          <Card
            title={
              <Space>
                <FileTextOutlined style={{ color: '#52C41A' }} />
                <span>需求状态分布</span>
              </Space>
            }
            style={{ borderRadius: 8, height: '100%' }}
            bodyStyle={{ padding: '16px' }}
          >
            {trendsLoading ? (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  height: 300,
                }}
              >
                <Spin />
              </div>
            ) : !hasRequirementDist ? (
              <Empty
                description="暂无需求状态分布数据"
                style={{ padding: '40px 0' }}
              />
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart
                  data={trends.requirement_status_distribution}
                  margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    angle={-20}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar
                    dataKey="value"
                    name="需求数量"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={48}
                  >
                    {trends.requirement_status_distribution.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={REQUIREMENT_COLORS[index % REQUIREMENT_COLORS.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>

        {/* 问题单严重度分布 - 饼图 */}
        <Col xs={24} lg={8}>
          <Card
            title={
              <Space>
                <BugOutlined style={{ color: '#FF4D4F' }} />
                <span>问题单严重度分布</span>
              </Space>
            }
            style={{ borderRadius: 8, height: '100%' }}
            bodyStyle={{ padding: '16px' }}
          >
            {trendsLoading ? (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  height: 300,
                }}
              >
                <Spin />
              </div>
            ) : !hasIssueDist ? (
              <Empty
                description="暂无问题单严重度分布数据"
                style={{ padding: '40px 0' }}
              />
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <PieChart margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <Pie
                    data={trends.issue_severity_distribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={100}
                    paddingAngle={3}
                    dataKey="value"
                    nameKey="name"
                    label={renderPieLabel}
                    labelLine={{ stroke: '#ccc', strokeWidth: 1 }}
                  >
                    {trends.issue_severity_distribution.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={ISSUE_COLORS[index % ISSUE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: 12 }}
                    layout="horizontal"
                    align="center"
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Col>
      </Row>
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
        <Text type="secondary">正在加载仪表盘数据...</Text>
      </div>
    );
  }

  // ==================== 错误状态 ====================

  if (error && !statsLoading && !trendsLoading) {
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
          <DashboardOutlined style={{ marginRight: 8, color: BRAND_BLUE }} />
          仪表盘
        </Title>
      </div>

      {/* 筛选栏 */}
      {renderFilterBar()}

      {/* KPI 卡片 */}
      {renderKpiCards()}

      {/* 图表区域 */}
      {renderCharts()}
    </div>
  );
};

export default DashboardPage;