import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Button, Spin, Alert } from 'antd';
import { ArrowLeftOutlined, DownloadOutlined } from '@ant-design/icons';
import { renderAsync } from 'docx-preview';
import playbookService from '../../services/playbookService';
import { useAuth } from '../../contexts/AuthContext';

const PlaybookPreviewPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const containerRef = useRef<HTMLDivElement>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [downloadUrl, setDownloadUrl] = useState<string>('');
    const { isAdmin } = useAuth();

    useEffect(() => {
        if (id) {
            loadPreview();
        }
    }, [id]);

    const loadPreview = async () => {
        try {
            setLoading(true);
            setError(null);

            // Fetch the file blob directly from backend proxy (Bypasses CORS)
            const blob = await playbookService.getPlaybookFileBlob(id!);

            // Create object URL for the blob
            const objectUrl = URL.createObjectURL(blob);
            setDownloadUrl(objectUrl); // For download button

            // Verify content type from blob if possible, or fallback to file extension inference
            // Note: Blob.type might be generic application/octet-stream if backend didn't set it perfectly, 
            // so we can rely on what we know about the ID/extension or just check the blob type if valid.
            // docx-preview handles blobs well.

            // Check file type via blob or context (id not sufficient implies we might need extension from metadata, 
            // but let's try to detect from blob type first, fallback to extension if we had it but we assume backend sends correct mime).

            // For robustness, let's just try to render based on common sense mapping of MIME types
            // Handle DOCX Files  
            if (blob.type.includes('wordprocessingml') || blob.type.includes('docx') || (blob.type === 'application/octet-stream')) {
                // Assume DOCX if octet-stream and not PDF logic, or just try render
                if (containerRef.current) {
                    try {
                        await renderAsync(blob, containerRef.current);
                    } catch (e) {
                        // If docx render fails, maybe it's a PDF? unlikely mixup but safe to handle error
                        console.error("Docx render failed", e);
                        setError("Failed to render DOCX file. " + (e as Error).message);
                    }
                }
            }
            // Handle Text Files
            else if (blob.type === 'text/plain') {
                const text = await blob.text();
                if (containerRef.current) {
                    // Use pre tag for text
                    const pre = document.createElement('pre');
                    pre.style.whiteSpace = 'pre-wrap';
                    pre.style.fontFamily = 'monospace';
                    pre.style.padding = '16px';
                    pre.style.background = '#f5f5f5';
                    pre.style.borderRadius = '4px';
                    pre.textContent = text; // Safe text insertion

                    containerRef.current.innerHTML = '';
                    containerRef.current.appendChild(pre);
                }
            }
            // Handle PDF Files
            else if (blob.type === 'application/pdf') {
                if (containerRef.current) {
                    const iframe = document.createElement('iframe');
                    iframe.src = objectUrl;
                    iframe.style.width = '100%';
                    iframe.style.height = '80vh';
                    iframe.style.border = 'none';
                    iframe.setAttribute('allow', 'fullscreen');
                    containerRef.current.innerHTML = '';
                    containerRef.current.appendChild(iframe);
                }
            }
            // Fallback: Unknown type
            else {
                setError('Unsupported file type: ' + blob.type);
            }

            // Re-implement extension check via metadata if blob.type is generic
            // For now, let's try to fetch metadata if we need extension, OR just rely on the component erroring out if invalid.
            // Actually, we can assume the previous logic: fetch metadata -> get extension -> render.
            // But we want to save round trips.
            // Let's rely on Backend sending correct Content-Type (which we set in playbooks.py).
        } catch (err: any) {
            console.error('Preview error:', err);
            setError(err.message || 'Failed to load document preview');
        } finally {
            setLoading(false);
        }
    };

    const handleDownload = () => {
        if (downloadUrl) {
            window.open(downloadUrl, '_blank');
        }
    };

    return (
        <div style={{ padding: '24px' }}>
            <style>{`
                /* ── DOCX Preview Container ─────────────────────────── */
                .docx-wrapper {
                    background: #f0f2f5 !important;
                    padding: 24px !important;
                    overflow: auto !important;
                    max-height: calc(100vh - 200px) !important;
                }
                .docx-wrapper > section.docx {
                    /* Let the doc expand to its natural width — no clipping */
                    width: auto !important;
                    max-width: none !important;
                    min-width: 100% !important;
                    box-sizing: border-box !important;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.05) !important;
                    overflow: visible !important;
                }

                /* ── Table Layout: full width + readable ────────────── */
                .docx-wrapper table {
                    width: 100% !important;
                    table-layout: fixed !important;
                    border-collapse: collapse !important;
                    word-wrap: break-word !important;
                    overflow-wrap: break-word !important;
                }
                .docx-wrapper table td,
                .docx-wrapper table th {
                    padding: 8px 10px !important;
                    vertical-align: top !important;
                    border: 1px solid #999 !important;
                    word-wrap: break-word !important;
                    overflow-wrap: break-word !important;
                    background: #fff !important; /* Override Word banded row colors */
                }
                .docx-wrapper table tr {
                    background: #fff !important; /* Remove alternating row colors */
                }

                /* ── Sticky Table Header ────────────────────────────── */
                .docx-wrapper table thead tr,
                .docx-wrapper table tbody tr:first-child {
                    position: sticky;
                    top: 0;
                    z-index: 10;
                }
                .docx-wrapper table thead th,
                .docx-wrapper table thead td {
                    background: #f5f5f5 !important;
                    font-weight: bold !important;
                    position: sticky;
                    top: 0;
                    z-index: 10;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.08);
                }

                /* ── Mobile Responsive ──────────────────────────────── */
                @media (max-width: 768px) {
                    .docx-wrapper {
                        padding: 8px !important;
                    }
                    .docx-wrapper > section.docx {
                        padding: 16px !important;
                    }
                }
            `}</style>
            <div style={{ marginBottom: '16px', display: 'flex', gap: '8px' }}>
                <Button
                    icon={<ArrowLeftOutlined />}
                    onClick={() => navigate('/library')}
                >
                    Back to Library
                </Button>
                {isAdmin && (
                    <Button
                        icon={<DownloadOutlined />}
                        onClick={handleDownload}
                        disabled={!downloadUrl}
                    >
                        Download
                    </Button>
                )}
            </div>

            <Card bodyStyle={{ padding: 0 }}>
                {loading && (
                    <div style={{ textAlign: 'center', padding: '48px' }}>
                        <Spin size="large" />
                        <p style={{ marginTop: '16px' }}>Loading document preview...</p>
                    </div>
                )}

                {error && (
                    <Alert
                        message="Error"
                        description={error}
                        type="error"
                        showIcon
                        style={{ margin: '16px' }}
                    />
                )}

                {!loading && !error && (
                    <div
                        ref={containerRef}
                        style={{
                            minHeight: '400px',
                            maxHeight: 'calc(100vh - 200px)',
                            maxWidth: '100%',
                            overflow: 'auto',
                        }}
                    />
                )}
            </Card>
        </div>
    );
};

export default PlaybookPreviewPage;
