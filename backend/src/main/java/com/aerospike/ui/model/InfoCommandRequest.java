package com.aerospike.ui.model;

import lombok.Data;

@Data
public class InfoCommandRequest {
    private String command;
    private String nodeName;
}
