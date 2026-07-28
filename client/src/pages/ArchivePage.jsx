import React, { useState, useRef } from 'react';
import {
  Card,
  Row,
  Col,
  Button,
  Space,
  Typography,
  Upload,
  Table,
  Tag,
  Modal,
  Radio,
  Alert,
  Statistic,
  Descriptions,
  Tabs,
  message,
  Spin,
  List,
  Divider,
} from 'antd';
import {
  InboxOutlined,
  CloudDownloadOutlined,
  CloudUploadOutlined,
  FileTextOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import axios from 'axios';

const { Title, Text, Paragraph } = Typography;
const { Dragger } = Upload;
const { TabPane } = Tabs;

const ArchivePage = () => {
  const [activeTab, setActiveTab] = useState('export');

  // ---------- Export ----------
  const [productOptions, setProductOptions] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [exporting, setExporting] = useState(false);
  const [exportStats, setExportStats] = useState(null);

  // ---------- Import ----------
  const fileInputRef = useRef(null);
  const [importFile, setImportFile] = useState(null);
  const [importArchive, setImportArchive] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [importMode, setImportMode] = useState('skip');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  // Load product options when switching to export tab
  const loadProducts = async () => {
    if (productOptions.length > 0) return;
    try {
      const res = await axios.get('/api/products', { params: { pageSize: 999 } });
      const items = res.data?.items || res.data || [];
      setProductOptions(Array.isArray(items) ? items : []);
    } catch (e) {
      // non-critical
    }
  };

  const handleTabChange = (key) => {
    setActiveTab(key);
    if (key === 'export') loadProducts();
  };

  // ---------- Export handlers ----------
  const handleExportAll = async () => {
    setExporting(true);
    try {
      const res = await axios.get('/api/archive/export', {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      const disposition = res.headers['content-disposition'];
      const filename = disposition
        ? disposition.split('filename=')[1]?.replace(/"/g, '')
        : 'ipms-archive.json';
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      message.success('归档导出成功');
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || '导出失败';
      message.error(msg);
    } finally {
      setExporting(false);
    }
  };

  // ---------- Import handlers ----------
  const handleFileSelect = (file) => {
    if (!file) return;
    setImportFile(file);
    setPreviewData(null);
    setImportResult(null);
    setImportArchive(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target.result;
        const parsed = JSON.parse(content);
        setImportArchive(parsed);
        message.success('文件解析成功，点击「预览冲突检测」查看详情');
      } catch (err) {
        message.error('文件解析失败：不是有效的 JSON 文件');
        setImportFile(null);
      }
    };
    reader.readAsText(file);
    return false; // prevent auto upload
  };

  const handlePreview = async () => {
    if (!importArchive) {
      message.warning('请先选择归档文件');
      return;
    }
    setPreviewLoading(true);
    try {
      const res = await axios.post('/api/archive/preview', { archive: importArchive });
      setPreviewData(res.data);
      message.success('预览完成');
    } catch (err) {
      const msg = err?.response?.data?.error || err.message || '预览失败';
      message.error(msg);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleImport = async () => {
    if (!importArchive) {
      message.warning('请先选择归档文件');
      return;
    }
    Modal.confirm({
      title: '确认导入',
      content: (
        <div>
          <p>导入模式：<b>{importMode === 'skip' ? '跳过已有数据' : importMode === 'overwrite' ? '覆盖已有数据' : '作为新数据复制'}</b></p>
          <p type="danger">此操作不可撤销，确定继续吗？</p>
        </div>
      ),
      okText: '确认导入',
      cancelText: '取消',
      onOk: async () => {
        setImporting(true);
        try {
          const res = await axios.post('/api/archive/import', {
            archive: importArchive,
            mode: importMode,
          });
          setImportResult(res.data);
          message.success('导入完成');
        } catch (err) {
          const msg = err?.response?.data?.error || err.message || '导入失败';
          message.error(msg);
        } finally {
          setImporting(false);
        }
      },
    });
  };

  const handleResetImport = () => {
    setImportFile(null);
    setImportArchive(null);
    setPreviewData(null);
    setImportResult(null);
    setImportMode('skip');
  };

  // ---------- Render ----------

  const renderExportTab = () => (
    <Row gutter={[16, 16]}>
      <Col xs={24} md={12}>
        <Card
          title={
            <Space>
              <CloudDownloadOutlined style={{ color: '#1890ff' }} />
              <span>全量归档</span>
            </Space>
          }
          size="small"
        >
          <Paragraph type="secondary">
            导出系统中所有产品、版本、需求、问题单、变更申请等完整数据为 JSON 格式归档文件。
            归档文件可在外部使用文本编辑器或浏览器直接打开查看，也可用于系统回档。
          </Paragraph>
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <Button
              type="primary"
              size="large"
              icon={<CloudDownloadOutlined />}
              loading={exporting}
              onClick={handleExportAll}
            >
              导出全量归档
            </Button>
          </div>
          <Descriptions size="small" column={1} bordered>
            <Descriptions.Item label="格式">JSON (UTF-8)</Descriptions.Item>
            <Descriptions.Item label="内容">产品、版本、需求、问题单、变更申请、合入项</Descriptions.Item>
            <Descriptions.Item label="用途">数据备份、迁移、外部查看</Descriptions.Item>
          </Descriptions>
        </Card>
      </Col>
      <Col xs={24} md={12}>
        <Card
          title={
            <Space>
              <FileTextOutlined style={{ color: '#52c41a' }} />
              <span>归档说明</span>
            </Space>
          }
          size="small"
        >
          <List
            size="small"
            dataSource={[
              '归档文件为标准 JSON 格式，可用任意文本编辑器打开查看',
              '归档包含完整的数据结构和元信息，便于系统间迁移',
              '回档时支持三种模式：跳过、覆盖、复制',
              '建议定期进行全量归档，以防数据丢失',
              '归档文件不包含用户密码等敏感信息',
            ]}
            renderItem={(item) => (
              <List.Item>
                <Space>
                  <CheckCircleOutlined style={{ color: '#52c41a' }} />
                  <Text>{item}</Text>
                </Space>
              </List.Item>
            )}
          />
        </Card>
      </Col>
    </Row>
  );

  const renderImportTab = () => (
    <div>
      {!importResult ? (
        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <Card
              title={
                <Space>
                  <CloudUploadOutlined style={{ color: '#fa8c16' }} />
                  <span>选择归档文件</span>
                </Space>
              }
              size="small"
            >
              <Dragger
                accept=".json"
                showUploadList={false}
                beforeUpload={handleFileSelect}
                fileList={importFile ? [importFile] : []}
                style={{ marginBottom: 16 }}
              >
                <p className="ant-upload-drag-icon">
                  <InboxOutlined />
                </p>
                <p className="ant-upload-text">点击或拖拽归档文件到此处</p>
                <p className="ant-upload-hint">支持 .json 格式的归档文件</p>
              </Dragger>

              {importArchive?.meta && (
                <Alert
                  type="success"
                  showIcon
                  message="文件已就绪"
                  description={
                    <Descriptions size="small" column={1}>
                      <Descriptions.Item label="系统">
                        {importArchive.meta.system}
                      </Descriptions.Item>
                      <Descriptions.Item label="归档版本">
                        {importArchive.meta.archive_version}
                      </Descriptions.Item>
                      <Descriptions.Item label="创建时间">
                        {importArchive.meta.created_at}
                      </Descriptions.Item>
                      <Descriptions.Item label="创建人">
                        {importArchive.meta.created_by}
                      </Descriptions.Item>
                      <Descriptions.Item label="范围">
                        {importArchive.meta.scope === 'all_products' ? '全量' : '部分产品'}
                      </Descriptions.Item>
                    </Descriptions>
                  }
                />
              )}

              <div style={{ marginTop: 16, textAlign: 'center' }}>
                <Space>
                  <Button
                    type="primary"
                    icon={<InfoCircleOutlined />}
                    onClick={handlePreview}
                    disabled={!importArchive}
                    loading={previewLoading}
                  >
                    预览冲突检测
                  </Button>
                  <Button
                    danger
                    icon={<CloudUploadOutlined />}
                    onClick={handleImport}
                    disabled={!importArchive}
                    loading={importing}
                  >
                    开始回档
                  </Button>
                  <Button onClick={handleResetImport} disabled={!importFile}>
                    重置
                  </Button>
                </Space>
              </div>
            </Card>
          </Col>

          <Col xs={24} md={12}>
            <Card
              title={
                <Space>
                  <WarningOutlined style={{ color: '#faad14' }} />
                  <span>回档模式</span>
                </Space>
              }
              size="small"
            >
              <Radio.Group
                value={importMode}
                onChange={(e) => setImportMode(e.target.value)}
                style={{ width: '100%' }}
              >
                <Radio value="skip" style={{ display: 'block', marginBottom: 12 }}>
                  <Text strong>跳过模式</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    已有ID的数据跳过不导入，仅导入新增的数据。最安全的模式。
                  </Text>
                </Radio>
                <Radio value="overwrite" style={{ display: 'block', marginBottom: 12 }}>
                  <Text strong>覆盖模式</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    已有ID的数据将被归档中的数据覆盖。请谨慎操作。
                  </Text>
                </Radio>
                <Radio value="copy" style={{ display: 'block' }}>
                  <Text strong>复制模式</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    所有数据作为全新记录导入（生成新ID），不影响现有数据。
                  </Text>
                </Radio>
              </Radio.Group>
            </Card>

            {previewData && (
              <Card
                title={
                  <Space>
                    <InfoCircleOutlined style={{ color: '#1890ff' }} />
                    <span>预览结果</span>
                  </Space>
                }
                size="small"
                style={{ marginTop: 16 }}
              >
                <Row gutter={[8, 8]}>
                  <Col span={12}>
                    <Statistic title="产品数" value={previewData.stats?.product_count || 0} />
                  </Col>
                  <Col span={12}>
                    <Statistic title="版本数" value={previewData.stats?.version_count || 0} />
                  </Col>
                  <Col span={12}>
                    <Statistic title="需求数" value={previewData.stats?.requirement_count || 0} />
                  </Col>
                  <Col span={12}>
                    <Statistic title="问题单数" value={previewData.stats?.issue_count || 0} />
                  </Col>
                </Row>
                {previewData.total_conflicts > 0 && (
                  <Alert
                    type="warning"
                    showIcon
                    style={{ marginTop: 12 }}
                    message={`检测到 ${previewData.total_conflicts} 条冲突数据`}
                    description={
                      <div>
                        {previewData.conflicts?.products?.length > 0 && (
                          <div>产品冲突：{previewData.conflicts.products.length} 条</div>
                        )}
                        {previewData.conflicts?.versions?.length > 0 && (
                          <div>版本冲突：{previewData.conflicts.versions.length} 条</div>
                        )}
                        {previewData.conflicts?.requirements?.length > 0 && (
                          <div>需求冲突：{previewData.conflicts.requirements.length} 条</div>
                        )}
                        {previewData.conflicts?.issues?.length > 0 && (
                          <div>问题单冲突：{previewData.conflicts.issues.length} 条</div>
                        )}
                      </div>
                    }
                  />
                )}
                {previewData.total_conflicts === 0 && (
                  <Alert
                    type="success"
                    showIcon
                    style={{ marginTop: 12 }}
                    message="无冲突，所有数据均可正常导入"
                  />
                )}
              </Card>
            )}
          </Col>
        </Row>
      ) : (
        <Card
          title={
            <Space>
              <CheckCircleOutlined style={{ color: '#52c41a' }} />
              <span>回档完成</span>
            </Space>
          }
          size="small"
        >
          <Alert
            type="success"
            showIcon
            message="数据回档成功"
            description={`共导入 ${importResult.total_imported} 条，跳过 ${importResult.total_skipped} 条`}
            style={{ marginBottom: 16 }}
          />
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} md={8}>
              <Statistic title="导入模式" value={importResult.result?.mode} prefix={<Tag color="blue">{importResult.result?.mode}</Tag>} />
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Statistic title="总导入数" value={importResult.total_imported} valueStyle={{ color: '#52c41a' }} />
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Statistic title="总跳过数" value={importResult.total_skipped} valueStyle={{ color: '#faad14' }} />
            </Col>
          </Row>
          <Divider />
          <Descriptions size="small" bordered column={2}>
            <Descriptions.Item label="产品分类">{importResult.result?.imported?.product_categories || 0}</Descriptions.Item>
            <Descriptions.Item label="产品">{importResult.result?.imported?.products || 0}</Descriptions.Item>
            <Descriptions.Item label="版本">{importResult.result?.imported?.versions || 0}</Descriptions.Item>
            <Descriptions.Item label="需求">{importResult.result?.imported?.requirements || 0}</Descriptions.Item>
            <Descriptions.Item label="问题单">{importResult.result?.imported?.issues || 0}</Descriptions.Item>
            <Descriptions.Item label="变更申请">{importResult.result?.imported?.change_requests || 0}</Descriptions.Item>
            <Descriptions.Item label="合入项">{importResult.result?.imported?.version_items || 0}</Descriptions.Item>
            <Descriptions.Item label="错误数">{importResult.result?.errors?.length || 0}</Descriptions.Item>
          </Descriptions>
          {importResult.result?.errors?.length > 0 && (
            <Alert
              type="error"
              showIcon
              style={{ marginTop: 16 }}
              message={`有 ${importResult.result.errors.length} 条错误`}
              description={
                <ul>
                  {importResult.result.errors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              }
            />
          )}
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <Button onClick={handleResetImport}>继续回档</Button>
          </div>
        </Card>
      )}
    </div>
  );

  return (
    <div style={{ padding: 16 }}>
      <Typography.Title level={4} style={{ marginBottom: 16 }}>
        数据归档 / 回档
      </Typography.Title>

      <Card size="small">
        <Tabs activeKey={activeTab} onChange={handleTabChange}>
          <TabPane tab="归档导出" key="export" />
          <TabPane tab="回档导入" key="import" />
        </Tabs>

        <div style={{ marginTop: 16 }}>
          {activeTab === 'export' && renderExportTab()}
          {activeTab === 'import' && renderImportTab()}
        </div>
      </Card>
    </div>
  );
};

export default ArchivePage;
