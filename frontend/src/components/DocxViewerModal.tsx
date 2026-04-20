import React, { useState, useEffect, useRef } from 'react';
import { Modal, Spin, Button, Space, message, Input, Tooltip, Badge, Select, Avatar, Tag, Steps } from 'antd';
import {
    DownloadOutlined,
    CloseOutlined,
    DiffOutlined,
    PlusOutlined,
    CommentOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined,
    DeleteOutlined,
    MessageOutlined,
    SendOutlined,
    FileWordOutlined,
} from '@ant-design/icons';
import DOMPurify from 'dompurify';
import contractService, { Comment } from '../services/contractService';
import { PlatformComment, PlatformCommentReply } from '../types/types';

const { TextArea } = Input;

interface VersionRef {
    id: string;
    version: string;
}

interface DocxViewerModalProps {
    visible: boolean;
    versionId: string | null;
    contractId: string;
    versionName?: string;
    versions?: VersionRef[];
    currentUserId?: string;
    currentUserRole?: string;
    initialTrackChanges?: boolean;
    onClose: () => void;
}

// ── Diff rendering helpers ────────────────────────────────────────────────────

interface DiffPart {
    type: 'unchanged_part' | 'removed_part' | 'added_part' | 'changed_part';
    content: string;
}

interface DiffChunk {
    type: 'unchanged' | 'removed' | 'added' | 'strikethrough' | 'replaced';
    content: string;
    parts?: DiffPart[];
}

function renderDiffHtml(chunks: DiffChunk[]): string {
    return chunks
        .map((chunk) => {
            if (chunk.type === 'unchanged') {
                return `<span>${escapeHtml(chunk.content)}</span>`;
            }
            if (chunk.type === 'strikethrough') {
                return `<del style="color:#cf1322;background:#fff1f0;text-decoration:line-through;padding:0 2px;">${escapeHtml(chunk.content)}</del>`;
            }
            if (chunk.type === 'replaced' && chunk.parts) {
                const inner = chunk.parts
                    .map((p) => {
                        if (p.type === 'removed_part') {
                            return `<del style="color:#cf1322;background:#fff1f0;text-decoration:line-through;padding:0 1px;">${escapeHtml(p.content)}</del>`;
                        }
                        if (p.type === 'added_part') {
                            return `<ins style="color:#389e0d;background:#f6ffed;text-decoration:none;padding:0 1px;">${escapeHtml(p.content)}</ins>`;
                        }
                        return `<span>${escapeHtml(p.content)}</span>`;
                    })
                    .join('');
                return `<span>${inner}</span>`;
            }
            if (chunk.type === 'removed') {
                return `<del style="color:#cf1322;background:#fff1f0;text-decoration:line-through;">${escapeHtml(chunk.content)}</del>`;
            }
            if (chunk.type === 'added') {
                return `<ins style="color:#389e0d;background:#f6ffed;text-decoration:none;">${escapeHtml(chunk.content)}</ins>`;
            }
            return escapeHtml(chunk.content);
        })
        .join('');
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br/>');
}

// ── Unified comment type ──────────────────────────────────────────────────────

type UnifiedComment =
    | { source: 'docx'; uid: string; quote?: string; versionLabel?: string; data: Comment }
    | { source: 'platform'; uid: string; quote?: string; versionLabel?: string; data: PlatformComment };

// ── Avatar helpers ────────────────────────────────────────────────────────────

const AVATAR_COLORS = ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2'];
const avatarColor = (name: string) => AVATAR_COLORS[(name || '?').charCodeAt(0) % AVATAR_COLORS.length];
const getInitials = (name: string) =>
    (name || '?').split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
const formatDate = (d: string) => { try { return new Date(d).toLocaleString('vi-VN'); } catch { return d; } };

// ─────────────────────────────────────────────────────────────────────────────

