import React, { useState, useEffect } from 'react';
import { Form, Input, Select, DatePicker, Button, Upload, Card, message } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { UploadFile } from 'antd/es/upload/interface';
import contractService from '../../services/contractService';
import { extractErrorMessage } from '../../services/api';
import { Partner, ContractType } from '../../types/types';

// Removed Title
const { Option } = Select;
const { TextArea } = Input;
const { RangePicker } = DatePicker;

const ContractCreatePage: React.FC = () => {
    const [form] = Form.useForm();
    const [fileList, setFileList] = useState<UploadFile[]>([]);
    const [partners, setPartners] = useState<Partner[]>([]);
    const [contractTypes, setContractTypes] = useState<ContractType[]>([]);
    const [playbooks, setPlaybooks] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [extracting, setExtracting] = useState(false);  // NEW: Auto-detection loading
    const [autoDetected, setAutoDetected] = useState<{ partnerId?: string, typeId?: string }>({});  // NEW: Track auto-detected values

    const navigate = useNavigate();

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [partnersData, typesData, playbooksData] = await Promise.all([
                    contractService.getPartners(),
                    contractService.getContractTypes(),
                    contractService.getPlaybooks('playbook')
                ]);
                setPartners(partnersData);
                setContractTypes(typesData);
                setPlaybooks(playbooksData);
            } catch (error) {
                message.error('Failed to load form data');
            }
        };
        fetchData();
    }, []);

    // Helper: Clean filename for Contract Name suggestion
    const cleanFilename = (filename: string): string => {
        // Remove extension
        let name = filename.replace(/\.(pdf|docx|doc)$/i, '');

        // Replace underscores and hyphens with spaces
        name = name.replace(/[_-]+/g, ' ');

        // Remove common version suffixes (v1, v2, _final, _review, etc.)
        name = name.replace(/\s*(v\d+|final|draft|review|copy|edited|revised|signed)$/i, '');

        // Cleanup multiple spaces and trim
        name = name.replace(/\s+/g, ' ').trim();

        return name;
    };

    const handleFileChange = async (info: any) => {
        const newFileList = info.fileList.slice(-1);  // Keep only last file
        setFileList(newFileList);

        // Auto-detection: Extract metadata when file is selected
        if (newFileList.length > 0 && newFileList[0].originFileObj) {
            const file = newFileList[0].originFileObj as File;

            // NEW: Auto-fill Contract Name from filename
            const suggestedName = cleanFilename(file.name);
            if (suggestedName) {
                form.setFieldsValue({ contractName: suggestedName });
            }

            try {
                setExtracting(true);
                message.loading({ content: 'Analyzing document...', key: 'extract' });

                const result = await contractService.extractMetadata(file);

                if (result.success && result.confidence >= 0.6) {
                    // Auto-fill form if confidence >= 60%
                    const updates: any = {};

                    if (result.suggested_partner_id) {
                        updates.partnerId = result.suggested_partner_id;
                        setAutoDetected(prev => ({ ...prev, partnerId: result.suggested_partner_id! }));
                    }

                    if (result.suggested_type_id) {
                        updates.contractTypeId = result.suggested_type_id;
                        setAutoDetected(prev => ({ ...prev, typeId: result.suggested_type_id! }));
                    }

                    form.setFieldsValue(updates);

                    message.success({
                        content: `Auto-detected: ${result.details.detected_partner_name || 'N/A'} | ${result.details.detected_type_name || 'N/A'}`,
                        key: 'extract',
                        duration: 3
                    });
                } else {
                    message.info({ content: 'Could not auto-detect metadata. Please select manually.', key: 'extract' });
                }

            } catch (error) {
                console.error('Auto-detection failed:', error);
                message.warning({ content: 'Auto-detection unavailable. Please fill manually.', key: 'extract' });
            } finally {
                setExtracting(false);
            }
        }
    };

    const [showRuleWarning, setShowRuleWarning] = useState(false); // NEW: Warning state

    const onFinish = async (values: any) => {
        // ... (existing submit logic)
        try {
            setLoading(true);

            console.log('Form Values:', values);

            // 1. Create Contract Record
            const contractData = {
                name: values.contractName,
                // ...
                contractNumber: values.contractNumber || undefined,
                partnerId: values.partnerId,
                contractTypeId: values.contractTypeId,
                playbookId: values.playbookId || undefined,  // NEW: Rule Type
                value: 0,
                effectiveDate: values.dateRange ? values.dateRange[0].toDate() : new Date(),
                expiryDate: values.dateRange ? values.dateRange[1].toDate() : new Date(),
                notes: values.notes
            };

            const newContract = await contractService.createContract(contractData as any);

            // 2. Upload File if present
            if (fileList.length > 0 && fileList[0].originFileObj) {
                await contractService.uploadContractFile(newContract.id, fileList[0].originFileObj as File);
            }

            message.success('Contract created successfully!');
            navigate('/contracts');

        } catch (error) {
            console.error('Submission failed:', error);
            message.error(extractErrorMessage(error, 'Failed to create contract'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ padding: '0 24px', maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ marginBottom: '40px', marginTop: '24px' }}>
                <h1 style={{ fontFamily: 'Inter, sans-serif', fontSize: '36px', fontWeight: 500, color: '#24303a', margin: 0, letterSpacing: '-0.02em' }}>Upload Agreement</h1>
            </div>

            <Card bordered={false} className="bg-surface-container-lowest shadow-sm" style={{ borderRadius: '4px', border: '1px solid rgba(198, 198, 205, 0.4)' }} bodyStyle={{ padding: '32px' }}>
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={onFinish}
                    onValuesChange={(changedValues, _) => {
                        // Auto-select Playbook when Contract Type changes
                        if (changedValues.contractTypeId) {
                            const selectedTypeId = changedValues.contractTypeId;
                            // Find playbooks matching this type
                            const matchingPlaybook = playbooks.find(p => p.contractTypeId === selectedTypeId);

                            if (matchingPlaybook) {
                                form.setFieldsValue({ playbookId: matchingPlaybook.id });
                                message.info(`Auto-selected rule: ${matchingPlaybook.name}`);
                                setShowRuleWarning(false);
                            } else {
                                // No matching playbook found
                                form.setFieldsValue({ playbookId: undefined });
                                setShowRuleWarning(true);
                            }
                        }

                        // Also clear warning if user manually selects a playbook
                        if (changedValues.playbookId) {
                            setShowRuleWarning(false);
                        }
                    }}
                >

                    {/* File Upload Section */}
                    <div style={{
                        background: '#f8f6f1',
                        border: '1px dashed rgba(198, 198, 205, 0.8)',
                        borderRadius: '4px',
                        padding: '48px 32px',
                        textAlign: 'center',
                        marginBottom: '32px',
                        transition: 'all 0.3s ease'
                    }}>
                        <Upload
                            fileList={fileList}
                            onChange={handleFileChange}
                            beforeUpload={() => false}
                            accept=".pdf,.docx"
                            maxCount={1}
                            disabled={extracting}
                        >
                            <Button icon={<UploadOutlined />} size="large" loading={extracting} style={{ borderRadius: '4px' }}>
                                {extracting ? 'Analyzing...' : 'Select Agreement File'}
                            </Button>
                        </Upload>
                        <p style={{ marginTop: '16px', color: '#8c8c8c', fontSize: '13px' }}>
                            Supported formats: PDF, DOCX (Max 50MB)
                        </p>
                        {extracting && (
                            <p style={{ marginTop: '8px', color: '#1890ff', fontSize: '12px' }}>
                                🔍 Auto-detecting Contract Type and Partner...
                            </p>
                        )}
                    </div>

                    {/* Basic Information */}
                    <Form.Item
                        label={<span style={{ fontWeight: 500, color: '#111827' }}>Agreement Name</span>}
                        name="contractName"
                        rules={[{ required: true, message: 'Please enter agreement name!' }]}
                    >
                        <Input size="large" placeholder="e.g., Software Service Agreement" style={{ borderRadius: '4px' }} />
                    </Form.Item>

                    <Form.Item
                        label={<span style={{ fontWeight: 500, color: '#111827' }}>Agreement Number</span>}
                        name="contractNumber"
                        help={<span style={{ color: '#76777d' }}>Leave blank to auto-generate</span>}
                    >
                        <Input size="large" placeholder="e.g., CTR-2026-XXXX" style={{ borderRadius: '4px' }} />
                    </Form.Item>

                    <Form.Item
                        label={
                            <span style={{ fontWeight: 500, color: '#111827' }}>
                                Counterparty
                                {autoDetected.partnerId && <span style={{ marginLeft: 8, color: '#10b981', fontSize: '12px' }}>✓ Auto-detected</span>}
                            </span>
                        }
                        name="partnerId"
                        rules={[{ required: true, message: 'Please select a counterparty!' }]}
                    >
                        <Select size="large" placeholder="Select counterparty" loading={partners.length === 0}>
                            {partners.map((partner) => (
                                <Option key={partner.id} value={partner.id}>
                                    {partner.name}
                                </Option>
                            ))}
                        </Select>
                    </Form.Item>

                    <Form.Item
                        label={
                            <span style={{ fontWeight: 500, color: '#111827' }}>
                                Agreement Type
                                {autoDetected.typeId && <span style={{ marginLeft: 8, color: '#10b981', fontSize: '12px' }}>✓ Auto-detected</span>}
                            </span>
                        }
                        name="contractTypeId"
                        rules={[{ required: true, message: 'Please select agreement type!' }]}
                    >
                        <Select size="large" placeholder="Select agreement type" loading={contractTypes.length === 0}>
                            {contractTypes.map((type) => (
                                <Option key={type.id} value={type.id}>
                                    {type.name}
                                </Option>
                            ))}
                        </Select>
                    </Form.Item>

                    <Form.Item
                        label={<span style={{ fontWeight: 500, color: '#111827' }}>Rule Type (Audit Policy)</span>}
                        name="playbookId"
                        help={<span style={{ color: '#76777d' }}>Optional: Select standard policy for analysis</span>}
                    >
                        <Select size="large" placeholder="Select audit policy (optional)" loading={playbooks.length === 0} allowClear>
                            {playbooks.map((playbook) => (
                                <Option key={playbook.id} value={playbook.id}>
                                    {playbook.name}
                                </Option>
                            ))}
                        </Select>
                    </Form.Item>

                    {showRuleWarning && (
                        <div style={{ marginBottom: 24, padding: '12px 16px', background: '#fff8f6', border: '1px solid rgba(186, 26, 26, 0.2)', borderRadius: '4px', color: '#ba1a1a' }}>
                            <span role="img" aria-label="warning" style={{ marginRight: 8 }}>⚠️</span>
                            <strong>Warning:</strong> No rules found for this Agreement Type. The system will check against ALL rules, which might be less accurate.
                            Please considering uploading a specific Audit Policy/Rule for this Agreement Type in the Library.
                        </div>
                    )}

                    <Form.Item
                        label={<span style={{ fontWeight: 500, color: '#111827' }}>Effective Period</span>}
                        name="dateRange"
                        rules={[{ required: true, message: 'Please select dates!' }]}
                    >
                        <RangePicker size="large" style={{ width: '100%', borderRadius: '4px' }} format="MM/DD/YYYY" />
                    </Form.Item>

                    <Form.Item label={<span style={{ fontWeight: 500, color: '#111827' }}>Notes</span>} name="notes">
                        <TextArea rows={4} placeholder="Additional notes about the agreement..." style={{ borderRadius: '4px' }} />
                    </Form.Item>

                    {/* Submit Button */}
                    <Form.Item style={{ marginTop: '40px' }}>
                        <Button
                            type="primary"
                            htmlType="submit"
                            loading={loading}
                            size="large"
                            style={{ background: '#24303a', borderRadius: '4px', height: '48px', border: 'none', fontWeight: 500, width: '100%', fontSize: '15px' }}
                        >
                            Upload & Analyze
                        </Button>
                    </Form.Item>
                </Form>
            </Card>
        </div >
    );
};

export default ContractCreatePage;
