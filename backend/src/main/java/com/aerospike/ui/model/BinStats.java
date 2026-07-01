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
public class BinStats {
    private String namespace;
    private String setName;
    private Integer scannedRecords;
    private List<BinSummary> bins;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class BinSummary {
        private String name;
        private Integer recordsWithBin;
        private Double coveragePercent;
        private Map<String, Integer> typeCounts;
        private List<String> sampleValues;
    }
}
