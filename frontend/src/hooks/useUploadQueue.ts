import { useState, useEffect, useCallback, useRef } from 'react';

export interface QueueItem {
    id: string;      // Unique ID (uid)
    file: File;
    status: 'pending' | 'uploading' | 'analyzing' | 'completed' | 'error' | 'retrying';
    progress: number;
    error?: string;
    result?: any;
    retryCount: number;
}

interface UseUploadQueueProps {
    concurrency?: number;
    processFile: (file: File, onProgress: (percent: number) => void) => Promise<any>;
    onComplete?: (results: any[]) => void;
}

export const useUploadQueue = ({ concurrency = 2, processFile, onComplete }: UseUploadQueueProps) => {
    const [queue, setQueue] = useState<QueueItem[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);

    // Refs for mutable state during async operations
    const activeCount = useRef(0);
    const queueRef = useRef<QueueItem[]>([]);

    // Sync ref with state
    useEffect(() => {
        queueRef.current = queue;
    }, [queue]);

    const updateItem = useCallback((id: string, updates: Partial<QueueItem>) => {
        setQueue(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
    }, []);

    const addFiles = useCallback((files: File[]) => {
        const newItems: QueueItem[] = files.map(file => ({
            id: (file as any).uid || Math.random().toString(36).substr(2, 9),
            file,
            status: 'pending',
            progress: 0,
            retryCount: 0
        }));
        setQueue(prev => [...prev, ...newItems]);
        // Trigger processing implies state change detection in useEffect
    }, []);

    const processNext = useCallback(async () => {
        if (activeCount.current >= concurrency) return;

        // Find next pending item
        const nextItem = queueRef.current.find(item => item.status === 'pending');
        if (!nextItem) {
            // Check if all done
            const allDone = queueRef.current.every(i => ['completed', 'error'].includes(i.status));
            if (allDone && isProcessing) {
                setIsProcessing(false);
                if (onComplete) onComplete(queueRef.current.filter(i => i.status === 'completed').map(i => i.result));
            }
            return;
        }

        // Start processing
        activeCount.current++;
        setIsProcessing(true);
        updateItem(nextItem.id, { status: 'uploading', progress: 0 });

        try {
            const result = await processWithRetry(nextItem);
            updateItem(nextItem.id, { status: 'completed', progress: 100, result });
        } catch (error: any) {
            updateItem(nextItem.id, { status: 'error', error: error.message || 'Upload failed' });
        } finally {
            activeCount.current--;
            processNext(); // Loop
        }

    }, [concurrency, processFile, updateItem, onComplete, isProcessing]);

    // Helper: Retry Logic with Backoff
    const processWithRetry = async (item: QueueItem): Promise<any> => {
        const maxRetries = 3;
        let attempt = 0;

        while (true) {
            try {
                return await processFile(item.file, (percent) => {
                    updateItem(item.id, { progress: percent });
                });
            } catch (error: any) {
                // Check if 429 or network error
                const isRetryable = error?.response?.status === 429 || error?.code === 'ERR_NETWORK';

                if (attempt < maxRetries && isRetryable) {
                    attempt++;
                    const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s

                    updateItem(item.id, {
                        status: 'retrying',
                        error: `Rate limit hit. Retrying in ${delay / 1000}s...`,
                        retryCount: attempt
                    });

                    await new Promise(r => setTimeout(r, delay));

                    updateItem(item.id, { status: 'uploading', error: undefined });
                    continue;
                }
                throw error;
            }
        }
    };

    // Trigger loop when queue changes or active count drops
    useEffect(() => {
        processNext();
    }, [queue, processNext]);

    return {
        queue,
        addFiles,
        isProcessing,
        clearQueue: () => setQueue([])
    };
};
