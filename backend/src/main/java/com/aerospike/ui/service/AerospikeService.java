package com.aerospike.ui.service;

import com.aerospike.client.*;
import com.aerospike.client.Info;
import com.aerospike.client.cluster.Node;
import com.aerospike.client.policy.ClientPolicy;
import com.aerospike.client.policy.ScanPolicy;
import com.aerospike.client.policy.WritePolicy;
import com.aerospike.ui.model.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
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

            Node node = nodes[0];
            String namespacesStr = Info.request(node, "namespaces");
            String[] namespaces = namespacesStr.split(";");

            List<NamespaceInfo> namespaceInfoList = new ArrayList<>();
            for (String namespace : namespaces) {
                if (namespace.isEmpty())
                    continue;

                String nsInfo = Info.request(node, "namespace/" + namespace);
                Map<String, Object> config = parseInfoString(nsInfo);

                namespaceInfoList.add(NamespaceInfo.builder()
                        .name(namespace)
                        .masterObjects(parseLong(config.get("master-objects")))
                        .replicationFactor(parseLong(config.get("replication-factor")))
                        .storageEngine((String) config.get("storage-engine"))
                        .config(config)
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

            Node node = nodes[0];
            String setsInfo = Info.request(node, "sets/" + namespace);

            if (setsInfo == null || setsInfo.isEmpty()) {
                return Collections.emptyList();
            }

            List<SetInfo> setInfoList = new ArrayList<>();
            String[] sets = setsInfo.split(";");

            for (String setStr : sets) {
                if (setStr.isEmpty())
                    continue;

                Map<String, Object> setData = parseInfoString(setStr);
                String setName = (String) setData.get("set");

                if (setName != null) {
                    setInfoList.add(SetInfo.builder()
                            .namespace(namespace)
                            .setName(setName)
                            .objectCount(parseLong(setData.get("objects")))
                            .memoryDataBytes(parseLong(setData.get("memory_data_bytes")))
                            .deviceDataBytes(parseLong(setData.get("device_data_bytes")))
                            .build());
                }
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
        String haystack = caseSensitive ? value : value.toLowerCase(Locale.ROOT);
        String needle = caseSensitive ? pattern : pattern.toLowerCase(Locale.ROOT);

        return switch (searchType) {
            case EXACT -> haystack.equals(needle);
            case PREFIX -> haystack.startsWith(needle);
            case SUFFIX -> haystack.endsWith(needle);
            case CONTAINS -> haystack.contains(needle);
        };
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
