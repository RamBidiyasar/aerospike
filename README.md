# Aerospike Database Manager

A modern, premium database management UI for Aerospike - similar to MongoDB Compass and TablePlus.

## Features

- 🚀 **Modern Stack**: Java 21 + Spring Boot backend, React 19 + Vite frontend
- 🎨 **Premium UI**: Dark theme with glassmorphism effects and smooth animations
- 🔌 **Full CRUD**: Complete record management (Create, Read, Update, Delete)
- 🌐 **Multi-node Support**: Connect to Aerospike clusters with multiple nodes
- 🔍 **Data Browsing**: Tree view for namespaces and sets, table view for records
- ✏️ **JSON Editor**: Edit record bins with syntax validation
- 📊 **Cluster Info**: Real-time cluster and node health status

## Quick Start

### Prerequisites

- Java 21+
- Node.js 18+
- Maven 3.9+
- Access to Aerospike cluster

### Easy Start (Recommended)

Use the startup script to run both backend and frontend together:

```bash
./start.sh
```

This will start:
- **Backend** on http://localhost:8080
- **Frontend** on http://localhost:5173

Press `CTRL+C` to stop both services.

Logs are saved to `backend.log` and `frontend.log`.

### Manual Setup

#### Backend

```bash
cd backend
./mvnw spring-boot:run
```

Backend runs on http://localhost:8080

#### Frontend

```bash
cd ui
npm install
npm run dev
```

Frontend runs on http://localhost:5173

## Configuration

Backend configuration is in `backend/src/main/resources/application.yml`:

```yaml
aerospike:
  hosts: 10.249.218.92:3000,10.249.218.94:3000,10.249.218.93:3000
  user: appuser
  password: m}0"Uiu27`zX
  namespace: ucm_dev
```

Update these values for your Aerospike cluster.

## Project Structure

```
.
├── backend/              # Java 21 Spring Boot backend
│   ├── src/
│   │   └── main/
│   │       ├── java/com/aerospike/ui/
│   │       │   ├── controller/     # REST API controllers
│   │       │   ├── service/        # Aerospike service layer
│   │       │   ├── model/          # DTOs
│   │       │   └── config/         # Configuration
│   │       └── resources/
│   │           └── application.yml
│   └── pom.xml
│
└── ui/                   # React 19 + Vite frontend
    ├── src/
    │   ├── components/   # UI components
    │   ├── services/     # API client
    │   ├── hooks/        # Custom React hooks
    │   └── App.jsx
    └── package.json
```

## API Endpoints

### Connection
- `POST /api/connect` - Connect to cluster
- `POST /api/disconnect` - Disconnect
- `GET /api/cluster-info` - Get cluster info

### Namespaces
- `GET /api/namespaces` - List namespaces
- `GET /api/namespaces/{name}/sets` - List sets

### Records
- `GET /api/records/scan` - Scan records
- `GET /api/records/{namespace}/{set}/{key}` - Get record
- `POST /api/records` - Create/update record
- `DELETE /api/records/{namespace}/{set}/{key}` - Delete record

## Build for Production

### Backend
```bash
cd backend
./mvnw clean package
java -jar target/aerospike-ui-1.0.0.jar
```

### Frontend
```bash
cd ui
npm run build
# Deploy dist/ folder to your web server
```

## Screenshots

The application features:
- **Connection Manager**: Easy cluster connection with authentication
- **Namespace Browser**: Tree view of namespaces and sets
- **Data Table**: Grid view of records with dynamic columns
- **Record Editor**: JSON editor for bin data with metadata

## Tech Stack

### Backend
- Java 21
- Spring Boot 3.2.0
- Aerospike Client 7.2.1
- Lombok
- Maven

### Frontend
- React 19.2
- Vite 7.2
- Axios
- React Icons
- Custom CSS with glassmorphism

## License

MIT

## Author

Built with ❤️ for modern Aerospike database management
