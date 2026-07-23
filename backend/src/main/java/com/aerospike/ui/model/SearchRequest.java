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
    /**
     * Max records to scan while searching. Use {@code 0} or a negative value to scan the
     * entire selected scope (no cap). Null uses the service default.
     */
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
