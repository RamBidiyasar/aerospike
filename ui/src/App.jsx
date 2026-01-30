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
import { useAerospike } from './hooks/useAerospike';
import { recordAPI } from './services/api';
import './App.css';

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
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isEditorCollapsed, setIsEditorCollapsed] = useState(false);
  const [availableNamespaces, setAvailableNamespaces] = useState([]);
  const [editorWidth, setEditorWidth] = useState(() => {
    const saved = localStorage.getItem('editorWidth');
    return saved ? parseInt(saved) : 500;
  });

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

  const handleSelectSet = async (namespace, setName) => {
    selectNamespace(namespace);
    selectSet(setName);
    selectRecord(null);
    setLoading(true);
    setError(null);

    try {
      const response = await recordAPI.scanRecords(namespace, setName, 100);
      updateRecords(response.data);
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
        const response = await recordAPI.scanRecords(selectedNamespace, selectedSet, 100);
        updateRecords(response.data);
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
        const response = await recordAPI.scanRecords(selectedNamespace, selectedSet, 100);
        updateRecords(response.data);
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
      if (selectedNamespace === recordData.namespace && selectedSet === recordData.setName) {
        const response = await recordAPI.scanRecords(recordData.namespace, recordData.setName, 100);
        updateRecords(response.data);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (searchPattern, searchType, clearSearch = false) => {
    if (!selectedNamespace || !selectedSet) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (clearSearch || !searchPattern.trim()) {
        // Clear search - load all records
        const response = await recordAPI.scanRecords(selectedNamespace, selectedSet, 100);
        updateRecords(response.data);
      } else {
        // Perform search
        const searchRequest = {
          namespace: selectedNamespace,
          setName: selectedSet,
          searchPattern: searchPattern,
          searchType: searchType,
          maxResults: 100
        };
        const response = await recordAPI.searchRecords(searchRequest);
        updateRecords(response.data);
      }
    } catch (err) {
      setError(err.message);
      updateRecords([]);
    } finally {
      setLoading(false);
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
                selectedNamespace={selectedNamespace}
                selectedSet={selectedSet}
                onNamespacesLoad={setAvailableNamespaces}
                onSelectNamespace={handleSelectNamespace}
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
                namespace={selectedNamespace}
                setName={selectedSet}
                isSearching={loading}
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

      <AddRecordModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSave={handleAddRecord}
        selectedNamespace={selectedNamespace}
        selectedSet={selectedSet}
        availableNamespaces={availableNamespaces}
      />
    </div>
  );
}

export default App;
