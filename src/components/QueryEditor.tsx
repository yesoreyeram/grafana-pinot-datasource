import React from 'react';
import { QueryEditorProps, SelectableValue } from '@grafana/data';
import { InlineField, InlineFieldRow, Select, Input } from '@grafana/ui';
import { SQLEditor } from '@grafana/plugin-ui';
import { PinotQuery, EditorMode, QueryFormat } from '../types';

type Props = QueryEditorProps<any, PinotQuery, any>;

const FORMAT_OPTIONS: Array<SelectableValue<QueryFormat>> = [
  { label: 'Time series', value: QueryFormat.Timeseries },
  { label: 'Table', value: QueryFormat.Table },
];

export const QueryEditor: React.FC<Props> = ({ query, onChange, onRunQuery, datasource }) => {
  const {
    rawSql = '',
    editorMode = EditorMode.Code,
    format = QueryFormat.Table,
    table = '',
    dataset = '',
    sql = {},
    timeColumn = '',
  } = query;

  const onSqlChange = (rawSql: string) => {
    onChange({ ...query, rawSql });
  };

  const onEditorModeChange = (editorMode: EditorMode) => {
    onChange({ ...query, editorMode });
  };

  const onFormatChange = (selectable: SelectableValue<QueryFormat>) => {
    onChange({ ...query, format: selectable.value });
    onRunQuery();
  };

  const onTimeColumnChange = (e: React.FormEvent<HTMLInputElement>) => {
    onChange({ ...query, timeColumn: e.currentTarget.value });
  };

  const onTableChange = (table: string) => {
    onChange({ ...query, table });
  };

  const onDatasetChange = (dataset: string) => {
    onChange({ ...query, dataset });
  };

  const onSqlBuilderChange = (sql: any) => {
    onChange({ ...query, sql });
  };

  return (
    <>
      <InlineFieldRow>
        <InlineField label="Format" labelWidth={20}>
          <Select
            width={25}
            value={format}
            options={FORMAT_OPTIONS}
            onChange={onFormatChange}
            aria-label="Query format"
          />
        </InlineField>
        {format === QueryFormat.Timeseries && (
          <InlineField label="Time Column" labelWidth={20} tooltip="Column name containing timestamp data">
            <Input
              width={25}
              value={timeColumn}
              onChange={onTimeColumnChange}
              onBlur={onRunQuery}
              placeholder="e.g., timestamp, created_at"
              aria-label="Time column"
            />
          </InlineField>
        )}
      </InlineFieldRow>

      <SQLEditor
        query={{
          rawSql,
          editorMode,
          table,
          dataset,
          sql,
        }}
        onChange={(q) => {
          const newQuery = { ...query };
          if (q.rawSql !== undefined) newQuery.rawSql = q.rawSql;
          if (q.editorMode !== undefined) newQuery.editorMode = q.editorMode as EditorMode;
          if (q.table !== undefined) newQuery.table = q.table;
          if (q.dataset !== undefined) newQuery.dataset = q.dataset;
          if (q.sql !== undefined) newQuery.sql = q.sql;
          onChange(newQuery);
        }}
        onRunQuery={onRunQuery}
        datasource={{
          getDB: async () => {
            // Get list of tables from datasource
            try {
              const resource = await datasource.getResource('tables');
              return {
                tables: resource.tables || [],
              };
            } catch (error) {
              // Log error for debugging - controller may not be configured
              console.warn('Unable to fetch table list from Pinot controller:', error);
              // Return empty list to allow raw SQL mode to work
              return { tables: [] };
            }
          },
          getTable: async (tableName: string) => {
            // Get table schema
            try {
              const resource = await datasource.getResource(`table/${tableName}/schema`);
              return {
                columns: resource.columns || [],
              };
            } catch (error) {
              // Log error for debugging - schema API may not be implemented yet
              console.warn(`Unable to fetch schema for table ${tableName}:`, error);
              // Return empty columns to allow raw SQL mode to work
              return { columns: [] };
            }
          },
        }}
      />
    </>
  );
};
