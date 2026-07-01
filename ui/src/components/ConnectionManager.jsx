import { useState } from 'react';
import { FiDatabase, FiCheck, FiX, FiLoader, FiSave } from 'react-icons/fi';
import { connectionAPI } from '../services/api';
import { ClusterSelector } from './ClusterSelector';
import { profileStorage } from '../utils/profileStorage';
import './ConnectionManager.css';

export const ConnectionManager = ({ onConnectionChange, connectionStatus }) => {
    const [isOpen, setIsOpen] = useState(!connectionStatus.connected);
    const [formData, setFormData] = useState({
        host: 'localhost',
        port: '3000',
        username: '',
        password: '',
        timeout: '5000',
        maxRetries: '0',
        maxConnsPerNode: '64',
    });
    const [connecting, setConnecting] = useState(false);
    const [error, setError] = useState(null);
    const [currentProfile, setCurrentProfile] = useState(null);

    const loadProfile = (profile) => {
        setFormData({
            host: profile.host || (profile.hosts || []).join(', '),
            port: profile.port.toString(),
            username: profile.username || '',
            password: profile.password || '',
            timeout: String(profile.timeout || '5000'),
            maxRetries: String(profile.maxRetries || '0'),
            maxConnsPerNode: String(profile.maxConnsPerNode || '64'),
        });
        setCurrentProfile(profile);
    };

    const handleConnect = async (e) => {
        e.preventDefault();
        setConnecting(true);
        setError(null);

        try {
            const seedHosts = formData.host
                .split(',')
                .map(host => host.trim())
                .filter(Boolean);

            const response = await connectionAPI.connect({
                host: seedHosts[0],
                hosts: seedHosts,
                port: parseInt(formData.port),
                username: formData.username || undefined,
                password: formData.password || undefined,
                timeout: parseInt(formData.timeout),
                maxRetries: parseInt(formData.maxRetries),
                maxConnsPerNode: parseInt(formData.maxConnsPerNode),
            });

            if (response.data.connected) {
                onConnectionChange(response.data);
                setIsOpen(false);
            } else {
                setError(response.data.message);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setConnecting(false);
        }
    };

    const handleDisconnect = async () => {
        try {
            await connectionAPI.disconnect();
            onConnectionChange({ connected: false, nodes: [], clusterName: null });
            setIsOpen(true);
        } catch (err) {
            setError(err.message);
        }
    };

    const handleSaveProfile = () => {
        const profileName = prompt('Enter a name for this connection profile:');
        if (profileName) {
            try {
                const profile = {
                    name: profileName,
                    host: formData.host,
                    hosts: formData.host.split(',').map(host => host.trim()).filter(Boolean),
                    port: parseInt(formData.port),
                    username: formData.username,
                    password: formData.password,
                    timeout: parseInt(formData.timeout),
                    maxRetries: parseInt(formData.maxRetries),
                    maxConnsPerNode: parseInt(formData.maxConnsPerNode),
                };
                profileStorage.saveProfile(profile);
                alert('Connection profile saved successfully!');
            } catch (error) {
                alert('Failed to save profile: ' + error.message);
            }
        }
    };

    return (
        <div className="connection-manager">
            <div className="connection-header">
                <div className="connection-status">
                    <FiDatabase className="db-icon" />
                    <div className="status-info">
                        <div className="status-label">
                            {connectionStatus.connected ? (
                                <>
                                    <FiCheck className="status-icon success" />
                                    Connected
                                </>
                            ) : (
                                <>
                                    <FiX className="status-icon error" />
                                    Disconnected
                                </>
                            )}
                        </div>
                        {connectionStatus.connected && (
                            <div className="cluster-name">{connectionStatus.clusterName}</div>
                        )}
                    </div>
                </div>

                {/* Cluster Selector */}
                <ClusterSelector
                    onSelectProfile={loadProfile}
                    currentProfile={currentProfile}
                />

                <div className="connection-actions">
                    {!connectionStatus.connected && (
                        <button
                            className="btn-save-profile"
                            onClick={handleSaveProfile}
                            title="Save this configuration as a profile"
                        >
                            <FiSave /> Save Profile
                        </button>
                    )}
                    <button
                        className="toggle-btn"
                        onClick={() => setIsOpen(!isOpen)}
                    >
                        {isOpen ? 'Hide' : connectionStatus.connected ? 'Manage' : 'Connect'}
                    </button>
                </div>
            </div>

            {isOpen && (
                <div className="connection-form-container fade-in">
                    <form onSubmit={handleConnect} className="connection-form">
                        <div className="form-group">
                            <label htmlFor="host">Seed Hosts</label>
                            <textarea
                                id="host"
                                value={formData.host}
                                onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                                placeholder="host1:3000, host2:3000, host3:3000"
                                disabled={connectionStatus.connected}
                                required
                            />
                            <small>Use one or more comma-separated Aerospike seed hosts.</small>
                        </div>

                        <div className="form-group">
                            <label htmlFor="port">Port</label>
                            <input
                                type="number"
                                id="port"
                                value={formData.port}
                                onChange={(e) => setFormData({ ...formData, port: e.target.value })}
                                placeholder="3000"
                                disabled={connectionStatus.connected}
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="username">Username (Optional)</label>
                            <input
                                type="text"
                                id="username"
                                value={formData.username}
                                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                placeholder="admin"
                                disabled={connectionStatus.connected}
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="password">Password (Optional)</label>
                            <input
                                type="password"
                                id="password"
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                placeholder="••••••••"
                                disabled={connectionStatus.connected}
                            />
                        </div>

                        <div className="connection-policy-grid">
                            <div className="form-group">
                                <label htmlFor="timeout">Timeout ms</label>
                                <input
                                    type="number"
                                    id="timeout"
                                    value={formData.timeout}
                                    onChange={(e) => setFormData({ ...formData, timeout: e.target.value })}
                                    disabled={connectionStatus.connected}
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="maxRetries">Max retries</label>
                                <input
                                    type="number"
                                    id="maxRetries"
                                    value={formData.maxRetries}
                                    onChange={(e) => setFormData({ ...formData, maxRetries: e.target.value })}
                                    disabled={connectionStatus.connected}
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="maxConnsPerNode">Max conns/node</label>
                                <input
                                    type="number"
                                    id="maxConnsPerNode"
                                    value={formData.maxConnsPerNode}
                                    onChange={(e) => setFormData({ ...formData, maxConnsPerNode: e.target.value })}
                                    disabled={connectionStatus.connected}
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="error-message">
                                <FiX /> {error}
                            </div>
                        )}

                        <div className="form-actions">
                            {!connectionStatus.connected ? (
                                <button type="submit" className="btn btn-primary" disabled={connecting}>
                                    {connecting ? (
                                        <>
                                            <FiLoader className="spinner" /> Connecting...
                                        </>
                                    ) : (
                                        'Connect'
                                    )}
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    className="btn btn-danger"
                                    onClick={handleDisconnect}
                                >
                                    Disconnect
                                </button>
                            )}
                        </div>
                    </form>

                    {connectionStatus.connected && connectionStatus.nodes && (
                        <div className="nodes-info">
                            <h4>Cluster Nodes</h4>
                            <div className="nodes-list">
                                {connectionStatus.nodes.map((node, idx) => (
                                    <div key={idx} className="node-item glass">
                                        <div className="node-name">{node.name}</div>
                                        <div className="node-address">{node.address}</div>
                                        <div className={`node-status ${node.active ? 'active' : 'inactive'}`}>
                                            {node.active ? 'Active' : 'Inactive'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
