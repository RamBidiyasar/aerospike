import { useMemo, useState } from 'react';
import {
    FiAlertTriangle,
    FiCheckCircle,
    FiClock,
    FiCode,
    FiCopy,
    FiDatabase,
    FiEdit3,
    FiHash,
    FiInfo,
    FiKey,
    FiList,
    FiPackage,
    FiRotateCcw,
    FiSave,
    FiX,
} from 'react-icons/fi';
import './RecordEditor.css';

const parseNestedJSON = (obj) => {
    if (typeof obj !== 'object' || obj === null) {
        return obj;
    }

    const result = Array.isArray(obj) ? [] : {};

    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
            try {
                result[key] = JSON.parse(value);
            } catch {
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

const toPrettyJson = (value) => JSON.stringify(value, null, 2);

const getValueType = (value) => {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
};

const formatPreview = (value) => {
    if (value === null || value === undefined) return String(value);
    if (typeof value === 'string') return value;
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
};

const formatTtl = (ttl) => {
    if (ttl === null || ttl === undefined || ttl === '') return 'Default';
    if (Number(ttl) === -1) return 'Never expire';
    if (Number(ttl) === 0) return 'Server default';
    return `${Number(ttl).toLocaleString()} seconds`;
};

export const RecordEditor = ({ record, onSave, onClose }) => {
    const initialBinsJson = useMemo(() => toPrettyJson(parseNestedJSON(record?.bins || {})), [record]);
    const [ttl, setTtl] = useState(() => record?.ttl || '');
    const [binsJson, setBinsJson] = useState(() => initialBinsJson);
    const [message, setMessage] = useState(null);

    const jsonState = useMemo(() => {
        try {
            const parsed = JSON.parse(binsJson);
            const isObject = parsed && typeof parsed === 'object' && !Array.isArray(parsed);

            if (!isObject) {
                return {
                    valid: false,
                    parsed: null,
                    error: 'Bins must be a JSON object, for example {"name": "value"}.',
                };
            }

            return {
                valid: true,
                parsed,
                error: null,
            };
        } catch (err) {
            return {
                valid: false,
                parsed: null,
                error: err.message,
            };
        }
    }, [binsJson]);

    const binEntries = useMemo(() => {
        if (!jsonState.valid) {
            return [];
        }

        return Object.entries(jsonState.parsed).map(([name, value]) => ({
            name,
            value,
            type: getValueType(value),
            preview: formatPreview(value),
        }));
    }, [jsonState]);

    const isDirty = binsJson !== initialBinsJson || String(ttl || '') !== String(record?.ttl || '');
    const totalBytes = new Blob([binsJson]).size;

    const handleFormatJson = () => {
        if (!jsonState.valid) {
            setMessage({ type: 'error', text: `Invalid JSON: ${jsonState.error}` });
            return;
        }

        setBinsJson(toPrettyJson(jsonState.parsed));
        setMessage({ type: 'success', text: 'JSON formatted.' });
    };

    const handleReset = () => {
        setTtl(record?.ttl || '');
        setBinsJson(initialBinsJson);
        setMessage({ type: 'info', text: 'Editor reset to the loaded record.' });
    };

    const handleCopyJson = async () => {
        try {
            await navigator.clipboard.writeText(binsJson);
            setMessage({ type: 'success', text: 'Bins JSON copied to clipboard.' });
        } catch {
            setMessage({ type: 'error', text: 'Could not copy JSON from this browser context.' });
        }
    };

    const handleSave = () => {
        if (!jsonState.valid) {
            setMessage({ type: 'error', text: `Fix JSON before saving: ${jsonState.error}` });
            return;
        }

        onSave({
            namespace: record.namespace,
            setName: record.setName,
            key: record.key,
            bins: jsonState.parsed,
            ttl: ttl === '' ? null : parseInt(ttl, 10),
        });
    };

    if (!record) {
        return (
            <div className="record-editor-empty">
                <FiDatabase className="empty-icon" />
                <h3>No Record Selected</h3>
                <p>Select a record from the table to inspect metadata and edit bins.</p>
            </div>
        );
    }

    return (
        <div className="record-editor">
            <div className="editor-hero">
                <div className="record-identity">
                    <div className="record-icon">
                        <FiDatabase />
                    </div>
                    <div>
                        <span className="eyebrow">Record Editor</span>
                        <h3>{String(record.key)}</h3>
                        <p>{record.namespace} / {record.setName || '(no set)'}</p>
                    </div>
                </div>
                <button className="editor-close-btn" onClick={onClose} title="Close editor">
                    <FiX />
                </button>
            </div>

            <div className="editor-content">
                <section className="record-summary-grid">
                    <div className="summary-tile">
                        <FiPackage />
                        <span>Bins</span>
                        <strong>{binEntries.length.toLocaleString()}</strong>
                    </div>
                    <div className="summary-tile">
                        <FiHash />
                        <span>Generation</span>
                        <strong>{record.generation || '-'}</strong>
                    </div>
                    <div className="summary-tile">
                        <FiClock />
                        <span>TTL</span>
                        <strong>{formatTtl(ttl)}</strong>
                    </div>
                    <div className={`summary-tile ${jsonState.valid ? 'valid' : 'invalid'}`}>
                        {jsonState.valid ? <FiCheckCircle /> : <FiAlertTriangle />}
                        <span>JSON</span>
                        <strong>{jsonState.valid ? 'Valid' : 'Invalid'}</strong>
                    </div>
                </section>

                <section className="editor-panel-card">
                    <div className="panel-card-header">
                        <div>
                            <span className="eyebrow">Identity</span>
                            <h4>Record metadata</h4>
                        </div>
                        <span className="soft-badge">Read-only key fields</span>
                    </div>

                    <div className="metadata-grid">
                        <label className="metadata-field">
                            <span><FiDatabase /> Namespace</span>
                            <input type="text" value={record.namespace || ''} disabled />
                        </label>
                        <label className="metadata-field">
                            <span><FiPackage /> Set</span>
                            <input type="text" value={record.setName || ''} disabled />
                        </label>
                        <label className="metadata-field wide">
                            <span><FiKey /> Key</span>
                            <input type="text" value={String(record.key ?? '')} disabled />
                        </label>
                        <label className="metadata-field">
                            <span><FiClock /> TTL seconds</span>
                            <input
                                type="number"
                                value={ttl}
                                onChange={(e) => setTtl(e.target.value)}
                                placeholder="Default"
                            />
                        </label>
                        <label className="metadata-field">
                            <span><FiInfo /> Expiration</span>
                            <input type="text" value={record.expiration || 'Never'} disabled />
                        </label>
                    </div>

                    <div className="ttl-presets">
                        <button type="button" onClick={() => setTtl('')}>Default</button>
                        <button type="button" onClick={() => setTtl('3600')}>1 hour</button>
                        <button type="button" onClick={() => setTtl('86400')}>1 day</button>
                        <button type="button" onClick={() => setTtl('-1')}>Never expire</button>
                    </div>
                </section>

                <section className="editor-panel-card bins-overview-card">
                    <div className="panel-card-header">
                        <div>
                            <span className="eyebrow">Preview</span>
                            <h4>Bins overview</h4>
                        </div>
                        <span className="soft-badge">{totalBytes.toLocaleString()} bytes in editor</span>
                    </div>

                    {binEntries.length > 0 ? (
                        <div className="bin-preview-list">
                            {binEntries.map((bin) => (
                                <div className="bin-preview-row" key={bin.name}>
                                    <div className="bin-preview-name">
                                        <FiList />
                                        <strong>{bin.name}</strong>
                                        <span>{bin.type}</span>
                                    </div>
                                    <code title={bin.preview}>{bin.preview}</code>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="bin-empty-state">
                            <FiPackage />
                            <span>No bins in this record yet.</span>
                        </div>
                    )}
                </section>

                <section className="editor-panel-card json-editor-card">
                    <div className="panel-card-header">
                        <div>
                            <span className="eyebrow">Editable</span>
                            <h4>Bins JSON</h4>
                        </div>
                        <div className="editor-toolstrip">
                            <button type="button" onClick={handleFormatJson}>
                                <FiCode /> Format
                            </button>
                            <button type="button" onClick={handleCopyJson}>
                                <FiCopy /> Copy
                            </button>
                            <button type="button" onClick={handleReset} disabled={!isDirty}>
                                <FiRotateCcw /> Reset
                            </button>
                        </div>
                    </div>

                    <textarea
                        className={`bins-editor ${jsonState.valid ? 'valid' : 'invalid'}`}
                        value={binsJson}
                        onChange={(e) => {
                            setBinsJson(e.target.value);
                            setMessage(null);
                        }}
                        placeholder='{"binName": "value"}'
                        spellCheck="false"
                    />

                    <div className={`json-status ${jsonState.valid ? 'valid' : 'invalid'}`}>
                        {jsonState.valid ? <FiCheckCircle /> : <FiAlertTriangle />}
                        <span>{jsonState.valid ? 'JSON is valid and ready to save.' : jsonState.error}</span>
                    </div>

                    {message && (
                        <div className={`editor-message ${message.type}`}>
                            {message.type === 'error' ? <FiAlertTriangle /> : <FiInfo />}
                            <span>{message.text}</span>
                        </div>
                    )}
                </section>
            </div>

            <div className="editor-actions">
                <div className={`dirty-indicator ${isDirty ? 'active' : ''}`}>
                    <FiEdit3 />
                    {isDirty ? 'Unsaved changes' : 'No changes'}
                </div>
                <div className="editor-action-buttons">
                    <button className="btn btn-secondary" onClick={onClose}>
                        <FiX /> Close
                    </button>
                    <button className="btn btn-primary" onClick={handleSave} disabled={!jsonState.valid}>
                        <FiSave /> Save Changes
                    </button>
                </div>
            </div>
        </div>
    );
};
