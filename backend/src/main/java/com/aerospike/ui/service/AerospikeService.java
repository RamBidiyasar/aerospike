package com.aerospike.ui.service;

import com.aerospike.client.*;
import com.aerospike.client.Info;
import com.aerospike.client.cluster.Node;
import com.aerospike.client.policy.BatchDeletePolicy;
import com.aerospike.client.policy.BatchPolicy;
import com.aerospike.client.policy.ClientPolicy;
import com.aerospike.client.policy.ScanPolicy;
import com.aerospike.client.policy.WritePolicy;
import com.aerospike.ui.model.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Stream;

@Slf4j
@Service
public class AerospikeService {

    // Configuration will be read from ConnectionRequest
    // No default values needed

    private AerospikeClient client;
    private final Map<String, Object> connectionMetadata = new ConcurrentHashMap<>();
    private static final int DEFAULT_SCAN_LIMIT = 100;
    private static final int MAX_SCAN_LIMIT = 1000;
    private static final int DEFAULT_SEARCH_LIMIT = 100;
    private static final int MAX_SEARCH_LIMIT = 500;
    private static final int DEFAULT_SEARCH_SCAN_LIMIT = 5000;
    private static final int MAX_SEARCH_SCAN_LIMIT = 20000;

    /** Keys per batch delete call — one round-trip covers all cluster nodes. */
    private static final int PREFIX_DELETE_BATCH_SIZE = 1000;
    /** Bound buffered matching keys so a fast scan cannot OOM the JVM. */
    private static final int PREFIX_DELETE_QUEUE_CAPACITY = 50_000;
    private static final long PREFIX_DELETE_OFFER_TIMEOUT_MS = 5_000L;
    private static final long PREFIX_DELETE_POLL_TIMEOUT_MS = 200L;
    private static final long PREFIX_DELETE_PROGRESS_LOG_INTERVAL_MS = 5_000L;

    private final ConcurrentHashMap<String, PrefixDeleteJob> prefixDeleteJobs = new ConcurrentHashMap<>();
    private final AtomicReference<String> activePrefixDeleteJobId = new AtomicReference<>();
    private final ExecutorService prefixDeleteExecutor = Executors.newSingleThreadExecutor(runnable -> {
        Thread thread = new Thread(runnable, "prefix-delete-job");
        thread.setDaemon(true);
        return thread;
    });

    public ConnectionInfo connect(ConnectionRequest request) {
        try {
            // Close existing connection if any
            if (client != null && client.isConnected()) {
                client.close();
            }

            ClientPolicy policy = new ClientPolicy();
            if (request.getUsername() != null && request.getPassword() != null) {
                policy.user = request.getUsername();
                policy.password = request.getPassword();
            }
            if (request.getTimeout() != null) {
                policy.timeout = request.getTimeout();
            }
            if (request.getMaxConnsPerNode() != null) {
                policy.maxConnsPerNode = request.getMaxConnsPerNode();
            }

            Host[] hosts = resolveHosts(request);
            client = new AerospikeClient(policy, hosts);

            // Store connection info
            connectionMetadata.put("hosts", Arrays.stream(hosts).map(Host::toString).toList());
            connectionMetadata.put("timeout", policy.timeout);
            connectionMetadata.put("maxConnsPerNode", policy.maxConnsPerNode);
            if (request.getMaxRetries() != null) {
                connectionMetadata.put("maxRetries", request.getMaxRetries());
            }

            return getConnectionInfo();
        } catch (Exception e) {
            log.error("Failed to connect to Aerospike", e);
            return ConnectionInfo.builder()
                    .connected(false)
                    .message("Connection failed: " + e.getMessage())
                    .build();
        }
    }

    public ConnectionInfo getConnectionInfo() {
        if (client == null || !client.isConnected()) {
            return ConnectionInfo.builder()
                    .connected(false)
                    .message("Not connected")
                    .build();
        }

        try {
            Node[] nodes = client.getNodes();
            List<NodeInfo> nodeInfoList = new ArrayList<>();

            for (Node node : nodes) {
                Map<String, Object> statistics = requestInfoMap(node, "statistics");
                nodeInfoList.add(NodeInfo.builder()
                        .name(node.getName())
                        .address(node.getHost().toString())
                        .active(node.isActive())
                        .build(requestInfo(node, "build"))
                        .edition(requestInfo(node, "edition"))
                        .uptimeSeconds(parseLong(statistics.get("uptime")))
                        .statistics(statistics)
                        .build());
            }

            // Get cluster name from first node
            String clusterName = nodes.length > 0 ? nodes[0].getName().split(":")[0] : "Aerospike Cluster";

            return ConnectionInfo.builder()
                    .connected(true)
                    .clusterName(clusterName != null ? clusterName : "Unknown")
                    .nodes(nodeInfoList)
                    .message("Connected successfully")
                    .build();
        } catch (Exception e) {
            log.error("Failed to get connection info", e);
            return ConnectionInfo.builder()
                    .connected(false)
                    .message("Error retrieving connection info: " + e.getMessage())
                    .build();
        }
    }

    public void disconnect() {
        if (client != null) {
            client.close();
            client = null;
            connectionMetadata.clear();
            log.info("Disconnected from Aerospike");
        }
    }

    public ClusterOverview getClusterOverview() {
        ensureConnected();

        ConnectionInfo connectionInfo = getConnectionInfo();
        List<NamespaceInfo> namespaces = getNamespaces();
        List<SetInfo> allSets = new ArrayList<>();

        for (NamespaceInfo namespace : namespaces) {
            try {
                allSets.addAll(getSets(namespace.getName()));
            } catch (Exception e) {
                log.warn("Skipping set summary for namespace {}", namespace.getName(), e);
            }
        }

        Long setObjectTotal = allSets.stream()
                .map(SetInfo::getObjectCount)
                .filter(Objects::nonNull)
                .reduce(0L, Long::sum);
        Long namespaceObjectTotal = namespaces.stream()
                .map(NamespaceInfo::getMasterObjects)
                .filter(Objects::nonNull)
                .reduce(0L, Long::sum);

        return ClusterOverview.builder()
                .connection(connectionInfo)
                .nodeCount(connectionInfo.getNodes() == null ? 0 : connectionInfo.getNodes().size())
                .activeNodeCount(connectionInfo.getNodes() == null ? 0
                        : (int) connectionInfo.getNodes().stream().filter(NodeInfo::isActive).count())
                .namespaceCount(namespaces.size())
                .setCount(allSets.size())
                .totalObjects(setObjectTotal > 0 ? setObjectTotal : namespaceObjectTotal)
                .totalMemoryDataBytes(allSets.stream()
                        .map(SetInfo::getMemoryDataBytes)
                        .filter(Objects::nonNull)
                        .reduce(0L, Long::sum))
                .totalDeviceDataBytes(allSets.stream()
                        .map(SetInfo::getDeviceDataBytes)
                        .filter(Objects::nonNull)
                        .reduce(0L, Long::sum))
                .namespaces(namespaces)
                .sets(allSets)
                .nodes(connectionInfo.getNodes())
                .clusterStatistics(mergeNodeStatistics(connectionInfo.getNodes()))
                .build();
    }

