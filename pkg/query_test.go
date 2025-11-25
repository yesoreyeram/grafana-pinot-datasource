package main

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/data"
	"github.com/jarcoal/httpmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ============================================================================
// Query Execution Tests
// ============================================================================

func TestExecuteQuery(t *testing.T) {
	tests := []struct {
		name          string
		queryModel    QueryModel
		setupMock     func()
		expectError   bool
		validateFrame func(t *testing.T, frame *data.Frame)
	}{
		{
			name: "successful table query",
			queryModel: QueryModel{
				RawSQL: "SELECT id, name FROM users LIMIT 10",
				Format: "table",
			},
			setupMock: func() {
				response := PinotResponse{
					ResultTable: &ResultTable{
						DataSchema: DataSchema{
							ColumnNames:     []string{"id", "name"},
							ColumnDataTypes: []string{"LONG", "STRING"},
						},
						Rows: [][]interface{}{
							{float64(1), "Alice"},
							{float64(2), "Bob"},
						},
					},
					NumDocsScanned: 2,
					TimeUsedMs:     10,
				}
				body, _ := json.Marshal(response)
				httpmock.RegisterResponder("POST", "http://test-broker:8099/query/sql",
					httpmock.NewBytesResponder(200, body))
			},
			expectError: false,
			validateFrame: func(t *testing.T, frame *data.Frame) {
				assert.Equal(t, 2, frame.Rows())
				assert.Equal(t, 2, len(frame.Fields))
				assert.Equal(t, "id", frame.Fields[0].Name)
				assert.Equal(t, "name", frame.Fields[1].Name)
			},
		},
		{
			name: "successful timeseries query",
			queryModel: QueryModel{
				RawSQL:     "SELECT timestamp, value FROM metrics",
				Format:     "timeseries",
				TimeColumn: "timestamp",
			},
			setupMock: func() {
				response := PinotResponse{
					ResultTable: &ResultTable{
						DataSchema: DataSchema{
							ColumnNames:     []string{"timestamp", "value"},
							ColumnDataTypes: []string{"TIMESTAMP", "DOUBLE"},
						},
						Rows: [][]interface{}{
							{float64(1638360000000), 42.5},
							{float64(1638360060000), 43.2},
						},
					},
				}
				body, _ := json.Marshal(response)
				httpmock.RegisterResponder("POST", "http://test-broker:8099/query/sql",
					httpmock.NewBytesResponder(200, body))
			},
			expectError: false,
			validateFrame: func(t *testing.T, frame *data.Frame) {
				assert.Equal(t, 2, frame.Rows())
				assert.Equal(t, 2, len(frame.Fields))
			},
		},
		{
			name: "query with exceptions",
			queryModel: QueryModel{
				RawSQL: "SELECT * FROM nonexistent",
			},
			setupMock: func() {
				response := PinotResponse{
					Exceptions: []Exception{
						{ErrorCode: 404, Message: "Table not found"},
					},
				}
				body, _ := json.Marshal(response)
				httpmock.RegisterResponder("POST", "http://test-broker:8099/query/sql",
					httpmock.NewBytesResponder(200, body))
			},
			expectError: true,
		},
		{
			name: "empty SQL query",
			queryModel: QueryModel{
				RawSQL: "",
			},
			setupMock:   func() {},
			expectError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			httpmock.Activate()
			defer httpmock.DeactivateAndReset()
			tt.setupMock()

			client, err := New(PinotClientOptions{
				BrokerUrl:      "http://test-broker:8099",
				BrokerAuthType: AuthTypeNone,
			})
			require.NoError(t, err)
			httpmock.ActivateNonDefault(client.brokerClient.httpClient)

			ds := &DataSource{client: client}

			// Create query with JSON
			queryJSON, _ := json.Marshal(tt.queryModel)
			query := backend.DataQuery{
				RefID: "A",
				JSON:  queryJSON,
			}

			resp := ds.executeQuery(context.Background(), query)

			if tt.expectError {
				assert.NotNil(t, resp.Error)
			} else {
				assert.Nil(t, resp.Error)
				assert.NotNil(t, resp.Frames)
				if len(resp.Frames) > 0 && tt.validateFrame != nil {
					tt.validateFrame(t, resp.Frames[0])
				}
			}
		})
	}
}

// ============================================================================
// Data Type Conversion Tests
// ============================================================================

