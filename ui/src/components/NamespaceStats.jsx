import { useState, useEffect } from 'react';
import { FiPieChart, FiDatabase, FiLayers } from 'react-icons/fi';
import { namespaceAPI } from '../services/api';
import './NamespaceStats.css';

export const NamespaceStats = ({ namespace }) => {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (namespace) {
            loadStats();
        }
    }, [namespace]);

    const loadStats = async () => {
        setLoading(true);
        setError(null);
        try {
            // Fetch sets for statistics
            const setsResponse = await namespaceAPI.getSets(namespace);
            const setsData = setsResponse.data || [];

            // Calculate totals
            const totalSets = setsData.length;
            const totalRecords = setsData.reduce((acc, set) => acc + (set.objectCount || 0), 0);
            const totalMemory = setsData.reduce((acc, set) => acc + (set.memoryDataBytes || 0), 0);
            const totalDevice = setsData.reduce((acc, set) => acc + (set.deviceDataBytes || 0), 0);

            setStats({
                namespace,
                totalSets,
                totalRecords,
                totalMemory,
                totalDevice,
                sets: setsData.sort((a, b) => (b.objectCount || 0) - (a.objectCount || 0)) // Sort by record count desc
            });
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return <div className="namespace-stats-loading">Loading statistics...</div>;
    }

    if (error) {
        return <div className="namespace-stats-error">Error loading statistics: {error}</div>;
    }

    if (!stats) {
        return null;
    }

    const formatBytes = (bytes) => {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <div className="namespace-stats fade-in">
            <h2 className="stats-title">
                <FiPieChart className="stats-icon" />
                Namespace Statistics: <span className="highlight">{namespace}</span>
            </h2>

            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-icon-wrapper">
                        <FiLayers className="stat-icon" />
                    </div>
                    <div className="stat-content">
                        <h3>Total Sets</h3>
                        <p>{stats.totalSets}</p>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon-wrapper">
                        <FiDatabase className="stat-icon" />
                    </div>
                    <div className="stat-content">
                        <h3>Total Records</h3>
                        <p>{stats.totalRecords.toLocaleString()}</p>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon-wrapper">
                        <FiDatabase className="stat-icon" />
                    </div>
                    <div className="stat-content">
                        <h3>Memory Usage</h3>
                        <p>{formatBytes(stats.totalMemory)}</p>
                    </div>
                </div>

                {stats.totalDevice > 0 && (
                    <div className="stat-card">
                        <div className="stat-icon-wrapper">
                            <FiDatabase className="stat-icon" />
                        </div>
                        <div className="stat-content">
                            <h3>Disk Usage</h3>
                            <p>{formatBytes(stats.totalDevice)}</p>
                        </div>
                    </div>
                )}
            </div>

            <div className="sets-breakdown">
                <h3>Sets Breakdown</h3>
                <div className="table-container">
                    <table className="stats-table">
                        <thead>
                            <tr>
                                <th>Set Name</th>
                                <th>Records</th>
                                <th>Memory Usage</th>
                                {stats.totalDevice > 0 && <th>Disk Usage</th>}
                                <th className="percentage-col">% of Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {stats.sets.map((set) => {
                                const percentage = stats.totalRecords > 0
                                    ? ((set.objectCount || 0) / stats.totalRecords * 100).toFixed(1)
                                    : 0;

                                return (
                                    <tr key={set.setName}>
                                        <td>
                                            <div className="set-name-cell">
                                                <FiDatabase className="set-icon-small" />
                                                {set.setName}
                                            </div>
                                        </td>
                                        <td>{(set.objectCount || 0).toLocaleString()}</td>
                                        <td>{formatBytes(set.memoryDataBytes)}</td>
                                        {stats.totalDevice > 0 && <td>{formatBytes(set.deviceDataBytes)}</td>}
                                        <td>
                                            <div className="percentage-bar-wrapper">
                                                <div className="percentage-text">{percentage}%</div>
                                                <div className="percentage-bar-bg">
                                                    <div
                                                        className="percentage-bar-fill"
                                                        style={{ width: `${percentage}%` }}
                                                    ></div>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {stats.sets.length === 0 && (
                                <tr>
                                    <td colSpan="4" className="no-data">No sets found in this namespace</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
