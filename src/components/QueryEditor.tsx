import React, { useCallback, useMemo } from 'react';
import { QueryEditorProps, SelectableValue } from '@grafana/data';
import { InlineField, InlineFieldRow, Select, Input, RadioButtonGroup } from '@grafana/ui';
import { SQLEditor } from '@grafana/plugin-ui';
import { PinotQuery, QueryFormat, EditorMode } from '../types';
import { VisualEditor, VisualQuery, defaultVisualQuery, generateSQL } from './visual-query-builder';

type Props = QueryEditorProps<any, PinotQuery, any>;

const FORMAT_OPTIONS: Array<SelectableValue<QueryFormat>> = [
  { label: 'Time series', value: QueryFormat.Timeseries },
  { label: 'Table', value: QueryFormat.Table },
];

const EDITOR_MODE_OPTIONS = [
  { label: 'Builder', value: EditorMode.Builder },
  { label: 'Code', value: EditorMode.Code },
];

export const QueryEditor: React.FC<Props> = ({ query, onChange, onRunQuery, datasource }) => {
  const {
    rawSql = '',
    format = QueryFormat.Table,
    timeColumn = '',
    editorMode = EditorMode.Builder,
    sql,
  } = query;

  // Get datasource UID for API calls
  const datasourceUid = datasource?.uid || '';

  // Parse visual query from sql property or create default
  const visualQuery: VisualQuery = useMemo(() => {
    if (sql) {
      return {
        table: (query as any).table || undefined,
        columns: sql.columns?.map((c: any) => c.name || c.parameters?.[0]?.name).filter(Boolean) || [],
        filters: sql.where?.map((w: any) => ({
          column: w.property?.name || '',
          operator: w.type || '=',
          value: w.name || '',
        })) || [],
        aggregations: [],
        groupBy: sql.groupBy?.map((g: any) => g.property?.name).filter(Boolean) || [],
        orderBy: sql.orderBy?.map((o: any) => ({
          column: o.property?.name || '',
          direction: (o.type === 'DESC' ? 'DESC' : 'ASC') as 'ASC' | 'DESC',
        })).filter((o: any) => o.column) || [],
        limit: sql.limit,
      };
    }
    return { ...defaultVisualQuery };
  }, [sql, query]);

  const onEditorModeChange = useCallback((mode: EditorMode) => {
    if (mode === EditorMode.Code && editorMode === EditorMode.Builder) {
      // Switching from builder to code - generate SQL
      const generatedSql = generateSQL(visualQuery);
      onChange({ ...query, editorMode: mode, rawSql: generatedSql || rawSql });
    } else {
      onChange({ ...query, editorMode: mode });
    }
  }, [onChange, query, editorMode, visualQuery, rawSql]);

  const onSqlChange = useCallback((sql: string) => {
    onChange({ ...query, rawSql: sql });
  }, [onChange, query]);

  const onFormatChange = useCallback((selectable: SelectableValue<QueryFormat>) => {
    onChange({ ...query, format: selectable.value });
    onRunQuery();
  }, [onChange, onRunQuery, query]);

  const onTimeColumnChange = useCallback((e: React.FormEvent<HTMLInputElement>) => {
    onChange({ ...query, timeColumn: e.currentTarget.value });
  }, [onChange, query]);

  const onVisualQueryChange = useCallback((newVisualQuery: VisualQuery) => {
    // Convert visual query to PinotQuery sql structure
    const sqlStructure = {
      columns: newVisualQuery.columns.map(c => ({ type: 'column', name: c })),
      where: newVisualQuery.filters.map(f => ({
        type: f.operator,
        property: { type: 'string', name: f.column },
        name: f.value,
      })),
      groupBy: newVisualQuery.groupBy.map(g => ({
        type: 'groupBy',
        property: { type: 'string', name: g },
      })),
      orderBy: newVisualQuery.orderBy.map(o => ({
        type: o.direction,
        property: { type: 'string', name: o.column },
      })),
      limit: newVisualQuery.limit,
    };

    // Generate SQL from visual query
    const generatedSql = generateSQL(newVisualQuery);

    onChange({
      ...query,
      table: newVisualQuery.table,
      sql: sqlStructure,
      rawSql: generatedSql,
    });
  }, [onChange, query]);

  const handleRunQuery = useCallback(() => {
    onRunQuery();
  }, [onRunQuery]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <InlineFieldRow>
        <InlineField label="Mode" labelWidth={10}>
          <RadioButtonGroup
            options={EDITOR_MODE_OPTIONS}
            value={editorMode}
            onChange={onEditorModeChange}
          />
        </InlineField>
        <InlineField label="Format" labelWidth={10}>
          <Select
            width={20}
            value={format}
            options={FORMAT_OPTIONS}
            onChange={onFormatChange}
            aria-label="Query format"
          />
        </InlineField>
        {format === QueryFormat.Timeseries && (
          <InlineField label="Time Column" labelWidth={15} tooltip="Column name containing timestamp data">
            <Input
              width={20}
              value={timeColumn}
              onChange={onTimeColumnChange}
              onBlur={onRunQuery}
              placeholder="e.g., timestamp"
              aria-label="Time column"
            />
          </InlineField>
        )}
      </InlineFieldRow>

      {editorMode === EditorMode.Builder ? (
        <VisualEditor
          datasourceUid={datasourceUid}
          visualQuery={visualQuery}
          onChange={onVisualQueryChange}
          onRunQuery={handleRunQuery}
        />
      ) : (
        <SQLEditor
          query={rawSql}
          onChange={onSqlChange}
          onBlur={onRunQuery}
        />
      )}
    </div>
  );
};
