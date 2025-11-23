package main

import (
	"context"
	"encoding/json"
	"flag"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/data"
	"github.com/jarcoal/httpmock"
	"github.com/stretchr/testify/require"
)

var updateGolden = flag.Bool("update", false, "update golden files")

// TestQueryDataGolden tests query data responses using golden files
func TestQueryDataGolden(t *testing.T) {
	tests := []struct {
		name          string
		queryModel    QueryModel
		pinotResponse PinotResponse
		description   string
	}{
		{
			name: "simple_select_table",
			queryModel: QueryModel{
				RawSQL: "SELECT id, name, age FROM users LIMIT 10",
				Format: "table",
			},
			pinotResponse: PinotResponse{
				ResultTable: &ResultTable{
					DataSchema: DataSchema{
						ColumnNames:     []string{"id", "name", "age"},
						ColumnDataTypes: []string{"LONG", "STRING", "INT"},
					},
					Rows: [][]interface{}{
						{float64(1), "Alice", float64(25)},
						{float64(2), "Bob", float64(30)},
						{float64(3), "Charlie", float64(35)},
					},
				},
				NumDocsScanned: 3,
				TimeUsedMs:     5,
			},
			description: "Simple SELECT query with multiple data types",
		},
		{
			name: "timeseries_query",
			queryModel: QueryModel{
				RawSQL:     "SELECT timestamp, value FROM metrics WHERE timestamp > 1638360000000",
				Format:     "timeseries",
				TimeColumn: "timestamp",
			},
			pinotResponse: PinotResponse{
				ResultTable: &ResultTable{
					DataSchema: DataSchema{
						ColumnNames:     []string{"timestamp", "value"},
						ColumnDataTypes: []string{"TIMESTAMP", "DOUBLE"},
					},
					Rows: [][]interface{}{
						{float64(1638360000000), 42.5},
						{float64(1638360060000), 43.2},
						{float64(1638360120000), 44.1},
					},
				},
				NumDocsScanned: 3,
				TimeUsedMs:     8,
			},
			description: "Timeseries query with timestamp and value columns",
		},
		{
			name: "aggregation_query",
			queryModel: QueryModel{
				RawSQL: "SELECT COUNT(*) as count, AVG(price) as avg_price, SUM(quantity) as total_qty FROM orders GROUP BY category",
				Format: "table",
			},
			pinotResponse: PinotResponse{
				ResultTable: &ResultTable{
					DataSchema: DataSchema{
						ColumnNames:     []string{"category", "count", "avg_price", "total_qty"},
						ColumnDataTypes: []string{"STRING", "LONG", "DOUBLE", "LONG"},
					},
					Rows: [][]interface{}{
						{"Electronics", float64(150), 299.99, float64(450)},
						{"Clothing", float64(200), 49.99, float64(800)},
						{"Books", float64(100), 19.99, float64(350)},
					},
				},
				NumDocsScanned: 450,
				TimeUsedMs:     15,
			},
			description: "Aggregation query with GROUP BY and aggregate functions",
		},
		{
			name: "all_data_types",
			queryModel: QueryModel{
				RawSQL: "SELECT * FROM test_table LIMIT 1",
				Format: "table",
			},
			pinotResponse: PinotResponse{
				ResultTable: &ResultTable{
					DataSchema: DataSchema{
						ColumnNames: []string{
							"int_col", "long_col", "float_col", "double_col",
							"boolean_col", "timestamp_col", "string_col", "bytes_col", "json_col",
						},
						ColumnDataTypes: []string{
							"INT", "LONG", "FLOAT", "DOUBLE",
							"BOOLEAN", "TIMESTAMP", "STRING", "BYTES", "JSON",
						},
					},
					Rows: [][]interface{}{
						{
							float64(42), float64(1234567890), float64(3.14), 2.71828,
							true, float64(1638360000000), "test string", "Ynl0ZXM=", `{"key":"value"}`,
						},
					},
				},
				NumDocsScanned: 1,
				TimeUsedMs:     2,
			},
			description: "Query testing all Pinot data types",
		},
		{
			name: "join_query",
			queryModel: QueryModel{
				RawSQL: "SELECT u.id, u.name, o.order_id, o.total FROM users u JOIN orders o ON u.id = o.user_id LIMIT 5",
				Format: "table",
			},
			pinotResponse: PinotResponse{
				ResultTable: &ResultTable{
					DataSchema: DataSchema{
						ColumnNames:     []string{"id", "name", "order_id", "total"},
						ColumnDataTypes: []string{"LONG", "STRING", "LONG", "DOUBLE"},
					},
					Rows: [][]interface{}{
						{float64(1), "Alice", float64(101), 99.99},
						{float64(1), "Alice", float64(102), 149.99},
						{float64(2), "Bob", float64(103), 79.99},
					},
				},
				NumDocsScanned: 10,
				TimeUsedMs:     12,
			},
			description: "JOIN query with multiple tables",
		},
		{
			name: "null_values",
			queryModel: QueryModel{
				RawSQL: "SELECT id, name, optional_field FROM users",
				Format: "table",
			},
			pinotResponse: PinotResponse{
				ResultTable: &ResultTable{
					DataSchema: DataSchema{
						ColumnNames:     []string{"id", "name", "optional_field"},
						ColumnDataTypes: []string{"LONG", "STRING", "STRING"},
					},
					Rows: [][]interface{}{
						{float64(1), "Alice", "value1"},
						{float64(2), "Bob", nil},
						{float64(3), "Charlie", "value3"},
					},
				},
				NumDocsScanned: 3,
				TimeUsedMs:     4,
			},
			description: "Query with NULL values in results",
		},
		{
			name: "window_function",
			queryModel: QueryModel{
				RawSQL: "SELECT user_id, order_date, total, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY order_date) as row_num FROM orders",
				Format: "table",
			},
			pinotResponse: PinotResponse{
				ResultTable: &ResultTable{
					DataSchema: DataSchema{
						ColumnNames:     []string{"user_id", "order_date", "total", "row_num"},
						ColumnDataTypes: []string{"LONG", "TIMESTAMP", "DOUBLE", "LONG"},
					},
					Rows: [][]interface{}{
						{float64(1), float64(1638360000000), 99.99, float64(1)},
						{float64(1), float64(1638446400000), 149.99, float64(2)},
						{float64(2), float64(1638532800000), 79.99, float64(1)},
					},
				},
				NumDocsScanned: 5,
				TimeUsedMs:     10,
			},
			description: "Query with window functions",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			httpmock.Activate()
			defer httpmock.DeactivateAndReset()

			// Setup mock
			body, _ := json.Marshal(tt.pinotResponse)
			httpmock.RegisterResponder("POST", "http://test-broker:8099/query/sql",
				httpmock.NewBytesResponder(200, body))

			// Create client and datasource
			client, err := New(PinotClientOptions{
				BrokerUrl:      "http://test-broker:8099",
				BrokerAuthType: AuthTypeNone,
			})
			require.NoError(t, err)
			httpmock.ActivateNonDefault(client.brokerClient.httpClient)

			ds := &DataSource{client: client}

			// Create query
			queryJSON, _ := json.Marshal(tt.queryModel)
			query := backend.DataQuery{
				RefID: "A",
				JSON:  queryJSON,
			}

			// Execute query
			resp := ds.executeQuery(context.Background(), query)
			require.Nil(t, resp.Error, "Query should not return error")
			require.NotNil(t, resp.Frames)
			require.Len(t, resp.Frames, 1)

			// Convert frame to golden-testable format
			goldenData := frameToGoldenData(resp.Frames[0], tt.description)

			// Golden file path
			goldenPath := filepath.Join("testdata", "golden", tt.name+".golden.json")

			if *updateGolden {
				// Update golden file
				goldenBytes, err := json.MarshalIndent(goldenData, "", "  ")
				require.NoError(t, err)
				err = os.WriteFile(goldenPath, goldenBytes, 0644)
				require.NoError(t, err)
				t.Logf("Updated golden file: %s", goldenPath)
			} else {
				// Compare with golden file
				goldenBytes, err := os.ReadFile(goldenPath)
				require.NoError(t, err, "Failed to read golden file: %s", goldenPath)

				var expected GoldenData
				err = json.Unmarshal(goldenBytes, &expected)
				require.NoError(t, err, "Failed to parse golden file: %s", goldenPath)

				// Compare
				require.Equal(t, expected.Description, goldenData.Description, "Description mismatch")
				require.Equal(t, expected.FrameName, goldenData.FrameName, "Frame name mismatch")
				require.Equal(t, expected.Rows, goldenData.Rows, "Row count mismatch")
				require.Equal(t, len(expected.Fields), len(goldenData.Fields), "Field count mismatch")

				// Compare fields
				for i, expectedField := range expected.Fields {
					actualField := goldenData.Fields[i]
					require.Equal(t, expectedField.Name, actualField.Name, "Field %d name mismatch", i)
					require.Equal(t, expectedField.Type, actualField.Type, "Field %d type mismatch", i)
					require.Equal(t, expectedField.Length, actualField.Length, "Field %d length mismatch", i)
					
					// Compare values with type normalization
					require.Equal(t, len(expectedField.Values), len(actualField.Values), "Field %d values length mismatch", i)
					for j := 0; j < len(expectedField.Values); j++ {
						expectedVal := normalizeValue(expectedField.Values[j])
						actualVal := normalizeValue(actualField.Values[j])
						require.Equal(t, expectedVal, actualVal, "Field %d value at index %d mismatch", i, j)
					}
				}
			}
		})
	}
}

