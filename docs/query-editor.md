# Query Editor Guide

This guide covers the Apache Pinot datasource query editor features and usage.

## Overview

The query editor provides two modes for writing queries:
1. **Raw SQL Mode**: Direct SQL query editor with syntax highlighting
2. **Query Builder Mode**: Visual query builder with autocomplete (requires controller)

## Getting Started

### Prerequisites

- Grafana instance with Apache Pinot datasource configured
- Broker URL configured (required for queries)
- Controller URL configured (optional, but required for query builder)

### Basic Query

1. Navigate to **Explore** or create a new panel
2. Select your Apache Pinot datasource
3. The query editor will appear with default settings

## Query Modes

### Raw SQL Mode (Code)

Write SQL queries directly with full Pinot SQL syntax support:

**Features**:
- Syntax highlighting
- Multi-line query support
- Full Pinot SQL syntax including:
  - SELECT, WHERE, GROUP BY, ORDER BY
  - JOIN queries
  - Window functions
  - Aggregate functions
  - Subqueries

**Example**:
```sql
SELECT 
  Origin,
  Dest,
  COUNT(*) as flight_count,
  AVG(ArrDelay) as avg_delay
FROM airlineStats
WHERE Year = 2014
GROUP BY Origin, Dest
ORDER BY flight_count DESC
LIMIT 10
```

### Query Builder Mode

Visual query construction with autocomplete and validation.

**Requirements**:
- Controller URL must be configured in datasource settings
- Tables must exist in Pinot

**Features**:
- Table selection from dropdown
- Column autocomplete with type information
- Visual filter builder
- Aggregation function support
- GROUP BY clause builder

**Usage**:
1. Click the "Builder" mode button
2. Select a table from the dropdown
3. Add columns to select
4. Add filters, aggregations, grouping as needed
5. Query is automatically generated

## Format Options

### Table Format

Display query results in tabular format (default).

**Best for**:
- Viewing raw data
- Multiple columns of different types
- Data exploration
- Detailed analysis

**Configuration**:
- Select "Table" from the Format dropdown
- No additional configuration needed

### Time Series Format

Display query results as time series data for visualization in graphs.

**Best for**:
- Temporal data visualization
- Line graphs, area charts
- Tracking metrics over time
- Dashboard time series panels

**Configuration**:
1. Select "Time series" from the Format dropdown
2. Enter the time column name (e.g., "timestamp", "created_at")
3. Ensure your query includes the time column
4. Time values should be in milliseconds (Pinot standard)

**Example**:
```sql
SELECT 
  created_at as time,
  SUM(total) as revenue
FROM ecommerce_orders
WHERE created_at > $__fromTime AND created_at < $__toTime
GROUP BY created_at
ORDER BY created_at
```

## Advanced Features

### Query Options

Pinot query options can be passed to control query behavior:

**Supported Options**:
- Response format
- Timeout settings
- Enable null handling
- Multistage query engine
- Group by mode

**Note**: Query options UI is planned for future release. Currently, options can be embedded in SQL queries using SET statements.

### Time Range Variables

Use Grafana time range variables in your queries:

- `$__fromTime`: Start time in milliseconds
- `$__toTime`: End time in milliseconds

**Example**:
```sql
SELECT timestamp, value
FROM metrics
WHERE timestamp >= $__fromTime 
  AND timestamp < $__toTime
```

### JOIN Queries

The plugin supports all Pinot JOIN types:

**Example - Inner Join**:
```sql
SELECT 
  o.order_id,
  o.total,
  c.name as customer_name,
  c.email
FROM ecommerce_orders o
INNER JOIN ecommerce_customers c ON o.customer_id = c.customer_id
WHERE o.created_at > 1638360000000
LIMIT 100
```

### Window Functions

Support for Pinot window functions:

**Example - ROW_NUMBER**:
```sql
SELECT 
  user_id,
  order_date,
  total,
  ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY order_date DESC) as recent_order_rank
FROM ecommerce_orders
```

### Aggregation Functions

All standard SQL aggregations are supported:

- COUNT, COUNT(DISTINCT)
- SUM, AVG
- MIN, MAX
- PERCENTILE functions
- Custom aggregate functions

**Example**:
```sql
SELECT 
  category,
  COUNT(*) as total_orders,
  SUM(total) as total_revenue,
  AVG(total) as avg_order_value,
  PERCENTILE(total, 95) as p95_order_value
FROM ecommerce_orders
GROUP BY category
```

