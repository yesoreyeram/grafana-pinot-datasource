import React from 'react';
import { SelectableValue } from '@grafana/data';
import { InlineField, Select, Input, IconButton, Stack } from '@grafana/ui';

interface FilterCondition {
  column: string;
  operator: string;
  value: string;
}

interface FilterEditorProps {
  filters: FilterCondition[];
  onChange: (filters: FilterCondition[]) => void;
  columns: Array<SelectableValue<string>>;
  disabled?: boolean;
}

const OPERATORS: Array<SelectableValue<string>> = [
  { label: '=', value: '=' },
  { label: '!=', value: '!=' },
  { label: '>', value: '>' },
  { label: '>=', value: '>=' },
  { label: '<', value: '<' },
  { label: '<=', value: '<=' },
  { label: 'LIKE', value: 'LIKE' },
  { label: 'NOT LIKE', value: 'NOT LIKE' },
  { label: 'IN', value: 'IN' },
  { label: 'NOT IN', value: 'NOT IN' },
  { label: 'IS NULL', value: 'IS NULL' },
  { label: 'IS NOT NULL', value: 'IS NOT NULL' },
];

export const FilterEditor: React.FC<FilterEditorProps> = ({ filters, onChange, columns, disabled }) => {
  const updateFilter = (index: number, field: keyof FilterCondition, value: string) => {
    const newFilters = [...filters];
    newFilters[index] = { ...newFilters[index], [field]: value };
    onChange(newFilters);
  };

  const addFilter = () => {
    onChange([...filters, { column: '', operator: '=', value: '' }]);
  };

  const removeFilter = (index: number) => {
    const newFilters = filters.filter((_, i) => i !== index);
    onChange(newFilters);
  };

  const needsValue = (operator: string) => {
    return !['IS NULL', 'IS NOT NULL'].includes(operator);
  };

  return (
    <div>
      <InlineField label="Filters" labelWidth={20} tooltip="Add WHERE conditions to filter results">
        <IconButton
          name="plus"
          onClick={addFilter}
          disabled={disabled}
          tooltip="Add filter"
          aria-label="Add filter"
        />
      </InlineField>

      {filters.map((filter, index) => (
        <Stack key={index} direction="row" gap={1} alignItems="center">
          <Select
            width={25}
            value={filter.column ? { label: filter.column, value: filter.column } : undefined}
            options={columns}
            onChange={(v) => updateFilter(index, 'column', v?.value || '')}
            placeholder="Column"
            disabled={disabled}
            aria-label={`Filter ${index + 1} column`}
          />
          <Select
            width={15}
            value={{ label: filter.operator, value: filter.operator }}
            options={OPERATORS}
            onChange={(v) => updateFilter(index, 'operator', v?.value || '=')}
            disabled={disabled}
            aria-label={`Filter ${index + 1} operator`}
          />
          {needsValue(filter.operator) && (
            <Input
              width={25}
              value={filter.value}
              onChange={(e) => updateFilter(index, 'value', e.currentTarget.value)}
              placeholder="Value"
              disabled={disabled}
              aria-label={`Filter ${index + 1} value`}
            />
          )}
          <IconButton
            name="trash-alt"
            onClick={() => removeFilter(index)}
            disabled={disabled}
            tooltip="Remove filter"
            aria-label={`Remove filter ${index + 1}`}
          />
        </Stack>
      ))}
    </div>
  );
};
