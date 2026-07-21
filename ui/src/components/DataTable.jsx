import { useMemo, useState } from 'react';
import { FiChevronLeft, FiChevronRight, FiEdit2, FiPlus, FiRefreshCw, FiSearch, FiTrash2, FiX } from 'react-icons/fi';
import { LoadingOverlay } from './LoadingOverlay';
import './DataTable.css';

export const DataTable = ({
    records,
    onSelectRecord,
    onDeleteRecord,
    selectedRecord,
    onAddRecord,
    onSearch,
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
                        <button className="btn-icon-action" onClick={() => onReload({ maxRecords: scanLimit })} disabled={isSearching || !namespace} title="Reload records">
                            <FiRefreshCw className={isSearching ? 'spinning' : ''} />
                        </button>
                    )}
                    {canAdd && (
                        <button className="btn-add-record" onClick={onAddRecord}>
                            <FiPlus /> Add Record
                        </button>
                    )}
                </div>
            </div>

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
                            disabled={isSearching}
                        />
                    </div>

                    <div className="search-options">
                        <select
                            className="search-type-select"
                            value={searchField}
                            onChange={(e) => setSearchField(e.target.value)}
                            disabled={isSearching}
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
                            disabled={isSearching}
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
                                disabled={isSearching}
                            />
                            Case sensitive
                        </label>
                        <select
                            className="search-type-select compact"
                            value={scanLimit}
                            onChange={(e) => setScanLimit(Number(e.target.value))}
                            disabled={isSearching || usesDirectKeyLookup}
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
                            disabled={isSearching}
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
                            disabled={!searchPattern.trim() || isSearching}
                            title="Search"
                        >
                            <FiSearch /> Search
                        </button>
                        {usesDirectKeyLookup && (
                            <span className="search-hint">Direct key lookup - no scan</span>
                        )}
                        <button
                            className="btn-clear-search"
                            onClick={handleClearSearch}
                            disabled={isSearching}
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
                                <button className="btn-clear-search" onClick={() => onReload({ maxRecords: scanLimit })} disabled={isSearching}>
                                    <FiRefreshCw /> Reload
                                </button>
                            )}
                            {canAdd && (
                                <button className="btn-add-first" onClick={onAddRecord}>
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
                                <select value={pageSize} onChange={(e) => handlePageSizeChange(Number(e.target.value))}>
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
                                    disabled={activePage === 1}
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
                                    disabled={activePage === totalPages}
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
