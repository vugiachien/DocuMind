import React, { useState } from 'react';
import { Avatar, Button, Input, Tooltip, Typography, message } from 'antd';
import {
    CheckCircleOutlined,
    CloseCircleOutlined,
    DeleteOutlined,
    MessageOutlined,
    SendOutlined,
} from '@ant-design/icons';
import { PlatformComment, PlatformCommentReply } from '../types/types';
import contractService from '../services/contractService';

const { Text } = Typography;
const { TextArea } = Input;

interface PlatformCommentCardProps {
    comment: PlatformComment;
    contractId: string;
    currentUserId: string;
    currentUserRole?: string;
    isActive?: boolean;
    onClick?: () => void;
    onResolved?: (updated: PlatformComment) => void;
    onDeleted?: (commentId: string) => void;
    onReplyAdded?: (commentId: string, reply: PlatformCommentReply) => void;
}

const getInitials = (name: string) =>
    name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);

const formatDate = (dateStr: string) => {
    try {
        return new Date(dateStr).toLocaleString('vi-VN');
    } catch {
        return dateStr;
    }
};

const AVATAR_COLORS = ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2'];
const avatarColor = (name: string) =>
    AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];

const PlatformCommentCard: React.FC<PlatformCommentCardProps> = ({
    comment,
    contractId,
    currentUserId,
    currentUserRole,
    isActive = false,
    onClick,
    onResolved,
    onDeleted,
    onReplyAdded,
}) => {
    const [showReplyBox, setShowReplyBox] = useState(false);
    const [replyText, setReplyText] = useState('');
    const [submittingReply, setSubmittingReply] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [resolving, setResolving] = useState(false);
    const [showReplies, setShowReplies] = useState(true);

    const canDelete = currentUserId === comment.authorId || currentUserRole === 'admin';

    const handleReply = async () => {
        if (!replyText.trim()) return;
        setSubmittingReply(true);
        try {
            const reply = await contractService.createCommentReply(contractId, comment.id, replyText.trim());
            onReplyAdded?.(comment.id, reply);
            setReplyText('');
            setShowReplyBox(false);
        } catch {
            message.error('Không thể gửi phản hồi');
        } finally {
            setSubmittingReply(false);
        }
    };

    const handleResolve = async () => {
        setResolving(true);
        try {
            const updated = await contractService.resolvePlatformComment(contractId, comment.id);
            onResolved?.(updated);
        } catch {
            message.error('Không thể cập nhật trạng thái');
        } finally {
            setResolving(false);
        }
    };

    const handleDelete = async () => {
        setDeleting(true);
        try {
            await contractService.deletePlatformComment(contractId, comment.id);
            onDeleted?.(comment.id);
        } catch {
            message.error('Không thể xóa comment');
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div
            onClick={onClick}
            style={{
                background: comment.resolved ? '#f6ffed' : '#fff',
                border: isActive ? '2px solid #1890ff' : `1px solid ${comment.resolved ? '#b7eb8f' : '#e8e8e8'}`,
                borderLeft: `4px solid ${comment.resolved ? '#52c41a' : '#1890ff'}`,
                borderRadius: 8,
                padding: '12px',
                marginBottom: 10,
                cursor: 'pointer',
                transition: 'all 0.2s',
                opacity: comment.resolved ? 0.85 : 1,
            }}
        >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <Avatar
                    size="small"
                    style={{ backgroundColor: avatarColor(comment.authorName), flexShrink: 0, fontSize: 11 }}
                >
                    {getInitials(comment.authorName)}
                </Avatar>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text strong style={{ fontSize: 12 }}>{comment.authorName}</Text>
                        <div style={{ display: 'flex', gap: 4 }} onClick={(e) => e.stopPropagation()}>
                            <Tooltip title={comment.resolved ? 'Bỏ resolve' : 'Đánh dấu đã giải quyết'}>
                                <Button
                                    size="small"
                                    type="text"
                                    loading={resolving}
                                    icon={comment.resolved
                                        ? <CloseCircleOutlined style={{ color: '#52c41a' }} />
                                        : <CheckCircleOutlined style={{ color: '#8c8c8c' }} />}
                                    onClick={handleResolve}
                                    style={{ padding: '0 4px' }}
                                />
                            </Tooltip>
                            {canDelete && (
                                <Tooltip title="Xóa comment">
                                    <Button
                                        size="small"
                                        type="text"
                                        danger
                                        loading={deleting}
                                        icon={<DeleteOutlined />}
                                        onClick={handleDelete}
                                        style={{ padding: '0 4px' }}
                                    />
                                </Tooltip>
                            )}
                        </div>
                    </div>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                        {formatDate(comment.createdAt)}
                        {comment.versionName && (
                            <span style={{ marginLeft: 6, color: '#722ed1', fontWeight: 500 }}>
                                [{comment.versionName}]
                            </span>
                        )}
                        {comment.resolved && (
                            <span style={{ marginLeft: 6, color: '#52c41a', fontWeight: 500 }}>✓ Resolved</span>
                        )}
                    </Text>
                </div>
            </div>

            {/* Quoted text */}
            {comment.quote && (
                <div
                    style={{
                        margin: '8px 0 4px 32px',
                        padding: '4px 8px',
                        borderLeft: '3px solid #faad14',
                        background: 'rgba(255, 214, 102, 0.15)',
                        borderRadius: '0 4px 4px 0',
                        fontSize: 12,
                        color: '#595959',
                        fontStyle: 'italic',
                    }}
                >
                    "{comment.quote.length > 120 ? comment.quote.slice(0, 120) + '…' : comment.quote}"
                </div>
            )}

            {/* Comment text */}
            <div style={{ margin: '8px 0 0 32px', fontSize: 13, lineHeight: 1.5 }}>
                <Text style={{ whiteSpace: 'pre-wrap' }}>{comment.text}</Text>
            </div>

            {/* Replies */}
            {comment.replies.length > 0 && (
                <div style={{ marginLeft: 32, marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
                    <Button
                        type="link"
                        size="small"
                        style={{ padding: 0, fontSize: 12, height: 'auto' }}
                        onClick={() => setShowReplies((v) => !v)}
                    >
                        <MessageOutlined /> {comment.replies.length} phản hồi {showReplies ? '▲' : '▼'}
                    </Button>
                    {showReplies && comment.replies.map((r) => (
                        <div
                            key={r.id}
                            style={{
                                display: 'flex',
                                gap: 6,
                                marginTop: 6,
                                padding: '6px 8px',
                                background: '#f5f5f5',
                                borderRadius: 6,
                            }}
                        >
                            <Avatar
                                size="small"
                                style={{ backgroundColor: avatarColor(r.authorName), flexShrink: 0, fontSize: 10, width: 22, height: 22, lineHeight: '22px' }}
                            >
                                {getInitials(r.authorName)}
                            </Avatar>
                            <div style={{ flex: 1 }}>
                                <Text strong style={{ fontSize: 11 }}>{r.authorName}</Text>
                                <Text type="secondary" style={{ fontSize: 10, marginLeft: 6 }}>{formatDate(r.createdAt)}</Text>
                                <div style={{ fontSize: 12, marginTop: 2 }}>
                                    <Text style={{ whiteSpace: 'pre-wrap' }}>{r.text}</Text>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Reply action + form */}
            <div style={{ marginLeft: 32, marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
                {!showReplyBox ? (
                    <Button
                        type="link"
                        size="small"
                        style={{ padding: 0, fontSize: 12, height: 'auto' }}
                        icon={<MessageOutlined />}
                        onClick={() => setShowReplyBox(true)}
                    >
                        Phản hồi
                    </Button>
                ) : (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', marginTop: 4 }}>
                        <TextArea
                            autoFocus
                            rows={2}
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder="Nhập phản hồi..."
                            style={{ fontSize: 12, flex: 1 }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleReply();
                                if (e.key === 'Escape') { setShowReplyBox(false); setReplyText(''); }
                            }}
                        />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <Button
                                size="small"
                                type="primary"
                                icon={<SendOutlined />}
                                loading={submittingReply}
                                onClick={handleReply}
                                disabled={!replyText.trim()}
                            />
                            <Button
                                size="small"
                                onClick={() => { setShowReplyBox(false); setReplyText(''); }}
                            >
                                Hủy
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PlatformCommentCard;
