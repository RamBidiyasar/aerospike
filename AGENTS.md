# Project handoff

## Scope and user requirements

- This is an Aerospike database management application, not a marketing website.
- The user requires frontend and backend to be hosted together; do not propose a separately hosted backend as the completed solution.
- A previous Sites adaptation was reverted at the user's request. No complete application was deployed. Single-deployment packaging has not been implemented.
- Sites registration created an unpublished project, `appgprj_6aa3f50d5c1c8191bc60e032222d47ce` (slug `aerospike-database-workspace`). Do not create a duplicate or assume it was deployed. Its local manifest was removed with the reverted changes.
- The Sites workflow inspected in September 2026 did not support this Java backend or raw TCP database connections. Recheck platform capabilities if revisiting hosting; do not substitute a frontend-only deployment for the full application.

## Architecture and navigation

- `ui/`: React 19, Vite 7, JavaScript/JSX, Axios, React Icons, component CSS; npm lockfile.
- `backend/`: primary runtime is Java 21, Spring Boot 3.2.0, Aerospike Java client 7.2.1, Maven, Lombok.
- `start.sh` launches Java on port 8080 and Vite on port 5173. It hardcodes a macOS Java 21 path and stops existing listeners on those ports; inspect before running against an active environment.
- `backend/server.js` is a separate minimal Express implementation on port 3001, not the backend launched by `start.sh`. Do not assume feature parity or treat its npm scripts as the Java build.
- `ui/src/App.jsx` coordinates connection changes, selected namespace/set, record loading, editing, deletion, search, and job polling.
- `ui/src/hooks/useAerospike.js` owns React state for connection, browsing scope, records, and selection.
- `ui/src/services/api.js` is the HTTP contract: defaults to `http://localhost:8080/api`, overridable with `VITE_API_BASE_URL`; credentials are enabled and path segments are encoded.
- `ConnectionManager.jsx`, `ClusterSelector.jsx`, and `utils/profileStorage.js` handle connections and device-local saved profiles. Existing profiles include passwords; do not copy credentials into documentation or fixtures.
- `NamespaceBrowser.jsx` and `NamespaceStats.jsx` handle namespace/set navigation and statistics. `__ALL_SETS__` is the UI sentinel; API requests omit the set to browse across a namespace.
- `DataTable.jsx`, `RecordEditor.jsx`, and `AddRecordModal.jsx` provide search, browsing, JSON bin editing, and record creation.
- `AerospikeOpsPanel.jsx` exposes operational views: cluster overview, indexes, UDFs, info commands, and sampled bin statistics.
- `backend/src/main/java/com/aerospike/ui/controller/` contains connection, namespace, record, and operational REST controllers.
- `backend/src/main/java/com/aerospike/ui/service/AerospikeService.java` implements database operations and background key-pattern jobs. Connection and job state live in the service; do not assume per-user isolation.
- `backend/src/main/java/com/aerospike/ui/model/` contains request/response DTOs. Check these alongside the relevant controller and frontend API method when changing a contract.
- `backend/src/main/resources/application.yml` configures the backend. `config/CorsConfig.java` currently allows localhost frontend origins, not an arbitrary hosted origin.

## API overview

- Connection: `/api/connect`, `/api/disconnect`, `/api/cluster-info`.
- Browsing: `/api/namespaces`, `/api/namespaces/{namespace}/sets`; set deletion is supported.
- Records: `/api/records/scan`, `/api/records/search`, `/api/records/{namespace}/{setName}/{key}`, and POST `/api/records` for writes.
- Background work: `/api/records/key-pattern-jobs`, job status, and cancellation. The UI polls queued/running jobs. Older delete-by-key-prefix routes remain for compatibility.
- Operations: `/api/ops/cluster-overview`, `/indexes`, `/udfs`, `/info`, `/bin-stats`.

## Development and verification

- Frontend: from `ui/`, use `npm ci` when dependencies are absent, `npm run dev` for serving, and `npm run build` for production compilation. Opening `ui/index.html` with a `file://` URL does not run the Vite application.
- Backend: from `backend/`, use `./mvnw spring-boot:run`, `./mvnw test`, or `./mvnw clean package` with Java 21.
- Real integration checks require a reachable Aerospike cluster. A successful frontend build does not prove database connectivity or CRUD behavior.
- README/configuration files may contain credentials. Do not reproduce them in output, commits, examples, or deployments. Avoid live database mutations merely to test the UI.
- Preserve unrelated changes. `backend/com/aerospike/client/command/response.json` was already untracked before this task and belongs to the user.
- Use this map to narrow inspection, then read the specific code being changed. This handoff is not an exhaustive code audit; update it when architecture or requirements change.
