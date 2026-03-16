import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, message, Popconfirm, Space, Switch, InputNumber, Tag } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import apiClient from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

interface User {
    id: string;
    username: string;
    email: string;
    full_name?: string;
    role: string;
    is_active: boolean;
    created_at: string;
    department?: {
        id: string;
        name: string;
    };
    department_id?: string;
    analyze_limit?: number | null;
    analyze_count: number;
}

interface Department {
    id: string;
    name: string;
}

const UserManagementPage: React.FC = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [isUnlimited, setIsUnlimited] = useState<boolean>(true);
    const [form] = Form.useForm();
    const { isAdmin } = useAuth();

    // Redirect if not admin
    if (!isAdmin) {
        window.location.href = '/dashboard';
        return null;
    }

    useEffect(() => {
        fetchUsers();
        fetchDepartments();
    }, []);

    const fetchDepartments = async () => {
        try {
            const response = await apiClient.get('/departments/');
            setDepartments(response.data);
        } catch (error) {
            console.error('Failed to load departments');
        }
    };

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const response = await apiClient.get('/users/');
            setUsers(response.data);
        } catch (error: any) {
            message.error(error.response?.data?.detail || 'Failed to load users');
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = () => {
        setEditingUser(null);
        form.resetFields();
        form.setFieldsValue({ role: 'user', is_active: true, unlimited: true, analyze_limit: 10 });
        setIsUnlimited(true);
        setModalVisible(true);
    };

    const handleEdit = (user: User) => {
        setEditingUser(user);
        const unlimited = user.analyze_limit === null || user.analyze_limit === undefined;
        setIsUnlimited(unlimited);
        form.setFieldsValue({
            username: user.username,
            email: user.email,
            full_name: user.full_name,
            role: user.role,
            is_active: user.is_active,
            department_id: user.department?.id || user.department_id,
            unlimited: unlimited,
            analyze_limit: user.analyze_limit || 10,
        });
        setModalVisible(true);
    };

    const handleDelete = async (userId: string) => {
        try {
            await apiClient.delete(`/users/${userId}`);
            message.success('User deleted successfully');
            fetchUsers();
        } catch (error: any) {
            message.error(error.response?.data?.detail || 'Failed to delete user');
        }
    };

    const handleSubmit = async (values: any) => {
        try {
            const payload = {
                ...values,
                analyze_limit: values.unlimited ? null : values.analyze_limit
            };
            delete payload.unlimited;
            if (editingUser) {
                await apiClient.put(`/users/${editingUser.id}`, payload);
                message.success('User updated successfully');
            } else {
                await apiClient.post('/users/', payload);
                message.success('User created successfully');
            }
            setModalVisible(false);
            fetchUsers();
        } catch (error: any) {
            message.error(error.response?.data?.detail || 'Operation failed');
        }
    };

    const columns = [
        {
            title: 'Username',
            dataIndex: 'username',
            key: 'username',
        },
        {
            title: 'Email',
            dataIndex: 'email',
            key: 'email',
        },
        {
            title: 'Full Name',
            dataIndex: 'full_name',
            key: 'full_name',
        },
        {
            title: 'Department',
            dataIndex: ['department', 'name'],
            key: 'department',
            render: (text: string) => text || '-',
        },
        {
            title: 'Role',
            dataIndex: 'role',
            key: 'role',
            render: (role: string) => (
                <span style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    backgroundColor: role === 'admin' ? '#ff4d4f' : '#1890ff',
                    color: 'white',
                    fontSize: '12px'
                }}>
                    {role?.toUpperCase()}
                </span>
            ),
        },
        {
            title: 'Status',
            dataIndex: 'is_active',
            key: 'is_active',
            render: (isActive: boolean) => (
                <span style={{ color: isActive ? 'green' : 'red' }}>
                    {isActive ? 'Active' : 'Inactive'}
                </span>
            ),
        },
        {
            title: 'Analyze Quota',
            key: 'quota',
            render: (_: any, record: User) => {
                if (record.role === 'admin') return <span style={{ color: '#bfbfbf' }}>N/A</span>;
                if (record.analyze_limit === null || record.analyze_limit === undefined) {
                    return <Tag color="green">Unlimited</Tag>;
                }
                const ratio = record.analyze_count / record.analyze_limit;
                const color = ratio >= 1 ? 'red' : ratio > 0.8 ? 'orange' : 'blue';
                return <Tag color={color}>{record.analyze_count} / {record.analyze_limit}</Tag>;
            }
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_: any, record: User) => (
                <Space>
                    <Button
                        type="link"
                        icon={<EditOutlined />}
                        onClick={() => handleEdit(record)}
                    >
                        Edit
                    </Button>
                    <Popconfirm
                        title="Are you sure you want to delete this user?"
                        onConfirm={() => handleDelete(record.id)}
                        okText="Yes"
                        cancelText="No"
                        disabled={record.role === 'admin'}
                    >
                        <Button
                            type="link"
                            danger
                            icon={<DeleteOutlined />}
                            disabled={record.role === 'admin'}
                            title={record.role === 'admin' ? 'Cannot delete admin users' : ''}
                        >
                            Delete
                        </Button>
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <div style={{ padding: '24px' }}>
            <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}>
                <h1>User Management</h1>
                <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                    Create User
                </Button>
            </div>

            <Table
                dataSource={users}
                columns={columns}
                rowKey="id"
                loading={loading}
                scroll={{ x: 'max-content' }}
            />

            <Modal
                title={editingUser ? 'Edit User' : 'Create User'}
                open={modalVisible}
                onCancel={() => setModalVisible(false)}
                onOk={() => form.submit()}
            >
                <Form form={form} layout="vertical" onFinish={handleSubmit}>
                    <Form.Item
                        name="username"
                        label="Username"
                        rules={[{ required: true, message: 'Please input username!' }]}
                    >
                        <Input disabled={!!editingUser} />
                    </Form.Item>

                    <Form.Item
                        name="email"
                        label="Email"
                        rules={[
                            { required: true, message: 'Please input email!' },
                            { type: 'email', message: 'Please enter a valid email!' }
                        ]}
                    >
                        <Input />
                    </Form.Item>

                    <Form.Item name="full_name" label="Full Name">
                        <Input />
                    </Form.Item>

                    {!editingUser && (
                        <Form.Item
                            name="password"
                            label="Password"
                            rules={[{ required: true, message: 'Please input password!' }]}
                        >
                            <Input.Password />
                        </Form.Item>
                    )}

                    <Form.Item
                        name="role"
                        label="Role"
                        rules={[{ required: true, message: 'Please select a role!' }]}
                    >
                        <Select>
                            <Select.Option value="user">User</Select.Option>
                            <Select.Option value="admin">Admin</Select.Option>
                        </Select>
                    </Form.Item>

                    <Form.Item name="department_id" label="Department">
                        <Select allowClear placeholder="Select Department">
                            {departments.map(dept => (
                                <Select.Option key={dept.id} value={dept.id}>{dept.name}</Select.Option>
                            ))}
                        </Select>
                    </Form.Item>

                    <Form.Item name="unlimited" label="Unlimited Analysis Quota" valuePropName="checked">
                        <Switch onChange={(checked) => setIsUnlimited(checked)} />
                    </Form.Item>

                    {!isUnlimited && (
                        <Form.Item
                            name="analyze_limit"
                            label="Analyze Limit"
                            rules={[{ required: true, message: 'Please input limit!' }]}
                        >
                            <InputNumber min={1} style={{ width: '100%' }} />
                        </Form.Item>
                    )}

                    <Form.Item name="is_active" label="Status" valuePropName="checked">
                        <Select>
                            <Select.Option value={true}>Active</Select.Option>
                            <Select.Option value={false}>Inactive</Select.Option>
                        </Select>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default UserManagementPage;
