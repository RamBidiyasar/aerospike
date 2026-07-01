package com.aerospike.ui.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class InfoCommandResponse {
    private String command;
    private String nodeName;
    private String raw;
    private Map<String, Object> parsed;
}
