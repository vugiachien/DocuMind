import React from 'react';
import { Card, Typography, Avatar } from 'antd';
import { ClockCircleOutlined } from '@ant-design/icons';
import { Comment } from '../services/contractService';

const { Text } = Typography;

interface CommentCardProps {
    comment: Comment;
}

const CommentCard: React.FC<CommentCardProps> = ({ comment }) => {
    // Format date nicely
    const formatDate = (dateString: string) => {
        if (!dateString) return '';
        try {
            const date = new Date(dateString);
            return date.toLocaleString();
        } catch (e) {
            return dateString;
        }
    };

    // Get initials for avatar
    const getInitials = (name: string) => {
        return name
            .split(' ')
            .map(n => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
    };

    return (
        <Card
            size="small"
            style={{
                marginBottom: 12,
                borderRadius: 8,
                borderLeft: '4px solid #1890ff',
                boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
            }}
            bodyStyle={{ padding: '12px' }}
        >
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                <Avatar
                    size="small"
                    style={{ backgroundColor: '#1890ff', marginRight: 8, fontSize: 12 }}
                >
                    {getInitials(comment.author)}
                </Avatar>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                    <Text strong style={{ fontSize: 13, display: 'block', lineHeight: 1.2 }} ellipsis>
                        {comment.author}
                    </Text>
                    <div style={{ display: 'flex', alignItems: 'center', marginTop: 2 }}>
                        <ClockCircleOutlined style={{ fontSize: 10, color: '#999', marginRight: 4 }} />
                        <Text type="secondary" style={{ fontSize: 11 }}>
                            {formatDate(comment.date)}
                        </Text>
                    </div>
                </div>
            </div>

            <div style={{
                background: '#f9f9f9',
                padding: '8px',
                borderRadius: 4,
                fontSize: 13,
                lineHeight: 1.5
            }}>
                <Text style={{ whiteSpace: 'pre-wrap' }}>{comment.text}</Text>
            </div>
        </Card>
    );
};

export default CommentCard;
