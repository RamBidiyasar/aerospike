import { useCallback, useEffect, useMemo, useState } from 'react';
import { FiBarChart2, FiChevronDown, FiChevronRight, FiDatabase, FiFolder, FiLayers, FiRefreshCw, FiSearch } from 'react-icons/fi';
import { namespaceAPI } from '../services/api';
import './NamespaceBrowser.css';

export const NamespaceBrowser = ({
    connectionStatus,
    onSelectSet,
    onSelectAllSets,
    selectedNamespace,
    selectedSet,
    allSetsValue,
    onNamespacesLoad,
    onSelectNamespace
}) => {
    const [namespaces, setNamespaces] = useState([]);
    const [expandedNamespaces, setExpandedNamespaces] = useState({});
    const [sets, setSets] = useState({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [filter, setFilter] = useState('');

    const loadNamespaces = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await namespaceAPI.getNamespaces();
            const namespacesWithSets = await Promise.all(
                response.data.map(async (ns) => {
                    try {
                        const setsResponse = await namespaceAPI.getSets(ns.name);
                        return { ...ns, sets: setsResponse.data };
                    } catch (err) {
                        console.error(`Failed to load sets for namespace ${ns.name}:`, err);
                        return { ...ns, sets: [] };
                    }
                })
            );

            const setsByNamespace = namespacesWithSets.reduce((acc, ns) => {
                acc[ns.name] = ns.sets || [];
                return acc;
            }, {});

            setNamespaces(namespacesWithSets);
            setSets(setsByNamespace);
            if (onNamespacesLoad) {
                onNamespacesLoad(namespacesWithSets);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [onNamespacesLoad]);

    useEffect(() => {
        if (connectionStatus.connected) {
            loadNamespaces();
        } else {
            setNamespaces([]);
            setSets({});
            setExpandedNamespaces({});
            setFilter('');
        }
    }, [connectionStatus.connected, loadNamespaces]);

    const filteredNamespaces = useMemo(() => {
        const query = filter.trim().toLowerCase();
        if (!query) {
            return namespaces;
        }

        return namespaces
            .map(namespace => {
                const namespaceMatches = namespace.name.toLowerCase().includes(query);
                const visibleSets = (sets[namespace.name] || namespace.sets || [])
                    .filter(set => set.setName.toLowerCase().includes(query));

                if (namespaceMatches || visibleSets.length > 0) {
                    return {
                        ...namespace,
                        sets: namespaceMatches ? (sets[namespace.name] || namespace.sets || []) : visibleSets,
                    };
                }
                return null;
            })
            .filter(Boolean);
    }, [filter, namespaces, sets]);

    const toggleNamespace = async (namespace) => {
        const nsName = namespace.name;
        const isExpanded = expandedNamespaces[nsName];

        if (!isExpanded && !sets[nsName]) {
            try {
                const response = await namespaceAPI.getSets(nsName);
                setSets(prev => ({ ...prev, [nsName]: response.data }));
            } catch (err) {
                setError(err.message);
                return;
            }
        }

        setExpandedNamespaces(prev => ({ ...prev, [nsName]: !isExpanded }));
    };

    const handleNamespaceClick = (namespace) => {
        toggleNamespace(namespace);
        if (onSelectNamespace) {
            onSelectNamespace(namespace.name);
        }
    };

    const handleAllSetsClick = (namespaceName) => {
        if (onSelectAllSets) {
            onSelectAllSets(namespaceName);
        }
        setExpandedNamespaces(prev => ({ ...prev, [namespaceName]: true }));
    };

    const handleSetClick = (namespace, set) => {
        onSelectSet(namespace, set);
    };

    if (!connectionStatus.connected) {
        return (
            <div className="namespace-browser">
                <div className="browser-header">
                    <h3>Database Browser</h3>
                </div>
                <div className="empty-state">
                    <FiDatabase size={48} />
                    <p>Connect to Aerospike to browse namespaces and sets</p>
                </div>
            </div>
        );
    }

    return (
        <div className="namespace-browser">
            <div className="browser-header">
                <div>
                    <h3>Database Browser</h3>
                    <span>{namespaces.length} namespaces</span>
                </div>
                <button className="refresh-btn" onClick={loadNamespaces} disabled={loading}>
                    <FiRefreshCw className={loading ? 'spinning' : ''} />
                </button>
            </div>

            <div className="browser-filter">
                <FiSearch />
                <input
                    type="text"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Filter namespaces or sets..."
                />
            </div>

            {error && (
                <div className="browser-error">
                    {error}
                </div>
            )}

            <div className="namespace-list">
                {filteredNamespaces.map((namespace) => {
                    const namespaceSets = sets[namespace.name] || namespace.sets || [];
                    const isExpanded = expandedNamespaces[namespace.name] || Boolean(filter.trim());
                    const isNamespaceSelected = selectedNamespace === namespace.name && !selectedSet;
                    const isAllSetsSelected = selectedNamespace === namespace.name && selectedSet === allSetsValue;

                    return (
                        <div key={namespace.name} className="namespace-item">
                            <div
                                className={`namespace-header ${isNamespaceSelected ? 'selected' : ''}`}
                                onClick={() => handleNamespaceClick(namespace)}
                            >
                                <div className="namespace-info">
                                    {isExpanded ? (
                                        <FiChevronDown className="chevron" />
                                    ) : (
                                        <FiChevronRight className="chevron" />
                                    )}
                                    <FiFolder className="folder-icon" />
                                    <div className="namespace-label">
                                        <span className="namespace-name">{namespace.name}</span>
                                        <span className="namespace-subtitle">Namespace details</span>
                                    </div>
                                </div>
                                <span className="object-count">
                                    {namespace.masterObjects?.toLocaleString() || 0}
                                </span>
                            </div>

                            {isExpanded && (
                                <div className="sets-list fade-in">
                                    <div
                                        className={`set-item all-sets-item ${isAllSetsSelected ? 'selected' : ''}`}
                                        onClick={() => handleAllSetsClick(namespace.name)}
                                    >
                                        <div className="set-info">
                                            <FiLayers className="set-icon" />
                                            <span className="set-name">All sets</span>
                                        </div>
                                        <span className="set-count">
                                            {namespaceSets.length.toLocaleString()}
                                        </span>
                                    </div>

                                    <div
                                        className={`set-item namespace-summary-item ${isNamespaceSelected ? 'selected' : ''}`}
                                        onClick={() => onSelectNamespace?.(namespace.name)}
                                    >
                                        <div className="set-info">
                                            <FiBarChart2 className="set-icon" />
                                            <span className="set-name">Only namespace</span>
                                        </div>
                                        <span className="set-count">stats</span>
                                    </div>

                                    {namespaceSets.length > 0 ? (
                                        namespaceSets.map((set) => (
                                            <div
                                                key={set.setName}
                                                className={`set-item ${selectedNamespace === namespace.name &&
                                                    selectedSet === set.setName ? 'selected' : ''
                                                    }`}
                                                onClick={() => handleSetClick(namespace.name, set.setName)}
                                            >
                                                <div className="set-info">
                                                    <FiDatabase className="set-icon" />
                                                    <span className="set-name">{set.setName}</span>
                                                </div>
                                                <span className="set-count">
                                                    {set.objectCount?.toLocaleString() || 0}
                                                </span>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="empty-sets">No sets found</div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
