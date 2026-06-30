import axios from 'axios';

const API_BASE_URL = 'http://localhost:8080/api';

const apiClient = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
    withCredentials: true,
});

const encodePathSegment = (value) => encodeURIComponent(String(value));

// Connection API
export const connectionAPI = {
    connect: (host, port, username, password) =>
        apiClient.post('/connect', { host, port, username, password }),

    disconnect: () =>
        apiClient.post('/disconnect'),

    getClusterInfo: () =>
        apiClient.get('/cluster-info'),
};

// Namespace API
export const namespaceAPI = {
    getNamespaces: () =>
        apiClient.get('/namespaces'),

    getSets: (namespace) =>
        apiClient.get(`/namespaces/${encodePathSegment(namespace)}/sets`),

    deleteSet: (namespace, setName) =>
        apiClient.delete(`/namespaces/${encodePathSegment(namespace)}/sets/${encodePathSegment(setName)}`),
};

// Record API
export const recordAPI = {
    scanRecords: (namespace, setName, maxRecords = 100) => {
        const params = { namespace, maxRecords };
        if (setName) {
            params.setName = setName;
        }
        return apiClient.get('/records/scan', { params });
    },

    searchRecords: (searchRequest) =>
        apiClient.post('/records/search', searchRequest),

    getRecord: (namespace, setName, key) =>
        apiClient.get(`/records/${encodePathSegment(namespace)}/${encodePathSegment(setName)}/${encodePathSegment(key)}`),

    putRecord: (recordData) =>
        apiClient.post('/records', recordData),

    deleteRecord: (namespace, setName, key) =>
        apiClient.delete(`/records/${encodePathSegment(namespace)}/${encodePathSegment(setName)}/${encodePathSegment(key)}`),
};

// Error interceptor
apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
        const errorMessage = error.response?.data?.error || error.message || 'An error occurred';
        return Promise.reject(new Error(errorMessage));
    }
);

export default apiClient;
