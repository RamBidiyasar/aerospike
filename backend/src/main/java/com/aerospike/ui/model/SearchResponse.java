package com.aerospike.ui.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SearchResponse {
    @Builder.Default
    private List<RecordData> records = new ArrayList<>();
    /** Total matches found within the scan window (may exceed records.size()). */
    private Long matchedTotal;
    private Long scannedRecords;
    private Integer maxResults;
    /** True when the scan covered the full selected scope (no maxRecords cap). */
    private Boolean fullScan;
    /** True when matchedTotal exceeds the returned sample size. */
    private Boolean truncated;
}
