import { DataQuery, SelectableValue } from '@grafana/data';

/**
 * Editor mode for the query editor
 */
export enum EditorMode {
  Builder = 'builder',
  Code = 'code',
}

/**
 * Format type for query results
 */
export enum QueryFormat {
  Timeseries = 'timeseries',
  Table = 'table',
}

/**
 * SQL Query structure from @grafana/plugin-ui
 */
export interface SqlQuery {
  columns?: SqlExpression[];
  groupBy?: SqlExpression[];
  where?: SqlExpression[];
  orderBy?: SqlExpression[];
  limit?: number;
}

export interface SqlExpression {
  type?: string;
  name?: string;
  alias?: string;
  parameters?: SqlExpression[];
  property?: {
    type?: string;
    name?: string;
  };
}

/**
 * Main Query type for Apache Pinot datasource
 */
export interface PinotQuery extends DataQuery {
  // Raw SQL query string
  rawSql?: string;

  // Editor mode
  editorMode?: EditorMode;

  // SQL query builder structure
  sql?: SqlQuery;

  // Table name
  table?: string;

  // Schema/database name (optional for Pinot)
  dataset?: string;

  // Query format
  format?: QueryFormat;

  // Time column for time series queries
  timeColumn?: string;

  // Query options
  queryOptions?: QueryOptions;
}

/**
 * Query options that can be passed to Pinot
 * Based on https://docs.pinot.apache.org/users/user-guide-query/query-options
 */
export interface QueryOptions {
  // Response format
  responseFormat?: string;

  // Timeout in milliseconds
  timeoutMs?: number;

  // Enable null handling
  enableNullHandling?: boolean;

  // Use multistage query engine
  useMultistageEngine?: boolean;

  // Max rows to scan
  maxRowsInJoin?: number;

  // Group by mode
  groupByMode?: string;

  // Other custom options
  [key: string]: string | number | boolean | undefined;
}

/**
 * Options for table/column selection
 */
export interface TableOption extends SelectableValue<string> {
  label: string;
  value: string;
}

export interface ColumnOption extends SelectableValue<string> {
  label: string;
  value: string;
  type?: string;
}
