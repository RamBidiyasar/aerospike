package com.aerospike.ui.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ConnectionRequest {
    private String host;
    private List<String> hosts;
    private Integer port;
    private String username;
    private String password;
    private Integer timeout;
    private Integer maxRetries;
    private Integer maxConnsPerNode;
}
