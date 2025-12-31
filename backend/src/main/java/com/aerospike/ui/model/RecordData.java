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
public class RecordData {
    private String namespace;
    private String setName;
    private Object key;
    private Map<String, Object> bins;
    private Integer generation;
    private Integer expiration;
    private Integer ttl;
}
