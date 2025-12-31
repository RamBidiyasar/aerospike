const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
let aerospike;
try {
    aerospike = require('aerospike');
} catch (e) {
    console.warn('Aerospike module not found. Running in mock mode.');
}

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Placeholder for Aerospike client
let client = null;

app.get('/', (req, res) => {
    res.send('Aerospike GUI Backend is running');
});

// Connect to Aerospike
app.post('/api/connect', async (req, res) => {
    const { hosts, port } = req.body;
    try {
        const config = {
            hosts: [{ addr: hosts || '127.0.0.1', port: parseInt(port) || 3000 }]
        };

        if (client) {
            client.close();
        }

        if (!aerospike) {
            throw new Error('Aerospike client not installed');
        }
        client = await aerospike.connect(config);
        res.json({ status: 'connected', message: 'Successfully connected to Aerospike' });
    } catch (error) {
        console.error('Connection error:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
