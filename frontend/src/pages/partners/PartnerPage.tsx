import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Modal, Form, Input, message, Card, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, TeamOutlined } from '@ant-design/icons';
import contractService from '../../services/contractService';
import { Partner } from '../../types/types';
import { useAuth } from '../../contexts/AuthContext';

const PartnerPage: React.FC = () => {
    const { isAdmin } = useAuth();
    const [partners, setPartners] = useState<Partner[]>([]);
    const [loading, setLoading] = useState(false);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingPartner, setEditingPartner] = useState<Partner | null>(null);
    const [form] = Form.useForm();

    const fetchPartners = async () => {
        try {
            setLoading(true);
            const data = await contractService.getPartners();
            setPartners(data);
        } catch (error) {
            message.error('Failed to load partners');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPartners();
    }, []);

    const handleAdd = () => {
        setEditingPartner(null);
        form.resetFields();
        setIsModalVisible(true);
    };

    const handleEdit = (record: Partner) => {
        setEditingPartner(record);
        form.setFieldsValue({
            ...record,
            address: record.address || '',
            email: record.email || '',
        });
        setIsModalVisible(true);
    };

    const handleDelete = async (id: string) => {
        try {
            await contractService.deletePartner(id);
            message.success('Partner deleted successfully');
            fetchPartners();
        } catch (error) {
            message.error('Failed to delete partner (might be in use)');
        }
    };

    const handleModalOk = async () => {
        try {
            const values = await form.validateFields();
            if (editingPartner) {
                await contractService.updatePartner(editingPartner.id, values);
                message.success('Partner updated successfully');
            } else {
                await contractService.createPartner(values);
                message.success('Partner created successfully');
            }
            setIsModalVisible(false);
            fetchPartners();
        } catch (error: any) {
            console.error('Validate Failed or Operation Error:', error);
            // If it's a validation error (from form), it won't have response
            if (error.response) {
                message.error(error.response?.data?.detail || 'Operation failed');
            }
        }
    };

    const columns = [
        {
            title: 'Partner Name',
            dataIndex: 'name',
            key: 'name',
            render: (text: string) => <strong style={{ color: '#2B3674' }}>{text}</strong>,
        },
        {
            title: 'Tax Code',
            dataIndex: 'taxCode',
            key: 'taxCode',
        },
        {
            title: 'Representative',
            dataIndex: 'representative',
            key: 'representative',
        },
        {
            title: 'Email',
            dataIndex: 'email',
            key: 'email',
        },
        {
            title: 'Address',
            dataIndex: 'address',
            key: 'address',
            ellipsis: true,
        },
        {
            title: 'Action',
            key: 'action',
            render: (_: any, record: Partner) => (
                <Space size="middle">
                    {isAdmin && (
                        <>
                            <Button
                                icon={<EditOutlined />}
                                onClick={() => handleEdit(record)}
                                type="text"
                                style={{ color: '#1890ff' }}
                            />
                            <Popconfirm
                                title="Are you sure to delete this partner?"
                                onConfirm={() => handleDelete(record.id)}
                                okText="Yes"
                                cancelText="No"
                            >
                                <Button
                                    icon={<DeleteOutlined />}
                                    type="text"
                                    danger
                                />
                            </Popconfirm>
                        </>
                    )}
                    {!isAdmin && <span style={{ color: '#999' }}>Read Only</span>}
                </Space>
            ),
        },
    ];

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <Space>
                    <div style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '8px',
                        background: '#e6f7ff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#1890ff'
                    }}>
                        <TeamOutlined style={{ fontSize: '20px' }} />
                    </div>
                </Space>
                {isAdmin && (
                    <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd} size="large">
                        Add Partner
                    </Button>
                )}
            </div>

            <Card style={{ borderRadius: '12px', boxShadow: '0px 20px 27px 0px rgba(0,0,0,0.05)' }}>
                <Table
                    columns={columns}
                    dataSource={partners}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 8 }}
                    scroll={{ x: 'max-content' }}
                />
            </Card>

            <Modal
                title={editingPartner ? "Edit Partner" : "Add New Partner"}
                open={isModalVisible}
                onOk={handleModalOk}
                onCancel={() => setIsModalVisible(false)}
            >
                <Form form={form} layout="vertical">
                    <Form.Item
                        name="name"
                        label="Partner Name"
                        rules={[{ required: true, message: 'Please input partner name!' }]}
                    >
                        <Input placeholder="e.g. MAERSK LOGISTICS VIETNAM" />
                    </Form.Item>
                    <Form.Item
                        name="taxCode"
                        label="Tax Code"
                        rules={[{ required: true, message: 'Please input tax code!' }]}
                    >
                        <Input placeholder="e.g. 0301234567" />
                    </Form.Item>
                    <Form.Item
                        name="representative"
                        label="Representative"
                        rules={[{ required: true, message: 'Please input representative name!' }]}
                    >
                        <Input placeholder="e.g. Nguyen Van A" />
                    </Form.Item>
                    <Form.Item
                        name="email"
                        label="Email"
                        rules={[{ type: 'email', message: 'Please enter a valid email!' }]}
                    >
                        <Input placeholder="e.g. contact@maerskvn.com" />
                    </Form.Item>
                    <Form.Item
                        name="address"
                        label="Address"
                    >
                        <Input.TextArea rows={2} placeholder="e.g. 123 Nguyen Hue..." />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default PartnerPage;