## Data Types

The plugin automatically converts Pinot data types to Grafana data types:

| Pinot Type | Grafana Type | Example Usage |
|------------|--------------|---------------|
| INT | int64 | User IDs, counts |
| LONG | int64 | Large numbers, IDs |
| FLOAT | float64 | Prices, rates |
| DOUBLE | float64 | Precise decimals |
| BOOLEAN | bool | Flags, states |
| TIMESTAMP | time.Time | Timestamps (milliseconds) |
| STRING | string | Names, descriptions |
| BYTES | string | Binary data (base64) |
| JSON | string | JSON documents |

## Troubleshooting

### Empty Table List in Query Builder

**Symptom**: No tables appear in the query builder dropdown

**Solutions**:
1. Verify controller URL is configured in datasource settings
2. Check controller is accessible from Grafana
3. Verify tables exist in Pinot (check Pinot Controller UI)
4. Check datasource health check passes

### Schema Not Loading

**Symptom**: Columns don't appear when selecting a table

**Solutions**:
1. Verify controller API is accessible
2. Check table schema exists in Pinot
3. Review browser console for errors
4. Fall back to raw SQL mode if needed

### Query Errors

**Symptom**: Query execution fails with error

**Common Causes**:
1. Invalid SQL syntax - check Pinot SQL documentation
2. Table doesn't exist - verify table name
3. Column doesn't exist - check schema
4. Type mismatch - verify data types
5. Broker timeout - increase timeout or optimize query

### Time Series Not Displaying

**Symptom**: Time series format selected but graph is empty

**Solutions**:
1. Verify time column name is correct
2. Check time values are in milliseconds
3. Ensure time column is included in SELECT
4. Verify time range has data
5. Check time column data type (should be numeric or TIMESTAMP)

## Best Practices

### Query Performance

1. **Use LIMIT**: Always limit results for exploratory queries
2. **Index usage**: Leverage Pinot indexes in WHERE clauses
3. **Aggregations**: Pre-aggregate when possible
4. **Time filters**: Always filter by time for time series data
5. **Avoid SELECT ***: Select only needed columns

### Time Series Queries

1. **Consistent time intervals**: Use GROUP BY with time buckets
2. **Order by time**: Always ORDER BY the time column
3. **Fill gaps**: Consider using Pinot's gap-fill functions
4. **Millisecond precision**: Ensure timestamps are in milliseconds

### Query Builder

1. **Start simple**: Begin with basic queries, add complexity gradually
2. **Preview in SQL**: Check generated SQL before running
3. **Switch to code**: Use code mode for complex queries
4. **Save queries**: Save common queries as dashboard panels

## Examples

### Basic Metrics Dashboard

```sql
-- Total orders by hour
SELECT 
  DATE_TRUNC('hour', created_at) as time,
  COUNT(*) as order_count
FROM ecommerce_orders
WHERE created_at >= $__fromTime AND created_at < $__toTime
GROUP BY time
ORDER BY time
```

### Customer Analysis

```sql
-- Top customers by revenue
SELECT 
  c.name,
  c.email,
  COUNT(o.order_id) as total_orders,
  SUM(o.total) as total_spent
FROM ecommerce_customers c
LEFT JOIN ecommerce_orders o ON c.customer_id = o.customer_id
GROUP BY c.name, c.email
ORDER BY total_spent DESC
LIMIT 20
```

### Product Performance

```sql
-- Product sales with ranking
SELECT 
  p.name as product_name,
  p.category,
  COUNT(oi.order_item_id) as units_sold,
  SUM(oi.price * oi.quantity) as revenue,
  ROW_NUMBER() OVER (PARTITION BY p.category ORDER BY SUM(oi.price * oi.quantity) DESC) as category_rank
FROM ecommerce_products p
JOIN ecommerce_order_items oi ON p.product_id = oi.product_id
GROUP BY p.name, p.category
```

## Additional Resources

- [Apache Pinot Query Documentation](https://docs.pinot.apache.org/users/user-guide-query/querying-pinot)
- [Pinot SQL Syntax](https://docs.pinot.apache.org/users/user-guide-query/query-syntax)
- [Time Series Queries](https://docs.pinot.apache.org/users/user-guide-query/time-series-queries)
- [JOIN Queries](https://docs.pinot.apache.org/users/user-guide-query/query-syntax/joins)
- [Window Functions](https://docs.pinot.apache.org/users/user-guide-query/query-syntax)