// GoldenData represents the structure stored in golden files
type GoldenData struct {
	Description string        `json:"description"`
	FrameName   string        `json:"frameName"`
	Rows        int           `json:"rows"`
	Fields      []GoldenField `json:"fields"`
}

// GoldenField represents a field in the golden data
type GoldenField struct {
	Name   string        `json:"name"`
	Type   string        `json:"type"`
	Length int           `json:"length"`
	Values []interface{} `json:"values"`
}

// frameToGoldenData converts a data frame to golden test data format
func frameToGoldenData(frame *data.Frame, description string) GoldenData {
	goldenData := GoldenData{
		Description: description,
		FrameName:   frame.Name,
		Rows:        frame.Rows(),
		Fields:      make([]GoldenField, len(frame.Fields)),
	}

	for i, field := range frame.Fields {
		values := make([]interface{}, field.Len())
		for j := 0; j < field.Len(); j++ {
			val := field.At(j)
			// Convert pointers to values for JSON serialization
			switch v := val.(type) {
			case *int64:
				if v != nil {
					values[j] = *v
				} else {
					values[j] = nil
				}
			case *float64:
				if v != nil {
					values[j] = *v
				} else {
					values[j] = nil
				}
			case *bool:
				if v != nil {
					values[j] = *v
				} else {
					values[j] = nil
				}
			case *string:
				if v != nil {
					values[j] = *v
				} else {
					values[j] = nil
				}
			case *time.Time:
				if v != nil {
					values[j] = v.Format(time.RFC3339)
				} else {
					values[j] = nil
				}
			default:
				values[j] = val
			}
		}

		goldenData.Fields[i] = GoldenField{
			Name:   field.Name,
			Type:   field.Type().String(),
			Length: field.Len(),
			Values: values,
		}
	}

	return goldenData
}

// normalizeValue normalizes numeric types for comparison
// Converts int64 and float64 to comparable format
func normalizeValue(val interface{}) interface{} {
	if val == nil {
		return nil
	}
	
	switch v := val.(type) {
	case float64:
		// Check if it's actually an integer
		if v == float64(int64(v)) {
			return int64(v)
		}
		return v
	case int64:
		return v
	case int:
		return int64(v)
	default:
		return val
	}
}
