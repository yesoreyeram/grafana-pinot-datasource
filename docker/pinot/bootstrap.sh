#!/usr/bin/env bash
set -euo pipefail

CONTROLLER_PROTOCOL=${PINOT_CONTROLLER_PROTOCOL:-http}
CONTROLLER_HOST=${PINOT_CONTROLLER_HOST:-pinot-controller}
CONTROLLER_PORT=${PINOT_CONTROLLER_PORT:-9000}

resolve_pinot_admin() {
  if command -v pinot-admin.sh >/dev/null 2>&1; then
    command -v pinot-admin.sh
    return 0
  fi
  # Common locations inside apachepinot/pinot image
  for cand in /opt/pinot/bin/pinot-admin.sh /pinot/bin/pinot-admin.sh; do
    if [ -x "$cand" ]; then
      echo "$cand"
      return 0
    fi
  done
  echo "pinot-admin.sh not found in PATH or common locations" >&2
  exit 127
}

PINOT_ADMIN_CMD=${PINOT_ADMIN_CMD:-$(resolve_pinot_admin)}

_http_probe() {
  local url=$1
  if command -v curl >/dev/null 2>&1; then
    curl -fsS "$url" >/dev/null
  elif command -v wget >/dev/null 2>&1; then
    wget -qO- "$url" >/dev/null
  else
    echo "Neither curl nor wget is available to probe $url" >&2
    return 1
  fi
}

wait_for_controller() {
  echo "Waiting for Pinot controller at ${CONTROLLER_HOST}:${CONTROLLER_PORT}..."
  for attempt in $(seq 1 40); do
    if _http_probe "${CONTROLLER_PROTOCOL}://${CONTROLLER_HOST}:${CONTROLLER_PORT}/health"; then
      echo "Pinot controller is ready"
      return 0
    fi
    sleep 5
  done
  echo "Pinot controller did not become ready in time" >&2
  return 1
}

add_table() {
  local table_config=$1
  local schema_file=$2

  echo "Adding table defined in ${table_config}"
  "$PINOT_ADMIN_CMD" AddTable \
    -tableConfigFile "${table_config}" \
    -schemaFile "${schema_file}" \
    -controllerProtocol "${CONTROLLER_PROTOCOL}" \
    -controllerHost "${CONTROLLER_HOST}" \
    -controllerPort "${CONTROLLER_PORT}" \
    -exec
}

run_ingestion_job() {
  local table_name=$1
  local data_dir=$2
  local schema_file=$3
  local table_config=$4
  local output_dir=$5

  echo "Creating segments for table ${table_name} from ${data_dir}"
  "$PINOT_ADMIN_CMD" CreateSegment \
    -dataDir "${data_dir}" \
    -outDir "${output_dir}" \
    -tableConfigFile "${table_config}" \
    -schemaFile "${schema_file}" \
    -format json \
    -overwrite

  echo "Uploading segments for table ${table_name} from ${output_dir}"
  "$PINOT_ADMIN_CMD" UploadSegment \
    -tableName "${table_name}" \
    -segmentDir "${output_dir}" \
    -controllerProtocol "${CONTROLLER_PROTOCOL}" \
    -controllerHost "${CONTROLLER_HOST}" \
    -controllerPort "${CONTROLLER_PORT}" \
    -exec
}

wait_for_controller

add_table /pinot-samples/airline_stats/table.json /pinot-samples/airline_stats/schema.json
add_table /pinot-samples/baseball_stats/table.json /pinot-samples/baseball_stats/schema.json

run_ingestion_job airlineStats /pinot-samples/airline_stats/data /pinot-samples/airline_stats/schema.json /pinot-samples/airline_stats/table.json /tmp/pinot-airlineStats
run_ingestion_job baseballStats /pinot-samples/baseball_stats/data /pinot-samples/baseball_stats/schema.json /pinot-samples/baseball_stats/table.json /tmp/pinot-baseballStats

echo "Sample Pinot tables are ready"
