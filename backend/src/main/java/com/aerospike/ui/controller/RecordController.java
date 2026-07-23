package com.aerospike.ui.controller;

import com.aerospike.ui.model.DeleteByKeyPrefixRequest;
import com.aerospike.ui.model.DeleteByKeyPrefixResponse;
import com.aerospike.ui.model.KeyPatternJobRequest;
import com.aerospike.ui.model.KeyPatternJobResponse;
import com.aerospike.ui.model.RecordData;
import com.aerospike.ui.model.SearchRequest;
import com.aerospike.ui.model.SearchResponse;
import com.aerospike.ui.service.AerospikeService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/records")
@RequiredArgsConstructor
public class RecordController {

    private final AerospikeService aerospikeService;

    @GetMapping("/scan")
    public ResponseEntity<List<RecordData>> scanRecords(
            @RequestParam String namespace,
            @RequestParam(required = false) String setName,
            @RequestParam(required = false, defaultValue = "100") Integer maxRecords) {
        List<RecordData> records = aerospikeService.scanRecords(namespace, setName, maxRecords);
        return ResponseEntity.ok(records);
    }

    @PostMapping("/search")
    public ResponseEntity<SearchResponse> searchRecords(@RequestBody SearchRequest searchRequest) {
        return ResponseEntity.ok(aerospikeService.searchRecords(searchRequest));
    }

    @PostMapping("/key-pattern-jobs")
    public ResponseEntity<KeyPatternJobResponse> startKeyPatternJob(
            @RequestBody KeyPatternJobRequest request) {
        KeyPatternJobResponse response = aerospikeService.startKeyPatternJob(request);
        return ResponseEntity.accepted().body(response);
    }

    @GetMapping("/key-pattern-jobs/{jobId}")
    public ResponseEntity<KeyPatternJobResponse> getKeyPatternJobStatus(
            @PathVariable String jobId) {
        return ResponseEntity.ok(aerospikeService.getKeyPatternJobStatus(jobId));
    }

    @PostMapping("/key-pattern-jobs/{jobId}/cancel")
    public ResponseEntity<KeyPatternJobResponse> cancelKeyPatternJob(
            @PathVariable String jobId) {
        return ResponseEntity.ok(aerospikeService.cancelKeyPatternJob(jobId));
    }

    /** @deprecated Prefer POST /key-pattern-jobs with mode=DELETE and searchType=PREFIX. */
    @PostMapping("/delete-by-key-prefix")
    public ResponseEntity<DeleteByKeyPrefixResponse> deleteByKeyPrefix(
            @RequestBody DeleteByKeyPrefixRequest request) {
        KeyPatternJobRequest jobRequest = new KeyPatternJobRequest();
        jobRequest.setNamespace(request.getNamespace());
        jobRequest.setSetName(request.getSetName());
        jobRequest.setPattern(request.getKeyPrefix());
        jobRequest.setSearchType(SearchRequest.SearchType.PREFIX);
        jobRequest.setCaseSensitive(request.getCaseSensitive());
        jobRequest.setMode(KeyPatternJobRequest.Mode.DELETE);

        KeyPatternJobResponse jobResponse = aerospikeService.startKeyPatternJob(jobRequest);
        return ResponseEntity.accepted().body(toLegacyPrefixResponse(jobResponse));
    }

    /** @deprecated Prefer GET /key-pattern-jobs/{jobId}. */
    @GetMapping("/delete-by-key-prefix/{jobId}")
    public ResponseEntity<DeleteByKeyPrefixResponse> getDeleteByKeyPrefixStatus(
            @PathVariable String jobId) {
        return ResponseEntity.ok(toLegacyPrefixResponse(aerospikeService.getKeyPatternJobStatus(jobId)));
    }

    @GetMapping("/{namespace}/{setName}/{key}")
    public ResponseEntity<RecordData> getRecord(
            @PathVariable String namespace,
            @PathVariable String setName,
            @PathVariable String key) {
        RecordData record = aerospikeService.getRecord(namespace, setName, key);
        if (record == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(record);
    }

    @PostMapping
    public ResponseEntity<RecordData> putRecord(@RequestBody RecordData recordData) {
        RecordData saved = aerospikeService.putRecord(recordData);
        return ResponseEntity.ok(saved);
    }

    @DeleteMapping("/{namespace}/{setName}/{key}")
    public ResponseEntity<Map<String, Boolean>> deleteRecord(
            @PathVariable String namespace,
            @PathVariable String setName,
            @PathVariable String key) {
        boolean deleted = aerospikeService.deleteRecord(namespace, setName, key);
        return ResponseEntity.ok(Map.of("deleted", deleted));
    }

    private static DeleteByKeyPrefixResponse toLegacyPrefixResponse(KeyPatternJobResponse job) {
        return DeleteByKeyPrefixResponse.builder()
                .jobId(job.getJobId())
                .status(job.getStatus())
                .phase(job.getPhase())
                .message(job.getMessage())
                .namespace(job.getNamespace())
                .setName(job.getSetName())
                .keyPrefix(job.getPattern())
                .caseSensitive(job.getCaseSensitive())
                .totalRecordsEstimate(job.getTotalRecordsEstimate())
                .scannedRecords(job.getScannedRecords())
                .matchedRecords(job.getMatchedRecords())
                .deletedRecords(job.getDeletedRecords())
                .failedDeletes(job.getFailedDeletes())
                .skippedRecordsWithoutUserKey(job.getSkippedRecordsWithoutUserKey())
                .workerCount(job.getWorkerCount())
                .nodeCount(job.getNodeCount())
                .startedAtEpochMs(job.getStartedAtEpochMs())
                .finishedAtEpochMs(job.getFinishedAtEpochMs())
                .elapsedMs(job.getElapsedMs())
                .build();
    }
}
