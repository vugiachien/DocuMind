
import { Component, ErrorInfo, ReactNode } from 'react';
import { Button, Result, Typography } from 'antd';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
        errorInfo: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error, errorInfo: null };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);
        this.setState({ errorInfo });
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', flexDirection: 'column' }}>
                    <Result
                        status="500"
                        title="Something went wrong"
                        subTitle="Sorry, something went wrong on this page."
                        extra={[
                            <div key="error" style={{ marginBottom: 20, maxWidth: 800, overflow: 'auto', textAlign: 'left', background: '#f5f5f5', padding: 20 }}>
                                <Typography.Text type="danger" code>
                                    {this.state.error?.toString()}
                                </Typography.Text>
                                <br />
                                <pre style={{ fontSize: 11, marginTop: 10 }}>
                                    {this.state.errorInfo?.componentStack}
                                </pre>
                            </div>,
                            <Button type="primary" key="home" onClick={() => window.location.href = '/'}>
                                Back Home
                            </Button>
                        ]}
                    />
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
