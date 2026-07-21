package com.aerospike.ui.model;

import lombok.Data;

@Data
public class DeleteByKeyPrefixRequest {
    private String namespace;
    private String setName;
    private String keyPrefix;
    private Boolean caseSensitive = true;
}
