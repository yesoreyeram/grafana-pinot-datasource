import React from 'react';
import { SelectableValue } from '@grafana/data';
import { InlineField, MultiSelect, Select, Stack } from '@grafana/ui';

interface AggregationConfig {
  func: string;
  column: string;
  alias?: string;
}

interface AggregationEditorProps {
  aggregations: AggregationConfig[];
  onChange: (aggregations: AggregationConfig[]) => void;
  groupByColumns: string[];
  onGroupByChange: (columns: string[]) => void;
  columns: Array<SelectableValue<string>>;
  disabled?: boolean;
}

const AGGREGATION_FUNCTIONS: Array<SelectableValue<string>> = [
  { label: 'COUNT', value: 'COUNT' },
  { label: 'SUM', value: 'SUM' },
  { label: 'AVG', value: 'AVG' },
  { label: 'MIN', value: 'MIN' },
  { label: 'MAX', value: 'MAX' },
  { label: 'DISTINCTCOUNT', value: 'DISTINCTCOUNT' },
  { label: 'DISTINCTCOUNTSMARTHLL', value: 'DISTINCTCOUNTSMARTHLL' },
  { label: 'PERCENTILE', value: 'PERCENTILE' },
  { label: 'PERCENTILETDIGEST', value: 'PERCENTILETDIGEST' },
];

export const AggregationEditor: React.FC<AggregationEditorProps> = ({
  aggregations,
  onChange,
  groupByColumns,
  onGroupByChange,
  columns,
  disabled,
}) => {
  const updateAggregation = (index: number, field: keyof AggregationConfig, value: string) => {
    const newAggregations = [...aggregations];
    newAggregations[index] = { ...newAggregations[index], [field]: value };
    onChange(newAggregations);
  };

  const addAggregation = () => {
    onChange([...aggregations, { func: 'COUNT', column: '*' }]);
  };

  const removeAggregation = (index: number) => {
    const newAggregations = aggregations.filter((_, i) => i !== index);
    onChange(newAggregations);
  };

  const handleGroupByChange = (selected: Array<SelectableValue<string>>) => {
    const values = selected.map((s) => s.value!).filter(Boolean);
    onGroupByChange(values);
  };

  const groupByValues = groupByColumns.map((col) => ({
    label: col,
    value: col,
  }));

  // Add * option for COUNT(*)
  const columnOptions = [{ label: '*', value: '*' }, ...columns];

  return (
    <div>
      <InlineField label="Aggregations" labelWidth={20} tooltip="Add aggregation functions">
        <button
          type="button"
          className="gf-form-btn"
          onClick={addAggregation}
          disabled={disabled}
          style={{ padding: '4px 8px' }}
        >
          + Add
        </button>
      </InlineField>

      {aggregations.map((agg, index) => (
        <Stack key={index} direction="row" gap={1} alignItems="center" wrap="wrap">
          <Select
            width={20}
            value={{ label: agg.func, value: agg.func }}
            options={AGGREGATION_FUNCTIONS}
            onChange={(v) => updateAggregation(index, 'func', v?.value || 'COUNT')}
            disabled={disabled}
            aria-label={`Aggregation ${index + 1} function`}
          />
          <span>(</span>
          <Select
            width={20}
            value={agg.column ? { label: agg.column, value: agg.column } : undefined}
            options={columnOptions}
            onChange={(v) => updateAggregation(index, 'column', v?.value || '*')}
            placeholder="Column"
            disabled={disabled}
            aria-label={`Aggregation ${index + 1} column`}
          />
          <span>)</span>
          <button
            type="button"
            className="gf-form-btn btn-secondary"
            onClick={() => removeAggregation(index)}
            disabled={disabled}
            style={{ padding: '4px 8px' }}
          >
            ✕
          </button>
        </Stack>
      ))}

      {aggregations.length > 0 && (
        <InlineField label="Group By" labelWidth={20} tooltip="Columns to group results by" grow>
          <MultiSelect
            width={60}
            value={groupByValues}
            options={columns}
            onChange={handleGroupByChange}
            placeholder="Select group by columns..."
            isClearable
            disabled={disabled}
            aria-label="Group by columns"
          />
        </InlineField>
      )}
    </div>
  );
};
