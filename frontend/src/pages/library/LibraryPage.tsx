import React, { useState, useEffect } from 'react';
import { Table, Card, Space, Button, Tag, Upload, message, Spin, Modal, Form, Input, Tabs } from 'antd';
import { InboxOutlined, FileTextOutlined, EditOutlined, BookOutlined, FileProtectOutlined, ApartmentOutlined } from '@ant-design/icons';
import { PlaybookDocument } from '../../types/types';
import playbookService from '../../services/playbookService';
import { useNavigate } from 'react-router-dom';
import contractService from '../../services/contractService';
import { ContractType } from '../../types/types';
import { Select } from 'antd';
import ContractTypePage from './ContractTypePage';
import { useAuth } from '../../contexts/AuthContext';

const { Dragger } = Upload;

// -------------------------------------------------------------------
// Shared Upload + Table Component for Playbook-style documents
// -------------------------------------------------------------------
interface PlaybookSectionProps {
    docType: 'playbook' | 'severity_rule';
    title: string;
    uploadHintText: string;
    uploadSubText: string;
}

const PlaybookSection: React.FC<PlaybookSectionProps> = ({ docType, title, uploadHintText, uploadSubText }) => {
    const navigate = useNavigate();
    const { isAdmin } = useAuth();
    const [documents, setDocuments] = useState<PlaybookDocument[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [loading, setLoading] = useState(false);
    const [contractTypes, setContractTypes] = useState<ContractType[]>([]);

    // Upload Modal State
    const [isUploadModalVisible, setIsUploadModalVisible] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [selectedContractTypeId, setSelectedContractTypeId] = useState<string | null>(null);

    // Edit Modal State
    const [isEditModalVisible, setIsEditModalVisible] = useState(false);
    const [editingDocId, setEditingDocId] = useState<string | null>(null);
    const [form] = Form.useForm();

    // Initial Load & Polling
    useEffect(() => {
        fetchDocuments();
        fetchContractTypes();

        const interval = setInterval(() => {
            fetchDocuments(true);
        }, 5000);

        return () => clearInterval(interval);
    }, [docType]);

    const fetchDocuments = async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            const data = await playbookService.getPlaybooks(docType);
            setDocuments(data);
        } catch (error) {
            console.error(`Failed to load ${docType} documents`, error);
        } finally {
            if (!silent) setLoading(false);
        }
    };

    const fetchContractTypes = async () => {
        try {
            const types = await contractService.getContractTypes();
            setContractTypes(types);
        } catch (error) {
            console.error('Failed to fetch contract types');
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await playbookService.deletePlaybook(id);
            message.success('Document deleted successfully');
            fetchDocuments();
        } catch (error: any) {
            const errorMsg = error.response?.data?.detail || error.message || 'Failed to delete document';
            message.error(errorMsg);
        }
    };

    const handleEdit = (record: PlaybookDocument) => {
        setEditingDocId(record.id);
        form.setFieldsValue({
            name: record.name,
            description: record.description,
            contractTypeId: record.contractTypeId
        });
        setIsEditModalVisible(true);
    };

    const handleEditSubmit = async () => {
        try {
            const values = await form.validateFields();
            if (editingDocId) {
                await playbookService.updatePlaybook(editingDocId, values);
                message.success('Document updated successfully');
                setIsEditModalVisible(false);
                fetchDocuments();
            }
        } catch (error: any) {
            const errorMsg = error.response?.data?.detail || error.message || 'Failed to update document';
            message.error(errorMsg);
        }
    };

    const handlePreview = (doc: PlaybookDocument) => {
        if (doc?.id) {
            navigate(`/library/preview/${doc.id}`);
        } else {
            message.error("Invalid document ID");
        }
    };

    const uploadProps = {
        name: 'file',
        multiple: false,
        showUploadList: false,
        beforeUpload: (file: File) => {
            const isValidType = file.type === 'application/pdf' ||
                file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                file.type === 'text/plain';
            if (!isValidType) {
                message.error('You can only upload PDF, Word, or Text files!');
                return Upload.LIST_IGNORE;
            }
            setSelectedFile(file);
            setSelectedContractTypeId(null);
            setIsUploadModalVisible(true);
            return false;
        },
    };

    const handleUploadSubmit = async () => {
        if (!selectedFile) return;
        if (!selectedContractTypeId) {
            message.error("Please select a Contract Type");
            return;
        }

        setIsProcessing(true);
        setIsUploadModalVisible(false);
        message.loading({ content: 'Uploading and extracting rules...', key: 'process', duration: 0 });

        try {
            const response = await playbookService.uploadPlaybook(selectedFile, selectedContractTypeId, docType);
            const newDoc = response.document || response;
            setDocuments(prev => [newDoc, ...prev]);
            message.success({ content: `Uploaded ${newDoc.name}. AI is analyzing rules automatically...`, key: 'process' });
            fetchDocuments();
        } catch (error) {
            console.error('Upload error:', error);
            message.error({ content: `Failed to process file`, key: 'process' });
        } finally {
            setIsProcessing(false);
            setSelectedFile(null);
        }
    };

    return (
        <div>
            {/* Upload Section - Admin Only */}
            {isAdmin && (
                <Card style={{ marginBottom: '24px', borderRadius: '12px' }}>
                    <Dragger {...uploadProps} style={{ padding: '20px', background: '#fafafa', border: '2px dashed #d9d9d9' }}>
                        <p className="ant-upload-drag-icon">
                            <InboxOutlined style={{ color: '#4318FF', fontSize: '48px' }} />
                        </p>
                        <p className="ant-upload-text" style={{ fontSize: '18px', fontWeight: 500 }}>
                            {uploadHintText}
                        </p>
                        <p className="ant-upload-hint" style={{ color: '#8c8c8c' }}>
                            {uploadSubText}
                        </p>
                    </Dragger>
                </Card>
            )}

            <Card title={title} extra={isProcessing && <Spin tip="Uploading..." />}>
                <Table
                    dataSource={documents}
                    rowKey="id"
                    loading={loading}
                    columns={[
                        {
                            title: 'Document Name',
                            dataIndex: 'name',
                            key: 'name',
                            render: (text, record) => (
                                <Space>
                                    <FileTextOutlined style={{ color: '#1890ff' }} />
                                    <a
                                        onClick={() => navigate(`/library/rules/${record.id}`)}
                                        style={{ fontWeight: 500, color: '#1890ff', cursor: 'pointer' }}
                                    >
                                        {text}
                                    </a>
                                </Space>
                            )
                        },
                        {
                            title: 'Contract Type',
                            dataIndex: 'contractTypeId',
                            key: 'contractType',
                            render: (typeId) => {
                                const type = contractTypes.find(t => t.id === typeId);
                                return type ? <Tag color="geekblue">{type.name}</Tag> : <span style={{ color: '#ccc' }}>-</span>;
                            }
                        },
                        {
                            title: 'Uploaded At',
                            dataIndex: 'uploadedAt',
                            key: 'uploadedAt',
                            render: (date) => new Date(date).toLocaleDateString()
                        },
                        {
                            title: 'Rules',
                            dataIndex: 'ruleCount',
                            key: 'ruleCount',
                            render: (count, record) => {
                                const displayCount = typeof count === 'number' ? count : 0;
                                return (
                                    <Tag
                                        color="blue"
                                        style={{ cursor: 'pointer' }}
                                        onClick={() => navigate(`/library/rules/${record.id}`)}
                                    >
                                        {displayCount} Rules (View)
                                    </Tag>
                                );
                            }
                        },
                        {
                            title: 'Status',
                            dataIndex: 'status',
                            key: 'status',
                            render: (status) => {
                                let color = 'default';
                                if (status === 'active') color = 'success';
                                if (status === 'processing') color = 'processing';
                                return <Tag color={color}>{status.toUpperCase()}</Tag>;
                            }
                        },
                        {
                            title: 'Action',
                            key: 'action',
                            render: (_, record) => (
                                <Space>
                                    {record.status === 'uploaded' && isAdmin && (
                                        <Button
                                            type="primary"
                                            size="small"
                                            onClick={async () => {
                                                message.loading({ content: 'Starting analysis...', key: 'analyze' });
                                                try {
                                                    await playbookService.analyzePlaybook(record.id);
                                                    message.success({ content: 'Analysis complete!', key: 'analyze' });
                                                    fetchDocuments();
                                                } catch (e) {
                                                    message.error({ content: 'Analysis failed', key: 'analyze' });
                                                }
                                            }}
                                        >
                                            Analyze AI
                                        </Button>
                                    )}
                                    {record.status === 'active' && (
                                        <Button type="link" onClick={() => handlePreview(record)}>Preview</Button>
                                    )}
                                    {record.status === 'processing' && (
                                        <Spin size="small" />
                                    )}
                                    {isAdmin && (
                                        <Button
                                            type="primary"
                                            ghost
                                            size="small"
                                            icon={<EditOutlined />}
                                            onClick={() => handleEdit(record)}
                                        >
                                            Edit
                                        </Button>
                                    )}
                                    {isAdmin && (
                                        <Button
                                            type="text"
                                            danger
                                            size="small"
                                            onClick={() => {
                                                Modal.confirm({
                                                    title: 'Delete Document',
                                                    content: `Are you sure you want to delete "${record.name}"? This action cannot be undone.`,
                                                    okText: 'Delete',
                                                    okType: 'danger',
                                                    onOk: () => handleDelete(record.id)
                                                });
                                            }}
                                        >
                                            Delete
                                        </Button>
                                    )}
                                </Space>
                            )
                        }
                    ]}
                    scroll={{ x: 'max-content' }}
                />
            </Card>

            {/* Edit Modal */}
            <Modal
                title="Edit Document"
                open={isEditModalVisible}
                onOk={handleEditSubmit}
                onCancel={() => setIsEditModalVisible(false)}
            >
                <Form form={form} layout="vertical">
                    <Form.Item
                        name="name"
                        label="Name"
                        rules={[{ required: true, message: 'Please input the name!' }]}
                    >
                        <Input />
                    </Form.Item>
                    <Form.Item
                        name="contractTypeId"
                        label="Contract Type"
                        rules={[{ required: true, message: 'Please select a contract type!' }]}
                    >
                        <Select>
                            {contractTypes.map(type => (
                                <Select.Option key={type.id} value={type.id}>
                                    {type.name} ({type.code})
                                </Select.Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item name="description" label="Description">
                        <Input.TextArea />
                    </Form.Item>
                </Form>
            </Modal>

            {/* Upload Modal */}
            <Modal
                title={`Upload ${docType === 'severity_rule' ? 'Clause Severity' : 'Playbook'} Document`}
                open={isUploadModalVisible}
                onOk={handleUploadSubmit}
                onCancel={() => {
                    setIsUploadModalVisible(false);
                    setSelectedFile(null);
                }}
                okText="Upload & Analyze"
            >
                <div>
                    <p><strong>Selected File:</strong> {selectedFile?.name}</p>
                    <div style={{ marginTop: 16 }}>
                        <label style={{ display: 'block', marginBottom: 8 }}>
                            <span style={{ color: 'red' }}>*</span> Contract Type:
                        </label>
                        <Select
                            style={{ width: '100%' }}
                            placeholder="Select a contract type"
                            value={selectedContractTypeId}
                            onChange={setSelectedContractTypeId}
                        >
                            {contractTypes.map(type => (
                                <Select.Option key={type.id} value={type.id}>
                                    {type.name} ({type.code})
                                </Select.Option>
                            ))}
                        </Select>
                        <p style={{ color: '#8c8c8c', fontSize: '12px', marginTop: 4 }}>
                            Rules extracted from this document will be associated with this contract type.
                        </p>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

// -------------------------------------------------------------------
// Main Library Page with Tabs
// -------------------------------------------------------------------
const LibraryPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState('playbook');

    const tabItems = [
        {
            key: 'playbook',
            label: (
                <span>
                    <BookOutlined />
                    Playbook
                </span>
            ),
            children: (
                <PlaybookSection
                    docType="playbook"
                    title="Playbook Documents"
                    uploadHintText="Click or drag Playbook files (PDF, Docx) to upload"
                    uploadSubText="AI will automatically scan and extract rules from your playbook documents."
                />
            ),
        },
        {
            key: 'template',
            label: (
                <span>
                    <FileProtectOutlined />
                    Template
                </span>
            ),
            children: (
                <div>
                    <ContractTypePage embedded />
                </div>
            ),
        },
        {
            key: 'severity_rule',
            label: (
                <span>
                    <ApartmentOutlined />
                    Clause Severity
                </span>
            ),
            children: (
                <PlaybookSection
                    docType="severity_rule"
                    title="Clause Severity Documents"
                    uploadHintText="Click or drag Clause Severity files (PDF, Docx) to upload"
                    uploadSubText="AI will analyze and classify the severity of contract clauses from your documents."
                />
            ),
        },
    ];

    return (
        <div>
            <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                items={tabItems}
                size="large"
                style={{ marginBottom: 0 }}
            />
        </div>
    );
};

export default LibraryPage;