    public List<NamespaceInfo> getNamespaces() {
        ensureConnected();

        try {
            Node[] nodes = client.getNodes();
            if (nodes.length == 0) {
                return Collections.emptyList();
            }

            Map<String, NamespaceAggregate> aggregates = new LinkedHashMap<>();

            for (Node node : nodes) {
                String namespacesStr = Info.request(node, "namespaces");
                if (namespacesStr == null || namespacesStr.isBlank()) {
                    continue;
                }

                for (String namespace : namespacesStr.split(";")) {
                    if (namespace.isEmpty()) {
                        continue;
                    }

                    String nsInfo = Info.request(node, "namespace/" + namespace);
                    Map<String, Object> config = parseInfoString(nsInfo);
                    NamespaceAggregate aggregate = aggregates.computeIfAbsent(namespace, ignored -> new NamespaceAggregate());
                    aggregate.masterObjects += nullToZero(parseLong(config.get("master-objects")));
                    if (aggregate.replicationFactor == null) {
                        aggregate.replicationFactor = parseLong(config.get("replication-factor"));
                    }
                    if (aggregate.storageEngine == null) {
                        aggregate.storageEngine = (String) config.get("storage-engine");
                    }
                    if (aggregate.config == null) {
                        aggregate.config = config;
                    }
                }
            }

            List<NamespaceInfo> namespaceInfoList = new ArrayList<>();
            for (Map.Entry<String, NamespaceAggregate> entry : aggregates.entrySet()) {
                NamespaceAggregate aggregate = entry.getValue();
                namespaceInfoList.add(NamespaceInfo.builder()
                        .name(entry.getKey())
                        .masterObjects(aggregate.masterObjects)
                        .replicationFactor(aggregate.replicationFactor)
                        .storageEngine(aggregate.storageEngine)
                        .config(aggregate.config)
                        .build());
            }

            return namespaceInfoList;
        } catch (Exception e) {
            log.error("Failed to get namespaces", e);
            throw new RuntimeException("Failed to get namespaces: " + e.getMessage(), e);
        }
    }

    public List<SetInfo> getSets(String namespace) {
        ensureConnected();
        validateNamespace(namespace);

        try {
            Node[] nodes = client.getNodes();
            if (nodes.length == 0) {
                return Collections.emptyList();
            }

            long replicationFactor = Math.max(1L, resolveReplicationFactor(namespace, nodes));
            Map<String, SetAggregate> aggregates = new LinkedHashMap<>();

            for (Node node : nodes) {
                String setsInfo = Info.request(node, "sets/" + namespace);
                if (setsInfo == null || setsInfo.isEmpty()) {
                    continue;
                }

                for (String setStr : setsInfo.split(";")) {
                    if (setStr.isEmpty()) {
                        continue;
                    }

                    Map<String, Object> setData = parseInfoString(setStr);
                    String setName = (String) setData.get("set");
                    if (setName == null) {
                        continue;
                    }

                    SetAggregate aggregate = aggregates.computeIfAbsent(setName, ignored -> new SetAggregate());
                    // Prefer master_objects when present; otherwise objects includes replicas on this node.
                    Long masterObjects = parseLong(firstNonNull(setData, "master_objects", "master-objects"));
                    Long objects = parseLong(setData.get("objects"));
                    if (masterObjects != null) {
                        aggregate.masterObjects += masterObjects;
                        aggregate.hasMasterObjects = true;
                    } else {
                        aggregate.objectCopies += nullToZero(objects);
                    }
                    aggregate.memoryDataBytes += nullToZero(parseLong(setData.get("memory_data_bytes")));
                    aggregate.deviceDataBytes += nullToZero(parseLong(setData.get("device_data_bytes")));
                }
            }

            List<SetInfo> setInfoList = new ArrayList<>();
            for (Map.Entry<String, SetAggregate> entry : aggregates.entrySet()) {
                SetAggregate aggregate = entry.getValue();
                long objectCount = aggregate.hasMasterObjects
                        ? aggregate.masterObjects
                        : aggregate.objectCopies / replicationFactor;
                setInfoList.add(SetInfo.builder()
                        .namespace(namespace)
                        .setName(entry.getKey())
                        .objectCount(objectCount)
                        .memoryDataBytes(aggregate.memoryDataBytes)
                        .deviceDataBytes(aggregate.deviceDataBytes)
                        .build());
            }

            return setInfoList;
        } catch (Exception e) {
            log.error("Failed to get sets for namespace: {}", namespace, e);
            throw new RuntimeException("Failed to get sets: " + e.getMessage(), e);
        }
    }

    public List<AerospikeIndexInfo> getSecondaryIndexes(String namespace, String setName) {
        ensureConnected();

        try {
            Node node = firstNode();
            String rawIndexes = Info.request(node, "sindex");
            if (rawIndexes == null || rawIndexes.isBlank()) {
                return Collections.emptyList();
            }

            String namespaceFilter = namespace == null || namespace.isBlank() ? null : namespace;
            String setFilter = normalizeSetName(setName);
            List<AerospikeIndexInfo> indexes = new ArrayList<>();

            for (String indexStr : rawIndexes.split(";")) {
                if (indexStr.isBlank()) {
                    continue;
                }

                Map<String, Object> data = parseInfoString(indexStr);
                String indexNamespace = firstString(data, "ns", "namespace");
                String indexSet = firstString(data, "set", "set-name");

                if (namespaceFilter != null && !namespaceFilter.equals(indexNamespace)) {
                    continue;
                }
                if (setFilter != null && !setFilter.equals(indexSet)) {
                    continue;
                }

                indexes.add(AerospikeIndexInfo.builder()
                        .namespace(indexNamespace)
                        .setName(indexSet)
                        .indexName(firstString(data, "indexname", "index", "name"))
                        .binName(firstString(data, "bin", "bins"))
                        .type(firstString(data, "type", "indextype"))
                        .collectionType(firstString(data, "collection", "collectiontype"))
                        .state(firstString(data, "state"))
                        .syncState(firstString(data, "sync_state", "sync-state"))
                        .raw(data)
                        .build());
            }

            return indexes;
        } catch (Exception e) {
            log.error("Failed to get secondary indexes", e);
            throw new RuntimeException("Failed to get secondary indexes: " + e.getMessage(), e);
        }
    }