func TestConvertToInt64(t *testing.T) {
	tests := []struct {
		name      string
		input     interface{}
		expected  int64
		expectErr bool
	}{
		{"int64 value", int64(42), 42, false},
		{"int value", int(42), 42, false},
		{"float64 value", float64(42.7), 42, false},
		{"string value", "42", 42, false},
		{"invalid string", "abc", 0, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := convertToInt64(tt.input)
			if tt.expectErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
				assert.Equal(t, tt.expected, result)
			}
		})
	}
}

func TestConvertToFloat64(t *testing.T) {
	tests := []struct {
		name      string
		input     interface{}
		expected  float64
		expectErr bool
	}{
		{"float64 value", float64(42.5), 42.5, false},
		{"int64 value", int64(42), 42.0, false},
		{"int value", int(42), 42.0, false},
		{"string value", "42.5", 42.5, false},
		{"invalid string", "abc", 0, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := convertToFloat64(tt.input)
			if tt.expectErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
				assert.Equal(t, tt.expected, result)
			}
		})
	}
}

func TestConvertToBool(t *testing.T) {
	tests := []struct {
		name      string
		input     interface{}
		expected  bool
		expectErr bool
	}{
		{"bool true", true, true, false},
		{"bool false", false, false, false},
		{"string true", "true", true, false},
		{"string false", "false", false, false},
		{"int64 non-zero", int64(1), true, false},
		{"int64 zero", int64(0), false, false},
		{"float64 non-zero", float64(1.5), true, false},
		{"invalid string", "maybe", false, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := convertToBool(tt.input)
			if tt.expectErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
				assert.Equal(t, tt.expected, result)
			}
		})
	}
}

func TestConvertToTime(t *testing.T) {
	tests := []struct {
		name      string
		input     interface{}
		expectErr bool
		validate  func(t *testing.T, result time.Time)
	}{
		{
			name:      "time.Time value",
			input:     time.Date(2021, 12, 1, 0, 0, 0, 0, time.UTC),
			expectErr: false,
			validate: func(t *testing.T, result time.Time) {
				assert.Equal(t, 2021, result.Year())
			},
		},
		{
			name:      "int64 milliseconds",
			input:     int64(1638360000000),
			expectErr: false,
			validate: func(t *testing.T, result time.Time) {
				assert.True(t, result.After(time.Date(2021, 1, 1, 0, 0, 0, 0, time.UTC)))
			},
		},
		{
			name:      "float64 milliseconds",
			input:     float64(1638360000000),
			expectErr: false,
			validate: func(t *testing.T, result time.Time) {
				assert.True(t, result.After(time.Date(2021, 1, 1, 0, 0, 0, 0, time.UTC)))
			},
		},
		{
			name:      "RFC3339 string",
			input:     "2021-12-01T10:00:00Z",
			expectErr: false,
			validate: func(t *testing.T, result time.Time) {
				assert.Equal(t, 2021, result.Year())
			},
		},
		{
			name:      "invalid string",
			input:     "not a time",
			expectErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := convertToTime(tt.input, true)
			if tt.expectErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
				if tt.validate != nil {
					tt.validate(t, result)
				}
			}
		})
	}
}

func TestConvertToString(t *testing.T) {
	tests := []struct {
		name     string
		input    interface{}
		expected string
	}{
		{"string value", "hello", "hello"},
		{"int64 value", int64(42), "42"},
		{"float64 value", float64(42.5), "42.5"},
		{"bool true", true, "true"},
		{"bool false", false, "false"},
		{"nil value", nil, ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := convertToString(tt.input)
			assert.Equal(t, tt.expected, result)
		})
	}
}

// ============================================================================
// Field Creation Tests
// ============================================================================