const DocxViewerModal: React.FC<DocxViewerModalProps> = ({
    visible,
    versionId,
    contractId,
    versionName = 'Contract',
    versions = [],
    currentUserId = '',
    currentUserRole = 'user',
    initialTrackChanges = false,
    onClose,
}) => {
    const docPaneRef = useRef<HTMLDivElement>(null);
    const sidebarRef = useRef<HTMLDivElement>(null);

    // Document state
    const [docHtml, setDocHtml] = useState<string>('');
    const [loading, setLoading] = useState(true);

    // DOCX-native comments (read-only, from Word file)
    const [docxComments, setDocxComments] = useState<Comment[]>([]);
    const [compareDocxComments, setCompareDocxComments] = useState<Comment[]>([]);

    // Platform comments
    const [platformComments, setPlatformComments] = useState<PlatformComment[]>([]);
    const [loadingComments, setLoadingComments] = useState(false);
    const [commentFilter, setCommentFilter] = useState<string>('current_and_earlier');

    // Active comment (either source)
    const [activeUid, setActiveUid] = useState<string | null>(null);

    // Reply boxes per platform comment
    const [showReplyBox, setShowReplyBox] = useState<Record<string, boolean>>({});
    const [replyText, setReplyText] = useState<Record<string, string>>({});
    const [showRepliesMap, setShowRepliesMap] = useState<Record<string, boolean>>({});

    // New comment form
    const [showNewCommentForm, setShowNewCommentForm] = useState(false);
    const [newCommentText, setNewCommentText] = useState('');
    const [selectedQuote, setSelectedQuote] = useState('');
    const [selectedPosition, setSelectedPosition] = useState<{ paragraphIndex: number; offsetStart: number; offsetEnd: number } | null>(null);
    const [submittingComment, setSubmittingComment] = useState(false);

    // Track Changes
    const [trackChangesMode, setTrackChangesMode] = useState(false);
    const [diffHtml, setDiffHtml] = useState<string>('');
    const [loadingDiff, setLoadingDiff] = useState(false);
    const [compareVersionId, setCompareVersionId] = useState<string>('');

    // Timeline Stepper state
    const [timelineStep, setTimelineStep] = useState<number>(-1);
    const [allVersionComments, setAllVersionComments] = useState<{ versionId: string; versionLabel: string; comments: Comment[] }[]>([]);

    const prevVersion = React.useMemo(() => {
        if (!versionId || versions.length < 2) return null;
        const sorted = [...versions].sort((a, b) => a.version.localeCompare(b.version));
        const idx = sorted.findIndex((v) => v.id === versionId);
        return idx > 0 ? sorted[idx - 1] : null;
    }, [versionId, versions]);

    // ── Load data on open ────────────────────────────────────────────────────
    useEffect(() => {
        if (visible && versionId) {
            loadDocument();
            loadDocxComments();
            loadPlatformComments();
            if (prevVersion) setCompareVersionId(prevVersion.id);
        } else {
            setDocxComments([]);
            setCompareDocxComments([]);
            setDocHtml('');
            setActiveUid(null);
            setPlatformComments([]);
            setDiffHtml('');
            setTrackChangesMode(false);
        }
    }, [visible, versionId]);

    // Auto-enable Track Changes when opened via Negotiation button
    useEffect(() => {
        if (visible && initialTrackChanges && !loading && docHtml && compareVersionId && !trackChangesMode) {
            handleToggleTrackChanges();
        }
    }, [visible, initialTrackChanges, loading, docHtml, compareVersionId]);

    const loadDocument = async () => {
        if (!contractId || !versionId) return;
        setLoading(true);
        setDocHtml('');
        try {
            const { html } = await contractService.getVersionHtmlPreview(contractId, versionId);
            setDocHtml(html);
        } catch {
            message.error('Failed to load preview');
        } finally {
            setLoading(false);
        }
    };

    const loadDocxComments = async () => {
        if (!versionId) return;
        try {
            const data = await contractService.getVersionComments(contractId, versionId);
            setDocxComments(data.comments || []);
        } catch { /* Non-critical */ }
    };

    const loadPlatformComments = async () => {
        setLoadingComments(true);
        try {
            const data = await contractService.getPlatformComments(contractId);
            setPlatformComments(data);
        } catch { /* Non-critical */ }
        finally { setLoadingComments(false); }
    };

    // ── Sorted versions (chronological) ─────────────────────────────────────
    const sortedVersions = React.useMemo(() =>
        [...versions].sort((a, b) => a.version.localeCompare(b.version)),
        [versions]);

    // In Track Changes mode, the "effective" version is the timeline step being viewed,
    // not the original versionId prop. This ensures comment filtering is correct.
    const effectiveVersionId = React.useMemo(() => {
        if (trackChangesMode && timelineStep >= 0 && sortedVersions[timelineStep]) {
            return sortedVersions[timelineStep].id;
        }
        return versionId;
    }, [trackChangesMode, timelineStep, sortedVersions, versionId]);

    // Version IDs up to and including the currently viewed version
    const allowedVersionIds = React.useMemo(() => {
        const vid = effectiveVersionId;
        if (!vid) return new Set<string>();
        const idx = sortedVersions.findIndex((v) => v.id === vid);
        if (idx < 0) return new Set(sortedVersions.map((v) => v.id));
        return new Set(sortedVersions.slice(0, idx + 1).map((v) => v.id));
    }, [effectiveVersionId, sortedVersions]);

    // ── Track Changes ─────────────────────────────────────────────────────────
    const handleToggleTrackChanges = async () => {
        if (trackChangesMode) {
            setTrackChangesMode(false);
            setCompareDocxComments([]);
            setTimelineStep(-1);
            setAllVersionComments([]);
            return;
        }
        if (!compareVersionId || !versionId) { message.warning('Không có version trước để so sánh'); return; }
        setLoadingDiff(true);
        try {
            // Use word-level text diff
            const [textResult, compareComments] = await Promise.all([
                contractService.compareVersions(contractId, compareVersionId, versionId),
                contractService.getVersionComments(contractId, compareVersionId).catch(() => ({ comments: [] })),
            ]);

            setDiffHtml(renderDiffHtml(textResult.diff || []));
            setCompareDocxComments(compareComments.comments || []);

            // Load docx comments from ALL versions for the timeline sidebar
            const allCommentPromises = sortedVersions.map(async (v) => {
                try {
                    const res = await contractService.getVersionComments(contractId, v.id);
                    return { versionId: v.id, versionLabel: v.version, comments: res.comments || [] };
                } catch { return { versionId: v.id, versionLabel: v.version, comments: [] }; }
            });
            const allComments = await Promise.all(allCommentPromises);
            setAllVersionComments(allComments);

            // Set timeline step to the current comparison
            const currentIdx = sortedVersions.findIndex(v => v.id === versionId);
            setTimelineStep(currentIdx >= 0 ? currentIdx : sortedVersions.length - 1);

            setTrackChangesMode(true);
        } catch { message.error('Không thể tải Track Changes'); }
        finally { setLoadingDiff(false); }
    };

    // ── Timeline step click ───────────────────────────────────────────────────
    const handleTimelineStepClick = async (stepIdx: number) => {
        if (stepIdx <= 0 || stepIdx === timelineStep || loadingDiff) return;
        const newVersion = sortedVersions[stepIdx];
        const oldVersion = sortedVersions[stepIdx - 1];
        if (!newVersion || !oldVersion) return;

        setLoadingDiff(true);
        try {
            const textResult = await contractService.compareVersions(contractId, oldVersion.id, newVersion.id);
            setDiffHtml(renderDiffHtml(textResult.diff || []));

            setCompareVersionId(oldVersion.id);
            setTimelineStep(stepIdx);

            // Update compare docx comments to the old version of this step
            const compareComments = allVersionComments.find(c => c.versionId === oldVersion.id);
            setCompareDocxComments(compareComments?.comments || []);
        } catch { message.error('Không thể tải diff cho bước này'); }
        finally { setLoadingDiff(false); }
    };

    // ── Unified comment list ──────────────────────────────────────────────────
    const unifiedComments = React.useMemo((): UnifiedComment[] => {
        let filtered: PlatformComment[];
        if (commentFilter === 'all') {
            filtered = platformComments;
        } else if (commentFilter === 'current') {
            filtered = platformComments.filter((c) => c.versionId === versionId);
        } else if (commentFilter === 'current_and_earlier') {
            filtered = platformComments.filter((c) => !c.versionId || allowedVersionIds.has(c.versionId));
        } else {
            filtered = platformComments.filter((c) => c.versionId === commentFilter);
        }

        let docxItems: UnifiedComment[];

        if (trackChangesMode && allVersionComments.length > 0) {
            // In track changes mode: show docx comments up to the current timeline step
            const seen = new Set<string>();
            docxItems = allVersionComments
                .filter(({ versionId: vid }) => allowedVersionIds.has(vid))
                .flatMap(({ versionLabel, comments }) =>
                    comments
                        .filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true; })
                        .map(c => ({
                            source: 'docx' as const,
                            uid: `docx-${versionLabel}-${c.id}`,
                            quote: c.quote ?? undefined,
                            versionLabel,
                            data: c,
                        }))
                );
        } else {
            const currentVersionLabel = versions.find((v) => v.id === versionId)?.version;
            const compareVersionLabel = versions.find((v) => v.id === compareVersionId)?.version;

            docxItems = docxComments.map((c) => ({
                source: 'docx' as const,
                uid: `docx-${c.id}`,
                quote: c.quote ?? undefined,
                versionLabel: currentVersionLabel,
                data: c,
            }));

            // In track changes mode (without allVersionComments loaded yet), include compare
            if (trackChangesMode && compareDocxComments.length > 0) {
                docxItems = [
                    ...docxItems,
                    ...compareDocxComments.map((c) => ({
                        source: 'docx' as const,
                        uid: `docx-cmp-${c.id}`,
                        quote: c.quote ?? undefined,
                        versionLabel: compareVersionLabel,
                        data: c,
                    })),
                ];
            }
        }

        const platformItems: UnifiedComment[] = filtered.map((c) => ({
            source: 'platform',
            uid: `plat-${c.id}`,
            quote: c.quote ?? undefined,
            versionLabel: c.versionName || versions.find((v) => v.id === c.versionId)?.version,
            data: c,
        }));

        // Items with a quote come first (they are anchored to text), then no-quote ones
        const all = [...docxItems, ...platformItems];
        const hasQuote = all.filter((c) => c.quote && c.quote.length > 3);
        const noQuote = all.filter((c) => !c.quote || c.quote.length <= 3);
        return [...hasQuote, ...noQuote];
    }, [docxComments, compareDocxComments, platformComments, commentFilter, versionId, trackChangesMode, compareVersionId, versions, allVersionComments, allowedVersionIds]);

    // ── Highlight comments in HTML ─────────────────────────────────────────────
    // Word comments: backend custom converter injects <span data-comment-id>.
    //   Text-search below is a FALLBACK if converter fell back to mammoth.
    // Platform comments: position-based injection or text-search fallback.
    const processedHtml = React.useMemo(() => {
        if (!docHtml) return docHtml;

        const platformQuoted = platformComments
            .filter((c) => c.quote && c.quote.length > 3)
            .filter((c) => !c.versionId || allowedVersionIds.has(c.versionId))
            .sort((a, b) => (b.quote?.length || 0) - (a.quote?.length || 0));

        // Separate comments with position data vs without
        const withPosition = platformQuoted.filter(
            (c) => c.paragraphIndex != null && c.offsetStart != null && c.offsetEnd != null
        );
        const withoutPosition = platformQuoted.filter(
            (c) => c.paragraphIndex == null || c.offsetStart == null || c.offsetEnd == null
        );

        // Parse HTML into a temporary DOM for position-based injection
        const parser = new DOMParser();
        const doc = parser.parseFromString(`<div>${docHtml}</div>`, 'text/html');
        const root = doc.body.firstElementChild!;
        const blocks = root.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, td, th');

        // Inject highlights using paragraph position (accurate, handles duplicates)
        withPosition.forEach((c) => {
            const block = blocks[c.paragraphIndex!];
            if (!block) return;

            const walker = doc.createTreeWalker(block, NodeFilter.SHOW_TEXT);
            let charCount = 0;
            let startNode: Text | null = null;
            let startOffset = 0;
            let endNode: Text | null = null;
            let endOffset = 0;

            while (walker.nextNode()) {
                const textNode = walker.currentNode as Text;
                const nodeLen = textNode.length;

                if (!startNode && charCount + nodeLen > c.offsetStart!) {
                    startNode = textNode;
                    startOffset = c.offsetStart! - charCount;
                }
                if (startNode && charCount + nodeLen >= c.offsetEnd!) {
                    endNode = textNode;
                    endOffset = c.offsetEnd! - charCount;
                    break;
                }
                charCount += nodeLen;
            }

            if (startNode && endNode) {
                try {
                    const range = doc.createRange();
                    range.setStart(startNode, startOffset);
                    range.setEnd(endNode, endOffset);
                    const span = doc.createElement('span');
                    span.className = 'comment-highlight';
                    span.setAttribute('data-uid', `plat-${c.id}`);
                    span.setAttribute('data-source', 'platform');
                    range.surroundContents(span);
                } catch {
                    // surroundContents can fail if range crosses element boundaries
                }
            }
        });

        let html = root.innerHTML;

        // Fallback: text-search for platform comments without position data (legacy)
        withoutPosition.forEach((c) => {
            const q = c.quote!
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
            if (html.includes(q)) {
                html = html.replace(
                    q,
                    `<span class="comment-highlight" data-uid="plat-${c.id}" data-source="platform">${q}</span>`
                );
            }
        });

        // Fallback: text-search for Word/docx comments (if custom converter fell back to mammoth)
        const docxQuoted = docxComments
            .filter((c) => c.quote && c.quote.length > 3)
            .sort((a, b) => (b.quote?.length || 0) - (a.quote?.length || 0));

        docxQuoted.forEach((c) => {
            const q = c.quote!
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
            // Only inject if the text is NOT already inside a <span data-comment-id> (from custom converter)
            if (html.includes(q) && !html.includes(`data-comment-id="${c.id}"`)) {
                html = html.replace(
                    q,
                    `<span class="comment-range" data-comment-id="${c.id}">${q}</span>`
                );
            }
        });

        return html;
    }, [docHtml, platformComments, docxComments, allowedVersionIds]);

    // ── Highlight comments on diff HTML (Track Changes mode) ─────────────────
    const processedDiffHtml = React.useMemo(() => {
        if (!diffHtml) return diffHtml;
        let html = diffHtml;

        // Collect all comments with quotes (both versions' docx + platform)
        const allQuoted = unifiedComments
            .filter((c) => c.quote && c.quote.length > 3)
            .sort((a, b) => (b.quote?.length || 0) - (a.quote?.length || 0));

        allQuoted.forEach((c) => {
            const q = c.quote!
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
            if (html.includes(q)) {
                const cls = c.source === 'docx' ? 'comment-range' : 'comment-highlight';
                const attr = c.source === 'docx'
                    ? `data-comment-id="${(c.data as Comment).id}"`
                    : `data-uid="${c.uid}" data-source="platform"`;
                html = html.replace(q, `<span class="${cls}" ${attr}>${q}</span>`);
            }
        });
        return html;
    }, [diffHtml, unifiedComments]);

    // ── Helper: extract raw comment id from any docx UID pattern ──────────────
    // Handles: "docx-{id}", "docx-cmp-{id}", and "docx-{versionLabel}-{id}"
    const extractCommentId = (uid: string): string | null => {
        if (!uid.startsWith('docx-')) return null;
        if (uid.startsWith('docx-cmp-')) return uid.slice('docx-cmp-'.length);
        const rest = uid.slice('docx-'.length);
        // If rest contains a dash (e.g. "v1-0"), the last segment is the id
        const lastDash = rest.lastIndexOf('-');
        return lastDash >= 0 ? rest.substring(lastDash + 1) : rest;
    };

    // ── Active highlight (both Word data-comment-id and platform data-uid) ───
    useEffect(() => {
        // Remove previous active
        document.querySelectorAll('.active-highlight').forEach((el) => {
            el.classList.remove('active-highlight');
        });
        if (!activeUid) return;

        // Word comment: activeUid = "docx-{id}", "docx-cmp-{id}", or "docx-v1-{id}"
        // Platform comment: activeUid = "plat-{id}" → data-uid = "plat-{id}"
        let target: Element | null = null;
        const commentId = extractCommentId(activeUid);
        if (commentId !== null) {
            target = document.querySelector(`.comment-range[data-comment-id="${commentId}"]`);
        } else {
            target = document.querySelector(`.comment-highlight[data-uid="${activeUid}"]`);
        }
        if (target) {
            target.classList.add('active-highlight');
        }
    }, [activeUid]);

    // ── Click highlight → sidebar ─────────────────────────────────────────────
    const handleDocClick = (e: React.MouseEvent) => {
        const el = e.target as HTMLElement;
        // Check for Word comment range (data-comment-id)
        const commentRange = el.closest('.comment-range[data-comment-id]');
        if (commentRange) {
            const commentId = commentRange.getAttribute('data-comment-id');
            if (commentId) {
                // Find the matching unified comment by raw comment id
                const match = unifiedComments.find(c => {
                    if (!c.uid.startsWith('docx-')) return false;
                    return extractCommentId(c.uid) === commentId;
                });
                const uid = match?.uid || `docx-${commentId}`;
                setActiveUid(uid);
                setTimeout(() => {
                    document.getElementById(`comment-card-${uid}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 50);
                return;
            }
        }
        // Check for platform comment highlight (data-uid)
        const platSpan = el.closest('.comment-highlight[data-uid]');
        if (platSpan) {
            const uid = platSpan.getAttribute('data-uid');
            if (uid) {
                setActiveUid(uid);
                setTimeout(() => {
                    document.getElementById(`comment-card-${uid}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 50);
            }
        }
    };

    // ── Click comment sidebar → scroll doc highlight ──────────────────────────
    const handleCommentCardClick = (uid: string) => {
        setActiveUid(uid === activeUid ? null : uid);
        if (uid !== activeUid) {
            setTimeout(() => {
                let target: Element | null = null;
                const commentId = extractCommentId(uid);
                if (commentId !== null) {
                    target = document.querySelector(`.comment-range[data-comment-id="${commentId}"]`);
                } else {
                    target = document.querySelector(`.comment-highlight[data-uid="${uid}"]`);
                }
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 50);
        }
    };

    // ── Text selection → new comment ─────────────────────────────────────────
    const handleDocMouseUp = () => {
        const sel = window.getSelection();
        if (!sel || sel.toString().trim().length === 0) return;

        setSelectedQuote(sel.toString().trim());

        // Capture paragraph position for accurate highlighting
        try {
            const range = sel.getRangeAt(0);
            const container = document.getElementById('doc-html-content');
            if (!container) return;

            const blocks = container.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, td, th');
            for (let i = 0; i < blocks.length; i++) {
                if (blocks[i].contains(range.startContainer)) {
                    const preRange = document.createRange();
                    preRange.setStart(blocks[i], 0);
                    preRange.setEnd(range.startContainer, range.startOffset);
                    const offsetStart = preRange.toString().length;
                    const offsetEnd = offsetStart + sel.toString().length;
                    setSelectedPosition({ paragraphIndex: i, offsetStart, offsetEnd });
                    return;
                }
            }
        } catch {
            // Fallback: no position data
        }
        setSelectedPosition(null);
    };

    // ── Platform comment actions ──────────────────────────────────────────────
    const handleCreateComment = async () => {
        if (!newCommentText.trim()) return;
        setSubmittingComment(true);
        try {
            const created = await contractService.createPlatformComment(contractId, {
                versionId: versionId || undefined,
                quote: selectedQuote || undefined,
                paragraphIndex: selectedPosition?.paragraphIndex,
                offsetStart: selectedPosition?.offsetStart,
                offsetEnd: selectedPosition?.offsetEnd,
                text: newCommentText.trim(),
            });
            setPlatformComments((prev) => [...prev, created]);
            setNewCommentText('');
            setSelectedQuote('');
            setSelectedPosition(null);
            setShowNewCommentForm(false);
        } catch { message.error('Không thể tạo comment'); }
        finally { setSubmittingComment(false); }
    };

    const handleCommentResolved = (updated: PlatformComment) => {
        setPlatformComments((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    };

    const handleCommentDeleted = (commentId: string) => {
        setPlatformComments((prev) => prev.filter((c) => c.id !== commentId));
    };

    const handleReplyAdded = (commentId: string, reply: PlatformCommentReply) => {
        setPlatformComments((prev) =>
            prev.map((c) => c.id === commentId ? { ...c, replies: [...c.replies, reply] } : c)
        );
    };

    const handleSendReply = async (platformCommentId: string) => {
        const text = (replyText[platformCommentId] || '').trim();
        if (!text) return;
        try {
            const reply = await contractService.createCommentReply(contractId, platformCommentId, text);
            handleReplyAdded(platformCommentId, reply);
            setReplyText((prev) => ({ ...prev, [platformCommentId]: '' }));
            setShowReplyBox((prev) => ({ ...prev, [platformCommentId]: false }));
        } catch { message.error('Không thể gửi phản hồi'); }
    };

    const handleResolve = async (c: PlatformComment) => {
        try {
            const updated = await contractService.resolvePlatformComment(contractId, c.id);
            handleCommentResolved(updated);
        } catch { message.error('Không thể cập nhật trạng thái'); }
    };

    const handleDelete = async (c: PlatformComment) => {
        try {
            await contractService.deletePlatformComment(contractId, c.id);
            handleCommentDeleted(c.id);
        } catch { message.error('Không thể xóa comment'); }
    };

    // ── Download ──────────────────────────────────────────────────────────────
    const handleDownload = async () => {
        if (!versionId) return;
        try {
            message.loading({ content: 'Downloading...', key: 'dl' });
            await contractService.downloadContractVersion(versionId, `${versionName}.docx`);
            message.success({ content: 'Download started', key: 'dl' });
        } catch { message.error({ content: 'Download failed', key: 'dl' }); }
    };

    const unresolved = platformComments.filter((c) => !c.resolved).length;
    const totalComments = unifiedComments.length;

    // ── Render a single unified comment card ──────────────────────────────────
    const renderCommentCard = (item: UnifiedComment) => {
        const uid = item.uid;
        const isActive = activeUid === uid;

        if (item.source === 'docx') {
            const c = item.data as Comment;
            return (
                <div
                    key={uid}
                    id={`comment-card-${uid}`}
                    onClick={() => handleCommentCardClick(uid)}
                    style={{
                        cursor: 'pointer',
                        border: isActive ? '2px solid #1890ff' : '1px solid #f0e8c8',
                        borderLeft: '4px solid #faad14',
                        borderRadius: 8,
                        padding: '10px 12px',
                        marginBottom: 8,
                        background: isActive ? '#fffbe6' : '#fff',
                        transition: 'all 0.2s',
                    }}
                >
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <Avatar
                            size="small"
                            style={{ backgroundColor: avatarColor(c.author), flexShrink: 0, fontSize: 11 }}
                        >
                            {getInitials(c.author)}
                        </Avatar>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontWeight: 600, fontSize: 12 }}>{c.author}</span>
                                <Tag
                                    icon={<FileWordOutlined />}
                                    color="gold"
                                    style={{ fontSize: 10, padding: '0 4px', margin: 0, lineHeight: '16px' }}
                                >
                                    Word
                                </Tag>
                                {item.versionLabel && (
                                    <Tag color="purple" style={{ fontSize: 10, padding: '0 4px', margin: 0, lineHeight: '16px' }}>
                                        {item.versionLabel}
                                    </Tag>
                                )}
                            </div>
                            <div style={{ fontSize: 11, color: '#8c8c8c' }}>{c.date}</div>
                        </div>
                    </div>
                    {/* Quote */}
                    {c.quote && (
                        <div style={{
                            fontSize: 11, fontStyle: 'italic', color: '#595959',
                            borderLeft: '3px solid #faad14', paddingLeft: 6,
                            margin: '6px 0', background: 'rgba(255,214,102,0.12)',
                            borderRadius: '0 4px 4px 0', padding: '4px 6px',
                        }}>
                            "{c.quote.slice(0, 100)}{c.quote.length > 100 ? '…' : ''}"
                        </div>
                    )}
                    {/* Comment text */}
                    <div style={{ fontSize: 13, marginTop: 4 }}>{c.text}</div>
                </div>
            );
        }

        // Platform comment
        const c = item.data as PlatformComment;
        const canDelete = currentUserId === c.authorId || currentUserRole === 'admin';
        const showReplies = showRepliesMap[c.id] !== false; // default true

        return (
            <div
                key={uid}
                id={`comment-card-${uid}`}
                onClick={() => handleCommentCardClick(uid)}
                style={{
                    cursor: 'pointer',
                    background: c.resolved ? '#f6ffed' : '#fff',
                    border: isActive ? '2px solid #1890ff' : `1px solid ${c.resolved ? '#b7eb8f' : '#e8e8e8'}`,
                    borderLeft: `4px solid ${c.resolved ? '#52c41a' : '#1890ff'}`,
                    borderRadius: 8,
                    padding: '10px 12px',
                    marginBottom: 8,
                    transition: 'all 0.2s',
                    opacity: c.resolved ? 0.85 : 1,
                }}
            >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <Avatar
                        size="small"
                        style={{ backgroundColor: avatarColor(c.authorName), flexShrink: 0, fontSize: 11 }}
                    >
                        {getInitials(c.authorName)}
                    </Avatar>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontWeight: 600, fontSize: 12 }}>{c.authorName}</span>
                                {item.versionLabel && (
                                    <Tag color="purple" style={{ fontSize: 10, padding: '0 4px', margin: 0, lineHeight: '16px' }}>
                                        {item.versionLabel}
                                    </Tag>
                                )}
                            </div>
                            <div style={{ display: 'flex', gap: 2 }} onClick={(e) => e.stopPropagation()}>
                                <Tooltip title={c.resolved ? 'Bỏ resolve' : 'Đánh dấu đã giải quyết'}>
                                    <Button
                                        size="small" type="text"
                                        icon={c.resolved
                                            ? <CloseCircleOutlined style={{ color: '#52c41a' }} />
                                            : <CheckCircleOutlined style={{ color: '#8c8c8c' }} />}
                                        onClick={() => handleResolve(c)}
                                        style={{ padding: '0 4px' }}
                                    />
                                </Tooltip>
                                {canDelete && (
                                    <Tooltip title="Xóa comment">
                                        <Button
                                            size="small" type="text" danger
                                            icon={<DeleteOutlined />}
                                            onClick={() => handleDelete(c)}
                                            style={{ padding: '0 4px' }}
                                        />
                                    </Tooltip>
                                )}
                            </div>
                        </div>
                        <div style={{ fontSize: 11, color: '#8c8c8c' }}>
                            {formatDate(c.createdAt)}
                            {c.resolved && (
                                <span style={{ marginLeft: 6, color: '#52c41a', fontWeight: 500 }}>✓ Resolved</span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Quote */}
                {c.quote && (
                    <div style={{
                        margin: '6px 0 4px 32px', padding: '4px 8px',
                        borderLeft: '3px solid #1890ff',
                        background: 'rgba(24,144,255,0.08)',
                        borderRadius: '0 4px 4px 0',
                        fontSize: 12, color: '#595959', fontStyle: 'italic',
                    }}>
                        "{c.quote.length > 120 ? c.quote.slice(0, 120) + '…' : c.quote}"
                    </div>
                )}

                {/* Comment text */}
                <div style={{ margin: '6px 0 0 32px', fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    {c.text}
                </div>

                {/* Replies */}
                {c.replies.length > 0 && (
                    <div style={{ marginLeft: 32, marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
                        <Button
                            type="link" size="small"
                            style={{ padding: 0, fontSize: 12, height: 'auto' }}
                            onClick={() => setShowRepliesMap((prev) => ({ ...prev, [c.id]: !(prev[c.id] !== false) }))}
                        >
                            <MessageOutlined /> {c.replies.length} phản hồi {showReplies ? '▲' : '▼'}
                        </Button>
                        {showReplies && c.replies.map((r) => (
                            <div key={r.id} style={{
                                display: 'flex', gap: 6, marginTop: 6,
                                padding: '6px 8px', background: '#f5f5f5', borderRadius: 6,
                            }}>
                                <Avatar size="small" style={{ backgroundColor: avatarColor(r.authorName), flexShrink: 0, fontSize: 10, width: 22, height: 22, lineHeight: '22px' }}>
                                    {getInitials(r.authorName)}
                                </Avatar>
                                <div style={{ flex: 1 }}>
                                    <span style={{ fontWeight: 600, fontSize: 11 }}>{r.authorName}</span>
                                    <span style={{ fontSize: 10, color: '#8c8c8c', marginLeft: 6 }}>{formatDate(r.createdAt)}</span>
                                    <div style={{ fontSize: 12, marginTop: 2, whiteSpace: 'pre-wrap' }}>{r.text}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Reply box */}
                <div style={{ marginLeft: 32, marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
                    {!showReplyBox[c.id] ? (
                        <Button type="link" size="small" style={{ padding: 0, fontSize: 12, height: 'auto' }} icon={<MessageOutlined />} onClick={() => setShowReplyBox((prev) => ({ ...prev, [c.id]: true }))}>
                            Phản hồi
                        </Button>
                    ) : (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', marginTop: 4 }}>
                            <TextArea
                                autoFocus rows={2}
                                value={replyText[c.id] || ''}
                                onChange={(e) => setReplyText((prev) => ({ ...prev, [c.id]: e.target.value }))}
                                placeholder="Nhập phản hồi..."
                                style={{ fontSize: 12, flex: 1 }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSendReply(c.id);
                                    if (e.key === 'Escape') setShowReplyBox((prev) => ({ ...prev, [c.id]: false }));
                                }}
                            />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <Button size="small" type="primary" icon={<SendOutlined />} onClick={() => handleSendReply(c.id)} disabled={!(replyText[c.id] || '').trim()} />
                                <Button size="small" onClick={() => setShowReplyBox((prev) => ({ ...prev, [c.id]: false }))}>Hủy</Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <Modal
            open={visible}
            onCancel={onClose}
            width="95%"
            style={{ top: 20 }}
            footer={null}
            closable={false}
            destroyOnClose
        >
            <div style={{ height: '88vh', display: 'flex', flexDirection: 'column' }}>
                {/* ── Toolbar ─────────────────────────────────────────────── */}
                <div style={{
                    padding: '10px 16px',
                    borderBottom: '1px solid #f0f0f0',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: '#fafafa', flexWrap: 'wrap', gap: 8,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <strong style={{ fontSize: 15 }}>📄 {versionName}</strong>
                        {unresolved > 0 && (
                            <Badge count={unresolved} size="small" title="Unresolved comments">
                                <CommentOutlined style={{ fontSize: 16, color: '#1890ff' }} />
                            </Badge>
                        )}
                    </div>

                    <Space wrap>
                        {versions.length > 1 && (
                            <Space.Compact>
                                <Select
                                    size="small"
                                    style={{ width: 140 }}
                                    placeholder="So sánh với..."
                                    value={compareVersionId || undefined}
                                    onChange={setCompareVersionId}
                                    options={versions
                                        .filter((v) => v.id !== versionId)
                                        .map((v) => ({ value: v.id, label: v.version }))}
                                />
                                <Button
                                    size="small"
                                    icon={<DiffOutlined />}
                                    type={trackChangesMode ? 'primary' : 'default'}
                                    loading={loadingDiff}
                                    onClick={handleToggleTrackChanges}
                                    style={trackChangesMode ? { background: '#d9f7be', borderColor: '#52c41a', color: '#389e0d' } : {}}
                                >
                                    {trackChangesMode ? 'Tắt Track Changes' : 'Track Changes'}
                                </Button>
                            </Space.Compact>
                        )}
                        <Button size="small" icon={<DownloadOutlined />} onClick={handleDownload} type="primary">
                            Download
                        </Button>
                        <Button size="small" icon={<CloseOutlined />} onClick={onClose}>
                            Đóng
                        </Button>
                    </Space>
                </div>

                <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                    {/* ── Document pane ──────────────────────────────────── */}
                    <div style={{ flex: 3, display: 'flex', flexDirection: 'column', borderRight: '1px solid #e8e8e8' }}>
                        {/* Fixed header for Track Changes (Stepper & Legend) */}
                        {trackChangesMode && (
                            <div style={{
                                padding: '16px 20px', background: '#fff',
                                borderBottom: '1px solid #e8e8e8',
                                zIndex: 10, flexShrink: 0
                            }}>
                                {/* ── Timeline Stepper ─────────────────── */}
                                {sortedVersions.length > 1 && (
                                    <div style={{
                                        marginBottom: 16, padding: '12px 16px',
                                        background: '#fafafa', border: '1px solid #e8e8e8',
                                        borderRadius: 8,
                                    }}>
                                        <Steps
                                            size="small"
                                            current={timelineStep}
                                            onChange={handleTimelineStepClick}
                                            items={sortedVersions.map((v, idx) => ({
                                                title: v.version,
                                                description: idx === 0 ? 'Bản gốc' : undefined,
                                                disabled: idx === 0,
                                                status: idx === timelineStep ? 'process' : (idx < timelineStep ? 'finish' : 'wait'),
                                            }))}
                                        />
                                    </div>
                                )}
                                {/* ── Legend ────────────────────────────── */}
                                <div style={{
                                    padding: '6px 12px', background: '#fffbe6',
                                    border: '1px solid #ffe58f', borderRadius: 6,
                                    fontSize: 13, color: '#ad6800',
                                }}>
                                    <DiffOutlined /> Track Changes: so sánh{' '}
                                    <strong>{versions.find((v) => v.id === compareVersionId)?.version}</strong>
                                    &nbsp;→&nbsp;<strong>{sortedVersions[timelineStep]?.version || versionName}</strong>
                                    &nbsp;·&nbsp;
                                    <span style={{ color: '#cb2431' }}>■ Đã xóa</span>
                                    &nbsp;
                                    <span style={{ color: '#22863a' }}>■ Đã thêm</span>
                                </div>
                            </div>
                        )}

                        {/* Scrollable document area */}
                        <div ref={docPaneRef} style={{
                            flex: 1, overflow: 'auto', background: '#f0f2f5',
                            padding: '32px 20px',
                        }}>
                            {loading ? (
                                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                                    <Spin size="large" tip="Loading document..." />
                                </div>
                            ) : (
                                <div style={{
                                    width: '816px', margin: '0 auto', background: '#fff',
                                    padding: '96px 96px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                                    minHeight: '1056px', position: 'relative',
                                }}>
                                    {trackChangesMode ? (
                                        <>
                                            {loadingDiff ? (
                                                <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
                                                    <Spin tip="Đang tải so sánh..." />
                                                </div>
                                            ) : (
                                                <div
                                                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(processedDiffHtml, { ADD_TAGS: ['ins', 'del', 'style'], ADD_ATTR: ['data-comment-id', 'data-uid', 'data-source'], FORCE_BODY: true }) }}
                                                    style={{ fontFamily: '"Times New Roman", Times, serif', fontSize: 15, lineHeight: 1.5, textAlign: 'justify' }}
                                                    className="docx-preview-content"
                                                    onClick={handleDocClick}
                                                    onMouseUp={handleDocMouseUp}
                                                />
                                            )}
                                        </>
                                    ) : (
                                        <div
                                            id="doc-html-content"
                                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(processedHtml, { ADD_ATTR: ['data-comment-id', 'data-uid', 'data-source'] }) }}
                                            style={{
                                                fontFamily: '"Times New Roman", Times, serif',
                                                fontSize: '15px', lineHeight: '1.5', color: '#000',
                                                textAlign: 'justify', wordWrap: 'break-word',
                                            }}
                                            className="docx-preview-content"
                                            onClick={handleDocClick}
                                            onMouseUp={handleDocMouseUp}
                                        />
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── Unified comment sidebar ─────────────────────────── */}
                    <div ref={sidebarRef} style={{
                        flex: 1, minWidth: 300, maxWidth: 380,
                        display: 'flex', flexDirection: 'column', background: '#fff',
                    }}>
                        {/* Sidebar header */}
                        <div style={{
                            padding: '10px 12px',
                            borderBottom: '1px solid #f0f0f0',
                            background: '#fafafa',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <CommentOutlined style={{ color: '#1890ff' }} />
                                <span style={{ fontWeight: 600, fontSize: 13 }}>
                                    Bình luận
                                    {totalComments > 0 && (
                                        <span style={{ marginLeft: 6, color: '#8c8c8c', fontWeight: 400 }}>
                                            ({totalComments})
                                        </span>
                                    )}
                                </span>
                            </div>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <Select
                                    size="small"
                                    style={{ width: 130 }}
                                    value={commentFilter}
                                    onChange={setCommentFilter}
                                    options={[
                                        { value: 'current_and_earlier', label: 'Version hiện tại & trước' },
                                        { value: 'current', label: `Chỉ version hiện tại` },
                                        { value: 'all', label: 'Tất cả versions' },
                                        ...versions
                                            .filter((v) => v.id !== versionId)
                                            .map((v) => ({ value: v.id, label: v.version })),
                                    ]}
                                />
                                <Tooltip title="Thêm bình luận mới">
                                    <Button
                                        size="small" type="primary" icon={<PlusOutlined />}
                                        onClick={() => setShowNewCommentForm((v) => !v)}
                                    />
                                </Tooltip>
                            </div>
                        </div>

                        {/* New comment form */}
                        {showNewCommentForm && (
                            <div style={{ padding: '10px 12px', borderBottom: '1px solid #f0f0f0', background: '#f0f7ff' }}>
                                {selectedQuote && (
                                    <div style={{
                                        fontSize: 11, color: '#595959', fontStyle: 'italic',
                                        padding: '4px 8px', borderLeft: '3px solid #1890ff',
                                        background: 'rgba(24,144,255,0.08)', marginBottom: 6,
                                        borderRadius: '0 4px 4px 0',
                                    }}>
                                        "{selectedQuote.length > 80 ? selectedQuote.slice(0, 80) + '…' : selectedQuote}"
                                        <Button type="link" size="small" style={{ fontSize: 11, padding: 0, marginLeft: 4 }} onClick={() => setSelectedQuote('')}>✕</Button>
                                    </div>
                                )}
                                {!selectedQuote && (
                                    <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 4 }}>
                                        💡 Bôi đen văn bản trong tài liệu để trích dẫn
                                    </div>
                                )}
                                <TextArea
                                    autoFocus rows={3}
                                    value={newCommentText}
                                    onChange={(e) => setNewCommentText(e.target.value)}
                                    placeholder="Nhập bình luận..."
                                    style={{ fontSize: 13, marginBottom: 6 }}
                                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleCreateComment(); }}
                                />
                                <Space>
                                    <Button size="small" type="primary" loading={submittingComment} onClick={handleCreateComment} disabled={!newCommentText.trim()}>
                                        Gửi
                                    </Button>
                                    <Button size="small" onClick={() => { setShowNewCommentForm(false); setNewCommentText(''); setSelectedQuote(''); }}>
                                        Hủy
                                    </Button>
                                </Space>
                            </div>
                        )}

                        {/* Legend */}
                        <div style={{
                            padding: '6px 12px', borderBottom: '1px solid #f5f5f5',
                            display: 'flex', gap: 12, fontSize: 11, color: '#8c8c8c',
                        }}>
                            <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'rgba(24,144,255,0.18)', border: '1px solid #91caff', borderRadius: 2, marginRight: 4 }} />Bình luận</span>
                            <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'rgba(255,214,102,0.45)', border: '1px solid #ffd666', borderRadius: 2, marginRight: 4 }} />Word</span>
                        </div>

                        {/* Comment list */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
                            {loadingComments ? (
                                <div style={{ textAlign: 'center', paddingTop: 20 }}><Spin size="small" /></div>
                            ) : unifiedComments.length === 0 ? (
                                <div style={{ textAlign: 'center', color: '#bfbfbf', paddingTop: 40, fontSize: 13 }}>
                                    <CommentOutlined style={{ fontSize: 24, display: 'block', marginBottom: 8 }} />
                                    Chưa có bình luận
                                </div>
                            ) : (
                                unifiedComments.map((item) => renderCommentCard(item))
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
                .docx-preview-content h1 { font-size:24px;font-weight:bold;margin:20px 0 16px;text-align:center; }
                .docx-preview-content h2 { font-size:20px;font-weight:bold;margin:16px 0 12px; }
                .docx-preview-content h3 { font-size:16px;font-weight:bold;margin:12px 0 8px; }
                .docx-preview-content p  { margin:8px 0;text-align:justify; }
                .docx-preview-content table { border-collapse:collapse;width:100%;margin:16px 0; }
                .docx-preview-content table td,.docx-preview-content table th { border:1px solid #d9d9d9;padding:8px; }
                .docx-preview-content ul,.docx-preview-content ol { margin:8px 0;padding-left:32px; }
                /* Word comment ranges (from backend XML parser) */
                .comment-range { background-color:rgba(255,214,102,0.25); border-bottom:2px solid #ffd666; cursor:pointer; transition:background-color 0.2s; }
                .comment-range:hover { background-color:rgba(255,214,102,0.5); }
                /* Platform comment highlights (from frontend text search) */
                .comment-highlight { background-color:rgba(24,144,255,0.12); border-bottom:2px solid #91caff; cursor:pointer; transition:background-color 0.2s; }
                .comment-highlight:hover { background-color:rgba(24,144,255,0.25); }
                /* Active (selected) comment — both types */
                .active-highlight { background-color:rgba(255,214,102,0.85)!important; border-bottom:2px solid #faad14!important; }
            `}</style>
        </Modal>
    );
};

export default DocxViewerModal;