    public List<UdfModuleInfo> getUdfs() {
        ensureConnected();

        try {
            String rawUdfs = Info.request(firstNode(), "udf-list");
            if (rawUdfs == null || rawUdfs.isBlank()) {
                return Collections.emptyList();
            }

            List<UdfModuleInfo> udfs = new ArrayList<>();
            for (String udfStr : rawUdfs.split(";")) {
                if (udfStr.isBlank()) {
                    continue;
                }
                Map<String, Object> data = parseInfoString(udfStr);
                udfs.add(UdfModuleInfo.builder()
                        .filename(firstString(data, "filename", "file"))
                        .hash(firstString(data, "hash"))
                        .type(firstString(data, "type"))
                        .raw(data)
                        .build());
            }

            return udfs;
        } catch (Exception e) {
            log.error("Failed to get UDF modules", e);
            throw new RuntimeException("Failed to get UDF modules: " + e.getMessage(), e);
        }
    }

    public InfoCommandResponse runInfoCommand(InfoCommandRequest request) {
        ensureConnected();
        if (request == null || request.getCommand() == null || request.getCommand().isBlank()) {
            throw new IllegalArgumentException("Info command is required");
        }

        String command = request.getCommand().trim();
        try {
            Node node = resolveNode(request.getNodeName());
            String raw = Info.request(node, command);
            return InfoCommandResponse.builder()
                    .command(command)
                    .nodeName(node.getName())
                    .raw(raw)
                    .parsed(parseInfoString(raw))
                    .build();
        } catch (Exception e) {
            log.error("Failed to run info command {}", command, e);
            throw new RuntimeException("Failed to run info command: " + e.getMessage(), e);
        }
    }

    public BinStats getBinStats(String namespace, String setName, Integer maxRecords) {
        ensureConnected();
        validateNamespace(namespace);

        int scanLimit = clamp(maxRecords, DEFAULT_SCAN_LIMIT, 1, MAX_SCAN_LIMIT);
        String normalizedSetName = normalizeSetName(setName);
        Map<String, MutableBinSummary> summaries = new TreeMap<>();
        int[] scanned = { 0 };
        ScanPolicy scanPolicy = new ScanPolicy();
        scanPolicy.maxRecords = scanLimit;

        try {
            client.scanAll(scanPolicy, namespace, normalizedSetName, (key, record) -> {
                scanned[0]++;
                if (record.bins == null) {
                    return;
                }

                record.bins.forEach((binName, value) -> {
                    MutableBinSummary summary = summaries.computeIfAbsent(binName, ignored -> new MutableBinSummary());
                    summary.recordsWithBin++;
                    String type = describeValueType(value);
                    summary.typeCounts.merge(type, 1, Integer::sum);
                    if (summary.sampleValues.size() < 5) {
                        summary.sampleValues.add(stringifyValue(value));
                    }
                });
            });

            List<BinStats.BinSummary> bins = summaries.entrySet().stream()
                    .map(entry -> BinStats.BinSummary.builder()
                            .name(entry.getKey())
                            .recordsWithBin(entry.getValue().recordsWithBin)
                            .coveragePercent(scanned[0] == 0 ? 0.0
                                    : Math.round((entry.getValue().recordsWithBin * 10000.0) / scanned[0]) / 100.0)
                            .typeCounts(entry.getValue().typeCounts)
                            .sampleValues(entry.getValue().sampleValues)
                            .build())
                    .toList();

            return BinStats.builder()
                    .namespace(namespace)
                    .setName(normalizedSetName)
                    .scannedRecords(scanned[0])
                    .bins(bins)
                    .build();
        } catch (Exception e) {
            log.error("Failed to sample bin stats from {}.{}", namespace, normalizedSetName, e);
            throw new RuntimeException("Failed to sample bin stats: " + e.getMessage(), e);
        }
    }

    public void deleteSet(String namespace, String setName) {
        ensureConnected();
        validateNamespace(namespace);
        validateConcreteSetName(setName);

        try {
            client.truncate(null, namespace, setName, null);
            log.info("Requested truncate for set {}.{}", namespace, setName);
        } catch (Exception e) {
            log.error("Failed to delete set {}.{}", namespace, setName, e);
            throw new RuntimeException("Failed to delete set: " + e.getMessage(), e);
        }
    }

    public List<RecordData> scanRecords(String namespace, String setName, Integer maxRecords) {
        ensureConnected();
        validateNamespace(namespace);

        List<RecordData> records = Collections.synchronizedList(new ArrayList<>());
        ScanPolicy scanPolicy = new ScanPolicy();
        scanPolicy.maxRecords = clamp(maxRecords, DEFAULT_SCAN_LIMIT, 1, MAX_SCAN_LIMIT);
        String normalizedSetName = normalizeSetName(setName);

        try {
            client.scanAll(scanPolicy, namespace, normalizedSetName, (key, record) -> records.add(toRecordData(key, record)));

            return records;
        } catch (Exception e) {
            log.error("Failed to scan records from {}.{}", namespace, normalizedSetName, e);
            throw new RuntimeException("Failed to scan records: " + e.getMessage(), e);
        }
    }

