import React, { useState, useEffect, useCallback } from 'react';
import { Table, Switch, Button, Card, Space, message, Tag, Spin, Alert } from 'antd';
import { SaveOutlined, ReloadOutlined } from '@ant-design/icons';
import axios from 'axios';

const ROLE_COLORS = {
  '系统管理员': 'red',
  '产品经理': 'blue',
  '开发工程师': 'green',
  '开发负责人': 'purple',
  '测试负责人': 'orange',
  '普通成员': 'default',
};

const CATEGORY_COLORS = {
  '产品': '#1890ff',
  '需求': '#52c41a',
  '问题单': '#fa8c16',
  '版本': '#722ed1',
  '系统': '#eb2f96',
};

/**
 * 从权限标识中提取分类前缀。
 * 例如 "产品.查看" -> "产品", "需求.提出" -> "需求"。
 * 如果权限标识中没有 "."，则归类到 "其他"。
 */
const extractCategory = (permissionKey) => {
  const dotIndex = permissionKey.indexOf('.');
  return dotIndex > 0 ? permissionKey.substring(0, dotIndex) : '其他';
};

const PermissionsPage = () => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [roles, setRoles] = useState([]);
  const [permissionKeys, setPermissionKeys] = useState([]);
  const [matrix, setMatrix] = useState({});
  const [originalMatrix, setOriginalMatrix] = useState({});
  const [error, setError] = useState(null);

  // 从后端拉取权限矩阵
  const fetchPermissions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get('/api/system/permissions');
      const { roles: fetchedRoles, permissionKeys: fetchedKeys, matrix: fetchedMatrix } = res.data;
      const r = fetchedRoles || [];
      const pk = fetchedKeys || [];
      const m = fetchedMatrix || {};

      setRoles(r);
      setPermissionKeys(pk);
      setMatrix(JSON.parse(JSON.stringify(m)));
      setOriginalMatrix(JSON.parse(JSON.stringify(m)));
    } catch (err) {
      const msg = err.response?.data?.message || '获取权限配置失败';
      setError(msg);
      message.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  // 切换某个角色对某个权限的开关
  const handleToggle = (permissionKey, role) => {
    setMatrix((prev) => {
      const updated = JSON.parse(JSON.stringify(prev));
      if (!updated[role]) {
        updated[role] = {};
      }
      updated[role][permissionKey] = updated[role][permissionKey] ? 0 : 1;
      return updated;
    });
  };

  // 保存：将矩阵转换为后端期望的数组格式 [{ role, permission_key, allowed }]
  const handleSave = async () => {
    setSaving(true);
    try {
      const permissions = [];
      roles.forEach((role) => {
        permissionKeys.forEach((pk) => {
          const allowed = matrix[role] && matrix[role][pk] ? 1 : 0;
          permissions.push({ role, permission_key: pk, allowed });
        });
      });
      await axios.put('/api/system/permissions', { permissions });
      setOriginalMatrix(JSON.parse(JSON.stringify(matrix)));
      message.success('权限配置已保存');
    } catch (err) {
      message.error(err.response?.data?.message || '保存权限配置失败');
    } finally {
      setSaving(false);
    }
  };

  // 是否有未保存的修改
  const hasChanges = JSON.stringify(originalMatrix) !== JSON.stringify(matrix);

  // 构建表格数据源，按分类前缀分组
  const buildDataSource = () => {
    const result = [];
    const categorySet = new Set();
    const categoryOrder = [];

    // 第一遍扫描：按首次出现顺序收集分类
    permissionKeys.forEach((pk) => {
      const cat = extractCategory(pk);
      if (!categorySet.has(cat)) {
        categorySet.add(cat);
        categoryOrder.push(cat);
      }
    });

    categoryOrder.forEach((cat) => {
      // 分类标题行
      result.push({
        id: `cat-${cat}`,
        _isCategory: true,
        category: cat,
      });

      // 该分类下的权限行
      const catKeys = permissionKeys.filter((pk) => extractCategory(pk) === cat);
      catKeys.forEach((pk) => {
        const rowData = {
          id: `perm-${pk}`,
          _isCategory: false,
          permissionKey: pk,
          label: pk,
        };
        // 为每个角色填充当前值
        roles.forEach((role) => {
          rowData[role] = matrix[role] && matrix[role][pk] ? 1 : 0;
        });
        result.push(rowData);
      });
    });

    return result;
  };

  const dataSource = buildDataSource();

  // 动态构建表格列
  const columns = [
    {
      title: '权限项',
      dataIndex: 'label',
      key: 'label',
      width: 200,
      fixed: 'left',
      render: (text, record) => {
        if (record._isCategory) {
          return (
            <Tag
              color={CATEGORY_COLORS[record.category] || '#108ee9'}
              style={{ fontSize: 13, padding: '2px 10px', fontWeight: 600 }}
            >
              {record.category}
            </Tag>
          );
        }
        return <span style={{ paddingLeft: 16 }}>{text}</span>;
      },
    },
    {
      title: '权限标识',
      dataIndex: 'permissionKey',
      key: 'permissionKey',
      width: 180,
      ellipsis: true,
      render: (text, record) => {
        if (record._isCategory) return null;
        return (
          <span style={{ color: '#999', fontSize: 12, fontFamily: 'monospace' }}>{text}</span>
        );
      },
    },
    ...roles.map((role) => ({
      title: (
        <Tag color={ROLE_COLORS[role] || 'default'} style={{ margin: 0 }}>
          {role}
        </Tag>
      ),
      dataIndex: role,
      key: role,
      width: 110,
      align: 'center',
      render: (value, record) => {
        if (record._isCategory) return null;
        const checked = value === 1;
        return (
          <Switch
            checked={checked}
            size="small"
            checkedChildren="1"
            unCheckedChildren="0"
            onChange={() => handleToggle(record.permissionKey, role)}
          />
        );
      },
    })),
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card
        title="权限矩阵"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchPermissions} loading={loading}>
              刷新
            </Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSave}
              loading={saving}
              disabled={!hasChanges}
            >
              保存
            </Button>
          </Space>
        }
      >
        {error && (
          <Alert
            message="加载失败"
            description={error}
            type="error"
            showIcon
            closable
            style={{ marginBottom: 16 }}
            onClose={() => setError(null)}
          />
        )}

        <Spin spinning={loading} tip="加载中...">
          {dataSource.length === 0 && !loading ? (
            <div
              style={{
                textAlign: 'center',
                padding: '60px 0',
                color: '#999',
              }}
            >
              暂无权限数据
            </div>
          ) : (
            <Table
              rowKey="id"
              columns={columns}
              dataSource={dataSource}
              pagination={false}
              bordered
              size="middle"
              scroll={{ x: 'max-content' }}
              rowClassName={(record) =>
                record._isCategory ? 'permission-category-row' : ''
              }
              onRow={(record) => {
                if (record._isCategory) {
                  return {
                    style: {
                      background: '#fafafa',
                      fontWeight: 'bold',
                    },
                  };
                }
                return {};
              }}
              locale={{ emptyText: '暂无权限数据' }}
            />
          )}
        </Spin>

        {hasChanges && (
          <div
            style={{
              marginTop: 12,
              padding: '8px 16px',
              background: '#fffbe6',
              border: '1px solid #ffe58f',
              borderRadius: 4,
              color: '#ad6800',
              fontSize: 13,
            }}
          >
            您有未保存的更改，请点击"保存"按钮以持久化修改。
          </div>
        )}
      </Card>
    </div>
  );
};

export default PermissionsPage;