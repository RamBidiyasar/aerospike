import axios from 'axios';

const API_BASE_URL = 'http://localhost:8080/api';

const apiClient = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
    withCredentials: true,
});

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
        apiClient.get(`/namespaces/${namespace}/sets`),
};

// Record API
export const recordAPI = {
    scanRecords: (namespace, setName, maxRecords = 100) =>
        apiClient.get('/records/scan', {
            params: { namespace, setName, maxRecords },
        }),

    searchRecords: (searchRequest) =>
        apiClient.post('/records/search', searchRequest),

    getRecord: (namespace, setName, key) =>
        apiClient.get(`/records/${namespace}/${setName}/${key}`),

    putRecord: (recordData) =>
        apiClient.post('/records', recordData),

    deleteRecord: (namespace, setName, key) =>
        apiClient.delete(`/records/${namespace}/${setName}/${key}`),
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
