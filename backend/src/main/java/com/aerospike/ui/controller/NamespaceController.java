package com.aerospike.ui.controller;

import com.aerospike.ui.model.NamespaceInfo;
import com.aerospike.ui.model.SetInfo;
import com.aerospike.ui.service.AerospikeService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class NamespaceController {

    private final AerospikeService aerospikeService;

    @GetMapping("/namespaces")
    public ResponseEntity<List<NamespaceInfo>> getNamespaces() {
        List<NamespaceInfo> namespaces = aerospikeService.getNamespaces();
        return ResponseEntity.ok(namespaces);
    }

    @GetMapping("/namespaces/{namespace}/sets")
    public ResponseEntity<List<SetInfo>> getSets(@PathVariable String namespace) {
        List<SetInfo> sets = aerospikeService.getSets(namespace);
        return ResponseEntity.ok(sets);
    }
}
