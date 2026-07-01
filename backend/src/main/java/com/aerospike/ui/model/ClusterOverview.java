package com.aerospike.ui.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ClusterOverview {
    private ConnectionInfo connection;
    private Integer nodeCount;
    private Integer activeNodeCount;
    private Integer namespaceCount;
    private Integer setCount;
    private Long totalObjects;
    private Long totalMemoryDataBytes;
    private Long totalDeviceDataBytes;
    private List<NamespaceInfo> namespaces;
    private List<SetInfo> sets;
    private List<NodeInfo> nodes;
    private Map<String, Object> clusterStatistics;
}
