import React from 'react';
import { SelectableValue } from '@grafana/data';
import { InlineField, Select, Input, Stack, RadioButtonGroup } from '@grafana/ui';

interface OrderByConfig {
  column: string;
  direction: 'ASC' | 'DESC';
}

interface OrderByEditorProps {
  orderBy: OrderByConfig[];
  onChange: (orderBy: OrderByConfig[]) => void;
  limit: number | undefined;
  onLimitChange: (limit: number | undefined) => void;
  columns: Array<SelectableValue<string>>;
  disabled?: boolean;
}

const DIRECTION_OPTIONS = [
  { label: 'ASC', value: 'ASC' as const },
  { label: 'DESC', value: 'DESC' as const },
];

export const OrderByEditor: React.FC<OrderByEditorProps> = ({
  orderBy,
  onChange,
  limit,
  onLimitChange,
  columns,
  disabled,
}) => {
  const updateOrderBy = (index: number, field: keyof OrderByConfig, value: string) => {
    const newOrderBy = [...orderBy];
    newOrderBy[index] = { ...newOrderBy[index], [field]: value as any };
    onChange(newOrderBy);
  };

  const addOrderBy = () => {
    onChange([...orderBy, { column: '', direction: 'ASC' }]);
  };

  const removeOrderBy = (index: number) => {
    const newOrderBy = orderBy.filter((_, i) => i !== index);
    onChange(newOrderBy);
  };

  return (
    <div>
      <InlineField label="Order By" labelWidth={20} tooltip="Sort results by column">
        <button
          type="button"
          className="gf-form-btn"
          onClick={addOrderBy}
          disabled={disabled}
          style={{ padding: '4px 8px' }}
        >
          + Add
        </button>
      </InlineField>

      {orderBy.map((ob, index) => (
        <Stack key={index} direction="row" gap={1} alignItems="center">
          <Select
            width={25}
            value={ob.column ? { label: ob.column, value: ob.column } : undefined}
            options={columns}
            onChange={(v) => updateOrderBy(index, 'column', v?.value || '')}
            placeholder="Column"
            disabled={disabled}
            aria-label={`Order by ${index + 1} column`}
          />
          <RadioButtonGroup
            options={DIRECTION_OPTIONS}
            value={ob.direction}
            onChange={(v) => updateOrderBy(index, 'direction', v)}
            disabled={disabled}
          />
          <button
            type="button"
            className="gf-form-btn btn-secondary"
            onClick={() => removeOrderBy(index)}
            disabled={disabled}
            style={{ padding: '4px 8px' }}
          >
            ✕
          </button>
        </Stack>
      ))}

      <InlineField label="Limit" labelWidth={20} tooltip="Maximum number of rows to return">
        <Input
          width={20}
          type="number"
          value={limit ?? ''}
          onChange={(e) => {
            const val = e.currentTarget.value;
            onLimitChange(val ? parseInt(val, 10) : undefined);
          }}
          placeholder="e.g., 100"
          disabled={disabled}
          aria-label="Result limit"
        />
      </InlineField>
    </div>
  );
};
