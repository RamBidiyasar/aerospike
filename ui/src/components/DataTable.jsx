import { useMemo, useState } from 'react';
import {
    FiActivity,
    FiAlertCircle,
    FiCheckCircle,
    FiChevronLeft,
    FiChevronRight,
    FiClock,
    FiEdit2,
    FiLoader,
    FiPlus,
    FiRefreshCw,
    FiSearch,
    FiTrash2,
    FiX,
} from 'react-icons/fi';
import { LoadingOverlay } from './LoadingOverlay';
import './DataTable.css';

const formatCount = (value) => Number(value || 0).toLocaleString();

const formatElapsed = (elapsedMs) => {
    const totalSeconds = Math.max(0, Math.floor(Number(elapsedMs || 0) / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
        return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
    }
    if (minutes > 0) {
        return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
    }
    return `${seconds}s`;
};

const getPrefixDeletePresentation = (status) => {
    switch (status) {
        case 'COMPLETED':
            return {
                title: 'Prefix delete complete',
                Icon: FiCheckCircle,
                badge: 'Completed',
            };
        case 'FAILED':
            return {
                title: 'Prefix delete failed',
                Icon: FiAlertCircle,
                badge: 'Failed',
            };
        case 'QUEUED':
            return {
                title: 'Prefix delete queued',
                Icon: FiLoader,
                badge: 'Queued',
            };
        default:
            return {
                title: 'Prefix delete in progress',
                Icon: FiActivity,
                badge: 'Running',
            };
    }
};

export const DataTable = ({
    records,
    onSelectRecord,
    onDeleteRecord,
    selectedRecord,
    onAddRecord,
    onSearch,
    onDeleteByKeyPrefix,
    prefixDeleteStatus,
    onDismissPrefixDeleteStatus,
    onReload,
    namespace,
    setName,
    isSearching = false,
    contextLabel = 'Records',
    contextHint = 'Select a set or all sets to browse records.',
}) => {
    const [searchPattern, setSearchPattern] = useState('');
    const [searchType, setSearchType] = useState('CONTAINS');
    const [searchField, setSearchField] = useState('ALL');
    const [caseSensitive, setCaseSensitive] = useState(false);
    const [maxResults, setMaxResults] = useState(100);
    const [scanLimit, setScanLimit] = useState(100);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [searchActive, setSearchActive] = useState(false);
    const [isPrefixDeleting, setIsPrefixDeleting] = useState(false);

    const safeRecords = useMemo(() => records || [], [records]);
    const totalRecords = safeRecords.length;
    const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
    const activePage = Math.min(currentPage, totalPages);
    const startIndex = (activePage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalRecords);
    const canSearch = Boolean(namespace && onSearch);
    const canAdd = Boolean(namespace && onAddRecord);
    const showLocationColumns = !setName || safeRecords.some(record => record.namespace !== namespace || record.setName !== setName);
    const usesDirectKeyLookup = searchField === 'KEY' && searchType === 'EXACT';
    const canDeleteByKeyPrefix = Boolean(namespace && onDeleteByKeyPrefix && searchField === 'KEY' && searchType === 'PREFIX');
    const prefixDeleteRunning = prefixDeleteStatus?.status === 'QUEUED' || prefixDeleteStatus?.status === 'RUNNING';
    const scannedForProgress = Number(prefixDeleteStatus?.scannedRecords || 0);
    const totalForProgress = Number(prefixDeleteStatus?.totalRecordsEstimate || 0);
    const matchedForProgress = Number(prefixDeleteStatus?.matchedRecords || 0);
    const deletedForProgress = Number(prefixDeleteStatus?.deletedRecords || 0);
    const scanProgressPercent = prefixDeleteStatus?.status === 'COMPLETED' || prefixDeleteStatus?.phase === 'DONE'
        ? 100
        : totalForProgress > 0
            ? Math.min(100, Math.round((scannedForProgress * 100) / totalForProgress))
            : 0;
    const deleteProgressPercent = matchedForProgress > 0
        ? Math.min(100, Math.round((deletedForProgress * 100) / matchedForProgress))
        : (prefixDeleteStatus?.status === 'COMPLETED' ? 100 : 0);

    const paginatedRecords = useMemo(() => {
        return safeRecords.slice(startIndex, endIndex);
    }, [safeRecords, startIndex, endIndex]);

    const allBinNames = useMemo(() => {
        return [...new Set(safeRecords.flatMap(record => Object.keys(record.bins || {})))];
    }, [safeRecords]);

    const handleSearch = () => {
        if (!canSearch) {
            return;
        }

        setCurrentPage(1);
        setSearchActive(Boolean(searchPattern.trim()));
        onSearch({
            searchPattern,
            searchType,
            searchField,
            caseSensitive,
            maxResults,
            maxScanRecords: usesDirectKeyLookup ? maxResults : Math.max(scanLimit, maxResults),
        });
    };

    const handleClearSearch = () => {
        setSearchPattern('');
        setSearchActive(false);
        setCurrentPage(1);
        if (onSearch) {
            onSearch({
                searchPattern: '',
                searchType: 'CONTAINS',
                searchField: 'ALL',
                clearSearch: true,
                maxResults,
                maxRecords: scanLimit,
            });
        }
    };

    const handleDeleteByKeyPrefix = async () => {
        if (!canDeleteByKeyPrefix || isPrefixDeleting || prefixDeleteRunning) {
            return;
        }

        const keyPrefix = searchPattern.trim();
        if (!keyPrefix) {
            return;
        }

        const scopeLabel = setName ? `${namespace}.${setName}` : `${namespace} / all sets`;
        const typedPrefix = window.prompt(
            `Delete every record in ${scopeLabel} whose stored user key starts with "${keyPrefix}"?\n\n` +
            `This scans the full selected scope and cannot be undone. Type the prefix to confirm:`
        );

        if (typedPrefix !== keyPrefix) {
            return;
        }

        setIsPrefixDeleting(true);
        try {
            await onDeleteByKeyPrefix({
                keyPrefix,
                caseSensitive,
            });
            setSearchActive(false);
            setCurrentPage(1);
        } finally {
            setIsPrefixDeleting(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    };

    const handlePageChange = (newPage) => {
        if (newPage >= 1 && newPage <= totalPages) {
            setCurrentPage(newPage);
        }
    };

    const handlePageSizeChange = (newSize) => {
        setPageSize(newSize);
        setCurrentPage(1);
    };

    const formatValue = (value) => {
        if (value === null || value === undefined) return '-';
        if (Array.isArray(value)) return JSON.stringify(value);
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
    };

    return (
        <div className="data-table-container">
            {isSearching && <LoadingOverlay message={searchActive ? 'Searching records...' : 'Loading records...'} />}

            <div className="table-header">
                <div className="table-title-block">
                    <div className="table-title-row">
                        <h2>{contextLabel}</h2>
                        {searchActive && <span className="search-badge">Search results</span>}
                    </div>
                    <span className="record-count">
                        {totalRecords.toLocaleString()} records
                        {totalRecords > pageSize && (
                            <span className="page-info"> - showing {startIndex + 1}-{endIndex}</span>
                        )}
                    </span>
                    <p>{contextHint}</p>
                </div>

                <div className="table-actions">
                    {onReload && (
                        <button className="btn-icon-action" onClick={() => onReload({ maxRecords: scanLimit })} disabled={isSearching || !namespace || prefixDeleteRunning} title="Reload records">
                            <FiRefreshCw className={isSearching ? 'spinning' : ''} />
                        </button>
                    )}
                    {canAdd && (
                        <button className="btn-add-record" onClick={onAddRecord} disabled={prefixDeleteRunning}>
                            <FiPlus /> Add Record
                        </button>
                    )}
                </div>
            </div>

            {prefixDeleteStatus && (() => {
                const presentation = getPrefixDeletePresentation(prefixDeleteStatus.status);
                const StatusIcon = presentation.Icon;
                const phaseLabel = String(prefixDeleteStatus.phase || 'SCANNING')
                    .toLowerCase()
                    .replace(/_/g, ' ');
                const scopeLabel = prefixDeleteStatus.setName
                    ? `${prefixDeleteStatus.namespace}.${prefixDeleteStatus.setName}`
                    : `${prefixDeleteStatus.namespace || 'namespace'} / all sets`;

                return (
                    <section
                        className={`prefix-delete-panel status-${String(prefixDeleteStatus.status || 'RUNNING').toLowerCase()}`}
                        aria-live="polite"
                    >
                        <div className="prefix-delete-panel-glow" aria-hidden="true" />

                        <div className="prefix-delete-panel-top">
                            <div className="prefix-delete-identity">
                                <div className="prefix-delete-icon-wrap">
                                    <StatusIcon className={prefixDeleteRunning ? 'spinning-slow' : ''} />
                                </div>
                                <div className="prefix-delete-copy">
                                    <div className="prefix-delete-title-row">
                                        <h3>{presentation.title}</h3>
                                        <span className="prefix-delete-status-pill">{presentation.badge}</span>
                                        <span className="prefix-delete-phase-pill">{phaseLabel}</span>
                                    </div>
                                    <p className="prefix-delete-subtitle">
                                        {prefixDeleteStatus.message
                                            || `Deleting keys in ${scopeLabel} that start with "${prefixDeleteStatus.keyPrefix || ''}".`}
                                    </p>
                                    <div className="prefix-delete-meta-row">
                                        <span className="prefix-delete-chip">
                                            Prefix <code>{prefixDeleteStatus.keyPrefix || '—'}</code>
                                        </span>
                                        <span className="prefix-delete-chip subtle">{scopeLabel}</span>
                                        {prefixDeleteStatus.nodeCount != null && (
                                            <span className="prefix-delete-chip subtle">
                                                {prefixDeleteStatus.nodeCount} nodes · {prefixDeleteStatus.workerCount || 0} workers
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="prefix-delete-top-actions">
                                <div className="prefix-delete-elapsed">
                                    <FiClock />
                                    <span>{formatElapsed(prefixDeleteStatus.elapsedMs)}</span>
                                </div>
                                {(prefixDeleteStatus.status === 'COMPLETED' || prefixDeleteStatus.status === 'FAILED') && onDismissPrefixDeleteStatus && (
                                    <button
                                        className="prefix-delete-dismiss"
                                        onClick={onDismissPrefixDeleteStatus}
                                        title="Dismiss status"
                                    >
                                        <FiX />
                                        <span>Dismiss</span>
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="prefix-delete-progress-block">
                            <div className="prefix-delete-progress-labels">
                                <span>
                                    {totalForProgress > 0
                                        ? `${formatCount(scannedForProgress)} of ${formatCount(totalForProgress)} records scanned`
                                        : `${formatCount(scannedForProgress)} records scanned`}
                                </span>
                                <strong>{totalForProgress > 0 || !prefixDeleteRunning ? `${scanProgressPercent}%` : '—'}</strong>
                            </div>
                            <div className="prefix-delete-progress-track" aria-hidden="true">
                                <div
                                    className={`prefix-delete-progress-fill ${prefixDeleteRunning ? 'is-active' : ''}`}
                                    style={{
                                        width: `${Math.max(
                                            scanProgressPercent,
                                            prefixDeleteRunning && totalForProgress === 0 ? 12 : 0
                                        )}%`,
                                    }}
                                />
                            </div>

                            {(matchedForProgress > 0 || deletedForProgress > 0) && (
                                <div className="prefix-delete-secondary-progress">
                                    <div className="prefix-delete-progress-labels compact">
                                        <span>
                                            {formatCount(deletedForProgress)} of {formatCount(matchedForProgress)} matched deleted
                                        </span>
                                        <strong>{deleteProgressPercent}%</strong>
                                    </div>
                                    <div className="prefix-delete-progress-track secondary" aria-hidden="true">
                                        <div
                                            className="prefix-delete-progress-fill secondary"
                                            style={{ width: `${deleteProgressPercent}%` }}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="prefix-delete-metric-grid">
                            <div className="prefix-delete-metric">
                                <span>Total in scope</span>
                                <strong>{totalForProgress > 0 ? formatCount(totalForProgress) : '—'}</strong>
                                <em>cluster estimate</em>
                            </div>
                            <div className="prefix-delete-metric">
                                <span>Scanned</span>
                                <strong>{formatCount(prefixDeleteStatus.scannedRecords)}</strong>
                                {totalForProgress > 0 && (
                                    <em>{scanProgressPercent}% of total</em>
                                )}
                            </div>
                            <div className="prefix-delete-metric accent">
                                <span>Matched</span>
                                <strong>{formatCount(prefixDeleteStatus.matchedRecords)}</strong>
                            </div>
                            <div className="prefix-delete-metric success">
                                <span>Deleted</span>
                                <strong>{formatCount(prefixDeleteStatus.deletedRecords)}</strong>
                                {matchedForProgress > 0 && (
                                    <em>{deleteProgressPercent}% of matched</em>
                                )}
                            </div>
                            <div className="prefix-delete-metric danger">
                                <span>Failed</span>
                                <strong>{formatCount(prefixDeleteStatus.failedDeletes)}</strong>
                            </div>
                            <div className="prefix-delete-metric">
                                <span>Skipped</span>
                                <strong>{formatCount(prefixDeleteStatus.skippedRecordsWithoutUserKey)}</strong>
                                <em>no stored user key</em>
                            </div>
                        </div>
                    </section>
                );
            })()}

            {canSearch && (
                <div className="search-panel">
                    <div className="search-main">
                        <FiSearch className="search-leading-icon" />
                        <input
                            type="text"
                            className="search-input"
                            placeholder="Search keys, bin names, bin values, namespaces, or sets..."
                            value={searchPattern}
                            onChange={(e) => setSearchPattern(e.target.value)}
                            onKeyDown={handleKeyDown}
                            disabled={isSearching || prefixDeleteRunning}
                        />
                    </div>

                    <div className="search-options">
                        <select
                            className="search-type-select"
                            value={searchField}
                            onChange={(e) => setSearchField(e.target.value)}
                            disabled={isSearching || prefixDeleteRunning}
                            title="Search field"
                        >
                            <option value="ALL">All fields</option>
                            <option value="KEY">Keys only</option>
                            <option value="BIN_NAME">Bin names</option>
                            <option value="BIN_VALUE">Bin values</option>
                        </select>
                        <select
                            className="search-type-select"
                            value={searchType}
                            onChange={(e) => setSearchType(e.target.value)}
                            disabled={isSearching || prefixDeleteRunning}
                            title="Match type"
                        >
                            <option value="CONTAINS">Contains</option>
                            <option value="EXACT">Exact</option>
                            <option value="PREFIX">Prefix</option>
                            <option value="SUFFIX">Suffix</option>
                        </select>
                        <label className="case-toggle">
                            <input
                                type="checkbox"
                                checked={caseSensitive}
                                onChange={(e) => setCaseSensitive(e.target.checked)}
                                disabled={isSearching || prefixDeleteRunning}
                            />
                            Case sensitive
                        </label>
                        <select
                            className="search-type-select compact"
                            value={scanLimit}
                            onChange={(e) => setScanLimit(Number(e.target.value))}
                            disabled={isSearching || usesDirectKeyLookup || prefixDeleteRunning}
                            title={usesDirectKeyLookup ? 'Exact key searches use direct lookup and do not scan records' : 'Records to scan when loading this scope'}
                        >
                            <option value={50}>Scan 50</option>
                            <option value={100}>Scan 100</option>
                            <option value={250}>Scan 250</option>
                            <option value={500}>Scan 500</option>
                            <option value={1000}>Scan 1000</option>
                        </select>
                        <select
                            className="search-type-select compact"
                            value={maxResults}
                            onChange={(e) => setMaxResults(Number(e.target.value))}
                            disabled={isSearching || prefixDeleteRunning}
                            title="Maximum search results"
                        >
                            <option value={50}>50 results</option>
                            <option value={100}>100 results</option>
                            <option value={250}>250 results</option>
                            <option value={500}>500 results</option>
                        </select>
                        <button
                            className="btn-search"
                            onClick={handleSearch}
                            disabled={!searchPattern.trim() || isSearching || prefixDeleteRunning}
                            title="Search"
                        >
                            <FiSearch /> Search
                        </button>
                        {canDeleteByKeyPrefix && (
                            <button
                                className="btn-danger-action"
                                onClick={handleDeleteByKeyPrefix}
                                disabled={!searchPattern.trim() || isSearching || isPrefixDeleting || prefixDeleteRunning}
                                title="Scan the full selected scope and delete records whose stored user key starts with this prefix"
                            >
                                <FiTrash2 /> {prefixDeleteRunning ? 'Deleting...' : 'Delete prefix'}
                            </button>
                        )}
                        {usesDirectKeyLookup && (
                            <span className="search-hint">Direct key lookup - no scan</span>
                        )}
                        <button
                            className="btn-clear-search"
                            onClick={handleClearSearch}
                            disabled={isSearching || prefixDeleteRunning}
                            title="Clear search"
                        >
                            <FiX /> Clear
                        </button>
                    </div>
                </div>
            )}

            {totalRecords === 0 ? (
                <div className="data-table-empty">
                    <div className="empty-card">
                        <FiSearch className="empty-card-icon" />
                        <h3>No records to display</h3>
                        <p>{namespace ? 'Try a broader search, reload this scope, or add a new record.' : 'Select a namespace, all sets, or a single set from the browser.'}</p>
                        <div className="empty-actions">
                            {onReload && namespace && (
                                <button className="btn-clear-search" onClick={() => onReload({ maxRecords: scanLimit })} disabled={isSearching || prefixDeleteRunning}>
                                    <FiRefreshCw /> Reload
                                </button>
                            )}
                            {canAdd && (
                                <button className="btn-add-first" onClick={onAddRecord} disabled={prefixDeleteRunning}>
                                    <FiPlus /> Add First Record
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    <div className="table-wrapper">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    {showLocationColumns && <th>Namespace</th>}
                                    {showLocationColumns && <th>Set</th>}
                                    <th>Key</th>
                                    <th>TTL</th>
                                    <th>Generation</th>
                                    {allBinNames.map(binName => (
                                        <th key={binName}>{binName}</th>
                                    ))}
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedRecords.map((record, idx) => (
                                    <tr
                                        key={`${record.namespace}:${record.setName}:${formatValue(record.key)}:${idx}`}
                                        className={selectedRecord === record ? 'selected' : ''}
                                        onClick={() => onSelectRecord(record)}
                                    >
                                        {showLocationColumns && <td className="location-cell">{record.namespace || '-'}</td>}
                                        {showLocationColumns && <td className="location-cell">{record.setName || '(no set)'}</td>}
                                        <td className="key-cell">
                                            <code>{formatValue(record.key)}</code>
                                        </td>
                                        <td>{record.ttl || '-'}</td>
                                        <td>{record.generation || '-'}</td>
                                        {allBinNames.map(binName => (
                                            <td key={binName} className="bin-value" title={formatValue(record.bins?.[binName])}>
                                                {formatValue(record.bins?.[binName])}
                                            </td>
                                        ))}
                                        <td>
                                            <div className="action-buttons">
                                                <button
                                                    className="action-btn edit-btn"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onSelectRecord(record);
                                                    }}
                                                    title="Edit"
                                                    disabled={prefixDeleteRunning}
                                                >
                                                    <FiEdit2 />
                                                </button>
                                                <button
                                                    className="action-btn delete-btn"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (window.confirm('Are you sure you want to delete this record?')) {
                                                            onDeleteRecord(record);
                                                        }
                                                    }}
                                                    title="Delete"
                                                    disabled={prefixDeleteRunning}
                                                >
                                                    <FiTrash2 />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {totalPages > 1 && (
                        <div className="pagination-controls">
                            <div className="page-size-selector">
                                <label>Show:</label>
                                <select value={pageSize} onChange={(e) => handlePageSizeChange(Number(e.target.value))} disabled={prefixDeleteRunning}>
                                    <option value={10}>10</option>
                                    <option value={20}>20</option>
                                    <option value={50}>50</option>
                                    <option value={100}>100</option>
                                </select>
                                <span>per page</span>
                            </div>

                            <div className="page-navigation">
                                <button
                                    className="page-btn"
                                    onClick={() => handlePageChange(activePage - 1)}
                                    disabled={activePage === 1 || prefixDeleteRunning}
                                    title="Previous page"
                                >
                                    <FiChevronLeft />
                                </button>

                                <span className="page-indicator">
                                    Page {activePage} of {totalPages}
                                </span>

                                <button
                                    className="page-btn"
                                    onClick={() => handlePageChange(activePage + 1)}
                                    disabled={activePage === totalPages || prefixDeleteRunning}
                                    title="Next page"
                                >
                                    <FiChevronRight />
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};
