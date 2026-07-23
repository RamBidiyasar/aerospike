import { useState, useEffect } from 'react';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { ConnectionManager } from './components/ConnectionManager';
import { NamespaceBrowser } from './components/NamespaceBrowser';
import { DataTable } from './components/DataTable';
import { RecordEditor } from './components/RecordEditor';
import { AddRecordModal } from './components/AddRecordModal';
import { ThemeToggle } from './components/ThemeToggle';
import { ResizeHandle } from './components/ResizeHandle';
import { NamespaceStats } from './components/NamespaceStats';
import { AerospikeOpsPanel } from './components/AerospikeOpsPanel';
import { useAerospike } from './hooks/useAerospike';
import { namespaceAPI, recordAPI } from './services/api';
import './App.css';

const ALL_SETS = '__ALL_SETS__';

function App() {
  const {
    connectionStatus,
    selectedNamespace,
    selectedSet,
    records,
    selectedRecord,
    updateConnectionStatus,
    selectNamespace,
    selectSet,
    updateRecords,
    selectRecord,
  } = useAerospike();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [keyPatternJobStatus, setKeyPatternJobStatus] = useState(null);
  const [searchMeta, setSearchMeta] = useState(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isEditorCollapsed, setIsEditorCollapsed] = useState(false);
  const [availableNamespaces, setAvailableNamespaces] = useState([]);
  const [editorWidth, setEditorWidth] = useState(() => {
    const saved = localStorage.getItem('editorWidth');
    return saved ? parseInt(saved) : 500;
  });

  const activeSetName = selectedSet === ALL_SETS ? null : selectedSet;
  const isAllSetsSelected = selectedSet === ALL_SETS;
  const tableContextLabel = selectedNamespace
    ? isAllSetsSelected
      ? `${selectedNamespace} / All sets`
      : selectedSet
        ? `${selectedNamespace} / ${selectedSet}`
        : 'Records'
    : 'Records';
  const tableContextHint = selectedNamespace
    ? isAllSetsSelected
      ? 'Browsing a bounded sample across every set in this namespace.'
      : selectedSet
        ? 'Browsing and editing records in the selected set.'
        : 'Pick all sets or a single set to browse records.'
    : 'Connect to a cluster and select a scope to browse records.';

  // Persist editor width
  useEffect(() => {
    localStorage.setItem('editorWidth', editorWidth.toString());
  }, [editorWidth]);

  const handleConnectionChange = (status) => {
    updateConnectionStatus(status);
    // Always reset state when connection changes (whether connecting or disconnecting)
    updateRecords([]);
    selectNamespace(null);
    selectSet(null);
    selectRecord(null);
  };

  const handleSelectNamespace = (namespace) => {
    selectNamespace(namespace);
    selectSet(null);
    selectRecord(null);
    updateRecords([]);
  };

  const loadRecordsForScope = async (namespace, setScope, maxRecords = 100) => {
    const apiSetName = setScope === ALL_SETS ? null : setScope;
    const response = await recordAPI.scanRecords(namespace, apiSetName, maxRecords);
    updateRecords(response.data);
    setSearchMeta(null);
  };

  const handleSelectSet = async (namespace, setName) => {
    selectNamespace(namespace);
    selectSet(setName);
    selectRecord(null);
    setLoading(true);
    setError(null);

    try {
      await loadRecordsForScope(namespace, setName);
    } catch (err) {
      setError(err.message);
      updateRecords([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAllSets = async (namespace) => {
    selectNamespace(namespace);
    selectSet(ALL_SETS);
    selectRecord(null);
    setLoading(true);
    setError(null);

    try {
      await loadRecordsForScope(namespace, ALL_SETS);
    } catch (err) {
      setError(err.message);
      updateRecords([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveRecord = async (recordData) => {
    setLoading(true);
    setError(null);

    try {
      await recordAPI.putRecord(recordData);

      // Refresh records
      if (selectedNamespace && selectedSet) {
        await loadRecordsForScope(selectedNamespace, selectedSet);
      }

      selectRecord(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRecord = async (record) => {
    setLoading(true);
    setError(null);

    try {
      await recordAPI.deleteRecord(record.namespace, record.setName, record.key.toString());

      // Refresh records
      if (selectedNamespace && selectedSet) {
        await loadRecordsForScope(selectedNamespace, selectedSet);
      }

      if (selectedRecord === record) {
        selectRecord(null);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddRecord = async (recordData) => {
    setLoading(true);
    setError(null);

    try {
      await recordAPI.putRecord(recordData);

      // Refresh records if we're viewing the same set
      if (selectedNamespace === recordData.namespace && (selectedSet === recordData.setName || selectedSet === ALL_SETS)) {
        await loadRecordsForScope(selectedNamespace, selectedSet);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSet = async (namespace, setName) => {
    setLoading(true);
    setError(null);

    try {
      await namespaceAPI.deleteSet(namespace, setName);

      if (selectedNamespace === namespace && selectedSet === setName) {
        selectNamespace(namespace);
        updateRecords([]);
        selectRecord(null);
      } else if (selectedNamespace === namespace && selectedSet === ALL_SETS) {
        await loadRecordsForScope(namespace, ALL_SETS);
        selectRecord(null);
      } else if (selectedRecord?.namespace === namespace && selectedRecord?.setName === setName) {
        selectRecord(null);
      }
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const handleReloadRecords = async ({ maxRecords = 100 } = {}) => {
    if (!selectedNamespace || !selectedSet) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await loadRecordsForScope(selectedNamespace, selectedSet, maxRecords);
    } catch (err) {
      setError(err.message);
      updateRecords([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async ({
    searchPattern,
    searchType,
    searchField,
    caseSensitive,
    maxResults,
    maxScanRecords,
    maxRecords,
    clearSearch = false,
  }) => {
    if (!selectedNamespace || !selectedSet) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (clearSearch || !searchPattern.trim()) {
        setSearchMeta(null);
        await loadRecordsForScope(selectedNamespace, selectedSet, maxRecords || 100);
      } else {
        const searchRequest = {
          namespace: selectedNamespace,
          setName: activeSetName,
          searchPattern: searchPattern,
          searchType: searchType,
          searchField,
          caseSensitive,
          maxResults,
          maxScanRecords,
        };
        const response = await recordAPI.searchRecords(searchRequest);
        const payload = response.data;
        const records = Array.isArray(payload) ? payload : (payload?.records || []);
        updateRecords(records);
        setSearchMeta(Array.isArray(payload) ? null : {
          matchedTotal: payload?.matchedTotal ?? records.length,
          scannedRecords: payload?.scannedRecords ?? null,
          maxResults: payload?.maxResults ?? maxResults,
          fullScan: Boolean(payload?.fullScan),
          truncated: Boolean(payload?.truncated),
        });
      }
    } catch (err) {
      setError(err.message);
      updateRecords([]);
      setSearchMeta(null);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPatternJob = async ({ pattern, searchType, caseSensitive, mode }) => {
    if (!selectedNamespace || !selectedSet || !pattern.trim()) {
      return null;
    }

    setError(null);

    try {
      const startResponse = await recordAPI.startKeyPatternJob({
        namespace: selectedNamespace,
        setName: activeSetName,
        pattern,
        searchType,
        caseSensitive,
        mode,
      });

      let status = startResponse.data;
      setKeyPatternJobStatus(status);

      while (status?.status === 'QUEUED' || status?.status === 'RUNNING') {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const pollResponse = await recordAPI.getKeyPatternJobStatus(status.jobId);
        status = pollResponse.data;
        setKeyPatternJobStatus(status);
      }

      if (mode === 'DELETE' && (status?.status === 'COMPLETED' || status?.status === 'CANCELLED')) {
        selectRecord(null);
        await loadRecordsForScope(selectedNamespace, selectedSet);
      }

      if (status?.status === 'FAILED') {
        setError(status.message || (mode === 'COUNT' ? 'Key pattern count failed' : 'Key pattern delete failed'));
      }

      return status;
    } catch (err) {
      setError(err.message);
      setKeyPatternJobStatus((current) => (
        current
          ? {
              ...current,
              status: 'FAILED',
              message: err.message,
            }
          : {
              status: 'FAILED',
              mode,
              message: err.message,
              pattern,
              searchType,
            }
      ));
      throw err;
    }
  };

  const handleCancelKeyPatternJob = async (jobId) => {
    if (!jobId) {
      return null;
    }

    try {
      const response = await recordAPI.cancelKeyPatternJob(jobId);
      setKeyPatternJobStatus(response.data);
      return response.data;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };


  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1 className="app-title">
            <span className="text-gradient">Aerospike</span> Database Manager
          </h1>
          <p className="app-subtitle">Modern database management interface</p>
        </div>
        <ThemeToggle />
      </header>

      <div className="app-body">
        <div className="connection-panel">
          <ConnectionManager
            onConnectionChange={handleConnectionChange}
            connectionStatus={connectionStatus}
          />
        </div>

        <div className="main-content">
          <div className={`sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}>
            {!isSidebarCollapsed && (
              <NamespaceBrowser
                connectionStatus={connectionStatus}
                onSelectSet={handleSelectSet}
                onSelectAllSets={handleSelectAllSets}
                selectedNamespace={selectedNamespace}
                selectedSet={selectedSet}
                allSetsValue={ALL_SETS}
                onNamespacesLoad={setAvailableNamespaces}
                onSelectNamespace={handleSelectNamespace}
                onDeleteSet={handleDeleteSet}
              />
            )}
            <button
              className="collapse-btn collapse-btn-left"
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isSidebarCollapsed ? <FiChevronRight /> : <FiChevronLeft />}
            </button>
          </div>

          <div className="data-panel">
            {error && (
              <div className="global-error">
                {error}
              </div>
            )}
            <AerospikeOpsPanel
              connectionStatus={connectionStatus}
              selectedNamespace={selectedNamespace}
              selectedSet={selectedSet}
              allSetsValue={ALL_SETS}
            />
            {selectedNamespace && !selectedSet ? (
              <NamespaceStats namespace={selectedNamespace} />
            ) : (
              <DataTable
                records={records}
                onSelectRecord={selectRecord}
                onDeleteRecord={handleDeleteRecord}
                selectedRecord={selectedRecord}
                onAddRecord={() => setIsAddModalOpen(true)}
                onSearch={handleSearch}
                onKeyPatternJob={handleKeyPatternJob}
                keyPatternJobStatus={keyPatternJobStatus}
                onCancelKeyPatternJob={handleCancelKeyPatternJob}
                onDismissKeyPatternJobStatus={() => setKeyPatternJobStatus(null)}
                searchMeta={searchMeta}
                onReload={handleReloadRecords}
                namespace={selectedNamespace}
                setName={activeSetName}
                isSearching={loading}
                contextLabel={tableContextLabel}
                contextHint={tableContextHint}
              />
            )}
          </div>

          {selectedRecord && (
            <div
              className={`editor-panel fade-in ${isEditorCollapsed ? 'collapsed' : ''}`}
              style={{ width: isEditorCollapsed ? '40px' : `${editorWidth}px` }}
            >
              {!isEditorCollapsed && (
                <>
                  <ResizeHandle
                    onResize={setEditorWidth}
                    minWidth={300}
                    maxWidth={800}
                  />
                  <RecordEditor
                    key={`${selectedRecord.namespace}:${selectedRecord.setName}:${selectedRecord.key}`}
                    record={selectedRecord}
                    onSave={handleSaveRecord}
                    onClose={() => selectRecord(null)}
                  />
                </>
              )}
              <button
                className="collapse-btn collapse-btn-right"
                onClick={() => setIsEditorCollapsed(!isEditorCollapsed)}
                title={isEditorCollapsed ? 'Expand editor' : 'Collapse editor'}
              >
                {isEditorCollapsed ? <FiChevronLeft /> : <FiChevronRight />}
              </button>
            </div>
          )}
        </div>
      </div>

      {isAddModalOpen && (
        <AddRecordModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          onSave={handleAddRecord}
          selectedNamespace={selectedNamespace}
          selectedSet={activeSetName}
          availableNamespaces={availableNamespaces}
        />
      )}
    </div>
  );
}

export default App;
