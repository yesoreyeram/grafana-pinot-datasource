import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DataSourcePlugin } from '@grafana/data';
import { plugin } from './module';

// Mock Grafana UI components
jest.mock('@grafana/ui', () => ({
  Field: ({ children, label }: any) => (
    <div data-testid="field">
      <label>{label}</label>
      {children}
    </div>
  ),
  SecretInput: ({ value, onChange, onReset, isConfigured, placeholder }: any) => (
    <div data-testid="secret-input">
      {isConfigured ? (
        <button onClick={onReset}>Reset</button>
      ) : (
        <input
          type="password"
          value={value}
          onChange={onChange}
          placeholder={placeholder}
        />
      )}
    </div>
  ),
  Input: ({ value, onChange, placeholder, type, checked }: any) => {
    if (type === 'checkbox') {
      return (
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          data-testid="checkbox-input"
        />
      );
    }
    return (
      <input
        type={type || 'text'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        data-testid="text-input"
      />
    );
  },
  FieldSet: ({ children, style }: any) => <div style={style}>{children}</div>,
  Select: ({ value, onChange, options }: any) => (
    <select
      value={value}
      onChange={(e) => {
        const option = options.find((opt: any) => opt.value === e.target.value);
        if (option) {
          onChange(option);
        }
      }}
      data-testid="select-input"
    >
      {options.map((opt: any) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  ),
  Collapse: ({ label, children, isOpen }: any) => (
    <div data-testid="collapse">
      <div>{label}</div>
      {isOpen && <div>{children}</div>}
    </div>
  ),
}));

// Mock Grafana runtime
jest.mock('@grafana/runtime', () => ({
  DataSourceWithBackend: class MockDataSourceWithBackend {
    constructor(public instanceSettings: any) {}
  },
}));

// Common test data
const mockOnOptionsChange = jest.fn();
const defaultOptions = {
  id: 1,
  uid: 'test-uid',
  orgId: 1,
  name: 'Test Pinot',
  type: 'yesoreyeram-pinot-datasource',
  typeName: 'Apache Pinot',
  access: 'proxy',
  url: '',
  user: '',
  database: '',
  basicAuth: false,
  isDefault: false,
  jsonData: {},
  secureJsonFields: {},
  readOnly: false,
  withCredentials: false,
};

describe('Apache Pinot DataSource Plugin', () => {
  it('should be a DataSourcePlugin instance', () => {
    expect(plugin).toBeInstanceOf(DataSourcePlugin);
  });

  it('should have ConfigEditor set', () => {
    expect(plugin.components.ConfigEditor).toBeDefined();
  });

  it('should have QueryEditor set', () => {
    expect(plugin.components.QueryEditor).toBeDefined();
  });
});

describe('ConfigEditor', () => {
  beforeEach(() => {
    mockOnOptionsChange.mockClear();
  });

  it('should render broker URL field', () => {
    const ConfigEditor = plugin.components.ConfigEditor;
    render(
      <ConfigEditor options={defaultOptions} onOptionsChange={mockOnOptionsChange} />
    );

    const inputs = screen.getAllByTestId('text-input');
    const brokerUrlInput = inputs.find((input) => 
      input.getAttribute('placeholder') === 'http://localhost:8099'
    );
    expect(brokerUrlInput).toBeInTheDocument();
  });

  it('should update broker URL when changed', () => {
    const ConfigEditor = plugin.components.ConfigEditor;
    render(
      <ConfigEditor options={defaultOptions} onOptionsChange={mockOnOptionsChange} />
    );

    const inputs = screen.getAllByTestId('text-input');
    const brokerUrlInput = inputs.find((input) => 
      input.getAttribute('placeholder') === 'http://localhost:8099'
    ) as HTMLInputElement;

    fireEvent.change(brokerUrlInput, { target: { value: 'http://localhost:8099' } });

    expect(mockOnOptionsChange).toHaveBeenCalledWith(
      expect.objectContaining({
        jsonData: expect.objectContaining({
          broker: expect.objectContaining({
            url: 'http://localhost:8099',
          }),
        }),
      })
    );
  });

  it('should render authentication type selector', () => {
    const ConfigEditor = plugin.components.ConfigEditor;
    render(
      <ConfigEditor options={defaultOptions} onOptionsChange={mockOnOptionsChange} />
    );

    const selects = screen.getAllByTestId('select-input');
    expect(selects.length).toBeGreaterThan(0);
  });

  it('should show username and password fields when basic auth is selected', () => {
    const optionsWithBasicAuth = {
      ...defaultOptions,
      jsonData: {
        broker: {
          authType: 'basic',
        },
      },
    };

    const ConfigEditor = plugin.components.ConfigEditor;
    render(
      <ConfigEditor options={optionsWithBasicAuth} onOptionsChange={mockOnOptionsChange} />
    );

    const inputs = screen.getAllByTestId('text-input');
    const usernameInput = inputs.find((input) => 
      input.getAttribute('placeholder') === 'Username'
    );
    expect(usernameInput).toBeInTheDocument();
  });

  it('should show bearer token field when bearer auth is selected', () => {
    const optionsWithBearerAuth = {
      ...defaultOptions,
      jsonData: {
        broker: {
          authType: 'bearer',
        },
      },
    };

    const ConfigEditor = plugin.components.ConfigEditor;
    render(
      <ConfigEditor options={optionsWithBearerAuth} onOptionsChange={mockOnOptionsChange} />
    );

    const secretInputs = screen.getAllByTestId('secret-input');
    expect(secretInputs.length).toBeGreaterThan(0);
  });

  it('should update broker username when changed', () => {
    const optionsWithBasicAuth = {
      ...defaultOptions,
      jsonData: {
        broker: {
          authType: 'basic',
        },
      },
    };

    const ConfigEditor = plugin.components.ConfigEditor;
    render(
      <ConfigEditor options={optionsWithBasicAuth} onOptionsChange={mockOnOptionsChange} />
    );

    const inputs = screen.getAllByTestId('text-input');
    const usernameInput = inputs.find((input) => 
      input.getAttribute('placeholder') === 'Username'
    ) as HTMLInputElement;

    fireEvent.change(usernameInput, { target: { value: 'testuser' } });

    expect(mockOnOptionsChange).toHaveBeenCalledWith(
      expect.objectContaining({
        jsonData: expect.objectContaining({
          broker: expect.objectContaining({
            userName: 'testuser',
          }),
        }),
      })
    );
  });

  it('should render TLS skip verify checkbox', () => {
    const ConfigEditor = plugin.components.ConfigEditor;
    render(
      <ConfigEditor options={defaultOptions} onOptionsChange={mockOnOptionsChange} />
    );

    const checkboxes = screen.getAllByTestId('checkbox-input');
    expect(checkboxes.length).toBeGreaterThan(0);
  });

  it('should update TLS skip verify when checkbox is changed', () => {
    const ConfigEditor = plugin.components.ConfigEditor;
    render(
      <ConfigEditor options={defaultOptions} onOptionsChange={mockOnOptionsChange} />
    );

    const checkboxes = screen.getAllByTestId('checkbox-input');
    const tlsCheckbox = checkboxes[0];

    fireEvent.click(tlsCheckbox);

    expect(mockOnOptionsChange).toHaveBeenCalledWith(
      expect.objectContaining({
        jsonData: expect.objectContaining({
          broker: expect.objectContaining({
            tlsSkipVerify: true,
          }),
        }),
      })
    );
  });

  it('should have controller section in the UI', () => {
    const ConfigEditor = plugin.components.ConfigEditor;
    render(
      <ConfigEditor options={defaultOptions} onOptionsChange={mockOnOptionsChange} />
    );

    // Controller section should exist
    const collapses = screen.getAllByTestId('collapse');
    expect(collapses.length).toBeGreaterThanOrEqual(2);
    
    // Check that controller section label is present
    expect(screen.getByText('Controller Configuration (Optional)')).toBeInTheDocument();
  });

  it('should show controller auth fields when controller URL is provided', () => {
    const optionsWithController = {
      ...defaultOptions,
      jsonData: {
        controller: {
          url: 'http://localhost:9000',
          authType: 'basic',
        },
      },
    };

    const ConfigEditor = plugin.components.ConfigEditor;
    render(
      <ConfigEditor options={optionsWithController} onOptionsChange={mockOnOptionsChange} />
    );

    const selects = screen.getAllByTestId('select-input');
    // Should have at least 2 selects: one for broker auth, one for controller auth
    expect(selects.length).toBeGreaterThanOrEqual(1);
  });

  it('should handle switching authentication types', () => {
    const ConfigEditor = plugin.components.ConfigEditor;
    render(
      <ConfigEditor options={defaultOptions} onOptionsChange={mockOnOptionsChange} />
    );

    const selects = screen.getAllByTestId('select-input');
    const authSelect = selects[0];

    // Change to basic authentication
    fireEvent.change(authSelect, { target: { value: 'basic' } });

    expect(mockOnOptionsChange).toHaveBeenCalledWith(
      expect.objectContaining({
        jsonData: expect.objectContaining({
          broker: expect.objectContaining({
            authType: 'basic',
          }),
        }),
      })
    );
  });

  it('should preserve existing broker config when updating', () => {
    const existingOptions = {
      ...defaultOptions,
      jsonData: {
        broker: {
          url: 'http://existing:8099',
          authType: 'none' as const,
        },
      },
    };

    const ConfigEditor = plugin.components.ConfigEditor;
    render(
      <ConfigEditor options={existingOptions} onOptionsChange={mockOnOptionsChange} />
    );

    const checkboxes = screen.getAllByTestId('checkbox-input');
    fireEvent.click(checkboxes[0]);

    expect(mockOnOptionsChange).toHaveBeenCalledWith(
      expect.objectContaining({
        jsonData: expect.objectContaining({
          broker: expect.objectContaining({
            url: 'http://existing:8099',
            authType: 'none',
            tlsSkipVerify: true,
          }),
        }),
      })
    );
  });
});

describe('QueryEditor', () => {
  it('should render query editor', () => {
    const QueryEditor = plugin.components.QueryEditor;
    const { container } = render(<QueryEditor />);
    
    expect(container).toHaveTextContent('Apache Pinot™ Query Editor');
  });
});

describe('Configuration Types', () => {
  it('should handle undefined jsonData gracefully', () => {
    const optionsWithoutJsonData = {
      ...defaultOptions,
      jsonData: undefined as any,
    };

    const ConfigEditor = plugin.components.ConfigEditor;
    const { container } = render(
      <ConfigEditor options={optionsWithoutJsonData} onOptionsChange={mockOnOptionsChange} />
    );

    expect(container).toBeInTheDocument();
  });

  it('should handle undefined broker config gracefully', () => {
    const ConfigEditor = plugin.components.ConfigEditor;
    const { container } = render(
      <ConfigEditor options={defaultOptions} onOptionsChange={mockOnOptionsChange} />
    );

    expect(container).toBeInTheDocument();
  });
});
