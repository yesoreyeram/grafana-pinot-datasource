package main

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/jarcoal/httpmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestQueryWithNullValues tests handling of null values in Pinot responses
func TestQueryWithNullValues(t *testing.T) {
	httpmock.Activate()
	defer httpmock.DeactivateAndReset()

	// Mock response with null values
	response := PinotResponse{
		ResultTable: &ResultTable{
			DataSchema: DataSchema{
				ColumnNames:     []string{"id", "name", "value", "timestamp"},
				ColumnDataTypes: []string{"LONG", "STRING", "DOUBLE", "TIMESTAMP"},
			},
			Rows: [][]interface{}{
				{float64(1), "test1", 42.5, float64(1638360000000)},
				{float64(2), nil, nil, float64(1638360060000)},  // null string and value
				{float64(3), "test3", 43.2, nil},                // null timestamp
				{nil, "test4", 44.1, float64(1638360120000)},    // null id
			},
		},
		NumDocsScanned: 4,
		TimeUsedMs:     10,
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

	queryJSON, _ := json.Marshal(QueryModel{
		RawSQL: "SELECT id, name, value, timestamp FROM test_table",
		Format: "table",
	})

	query := backend.DataQuery{
		RefID: "A",
		JSON:  queryJSON,
	}

	resp := ds.executeQuery(context.Background(), query)
	require.Nil(t, resp.Error)
	require.NotNil(t, resp.Frames)
	require.Len(t, resp.Frames, 1)

	frame := resp.Frames[0]
	assert.Equal(t, 4, frame.Rows())
	assert.Len(t, frame.Fields, 4)

	// Verify null handling in fields
	idField := frame.Fields[0]
	assert.Equal(t, "id", idField.Name)
	// Row 0: has value, Row 3: null
	assert.NotNil(t, idField.At(0))
	
	nameField := frame.Fields[1]
	assert.Equal(t, "name", nameField.Name)
	// Row 1: null
	
	valueField := frame.Fields[2]
	assert.Equal(t, "value", valueField.Name)
	// Row 1: null
}

// TestQueryWithExceptions tests handling of Pinot query exceptions
func TestQueryWithExceptions(t *testing.T) {
	httpmock.Activate()
	defer httpmock.DeactivateAndReset()

	// Mock response with exceptions
	response := PinotResponse{
		Exceptions: []Exception{
			{ErrorCode: 400, Message: "Invalid SQL query"},
			{ErrorCode: 500, Message: "Internal server error"},
		},
		NumDocsScanned: 0,
		TimeUsedMs:     5,
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

	queryJSON, _ := json.Marshal(QueryModel{
		RawSQL: "SELECT * FROM invalid_table",
		Format: "table",
	})

	query := backend.DataQuery{
		RefID: "A",
		JSON:  queryJSON,
	}

	resp := ds.executeQuery(context.Background(), query)
	require.NotNil(t, resp.Error)
	assert.Contains(t, resp.Error.Error(), "query failed")
	assert.Contains(t, resp.Error.Error(), "Invalid SQL query")
	assert.Contains(t, resp.Error.Error(), "Internal server error")
}

// TestQueryWithEmptyResult tests handling of empty result sets
func TestQueryWithEmptyResult(t *testing.T) {
	httpmock.Activate()
	defer httpmock.DeactivateAndReset()

	// Mock response with no rows
	response := PinotResponse{
		ResultTable: &ResultTable{
			DataSchema: DataSchema{
				ColumnNames:     []string{"id", "name"},
				ColumnDataTypes: []string{"LONG", "STRING"},
			},
			Rows: [][]interface{}{},
		},
		NumDocsScanned: 0,
		TimeUsedMs:     2,
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

	queryJSON, _ := json.Marshal(QueryModel{
		RawSQL: "SELECT id, name FROM test_table WHERE 1=0",
		Format: "table",
	})

	query := backend.DataQuery{
		RefID: "A",
		JSON:  queryJSON,
	}

	resp := ds.executeQuery(context.Background(), query)
	require.Nil(t, resp.Error)
	require.NotNil(t, resp.Frames)
	require.Len(t, resp.Frames, 1)

	frame := resp.Frames[0]
	assert.Equal(t, 0, frame.Rows())
	assert.Len(t, frame.Fields, 2)
}

// TestQueryWithMalformedJSON tests handling of malformed JSON responses
func TestQueryWithMalformedJSON(t *testing.T) {
	httpmock.Activate()
	defer httpmock.DeactivateAndReset()

	// Mock response with invalid JSON
	httpmock.RegisterResponder("POST", "http://test-broker:8099/query/sql",
		httpmock.NewStringResponder(200, "{invalid json"))

	client, err := New(PinotClientOptions{
		BrokerUrl:      "http://test-broker:8099",
		BrokerAuthType: AuthTypeNone,
	})
	require.NoError(t, err)
	httpmock.ActivateNonDefault(client.brokerClient.httpClient)

	ds := &DataSource{client: client}

	queryJSON, _ := json.Marshal(QueryModel{
		RawSQL: "SELECT * FROM test_table",
		Format: "table",
	})

	query := backend.DataQuery{
		RefID: "A",
		JSON:  queryJSON,
	}

	resp := ds.executeQuery(context.Background(), query)
	require.NotNil(t, resp.Error)
	assert.Contains(t, resp.Error.Error(), "failed to parse Pinot response")
}

// TestQueryWithHTTPError tests handling of HTTP errors
func TestQueryWithHTTPError(t *testing.T) {
	httpmock.Activate()
	defer httpmock.DeactivateAndReset()

	// Mock HTTP 500 error
	httpmock.RegisterResponder("POST", "http://test-broker:8099/query/sql",
		httpmock.NewStringResponder(500, "Internal Server Error"))

	client, err := New(PinotClientOptions{
		BrokerUrl:      "http://test-broker:8099",
		BrokerAuthType: AuthTypeNone,
	})
	require.NoError(t, err)
	httpmock.ActivateNonDefault(client.brokerClient.httpClient)

	ds := &DataSource{client: client}

	queryJSON, _ := json.Marshal(QueryModel{
		RawSQL: "SELECT * FROM test_table",
		Format: "table",
	})

	query := backend.DataQuery{
		RefID: "A",
		JSON:  queryJSON,
	}

	resp := ds.executeQuery(context.Background(), query)
	require.NotNil(t, resp.Error)
	assert.Contains(t, resp.Error.Error(), "failed to execute query")
}

// TestQueryWithNullResultTable tests handling when resultTable is null
func TestQueryWithNullResultTable(t *testing.T) {
	httpmock.Activate()
	defer httpmock.DeactivateAndReset()

	// Mock response with null resultTable (shouldn't happen but test defensive coding)
	response := PinotResponse{
		ResultTable:    nil,
		NumDocsScanned: 0,
		TimeUsedMs:     1,
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

	queryJSON, _ := json.Marshal(QueryModel{
		RawSQL: "SELECT * FROM test_table",
		Format: "table",
	})

	query := backend.DataQuery{
		RefID: "A",
		JSON:  queryJSON,
	}

	resp := ds.executeQuery(context.Background(), query)
	require.NotNil(t, resp.Error)
	assert.Contains(t, resp.Error.Error(), "no result table in response")
}

// TestTimeseriesQueryWithMacros tests time series queries with macro substitution
func TestTimeseriesQueryWithMacros(t *testing.T) {
	httpmock.Activate()
	defer httpmock.DeactivateAndReset()

	// Mock response for time series
	response := PinotResponse{
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

	// Query with macros
	queryJSON, _ := json.Marshal(QueryModel{
		RawSQL:     "SELECT timestamp, value FROM metrics WHERE $__timeFilter(timestamp)",
		Format:     "timeseries",
		TimeColumn: "timestamp",
	})

	query := backend.DataQuery{
		RefID: "A",
		JSON:  queryJSON,
		TimeRange: backend.TimeRange{
			From: time.UnixMilli(1638360000000),
			To:   time.UnixMilli(1638360180000),
		},
	}

	resp := ds.executeQuery(context.Background(), query)
	require.Nil(t, resp.Error)
	require.NotNil(t, resp.Frames)
	require.Len(t, resp.Frames, 1)

	frame := resp.Frames[0]
	assert.Equal(t, 3, frame.Rows())
	
	// Verify time field is first
	timeField := frame.Fields[0]
	assert.Equal(t, "timestamp", timeField.Name)
	
	// Verify value field
	valueField := frame.Fields[1]
	assert.Equal(t, "value", valueField.Name)
}
