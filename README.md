# Grafana data source plugin for Apache Pinot™

Local development is easiest with the provided Docker Compose stack that now includes a small Apache Pinot® cluster seeded with demo data.

## Getting started

### Launch Grafana + Pinot locally

```bash
docker compose up -d grafana pinot-init
```

The command starts Grafana (with this plugin mounted from the repo) and the Pinot services it depends on (`pinot-zookeeper`, `pinot-controller`, `pinot-broker`, `pinot-server`, and `pinot-minion`). The `pinot-init` one-shot container waits for the controller to become healthy, registers two sample offline tables, and ingests the bundled JSON files.

- Pinot Controller UI: [http://localhost:9000](http://localhost:9000)
- Pinot Broker (SQL/Query API): [http://localhost:8099/query](http://localhost:8099/query)
- Grafana UI: [http://localhost:3000](http://localhost:3000) (default admin/admin)

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

## Notes

- Set `PINOT_IMAGE` to pin a different Apache Pinot release: `PINOT_IMAGE=apachepinot/pinot:1.1.0 docker compose up ...`
- Override Grafana build args (for example, `GRAFANA_VERSION`) directly in `docker-compose.yaml` if you need a different Grafana binary while testing the plugin.