    public List<RecordData> searchRecords(SearchRequest searchRequest) {
        ensureConnected();
        if (searchRequest == null) {
            throw new IllegalArgumentException("Search request is required");
        }
        validateNamespace(searchRequest.getNamespace());

        List<RecordData> matchedRecords = Collections.synchronizedList(new ArrayList<>());
        ScanPolicy scanPolicy = new ScanPolicy();
        int maxResults = clamp(searchRequest.getMaxResults(), DEFAULT_SEARCH_LIMIT, 1, MAX_SEARCH_LIMIT);
        int maxScanRecords = clamp(searchRequest.getMaxScanRecords(), DEFAULT_SEARCH_SCAN_LIMIT, maxResults,
                MAX_SEARCH_SCAN_LIMIT);
        scanPolicy.maxRecords = maxScanRecords;

        String pattern = searchRequest.getSearchPattern() != null ? searchRequest.getSearchPattern() : "";
        SearchRequest.SearchType searchType = searchRequest.getSearchType() != null
                ? searchRequest.getSearchType()
                : SearchRequest.SearchType.CONTAINS;
        SearchRequest.SearchField searchField = searchRequest.getSearchField() != null
                ? searchRequest.getSearchField()
                : SearchRequest.SearchField.ALL;
        boolean caseSensitive = Boolean.TRUE.equals(searchRequest.getCaseSensitive());
        String normalizedSetName = normalizeSetName(searchRequest.getSetName());

        if (isExactKeyLookup(pattern, searchType, searchField)) {
            return findRecordsByExactKey(searchRequest.getNamespace(), normalizedSetName, pattern, maxResults);
        }

        try {
            client.scanAll(scanPolicy, searchRequest.getNamespace(),
                    normalizedSetName, (key, record) -> {
                        if (recordMatches(key, record, pattern, searchType, searchField, caseSensitive)) {
                            synchronized (matchedRecords) {
                                if (matchedRecords.size() < maxResults) {
                                    matchedRecords.add(toRecordData(key, record));
                                }
                            }
                        }
                    });

            return matchedRecords;
        } catch (Exception e) {
            log.error("Failed to search records from {}.{} with pattern {}",
                    searchRequest.getNamespace(), normalizedSetName, pattern, e);
            throw new RuntimeException("Failed to search records: " + e.getMessage(), e);
        }
    }

    private boolean isExactKeyLookup(
            String pattern,
            SearchRequest.SearchType searchType,
            SearchRequest.SearchField searchField) {
        return searchField == SearchRequest.SearchField.KEY
                && searchType == SearchRequest.SearchType.EXACT
                && pattern != null
                && !pattern.isBlank();
    }

    private List<RecordData> findRecordsByExactKey(String namespace, String setName, String keyValue, int maxResults) {
        List<RecordData> records = new ArrayList<>();
        Set<String> seenDigests = new HashSet<>();

        try {
            for (String lookupSetName : resolveExactKeyLookupSetNames(namespace, setName)) {
                for (Key key : buildExactLookupKeys(namespace, lookupSetName, keyValue)) {
                    com.aerospike.client.Record record = client.get(null, key);
                    if (record == null || !seenDigests.add(formatDigest(key.digest))) {
                        continue;
                    }

                    records.add(toRecordData(key, record));
                    if (records.size() >= maxResults) {
                        return records;
                    }
                }
            }

            return records;
        } catch (Exception e) {
            log.error("Failed exact key lookup in {}.{} for key {}",
                    namespace, setName == null ? "*" : setName, keyValue, e);
            throw new RuntimeException("Failed exact key lookup: " + e.getMessage(), e);
        }
    }

    private List<String> resolveExactKeyLookupSetNames(String namespace, String setName) {
        if (setName != null) {
            return List.of(setName);
        }

        List<String> setNames = getSets(namespace).stream()
                .map(SetInfo::getSetName)
                .filter(Objects::nonNull)
                .filter(value -> !value.isBlank())
                .distinct()
                .collect(ArrayList::new, ArrayList::add, ArrayList::addAll);
        setNames.add(null);
        return setNames;
    }

    private List<Key> buildExactLookupKeys(String namespace, String setName, String keyValue) {
        List<Key> keys = new ArrayList<>();
        keys.add(new Key(namespace, setName, keyValue));

        try {
            keys.add(new Key(namespace, setName, Long.parseLong(keyValue)));
        } catch (NumberFormatException ignored) {
            // Non-numeric keys only need the literal string lookup.
        }

        return keys;
    }

    public DeleteByKeyPrefixResponse deleteByKeyPrefix(DeleteByKeyPrefixRequest request) {
        ensureConnected();
        if (request == null) {
            throw new IllegalArgumentException("Delete by key prefix request is required");
        }
        validateNamespace(request.getNamespace());
        if (request.getKeyPrefix() == null || request.getKeyPrefix().isBlank()) {
            throw new IllegalArgumentException("Key prefix is required");
        }

        String namespace = request.getNamespace();
        String normalizedSetName = normalizeSetName(request.getSetName());
        String keyPrefix = request.getKeyPrefix();
        boolean caseSensitive = !Boolean.FALSE.equals(request.getCaseSensitive());
        int nodeCount = Math.max(1, client.getNodes().length);
        int workerCount = Math.max(2, Math.min(8, nodeCount));
        long totalRecordsEstimate = estimateRecordsForScope(namespace, normalizedSetName);

        PrefixDeleteJob job = new PrefixDeleteJob(
                UUID.randomUUID().toString(),
                namespace,
                normalizedSetName,
                keyPrefix,
                caseSensitive,
                nodeCount,
                workerCount,
                totalRecordsEstimate);

        if (!activePrefixDeleteJobId.compareAndSet(null, job.jobId)) {
            String activeJobId = activePrefixDeleteJobId.get();
            throw new IllegalStateException(
                    "A prefix delete is already running (jobId=" + activeJobId + "). Wait for it to finish.");
        }

        prefixDeleteJobs.put(job.jobId, job);
        job.status.set(PrefixDeleteStatus.QUEUED);
        job.phase.set(PrefixDeletePhase.SCANNING);
        job.message.set("Queued");
        job.startedAtEpochMs.set(System.currentTimeMillis());

        log.info("Queued prefix delete jobId={} namespace={} set={} prefix='{}' nodes={} workers={}",
                job.jobId, namespace, normalizedSetName == null ? "*" : normalizedSetName, keyPrefix,
                nodeCount, workerCount);

        prefixDeleteExecutor.submit(() -> runPrefixDeleteJob(job));
        return job.toResponse();
    }

    public DeleteByKeyPrefixResponse getDeleteByKeyPrefixStatus(String jobId) {
        if (jobId == null || jobId.isBlank()) {
            throw new IllegalArgumentException("Job id is required");
        }
        PrefixDeleteJob job = prefixDeleteJobs.get(jobId);
        if (job == null) {
            throw new IllegalArgumentException("Unknown prefix delete job: " + jobId);
        }
        return job.toResponse();
    }

