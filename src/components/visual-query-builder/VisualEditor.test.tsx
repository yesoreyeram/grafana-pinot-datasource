import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// Import component types for testing generateSQL
import { generateSQL, defaultVisualQuery } from './VisualEditor';
import type { VisualQuery, FilterCondition, AggregationConfig, OrderByConfig } from './VisualEditor';

// Mock @grafana/runtime
jest.mock('@grafana/runtime', () => ({
  getBackendSrv: () => ({
    datasourceRequest: jest.fn().mockResolvedValue({
      data: {
        tables: ['table1', 'table2', 'table3'],
        columns: [
          { name: 'id', type: 'INT' },
          { name: 'name', type: 'STRING' },
          { name: 'timestamp', type: 'TIMESTAMP' },
        ],
      },
    }),
  }),
}));

// Mock @grafana/ui
jest.mock('@grafana/ui', () => ({
  InlineField: ({ children, label }: any) => (
    <div data-testid="inline-field">
      <label>{label}</label>
      {children}
    </div>
  ),
  Select: ({ value, onChange, options, placeholder, 'aria-label': ariaLabel }: any) => (
    <select
      value={value?.value || ''}
      onChange={(e) => {
        const option = options?.find((opt: any) => opt.value === e.target.value);
        if (option) {
          onChange(option);
        }
      }}
      data-testid={ariaLabel || 'select'}
    >
      <option value="">{placeholder || 'Select...'}</option>
      {options?.map((opt: any) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  ),
  MultiSelect: ({ value, onChange, options, placeholder }: any) => (
    <select
      multiple
      data-testid="multi-select"
    >
      {options?.map((opt: any) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  ),
  Input: ({ value, onChange, placeholder }: any) => (
    <input
      type="text"
      value={value || ''}
      onChange={onChange}
      placeholder={placeholder}
      data-testid="input"
    />
  ),
  Stack: ({ children }: any) => <div data-testid="stack">{children}</div>,
  IconButton: ({ name, onClick, tooltip }: any) => (
    <button onClick={onClick} data-testid={`icon-button-${name}`} title={tooltip}>
      {name}
    </button>
  ),
  Collapse: ({ label, children, isOpen, onToggle }: any) => (
    <div data-testid="collapse">
      <button onClick={onToggle}>{label}</button>
      {isOpen && <div>{children}</div>}
    </div>
  ),
  Alert: ({ title, children }: any) => (
    <div data-testid="alert">
      <strong>{title}</strong>
      {children}
    </div>
  ),
  CodeEditor: ({ value }: any) => (
    <pre data-testid="code-editor">{value}</pre>
  ),
  RadioButtonGroup: ({ value, onChange, options }: any) => (
    <div data-testid="radio-button-group">
      {options?.map((opt: any) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={value === opt.value ? 'active' : ''}
        >
          {opt.label}
        </button>
      ))}
    </div>
  ),
}));

describe('generateSQL', () => {
  it('should return empty string when no table is selected', () => {
    const visualQuery: VisualQuery = {
      ...defaultVisualQuery,
      table: undefined,
    };
    
    expect(generateSQL(visualQuery)).toBe('');
  });

  it('should generate basic SELECT * query', () => {
    const visualQuery: VisualQuery = {
      ...defaultVisualQuery,
      table: 'users',
      columns: [],
      limit: 100,
    };
    
    expect(generateSQL(visualQuery)).toBe('SELECT * FROM users LIMIT 100');
  });

  it('should generate SELECT with specific columns', () => {
    const visualQuery: VisualQuery = {
      ...defaultVisualQuery,
      table: 'users',
      columns: ['id', 'name', 'email'],
      limit: 50,
    };
    
    expect(generateSQL(visualQuery)).toBe('SELECT id, name, email FROM users LIMIT 50');
  });

  it('should generate query with WHERE clause', () => {
    const visualQuery: VisualQuery = {
      ...defaultVisualQuery,
      table: 'users',
      columns: ['id', 'name'],
      filters: [
        { column: 'status', operator: '=', value: 'active' },
      ],
      limit: 100,
    };
    
    expect(generateSQL(visualQuery)).toBe("SELECT id, name FROM users WHERE status = 'active' LIMIT 100");
  });

  it('should generate query with multiple filters', () => {
    const visualQuery: VisualQuery = {
      ...defaultVisualQuery,
      table: 'orders',
      columns: ['*'],
      filters: [
        { column: 'status', operator: '=', value: 'completed' },
        { column: 'amount', operator: '>', value: '100' },
      ],
      limit: 100,
    };
    
    expect(generateSQL(visualQuery)).toBe("SELECT * FROM orders WHERE status = 'completed' AND amount > 100 LIMIT 100");
  });

  it('should handle IS NULL operator', () => {
    const visualQuery: VisualQuery = {
      ...defaultVisualQuery,
      table: 'users',
      columns: [],
      filters: [
        { column: 'deleted_at', operator: 'IS NULL', value: '' },
      ],
      limit: 100,
    };
    
    expect(generateSQL(visualQuery)).toBe('SELECT * FROM users WHERE deleted_at IS NULL LIMIT 100');
  });

  it('should handle IS NOT NULL operator', () => {
    const visualQuery: VisualQuery = {
      ...defaultVisualQuery,
      table: 'users',
      columns: [],
      filters: [
        { column: 'email', operator: 'IS NOT NULL', value: '' },
      ],
      limit: 100,
    };
    
    expect(generateSQL(visualQuery)).toBe('SELECT * FROM users WHERE email IS NOT NULL LIMIT 100');
  });

  it('should handle LIKE operator', () => {
    const visualQuery: VisualQuery = {
      ...defaultVisualQuery,
      table: 'users',
      columns: [],
      filters: [
        { column: 'name', operator: 'LIKE', value: '%john%' },
      ],
      limit: 100,
    };
    
    expect(generateSQL(visualQuery)).toBe("SELECT * FROM users WHERE name LIKE '%john%' LIMIT 100");
  });

  it('should handle IN operator with comma-separated values', () => {
    const visualQuery: VisualQuery = {
      ...defaultVisualQuery,
      table: 'orders',
      columns: [],
      filters: [
        { column: 'status', operator: 'IN', value: 'pending,active' },
      ],
      limit: 100,
    };
    
    expect(generateSQL(visualQuery)).toBe("SELECT * FROM orders WHERE status IN ('pending', 'active') LIMIT 100");
  });

  it('should handle IN operator with pre-quoted values', () => {
    const visualQuery: VisualQuery = {
      ...defaultVisualQuery,
      table: 'orders',
      columns: [],
      filters: [
        { column: 'status', operator: 'IN', value: "'pending','active'" },
      ],
      limit: 100,
    };
    
    expect(generateSQL(visualQuery)).toBe("SELECT * FROM orders WHERE status IN ('pending','active') LIMIT 100");
  });

  it('should generate query with aggregations', () => {
    const visualQuery: VisualQuery = {
      ...defaultVisualQuery,
      table: 'orders',
      columns: [],
      aggregations: [
        { func: 'COUNT', column: '*' },
        { func: 'SUM', column: 'amount' },
      ],
      limit: 100,
    };
    
    expect(generateSQL(visualQuery)).toBe('SELECT COUNT(*), SUM(amount) FROM orders LIMIT 100');
  });

  it('should generate query with GROUP BY', () => {
    const visualQuery: VisualQuery = {
      ...defaultVisualQuery,
      table: 'orders',
      columns: ['status'],
      aggregations: [
        { func: 'COUNT', column: '*' },
      ],
      groupBy: ['status'],
      limit: 100,
    };
    
    expect(generateSQL(visualQuery)).toBe('SELECT status, COUNT(*) FROM orders GROUP BY status LIMIT 100');
  });

  it('should generate query with ORDER BY', () => {
    const visualQuery: VisualQuery = {
      ...defaultVisualQuery,
      table: 'users',
      columns: ['id', 'name'],
      orderBy: [
        { column: 'name', direction: 'ASC' },
      ],
      limit: 100,
    };
    
    expect(generateSQL(visualQuery)).toBe('SELECT id, name FROM users ORDER BY name ASC LIMIT 100');
  });

  it('should generate query with multiple ORDER BY', () => {
    const visualQuery: VisualQuery = {
      ...defaultVisualQuery,
      table: 'users',
      columns: [],
      orderBy: [
        { column: 'created_at', direction: 'DESC' },
        { column: 'name', direction: 'ASC' },
      ],
      limit: 100,
    };
    
    expect(generateSQL(visualQuery)).toBe('SELECT * FROM users ORDER BY created_at DESC, name ASC LIMIT 100');
  });

  it('should generate complex query with all clauses', () => {
    const visualQuery: VisualQuery = {
      table: 'orders',
      columns: ['customer_id'],
      filters: [
        { column: 'status', operator: '=', value: 'completed' },
      ],
      aggregations: [
        { func: 'SUM', column: 'amount' },
        { func: 'COUNT', column: '*' },
      ],
      groupBy: ['customer_id'],
      orderBy: [
        { column: 'customer_id', direction: 'DESC' },
      ],
      limit: 50,
    };
    
    expect(generateSQL(visualQuery)).toBe(
      "SELECT customer_id, SUM(amount), COUNT(*) FROM orders WHERE status = 'completed' GROUP BY customer_id ORDER BY customer_id DESC LIMIT 50"
    );
  });

  it('should handle query without LIMIT', () => {
    const visualQuery: VisualQuery = {
      ...defaultVisualQuery,
      table: 'users',
      columns: [],
      limit: undefined,
    };
    
    expect(generateSQL(visualQuery)).toBe('SELECT * FROM users');
  });

  it('should handle numeric filter values', () => {
    const visualQuery: VisualQuery = {
      ...defaultVisualQuery,
      table: 'orders',
      columns: [],
      filters: [
        { column: 'amount', operator: '>=', value: '1000' },
      ],
      limit: 100,
    };
    
    expect(generateSQL(visualQuery)).toBe('SELECT * FROM orders WHERE amount >= 1000 LIMIT 100');
  });
});

describe('defaultVisualQuery', () => {
  it('should have correct default values', () => {
    expect(defaultVisualQuery).toEqual({
      table: undefined,
      columns: [],
      filters: [],
      aggregations: [],
      groupBy: [],
      orderBy: [],
      limit: 100,
    });
  });
});
