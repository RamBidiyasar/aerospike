package com.aerospike.ui.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SetInfo {
    private String namespace;
    private String setName;
    private Long objectCount;
    private Long memoryDataBytes;
}
