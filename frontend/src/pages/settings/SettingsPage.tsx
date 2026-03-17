import React, { useState } from 'react';
import { Card, Switch, Space, Typography, Button, Modal } from 'antd';
import { BulbOutlined, QuestionCircleOutlined, ExperimentOutlined } from '@ant-design/icons';
import { useTheme } from '../../contexts/ThemeContext';
import { useAnalysisSettings } from '../../contexts/AnalysisSettingsContext';

const { Title, Paragraph } = Typography;

const SettingsPage: React.FC = () => {
    const { theme, toggleTheme } = useTheme();
    const { fullContextMode, toggleFullContextMode } = useAnalysisSettings();
    const [guideModalVisible, setGuideModalVisible] = useState(false);

    return (
        <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
            <Title level={2}>Settings</Title>
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
                {/* Theme Section */}
                <Card title="Theme" extra={<BulbOutlined />}>
                    <Space direction="vertical" style={{ width: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <Typography.Text strong>Dark Mode</Typography.Text>
                                <br />
                                <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
                                    Switch between light and dark theme
                                </Typography.Text>
                            </div>
                            <Switch
                                checked={theme === 'dark'}
                                onChange={toggleTheme}
                                checkedChildren="Dark"
                                unCheckedChildren="Light"
                            />
                        </div>
                    </Space>
                </Card>

                {/* Analysis Settings Section */}
                <Card title="Analysis Settings" extra={<ExperimentOutlined />}>
                    <Space direction="vertical" style={{ width: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <Typography.Text strong>📄 Full Context Mode</Typography.Text>
                                <br />
                                <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
                                    Analyze the entire contract at once without chunking. Recommended for complex document structures.
                                    This setting applies globally to all contract analyses.
                                </Typography.Text>
                            </div>
                            <Switch
                                checked={fullContextMode}
                                onChange={toggleFullContextMode}
                                checkedChildren="On"
                                unCheckedChildren="Off"
                            />
                        </div>
                    </Space>
                </Card>

                {/* User Guide Section */}
                <Card title="User Guide" extra={<QuestionCircleOutlined />}>
                    <Space direction="vertical" style={{ width: '100%' }}>
                        <Paragraph>
                            Need help using the system? Check out our user guide for detailed instructions
                            and best practices.
                        </Paragraph>
                        <Button
                            type="default"
                            icon={<QuestionCircleOutlined />}
                            onClick={() => setGuideModalVisible(true)}
                        >
                            Open User Guide
                        </Button>
                    </Space>
                </Card>
            </Space>

            {/* User Guide Modal */}
            <Modal
                title="User Guide"
                open={guideModalVisible}
                onCancel={() => setGuideModalVisible(false)}
                footer={[
                    <Button key="close" onClick={() => setGuideModalVisible(false)}>
                        Close
                    </Button>,
                ]}
                width={800}
            >
                <div style={{ padding: '16px 0' }}>
                    <Title level={4}>Getting Started</Title>
                    <Paragraph>
                        Welcome to the Contract Review System! This guide will help you get started.
                    </Paragraph>

                    <Title level={4}>Contract Management</Title>
                    <Paragraph>
                        <ul>
                            <li>Create new contracts by clicking "Create Contract"</li>
                            <li>Upload contract files (DOCX or PDF)</li>
                            <li>Use AI analysis to identify risks and recommendations</li>
                            <li>Review and accept suggested changes</li>
                        </ul>
                    </Paragraph>

                    <Title level={4}>Profile Settings</Title>
                    <Paragraph>
                        <ul>
                            <li>Update your profile information in "Information & Security"</li>
                            <li>Upload a profile avatar</li>
                            <li>Change your password regularly</li>
                        </ul>
                    </Paragraph>

                    <Title level={4}>Need More Help?</Title>
                    <Paragraph>
                        For additional support, please contact your system administrator.
                    </Paragraph>
                </div>
            </Modal>
        </div>
    );
};

export default SettingsPage;

