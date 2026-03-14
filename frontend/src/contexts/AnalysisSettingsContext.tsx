import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface AnalysisSettingsContextType {
    fullContextMode: boolean;
    setFullContextMode: (value: boolean) => void;
    toggleFullContextMode: () => void;
}

const AnalysisSettingsContext = createContext<AnalysisSettingsContextType | undefined>(undefined);

export const useAnalysisSettings = () => {
    const context = useContext(AnalysisSettingsContext);
    if (!context) {
        throw new Error('useAnalysisSettings must be used within AnalysisSettingsProvider');
    }
    return context;
};

interface AnalysisSettingsProviderProps {
    children: ReactNode;
}

export const AnalysisSettingsProvider: React.FC<AnalysisSettingsProviderProps> = ({ children }) => {
    const [fullContextMode, setFullContextModeState] = useState<boolean>(() => {
        const saved = localStorage.getItem('fullContextMode');
        return saved === 'true';
    });

    useEffect(() => {
        localStorage.setItem('fullContextMode', String(fullContextMode));
    }, [fullContextMode]);

    const setFullContextMode = (value: boolean) => {
        setFullContextModeState(value);
    };

    const toggleFullContextMode = () => {
        setFullContextModeState(prev => !prev);
    };

    const value: AnalysisSettingsContextType = {
        fullContextMode,
        setFullContextMode,
        toggleFullContextMode,
    };

    return <AnalysisSettingsContext.Provider value={value}>{children}</AnalysisSettingsContext.Provider>;
};
