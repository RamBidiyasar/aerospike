package com.aerospike.ui.model;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class DeleteByKeyPrefixResponse {
    private String namespace;
    private String setName;
    private String keyPrefix;
    private Boolean caseSensitive;
    private Long scannedRecords;
    private Long matchedRecords;
    private Long deletedRecords;
    private Long failedDeletes;
    private Long skippedRecordsWithoutUserKey;
}
