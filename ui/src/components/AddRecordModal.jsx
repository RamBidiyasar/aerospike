import { useState, useEffect } from 'react';
import { FiPlus, FiX, FiTrash2 } from 'react-icons/fi';
import './AddRecordModal.css';

export const AddRecordModal = ({ isOpen, onClose, onSave, selectedNamespace, selectedSet, availableNamespaces }) => {
    const [formData, setFormData] = useState({
        namespace: selectedNamespace || '',
        setName: selectedSet || '',
        key: '',
        ttl: '',
    });
    const [bins, setBins] = useState([{ name: '', value: '', type: 'string' }]);
    const [error, setError] = useState(null);
    const [showNewNamespace, setShowNewNamespace] = useState(false);
    const [showNewSet, setShowNewSet] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setFormData({
                namespace: selectedNamespace || '',
                setName: selectedSet || '',
                key: '',
                ttl: '',
            });
            setBins([{ name: '', value: '', type: 'string' }]);
            setError(null); // Clear error on open
            setShowNewNamespace(false);
            setShowNewSet(false);
        }
    }, [isOpen, selectedNamespace, selectedSet]);

    const addBin = () => {
        setBins([...bins, { name: '', value: '', type: 'string' }]);
    };

    const removeBin = (index) => {
        setBins(bins.filter((_, i) => i !== index));
    };

    const updateBin = (index, field, value) => {
        const newBins = [...bins];
        newBins[index][field] = value;
        setBins(newBins);
    };

    const clearBins = () => {
        setBins([{ name: '', value: '', type: 'string' }]);
    };

    const convertValue = (value, type) => {
        if (!value && value !== 0 && value !== false) return null; // Handle empty string, null, undefined, but keep 0 and false

        switch (type) {
            case 'number':
                return Number(value);
            case 'boolean':
                return value === 'true' || value === true;
            case 'json':
                try {
                    return JSON.parse(value);
                } catch {
                    return value; // Return as string if invalid JSON
                }
            default:
                return value;
        }
    };

    const handleSave = () => {
        setError(null);

        // Validation
        if (!formData.namespace || !formData.setName || !formData.key) {
            setError('Namespace, Set Name, and Key are required');
            return;
        }

        // Filter out empty bins and convert values
        const validBins = bins.filter(bin => bin.name && (bin.value !== '' || bin.type === 'boolean')); // Allow empty string for boolean false

        if (validBins.length === 0) {
            setError('At least one bin with a name and value is required');
            return;
        }

        const binsObject = {};
        for (const bin of validBins) {
            if (binsObject.hasOwnProperty(bin.name)) {
                setError(`Duplicate bin name: "${bin.name}"`);
                return;
            }
            binsObject[bin.name] = convertValue(bin.value, bin.type);
        }

        const recordData = {
            namespace: formData.namespace,
            setName: formData.setName,
            key: formData.key,
            bins: binsObject,
            ttl: formData.ttl ? parseInt(formData.ttl) : null,
        };

        onSave(recordData);
        handleClose();
    };

    const handleClose = () => {
        setFormData({
            namespace: selectedNamespace || '',
            setName: selectedSet || '',
            key: '',
            ttl: '',
        });
        setBins([{ name: '', value: '', type: 'string' }]);
        setError(null);
        setShowNewNamespace(false);
        setShowNewSet(false);
        onClose();
    };

    if (!isOpen) return null;

    const namespaceOptions = availableNamespaces || [];
    const setOptions = formData.namespace && availableNamespaces
        ? availableNamespaces.find(ns => ns.name === formData.namespace)?.sets || []
        : [];

    return (
        <div className="modal-overlay" onClick={handleClose}>
            <div className="modal-content add-record-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>Add New Record</h2>
                    <button className="modal-close-btn" onClick={handleClose}>
                        <FiX />
                    </button>
                </div>

                <div className="modal-body">
                    <div className="form-row">
                        <div className="form-field">
                            <label htmlFor="namespace">Namespace *</label>
                            {!showNewNamespace && namespaceOptions.length > 0 ? (
                                <div className="select-wrapper">
                                    <select
                                        id="namespace"
                                        value={formData.namespace}
                                        onChange={(e) => {
                                            if (e.target.value === '__new__') {
                                                setShowNewNamespace(true);
                                                setFormData({ ...formData, namespace: '', setName: '' }); // Clear set name when adding new namespace
                                            } else {
                                                setFormData({ ...formData, namespace: e.target.value, setName: '' });
                                            }
                                        }}
                                    >
                                        <option value="">Select namespace...</option>
                                        {namespaceOptions.map(ns => (
                                            <option key={ns.name} value={ns.name}>{ns.name}</option>
                                        ))}
                                        <option value="__new__">+ Add New Namespace</option>
                                    </select>
                                </div>
                            ) : (
                                <input
                                    type="text"
                                    id="namespace"
                                    value={formData.namespace}
                                    onChange={(e) => setFormData({ ...formData, namespace: e.target.value })}
                                    placeholder="e.g., test"
                                    required
                                />
                            )}
                        </div>

                        <div className="form-field">
                            <label htmlFor="setName">Set Name *</label>
                            {!showNewSet && setOptions.length > 0 && formData.namespace ? (
                                <div className="select-wrapper">
                                    <select
                                        id="setName"
                                        value={formData.setName}
                                        onChange={(e) => {
                                            if (e.target.value === '__new__') {
                                                setShowNewSet(true);
                                                setFormData({ ...formData, setName: '' });
                                            } else {
                                                setFormData({ ...formData, setName: e.target.value });
                                            }
                                        }}
                                    >
                                        <option value="">Select set...</option>
                                        {setOptions.map(set => (
                                            <option key={set.setName} value={set.setName}>{set.setName}</option>
                                        ))}
                                        <option value="__new__">+ Add New Set</option>
                                    </select>
                                </div>
                            ) : (
                                <input
                                    type="text"
                                    id="setName"
                                    value={formData.setName}
                                    onChange={(e) => setFormData({ ...formData, setName: e.target.value })}
                                    placeholder="e.g., users"
                                    required
                                />
                            )}
                        </div>
                    </div>

                    <div className="form-row">
                        <div className="form-field">
                            <label htmlFor="key">Key *</label>
                            <input
                                type="text"
                                id="key"
                                value={formData.key}
                                onChange={(e) => setFormData({ ...formData, key: e.target.value })}
                                placeholder="e.g., user123"
                                required
                            />
                        </div>

                        <div className="form-field">
                            <label htmlFor="ttl">TTL (seconds)</label>
                            <input
                                type="number"
                                id="ttl"
                                value={formData.ttl}
                                onChange={(e) => setFormData({ ...formData, ttl: e.target.value })}
                                placeholder="Leave empty for default"
                            />
                        </div>
                    </div>

                    <div className="bins-section">
                        <div className="bins-header">
                            <label>Bins *</label>
                            <div className="bins-actions">
                                <button className="btn-clear-bins" onClick={clearBins} title="Clear all bins">
                                    <FiTrash2 /> Clear All
                                </button>
                                <button className="btn-add-bin" onClick={addBin} title="Add new bin">
                                    <FiPlus /> Add Bin
                                </button>
                            </div>
                        </div>

                        <div className="bins-list">
                            {bins.map((bin, index) => (
                                <div key={index} className="bin-item">
                                    <input
                                        type="text"
                                        placeholder="Bin name"
                                        value={bin.name}
                                        onChange={(e) => updateBin(index, 'name', e.target.value)}
                                        className="bin-name"
                                    />
                                    <select
                                        value={bin.type}
                                        onChange={(e) => updateBin(index, 'type', e.target.value)}
                                        className="bin-type"
                                    >
                                        <option value="string">String</option>
                                        <option value="number">Number</option>
                                        <option value="boolean">Boolean</option>
                                        <option value="json">JSON</option>
                                    </select>
                                    {bin.type === 'boolean' ? (
                                        <select
                                            value={bin.value}
                                            onChange={(e) => updateBin(index, 'value', e.target.value)}
                                            className="bin-value"
                                        >
                                            <option value="true">True</option>
                                            <option value="false">False</option>
                                        </select>
                                    ) : (
                                        <input
                                            type={bin.type === 'number' ? 'number' : 'text'}
                                            placeholder="Value"
                                            value={bin.value}
                                            onChange={(e) => updateBin(index, 'value', e.target.value)}
                                            className="bin-value"
                                        />
                                    )}
                                    {bins.length > 1 && (
                                        <button
                                            className="btn-remove-bin"
                                            onClick={() => removeBin(index)}
                                            title="Remove bin"
                                        >
                                            <FiX />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {error && (
                        <div className="modal-error">
                            {error}
                        </div>
                    )}
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={handleClose}>
                        Cancel
                    </button>
                    <button className="btn btn-primary" onClick={handleSave}>
                        <FiPlus /> Add Record
                    </button>
                </div>
            </div>
        </div>
    );
};
