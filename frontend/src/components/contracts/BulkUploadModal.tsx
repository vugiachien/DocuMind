import React, { useState, useEffect } from 'react';
import { Modal, Upload, Button, List, Progress, Select, Typography, message, Space, Card, Tag, Checkbox } from 'antd';
import { InboxOutlined, FileTextOutlined, LoadingOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { useUploadQueue, QueueItem } from '../../hooks/useUploadQueue';
import contractService from '../../services/contractService';
import { Partner, ContractType } from '../../types/types';
import { useAnalysisSettings } from '../../contexts/AnalysisSettingsContext';

const { Dragger } = Upload;
const { Text } = Typography;
const { Option } = Select;

interface BulkUploadModalProps {
    visible: boolean;
    onClose: () => void;
    onSuccess: () => void; // Refresh list
}

const BulkUploadModal: React.FC<BulkUploadModalProps> = ({ visible, onClose, onSuccess }) => {
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [partners, setPartners] = useState<Partner[]>([]);
    const [contractTypes, setContractTypes] = useState<ContractType[]>([]);

    // Metadata Selection state
    const [partnerId, setPartnerId] = useState<string>();
    const [contractTypeId, setContractTypeId] = useState<string>();
    const [useLawAnalysis, setUseLawAnalysis] = useState(false);
    const { fullContextMode, setFullContextMode } = useAnalysisSettings();

    // Load options
    useEffect(() => {
        if (visible) {
            Promise.all([
                contractService.getPartners(),
                contractService.getContractTypes()
            ]).then(([p, t]) => {
                setPartners(p);
                setContractTypes(t);
            });
        }
    }, [visible]);

    // Define processing logic for valid Contract Creation flow
    const processFile = async (file: File, onProgress: (percent: number) => void) => {
        if (!partnerId || !contractTypeId) throw new Error("Metadata missing");

        onProgress(10); // Start

        // 1. Create Contract
        const contractData = {
            name: file.name.replace(/\.[^/.]+$/, ""), // Remove extension
            partnerId,
            contractTypeId,
            value: 0,
            effectiveDate: new Date(),
            expiryDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)), // Default 1 year
            notes: "Bulk Upload"
        };

        const contract = await contractService.createContract(contractData as any);
        onProgress(40); // Created

        // 2. Upload File
        await contractService.uploadContractFile(contract.id, file);
        onProgress(80); // Uploaded

        // 3. Trigger Analysis (Async but we trigger it)
        // Note: The backend returns 200 OK immediately for analyze, but rate limit might hit.
        // We handle 429 in the hook.
        await contractService.analyzeContract(contract.id, useLawAnalysis, fullContextMode);
        onProgress(100); // Done (Enqueued)

        return contract;
    };

    const { queue, addFiles, isProcessing, clearQueue } = useUploadQueue({
        concurrency: 2, // Concurrency = 2 as requested
        processFile,
        onComplete: (results) => {
            message.success(`Successfully processed ${results.length} contracts.`);
            // Don't close immediately, let user see results
            // But reset selection
            setSelectedFiles([]);
        }
    });

    const handleStart = () => {
        if (!partnerId || !contractTypeId) {
            message.error("Please select Partner and Contract Type");
            return;
        }
        if (selectedFiles.length === 0) {
            message.error("Please select files");
            return;
        }

        addFiles(selectedFiles);
        // Note: selectedFiles are cleared from input but we keep them in queue view
    };

    const handleClose = () => {
        if (isProcessing) {
            message.warning("Upload in progress, please wait.");
            return;
        }
        clearQueue();
        setSelectedFiles([]);
        onSuccess(); // Refresh parent
        onClose();
    };

    const renderItem = (item: QueueItem) => {
        let statusIcon = <LoadingOutlined />;
        let statusColor = "blue";

        if (item.status === 'completed') {
            statusIcon = <CheckCircleOutlined />;
            statusColor = "green";
        } else if (item.status === 'error') {
            statusIcon = <CloseCircleOutlined />;
            statusColor = "red";
        } else if (item.status === 'pending') {
            statusIcon = <FileTextOutlined />;
            statusColor = "gold";
        } else if (item.status === 'retrying') {
            statusIcon = <LoadingOutlined spin />;
            statusColor = "orange";
        }

        return (
            <List.Item>
                <div style={{ width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Space>
                            {statusIcon}
                            <Text strong>{item.file.name}</Text>
                        </Space>
                        <Tag color={statusColor}>{item.status.toUpperCase()}</Tag>
                    </div>
                    {item.status === 'error' && <Text type="danger" style={{ fontSize: 12 }}>{item.error}</Text>}
                    {item.status === 'retrying' && <Text type="warning" style={{ fontSize: 12 }}>{item.error}</Text>}
                    {/* Progress Bar */}
                    <div style={{ paddingLeft: 24 }}>
                        <Progress percent={item.progress} status={item.status === 'error' ? 'exception' : 'active'} size="small" />
                    </div>
                </div>
            </List.Item>
        );
    };

    return (
        <Modal
            title="Bulk Upload Contracts"
            open={visible}
            onCancel={handleClose}
            footer={[
                <Button key="close" onClick={handleClose} disabled={isProcessing}>
                    Close
                </Button>,
                <Button
                    key="start"
                    type="primary"
                    onClick={handleStart}
                    loading={isProcessing}
                    disabled={selectedFiles.length === 0 || isProcessing}
                >
                    {isProcessing ? 'Processing Queue...' : 'Start Upload'}
                </Button>
            ]}
            width={600}
        >
            <Space direction="vertical" style={{ width: '100%' }} size="large">

                {/* 1. Metadata Selection */}
                <Card size="small" title="1. Common Settings">
                    <Space style={{ width: '100%' }} direction="vertical">
                        <Select
                            placeholder="Select Partner"
                            style={{ width: '100%' }}
                            onChange={setPartnerId}
                            value={partnerId}
                            disabled={isProcessing || queue.length > 0}
                        >
                            {partners.map(p => <Option key={p.id} value={p.id}>{p.name}</Option>)}
                        </Select>
                        <Select
                            placeholder="Select Contract Type"
                            style={{ width: '100%' }}
                            onChange={setContractTypeId}
                            value={contractTypeId}
                            disabled={isProcessing || queue.length > 0}
                        >
                            {contractTypes.map(t => <Option key={t.id} value={t.id}>{t.name}</Option>)}
                        </Select>
                        <Checkbox
                            checked={useLawAnalysis}
                            onChange={e => setUseLawAnalysis(e.target.checked)}
                            disabled={isProcessing || queue.length > 0}
                        >
                            Also analyze with Vietnamese Law
                        </Checkbox>
                        <Checkbox
                            checked={fullContextMode}
                            onChange={e => setFullContextMode(e.target.checked)}
                            disabled={isProcessing || queue.length > 0}
                        >
                            Full Context Mode (No chunking)
                        </Checkbox>
                    </Space>
                </Card>

                {/* 2. File Selection */}
                <Card size="small" title="2. Select Files">
                    <Dragger
                        multiple
                        fileList={[]} // We manage externally
                        beforeUpload={(_, fileList) => {
                            setSelectedFiles(prev => [...prev, ...fileList]);
                            return false; // Prevent auto upload
                        }}
                        showUploadList={false}
                        disabled={isProcessing}
                        height={100}
                    >
                        <p className="ant-upload-drag-icon">
                            <InboxOutlined />
                        </p>
                        <p className="ant-upload-text">Click or drag files to this area to upload</p>
                        <p className="ant-upload-hint">Support for a single or bulk upload.</p>
                    </Dragger>

                    {selectedFiles.length > 0 && !isProcessing && queue.length === 0 && (
                        <div style={{ marginTop: 10 }}>
                            <Text type="secondary">{selectedFiles.length} files selected.</Text>
                            <Button type="link" onClick={() => setSelectedFiles([])} danger>Clear</Button>
                        </div>
                    )}
                </Card>

                {/* 3. Queue Progress */}
                {queue.length > 0 && (
                    <Card size="small" title={`3. Progress (${queue.filter(i => i.status === 'completed').length}/${queue.length})`}>
                        <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                            <List
                                dataSource={queue}
                                renderItem={renderItem}
                                size="small"
                            />
                        </div>
                    </Card>
                )}

            </Space>
        </Modal>
    );
};

export default BulkUploadModal;
