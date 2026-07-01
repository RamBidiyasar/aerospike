package com.aerospike.ui.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class NodeInfo {
    private String name;
    private String address;
    private boolean active;
    private String build;
    private String edition;
    private Long uptimeSeconds;
    private Map<String, Object> statistics;
}
