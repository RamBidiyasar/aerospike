package com.aerospike.ui.model;

import lombok.Data;

@Data
public class KeyPatternJobRequest {
    private String namespace;
    private String setName;
    private String pattern;
    private SearchRequest.SearchType searchType = SearchRequest.SearchType.PREFIX;
    private Boolean caseSensitive = true;
    private Mode mode = Mode.DELETE;

    public enum Mode {
        COUNT,
        DELETE
    }
}
