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
public class AerospikeIndexInfo {
    private String namespace;
    private String setName;
    private String indexName;
    private String binName;
    private String type;
    private String collectionType;
    private String state;
    private String syncState;
    private Map<String, Object> raw;
}
