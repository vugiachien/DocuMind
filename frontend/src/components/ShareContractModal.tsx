import React, { useState, useEffect } from 'react';
import { Modal, Button, List, Avatar, Select, message, Spin } from 'antd';
import { UserOutlined, TeamOutlined, DeleteOutlined } from '@ant-design/icons';
import contractService from '../services/contractService';
import userService from '../services/userService';
import { ContractShare, User } from '../types/types';

interface ShareContractModalProps {
    visible: boolean;
    contractId: string;
    onClose: () => void;
}

const ShareContractModal: React.FC<ShareContractModalProps> = ({ visible, contractId, onClose }) => {
    const [shares, setShares] = useState<ContractShare[]>([]);
    const [loading, setLoading] = useState(false);

    // Add Share State
    // Add Share State
    const [searchResults, setSearchResults] = useState<User[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [selectedUser, setSelectedUser] = useState<string | null>(null);

    const [permission, setPermission] = useState('view');

    useEffect(() => {
        if (visible && contractId) {
            fetchShares();
            setPermission('view'); // Reset default
            setSelectedUser(null);
        }
    }, [visible, contractId]);

    const fetchShares = async () => {
        try {
            setLoading(true);
            const data = await contractService.getShares(contractId);
            setShares(data);
        } catch (error) {
            message.error("Failed to load shares");
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = async (value: string) => {
        if (value.length > 2) {
            setSearchLoading(true);
            try {
                const results = await userService.searchUsers(value);
                setSearchResults(results);
            } catch (error) {
                console.error(error);
            } finally {
                setSearchLoading(false);
            }
        }
    };

    const handleShare = async () => {
        if (!selectedUser) return;

        try {
            await contractService.shareContract(contractId, 'user', selectedUser, permission);
            message.success("Contract shared successfully");
            setSelectedUser(null);
            fetchShares();
        } catch (error: any) {
            message.error(error.response?.data?.detail || "Failed to share contract");
        }
    };

    const handleRevoke = async (shareId: string) => {
        try {
            await contractService.revokeShare(contractId, shareId);
            message.success("Access revoked");
            fetchShares();
        } catch (error) {
            message.error("Failed to revoke access");
        }
    };

    return (
        <Modal
            title="Share Contract"
            open={visible}
            onCancel={onClose}
            footer={[
                <Button key="close" onClick={onClose}>
                    Close
                </Button>
            ]}
        >
            <div style={{ marginBottom: 20 }}>
                <h4>Add People</h4>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <Select
                        showSearch
                        value={selectedUser}
                        placeholder="Search users by name..."
                        style={{ flex: 1 }}
                        defaultActiveFirstOption={false}
                        showArrow={false}
                        filterOption={false}
                        onSearch={handleSearch}
                        onChange={setSelectedUser}
                        notFoundContent={searchLoading ? <Spin size="small" /> : null}
                        options={searchResults.map(d => ({
                            value: d.id,
                            label: `${d.name || d.email} (${d.role})`,
                        }))}
                    />
                    <Select value={permission} onChange={setPermission} style={{ width: 100 }}>
                        <Select.Option value="view">View</Select.Option>
                        <Select.Option value="edit">Edit</Select.Option>
                    </Select>
                    <Button type="primary" onClick={handleShare} disabled={!selectedUser}>
                        Share
                    </Button>
                </div>
            </div>

            <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 10 }}>
                <h4>People with access</h4>
                <List
                    loading={loading}
                    itemLayout="horizontal"
                    dataSource={shares}
                    renderItem={item => (
                        <List.Item
                            actions={[
                                <Button
                                    type="text"
                                    danger
                                    icon={<DeleteOutlined />}
                                    onClick={() => handleRevoke(item.id)}
                                >
                                    Revoke
                                </Button>
                            ]}
                        >
                            <List.Item.Meta
                                avatar={<Avatar icon={item.sharedType === 'user' ? <UserOutlined /> : <TeamOutlined />} style={{ backgroundColor: item.sharedType === 'user' ? '#87d068' : '#1890ff' }} />}
                                title={item.targetName || "Unknown"}
                                description={`${item.sharedType === 'user' ? 'User' : 'Department'} • ${item.permission}`}
                            />
                        </List.Item>
                    )}
                    locale={{ emptyText: "Not shared with anyone yet" }}
                />
            </div>
        </Modal>
    );
};

export default ShareContractModal;
