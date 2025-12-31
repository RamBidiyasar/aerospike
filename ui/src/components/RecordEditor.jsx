import { useState, useEffect } from 'react';
import { FiSave, FiX, FiDatabase, FiKey, FiClock, FiPackage } from 'react-icons/fi';
import './RecordEditor.css';

export const RecordEditor = ({ record, onSave, onClose }) => {
    const [formData, setFormData] = useState({
        namespace: '',
        setName: '',
        key: '',
        bins: {},
        ttl: '',
    });
    const [binsJson, setBinsJson] = useState('{}');
    const [error, setError] = useState(null);

    // Helper function to parse nested JSON strings
    const parseNestedJSON = (obj) => {
        if (typeof obj !== 'object' || obj === null) {
            return obj;
        }

        const result = Array.isArray(obj) ? [] : {};

        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'string') {
                // Try to parse as JSON
                try {
                    const parsed = JSON.parse(value);
                    result[key] = parsed;
                } catch {
                    // Not JSON, keep as string
                    result[key] = value;
                }
            } else if (typeof value === 'object' && value !== null) {
                result[key] = parseNestedJSON(value);
            } else {
                result[key] = value;
            }
        }

        return result;
    };

    useEffect(() => {
        if (record) {
            setFormData({
                namespace: record.namespace || '',
                setName: record.setName || '',
                key: record.key || '',
                bins: record.bins || {},
                ttl: record.ttl || '',
            });

            // Parse nested JSON for better display
            const parsedBins = parseNestedJSON(record.bins || {});
            setBinsJson(JSON.stringify(parsedBins, null, 2));
        }
    }, [record]);

    const handleSave = () => {
        setError(null);

        try {
            const bins = JSON.parse(binsJson);

            const recordData = {
                namespace: formData.namespace,
                setName: formData.setName,
                key: formData.key,
                bins: bins,
                ttl: formData.ttl ? parseInt(formData.ttl) : null,
            };

            onSave(recordData);
        } catch (err) {
            setError('Invalid JSON format for bins: ' + err.message);
        }
    };

    if (!record) {
        return (
            <div className="record-editor-empty">
                <FiDatabase className="empty-icon" />
                <h3>No Record Selected</h3>
                <p>Select a record from the table to view and edit its details</p>
            </div>
        );
    }

    return (
        <div className="record-editor">
            <div className="editor-header">
                <div className="header-title">
                    <FiDatabase className="header-icon" />
                    <h3>Record Editor</h3>
                </div>
                <button className="close-btn" onClick={onClose} title="Close editor">
                    <FiX />
                </button>
            </div>

            <div className="editor-content">
                {/* Metadata Card */}
                <div className="editor-card metadata-card">
                    <div className="card-header">
                        <FiKey className="card-icon" />
                        <h4>Metadata</h4>
                    </div>
                    <div className="card-content">
                        <div className="form-group">
                            <label>
                                <FiDatabase className="label-icon" />
                                Namespace
                            </label>
                            <input
                                type="text"
                                value={formData.namespace}
                                disabled
                                className="disabled-input"
                            />
                        </div>

                        <div className="form-group">
                            <label>
                                <FiPackage className="label-icon" />
                                Set Name
                            </label>
                            <input
                                type="text"
                                value={formData.setName}
                                disabled
                                className="disabled-input"
                            />
                        </div>

                        <div className="form-group">
                            <label>
                                <FiKey className="label-icon" />
                                Key
                            </label>
                            <input
                                type="text"
                                value={formData.key}
                                disabled
                                className="disabled-input"
                            />
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label>
                                    <FiClock className="label-icon" />
                                    TTL (seconds)
                                </label>
                                <input
                                    type="number"
                                    value={formData.ttl}
                                    onChange={(e) => setFormData({ ...formData, ttl: e.target.value })}
                                    placeholder="Default"
                                    className="editable-input"
                                />
                            </div>

                            <div className="form-group">
                                <label>Generation</label>
                                <input
                                    type="text"
                                    value={record.generation || '-'}
                                    disabled
                                    className="disabled-input"
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label>Expiration</label>
                            <input
                                type="text"
                                value={record.expiration || 'Never'}
                                disabled
                                className="disabled-input"
                            />
                        </div>
                    </div>
                </div>

                {/* Bins Card */}
                <div className="editor-card bins-card">
                    <div className="card-header">
                        <FiPackage className="card-icon" />
                        <h4>Bins (JSON)</h4>
                        <span className="card-badge">Editable</span>
                    </div>
                    <div className="card-content">
                        <textarea
                            className="bins-editor"
                            value={binsJson}
                            onChange={(e) => setBinsJson(e.target.value)}
                            placeholder='{"binName": "value"}'
                            rows={12}
                            spellCheck="false"
                        />
                        {error && (
                            <div className="editor-error">
                                <FiX className="error-icon" />
                                {error}
                            </div>
                        )}
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="editor-actions">
                    <button className="btn btn-secondary" onClick={onClose}>
                        <FiX /> Cancel
                    </button>
                    <button className="btn btn-primary" onClick={handleSave}>
                        <FiSave /> Save Changes
                    </button>
                </div>
            </div>
        </div>
    );
};
