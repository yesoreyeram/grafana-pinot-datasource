import React, { useEffect, useState } from 'react';
import { SelectableValue } from '@grafana/data';
import { getBackendSrv } from '@grafana/runtime';
import { InlineField, MultiSelect } from '@grafana/ui';

interface ColumnOption {
  name: string;
  type: string;
}

interface ColumnSelectorProps {
  datasourceUid: string;
  table: string | undefined;
  selectedColumns: string[];
  onChange: (columns: string[]) => void;
  label?: string;
  tooltip?: string;
  placeholder?: string;
}

export const ColumnSelector: React.FC<ColumnSelectorProps> = ({
  datasourceUid,
  table,
  selectedColumns,
  onChange,
  label = 'Columns',
  tooltip = 'Select columns to include in the query',
  placeholder = 'Select columns...',
}) => {
  const [columns, setColumns] = useState<Array<SelectableValue<string>>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchColumns = async () => {
      if (!datasourceUid || !table) {
        setColumns([]);
        return;
      }

      setLoading(true);
      try {
        const response = await getBackendSrv().datasourceRequest({
          url: `/api/datasources/uid/${datasourceUid}/resources/table/${table}/schema`,
          method: 'GET',
        });

        if (response?.data?.columns) {
          const columnOptions = response.data.columns.map((col: ColumnOption) => ({
            label: `${col.name} (${col.type})`,
            value: col.name,
            description: col.type,
          }));
          setColumns(columnOptions);
        }
      } catch (error) {
        console.error('Failed to fetch columns:', error);
        setColumns([]);
      } finally {
        setLoading(false);
      }
    };

    fetchColumns();
  }, [datasourceUid, table]);

  const handleChange = (selected: Array<SelectableValue<string>>) => {
    const values = selected.map((s) => s.value!).filter(Boolean);
    onChange(values);
  };

  const selectedValues = selectedColumns.map((col) => ({
    label: col,
    value: col,
  }));

  return (
    <InlineField label={label} labelWidth={20} tooltip={tooltip} grow>
      <MultiSelect
        width={60}
        value={selectedValues}
        options={columns}
        onChange={handleChange}
        isLoading={loading}
        placeholder={placeholder}
        isClearable
        aria-label={label}
        disabled={!table}
      />
    </InlineField>
  );
};
