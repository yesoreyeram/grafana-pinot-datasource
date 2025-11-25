#!/usr/bin/env bash
set -euo pipefail

CONTROLLER_PROTOCOL=${PINOT_CONTROLLER_PROTOCOL:-http}
CONTROLLER_HOST=${PINOT_CONTROLLER_HOST:-pinot-controller}
CONTROLLER_PORT=${PINOT_CONTROLLER_PORT:-9000}
CONTROLLER_URL="${CONTROLLER_PROTOCOL}://${CONTROLLER_HOST}:${CONTROLLER_PORT}"

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
    if _http_probe "${CONTROLLER_URL}/health"; then
      echo "Pinot controller is ready"
      return 0
    fi
    sleep 5
  done
  echo "Pinot controller did not become ready in time" >&2
  return 1
}

wait_for_instances() {
  echo "Waiting for broker and server instances to register..."
  for attempt in $(seq 1 40); do
    if command -v curl >/dev/null 2>&1; then
      local instances=$(curl -s "${CONTROLLER_URL}/instances" | grep -o '"Broker_' | wc -l)
      local servers=$(curl -s "${CONTROLLER_URL}/instances" | grep -o '"Server_' | wc -l)
      if [ "$instances" -gt 0 ] && [ "$servers" -gt 0 ]; then
        echo "Broker and server instances are registered"
        sleep 5  # Additional wait for full initialization
        return 0
      fi
    fi
    sleep 3
  done
  echo "Broker and server instances did not register in time" >&2
  return 1
}

add_schema() {
  local schema_file=$1

  echo "Adding schema from ${schema_file}"
  if command -v curl >/dev/null 2>&1; then
    curl -X POST "${CONTROLLER_URL}/schemas" \
      -H "Content-Type: application/json" \
      -d @"${schema_file}"
  else
    "$PINOT_ADMIN_CMD" AddSchema \
      -schemaFile "${schema_file}" \
      -controllerProtocol "${CONTROLLER_PROTOCOL}" \
      -controllerHost "${CONTROLLER_HOST}" \
      -controllerPort "${CONTROLLER_PORT}" \
      -exec
  fi
}

add_table() {
  local table_config=$1

  echo "Adding table defined in ${table_config}"
  if command -v curl >/dev/null 2>&1; then
    curl -X POST "${CONTROLLER_URL}/tables" \
      -H "Content-Type: application/json" \
      -d @"${table_config}"
  else
    "$PINOT_ADMIN_CMD" AddTable \
      -tableConfigFile "${table_config}" \
      -schemaFile "${table_config/.table.json/.schema.json}" \
      -controllerProtocol "${CONTROLLER_PROTOCOL}" \
      -controllerHost "${CONTROLLER_HOST}" \
      -controllerPort "${CONTROLLER_PORT}" \
      -exec
  fi
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
    -format JSON \
    -overwrite

  echo "Uploading segments for table ${table_name} from ${output_dir}"
  "$PINOT_ADMIN_CMD" UploadSegment \
    -tableName "${table_name}" \
    -segmentDir "${output_dir}" \
    -controllerProtocol "${CONTROLLER_PROTOCOL}" \
    -controllerHost "${CONTROLLER_HOST}" \
    -controllerPort "${CONTROLLER_PORT}"
}

wait_for_controller
wait_for_instances

# Add schemas
add_schema /pinot-samples/airline_stats/schema.json
add_schema /pinot-samples/baseball_stats/schema.json
add_schema /pinot-samples/ecommerce_customers/schema.json
add_schema /pinot-samples/ecommerce_products/schema.json
add_schema /pinot-samples/ecommerce_orders/schema.json
add_schema /pinot-samples/ecommerce_order_items/schema.json
add_schema /pinot-samples/metrics_timeseries/schema.json
add_schema /pinot-samples/ecommerce_transactions/schema.json

# Add tables
add_table /pinot-samples/airline_stats/table.json
add_table /pinot-samples/baseball_stats/table.json
add_table /pinot-samples/ecommerce_customers/table.json
add_table /pinot-samples/ecommerce_products/table.json
add_table /pinot-samples/ecommerce_orders/table.json
add_table /pinot-samples/ecommerce_order_items/table.json
add_table /pinot-samples/metrics_timeseries/table.json
add_table /pinot-samples/ecommerce_transactions/table.json

# Load sample data
run_ingestion_job airlineStats /pinot-samples/airline_stats/data /pinot-samples/airline_stats/schema.json /pinot-samples/airline_stats/table.json /tmp/pinot-airlineStats
run_ingestion_job baseballStats /pinot-samples/baseball_stats/data /pinot-samples/baseball_stats/schema.json /pinot-samples/baseball_stats/table.json /tmp/pinot-baseballStats

# Load e-commerce data
run_ingestion_job ecommerce_customers /pinot-samples/ecommerce_customers/data /pinot-samples/ecommerce_customers/schema.json /pinot-samples/ecommerce_customers/table.json /tmp/pinot-ecommerce_customers
run_ingestion_job ecommerce_products /pinot-samples/ecommerce_products/data /pinot-samples/ecommerce_products/schema.json /pinot-samples/ecommerce_products/table.json /tmp/pinot-ecommerce_products
run_ingestion_job ecommerce_orders /pinot-samples/ecommerce_orders/data /pinot-samples/ecommerce_orders/schema.json /pinot-samples/ecommerce_orders/table.json /tmp/pinot-ecommerce_orders
run_ingestion_job ecommerce_order_items /pinot-samples/ecommerce_order_items/data /pinot-samples/ecommerce_order_items/schema.json /pinot-samples/ecommerce_order_items/table.json /tmp/pinot-ecommerce_order_items

# Load time series metrics data
run_ingestion_job metricsTimeseries /pinot-samples/metrics_timeseries/data /pinot-samples/metrics_timeseries/schema.json /pinot-samples/metrics_timeseries/table.json /tmp/pinot-metrics_timeseries

# Load ecommerce transactions (20 years of data)
run_ingestion_job ecommerce_transactions /pinot-samples/ecommerce_transactions/data /pinot-samples/ecommerce_transactions/schema.json /pinot-samples/ecommerce_transactions/table.json /tmp/pinot-ecommerce_transactions

echo "Sample Pinot tables are ready"
