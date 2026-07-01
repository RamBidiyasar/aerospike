package com.aerospike.ui.controller;

import com.aerospike.ui.model.AerospikeIndexInfo;
import com.aerospike.ui.model.BinStats;
import com.aerospike.ui.model.ClusterOverview;
import com.aerospike.ui.model.InfoCommandRequest;
import com.aerospike.ui.model.InfoCommandResponse;
import com.aerospike.ui.model.UdfModuleInfo;
import com.aerospike.ui.service.AerospikeService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/ops")
@RequiredArgsConstructor
public class OperationalController {

    private final AerospikeService aerospikeService;

    @GetMapping("/cluster-overview")
    public ResponseEntity<ClusterOverview> getClusterOverview() {
        return ResponseEntity.ok(aerospikeService.getClusterOverview());
    }

    @GetMapping("/indexes")
    public ResponseEntity<List<AerospikeIndexInfo>> getSecondaryIndexes(
            @RequestParam(required = false) String namespace,
            @RequestParam(required = false) String setName) {
        return ResponseEntity.ok(aerospikeService.getSecondaryIndexes(namespace, setName));
    }

    @GetMapping("/udfs")
    public ResponseEntity<List<UdfModuleInfo>> getUdfs() {
        return ResponseEntity.ok(aerospikeService.getUdfs());
    }

    @PostMapping("/info")
    public ResponseEntity<InfoCommandResponse> runInfoCommand(@RequestBody InfoCommandRequest request) {
        return ResponseEntity.ok(aerospikeService.runInfoCommand(request));
    }

    @GetMapping("/bin-stats")
    public ResponseEntity<BinStats> getBinStats(
            @RequestParam String namespace,
            @RequestParam(required = false) String setName,
            @RequestParam(required = false, defaultValue = "100") Integer maxRecords) {
        return ResponseEntity.ok(aerospikeService.getBinStats(namespace, setName, maxRecords));
    }
}
