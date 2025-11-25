import React, { useEffect, useState } from 'react';
import { SelectableValue } from '@grafana/data';
import { getBackendSrv } from '@grafana/runtime';
import { InlineField, Select } from '@grafana/ui';

interface TableSelectorProps {
  datasourceUid: string;
  table: string | undefined;
  onChange: (table: string) => void;
}

export const TableSelector: React.FC<TableSelectorProps> = ({ datasourceUid, table, onChange }) => {
  const [tables, setTables] = useState<Array<SelectableValue<string>>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchTables = async () => {
      if (!datasourceUid) {
        return;
      }
      
      setLoading(true);
      try {
        const response = await getBackendSrv().datasourceRequest({
          url: `/api/datasources/uid/${datasourceUid}/resources/tables`,
          method: 'GET',
        });

        if (response?.data?.tables) {
          const tableOptions = response.data.tables.map((t: string) => ({
            label: t,
            value: t,
          }));
          setTables(tableOptions);
        }
      } catch (error) {
        console.error('Failed to fetch tables:', error);
        setTables([]);
      } finally {
        setLoading(false);
      }
    };

    fetchTables();
  }, [datasourceUid]);

  const handleChange = (selected: SelectableValue<string>) => {
    if (selected?.value) {
      onChange(selected.value);
    }
  };

  return (
    <InlineField label="Table" labelWidth={20} tooltip="Select the table to query">
      <Select
        width={40}
        value={table ? { label: table, value: table } : undefined}
        options={tables}
        onChange={handleChange}
        isLoading={loading}
        placeholder="Select table..."
        isClearable
        aria-label="Table selector"
      />
    </InlineField>
  );
};
