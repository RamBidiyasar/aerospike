import { useMemo, useState } from 'react';
import {
    FiActivity,
    FiAlertCircle,
    FiCheckCircle,
    FiChevronLeft,
    FiChevronRight,
    FiClock,
    FiEdit2,
    FiHash,
    FiLoader,
    FiPlus,
    FiRefreshCw,
    FiSearch,
    FiSlash,
    FiTrash2,
    FiX,
} from 'react-icons/fi';
import { LoadingOverlay } from './LoadingOverlay';
import './DataTable.css';

const formatCount = (value) => Number(value || 0).toLocaleString();

const MATCH_TYPE_LABELS = {
    PREFIX: 'starts with',
    SUFFIX: 'ends with',
    CONTAINS: 'contains',
    EXACT: 'exactly matches',
};

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

const getKeyPatternJobPresentation = (status, mode) => {
    const isCount = mode === 'COUNT';
    const noun = isCount ? 'Count' : 'Delete';
    switch (status) {
        case 'COMPLETED':
            return {
                title: isCount ? 'Count matches complete' : 'Delete matching complete',
                Icon: FiCheckCircle,
                badge: 'Completed',
            };
        case 'FAILED':
            return {
                title: `${noun} failed`,
                Icon: FiAlertCircle,
                badge: 'Failed',
            };
        case 'CANCELLED':
            return {
                title: `${noun} cancelled`,
                Icon: FiSlash,
                badge: 'Cancelled',
            };
        case 'QUEUED':
            return {
                title: `${noun} queued`,
                Icon: FiLoader,
                badge: 'Queued',
            };
        default:
            return {
                title: isCount ? 'Counting matches' : 'Deleting matching keys',
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
    onKeyPatternJob,
    keyPatternJobStatus,
    onCancelKeyPatternJob,
    onDismissKeyPatternJobStatus,
    searchMeta,
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
    const [isKeyPatternJobStarting, setIsKeyPatternJobStarting] = useState(false);
    const [isCancellingJob, setIsCancellingJob] = useState(false);
    const [lastCountResult, setLastCountResult] = useState(null);

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
    const canUseKeyPatternActions = Boolean(
        namespace
        && onKeyPatternJob
        && searchField === 'KEY'
        && ['PREFIX', 'SUFFIX', 'CONTAINS', 'EXACT'].includes(searchType)
    );
    const jobRunning = keyPatternJobStatus?.status === 'QUEUED' || keyPatternJobStatus?.status === 'RUNNING';
    const jobMode = keyPatternJobStatus?.mode || 'DELETE';
    const isCountJob = jobMode === 'COUNT';
    const scannedForProgress = Number(keyPatternJobStatus?.scannedRecords || 0);
    const totalForProgress = Number(keyPatternJobStatus?.totalRecordsEstimate || 0);
    const matchedForProgress = Number(keyPatternJobStatus?.matchedRecords || 0);
    const deletedForProgress = Number(keyPatternJobStatus?.deletedRecords || 0);
    const scanProgressPercent = keyPatternJobStatus?.status === 'COMPLETED'
        || keyPatternJobStatus?.status === 'CANCELLED'
        || keyPatternJobStatus?.phase === 'DONE'
        ? 100
        : totalForProgress > 0
            ? Math.min(100, Math.round((scannedForProgress * 100) / totalForProgress))
            : 0;
    const deleteProgressPercent = matchedForProgress > 0
        ? Math.min(100, Math.round((deletedForProgress * 100) / matchedForProgress))
        : (keyPatternJobStatus?.status === 'COMPLETED' && !isCountJob ? 100 : 0);

    const paginatedRecords = useMemo(() => {
        return safeRecords.slice(startIndex, endIndex);
    }, [safeRecords, startIndex, endIndex]);

    const allBinNames = useMemo(() => {
        return [...new Set(safeRecords.flatMap(record => Object.keys(record.bins || {})))];
    }, [safeRecords]);

    const matchingCountHint = useMemo(() => {
        if (!lastCountResult || lastCountResult.status !== 'COMPLETED') {
            return null;
        }
        const sameScope = (lastCountResult.setName || null) === (setName || null)
            && lastCountResult.namespace === namespace;
        const samePattern = lastCountResult.pattern === searchPattern.trim()
            && lastCountResult.searchType === searchType
            && Boolean(lastCountResult.caseSensitive) === Boolean(caseSensitive);
        if (!sameScope || !samePattern) {
            return null;
        }
        return lastCountResult;
    }, [lastCountResult, namespace, setName, searchPattern, searchType, caseSensitive]);

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
            // 0 = scan entire selected scope (backend interprets <= 0 as unlimited)
            maxScanRecords: usesDirectKeyLookup ? maxResults : (scanLimit <= 0 ? 0 : Math.max(scanLimit, maxResults)),
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
                maxRecords: scanLimit > 0 ? scanLimit : 100,
            });
        }
    };

    const runKeyPatternJob = async (mode) => {
        if (!canUseKeyPatternActions || isKeyPatternJobStarting || jobRunning) {
            return;
        }

        const pattern = searchPattern.trim();
        if (!pattern) {
            return;
        }

        if (mode === 'DELETE') {
            const scopeLabel = setName ? `${namespace}.${setName}` : `${namespace} / all sets`;
            const matchLabel = MATCH_TYPE_LABELS[searchType] || 'matches';
            const countLine = matchingCountHint
                ? `A prior count found ${formatCount(matchingCountHint.matchedRecords)} matching key(s) in this scope.\n\n`
                : 'No prior count for this exact pattern — this will full-scope delete without a known match total.\n\n';
            const typed = window.prompt(
                `Delete every record in ${scopeLabel} whose stored user key ${matchLabel} "${pattern}"?\n\n` +
                countLine +
                `This scans the full selected scope and cannot be undone. Type the pattern to confirm:`
            );
            if (typed !== pattern) {
                return;
            }
        }

        setIsKeyPatternJobStarting(true);
        try {
            const status = await onKeyPatternJob({
                pattern,
                searchType,
                caseSensitive,
                mode,
            });
            if (mode === 'COUNT' && status?.status === 'COMPLETED') {
                setLastCountResult(status);
            }
            if (mode === 'DELETE' && status?.status === 'COMPLETED') {
                setSearchActive(false);
                setCurrentPage(1);
                setLastCountResult(null);
            }
        } finally {
            setIsKeyPatternJobStarting(false);
        }
    };

    const handleCancelKeyPatternJob = async () => {
        if (!jobRunning || !keyPatternJobStatus?.jobId || !onCancelKeyPatternJob || isCancellingJob) {
            return;
        }

        setIsCancellingJob(true);
        try {
            await onCancelKeyPatternJob(keyPatternJobStatus.jobId);
        } finally {
            setIsCancellingJob(false);
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
            {isSearching && (
                <LoadingOverlay
                    message={searchActive
                        ? (scanLimit <= 0 ? 'Scanning entire scope for matches...' : 'Searching records...')
                        : 'Loading records...'}
                />
            )}

            <div className="table-header">
                <div className="table-title-block">
                    <div className="table-title-row">
                        <h2>{contextLabel}</h2>
                        {searchActive && <span className="search-badge">Search results</span>}
                        {searchActive && searchMeta?.fullScan && (
                            <span className="search-badge full-scan">Full scan</span>
                        )}
                    </div>
                    <span className="record-count">
                        {searchActive && searchMeta
                            ? (
                                <>
                                    Showing {totalRecords.toLocaleString()}
                                    {searchMeta.truncated || Number(searchMeta.matchedTotal) > totalRecords
                                        ? ` of ${formatCount(searchMeta.matchedTotal)} matches`
                                        : ` match${totalRecords === 1 ? '' : 'es'}`}
                                    {searchMeta.scannedRecords != null && (
                                        <span className="page-info">
                                            {' '}· scanned {formatCount(searchMeta.scannedRecords)}
                                            {searchMeta.fullScan ? ' (entire scope)' : ''}
                                        </span>
                                    )}
                                    {totalRecords > pageSize && (
                                        <span className="page-info"> · page {startIndex + 1}-{endIndex}</span>
                                    )}
                                </>
                            )
                            : (
                                <>
                                    {totalRecords.toLocaleString()} records
                                    {totalRecords > pageSize && (
                                        <span className="page-info"> - showing {startIndex + 1}-{endIndex}</span>
                                    )}
                                </>
                            )}
                    </span>
                    <p>{contextHint}</p>
                </div>

                <div className="table-actions">
                    {onReload && (
                        <button className="btn-icon-action" onClick={() => onReload({ maxRecords: scanLimit > 0 ? scanLimit : 100 })} disabled={isSearching || !namespace || jobRunning} title="Reload records">
                            <FiRefreshCw className={isSearching ? 'spinning' : ''} />
                        </button>
                    )}
                    {canAdd && (
                        <button className="btn-add-record" onClick={onAddRecord} disabled={jobRunning}>
                            <FiPlus /> Add Record
                        </button>
                    )}
                </div>
            </div>

            {keyPatternJobStatus && (() => {
                const presentation = getKeyPatternJobPresentation(keyPatternJobStatus.status, jobMode);
                const StatusIcon = presentation.Icon;
                const phaseLabel = String(keyPatternJobStatus.phase || 'SCANNING')
                    .toLowerCase()
                    .replace(/_/g, ' ');
                const scopeLabel = keyPatternJobStatus.setName
                    ? `${keyPatternJobStatus.namespace}.${keyPatternJobStatus.setName}`
                    : `${keyPatternJobStatus.namespace || 'namespace'} / all sets`;
                const matchLabel = MATCH_TYPE_LABELS[keyPatternJobStatus.searchType] || 'matches';
                const patternValue = keyPatternJobStatus.pattern || '';

                return (
                    <section
                        className={`prefix-delete-panel status-${String(keyPatternJobStatus.status || 'RUNNING').toLowerCase()}`}
                        aria-live="polite"
                    >
                        <div className="prefix-delete-panel-glow" aria-hidden="true" />

                        <div className="prefix-delete-panel-top">
                            <div className="prefix-delete-identity">
                                <div className="prefix-delete-icon-wrap">
                                    <StatusIcon className={jobRunning ? 'spinning-slow' : ''} />
                                </div>
                                <div className="prefix-delete-copy">
                                    <div className="prefix-delete-title-row">
                                        <h3>{presentation.title}</h3>
                                        <span className="prefix-delete-status-pill">{presentation.badge}</span>
                                        <span className="prefix-delete-phase-pill">{phaseLabel}</span>
                                        <span className="prefix-delete-phase-pill">{isCountJob ? 'count' : 'delete'}</span>
                                    </div>
                                    <p className="prefix-delete-subtitle">
                                        {keyPatternJobStatus.message
                                            || (isCountJob
                                                ? `Counting keys in ${scopeLabel} that ${matchLabel} "${patternValue}".`
                                                : `Deleting keys in ${scopeLabel} that ${matchLabel} "${patternValue}".`)}
                                    </p>
                                    <div className="prefix-delete-meta-row">
                                        <span className="prefix-delete-chip">
                                            {keyPatternJobStatus.searchType || 'PREFIX'} <code>{patternValue || '—'}</code>
                                        </span>
                                        <span className="prefix-delete-chip subtle">{scopeLabel}</span>
                                        {keyPatternJobStatus.nodeCount != null && (
                                            <span className="prefix-delete-chip subtle">
                                                {keyPatternJobStatus.nodeCount} nodes
                                                {!isCountJob && ` · ${keyPatternJobStatus.workerCount || 0} workers`}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="prefix-delete-top-actions">
                                <div className="prefix-delete-elapsed">
                                    <FiClock />
                                    <span>{formatElapsed(keyPatternJobStatus.elapsedMs)}</span>
                                </div>
                                {jobRunning && onCancelKeyPatternJob && (
                                    <button
                                        className="prefix-delete-cancel"
                                        onClick={handleCancelKeyPatternJob}
                                        disabled={isCancellingJob}
                                        title="Stop this job"
                                    >
                                        <FiSlash />
                                        <span>{isCancellingJob ? 'Stopping…' : 'Stop'}</span>
                                    </button>
                                )}
                                {(keyPatternJobStatus.status === 'COMPLETED'
                                    || keyPatternJobStatus.status === 'FAILED'
                                    || keyPatternJobStatus.status === 'CANCELLED')
                                    && onDismissKeyPatternJobStatus && (
                                    <button
                                        className="prefix-delete-dismiss"
                                        onClick={onDismissKeyPatternJobStatus}
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
                                <strong>{totalForProgress > 0 || !jobRunning ? `${scanProgressPercent}%` : '—'}</strong>
                            </div>
                            <div className="prefix-delete-progress-track" aria-hidden="true">
                                <div
                                    className={`prefix-delete-progress-fill ${jobRunning ? 'is-active' : ''}`}
                                    style={{
                                        width: `${Math.max(
                                            scanProgressPercent,
                                            jobRunning && totalForProgress === 0 ? 12 : 0
                                        )}%`,
                                    }}
                                />
                            </div>

                            {!isCountJob && (matchedForProgress > 0 || deletedForProgress > 0) && (
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
                                <strong>{formatCount(keyPatternJobStatus.scannedRecords)}</strong>
                                {totalForProgress > 0 && (
                                    <em>{scanProgressPercent}% of total</em>
                                )}
                            </div>
                            <div className="prefix-delete-metric accent">
                                <span>Matched</span>
                                <strong>{formatCount(keyPatternJobStatus.matchedRecords)}</strong>
                            </div>
                            {!isCountJob && (
                                <div className="prefix-delete-metric success">
                                    <span>Deleted</span>
                                    <strong>{formatCount(keyPatternJobStatus.deletedRecords)}</strong>
                                    {matchedForProgress > 0 && (
                                        <em>{deleteProgressPercent}% of matched</em>
                                    )}
                                </div>
                            )}
                            {!isCountJob && (
                                <div className="prefix-delete-metric danger">
                                    <span>Failed</span>
                                    <strong>{formatCount(keyPatternJobStatus.failedDeletes)}</strong>
                                </div>
                            )}
                            <div className="prefix-delete-metric">
                                <span>Skipped</span>
                                <strong>{formatCount(keyPatternJobStatus.skippedRecordsWithoutUserKey)}</strong>
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
                            disabled={isSearching || jobRunning}
                        />
                    </div>

                    <div className="search-options">
                        <select
                            className="search-type-select"
                            value={searchField}
                            onChange={(e) => setSearchField(e.target.value)}
                            disabled={isSearching || jobRunning}
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
                            disabled={isSearching || jobRunning}
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
                                disabled={isSearching || jobRunning}
                            />
                            Case sensitive
                        </label>
                        <select
                            className="search-type-select compact"
                            value={scanLimit}
                            onChange={(e) => setScanLimit(Number(e.target.value))}
                            disabled={isSearching || usesDirectKeyLookup || jobRunning}
                            title={usesDirectKeyLookup
                                ? 'Exact key searches use direct lookup and do not scan records'
                                : 'How many records to scan. Choose Scan all to cover the entire scope and get total match counts.'}
                        >
                            <option value={50}>Scan 50</option>
                            <option value={100}>Scan 100</option>
                            <option value={250}>Scan 250</option>
                            <option value={500}>Scan 500</option>
                            <option value={1000}>Scan 1k</option>
                            <option value={5000}>Scan 5k</option>
                            <option value={10000}>Scan 10k</option>
                            <option value={20000}>Scan 20k</option>
                            <option value={0}>Scan all</option>
                        </select>
                        <select
                            className="search-type-select compact"
                            value={maxResults}
                            onChange={(e) => setMaxResults(Number(e.target.value))}
                            disabled={isSearching || jobRunning}
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
                            disabled={!searchPattern.trim() || isSearching || jobRunning}
                            title="Search"
                        >
                            <FiSearch /> Search
                        </button>
                        {canUseKeyPatternActions && (
                            <button
                                className="btn-clear-search"
                                onClick={() => runKeyPatternJob('COUNT')}
                                disabled={!searchPattern.trim() || isSearching || isKeyPatternJobStarting || jobRunning}
                                title="Full-scope scan to count matching user keys (no deletes)"
                            >
                                <FiHash /> {jobRunning && isCountJob ? 'Counting...' : 'Count matches'}
                            </button>
                        )}
                        {canUseKeyPatternActions && (
                            <button
                                className="btn-danger-action"
                                onClick={() => runKeyPatternJob('DELETE')}
                                disabled={!searchPattern.trim() || isSearching || isKeyPatternJobStarting || jobRunning}
                                title="Scan the full selected scope and delete records whose stored user key matches this pattern"
                            >
                                <FiTrash2 /> {jobRunning && !isCountJob ? 'Deleting...' : 'Delete matching'}
                            </button>
                        )}
                        {matchingCountHint && !jobRunning && (
                            <span className="search-hint">
                                Counted {formatCount(matchingCountHint.matchedRecords)} match(es)
                            </span>
                        )}
                        {usesDirectKeyLookup && (
                            <span className="search-hint">Direct key lookup - no scan</span>
                        )}
                        <button
                            className="btn-clear-search"
                            onClick={handleClearSearch}
                            disabled={isSearching || jobRunning}
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
                                <button className="btn-clear-search" onClick={() => onReload({ maxRecords: scanLimit > 0 ? scanLimit : 100 })} disabled={isSearching || jobRunning}>
                                    <FiRefreshCw /> Reload
                                </button>
                            )}
                            {canAdd && (
                                <button className="btn-add-first" onClick={onAddRecord} disabled={jobRunning}>
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
                                                    disabled={jobRunning}
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
                                                    disabled={jobRunning}
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
                                <select value={pageSize} onChange={(e) => handlePageSizeChange(Number(e.target.value))} disabled={jobRunning}>
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
                                    disabled={activePage === 1 || jobRunning}
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
                                    disabled={activePage === totalPages || jobRunning}
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