    private void runPrefixDeleteJob(PrefixDeleteJob job) {
        job.status.set(PrefixDeleteStatus.RUNNING);
        job.phase.set(PrefixDeletePhase.SCANNING);
        job.message.set("Scanning cluster and deleting matching keys");

        String comparablePrefix = normalizeComparableText(job.keyPrefix, job.caseSensitive);
        BlockingQueue<Key> deleteQueue = new ArrayBlockingQueue<>(PREFIX_DELETE_QUEUE_CAPACITY);
        AtomicBoolean scanComplete = new AtomicBoolean(false);
        AtomicReference<Throwable> failure = new AtomicReference<>();
        AtomicBoolean stopProgressLogging = new AtomicBoolean(false);
        Throwable scanFailure = null;

        BatchPolicy batchPolicy = new BatchPolicy();
        batchPolicy.maxConcurrentThreads = 0;
        batchPolicy.totalTimeout = 0;
        batchPolicy.socketTimeout = 30_000;
        batchPolicy.maxRetries = 2;

        BatchDeletePolicy deletePolicy = new BatchDeletePolicy();

        ScanPolicy scanPolicy = new ScanPolicy();
        scanPolicy.includeBinData = false;
        scanPolicy.concurrentNodes = true;
        scanPolicy.maxConcurrentNodes = 0;
        scanPolicy.totalTimeout = 0;
        scanPolicy.socketTimeout = 60_000;

        ExecutorService deleteWorkers = Executors.newFixedThreadPool(job.workerCount, runnable -> {
            Thread thread = new Thread(runnable, "prefix-delete-worker-" + job.jobId.substring(0, 8));
            thread.setDaemon(true);
            return thread;
        });

        Thread progressLogger = new Thread(() -> {
            while (!stopProgressLogging.get()) {
                try {
                    Thread.sleep(PREFIX_DELETE_PROGRESS_LOG_INTERVAL_MS);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    return;
                }
                if (stopProgressLogging.get()) {
                    return;
                }
                log.info(
                        "Prefix delete progress jobId={} status={} phase={} scanned={} matched={} deleted={} failed={} skippedNoUserKey={} queueDepth={} elapsedMs={}",
                        job.jobId,
                        job.status.get(),
                        job.phase.get(),
                        job.scannedRecords.get(),
                        job.matchedRecords.get(),
                        job.deletedRecords.get(),
                        job.failedDeletes.get(),
                        job.skippedRecordsWithoutUserKey.get(),
                        deleteQueue.size(),
                        System.currentTimeMillis() - job.startedAtEpochMs.get());
                job.message.set(String.format(
                        Locale.ROOT,
                        "%s · scanned %s · matched %s · deleted %s · queue %s",
                        job.phase.get().name().toLowerCase(Locale.ROOT),
                        formatCount(job.scannedRecords.get()),
                        formatCount(job.matchedRecords.get()),
                        formatCount(job.deletedRecords.get()),
                        formatCount(deleteQueue.size())));
            }
        }, "prefix-delete-progress-" + job.jobId.substring(0, 8));
        progressLogger.setDaemon(true);
        progressLogger.start();

        for (int i = 0; i < job.workerCount; i++) {
            deleteWorkers.submit(() -> drainPrefixDeleteQueue(
                    deleteQueue,
                    scanComplete,
                    failure,
                    batchPolicy,
                    deletePolicy,
                    job.deletedRecords,
                    job.failedDeletes));
        }

        try {
            log.info("Starting prefix delete jobId={} on {}.{} prefix='{}' nodes={} workers={} batchSize={}",
                    job.jobId,
                    job.namespace,
                    job.setName == null ? "*" : job.setName,
                    job.keyPrefix,
                    job.nodeCount,
                    job.workerCount,
                    PREFIX_DELETE_BATCH_SIZE);

            client.scanAll(scanPolicy, job.namespace, job.setName, (key, record) -> {
                if (failure.get() != null) {
                    throw new RuntimeException("Prefix delete aborted", failure.get());
                }

                long scanned = job.scannedRecords.incrementAndGet();
                if (key.userKey == null) {
                    job.skippedRecordsWithoutUserKey.incrementAndGet();
                    return;
                }

                String userKey = String.valueOf(key.userKey.getObject());
                if (!normalizeComparableText(userKey, job.caseSensitive).startsWith(comparablePrefix)) {
                    return;
                }

                job.matchedRecords.incrementAndGet();
                enqueuePrefixDeleteKey(deleteQueue, key, failure);

                if (scanned % 100_000L == 0L) {
                    job.message.set(String.format(
                            Locale.ROOT,
                            "Scanned %s · matched %s · deleted %s",
                            formatCount(job.scannedRecords.get()),
                            formatCount(job.matchedRecords.get()),
                            formatCount(job.deletedRecords.get())));
                }
            });

            job.phase.set(PrefixDeletePhase.DRAINING);
            job.message.set("Scan finished; draining remaining delete batches");
        } catch (Exception e) {
            scanFailure = e;
            log.error("Failed to delete records by key prefix jobId={} from {}.{} with prefix {}",
                    job.jobId, job.namespace, job.setName, job.keyPrefix, e);
        } finally {
            scanComplete.set(true);
            deleteWorkers.shutdown();
            try {
                if (!deleteWorkers.awaitTermination(2, TimeUnit.HOURS)) {
                    deleteWorkers.shutdownNow();
                    failure.compareAndSet(null,
                            new RuntimeException("Timed out waiting for batch deletes to finish"));
                }
            } catch (InterruptedException e) {
                deleteWorkers.shutdownNow();
                Thread.currentThread().interrupt();
                failure.compareAndSet(null, e);
            }

            stopProgressLogging.set(true);
            progressLogger.interrupt();
            try {
                progressLogger.join(1_000L);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }

            job.finishedAtEpochMs.set(System.currentTimeMillis());
            job.phase.set(PrefixDeletePhase.DONE);

            Throwable asyncFailure = failure.get() != null ? failure.get() : scanFailure;
            if (asyncFailure != null) {
                job.status.set(PrefixDeleteStatus.FAILED);
                job.message.set(asyncFailure.getMessage() == null
                        ? "Prefix delete failed"
                        : asyncFailure.getMessage());
                log.error(
                        "Prefix delete failed jobId={} scanned={} matched={} deleted={} failed={} skippedNoUserKey={} elapsedMs={}",
                        job.jobId,
                        job.scannedRecords.get(),
                        job.matchedRecords.get(),
                        job.deletedRecords.get(),
                        job.failedDeletes.get(),
                        job.skippedRecordsWithoutUserKey.get(),
                        job.finishedAtEpochMs.get() - job.startedAtEpochMs.get(),
                        asyncFailure);
            } else {
                job.status.set(PrefixDeleteStatus.COMPLETED);
                job.message.set(String.format(
                        Locale.ROOT,
                        "Completed · scanned %s · matched %s · deleted %s · failed %s",
                        formatCount(job.scannedRecords.get()),
                        formatCount(job.matchedRecords.get()),
                        formatCount(job.deletedRecords.get()),
                        formatCount(job.failedDeletes.get())));
                log.info(
                        "Prefix delete complete jobId={} on {}.{} prefix='{}' scanned={} matched={} deleted={} failed={} skippedNoUserKey={} elapsedMs={}",
                        job.jobId,
                        job.namespace,
                        job.setName == null ? "*" : job.setName,
                        job.keyPrefix,
                        job.scannedRecords.get(),
                        job.matchedRecords.get(),
                        job.deletedRecords.get(),
                        job.failedDeletes.get(),
                        job.skippedRecordsWithoutUserKey.get(),
                        job.finishedAtEpochMs.get() - job.startedAtEpochMs.get());
            }

            activePrefixDeleteJobId.compareAndSet(job.jobId, null);
        }
    }

