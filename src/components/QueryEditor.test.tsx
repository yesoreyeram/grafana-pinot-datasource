import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryEditor } from './QueryEditor';
import { QueryFormat, EditorMode } from '../types';

// Mock @grafana/ui components
jest.mock('@grafana/ui', () => ({
  InlineField: ({ children, label }: any) => (
    <div data-testid="inline-field">
      <label>{label}</label>
      {children}
    </div>
  ),
  InlineFieldRow: ({ children }: any) => (
    <div data-testid="inline-field-row">{children}</div>
  ),
  Select: ({ value, onChange, options, 'aria-label': ariaLabel }: any) => (
    <select
      value={value}
      onChange={(e) => {
        const option = options.find((opt: any) => opt.value === e.target.value);
        if (option) {
          onChange(option);
        }
      }}
      data-testid={ariaLabel === 'Query format' ? 'format-select' : 'select'}
    >
      {options.map((opt: any) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  ),
  Input: ({ value, onChange, onBlur, placeholder }: any) => (
    <input
      type="text"
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      placeholder={placeholder}
      data-testid="time-column-input"
    />
  ),
  RadioButtonGroup: ({ value, onChange, options }: any) => (
    <div data-testid="editor-mode-selector">
      {options.map((opt: any) => (
        <button
          key={opt.value}
          data-testid={`mode-${opt.value}`}
          onClick={() => onChange(opt.value)}
          className={value === opt.value ? 'active' : ''}
        >
          {opt.label}
        </button>
      ))}
    </div>
  ),
}));

// Mock @grafana/plugin-ui
jest.mock('@grafana/plugin-ui', () => ({
  SQLEditor: ({ query, onChange, onBlur }: any) => (
    <div data-testid="sql-editor">
      <textarea
        data-testid="sql-textarea"
        value={query || ''}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
    </div>
  ),
}));

// Mock visual query builder components
jest.mock('./visual-query-builder', () => ({
  VisualEditor: ({ visualQuery, onChange, onRunQuery }: any) => (
    <div data-testid="visual-editor">
      <span>Visual Query Builder</span>
      <span data-testid="visual-query-table">{visualQuery.table || 'No table selected'}</span>
    </div>
  ),
  defaultVisualQuery: {
    table: undefined,
    columns: [],
    filters: [],
    aggregations: [],
    groupBy: [],
    orderBy: [],
    limit: 100,
  },
  generateSQL: (visualQuery: any) => {
    if (!visualQuery.table) return '';
    const cols = visualQuery.columns.length > 0 ? visualQuery.columns.join(', ') : '*';
    let sql = `SELECT ${cols} FROM ${visualQuery.table}`;
    if (visualQuery.limit) sql += ` LIMIT ${visualQuery.limit}`;
    return sql;
  },
}));

describe('QueryEditor', () => {
  const mockOnChange = jest.fn();
  const mockOnRunQuery = jest.fn();
  const mockDatasource = {
    uid: 'test-uid',
    getResource: jest.fn().mockResolvedValue({ tables: ['table1', 'table2'] }),
  } as any;

  beforeEach(() => {
    mockOnChange.mockClear();
    mockOnRunQuery.mockClear();
    mockDatasource.getResource.mockClear();
  });

  describe('Rendering', () => {
    it('should render the component with default values in Builder mode', () => {
      const query = {
        refId: 'A',
        rawSql: '',
        format: QueryFormat.Table,
        editorMode: EditorMode.Builder,
      };

      render(
        <QueryEditor
          query={query}
          onChange={mockOnChange}
          onRunQuery={mockOnRunQuery}
          datasource={mockDatasource}
        />
      );

      expect(screen.getByTestId('visual-editor')).toBeInTheDocument();
      expect(screen.getByTestId('format-select')).toBeInTheDocument();
      expect(screen.getByTestId('editor-mode-selector')).toBeInTheDocument();
    });

    it('should render SQL editor when in Code mode', () => {
      const query = {
        refId: 'A',
        rawSql: '',
        format: QueryFormat.Table,
        editorMode: EditorMode.Code,
      };

      render(
        <QueryEditor
          query={query}
          onChange={mockOnChange}
          onRunQuery={mockOnRunQuery}
          datasource={mockDatasource}
        />
      );

      expect(screen.getByTestId('sql-editor')).toBeInTheDocument();
      expect(screen.getByTestId('format-select')).toBeInTheDocument();
    });

    it('should render format select with correct options', () => {
      const query = {
        refId: 'A',
        rawSql: '',
        format: QueryFormat.Table,
        editorMode: EditorMode.Code,
      };

      render(
        <QueryEditor
          query={query}
          onChange={mockOnChange}
          onRunQuery={mockOnRunQuery}
          datasource={mockDatasource}
        />
      );

      const formatSelect = screen.getByTestId('format-select');
      expect(formatSelect).toHaveValue(QueryFormat.Table);
      
      const options = formatSelect.querySelectorAll('option');
      expect(options).toHaveLength(2);
      expect(options[0].textContent).toBe('Time series');
      expect(options[1].textContent).toBe('Table');
    });

    it('should show time column input when format is timeseries', () => {
      const query = {
        refId: 'A',
        rawSql: '',
        format: QueryFormat.Timeseries,
        timeColumn: 'timestamp',
        editorMode: EditorMode.Code,
      };

      render(
        <QueryEditor
          query={query}
          onChange={mockOnChange}
          onRunQuery={mockOnRunQuery}
          datasource={mockDatasource}
        />
      );

      const timeColumnInput = screen.getByTestId('time-column-input');
      expect(timeColumnInput).toBeInTheDocument();
      expect(timeColumnInput).toHaveValue('timestamp');
    });

    it('should not show time column input when format is table', () => {
      const query = {
        refId: 'A',
        rawSql: '',
        format: QueryFormat.Table,
        editorMode: EditorMode.Code,
      };

      render(
        <QueryEditor
          query={query}
          onChange={mockOnChange}
          onRunQuery={mockOnRunQuery}
          datasource={mockDatasource}
        />
      );

      expect(screen.queryByTestId('time-column-input')).not.toBeInTheDocument();
    });
  });

  describe('Editor Mode Switching', () => {
    it('should switch from Builder to Code mode', () => {
      const query = {
        refId: 'A',
        rawSql: '',
        format: QueryFormat.Table,
        editorMode: EditorMode.Builder,
      };

      render(
        <QueryEditor
          query={query}
          onChange={mockOnChange}
          onRunQuery={mockOnRunQuery}
          datasource={mockDatasource}
        />
      );

      const codeButton = screen.getByTestId('mode-code');
      fireEvent.click(codeButton);

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          editorMode: EditorMode.Code,
        })
      );
    });
  });

  describe('Format Selection', () => {
    it('should call onChange and onRunQuery when format is changed', () => {
      const query = {
        refId: 'A',
        rawSql: 'SELECT * FROM table',
        format: QueryFormat.Table,
        editorMode: EditorMode.Code,
      };

      render(
        <QueryEditor
          query={query}
          onChange={mockOnChange}
          onRunQuery={mockOnRunQuery}
          datasource={mockDatasource}
        />
      );

      const formatSelect = screen.getByTestId('format-select');
      fireEvent.change(formatSelect, { target: { value: QueryFormat.Timeseries } });

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          format: QueryFormat.Timeseries,
        })
      );
      expect(mockOnRunQuery).toHaveBeenCalled();
    });

    it('should update query when switching from table to timeseries', () => {
      const query = {
        refId: 'A',
        rawSql: 'SELECT * FROM table',
        format: QueryFormat.Table,
        editorMode: EditorMode.Code,
      };

      render(
        <QueryEditor
          query={query}
          onChange={mockOnChange}
          onRunQuery={mockOnRunQuery}
          datasource={mockDatasource}
        />
      );

      const formatSelect = screen.getByTestId('format-select');
      fireEvent.change(formatSelect, { target: { value: QueryFormat.Timeseries } });

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          refId: 'A',
          rawSql: 'SELECT * FROM table',
          format: QueryFormat.Timeseries,
        })
      );
    });
  });

  describe('Time Column Input', () => {
    it('should call onChange when time column is changed', () => {
      const query = {
        refId: 'A',
        rawSql: 'SELECT * FROM table',
        format: QueryFormat.Timeseries,
        timeColumn: '',
        editorMode: EditorMode.Code,
      };

      render(
        <QueryEditor
          query={query}
          onChange={mockOnChange}
          onRunQuery={mockOnRunQuery}
          datasource={mockDatasource}
        />
      );

      const timeColumnInput = screen.getByTestId('time-column-input');
      fireEvent.change(timeColumnInput, { target: { value: 'created_at' } });

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          timeColumn: 'created_at',
        })
      );
    });

    it('should call onRunQuery when time column input is blurred', () => {
      const query = {
        refId: 'A',
        rawSql: 'SELECT * FROM table',
        format: QueryFormat.Timeseries,
        timeColumn: 'timestamp',
        editorMode: EditorMode.Code,
      };

      render(
        <QueryEditor
          query={query}
          onChange={mockOnChange}
          onRunQuery={mockOnRunQuery}
          datasource={mockDatasource}
        />
      );

      const timeColumnInput = screen.getByTestId('time-column-input');
      fireEvent.blur(timeColumnInput);

      expect(mockOnRunQuery).toHaveBeenCalled();
    });
  });

  describe('SQL Editor Integration', () => {
    it('should render SQL editor with correct query in Code mode', () => {
      const query = {
        refId: 'A',
        rawSql: 'SELECT id, name FROM users',
        format: QueryFormat.Table,
        editorMode: EditorMode.Code,
      };

      render(
        <QueryEditor
          query={query}
          onChange={mockOnChange}
          onRunQuery={mockOnRunQuery}
          datasource={mockDatasource}
        />
      );

      const sqlTextarea = screen.getByTestId('sql-textarea');
      expect(sqlTextarea).toHaveValue('SELECT id, name FROM users');
    });

    it('should update query when SQL is changed', () => {
      const query = {
        refId: 'A',
        rawSql: '',
        format: QueryFormat.Table,
        editorMode: EditorMode.Code,
      };

      render(
        <QueryEditor
          query={query}
          onChange={mockOnChange}
          onRunQuery={mockOnRunQuery}
          datasource={mockDatasource}
        />
      );

      const sqlTextarea = screen.getByTestId('sql-textarea');
      fireEvent.change(sqlTextarea, { target: { value: 'SELECT * FROM table' } });

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          rawSql: 'SELECT * FROM table',
        })
      );
    });

    it('should call onBlur when SQL editor loses focus', () => {
      const query = {
        refId: 'A',
        rawSql: 'SELECT * FROM table',
        format: QueryFormat.Table,
        editorMode: EditorMode.Code,
      };

      render(
        <QueryEditor
          query={query}
          onChange={mockOnChange}
          onRunQuery={mockOnRunQuery}
          datasource={mockDatasource}
        />
      );

      const sqlTextarea = screen.getByTestId('sql-textarea');
      fireEvent.blur(sqlTextarea);

      expect(mockOnRunQuery).toHaveBeenCalled();
    });
  });

  describe('Default Values', () => {
    it('should use empty string for rawSql when not provided', () => {
      const query = {
        refId: 'A',
        editorMode: EditorMode.Code,
      };

      render(
        <QueryEditor
          query={query}
          onChange={mockOnChange}
          onRunQuery={mockOnRunQuery}
          datasource={mockDatasource}
        />
      );

      const sqlTextarea = screen.getByTestId('sql-textarea');
      expect(sqlTextarea).toHaveValue('');
    });

    it('should use Table format when not provided', () => {
      const query = {
        refId: 'A',
        rawSql: 'SELECT * FROM table',
        editorMode: EditorMode.Code,
      };

      render(
        <QueryEditor
          query={query}
          onChange={mockOnChange}
          onRunQuery={mockOnRunQuery}
          datasource={mockDatasource}
        />
      );

      const formatSelect = screen.getByTestId('format-select');
      expect(formatSelect).toHaveValue(QueryFormat.Table);
    });

    it('should use empty string for timeColumn when not provided', () => {
      const query = {
        refId: 'A',
        rawSql: 'SELECT * FROM table',
        format: QueryFormat.Timeseries,
        editorMode: EditorMode.Code,
      };

      render(
        <QueryEditor
          query={query}
          onChange={mockOnChange}
          onRunQuery={mockOnRunQuery}
          datasource={mockDatasource}
        />
      );

      const timeColumnInput = screen.getByTestId('time-column-input');
      expect(timeColumnInput).toHaveValue('');
    });

    it('should default to Builder mode when editorMode not provided', () => {
      const query = {
        refId: 'A',
        rawSql: '',
        format: QueryFormat.Table,
      };

      render(
        <QueryEditor
          query={query}
          onChange={mockOnChange}
          onRunQuery={mockOnRunQuery}
          datasource={mockDatasource}
        />
      );

      expect(screen.getByTestId('visual-editor')).toBeInTheDocument();
    });
  });
});
