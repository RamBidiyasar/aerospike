import { useState, useEffect } from 'react';
import { FiFolder, FiDatabase, FiChevronRight, FiChevronDown, FiRefreshCw } from 'react-icons/fi';
import { namespaceAPI } from '../services/api';
import './NamespaceBrowser.css';

export const NamespaceBrowser = ({
    connectionStatus,
    onSelectSet,
    selectedNamespace,
    selectedSet,
    onNamespacesLoad,
    onSelectNamespace
}) => {
    const [namespaces, setNamespaces] = useState([]);
    const [expandedNamespaces, setExpandedNamespaces] = useState({});
    const [sets, setSets] = useState({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (connectionStatus.connected) {
            loadNamespaces();
        } else {
            setNamespaces([]);
            setSets({});
            setExpandedNamespaces({});
        }
    }, [connectionStatus]);

    const loadNamespaces = async () => {
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
                        // If fetching sets for a specific namespace fails, return it without sets
                        console.error(`Failed to load sets for namespace ${ns.name}:`, err);
                        return { ...ns, sets: [] };
                    }
                })
            );

            setNamespaces(namespacesWithSets);
            if (onNamespacesLoad) {
                onNamespacesLoad(namespacesWithSets);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

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
                    <p>Connect to Aerospike to browse databases</p>
                </div>
            </div>
        );
    }

    return (
        <div className="namespace-browser">
            <div className="browser-header">
                <h3>Database Browser</h3>
                <button className="refresh-btn" onClick={loadNamespaces} disabled={loading}>
                    <FiRefreshCw className={loading ? 'spinning' : ''} />
                </button>
            </div>

            {error && (
                <div className="browser-error">
                    {error}
                </div>
            )}

            <div className="namespace-list">
                {namespaces.map((namespace) => (
                    <div key={namespace.name} className="namespace-item">
                        <div
                            className={`namespace-header ${selectedNamespace === namespace.name && !selectedSet ? 'selected' : ''}`}
                            onClick={() => {
                                toggleNamespace(namespace);
                                if (onSelectNamespace) {
                                    onSelectNamespace(namespace.name);
                                }
                            }}
                        >
                            <div className="namespace-info">
                                {expandedNamespaces[namespace.name] ? (
                                    <FiChevronDown className="chevron" />
                                ) : (
                                    <FiChevronRight className="chevron" />
                                )}
                                <FiFolder className="folder-icon" />
                                <span className="namespace-name">{namespace.name}</span>
                            </div>
                            <span className="object-count">
                                {namespace.masterObjects?.toLocaleString() || 0}
                            </span>
                        </div>

                        {expandedNamespaces[namespace.name] && (
                            <div className="sets-list fade-in">
                                {sets[namespace.name]?.length > 0 ? (
                                    sets[namespace.name].map((set) => (
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
                ))}
            </div>
        </div>
    );
};
