package com.aerospike.ui.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ScanRequest {
    private String namespace;
    private String setName;
    private Integer maxRecords = 100;
}
