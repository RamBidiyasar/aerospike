import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    FiActivity,
    FiBarChart2,
    FiBox,
    FiCode,
    FiCpu,
    FiDatabase,
    FiHardDrive,
    FiLayers,
    FiList,
    FiRefreshCw,
    FiTerminal,
} from 'react-icons/fi';
import { opsAPI } from '../services/api';
import './AerospikeOpsPanel.css';

const COMMON_INFO_COMMANDS = [
    'statistics',
    'service',
    'peers',
    'namespaces',
    'sindex',
    'udf-list',
];

const formatNumber = (value) => {
    if (value === null || value === undefined || value === '') return '-';
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric.toLocaleString() : String(value);
};

const formatBytes = (bytes) => {
    const numeric = Number(bytes || 0);
    if (!numeric) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const index = Math.min(Math.floor(Math.log(numeric) / Math.log(1024)), units.length - 1);
    return `${(numeric / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
};

const formatDuration = (seconds) => {
    const totalSeconds = Number(seconds || 0);
    if (!totalSeconds) return '-';
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
};

const InfoGrid = ({ data, limit = 18 }) => {
    const entries = Object.entries(data || {}).filter(([, value]) => value !== null && value !== undefined);
    if (entries.length === 0) {
        return <div className="ops-empty-inline">No details available from this cluster.</div>;
    }

    return (
        <div className="ops-info-grid">
            {entries.slice(0, limit).map(([key, value]) => (
                <div className="ops-info-item" key={key}>
                    <span>{key}</span>
                    <strong title={String(value)}>{formatNumber(value)}</strong>
                </div>
            ))}
        </div>
    );
};

export const AerospikeOpsPanel = ({
    connectionStatus,
    selectedNamespace,
    selectedSet,
    allSetsValue,
}) => {
    const [activeTab, setActiveTab] = useState('overview');
    const [overview, setOverview] = useState(null);
    const [indexes, setIndexes] = useState([]);
    const [udfs, setUdfs] = useState([]);
    const [binStats, setBinStats] = useState(null);
    const [infoCommand, setInfoCommand] = useState('statistics');
    const [infoNode, setInfoNode] = useState('');
    const [infoResponse, setInfoResponse] = useState(null);
    const [sampleSize, setSampleSize] = useState(100);
    const [loading, setLoading] = useState(null);
    const [error, setError] = useState(null);

    const activeSetName = selectedSet && selectedSet !== allSetsValue ? selectedSet : null;

    const selectedNamespaceInfo = useMemo(() => {
        return overview?.namespaces?.find(namespace => namespace.name === selectedNamespace);
    }, [overview, selectedNamespace]);

    const selectedSetInfo = useMemo(() => {
        return overview?.sets?.find(set => set.namespace === selectedNamespace && set.setName === activeSetName);
    }, [overview, selectedNamespace, activeSetName]);

    const contextIndexes = useMemo(() => {
        return indexes.filter(index => {
            if (selectedNamespace && index.namespace !== selectedNamespace) return false;
            if (activeSetName && index.setName !== activeSetName) return false;
            return true;
        });
    }, [indexes, selectedNamespace, activeSetName]);

    const loadOverview = useCallback(async () => {
        if (!connectionStatus.connected) return;
        setLoading('overview');
        setError(null);
        try {
            const response = await opsAPI.getClusterOverview();
            setOverview(response.data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(null);
        }
    }, [connectionStatus.connected]);

    const loadIndexes = useCallback(async () => {
        if (!connectionStatus.connected) return;
        setLoading('indexes');
        setError(null);
        try {
            const response = await opsAPI.getIndexes({ namespace: selectedNamespace, setName: activeSetName });
            setIndexes(response.data || []);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(null);
        }
    }, [activeSetName, connectionStatus.connected, selectedNamespace]);

    const loadUdfs = useCallback(async () => {
        if (!connectionStatus.connected) return;
        setLoading('udfs');
        setError(null);
        try {
            const response = await opsAPI.getUdfs();
            setUdfs(response.data || []);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(null);
        }
    }, [connectionStatus.connected]);

    const loadBinStats = useCallback(async () => {
        if (!connectionStatus.connected || !selectedNamespace) return;
        setLoading('bins');
        setError(null);
        try {
            const response = await opsAPI.getBinStats({
                namespace: selectedNamespace,
                setName: activeSetName,
                maxRecords: sampleSize,
            });
            setBinStats(response.data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(null);
        }
    }, [activeSetName, connectionStatus.connected, sampleSize, selectedNamespace]);

    const runInfoCommand = async () => {
        setLoading('info');
        setError(null);
        try {
            const response = await opsAPI.runInfoCommand({
                command: infoCommand,
                nodeName: infoNode || undefined,
            });
            setInfoResponse(response.data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(null);
        }
    };

    useEffect(() => {
        if (connectionStatus.connected) {
            loadOverview();
            loadIndexes();
            loadUdfs();
        } else {
            setOverview(null);
            setIndexes([]);
            setUdfs([]);
            setBinStats(null);
            setInfoResponse(null);
        }
    }, [connectionStatus.connected, loadIndexes, loadOverview, loadUdfs]);

    useEffect(() => {
        setBinStats(null);
    }, [selectedNamespace, activeSetName]);

    if (!connectionStatus.connected) {
        return null;
    }

    const tabs = [
        { id: 'overview', label: 'Cluster', icon: FiActivity },
        { id: 'context', label: 'Namespace / Set', icon: FiLayers },
        { id: 'indexes', label: 'Indexes', icon: FiList },
        { id: 'bins', label: 'Bin Stats', icon: FiBarChart2 },
        { id: 'udfs', label: 'UDFs', icon: FiCode },
        { id: 'info', label: 'Info Explorer', icon: FiTerminal },
    ];

    return (
        <section className={`ops-panel ${activeTab === 'context' && activeSetName ? 'set-context-active' : ''}`}>
            <div className="ops-tabs">
                {tabs.map(tab => {
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            className={activeTab === tab.id ? 'active' : ''}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            <Icon /> {tab.label}
                        </button>
                    );
                })}
                <button className="ops-refresh" onClick={loadOverview} disabled={loading === 'overview'}>
                    <FiRefreshCw className={loading === 'overview' ? 'spinning' : ''} /> Refresh
                </button>
            </div>

            {error && <div className="ops-error">{error}</div>}

            {activeTab === 'overview' && (
                <div className="ops-content">
                    <div className="ops-kpi-grid">
                        <div className="ops-kpi-card">
                            <FiCpu />
                            <span>Nodes</span>
                            <strong>{overview?.activeNodeCount || 0}/{overview?.nodeCount || 0}</strong>
                        </div>
                        <div className="ops-kpi-card">
                            <FiDatabase />
                            <span>Namespaces</span>
                            <strong>{overview?.namespaceCount || 0}</strong>
                        </div>
                        <div className="ops-kpi-card">
                            <FiLayers />
                            <span>Sets</span>
                            <strong>{overview?.setCount || 0}</strong>
                        </div>
                        <div className="ops-kpi-card">
                            <FiBox />
                            <span>Objects</span>
                            <strong>{formatNumber(overview?.totalObjects)}</strong>
                        </div>
                        <div className="ops-kpi-card">
                            <FiHardDrive />
                            <span>Data bytes</span>
                            <strong>{formatBytes((overview?.totalMemoryDataBytes || 0) + (overview?.totalDeviceDataBytes || 0))}</strong>
                        </div>
                    </div>

                    <div className="ops-split">
                        <div className="ops-card">
                            <h4>Cluster nodes</h4>
                            <div className="ops-table-wrap">
                                <table className="ops-table">
                                    <thead>
                                        <tr>
                                            <th>Node</th>
                                            <th>Address</th>
                                            <th>Status</th>
                                            <th>Build</th>
                                            <th>Uptime</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(overview?.nodes || []).map(node => (
                                            <tr key={node.name}>
                                                <td>{node.name}</td>
                                                <td>{node.address}</td>
                                                <td><span className={node.active ? 'ops-status active' : 'ops-status'}>{node.active ? 'Active' : 'Inactive'}</span></td>
                                                <td>{node.build || '-'}</td>
                                                <td>{formatDuration(node.uptimeSeconds)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div className="ops-card">
                            <h4>Sample cluster statistics</h4>
                            <InfoGrid data={overview?.clusterStatistics} />
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'context' && (
                <div className="ops-content">
                    {!selectedNamespace ? (
                        <div className="ops-empty-inline">Select a namespace or set to see Aerospike-level details.</div>
                    ) : activeSetName ? (
                        <div className="ops-set-summary-card">
                            <div className="ops-set-title">
                                <span>Set</span>
                                <strong>{selectedNamespace} / {activeSetName}</strong>
                            </div>
                            <div className="ops-set-metrics">
                                <span>Objects <strong>{formatNumber(selectedSetInfo?.objectCount)}</strong></span>
                                <span>Memory <strong>{formatBytes(selectedSetInfo?.memoryDataBytes)}</strong></span>
                                <span>Device <strong>{formatBytes(selectedSetInfo?.deviceDataBytes)}</strong></span>
                                <span>Indexes <strong>{contextIndexes.length}</strong></span>
                            </div>
                            <p>Select "Only namespace" in the browser for full namespace configuration details.</p>
                        </div>
                    ) : (
                        <div className="ops-split">
                            <div className="ops-card">
                                <h4>Namespace: {selectedNamespace}</h4>
                                <div className="ops-mini-kpis">
                                    <span>Objects <strong>{formatNumber(selectedNamespaceInfo?.masterObjects)}</strong></span>
                                    <span>Replication <strong>{formatNumber(selectedNamespaceInfo?.replicationFactor)}</strong></span>
                                    <span>Engine <strong>{selectedNamespaceInfo?.storageEngine || '-'}</strong></span>
                                </div>
                                <InfoGrid data={selectedNamespaceInfo?.config} limit={24} />
                            </div>
                            <div className="ops-card">
                                <h4>Top sets</h4>
                                <div className="ops-table-wrap compact">
                                    <table className="ops-table">
                                        <tbody>
                                            {(overview?.sets || [])
                                                .filter(set => set.namespace === selectedNamespace)
                                                .sort((a, b) => (b.objectCount || 0) - (a.objectCount || 0))
                                                .slice(0, 8)
                                                .map(set => (
                                                    <tr key={set.setName}>
                                                        <td>{set.setName}</td>
                                                        <td>{formatNumber(set.objectCount)}</td>
                                                    </tr>
                                                ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'indexes' && (
                <div className="ops-content">
                    <div className="ops-section-header">
                        <h4>Secondary indexes {selectedNamespace ? `for ${selectedNamespace}${activeSetName ? `.${activeSetName}` : ''}` : ''}</h4>
                        <button onClick={loadIndexes} disabled={loading === 'indexes'}><FiRefreshCw /> Reload</button>
                    </div>
                    <div className="ops-table-wrap">
                        <table className="ops-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Namespace</th>
                                    <th>Set</th>
                                    <th>Bin</th>
                                    <th>Type</th>
                                    <th>Collection</th>
                                    <th>State</th>
                                </tr>
                            </thead>
                            <tbody>
                                {contextIndexes.map((index, idx) => (
                                    <tr key={`${index.indexName}:${idx}`}>
                                        <td>{index.indexName || '-'}</td>
                                        <td>{index.namespace || '-'}</td>
                                        <td>{index.setName || '-'}</td>
                                        <td>{index.binName || '-'}</td>
                                        <td>{index.type || '-'}</td>
                                        <td>{index.collectionType || '-'}</td>
                                        <td>{index.state || index.syncState || '-'}</td>
                                    </tr>
                                ))}
                                {contextIndexes.length === 0 && (
                                    <tr><td colSpan="7" className="ops-empty-cell">No secondary indexes found for this context.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'bins' && (
                <div className="ops-content">
                    <div className="ops-section-header">
                        <h4>Bin statistics sample</h4>
                        <div className="ops-controls">
                            <select value={sampleSize} onChange={(e) => setSampleSize(Number(e.target.value))}>
                                <option value={50}>50 records</option>
                                <option value={100}>100 records</option>
                                <option value={250}>250 records</option>
                                <option value={500}>500 records</option>
                                <option value={1000}>1000 records</option>
                            </select>
                            <button onClick={loadBinStats} disabled={!selectedNamespace || loading === 'bins'}>
                                <FiBarChart2 /> Sample bins
                            </button>
                        </div>
                    </div>
                    {!selectedNamespace ? (
                        <div className="ops-empty-inline">Select a namespace or set before sampling bins.</div>
                    ) : (
                        <div className="ops-table-wrap">
                            <table className="ops-table">
                                <thead>
                                    <tr>
                                        <th>Bin</th>
                                        <th>Records</th>
                                        <th>Coverage</th>
                                        <th>Types</th>
                                        <th>Samples</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(binStats?.bins || []).map(bin => (
                                        <tr key={bin.name}>
                                            <td>{bin.name}</td>
                                            <td>{formatNumber(bin.recordsWithBin)} / {formatNumber(binStats.scannedRecords)}</td>
                                            <td>{bin.coveragePercent}%</td>
                                            <td>{Object.entries(bin.typeCounts || {}).map(([type, count]) => `${type}:${count}`).join(', ')}</td>
                                            <td><code>{(bin.sampleValues || []).join(' | ')}</code></td>
                                        </tr>
                                    ))}
                                    {!binStats && (
                                        <tr><td colSpan="5" className="ops-empty-cell">Run a sample to infer bin names, value types, and coverage.</td></tr>
                                    )}
                                    {binStats && binStats.bins.length === 0 && (
                                        <tr><td colSpan="5" className="ops-empty-cell">No bins found in the sampled records.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'udfs' && (
                <div className="ops-content">
                    <div className="ops-section-header">
                        <h4>Registered UDF modules</h4>
                        <button onClick={loadUdfs} disabled={loading === 'udfs'}><FiRefreshCw /> Reload</button>
                    </div>
                    <div className="ops-table-wrap">
                        <table className="ops-table">
                            <thead>
                                <tr>
                                    <th>File</th>
                                    <th>Type</th>
                                    <th>Hash</th>
                                </tr>
                            </thead>
                            <tbody>
                                {udfs.map((udf, idx) => (
                                    <tr key={`${udf.filename}:${idx}`}>
                                        <td>{udf.filename || '-'}</td>
                                        <td>{udf.type || '-'}</td>
                                        <td><code>{udf.hash || '-'}</code></td>
                                    </tr>
                                ))}
                                {udfs.length === 0 && (
                                    <tr><td colSpan="3" className="ops-empty-cell">No UDF modules reported by the cluster.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'info' && (
                <div className="ops-content">
                    <div className="ops-section-header">
                        <h4>Info command explorer</h4>
                        <div className="ops-controls wide">
                            <input
                                list="info-command-list"
                                value={infoCommand}
                                onChange={(e) => setInfoCommand(e.target.value)}
                                placeholder="statistics, namespace/test, sets/test..."
                            />
                            <datalist id="info-command-list">
                                {COMMON_INFO_COMMANDS.map(command => <option key={command} value={command} />)}
                            </datalist>
                            <select value={infoNode} onChange={(e) => setInfoNode(e.target.value)}>
                                <option value="">First node</option>
                                {(overview?.nodes || []).map(node => (
                                    <option key={node.name} value={node.name}>{node.name}</option>
                                ))}
                            </select>
                            <button onClick={runInfoCommand} disabled={!infoCommand.trim() || loading === 'info'}>
                                <FiTerminal /> Run
                            </button>
                        </div>
                    </div>
                    {infoResponse ? (
                        <div className="ops-info-result">
                            <div className="ops-result-meta">
                                <span>Command: <strong>{infoResponse.command}</strong></span>
                                <span>Node: <strong>{infoResponse.nodeName}</strong></span>
                            </div>
                            <pre>{infoResponse.raw || '(empty response)'}</pre>
                        </div>
                    ) : (
                        <div className="ops-empty-inline">Run an Aerospike info command to inspect raw node details.</div>
                    )}
                </div>
            )}
        </section>
    );
};
