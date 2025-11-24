import React from 'react';
import { QueryEditorProps, SelectableValue } from '@grafana/data';
import { InlineField, InlineFieldRow, Select, Input } from '@grafana/ui';
import { SQLEditor } from '@grafana/plugin-ui';
import { PinotQuery, QueryFormat } from '../types';

type Props = QueryEditorProps<any, PinotQuery, any>;

const FORMAT_OPTIONS: Array<SelectableValue<QueryFormat>> = [
  { label: 'Time series', value: QueryFormat.Timeseries },
  { label: 'Table', value: QueryFormat.Table },
];

export const QueryEditor: React.FC<Props> = ({ query, onChange, onRunQuery }) => {
  const {
    rawSql = '',
    format = QueryFormat.Table,
    timeColumn = '',
  } = query;

  const onSqlChange = (sql: string) => {
    onChange({ ...query, rawSql: sql });
  };

  const onFormatChange = (selectable: SelectableValue<QueryFormat>) => {
    onChange({ ...query, format: selectable.value });
    onRunQuery();
  };

  const onTimeColumnChange = (e: React.FormEvent<HTMLInputElement>) => {
    onChange({ ...query, timeColumn: e.currentTarget.value });
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
        query={rawSql}
        onChange={onSqlChange}
        onBlur={onRunQuery}
      />
    </>
  );
};
