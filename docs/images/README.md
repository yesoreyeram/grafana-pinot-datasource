# Query Editor Screenshots

This directory contains screenshots of the query editor functionality.

## Required Screenshots

To complete the documentation, please add the following screenshots:

### 1. query-editor.png
Shows the main query editor interface with:
- Format selector (Table/Time series)
- Time column input (when time series selected)
- SQL Editor component with both code and builder modes
- Run query button

### 2. query-builder-mode.png
Shows the query builder in action:
- Table selection dropdown populated with tables from controller
- Column selection with data types
- Visual query building interface
- Generated SQL preview

### 3. raw-sql-mode.png
Shows raw SQL mode:
- Syntax highlighted SQL query
- Multi-line query example
- Editor features (autocomplete, etc.)

### 4. time-series-query.png
Shows time series configuration:
- Format set to "Time series"
- Time column field filled (e.g., "timestamp")
- Example time series query in editor
- Resulting graph visualization

### 5. table-format-query.png
Shows table format results:
- Format set to "Table"
- Query returning multiple columns
- Table visualization with data

### 6. query-with-joins.png
Shows a complex JOIN query:
- Multi-table JOIN query in editor
- Results displayed
- Example from ecommerce sample data

## How to Capture

1. Start the docker-compose environment
2. Open Grafana at http://localhost:3000
3. Navigate to Explore
4. Select the Apache Pinot datasource
5. Demonstrate each feature as described above
6. Take screenshots and save them in this directory with the names listed above

## Screenshot Guidelines

- Use consistent window size (1920x1080 or similar)
- Include enough context (show Grafana UI elements)
- Ensure text is readable
- Use the sample data provided (airlineStats, baseballStats, ecommerce_*)
- Show realistic queries and results
