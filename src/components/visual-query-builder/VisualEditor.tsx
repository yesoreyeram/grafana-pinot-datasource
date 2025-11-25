import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { SelectableValue } from '@grafana/data';
import { getBackendSrv } from '@grafana/runtime';
import { Collapse, Alert, CodeEditor, InlineField, Select, Checkbox, InlineFieldRow } from '@grafana/ui';
import { TableSelector } from './TableSelector';
import { ColumnSelector } from './ColumnSelector';
import { FilterEditor } from './FilterEditor';
import { AggregationEditor } from './AggregationEditor';
import { OrderByEditor } from './OrderByEditor';

interface FilterCondition {
  column: string;
  operator: string;
  value: string;
}

interface AggregationConfig {
  func: string;
  column: string;
  alias?: string;
}

interface OrderByConfig {
  column: string;
  direction: 'ASC' | 'DESC';
}

interface TimeSeriesConfig {
  enabled: boolean;
  timeColumn?: string;
  autoApplyTimeFilter: boolean;
}

interface VisualQuery {
  table?: string;
  columns: string[];
  filters: FilterCondition[];
  aggregations: AggregationConfig[];
  groupBy: string[];
  orderBy: OrderByConfig[];
  limit?: number;
  timeSeries?: TimeSeriesConfig;
}

interface VisualEditorProps {
  datasourceUid: string;
  visualQuery: VisualQuery;
  onChange: (visualQuery: VisualQuery) => void;
  onRunQuery: () => void;
}

export const defaultVisualQuery: VisualQuery = {
  table: undefined,
  columns: [],
  filters: [],
  aggregations: [],
  groupBy: [],
  orderBy: [],
  limit: 100,
  timeSeries: {
    enabled: false,
    timeColumn: undefined,
    autoApplyTimeFilter: false,
  },
};

/**
 * Generates SQL from the visual query configuration
 */
export const generateSQL = (visualQuery: VisualQuery): string => {
  const { table, columns, filters, aggregations, groupBy, orderBy, limit, timeSeries } = visualQuery;

  if (!table) {
    return '';
  }

  // Build SELECT clause
  let selectParts: string[] = [];
  const timeColumn = timeSeries?.enabled ? timeSeries?.timeColumn : undefined;
  
  // For time series queries, always include the time column first
  if (timeColumn) {
    selectParts.push(timeColumn);
  }
  
  // Add selected columns (excluding time column if already added)
  if (columns.length > 0) {
    const filteredColumns = timeColumn ? columns.filter(c => c !== timeColumn) : columns;
    selectParts = selectParts.concat(filteredColumns);
  }
  
  // Add aggregations
  aggregations.forEach((agg) => {
    const aggStr = `${agg.func}(${agg.column})`;
    selectParts.push(agg.alias ? `${aggStr} AS ${agg.alias}` : aggStr);
  });
  
  // Default to * if nothing selected (but keep time column if present)
  if (selectParts.length === 0) {
    selectParts = ['*'];
  } else if (selectParts.length === 1 && selectParts[0] === timeColumn && columns.length === 0 && aggregations.length === 0) {
    // If only time column is selected and no other columns/aggregations, add *
    selectParts.push('*');
  }

  let sql = `SELECT ${selectParts.join(', ')} FROM ${table}`;

  // Build WHERE clause
  const whereConditions: string[] = [];
  
  // Add automatic time filter if enabled
  if (timeSeries?.enabled && timeSeries?.autoApplyTimeFilter && timeColumn) {
    whereConditions.push(`$__timeFilter(${timeColumn})`);
  }
  
  // Add user-defined filters
  filters
    .filter((f) => f.column && f.operator)
    .forEach((f) => {
      const needsValue = !['IS NULL', 'IS NOT NULL'].includes(f.operator);
      if (!needsValue) {
        whereConditions.push(`${f.column} ${f.operator}`);
        return;
      }
      
      // Handle IN/NOT IN with list values
      if (['IN', 'NOT IN'].includes(f.operator)) {
        // If value already contains quotes, use as-is; otherwise quote each comma-separated value
        const trimmedValue = f.value.trim();
        if (trimmedValue.includes("'")) {
          // Values are already quoted
          whereConditions.push(`${f.column} ${f.operator} (${trimmedValue})`);
        } else if (trimmedValue.includes(',')) {
          // Quote each comma-separated value
          const quotedValues = trimmedValue.split(',').map(v => `'${v.trim()}'`).join(', ');
          whereConditions.push(`${f.column} ${f.operator} (${quotedValues})`);
        } else {
          whereConditions.push(`${f.column} ${f.operator} ('${trimmedValue}')`);
        }
        return;
      }
      
      // Handle LIKE patterns
      if (['LIKE', 'NOT LIKE'].includes(f.operator)) {
        whereConditions.push(`${f.column} ${f.operator} '${f.value}'`);
        return;
      }
      
      // Check if value is numeric (handle whitespace-only strings correctly)
      const trimmedValue = f.value.trim();
      const isNumeric = trimmedValue !== '' && !isNaN(Number(trimmedValue));
      const formattedValue = isNumeric ? trimmedValue : `'${f.value}'`;
      
      whereConditions.push(`${f.column} ${f.operator} ${formattedValue}`);
    });
  
  if (whereConditions.length > 0) {
    sql += ` WHERE ${whereConditions.join(' AND ')}`;
  }

  // Build GROUP BY clause
  // For time series with aggregations, include time column in GROUP BY
  let groupByColumns = [...groupBy];
  if (timeSeries?.enabled && timeColumn && aggregations.length > 0 && !groupByColumns.includes(timeColumn)) {
    groupByColumns.unshift(timeColumn);
  }
  
  if (groupByColumns.length > 0) {
    sql += ` GROUP BY ${groupByColumns.join(', ')}`;
  }

  // Build ORDER BY clause
  let orderByParts = orderBy
    .filter((o) => o.column)
    .map((o) => `${o.column} ${o.direction}`);
  
  // For time series, add time column to ORDER BY if not already present
  if (timeSeries?.enabled && timeColumn) {
    const hasTimeInOrder = orderBy.some(o => o.column === timeColumn);
    if (!hasTimeInOrder) {
      orderByParts.unshift(`${timeColumn} ASC`);
    }
  }
  
  if (orderByParts.length > 0) {
    sql += ` ORDER BY ${orderByParts.join(', ')}`;
  }

  // Add LIMIT
  if (limit !== undefined && limit > 0) {
    sql += ` LIMIT ${limit}`;
  }

  return sql;
};

