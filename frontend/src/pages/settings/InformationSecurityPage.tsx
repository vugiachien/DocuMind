import React from 'react';
import { Card, Typography } from 'antd';

const { Title, Paragraph } = Typography;

const RemovedAccountSettingsPage: React.FC = () => (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
        <Card>
            <Title level={2}>Account Settings Unavailable</Title>
            <Paragraph>
                Profile updates, password changes, and avatar uploads are no longer available in this system.
            </Paragraph>
        </Card>
    </div>
);

export default RemovedAccountSettingsPage;