func TestCreateFieldForColumn(t *testing.T) {
	tests := []struct {
		name       string
		columnType string
		validate   func(t *testing.T, field *data.Field)
	}{
		{
			name:       "INT type",
			columnType: "INT",
			validate: func(t *testing.T, field *data.Field) {
				_, ok := field.At(0).(*int64)
				assert.True(t, ok, "Expected int64 type")
			},
		},
		{
			name:       "LONG type",
			columnType: "LONG",
			validate: func(t *testing.T, field *data.Field) {
				_, ok := field.At(0).(*int64)
				assert.True(t, ok, "Expected int64 type")
			},
		},
		{
			name:       "FLOAT type",
			columnType: "FLOAT",
			validate: func(t *testing.T, field *data.Field) {
				_, ok := field.At(0).(*float64)
				assert.True(t, ok, "Expected float64 type")
			},
		},
		{
			name:       "DOUBLE type",
			columnType: "DOUBLE",
			validate: func(t *testing.T, field *data.Field) {
				_, ok := field.At(0).(*float64)
				assert.True(t, ok, "Expected float64 type")
			},
		},
		{
			name:       "BOOLEAN type",
			columnType: "BOOLEAN",
			validate: func(t *testing.T, field *data.Field) {
				_, ok := field.At(0).(*bool)
				assert.True(t, ok, "Expected bool type")
			},
		},
		{
			name:       "TIMESTAMP type",
			columnType: "TIMESTAMP",
			validate: func(t *testing.T, field *data.Field) {
				_, ok := field.At(0).(*time.Time)
				assert.True(t, ok, "Expected time.Time type")
			},
		},
		{
			name:       "STRING type",
			columnType: "STRING",
			validate: func(t *testing.T, field *data.Field) {
				_, ok := field.At(0).(*string)
				assert.True(t, ok, "Expected string type")
			},
		},
		{
			name:       "JSON type",
			columnType: "JSON",
			validate: func(t *testing.T, field *data.Field) {
				_, ok := field.At(0).(*string)
				assert.True(t, ok, "Expected string type for JSON")
			},
		},
		{
			name:       "unknown type defaults to string",
			columnType: "UNKNOWN",
			validate: func(t *testing.T, field *data.Field) {
				_, ok := field.At(0).(*string)
				assert.True(t, ok, "Expected string type for unknown")
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			field := createFieldForColumn("testColumn", tt.columnType, 1)
			assert.NotNil(t, field)
			assert.Equal(t, "testColumn", field.Name)
			if tt.validate != nil {
				tt.validate(t, field)
			}
		})
	}
}

// ============================================================================
// Integration Tests
// ============================================================================

func TestDataSource_QueryData_Integration(t *testing.T) {
	httpmock.Activate()
	defer httpmock.DeactivateAndReset()

	// Mock a successful query response
	response := PinotResponse{
		ResultTable: &ResultTable{
			DataSchema: DataSchema{
				ColumnNames:     []string{"id", "name", "age", "score", "active", "created_at"},
				ColumnDataTypes: []string{"LONG", "STRING", "INT", "DOUBLE", "BOOLEAN", "TIMESTAMP"},
			},
			Rows: [][]interface{}{
				{float64(1), "Alice", float64(25), 95.5, true, float64(1638360000000)},
				{float64(2), "Bob", float64(30), 87.3, false, float64(1638360060000)},
			},
		},
		NumDocsScanned: 2,
		TimeUsedMs:     15,
	}
	body, _ := json.Marshal(response)
	httpmock.RegisterResponder("POST", "http://test-broker:8099/query/sql",
		httpmock.NewBytesResponder(200, body))

	client, err := New(PinotClientOptions{
		BrokerUrl:      "http://test-broker:8099",
		BrokerAuthType: AuthTypeNone,
	})
	require.NoError(t, err)
	httpmock.ActivateNonDefault(client.brokerClient.httpClient)

	ds := &DataSource{client: client}

	// Create query request
	queryModel := QueryModel{
		RawSQL: "SELECT id, name, age, score, active, created_at FROM users",
		Format: "table",
	}
	queryJSON, _ := json.Marshal(queryModel)

	req := &backend.QueryDataRequest{
		Queries: []backend.DataQuery{
			{
				RefID: "A",
				JSON:  queryJSON,
			},
		},
	}

	resp, err := ds.QueryData(context.Background(), req)
	require.NoError(t, err)
	require.NotNil(t, resp)

	// Validate response
	dataResp, ok := resp.Responses["A"]
	require.True(t, ok)
	assert.Nil(t, dataResp.Error)
	require.NotNil(t, dataResp.Frames)
	require.Len(t, dataResp.Frames, 1)

	frame := dataResp.Frames[0]
	assert.Equal(t, 2, frame.Rows())
	assert.Equal(t, 6, len(frame.Fields))

	// Check column names
	assert.Equal(t, "id", frame.Fields[0].Name)
	assert.Equal(t, "name", frame.Fields[1].Name)
	assert.Equal(t, "age", frame.Fields[2].Name)
	assert.Equal(t, "score", frame.Fields[3].Name)
	assert.Equal(t, "active", frame.Fields[4].Name)
	assert.Equal(t, "created_at", frame.Fields[5].Name)
}
