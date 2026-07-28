import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import {
  Tree,
  Form,
  Input,
  InputNumber,
  TreeSelect,
  Button,
  Card,
  Space,
  Row,
  Col,
  Popconfirm,
  message,
  Spin,
  Empty,
  Typography,
  Divider,
  Dropdown,
  Modal,
  Tag,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  FolderOutlined,
  FolderAddOutlined,
  ApartmentOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';

const { Title, Text } = Typography;
const { TreeNode } = Tree;

// ==================== 组件 ====================

const CategoryPage = () => {
  const [form] = Form.useForm();

  // ---------- 请求状态 ----------
  const [pageLoading, setPageLoading] = useState(true);
  const [treeLoading, setTreeLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState(null);

  // ---------- 数据 ----------
  const [categories, setCategories] = useState([]);
  const [treeData, setTreeData] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [expandedKeys, setExpandedKeys] = useState([]);

  // ---------- 操作模式 ----------
  const [formMode, setFormMode] = useState('view'); // 'view' | 'edit' | 'add_child' | 'add_root'
  const [addParentId, setAddParentId] = useState(null);

  // ---------- 右键菜单 ----------
  const [contextMenuVisible, setContextMenuVisible] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const [contextMenuNode, setContextMenuNode] = useState(null);

  const [modal, contextHolder] = Modal.useModal();

  // ==================== 构建树形数据 ====================

  const buildTree = useCallback((list) => {
    if (!list || list.length === 0) return [];
    const map = {};
    const roots = [];
    list.forEach((item) => {
      map[item.category_id] = {
        key: item.category_id,
        title: item.category_name || item.name,
        value: item.category_id,
        ...item,
        children: [],
      };
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

  // ==================== 数据获取 ====================

  const fetchCategories = useCallback(async () => {
    setTreeLoading(true);
    try {
      const res = await axios.get('/api/products/categories/all');
      const data = res.data || {};
      const list = Array.isArray(data) ? data : [];
      setCategories(list);
      const tree = buildTree(list);
      setTreeData(tree);
    } catch (err) {
      const errorMsg = err?.response?.data?.message || err?.message || '获取分类数据失败';
      message.error(errorMsg);
      setError(errorMsg);
    } finally {
      setTreeLoading(false);
    }
  }, [buildTree]);

  useEffect(() => {
    setPageLoading(true);
    fetchCategories().finally(() => setPageLoading(false));
  }, [fetchCategories]);

  // ==================== 选中节点处理 ====================

  const handleTreeSelect = useCallback(
    (selectedKeys, info) => {
      if (selectedKeys.length === 0) {
        setSelectedNode(null);
        setFormMode('view');
        form.resetFields();
        return;
      }
      const node = info.node;
      // 从 categories 中找到完整数据
      const fullCategory = categories.find((c) => c.category_id === node.key);
      if (fullCategory) {
        setSelectedNode(fullCategory);
        setFormMode('view');
        form.setFieldsValue({
          category_name: fullCategory.category_name || fullCategory.name,
          parent_id: fullCategory.parent_id || undefined,
          description: fullCategory.description,
          sort: fullCategory.sort ?? 0,
        });
      }
    },
    [categories, form],
  );

  const handleTreeExpand = useCallback((keys) => {
    setExpandedKeys(keys);
  }, []);

  // ==================== 右键菜单 ====================

  const handleRightClick = useCallback(
    ({ event, node }) => {
      event.preventDefault();
      const fullCategory = categories.find((c) => c.category_id === node.key);
      setContextMenuNode(fullCategory || node);
      setContextMenuPos({ x: event.clientX, y: event.clientY });
      setContextMenuVisible(true);
    },
    [categories],
  );

  const handleContextMenuClose = useCallback(() => {
    setContextMenuVisible(false);
    setContextMenuNode(null);
  }, []);

  // ==================== 表单操作 ====================

  const handleDeselect = useCallback(() => {
    setSelectedNode(null);
    setFormMode('view');
    setAddParentId(null);
    form.resetFields();
  }, [form]);

  // ---------- 添加子节点 ----------

  const handleAddChild = useCallback(() => {
    if (!selectedNode) {
      message.warning('请先选择一个父节点');
      return;
    }
    setFormMode('add_child');
    setAddParentId(selectedNode.category_id);
    form.resetFields();
    form.setFieldsValue({
      parent_id: selectedNode.category_id,
      sort: 0,
    });
  }, [selectedNode, form]);

  // ---------- 添加根节点 ----------

  const handleAddRoot = useCallback(() => {
    setFormMode('add_root');
    setAddParentId(null);
    setSelectedNode(null);
    form.resetFields();
    form.setFieldsValue({
      sort: 0,
    });
  }, [form]);

  // ---------- 编辑节点 ----------

  const handleEdit = useCallback(() => {
    if (!selectedNode) {
      message.warning('请先选择一个节点');
      return;
    }
    setFormMode('edit');
    form.setFieldsValue({
      category_name: selectedNode.category_name || selectedNode.name,
      parent_id: selectedNode.parent_id || undefined,
      description: selectedNode.description,
      sort: selectedNode.sort ?? 0,
    });
  }, [selectedNode, form]);

  // ---------- 删除节点 ----------

  const handleDelete = useCallback(async () => {
    if (!selectedNode) return;

    // 检查是否有子节点
    const hasChildren = categories.some((c) => c.parent_id === selectedNode.category_id);
    if (hasChildren) {
      message.error('该分类下存在子分类，请先删除子分类');
      return;
    }

    try {
      await axios.delete(`/api/products/categories/${selectedNode.category_id}`);
      message.success('分类删除成功');
      setSelectedNode(null);
      setFormMode('view');
      setAddParentId(null);
      form.resetFields();
      fetchCategories();
    } catch (err) {
      const errorMsg = err?.response?.data?.message || err?.message || '删除失败';
      message.error(errorMsg);
    }
  }, [selectedNode, categories, form, fetchCategories]);

  // ---------- 提交表单 ----------

  const handleSubmit = useCallback(async () => {
    try {
      const values = await form.validateFields();
      setSubmitLoading(true);

      if (formMode === 'edit') {
        await axios.put(`/api/products/categories/${selectedNode.category_id}`, values);
        message.success('分类更新成功');
      } else if (formMode === 'add_child') {
        await axios.post('/api/products/categories', {
          ...values,
          parent_id: addParentId,
        });
        message.success('子分类创建成功');
      } else if (formMode === 'add_root') {
        await axios.post('/api/products/categories', values);
        message.success('根分类创建成功');
      }

      setFormMode('view');
      setAddParentId(null);
      form.resetFields();
      await fetchCategories();
      // 重新选中节点（如果是编辑模式）
      if (formMode === 'edit' && selectedNode) {
        setSelectedNode(null);
      }
    } catch (err) {
      if (err?.errorFields) {
        return;
      }
      const errorMsg = err?.response?.data?.message || err?.message || '操作失败';
      message.error(errorMsg);
    } finally {
      setSubmitLoading(false);
    }
  }, [form, formMode, selectedNode, addParentId, fetchCategories]);

  const handleFormCancel = useCallback(() => {
    setFormMode('view');
    setAddParentId(null);
    if (selectedNode) {
      form.setFieldsValue({
        category_name: selectedNode.category_name || selectedNode.name,
        parent_id: selectedNode.parent_id || undefined,
        description: selectedNode.description,
        sort: selectedNode.sort ?? 0,
      });
    } else {
      form.resetFields();
    }
  }, [form, selectedNode]);

  // ==================== 右键菜单项 ====================

  const contextMenuItems = [
    {
      key: 'add_child',
      label: (
        <Space>
          <FolderAddOutlined />
          <span>添加子节点</span>
        </Space>
      ),
      onClick: () => {
        if (contextMenuNode) {
          // 选中右键的节点
          const fullCategory = categories.find((c) => c.category_id === contextMenuNode.category_id);
          if (fullCategory) {
            setSelectedNode(fullCategory);
            setFormMode('add_child');
            setAddParentId(fullCategory.category_id);
            form.resetFields();
            form.setFieldsValue({
              parent_id: fullCategory.category_id,
              sort: 0,
            });
          }
        }
        handleContextMenuClose();
      },
    },
    {
      key: 'edit',
      label: (
        <Space>
          <EditOutlined />
          <span>编辑节点</span>
        </Space>
      ),
      onClick: () => {
        if (contextMenuNode) {
          const fullCategory = categories.find((c) => c.category_id === contextMenuNode.category_id);
          if (fullCategory) {
            setSelectedNode(fullCategory);
            setFormMode('edit');
            form.setFieldsValue({
              category_name: fullCategory.category_name || fullCategory.name,
              parent_id: fullCategory.parent_id || undefined,
              description: fullCategory.description,
              sort: fullCategory.sort ?? 0,
            });
          }
        }
        handleContextMenuClose();
      },
    },
    {
      type: 'divider',
    },
    {
      key: 'delete',
      label: (
        <Space>
          <DeleteOutlined />
          <span style={{ color: '#ff4d4f' }}>删除节点</span>
        </Space>
      ),
      danger: true,
      onClick: () => {
        if (contextMenuNode) {
          const fullCategory = categories.find((c) => c.category_id === contextMenuNode.category_id);
          if (fullCategory) {
            setSelectedNode(fullCategory);
            // 检查是否有子节点
            const hasChildren = categories.some((c) => c.parent_id === fullCategory.category_id);
            if (hasChildren) {
              message.error('该分类下存在子分类，请先删除子分类');
            } else {
              modal.confirm({
                title: '确认删除',
                icon: <ExclamationCircleOutlined />,
                content: `确定要删除分类「${fullCategory.category_name || fullCategory.name}」吗？删除后不可恢复。`,
                okText: '确定',
                cancelText: '取消',
                okType: 'danger',
                onOk: async () => {
                  try {
                    await axios.delete(`/api/products/categories/${fullCategory.category_id}`);
                    message.success('分类删除成功');
                    setSelectedNode(null);
                    setFormMode('view');
                    setAddParentId(null);
                    form.resetFields();
                    fetchCategories();
                  } catch (err) {
                    const errorMsg = err?.response?.data?.message || err?.message || '删除失败';
                    message.error(errorMsg);
                  }
                },
              });
            }
          }
        }
        handleContextMenuClose();
      },
    },
  ];

  // ==================== 构建 TreeSelect 数据 ====================

  const buildTreeSelectData = useCallback((list) => {
    if (!list || list.length === 0) return [];
    const map = {};
    const roots = [];
    list.forEach((item) => {
      map[item.category_id] = {
        value: item.category_id,
        title: item.category_name || item.name,
        ...item,
        children: [],
      };
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

  const treeSelectData = buildTreeSelectData(categories);

  // ==================== 状态判断 ====================

  const isFormDisabled = formMode === 'view';
  const isEditing = formMode === 'edit';
  const isAdding = formMode === 'add_child' || formMode === 'add_root';

  let formTitle = '查看分类';
  if (formMode === 'edit') formTitle = '编辑分类';
  if (formMode === 'add_child') formTitle = '添加子分类';
  if (formMode === 'add_root') formTitle = '添加根分类';

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
        <Text type="secondary">正在加载分类数据...</Text>
      </div>
    );
  }

  // ==================== 错误状态 ====================

  if (error && !treeLoading) {
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
          <Button type="primary" onClick={fetchCategories}>
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
          <ApartmentOutlined style={{ marginRight: 8, color: '#1677FF' }} />
          产品分类管理
        </Title>
      </div>

      {/* 主体：左右布局 */}
      <Row gutter={16}>
        {/* 左侧 - 树 */}
        <Col xs={24} lg={10}>
          <Card
            title={
              <Space>
                <FolderOutlined />
                <span>分类树</span>
                <Tag>{categories.length}</Tag>
              </Space>
            }
            extra={
              <Space>
                <Button
                  type="primary"
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={handleAddRoot}
                >
                  添加根节点
                </Button>
                <Button
                  size="small"
                  icon={<ReloadOutlined />}
                  onClick={fetchCategories}
                  loading={treeLoading}
                />
              </Space>
            }
            style={{ borderRadius: 8, height: '100%' }}
            bodyStyle={{ padding: '12px 16px', minHeight: 500 }}
          >
            {treeLoading ? (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  minHeight: 400,
                }}
              >
                <Spin />
              </div>
            ) : treeData.length === 0 ? (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  minHeight: 400,
                }}
              >
                <Empty description="暂无分类数据，请点击上方按钮添加根节点" />
              </div>
            ) : (
              <Dropdown
                menu={{ items: contextMenuItems }}
                trigger={['contextMenu']}
                open={contextMenuVisible}
                onOpenChange={(open) => {
                  if (!open) handleContextMenuClose();
                }}
              >
                <div style={{ overflow: 'auto', maxHeight: 520 }}>
                  <Tree
                    showLine={{ showLeafIcon: false }}
                    showIcon
                    icon={<FolderOutlined style={{ color: '#1677FF' }} />}
                    treeData={treeData}
                    selectedKeys={selectedNode ? [selectedNode.category_id] : []}
                    expandedKeys={expandedKeys}
                    onExpand={handleTreeExpand}
                    onSelect={handleTreeSelect}
                    onRightClick={handleRightClick}
                    blockNode
                    style={{ fontSize: 14 }}
                  />
                </div>
              </Dropdown>
            )}
          </Card>
        </Col>

        {/* 右侧 - 表单 */}
        <Col xs={24} lg={14}>
          <Card
            title={
              <Space>
                <EditOutlined />
                <span>{formTitle}</span>
              </Space>
            }
            extra={
              <Space>
                {isEditing || isAdding ? (
                  <>
                    <Button onClick={handleFormCancel}>取消</Button>
                    <Button
                      type="primary"
                      onClick={handleSubmit}
                      loading={submitLoading}
                    >
                      保存
                    </Button>
                  </>
                ) : (
                  <Space>
                    <Button
                      icon={<EditOutlined />}
                      onClick={handleEdit}
                      disabled={!selectedNode}
                    >
                      编辑
                    </Button>
                    <Button
                      icon={<FolderAddOutlined />}
                      onClick={handleAddChild}
                      disabled={!selectedNode}
                    >
                      添加子节点
                    </Button>
                    {selectedNode ? (
                      <Popconfirm
                        title="确定要删除该分类吗？"
                        description="请确保该分类下没有子分类和关联产品"
                        onConfirm={handleDelete}
                        okText="确定"
                        cancelText="取消"
                        okType="danger"
                      >
                        <Button icon={<DeleteOutlined />} danger>
                          删除
                        </Button>
                      </Popconfirm>
                    ) : (
                      <Button icon={<DeleteOutlined />} danger disabled>
                        删除
                      </Button>
                    )}
                  </Space>
                )}
              </Space>
            }
            style={{ borderRadius: 8, height: '100%' }}
            bodyStyle={{ padding: '24px', minHeight: 500 }}
          >
            {!selectedNode && formMode === 'view' ? (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  minHeight: 400,
                  flexDirection: 'column',
                  gap: 16,
                }}
              >
                <Empty description="请在左侧树中选择一个分类节点，或点击上方按钮添加新节点" />
              </div>
            ) : (
              <Form
                form={form}
                layout="vertical"
                disabled={isFormDisabled}
              >
                <Form.Item
                  name="category_name"
                  label="分类名称"
                  rules={[
                    { required: true, message: '请输入分类名称' },
                    { max: 100, message: '分类名称不能超过100个字符' },
                  ]}
                >
                  <Input placeholder="请输入分类名称" maxLength={100} />
                </Form.Item>

                <Form.Item
                  name="parent_id"
                  label="上级分类"
                  tooltip="根节点无需选择上级分类"
                >
                  <TreeSelect
                    placeholder="请选择上级分类（留空则为根节点）"
                    allowClear
                    treeData={treeSelectData.filter(
                      (node) => !selectedNode || node.value !== selectedNode.category_id
                    )}
                    treeDefaultExpandAll={false}
                    dropdownStyle={{ maxHeight: 400, overflow: 'auto' }}
                  />
                </Form.Item>

                <Form.Item
                  name="sort"
                  label="排序号"
                  rules={[{ type: 'number', message: '请输入有效数字' }]}
                >
                  <InputNumber
                    placeholder="请输入排序号"
                    min={0}
                    max={9999}
                    style={{ width: '100%' }}
                  />
                </Form.Item>

                <Form.Item
                  name="description"
                  label="描述"
                >
                  <Input.TextArea
                    placeholder="请输入分类描述"
                    rows={4}
                    maxLength={500}
                    showCount
                  />
                </Form.Item>

                {/* 选中节点信息展示 */}
                {selectedNode && formMode === 'view' && (
                  <>
                    <Divider />
                    <div style={{ color: '#8c8c8c', fontSize: 13 }}>
                      <Row gutter={[16, 8]}>
                        <Col span={12}>
                          <Text type="secondary">ID：</Text>
                          <Text>{selectedNode.category_id}</Text>
                        </Col>
                        <Col span={12}>
                          <Text type="secondary">子节点数：</Text>
                          <Text>
                            {categories.filter((c) => c.parent_id === selectedNode.category_id).length}
                          </Text>
                        </Col>
                        <Col span={12}>
                          <Text type="secondary">创建时间：</Text>
                          <Text>{selectedNode.created_at || '-'}</Text>
                        </Col>
                        <Col span={12}>
                          <Text type="secondary">更新时间：</Text>
                          <Text>{selectedNode.updated_at || '-'}</Text>
                        </Col>
                      </Row>
                    </div>
                  </>
                )}
              </Form>
            )}
          </Card>
        </Col>
      </Row>

      {contextHolder}
    </div>
  );
};

export default CategoryPage;