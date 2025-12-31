package com.aerospike.ui.model;

import lombok.Data;

@Data
public class SearchRequest {
    private String namespace;
    private String setName;
    private String searchPattern;
    private SearchType searchType;
    private Integer maxResults = 100;

    public enum SearchType {
        EXACT,
        PREFIX,
        SUFFIX,
        CONTAINS
    }
}
