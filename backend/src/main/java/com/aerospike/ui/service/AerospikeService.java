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

            String host = request.getHost() != null ? request.getHost() : "localhost";
            Integer port = request.getPort() != null ? request.getPort() : 3000;

            ClientPolicy policy = new ClientPolicy();
            if (request.getUsername() != null && request.getPassword() != null) {
                policy.user = request.getUsername();
                policy.password = request.getPassword();
            }

            Host[] hosts = new Host[] { new Host(host, port) };
            client = new AerospikeClient(policy, hosts);

            // Store connection info
            connectionMetadata.put("host", host);
            connectionMetadata.put("port", port);

            return getConnectionInfo();
        } catch (Exception e) {
            System.out.println(e.getMessage());
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
                nodeInfoList.add(NodeInfo.builder()
                        .name(node.getName())
                        .address(node.getHost().toString())
                        .active(node.isActive())
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

        String[] pairs = infoStr.split(":");
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