    private static String formatCount(long value) {
        return String.format(Locale.ROOT, "%,d", value);
    }

    private void enqueuePrefixDeleteKey(
            BlockingQueue<Key> deleteQueue,
            Key key,
            AtomicReference<Throwable> failure) {
        try {
            while (!deleteQueue.offer(key, PREFIX_DELETE_OFFER_TIMEOUT_MS, TimeUnit.MILLISECONDS)) {
                Throwable asyncFailure = failure.get();
                if (asyncFailure != null) {
                    throw new RuntimeException("Prefix delete aborted", asyncFailure);
                }
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Interrupted while queueing key for prefix delete", e);
        }
    }

    private void drainPrefixDeleteQueue(
            BlockingQueue<Key> deleteQueue,
            AtomicBoolean scanComplete,
            AtomicReference<Throwable> failure,
            BatchPolicy batchPolicy,
            BatchDeletePolicy deletePolicy,
            AtomicLong deletedRecords,
            AtomicLong failedDeletes) {
        List<Key> batch = new ArrayList<>(PREFIX_DELETE_BATCH_SIZE);
        try {
            while (true) {
                if (failure.get() != null) {
                    return;
                }

                Key key = deleteQueue.poll(PREFIX_DELETE_POLL_TIMEOUT_MS, TimeUnit.MILLISECONDS);
                if (key != null) {
                    batch.add(key);
                    deleteQueue.drainTo(batch, PREFIX_DELETE_BATCH_SIZE - batch.size());
                }

                boolean shouldFlush = batch.size() >= PREFIX_DELETE_BATCH_SIZE
                        || (scanComplete.get() && !batch.isEmpty() && (key == null || deleteQueue.isEmpty()));
                if (shouldFlush) {
                    flushPrefixDeleteBatch(batch, batchPolicy, deletePolicy, deletedRecords, failedDeletes);
                    batch.clear();
                }

                if (scanComplete.get() && deleteQueue.isEmpty() && batch.isEmpty()) {
                    return;
                }
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            failure.compareAndSet(null, e);
        } catch (Exception e) {
            failure.compareAndSet(null, e);
            log.error("Prefix delete worker failed", e);
        }
    }

    private void flushPrefixDeleteBatch(
            List<Key> batch,
            BatchPolicy batchPolicy,
            BatchDeletePolicy deletePolicy,
            AtomicLong deletedRecords,
            AtomicLong failedDeletes) {
        if (batch.isEmpty()) {
            return;
        }

        Key[] keys = batch.toArray(new Key[0]);
        try {
            BatchResults results = client.delete(batchPolicy, deletePolicy, keys);
            tallyPrefixDeleteResults(results.records, deletedRecords, failedDeletes);
        } catch (AerospikeException.BatchRecordArray e) {
            tallyPrefixDeleteResults(e.records, deletedRecords, failedDeletes);
        } catch (Exception e) {
            failedDeletes.addAndGet(keys.length);
            log.warn("Batch prefix delete failed for {} keys: {}", keys.length, e.getMessage());
        }
    }

    private void tallyPrefixDeleteResults(
            BatchRecord[] records,
            AtomicLong deletedRecords,
            AtomicLong failedDeletes) {
        if (records == null) {
            return;
        }
        for (BatchRecord record : records) {
            if (record != null && record.resultCode == ResultCode.OK) {
                deletedRecords.incrementAndGet();
            } else {
                failedDeletes.incrementAndGet();
            }
        }
    }

    private enum PrefixDeleteStatus {
        QUEUED,
        RUNNING,
        COMPLETED,
        FAILED
    }

    private enum PrefixDeletePhase {
        SCANNING,
        DRAINING,
        DONE
    }

    private static final class PrefixDeleteJob {
        private final String jobId;
        private final String namespace;
        private final String setName;
        private final String keyPrefix;
        private final boolean caseSensitive;
        private final int nodeCount;
        private final int workerCount;
        private final long totalRecordsEstimate;
        private final AtomicReference<PrefixDeleteStatus> status = new AtomicReference<>(PrefixDeleteStatus.QUEUED);
        private final AtomicReference<PrefixDeletePhase> phase = new AtomicReference<>(PrefixDeletePhase.SCANNING);
        private final AtomicReference<String> message = new AtomicReference<>("Queued");
        private final AtomicLong scannedRecords = new AtomicLong();
        private final AtomicLong matchedRecords = new AtomicLong();
        private final AtomicLong deletedRecords = new AtomicLong();
        private final AtomicLong failedDeletes = new AtomicLong();
        private final AtomicLong skippedRecordsWithoutUserKey = new AtomicLong();
        private final AtomicLong startedAtEpochMs = new AtomicLong();
        private final AtomicLong finishedAtEpochMs = new AtomicLong();

        private PrefixDeleteJob(
                String jobId,
                String namespace,
                String setName,
                String keyPrefix,
                boolean caseSensitive,
                int nodeCount,
                int workerCount,
                long totalRecordsEstimate) {
            this.jobId = jobId;
            this.namespace = namespace;
            this.setName = setName;
            this.keyPrefix = keyPrefix;
            this.caseSensitive = caseSensitive;
            this.nodeCount = nodeCount;
            this.workerCount = workerCount;
            this.totalRecordsEstimate = Math.max(0L, totalRecordsEstimate);
        }

        private DeleteByKeyPrefixResponse toResponse() {
            long started = startedAtEpochMs.get();
            long finished = finishedAtEpochMs.get();
            long end = finished > 0 ? finished : System.currentTimeMillis();
            return DeleteByKeyPrefixResponse.builder()
                    .jobId(jobId)
                    .status(status.get().name())
                    .phase(phase.get().name())
                    .message(message.get())
                    .namespace(namespace)
                    .setName(setName)
                    .keyPrefix(keyPrefix)
                    .caseSensitive(caseSensitive)
                    .totalRecordsEstimate(totalRecordsEstimate > 0 ? totalRecordsEstimate : null)
                    .scannedRecords(scannedRecords.get())
                    .matchedRecords(matchedRecords.get())
                    .deletedRecords(deletedRecords.get())
                    .failedDeletes(failedDeletes.get())
                    .skippedRecordsWithoutUserKey(skippedRecordsWithoutUserKey.get())
                    .workerCount(workerCount)
                    .nodeCount(nodeCount)
                    .startedAtEpochMs(started > 0 ? started : null)
                    .finishedAtEpochMs(finished > 0 ? finished : null)
                    .elapsedMs(started > 0 ? Math.max(0L, end - started) : 0L)
                    .build();
        }
    }

    private long estimateRecordsForScope(String namespace, String setName) {
        try {
            if (setName != null) {
                return getSets(namespace).stream()
                        .filter(set -> setName.equals(set.getSetName()))
                        .map(SetInfo::getObjectCount)
                        .filter(Objects::nonNull)
                        .findFirst()
                        .orElse(0L);
            }

            long setTotal = getSets(namespace).stream()
                    .map(SetInfo::getObjectCount)
                    .filter(Objects::nonNull)
                    .reduce(0L, Long::sum);
            if (setTotal > 0) {
                return setTotal;
            }

            return getNamespaces().stream()
                    .filter(ns -> namespace.equals(ns.getName()))
                    .map(NamespaceInfo::getMasterObjects)
                    .filter(Objects::nonNull)
                    .findFirst()
                    .orElse(0L);
        } catch (Exception e) {
            log.warn("Could not estimate record count for {}.{}: {}", namespace, setName, e.getMessage());
            return 0L;
        }
    }

    public RecordData getRecord(String namespace, String setName, String keyValue) {
        ensureConnected();

        try {
            Key key = new Key(namespace, setName, keyValue);
            com.aerospike.client.Record record = client.get(null, key);

            if (record == null) {
                return null;
            }

            return RecordData.builder()
                    .namespace(namespace)
                    .setName(setName)
                    .key(keyValue)
                    .bins(record.bins)
                    .generation(record.generation)
                    .expiration(record.expiration)
                    .ttl(record.getTimeToLive())
                    .build();
        } catch (Exception e) {
            log.error("Failed to get record", e);
            throw new RuntimeException("Failed to get record: " + e.getMessage(), e);
        }
    }

    public RecordData putRecord(RecordData recordData) {
        ensureConnected();

        try {
            Key key = new Key(recordData.getNamespace(), recordData.getSetName(), recordData.getKey().toString());

            WritePolicy writePolicy = new WritePolicy();
            if (recordData.getTtl() != null) {
                writePolicy.expiration = recordData.getTtl();
            }

            Bin[] bins = recordData.getBins().entrySet().stream()
                    .map(entry -> new Bin(entry.getKey(), Value.get(entry.getValue())))
                    .toArray(Bin[]::new);

            client.put(writePolicy, key, bins);

            // Retrieve the updated record
            return getRecord(recordData.getNamespace(), recordData.getSetName(), recordData.getKey().toString());
        } catch (Exception e) {
            log.error("Failed to put record", e);
            throw new RuntimeException("Failed to put record: " + e.getMessage(), e);
        }
    }

    public boolean deleteRecord(String namespace, String setName, String keyValue) {
        ensureConnected();

        try {
            Key key = new Key(namespace, setName, keyValue);
            return client.delete(null, key);
        } catch (Exception e) {
            log.error("Failed to delete record", e);
            throw new RuntimeException("Failed to delete record: " + e.getMessage(), e);
        }
    }

    private Host[] resolveHosts(ConnectionRequest request) {
        Integer defaultPort = request.getPort() != null ? request.getPort() : 3000;
        List<String> seedValues = new ArrayList<>();

        if (request.getHosts() != null) {
            request.getHosts().stream()
                    .filter(Objects::nonNull)
                    .flatMap(value -> Arrays.stream(value.split(",")))
                    .map(String::trim)
                    .filter(value -> !value.isBlank())
                    .forEach(seedValues::add);
        }

        if (seedValues.isEmpty() && request.getHost() != null && !request.getHost().isBlank()) {
            Arrays.stream(request.getHost().split(","))
                    .map(String::trim)
                    .filter(value -> !value.isBlank())
                    .forEach(seedValues::add);
        }

        if (seedValues.isEmpty()) {
            seedValues.add("localhost");
        }

        return seedValues.stream()
                .map(seed -> parseHostSeed(seed, defaultPort))
                .toArray(Host[]::new);
    }

    private Host parseHostSeed(String seed, Integer defaultPort) {
        String host = seed;
        int port = defaultPort != null ? defaultPort : 3000;

        int portSeparator = seed.lastIndexOf(':');
        if (portSeparator > 0 && portSeparator < seed.length() - 1) {
            host = seed.substring(0, portSeparator);
            try {
                port = Integer.parseInt(seed.substring(portSeparator + 1));
            } catch (NumberFormatException ignored) {
                host = seed;
            }
        }

        return new Host(host, port);
    }

    private Node firstNode() {
        Node[] nodes = client.getNodes();
        if (nodes.length == 0) {
            throw new RuntimeException("No active Aerospike nodes are available");
        }
        return nodes[0];
    }

    private Node resolveNode(String nodeName) {
        if (nodeName == null || nodeName.isBlank()) {
            return firstNode();
        }

        return Arrays.stream(client.getNodes())
                .filter(node -> nodeName.equals(node.getName()) || nodeName.equals(node.getHost().toString()))
                .findFirst()
                .orElseGet(this::firstNode);
    }

    private String requestInfo(Node node, String command) {
        try {
            return Info.request(node, command);
        } catch (Exception e) {
            log.debug("Info command {} failed for node {}", command, node.getName(), e);
            return null;
        }
    }

    private Map<String, Object> requestInfoMap(Node node, String command) {
        return parseInfoString(requestInfo(node, command));
    }

    private Map<String, Object> mergeNodeStatistics(List<NodeInfo> nodes) {
        Map<String, Object> merged = new TreeMap<>();
        if (nodes == null) {
            return merged;
        }

        for (NodeInfo node : nodes) {
            if (node.getStatistics() == null) {
                continue;
            }
            node.getStatistics().forEach((key, value) -> merged.putIfAbsent(key, value));
        }
        return merged;
    }

    private String firstString(Map<String, Object> data, String... keys) {
        for (String key : keys) {
            Object value = data.get(key);
            if (value != null) {
                return value.toString();
            }
        }
        return null;
    }

    private Object firstNonNull(Map<String, Object> data, String... keys) {
        for (String key : keys) {
            Object value = data.get(key);
            if (value != null) {
                return value;
            }
        }
        return null;
    }

    private long nullToZero(Long value) {
        return value == null ? 0L : value;
    }

    private long resolveReplicationFactor(String namespace, Node[] nodes) {
        for (Node node : nodes) {
            Map<String, Object> config = requestInfoMap(node, "namespace/" + namespace);
            Long replicationFactor = parseLong(config.get("replication-factor"));
            if (replicationFactor != null && replicationFactor > 0) {
                return replicationFactor;
            }
        }
        return 1L;
    }

    private static final class NamespaceAggregate {
        private long masterObjects;
        private Long replicationFactor;
        private String storageEngine;
        private Map<String, Object> config;
    }

    private static final class SetAggregate {
        private long masterObjects;
        private long objectCopies;
        private long memoryDataBytes;
        private long deviceDataBytes;
        private boolean hasMasterObjects;
    }

    private String describeValueType(Object value) {
        if (value == null) {
            return "null";
        }
        if (value instanceof byte[]) {
            return "bytes";
        }
        if (value instanceof List<?>) {
            return "list";
        }
        if (value instanceof Map<?, ?>) {
            return "map";
        }
        if (value instanceof Number) {
            return "number";
        }
        if (value instanceof Boolean) {
            return "boolean";
        }
        return "string";
    }

    private static class MutableBinSummary {
        private int recordsWithBin;
        private final Map<String, Integer> typeCounts = new TreeMap<>();
        private final List<String> sampleValues = new ArrayList<>();
    }

    private void ensureConnected() {
        if (client == null || !client.isConnected()) {
            throw new RuntimeException("Not connected to Aerospike. Please connect first.");
        }
    }

    private void validateNamespace(String namespace) {
        if (namespace == null || namespace.isBlank()) {
            throw new IllegalArgumentException("Namespace is required");
        }
    }

    private void validateConcreteSetName(String setName) {
        if (setName == null || setName.isBlank()) {
            throw new IllegalArgumentException("Set name is required");
        }
        if ("ALL".equalsIgnoreCase(setName) || "*".equals(setName)) {
            throw new IllegalArgumentException("Deleting all sets from a namespace is not supported");
        }
    }

    private String normalizeSetName(String setName) {
        if (setName == null || setName.isBlank() || "ALL".equalsIgnoreCase(setName) || "*".equals(setName)) {
            return null;
        }
        return setName;
    }

    private int clamp(Integer value, int defaultValue, int min, int max) {
        int resolved = value != null ? value : defaultValue;
        return Math.max(min, Math.min(max, resolved));
    }

    private RecordData toRecordData(Key key, com.aerospike.client.Record record) {
        return RecordData.builder()
                .namespace(key.namespace)
                .setName(key.setName)
                .key(key.userKey != null ? key.userKey.getObject() : key.digest)
                .bins(record.bins)
                .generation(record.generation)
                .expiration(record.expiration)
                .ttl(record.getTimeToLive())
                .build();
    }

    private boolean recordMatches(
            Key key,
            com.aerospike.client.Record record,
            String pattern,
            SearchRequest.SearchType searchType,
            SearchRequest.SearchField searchField,
            boolean caseSensitive) {
        if (pattern == null || pattern.isBlank()) {
            return true;
        }

        Stream<String> searchableValues = switch (searchField) {
            case KEY -> Stream.of(formatKey(key));
            case BIN_NAME -> record.bins == null ? Stream.empty() : record.bins.keySet().stream();
            case BIN_VALUE -> record.bins == null ? Stream.empty()
                    : record.bins.values().stream().map(this::stringifyValue);
            case ALL -> Stream.concat(
                    Stream.of(formatKey(key), key.namespace, key.setName),
                    record.bins == null ? Stream.empty()
                            : Stream.concat(record.bins.keySet().stream(),
                                    record.bins.values().stream().map(this::stringifyValue)));
        };

        return searchableValues
                .filter(Objects::nonNull)
                .anyMatch(value -> textMatches(value, pattern, searchType, caseSensitive));
    }

    private String formatKey(Key key) {
        return key.userKey != null ? String.valueOf(key.userKey.getObject()) : Arrays.toString(key.digest);
    }

    private String formatDigest(byte[] digest) {
        return digest == null ? "" : Arrays.toString(digest);
    }

    private String stringifyValue(Object value) {
        if (value == null) {
            return "";
        }
        if (value instanceof byte[] bytes) {
            return Arrays.toString(bytes);
        }
        return String.valueOf(value);
    }

    private boolean textMatches(String value, String pattern, SearchRequest.SearchType searchType, boolean caseSensitive) {
        String haystack = normalizeComparableText(value, caseSensitive);
        String needle = normalizeComparableText(pattern, caseSensitive);

        return switch (searchType) {
            case EXACT -> haystack.equals(needle);
            case PREFIX -> haystack.startsWith(needle);
            case SUFFIX -> haystack.endsWith(needle);
            case CONTAINS -> haystack.contains(needle);
        };
    }

    private String normalizeComparableText(String value, boolean caseSensitive) {
        return caseSensitive ? value : value.toLowerCase(Locale.ROOT);
    }

    private Map<String, Object> parseInfoString(String infoStr) {
        Map<String, Object> result = new HashMap<>();
        if (infoStr == null || infoStr.isEmpty()) {
            return result;
        }

        String[] pairs = infoStr.split("[:;]");
        for (String pair : pairs) {
            String[] kv = pair.split("=", 2);
            if (kv.length == 2) {
                result.put(kv[0], kv[1]);
            }
        }
        return result;
    }

    private Long parseLong(Object value) {
        if (value == null)
            return null;
        try {
            return Long.parseLong(value.toString());
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