export const VisualEditor: React.FC<VisualEditorProps> = ({
  datasourceUid,
  visualQuery,
  onChange,
  onRunQuery,
}) => {
  const [columnOptions, setColumnOptions] = useState<Array<SelectableValue<string>>>([]);
  const [sqlPreviewOpen, setSqlPreviewOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch columns when table changes
  useEffect(() => {
    const fetchColumns = async () => {
      if (!datasourceUid || !visualQuery.table) {
        setColumnOptions([]);
        return;
      }

      try {
        const response = await getBackendSrv().datasourceRequest({
          url: `/api/datasources/uid/${datasourceUid}/resources/table/${visualQuery.table}/schema`,
          method: 'GET',
        });

        if (response?.data?.columns) {
          const options = response.data.columns.map((col: { name: string; type: string }) => ({
            label: col.name,
            value: col.name,
            description: col.type,
          }));
          setColumnOptions(options);
          setError(null);
        }
      } catch (err) {
        console.error('Failed to fetch columns:', err);
        setColumnOptions([]);
        setError('Failed to fetch table schema. Please check datasource configuration or table permissions.');
      }
    };

    fetchColumns();
  }, [datasourceUid, visualQuery.table]);

  const handleTableChange = useCallback((table: string) => {
    onChange({
      ...visualQuery,
      table,
      columns: [],
      filters: [],
      aggregations: [],
      groupBy: [],
      orderBy: [],
    });
  }, [onChange, visualQuery]);

  const handleColumnsChange = useCallback((columns: string[]) => {
    onChange({ ...visualQuery, columns });
    onRunQuery();
  }, [onChange, onRunQuery, visualQuery]);

  const handleFiltersChange = useCallback((filters: FilterCondition[]) => {
    onChange({ ...visualQuery, filters });
  }, [onChange, visualQuery]);

  const handleAggregationsChange = useCallback((aggregations: AggregationConfig[]) => {
    onChange({ ...visualQuery, aggregations });
  }, [onChange, visualQuery]);

  const handleGroupByChange = useCallback((groupBy: string[]) => {
    onChange({ ...visualQuery, groupBy });
  }, [onChange, visualQuery]);

  const handleOrderByChange = useCallback((orderBy: OrderByConfig[]) => {
    onChange({ ...visualQuery, orderBy });
  }, [onChange, visualQuery]);

  const handleLimitChange = useCallback((limit: number | undefined) => {
    onChange({ ...visualQuery, limit });
  }, [onChange, visualQuery]);

  const handleTimeSeriesEnabledChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const enabled = e.target.checked;
    onChange({
      ...visualQuery,
      timeSeries: {
        ...visualQuery.timeSeries,
        enabled,
        timeColumn: enabled ? visualQuery.timeSeries?.timeColumn : undefined,
        autoApplyTimeFilter: enabled ? visualQuery.timeSeries?.autoApplyTimeFilter ?? true : false,
      },
    });
    if (enabled) {
      onRunQuery();
    }
  }, [onChange, onRunQuery, visualQuery]);

  const handleTimeColumnChange = useCallback((value: SelectableValue<string>) => {
    onChange({
      ...visualQuery,
      timeSeries: {
        ...visualQuery.timeSeries,
        enabled: true,
        timeColumn: value.value,
        autoApplyTimeFilter: visualQuery.timeSeries?.autoApplyTimeFilter ?? true,
      },
    });
    onRunQuery();
  }, [onChange, onRunQuery, visualQuery]);

  const handleAutoTimeFilterChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...visualQuery,
      timeSeries: {
        ...visualQuery.timeSeries,
        enabled: visualQuery.timeSeries?.enabled ?? false,
        autoApplyTimeFilter: e.target.checked,
      },
    });
    onRunQuery();
  }, [onChange, onRunQuery, visualQuery]);

  // Get timestamp/time columns for time series selector
  const timeColumnOptions = useMemo(() => {
    return columnOptions.filter(col => {
      const type = col.description?.toUpperCase() || '';
      return type.includes('TIMESTAMP') || type.includes('TIME') || type.includes('LONG') || type.includes('DATE');
    });
  }, [columnOptions]);

  const generatedSQL = useMemo(() => generateSQL(visualQuery), [visualQuery]);

  const disabled = !visualQuery.table;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {error && (
        <Alert title="Warning" severity="warning">
          {error}
        </Alert>
      )}

      <TableSelector
        datasourceUid={datasourceUid}
        table={visualQuery.table}
        onChange={handleTableChange}
      />

      <ColumnSelector
        datasourceUid={datasourceUid}
        table={visualQuery.table}
        selectedColumns={visualQuery.columns}
        onChange={handleColumnsChange}
        label="Select Columns"
        tooltip="Columns to include in the SELECT clause (leave empty for *)"
        placeholder="Select columns or leave empty for *"
      />

      <FilterEditor
        filters={visualQuery.filters}
        onChange={handleFiltersChange}
        columns={columnOptions}
        disabled={disabled}
      />

      <AggregationEditor
        aggregations={visualQuery.aggregations}
        onChange={handleAggregationsChange}
        groupByColumns={visualQuery.groupBy}
        onGroupByChange={handleGroupByChange}
        columns={columnOptions}
        disabled={disabled}
      />

      <OrderByEditor
        orderBy={visualQuery.orderBy}
        onChange={handleOrderByChange}
        limit={visualQuery.limit}
        onLimitChange={handleLimitChange}
        columns={columnOptions}
        disabled={disabled}
      />

      {/* Time Series Configuration */}
      <Collapse
        label="Time Series Options"
        isOpen={visualQuery.timeSeries?.enabled ?? false}
        onToggle={() => {
          const newEnabled = !(visualQuery.timeSeries?.enabled ?? false);
          onChange({
            ...visualQuery,
            timeSeries: {
              ...visualQuery.timeSeries,
              enabled: newEnabled,
              autoApplyTimeFilter: newEnabled ? visualQuery.timeSeries?.autoApplyTimeFilter ?? true : false,
            },
          });
        }}
        collapsible={true}
      >
        <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <InlineFieldRow>
            <InlineField label="Time Column" labelWidth={16} tooltip="Select the column containing timestamp data for time series visualization">
              <Select
                width={30}
                options={timeColumnOptions}
                value={visualQuery.timeSeries?.timeColumn ? { value: visualQuery.timeSeries.timeColumn, label: visualQuery.timeSeries.timeColumn } : undefined}
                onChange={handleTimeColumnChange}
                placeholder="Select time column"
                isClearable
                disabled={disabled}
              />
            </InlineField>
          </InlineFieldRow>
          <InlineFieldRow>
            <InlineField 
              label="Auto Time Filter" 
              labelWidth={16} 
              tooltip="Automatically add $__timeFilter() macro to filter data by Grafana's time range"
            >
              <Checkbox
                value={visualQuery.timeSeries?.autoApplyTimeFilter ?? false}
                onChange={handleAutoTimeFilterChange}
                disabled={disabled || !visualQuery.timeSeries?.timeColumn}
              />
            </InlineField>
          </InlineFieldRow>
          {visualQuery.timeSeries?.autoApplyTimeFilter && visualQuery.timeSeries?.timeColumn && (
            <Alert title="Time Filter Info" severity="info">
              The query will include: <code>$__timeFilter({visualQuery.timeSeries.timeColumn})</code> which filters data based on the dashboard/explore time range.
            </Alert>
          )}
        </div>
      </Collapse>

      <Collapse
        label="Generated SQL Preview"
        isOpen={sqlPreviewOpen}
        onToggle={() => setSqlPreviewOpen(!sqlPreviewOpen)}
        collapsible={true}
      >
        <CodeEditor
          language="sql"
          value={generatedSQL || '-- Select a table to generate SQL'}
          height="100px"
          readOnly
          showMiniMap={false}
          showLineNumbers={false}
        />
      </Collapse>
    </div>
  );
};

export type { VisualQuery, FilterCondition, AggregationConfig, OrderByConfig, TimeSeriesConfig };
