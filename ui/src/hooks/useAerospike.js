import { useState, useCallback } from 'react';

export const useAerospike = () => {
    const [connectionStatus, setConnectionStatus] = useState({
        connected: false,
        clusterName: null,
        nodes: [],
    });

    const [selectedNamespace, setSelectedNamespace] = useState(null);
    const [selectedSet, setSelectedSet] = useState(null);
    const [namespaces, setNamespaces] = useState([]);
    const [sets, setSets] = useState({});
    const [records, setRecords] = useState([]);
    const [selectedRecord, setSelectedRecord] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const clearError = useCallback(() => {
        setError(null);
    }, []);

    const updateConnectionStatus = useCallback((status) => {
        setConnectionStatus(status);
    }, []);

    const updateNamespaces = useCallback((nsList) => {
        setNamespaces(nsList);
    }, []);

    const updateSets = useCallback((namespace, setsList) => {
        setSets(prev => ({ ...prev, [namespace]: setsList }));
    }, []);

    const selectNamespace = useCallback((namespace) => {
        setSelectedNamespace(namespace);
        setSelectedSet(null);
        setRecords([]);
        setSelectedRecord(null);
    }, []);

    const selectSet = useCallback((setName) => {
        setSelectedSet(setName);
        setSelectedRecord(null);
    }, []);

    const updateRecords = useCallback((recordsList) => {
        setRecords(recordsList);
    }, []);

    const selectRecord = useCallback((record) => {
        setSelectedRecord(record);
    }, []);

    return {
        connectionStatus,
        selectedNamespace,
        selectedSet,
        namespaces,
        sets,
        records,
        selectedRecord,
        loading,
        error,
        setLoading,
        setError,
        clearError,
        updateConnectionStatus,
        updateNamespaces,
        updateSets,
        selectNamespace,
        selectSet,
        updateRecords,
        selectRecord,
    };
};
