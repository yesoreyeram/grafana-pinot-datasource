import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { SelectableValue } from '@grafana/data';
import { getBackendSrv } from '@grafana/runtime';
import { Collapse, Alert, CodeEditor } from '@grafana/ui';
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

interface VisualQuery {
  table?: string;
  columns: string[];
  filters: FilterCondition[];
  aggregations: AggregationConfig[];
  groupBy: string[];
  orderBy: OrderByConfig[];
  limit?: number;
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
};

/**
 * Generates SQL from the visual query configuration
 */
export const generateSQL = (visualQuery: VisualQuery): string => {
  const { table, columns, filters, aggregations, groupBy, orderBy, limit } = visualQuery;

  if (!table) {
    return '';
  }

  // Build SELECT clause
  let selectParts: string[] = [];
  
  // Add selected columns
  if (columns.length > 0) {
    selectParts = [...columns];
  }
  
  // Add aggregations
  aggregations.forEach((agg) => {
    const aggStr = `${agg.func}(${agg.column})`;
    selectParts.push(agg.alias ? `${aggStr} AS ${agg.alias}` : aggStr);
  });
  
  // Default to * if nothing selected
  if (selectParts.length === 0) {
    selectParts = ['*'];
  }

  let sql = `SELECT ${selectParts.join(', ')} FROM ${table}`;

  // Build WHERE clause
  if (filters.length > 0) {
    const whereConditions = filters
      .filter((f) => f.column && f.operator)
      .map((f) => {
        const needsValue = !['IS NULL', 'IS NOT NULL'].includes(f.operator);
        if (!needsValue) {
          return `${f.column} ${f.operator}`;
        }
        
        // Handle IN/NOT IN with list values
        if (['IN', 'NOT IN'].includes(f.operator)) {
          const values = f.value.includes(',') ? f.value : `'${f.value}'`;
          return `${f.column} ${f.operator} (${values})`;
        }
        
        // Handle LIKE patterns
        if (['LIKE', 'NOT LIKE'].includes(f.operator)) {
          return `${f.column} ${f.operator} '${f.value}'`;
        }
        
        // Check if value is numeric
        const isNumeric = !isNaN(Number(f.value)) && f.value.trim() !== '';
        const formattedValue = isNumeric ? f.value : `'${f.value}'`;
        
        return `${f.column} ${f.operator} ${formattedValue}`;
      });
    
    if (whereConditions.length > 0) {
      sql += ` WHERE ${whereConditions.join(' AND ')}`;
    }
  }

  // Build GROUP BY clause
  if (groupBy.length > 0) {
    sql += ` GROUP BY ${groupBy.join(', ')}`;
  }

  // Build ORDER BY clause
  if (orderBy.length > 0) {
    const orderParts = orderBy
      .filter((o) => o.column)
      .map((o) => `${o.column} ${o.direction}`);
    
    if (orderParts.length > 0) {
      sql += ` ORDER BY ${orderParts.join(', ')}`;
    }
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
        setError('Failed to fetch table schema. Controller may not be configured.');
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

export type { VisualQuery, FilterCondition, AggregationConfig, OrderByConfig };
