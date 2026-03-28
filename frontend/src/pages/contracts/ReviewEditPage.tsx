import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import DOMPurify from 'dompurify';
import {
    Layout, Button, Typography, Space, message, Spin, Card,
    List, Tag, Divider, Alert, Badge
} from 'antd';
import {
    ArrowLeftOutlined, SaveOutlined, WarningOutlined,
    InfoCircleOutlined, CopyOutlined, CheckCircleOutlined
} from '@ant-design/icons';
import contractService from '../../services/contractService';
import { Contract, Risk } from '../../types/types';
import TinyMCEEditor from '../../components/TinyMCEEditor';

const { Title, Text, Paragraph } = Typography;
const { Content, Sider } = Layout;

const ReviewEditPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const location = useLocation();

    // State
    const [contract, setContract] = useState<Contract | null>(null);

    // UseRef for content to avoid re-renders on every keystroke (fixes cursor jump)
    const contentRef = useRef<string>('');
    const [initialContent, setInitialContent] = useState<string>(''); // For initial load only

    // Ref for TinyMCE editor instance
    const editorRef = useRef<any>(null);

    const [loading, setLoading] = useState<boolean>(true);
    const [saving, setSaving] = useState<boolean>(false);

    // Filtered Risks (from navigation state)
    const selectedRiskIds = (location.state as { selectedRiskIds?: string[] })?.selectedRiskIds || [];
    const [selectedRisks, setSelectedRisks] = useState<Risk[]>([]);

    useEffect(() => {
        fetchData();
    }, [id]);

    const fetchData = async () => {
        if (!id) return;
        setLoading(true);
        try {
            // 1. Fetch Contract metadata
            const contractData = await contractService.getContract(id);
            setContract(contractData);

            // 2. Filter risks
            if (contractData.risks) {
                const risks = contractData.risks.filter(r => selectedRiskIds.includes(r.id));
                setSelectedRisks(risks);
            }

            // 3. Fetch Full Text Content
            // currentVersion is a version string (e.g. "v1.0"), but the API expects a version UUID
            const currentVersionObj = contractData.versions?.find(
                v => v.version === contractData.currentVersion
            );
            if (!currentVersionObj) {
                throw new Error(`Version "${contractData.currentVersion}" not found in versions list`);
            }
            console.log('Fetching preview for:', currentVersionObj.id, `(${contractData.currentVersion})`);
            const previewData = await contractService.getVersionPreview(id, currentVersionObj.id, true);
            console.log('Preview data received:', previewData);

            if (previewData && typeof previewData.previewText === 'string') {
                let text = previewData.previewText;

                // Highlight Selected Risks
                if (selectedRisks.length > 0) {
                    selectedRisks.forEach(risk => {
                        if (risk.original_text && risk.original_text.length > 5) {
                            const cleanOrig = risk.original_text.trim();
                            // Escape special regex chars
                            const escaped = cleanOrig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                            // Global replace to highlight all occurrences
                            const regex = new RegExp(escaped, 'g');
                            text = text.replace(regex, `<span style="background-color: #fffb8f; font-weight: bold;">${cleanOrig}</span>`);
                        }
                    });
                }

                // Convert plain text to HTML for Editor
                // Check if it looks like plain text
                let htmlContent = text;
                if (!text.includes('<p>')) {
                    // Logic: Split by double newline for paragraphs.
                    // Single newlines become <br/> (soft break) inside the paragraph.
                    // This prevents creating empty <p> tags for every newline.
                    const paragraphs = text.split(/\n\s*\n/);
                    htmlContent = paragraphs.map((p: string) => {
                        const cleanP = p.trim();
                        if (!cleanP) return '';
                        // Provide soft breaks for internal newlines
                        return `<p>${cleanP.replace(/\n/g, '<br/>')}</p>`;
                    }).join('');
                }

                // Sanitize before setting to editor
                const sanitizedContent = DOMPurify.sanitize(htmlContent);

                contentRef.current = sanitizedContent;
                setInitialContent(sanitizedContent);
            } else {
                console.error('Invalid preview data structure:', previewData);
                throw new Error('Invalid preview data format');
            }

        } catch (error: any) {
            console.error('Error fetching data:', error);
            message.error(`Failed to load contract content: ${error.message || 'Unknown error'}`);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!id) return;
        setSaving(true);
        try {
            const changesDescription = `Manual edit based on ${selectedRisks.length} recommendations`;
            // Pass selected ids explicitly
            await contractService.createManualVersion(id, contentRef.current, changesDescription, selectedRiskIds);
            message.success("New version created successfully!");
            navigate(`/contracts/${id}`);
        } catch (error: any) {
            console.error(error);
            message.error("Failed to save new version");
        } finally {
            setSaving(false);
        }
    };

    const handleCopyParams = (text: string) => {
        navigator.clipboard.writeText(text);
        message.success("Copied to clipboard");
    };

    // Helper to find DOM Range for a given text
    const findTextRange = (searchText: string) => {
        if (!editorRef.current || !searchText) return null;
        const editor = editorRef.current;
        const body = editor.getBody();

        // Strategy: Use TreeWalker to extract all text nodes and find match in plain text
        const textNodes: { node: Node; start: number; end: number }[] = [];
        let fullText = "";

        const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, null);
        let currentNode = walker.nextNode();
        while (currentNode) {
            const val = currentNode.nodeValue || "";
            textNodes.push({
                node: currentNode,
                start: fullText.length,
                end: fullText.length + val.length
            });
            fullText += val;
            currentNode = walker.nextNode();
        }

        // Normalize spaces
        const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
        const normalizedFull = normalize(fullText);
        const normalizedSearch = normalize(searchText);

        const normalizedIndex = normalizedFull.indexOf(normalizedSearch);
        if (normalizedIndex === -1) return null;

        // Map back to original text indices
        let originalStartIndex = -1;
        let nonWsCount = 0;
        const targetNonWsCount = normalizedFull.substring(0, normalizedIndex).replace(/\s/g, '').length;

        for (let i = 0; i < fullText.length; i++) {
            if (!/\s/.test(fullText[i])) {
                if (nonWsCount === targetNonWsCount) {
                    originalStartIndex = i;
                    break;
                }
                nonWsCount++;
            }
        }

        // Calculate end index
        let originalEndIndex = originalStartIndex;
        const searchLengthNoWs = normalizedSearch.replace(/\s/g, '').length;
        let countFn = 0;
        for (let i = originalStartIndex; i < fullText.length && countFn < searchLengthNoWs; i++) {
            if (!/\s/.test(fullText[i])) {
                countFn++;
            }
            originalEndIndex = i + 1;
        }

        const getDomPos = (idx: number) => {
            const match = textNodes.find(t => idx >= t.start && idx < t.end);
            if (match) {
                return { node: match.node, offset: idx - match.start };
            }
            if (idx === fullText.length && textNodes.length > 0) {
                const last = textNodes[textNodes.length - 1];
                return { node: last.node, offset: (last.node.nodeValue || "").length };
            }
            return null;
        };

        const startPos = getDomPos(originalStartIndex);
        const endPos = getDomPos(originalEndIndex);

        if (startPos && endPos) {
            const range = editor.dom.createRng();
            range.setStart(startPos.node, startPos.offset);
            range.setEnd(endPos.node, endPos.offset);
            return range;
        }
        return null;
    };

    // Handle clicking on risk card to jump to text in editor
    const handleRiskClick = (risk: Risk) => {
        if (!editorRef.current || !risk.original_text) return;
        const editor = editorRef.current;
        const range = findTextRange(risk.original_text);

        if (range) {
            editor.selection.setRng(range);
            const scrollElem = range.startContainer.parentElement;
            if (scrollElem) {
                scrollElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }

            // Apply highlight format
            try {
                // Remove previous highlights
                const nodes = editor.dom.select('span[style*="background-color: rgb(255, 235, 59)"]');
                nodes.forEach((node: HTMLElement) => {
                    editor.dom.setStyle(node, 'background-color', '');
                });

                editor.formatter.register('tempHighlight', {
                    inline: 'span',
                    styles: { backgroundColor: '#ffeb3b', transition: 'background-color 0.5s' }
                });
                editor.formatter.apply('tempHighlight');
                editor.selection.collapse(true);

                // Kept persistent - no timeout
                message.success('Found');
            } catch (e) {
                console.warn('Highlight format error', e);
            }
        } else {
            message.warning('Text not found in editor');
        }
    };

    const handleApplyRisk = (e: React.MouseEvent, risk: Risk) => {
        e.stopPropagation(); // Prevent card click
        if (!editorRef.current || !risk.original_text || !risk.suggested_text) return;

        const editor = editorRef.current;
        const range = findTextRange(risk.original_text);

        if (range) {
            editor.selection.setRng(range);

            // Insert the suggested text
            editor.insertContent(risk.suggested_text);

            // Update ref
            contentRef.current = editor.getContent();
            message.success('Fix applied successfully');

            // Optional: Mark as visually applied or remove from list? 
            // For now just success message.
        } else {
            message.error('Could not find original text to replace. It may have been modified.');
        }
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <Spin size="large" tip="Loading editor..." />
            </div>
        );
    }

    return (
        <Layout style={{ height: '100vh', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{
                padding: '16px 24px',
                background: '#fff',
                borderBottom: '1px solid #f0f0f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <Space>
                    <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/contracts/${id}`)}>
                        Cancel
                    </Button>
                    <div>
                        <Title level={4} style={{ margin: 0 }}>Review & Edit: {contract?.name || 'Loading...'}</Title>
                        <Text type="secondary">Create a new version by manually editing the text</Text>
                    </div>
                </Space>

                <Space>
                    <Alert
                        message="Formatting may be lost in basic view"
                        type="info"
                        showIcon
                        style={{ border: 'none', padding: '4px 12px' }}
                    />
                    <Button
                        type="primary"
                        icon={<SaveOutlined />}
                        onClick={handleSave}
                        loading={saving}
                    >
                        Save New Version
                    </Button>
                </Space>
            </div>

            {/* Content Body */}
            <Layout style={{ flex: 1, overflow: 'hidden' }}>
                {/* Editor Area */}
                <Content style={{
                    padding: '24px',
                    background: '#f5f5f5',
                    overflow: 'hidden', // Prevent parent scroll
                    display: 'flex',
                    justifyContent: 'center'
                }}>
                    <Card
                        style={{ width: '100%', maxWidth: '850px', height: '100%', display: 'flex', flexDirection: 'column', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
                        bodyStyle={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}
                    >
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
                            <TinyMCEEditor
                                value={initialContent}
                                onChange={(val) => {
                                    contentRef.current = val;
                                }}
                                onInit={(_evt, editor) => {
                                    editorRef.current = editor;
                                }}
                            />
                        </div>

                    </Card>
                </Content>

                {/* Sidebar - Recommendations */}
                <Sider width={400} theme="light" style={{ borderLeft: '1px solid #f0f0f0', padding: '16px', overflowY: 'auto' }}>
                    <Title level={5}>
                        <WarningOutlined style={{ marginRight: 8, color: '#faad14' }} />
                        Selected Issues ({selectedRisks.length})
                    </Title>
                    <Divider style={{ margin: '12px 0' }} />

                    <List
                        dataSource={selectedRisks}
                        renderItem={risk => (
                            <Card
                                size="small"
                                style={{
                                    marginBottom: 16,
                                    borderLeft: `4px solid ${risk.risk_type === 'recommendation' ? '#faad14' : '#1890ff'}`,
                                    cursor: 'pointer',
                                    transition: 'all 0.3s'
                                }}
                                hoverable
                                onClick={() => handleRiskClick(risk)}
                                key={risk.id}
                                title={
                                    <Space>
                                        <Badge status={risk.severity === 'high' ? 'error' : 'warning'} />
                                        <Text strong>{risk.section?.split('-')[0] || 'Unknown Section'}</Text>
                                    </Space>
                                }
                                extra={
                                    <Space>
                                        <Tag color={
                                            risk.severity === 'high' ? 'red' :
                                                risk.severity === 'medium' ? 'orange' : 'green'
                                        }>
                                            {risk.severity?.toUpperCase() || 'UNKNOWN'}
                                        </Tag>
                                        {risk.risk_type === 'recommendation' ?
                                            <Tag color="orange">Recommendation</Tag> :
                                            <Tag color="blue">Modification</Tag>
                                        }
                                    </Space>
                                }
                            >
                                <Paragraph ellipsis={{ rows: 2, expandable: true, symbol: 'more' }}>
                                    <Text type="secondary">{risk.description}</Text>
                                </Paragraph>

                                {risk.suggested_text && (
                                    <div style={{ background: '#f6ffed', padding: '8px', borderRadius: '4px', border: '1px solid #b7eb8f' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <Text strong style={{ color: '#389e0d', fontSize: '12px' }}>
                                                <CheckCircleOutlined /> Suggestion:
                                            </Text>
                                            {/* APPLY BUTTON */}
                                            {risk.risk_type !== 'recommendation' && (
                                                <Button
                                                    size="small"
                                                    type="primary"
                                                    style={{ background: '#389e0d', borderColor: '#389e0d', fontSize: '11px', height: '22px' }}
                                                    onClick={(e) => handleApplyRisk(e, risk)}
                                                >
                                                    Apply
                                                </Button>
                                            )}
                                        </div>
                                        <Paragraph style={{ margin: '4px 0', fontSize: '13px' }}>
                                            {risk.suggested_text}
                                        </Paragraph>
                                        <Button
                                            size="small"
                                            type="link"
                                            icon={<CopyOutlined />}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleCopyParams(risk.suggested_text || '');
                                            }}
                                            style={{ padding: 0 }}
                                        >
                                            Copy to clipboard
                                        </Button>
                                    </div>
                                )}
                            </Card>
                        )}
                    />

                    {selectedRisks.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '24px', color: '#999' }}>
                            <InfoCircleOutlined style={{ fontSize: '24px', marginBottom: '8px' }} />
                            <p>No issues selected.</p>
                        </div>
                    )}
                </Sider>
            </Layout>
        </Layout>
    );
};

export default ReviewEditPage;
