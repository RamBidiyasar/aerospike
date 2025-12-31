package com.aerospike.ui.controller;

import com.aerospike.ui.model.ConnectionInfo;
import com.aerospike.ui.model.ConnectionRequest;
import com.aerospike.ui.service.AerospikeService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class ConnectionController {

    private final AerospikeService aerospikeService;

    @PostMapping("/connect")
    public ResponseEntity<ConnectionInfo> connect(@RequestBody ConnectionRequest request) {
        ConnectionInfo info = aerospikeService.connect(request);
        return ResponseEntity.ok(info);
    }

    @PostMapping("/disconnect")
    public ResponseEntity<Void> disconnect() {
        aerospikeService.disconnect();
        return ResponseEntity.ok().build();
    }

    @GetMapping("/cluster-info")
    public ResponseEntity<ConnectionInfo> getClusterInfo() {
        ConnectionInfo info = aerospikeService.getConnectionInfo();
        return ResponseEntity.ok(info);
    }
}
