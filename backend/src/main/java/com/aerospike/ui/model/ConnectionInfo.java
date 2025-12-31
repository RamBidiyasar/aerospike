package com.aerospike.ui.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ConnectionInfo {
    private boolean connected;
    private String clusterName;
    private List<NodeInfo> nodes;
    private String message;
}
