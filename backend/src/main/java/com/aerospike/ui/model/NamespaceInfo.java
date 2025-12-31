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
public class NamespaceInfo {
    private String name;
    private Long masterObjects;
    private Long replicationFactor;
    private String storageEngine;
    private Map<String, Object> config;
}
