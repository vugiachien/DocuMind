import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, message, Popconfirm, Card, Space } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ApartmentOutlined } from '@ant-design/icons';
import apiClient, { extractErrorMessage } from '../../services/api';

interface Department {
    id: string;
    name: string;
    description?: string;
    created_at?: string;
}

const DepartmentManagementPage: React.FC = () => {
    const [departments, setDepartments] = useState<Department[]>([]);
    const [loading, setLoading] = useState(false);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingDept, setEditingDept] = useState<Department | null>(null);
    const [form] = Form.useForm();

    const fetchDepartments = async () => {
        setLoading(true);
        try {
            const response = await apiClient.get('/departments/');
            setDepartments(response.data);
        } catch (error) {
            console.error(error);
            message.error('Failed to fetch departments');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDepartments();
    }, []);

    const handleAdd = () => {
        setEditingDept(null);
        form.resetFields();
        setIsModalVisible(true);
    };

    const handleEdit = (record: Department) => {
        setEditingDept(record);
        form.setFieldsValue(record);
        setIsModalVisible(true);
    };

    const handleDelete = async (id: string) => {
        try {
            await apiClient.delete(`/departments/${id}`);
            message.success('Department deleted successfully');
            fetchDepartments();
        } catch (error: any) {
            message.error(extractErrorMessage(error, 'Failed to delete department'));
        }
    };

    const handleOk = async () => {
        try {
            const values = await form.validateFields();
            if (editingDept) {
                await apiClient.put(`/departments/${editingDept.id}`, values);
                message.success('Department updated successfully');
            } else {
                await apiClient.post('/departments/', values);
                message.success('Department created successfully');
            }
            setIsModalVisible(false);
            fetchDepartments();
        } catch (error: any) {
            if (error.response || error.message) {
                message.error(extractErrorMessage(error, 'Operation failed'));
            }
        }
    };

    const columns = [
        {
            title: 'Name',
            dataIndex: 'name',
            key: 'name',
        },
        {
            title: 'Description',
            dataIndex: 'description',
            key: 'description',
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_: any, record: Department) => (
                <Space>
                    <Button icon={<EditOutlined />} onClick={() => handleEdit(record)} type="text" />
                    <Popconfirm
                        title="Are you sure you want to delete this department?"
                        onConfirm={() => handleDelete(record.id)}
                        okText="Yes"
                        cancelText="No"
                    >
                        <Button icon={<DeleteOutlined />} danger type="text" />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <div className="p-6">
            <Card
                title={<span><ApartmentOutlined className="mr-2" />Department Management</span>}
                extra={<Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>Add Department</Button>}
            >
                <Table
                    columns={columns}
                    dataSource={departments}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 10 }}
                    scroll={{ x: 'max-content' }}
                />
            </Card>

            <Modal
                title={editingDept ? "Edit Department" : "Add Department"}
                open={isModalVisible}
                onOk={handleOk}
                onCancel={() => setIsModalVisible(false)}
            >
                <Form form={form} layout="vertical">
                    <Form.Item
                        name="name"
                        label="Department Name"
                        rules={[{ required: true, message: 'Please enter department name' }]}
                    >
                        <Input />
                    </Form.Item>
                    <Form.Item
                        name="description"
                        label="Description"
                    >
                        <Input.TextArea />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default DepartmentManagementPage;
