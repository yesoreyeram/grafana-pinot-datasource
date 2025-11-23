# Grafana data source plugin for Apache Pinot™

A Grafana datasource plugin for querying Apache Pinot®, with support for broker and controller endpoints, flexible authentication options, and independent TLS configuration.

## Features

- **Dual-endpoint configuration**: Connect to Pinot broker for queries and controller for metadata operations
- **Flexible authentication**: Support for no authentication, basic auth, and bearer token authentication
- **Independent configuration**: Separate authentication and TLS settings for broker and controller
- **Health checks**: Validates broker connectivity, query execution, and table availability
- **Production-ready**: Driver-style client architecture with proper error handling and timeouts

## Getting started

### Launch Grafana + Pinot locally

```bash
docker compose up -d grafana pinot-init
```

The command starts Grafana (with this plugin mounted from the repo) and the Pinot services it depends on (`pinot-zookeeper`, `pinot-controller`, `pinot-broker`, `pinot-server`, and `pinot-minion`). The `pinot-init` one-shot container waits for the controller to become healthy, registers two sample offline tables, and ingests the bundled JSON files.

- Pinot Controller UI: [http://localhost:9000](http://localhost:9000)
- Pinot Broker (SQL/Query API): [http://localhost:8099/query](http://localhost:8099/query)
- Grafana UI: [http://localhost:3000](http://localhost:3000) (default admin/admin)

### Configure the datasource

A default Apache Pinot datasource is automatically provisioned and ready to use. The configuration includes:

- **Broker URL**: `http://pinot-broker:8099` - For executing SQL queries
- **Controller URL**: `http://pinot-controller:9000` - For metadata operations (listing tables, schemas)
- **Authentication**: None (unauthenticated access)

You can add additional datasources through the Grafana UI:

1. Navigate to **Connections** → **Data sources** → **Add new data source**
2. Search for "Apache Pinot" and select it
3. Configure the connection settings:
   - **Broker Configuration**: Required for queries
     - Broker URL
     - Authentication type (None, Basic, Bearer Token)
     - TLS skip verify option
   - **Controller Configuration**: Optional for metadata operations
     - Controller URL
     - Independent authentication settings
     - Independent TLS configuration

### Bundled sample datasets

The `docker/pinot` folder contains the full definition of the demo tables so you can tweak schemas, table configs, and ingestion jobs:

- `airlineStats_OFFLINE`: simple flight punctuality metrics keyed by carrier and route.
- `baseballStats_OFFLINE`: 2022 season hitting stats for a handful of MLB players.

Each dataset ships with:

- `schema.json` – Pinot schema definition
- `table.json` – table configuration (offline tables with replication factor 1)
- `data/*.json` – newline-delimited JSON samples loaded via the ingestion job
- `ingestion-job.yaml` – `pinot-admin.sh LaunchDataIngestionJob` spec describing how to build/upload segments

To re-run ingestion after editing any of these files:

```bash
docker compose run --rm pinot-init
```

That command retries table creation and segment uploads against the running controller.

## Configuration Options

### Broker vs Controller Mode

- **Broker-only mode**: Provide only the broker URL. This mode supports SQL query execution but does not support metadata operations (listing tables, retrieving schemas).
- **Full mode** (recommended): Provide both broker and controller URLs. This enables full functionality including queries and metadata operations.

### Authentication

The plugin supports three authentication modes:

1. **No Authentication**: For development/testing or when Pinot is secured at the network level
2. **Basic Authentication**: Provide username and password for HTTP basic auth
3. **Bearer Token**: Provide a bearer token for token-based authentication

Broker and controller can use different authentication methods for enhanced security.

### TLS/SSL Settings

Each endpoint (broker and controller) has independent TLS skip verify settings, allowing you to configure different certificates or security requirements per endpoint.

## Architecture

### Frontend (`src/module.tsx`)

- **ConfigEditor**: Collapsible UI sections for broker and controller configuration
- **Nested configuration structure**: HTTPClient type for reusable endpoint configuration
- **Type-safe handlers**: Generic methods for configuration updates
- **Centralized text**: All labels and descriptions in a selectors object

### Backend (`pkg/main.go`)

- **PinotClient**: Driver-style client with separate broker and controller HTTP clients
- **HTTPClient**: Generic HTTP client with authentication and TLS support
- **CheckHealth**: Validates broker connectivity, query execution, and table availability
- **Industry best practices**: Hierarchical code organization with clear section comments

## Development

### Building the plugin

```bash
npm install
npm run build
```

### Running tests

```bash
npm run test
```

### Code formatting

```bash
npm run lint:fix
```

## Notes

- Set `PINOT_IMAGE` to pin a different Apache Pinot release: `PINOT_IMAGE=apachepinot/pinot:1.1.0 docker compose up ...`
- Override Grafana build args (for example, `GRAFANA_VERSION`) directly in `docker-compose.yaml` if you need a different Grafana binary while testing the plugin.
- For production deployments, always use proper TLS certificates and strong authentication credentials.
