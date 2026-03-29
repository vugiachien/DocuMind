import React, { useState, useEffect, useRef } from 'react';
import {
    Card, Table, Typography, Tag, Button, Input, Modal, Form,
    message, Popconfirm, Tooltip, Space
} from 'antd';
import {
    PlusOutlined, SearchOutlined, EditOutlined, DeleteOutlined,
    UploadOutlined, DownloadOutlined, CheckCircleFilled, EyeOutlined
} from '@ant-design/icons';
import { renderAsync } from 'docx-preview';
import { ContractType } from '../../types/types';
import { useAuth } from '../../contexts/AuthContext';
import contractService from '../../services/contractService';
import { extractErrorMessage } from '../../services/api';
import './ContractTypePage.css';

const { Title, Text } = Typography;

const ContractTypePage: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
    const { isAdmin } = useAuth();
    const [searchText, setSearchText] = useState('');
    const [dataSource, setDataSource] = useState<ContractType[]>([]);
    const [loading, setLoading] = useState(false);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [form] = Form.useForm();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [expandedDescriptions, setExpandedDescriptions] = useState<Set<string>>(new Set());

    // Template upload state
    const [uploadingTemplateId, setUploadingTemplateId] = useState<string | null>(null);

    // Preview Modal state
    const [previewVisible, setPreviewVisible] = useState(false);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewTitle, setPreviewTitle] = useState('');
    const [previewError, setPreviewError] = useState<string | null>(null);
    const previewContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetchContractTypes();
    }, []);

    const fetchContractTypes = async () => {
        try {
            setLoading(true);
            const data = await contractService.getContractTypes();
            setDataSource(data);
        } catch (error: any) {
            message.error(extractErrorMessage(error, 'Failed to fetch contract types'));
        } finally {
            setLoading(false);
        }
    };

    const filteredData = dataSource.filter(type =>
        type.name.toLowerCase().includes(searchText.toLowerCase()) ||
        type.code.toLowerCase().includes(searchText.toLowerCase())
    );

    const handleAdd = () => {
        setEditingId(null);
        form.resetFields();
        setIsModalVisible(true);
    };

    const handleEdit = (record: ContractType) => {
        setEditingId(record.id);
        form.setFieldsValue(record);
        setIsModalVisible(true);
    };

    const handleDelete = async (id: string) => {
        try {
            await contractService.deleteContractType(id);
            message.success('Contract type deleted successfully');
            fetchContractTypes();
        } catch (error: any) {
            message.error(extractErrorMessage(error, 'Failed to delete contract type'));
        }
    };

    const handleOk = () => {
        form.validateFields().then(async values => {
            try {
                if (editingId) {
                    await contractService.updateContractType(editingId, values);
                    message.success('Contract type updated successfully');
                } else {
                    await contractService.createContractType(values);
                    message.success('Contract type added successfully');
                }
                setIsModalVisible(false);
                fetchContractTypes();
            } catch (error: any) {
                message.error(extractErrorMessage(error, 'Operation failed'));
            }
        });
    };

    const handleTemplateUpload = async (typeId: string, file: File) => {
        if (!file.name.endsWith('.docx')) {
            message.error('Only DOCX files are supported for templates');
            return;
        }
        setUploadingTemplateId(typeId);
        try {
            await contractService.uploadContractTypeTemplate(typeId, file);
            message.success('Template uploaded successfully!');
            fetchContractTypes();
        } catch (error: any) {
            message.error(extractErrorMessage(error, 'Template upload failed'));
        } finally {
            setUploadingTemplateId(null);
        }
    };

    const handlePreviewTemplate = async (record: ContractType) => {
        try {
            setPreviewLoading(true);
            setPreviewError(null);
            setPreviewTitle(`Template Preview: ${record.name}`);
            setPreviewVisible(true);

            const blob = await contractService.getContractTypeTemplateBlob(record.id);

            // Wait for modal + container to be mounted
            await new Promise(r => setTimeout(r, 100));

            if (previewContainerRef.current) {
                previewContainerRef.current.innerHTML = '';
                await renderAsync(blob, previewContainerRef.current);
            }
        } catch (error: any) {
            setPreviewError(error.message || 'Failed to load preview');
            message.error(extractErrorMessage(error, 'Failed to load preview'));
        } finally {
            setPreviewLoading(false);
        }
    };

    const columns = [
        {
            title: 'Code',
            dataIndex: 'code',
            key: 'code',
            width: 100,
            render: (text: string) => <Tag color="blue">{text}</Tag>,
        },
        {
            title: 'Name',
            dataIndex: 'name',
            key: 'name',
            width: 300,
            render: (text: string) => <span className="contract-type-name">{text}</span>,
        },
        {
            title: 'Description',
            dataIndex: 'description',
            key: 'description',
            render: (text: string, record: ContractType) => {
                if (!text) return <Text type="secondary">—</Text>;
                const isExpanded = expandedDescriptions.has(record.id);
                const shouldTruncate = text.length > 150;
                return (
                    <div
                        className={`description-cell ${isExpanded ? 'expanded' : ''} ${shouldTruncate ? 'clickable' : ''}`}
                        onClick={() => {
                            if (!shouldTruncate) return;
                            setExpandedDescriptions(prev => {
                                const next = new Set(prev);
                                if (next.has(record.id)) {
                                    next.delete(record.id);
                                } else {
                                    next.add(record.id);
                                }
                                return next;
                            });
                        }}
                    >
                        {isExpanded || !shouldTruncate ? text : `${text.slice(0, 150)}...`}
                    </div>
                );
            },
        },
        {
            title: 'Template',
            key: 'template',
            width: 180,
            render: (_: any, record: ContractType) => (
                <Space>
                    {record.templateUrl ? (
                        <>
                            {isAdmin ? (
                                <Tooltip title="Template uploaded — click to download">
                                    <span
                                        onClick={async () => {
                                            try {
                                                message.loading({ content: 'Downloading template...', key: 'downloading' });
                                                await contractService.downloadContractTypeTemplate(record.id, `template_${record.code}.docx`);
                                                message.success({ content: 'Downloaded successfully!', key: 'downloading' });
                                            } catch (error: any) {
                                                message.error({ content: extractErrorMessage(error, 'Failed to download template'), key: 'downloading' });
                                            }
                                        }}
                                        className="template-set-container"
                                    >
                                        <CheckCircleFilled className="template-set-icon" />
                                        <span className="template-set-text">Template set</span>
                                        <DownloadOutlined />
                                    </span>
                                </Tooltip>
                            ) : (
                                <span className="template-set-container" style={{ cursor: 'default' }}>
                                    <CheckCircleFilled className="template-set-icon" />
                                    <span className="template-set-text">Template set</span>
                                </span>
                            )}
                            <Tooltip title="Preview template">
                                <Button
                                    size="small"
                                    type="text"
                                    icon={<EyeOutlined />}
                                    className="template-preview-btn"
                                    onClick={() => handlePreviewTemplate(record)}
                                />
                            </Tooltip>
                            {isAdmin && (
                                <Tooltip title="Replace template">
                                    <Button
                                        size="small"
                                        type="text"
                                        icon={<UploadOutlined />}
                                        loading={uploadingTemplateId === record.id}
                                        onClick={() => {
                                            const input = document.createElement('input');
                                            input.type = 'file';
                                            input.accept = '.docx';
                                            input.onchange = (e: any) => {
                                                const file = e.target.files?.[0];
                                                if (file) handleTemplateUpload(record.id, file);
                                            };
                                            input.click();
                                        }}
                                    />
                                </Tooltip>
                            )}
                        </>
                    ) : (
                        isAdmin ? (
                            <Button
                                size="small"
                                icon={<UploadOutlined />}
                                loading={uploadingTemplateId === record.id}
                                onClick={() => {
                                    const input = document.createElement('input');
                                    input.type = 'file';
                                    input.accept = '.docx';
                                    input.onchange = (e: any) => {
                                        const file = e.target.files?.[0];
                                        if (file) handleTemplateUpload(record.id, file);
                                    };
                                    input.click();
                                }}
                                className="template-upload-btn-empty"
                            >
                                Upload Template
                            </Button>
                        ) : (
                            <Text type="secondary" className="template-no-text">No template</Text>
                        )
                    )}
                </Space>
            ),
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 100,
            render: (_: any, record: ContractType) => (
                <div className="table-actions-container">
                    {isAdmin && (
                        <>
                            <Button
                                type="text"
                                icon={<EditOutlined />}
                                onClick={() => handleEdit(record)}
                                className="table-edit-btn"
                            />
                            <Popconfirm
                                title="Are you sure you want to delete this contract type?"
                                onConfirm={() => handleDelete(record.id)}
                                okText="Yes"
                                cancelText="No"
                            >
                                <Button type="text" danger icon={<DeleteOutlined />} />
                            </Popconfirm>
                        </>
                    )}
                    {!isAdmin && <span className="table-readonly-text">Read Only</span>}
                </div>
            ),
        },
    ];

    return (
        <Card bordered={!embedded} className="contract-type-card" style={embedded ? { boxShadow: 'none', padding: 0 } : {}}>
            <div className="contract-type-header">
                <Title level={3} className="contract-type-title">Contract Types</Title>
                {isAdmin && (
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={handleAdd}
                        className="add-type-btn"
                    >
                        Add Type
                    </Button>
                )}
            </div>

            <div className="search-container">
                <Input
                    placeholder="Search by code or name"
                    prefix={<SearchOutlined />}
                    value={searchText}
                    onChange={e => setSearchText(e.target.value)}
                    className="search-input"
                />
            </div>

            <Table
                loading={loading}
                columns={columns}
                dataSource={filteredData}
                rowKey="id"
                pagination={false}
                className="horizon-table"

            />

            <Modal
                title={editingId ? 'Edit Contract Type' : 'Add Contract Type'}
                open={isModalVisible}
                onOk={handleOk}
                onCancel={() => setIsModalVisible(false)}
            >
                <Form form={form} layout="vertical">
                    <Form.Item
                        name="code"
                        label="Code"
                        rules={[{ required: true, message: 'Please input the code!' }]}
                    >
                        <Input placeholder="e.g., MSA" />
                    </Form.Item>
                    <Form.Item
                        name="name"
                        label="Name"
                        rules={[{ required: true, message: 'Please input the name!' }]}
                    >
                        <Input placeholder="e.g., Master Service Agreement" />
                    </Form.Item>
                    <Form.Item name="description" label="Description">
                        <Input.TextArea placeholder="Optional description" />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                title={previewTitle}
                open={previewVisible}
                onCancel={() => {
                    setPreviewVisible(false);
                    setPreviewError(null);
                    if (previewContainerRef.current) previewContainerRef.current.innerHTML = '';
                }}
                footer={null}
                width={900}
                className="contract-preview-modal"
                styles={{ body: { padding: 0 } }}
            >
                <style>{`
                    .contract-preview-modal .docx-wrapper {
                        background: #f0f2f5 !important;
                        padding: 20px !important;
                        overflow: auto !important;
                        max-height: 70vh !important;
                    }
                    .contract-preview-modal .docx-wrapper > section.docx {
                        width: auto !important;
                        max-width: none !important;
                        min-width: 100% !important;
                        box-sizing: border-box !important;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.05) !important;
                        overflow: visible !important;
                    }
                    .contract-preview-modal .docx-wrapper table {
                        width: 100% !important;
                        table-layout: fixed !important;
                        border-collapse: collapse !important;
                        word-wrap: break-word !important;
                        overflow-wrap: break-word !important;
                    }
                    .contract-preview-modal .docx-wrapper table td,
                    .contract-preview-modal .docx-wrapper table th {
                        padding: 8px 10px !important;
                        vertical-align: top !important;
                        border: 1px solid #999 !important;
                        word-wrap: break-word !important;
                        overflow-wrap: break-word !important;
                        background: #fff !important;
                    }
                    .contract-preview-modal .docx-wrapper table tr {
                        background: #fff !important;
                    }
                    .contract-preview-modal .docx-wrapper table thead tr,
                    .contract-preview-modal .docx-wrapper table tbody tr:first-child {
                        position: sticky;
                        top: 0;
                        z-index: 10;
                    }
                    .contract-preview-modal .docx-wrapper table thead th,
                    .contract-preview-modal .docx-wrapper table thead td {
                        background: #f5f5f5 !important;
                        font-weight: bold !important;
                        position: sticky;
                        top: 0;
                        z-index: 10;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.08);
                    }
                `}</style>
                {previewLoading && (
                    <div className="preview-loading">
                        <Typography.Text type="secondary">Loading preview...</Typography.Text>
                    </div>
                )}
                {previewError && (
                    <Typography.Text type="danger">{previewError}</Typography.Text>
                )}
                <div
                    ref={previewContainerRef}
                    className="docx-preview-container"
                    style={{ maxHeight: '70vh', overflow: 'auto' }}
                />
            </Modal>
        </Card>
    );
};

export default ContractTypePage;
