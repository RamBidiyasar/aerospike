package com.aerospike.ui.controller;

import com.aerospike.ui.model.RecordData;
import com.aerospike.ui.model.SearchRequest;
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
            @RequestParam String setName,
            @RequestParam(required = false, defaultValue = "100") Integer maxRecords) {
        List<RecordData> records = aerospikeService.scanRecords(namespace, setName, maxRecords);
        return ResponseEntity.ok(records);
    }

    @PostMapping("/search")
    public ResponseEntity<List<RecordData>> searchRecords(@RequestBody SearchRequest searchRequest) {
        List<RecordData> records = aerospikeService.searchRecords(searchRequest);
        return ResponseEntity.ok(records);
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
}
