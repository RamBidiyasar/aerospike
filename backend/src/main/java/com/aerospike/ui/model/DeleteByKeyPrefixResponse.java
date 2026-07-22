package com.aerospike.ui.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DeleteByKeyPrefixResponse {
    private String jobId;
    /** QUEUED, RUNNING, COMPLETED, FAILED */
    private String status;
    /** SCANNING, DRAINING, DONE */
    private String phase;
    private String message;
    private String namespace;
    private String setName;
    private String keyPrefix;
    private Boolean caseSensitive;
    private Long totalRecordsEstimate;
    private Long scannedRecords;
    private Long matchedRecords;
    private Long deletedRecords;
    private Long failedDeletes;
    private Long skippedRecordsWithoutUserKey;
    private Integer workerCount;
    private Integer nodeCount;
    private Long startedAtEpochMs;
    private Long finishedAtEpochMs;
    private Long elapsedMs;
}
