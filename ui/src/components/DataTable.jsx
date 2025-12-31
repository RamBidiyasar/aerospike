import { useState, useMemo } from 'react';
import { FiEdit2, FiTrash2, FiPlus, FiSearch, FiX, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { LoadingOverlay } from './LoadingOverlay';
import './DataTable.css';

export const DataTable = ({
    records,
    onSelectRecord,
    onDeleteRecord,
    selectedRecord,
    onAddRecord,
    onSearch,
    namespace,
    setName,
    isSearching = false
}) => {
    const [searchPattern, setSearchPattern] = useState('');
    const [searchType, setSearchType] = useState('EXACT');
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);

    // Pagination calculations - MUST be before any conditional returns
    const totalRecords = records?.length || 0;
    const totalPages = Math.ceil(totalRecords / pageSize);
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalRecords);

    // useMemo MUST be called unconditionally
    const paginatedRecords = useMemo(() => {
        return records?.slice(startIndex, endIndex) || [];
    }, [records, startIndex, endIndex]);

    // Get all unique bin names from all records
    const allBinNames = useMemo(() => {
        return [...new Set(records?.flatMap(record => Object.keys(record.bins || {})) || [])];
    }, [records]);

    const handleSearch = () => {
        if (searchPattern.trim() && onSearch) {
            onSearch(searchPattern, searchType);
        }
    };

    const handleClearSearch = () => {
        setSearchPattern('');
        setCurrentPage(1); // Reset to first page
        if (onSearch) {
            onSearch('', 'EXACT', true); // Signal to clear search
        }
    };

    const handleKeyPress = (e) => {
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
        setCurrentPage(1); // Reset to first page
    };

    const formatValue = (value) => {
        if (value === null || value === undefined) return '-';
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
    };

    // NOW we can have conditional returns AFTER all hooks
    if (!records || records.length === 0) {
        return (
            <div className="data-table-empty">
                <p>No records to display. {namespace && setName ? 'Try searching or selecting a different set.' : 'Select a set from the browser to view data.'}</p>
                {onAddRecord && (
                    <button className="btn-add-first" onClick={onAddRecord}>
                        <FiPlus /> Add First Record
                    </button>
                )}
            </div>
        );
    }


    return (
        <div className="data-table-container">
            {isSearching && <LoadingOverlay message="Searching records..." />}

            <div className="table-header">
                <div className="table-info">
                    <span className="record-count">
                        {totalRecords} total records
                        {totalRecords > pageSize && (
                            <span className="page-info"> (showing {startIndex + 1}-{endIndex})</span>
                        )}
                    </span>
                </div>

                {namespace && setName && onSearch && (
                    <div className="search-controls">
                        <input
                            type="text"
                            className="search-input"
                            placeholder="Search by key..."
                            value={searchPattern}
                            onChange={(e) => setSearchPattern(e.target.value)}
                            onKeyPress={handleKeyPress}
                            disabled={isSearching}
                        />
                        <select
                            className="search-type-select"
                            value={searchType}
                            onChange={(e) => setSearchType(e.target.value)}
                            disabled={isSearching}
                        >
                            <option value="EXACT">Exact</option>
                            <option value="PREFIX">Prefix</option>
                            <option value="SUFFIX">Suffix</option>
                            <option value="CONTAINS">Contains</option>
                        </select>
                        <button
                            className="btn-search"
                            onClick={handleSearch}
                            disabled={!searchPattern.trim() || isSearching}
                            title="Search"
                        >
                            <FiSearch /> Search
                        </button>
                        <button
                            className="btn-clear-search"
                            onClick={handleClearSearch}
                            disabled={isSearching}
                            title="Clear search"
                        >
                            <FiX /> Clear
                        </button>
                    </div>
                )}

                {onAddRecord && (
                    <button className="btn-add-record" onClick={onAddRecord}>
                        <FiPlus /> Add Record
                    </button>
                )}
            </div>

            <div className="table-wrapper">
                <table className="data-table">
                    <thead>
                        <tr>
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
                                key={idx}
                                className={selectedRecord === record ? 'selected' : ''}
                                onClick={() => onSelectRecord(record)}
                            >
                                <td className="key-cell">
                                    <code>{formatValue(record.key)}</code>
                                </td>
                                <td>{record.ttl || '-'}</td>
                                <td>{record.generation || '-'}</td>
                                {allBinNames.map(binName => (
                                    <td key={binName} className="bin-value">
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

            {/* Pagination Controls */}
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
                            onClick={() => handlePageChange(currentPage - 1)}
                            disabled={currentPage === 1}
                            title="Previous page"
                        >
                            <FiChevronLeft />
                        </button>

                        <span className="page-indicator">
                            Page {currentPage} of {totalPages}
                        </span>

                        <button
                            className="page-btn"
                            onClick={() => handlePageChange(currentPage + 1)}
                            disabled={currentPage === totalPages}
                            title="Next page"
                        >
                            <FiChevronRight />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
