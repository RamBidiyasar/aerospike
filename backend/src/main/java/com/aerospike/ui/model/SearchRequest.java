package com.aerospike.ui.model;

import lombok.Data;

@Data
public class SearchRequest {
    private String namespace;
    private String setName;
    private String searchPattern;
    private SearchType searchType = SearchType.CONTAINS;
    private SearchField searchField = SearchField.ALL;
    private Boolean caseSensitive = false;
    private Integer maxResults = 100;
    private Integer maxScanRecords = 5000;

    public enum SearchType {
        EXACT,
        PREFIX,
        SUFFIX,
        CONTAINS
    }

    public enum SearchField {
        ALL,
        KEY,
        BIN_NAME,
        BIN_VALUE
    }
}
