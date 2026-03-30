import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Button, message, Upload, Avatar, Select, Collapse, Space, Typography } from 'antd';
import { UserOutlined, UploadOutlined, LockOutlined, SaveOutlined } from '@ant-design/icons';
import { useAuth } from '../../contexts/AuthContext';
import userService, { Department } from '../../services/userService';
import apiClient, { extractErrorMessage } from '../../services/api';

const { Title } = Typography;
const { Panel } = Collapse;

const InformationSecurityPage: React.FC = () => {
    const { user, refreshUser } = useAuth();
    const [form] = Form.useForm();
    const [passwordForm] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [passwordLoading, setPasswordLoading] = useState(false);
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        const loadUserData = async () => {
            if (user) {
                form.setFieldsValue({
                    username: user.username,
                    email: user.email,
                    full_name: user.full_name || '',
                    department_id: (user as any).department_id || (user as any).department?.id,
                    role: user.role,
                });

                // Load full user data including avatar
                try {
                    const response = await apiClient.get('/auth/me');
                    const userData = response.data;
                    if (userData.avatar_url) {
                        setAvatarUrl(userData.avatar_url);
                    }
                    // Update form with latest department info
                    if (userData.department?.id) {
                        form.setFieldsValue({ department_id: userData.department.id });
                    }
                } catch (error) {
                    console.error('Failed to load user data:', error);
                }
            }
        };

        loadUserData();
        fetchDepartments();
    }, [user, form]);

    const fetchDepartments = async () => {
        try {
            // Note: This requires admin access. For non-admin users, we might need a public endpoint
            // For now, we'll try to fetch and handle error gracefully
            const depts = await userService.getDepartments();
            setDepartments(depts);
        } catch (error) {
            console.error('Failed to load departments:', error);
            // Continue without departments - user can still update other fields
        }
    };

    const handleAvatarUpload = async (file: File) => {
        setUploading(true);
        try {
            const result = await userService.uploadAvatar(file);
            console.log('Avatar upload result:', result);

            // Update local state immediately with presigned URL
            if (result.avatar_url) {
                setAvatarUrl(result.avatar_url);
                console.log('Set avatarUrl to:', result.avatar_url);
            }

            // Refresh user data from server to update context (this will update avatar in header)
            // This will fetch the latest user data including the new avatar_url presigned URL
            await refreshUser();

            message.success('Avatar uploaded successfully');
        } catch (error: any) {
            console.error('Avatar upload error:', error);
            // Check if it's a 401 error (unauthorized)
            if (error.response?.status === 401) {
                message.error('Session expired. Please login again.');
                // Don't call logout() here - let the error propagate so ProtectedRoute can handle redirect
            } else {
                message.error(extractErrorMessage(error, 'Failed to upload avatar'));
            }
        } finally {
            setUploading(false);
        }
    };

    const handleProfileUpdate = async (values: any) => {
        setLoading(true);
        try {
            await userService.updateMyProfile({
                email: values.email,
                full_name: values.full_name,
                department_id: values.department_id,
            });
            message.success('Profile updated successfully');

            // Update user in localStorage
            const updatedUser = { ...user, ...values };
            localStorage.setItem('user', JSON.stringify(updatedUser));
        } catch (error: any) {
            message.error(extractErrorMessage(error, 'Failed to update profile'));
        } finally {
            setLoading(false);
        }
    };

    const handlePasswordChange = async (values: any) => {
        if (values.new_password !== values.confirm_password) {
            message.error('New password and confirm password do not match');
            return;
        }

        setPasswordLoading(true);
        try {
            await userService.changePassword({
                old_password: values.old_password,
                new_password: values.new_password,
            });
            message.success('Password changed successfully');
            passwordForm.resetFields();
        } catch (error: any) {
            message.error(extractErrorMessage(error, 'Failed to change password'));
        } finally {
            setPasswordLoading(false);
        }
    };

    const uploadProps = {
        beforeUpload: (file: File) => {
            const isImage = file.type.startsWith('image/');
            if (!isImage) {
                message.error('You can only upload image files!');
                return false;
            }
            const isLt5M = file.size / 1024 / 1024 < 5;
            if (!isLt5M) {
                message.error('Image must be smaller than 5MB!');
                return false;
            }
            handleAvatarUpload(file);
            return false; // Prevent auto upload
        },
        showUploadList: false,
    };

    return (
        <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
            <Title level={2}>Information & Security</Title>
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
                {/* Avatar Upload Section */}
                <Card title="Avatar" extra={<UserOutlined />}>
                    <Space direction="vertical" align="center" style={{ width: '100%' }}>
                        <Avatar
                            size={120}
                            src={avatarUrl}
                            icon={!avatarUrl && <UserOutlined />}
                            style={{ backgroundColor: '#11047A', color: 'white' }}
                        >
                            {!avatarUrl && user?.username?.[0]?.toUpperCase()}
                        </Avatar>
                        <Upload {...uploadProps}>
                            <Button icon={<UploadOutlined />} loading={uploading}>
                                Upload Avatar
                            </Button>
                        </Upload>
                        <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
                            Supported formats: JPG, PNG, GIF, WEBP (Max 5MB)
                        </Typography.Text>
                    </Space>
                </Card>

                {/* Profile Information Section */}
                <Card title="Profile Information" extra={<UserOutlined />}>
                    <Form
                        form={form}
                        layout="vertical"
                        onFinish={handleProfileUpdate}
                        initialValues={{
                            username: user?.username,
                            email: user?.email,
                            full_name: user?.full_name || '',
                            role: user?.role,
                        }}
                    >
                        <Form.Item label="Username" name="username">
                            <Input disabled />
                        </Form.Item>

                        <Form.Item
                            label="Full Name"
                            name="full_name"
                            rules={[{ required: false }]}
                        >
                            <Input placeholder="Enter your full name" />
                        </Form.Item>

                        <Form.Item
                            label="Email"
                            name="email"
                            rules={[
                                { required: true, message: 'Please input your email!' },
                                { type: 'email', message: 'Please enter a valid email!' },
                            ]}
                        >
                            <Input placeholder="Enter your email" />
                        </Form.Item>

                        <Form.Item label="Department" name="department_id">
                            <Select
                                placeholder="Select department"
                                allowClear
                                disabled={departments.length === 0}
                            >
                                {departments.map((dept) => (
                                    <Select.Option key={dept.id} value={dept.id}>
                                        {dept.name}
                                    </Select.Option>
                                ))}
                            </Select>
                            {departments.length === 0 && (
                                <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
                                    No departments available
                                </Typography.Text>
                            )}
                        </Form.Item>

                        <Form.Item label="Role" name="role">
                            <Input disabled />
                        </Form.Item>

                        <Form.Item>
                            <Button
                                type="primary"
                                htmlType="submit"
                                icon={<SaveOutlined />}
                                loading={loading}
                            >
                                Save Changes
                            </Button>
                        </Form.Item>
                    </Form>
                </Card>

                {/* Change Password Section */}
                <Card title="Change Password" extra={<LockOutlined />}>
                    <Collapse defaultActiveKey={[]}>
                        <Panel header="Change Password" key="1">
                            <Form
                                form={passwordForm}
                                layout="vertical"
                                onFinish={handlePasswordChange}
                            >
                                <Form.Item
                                    label="Current Password"
                                    name="old_password"
                                    rules={[{ required: true, message: 'Please input your current password!' }]}
                                >
                                    <Input.Password placeholder="Enter current password" />
                                </Form.Item>

                                <Form.Item
                                    label="New Password"
                                    name="new_password"
                                    rules={[
                                        { required: true, message: 'Please input your new password!' },
                                        { min: 6, message: 'Password must be at least 6 characters!' },
                                    ]}
                                >
                                    <Input.Password placeholder="Enter new password" />
                                </Form.Item>

                                <Form.Item
                                    label="Confirm New Password"
                                    name="confirm_password"
                                    dependencies={['new_password']}
                                    rules={[
                                        { required: true, message: 'Please confirm your new password!' },
                                        ({ getFieldValue }) => ({
                                            validator(_, value) {
                                                if (!value || getFieldValue('new_password') === value) {
                                                    return Promise.resolve();
                                                }
                                                return Promise.reject(new Error('The two passwords do not match!'));
                                            },
                                        }),
                                    ]}
                                >
                                    <Input.Password placeholder="Confirm new password" />
                                </Form.Item>

                                <Form.Item>
                                    <Button
                                        type="primary"
                                        htmlType="submit"
                                        icon={<LockOutlined />}
                                        loading={passwordLoading}
                                    >
                                        Change Password
                                    </Button>
                                </Form.Item>
                            </Form>
                        </Panel>
                    </Collapse>
                </Card>
            </Space>
        </div>
    );
};

export default InformationSecurityPage;

