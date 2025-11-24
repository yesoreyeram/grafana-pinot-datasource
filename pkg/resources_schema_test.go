package main

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/jarcoal/httpmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

func TestTableSchema(t *testing.T) {
	httpmock.Activate()
	defer httpmock.DeactivateAndReset()

	// Mock schema response
	schemaResponse := TableSchemaResponse{
		SchemaName: "testTable",
		DimensionFieldSpecs: []FieldSpec{
			{Name: "user_id", DataType: "LONG"},
			{Name: "country", DataType: "STRING"},
		},
		MetricFieldSpecs: []FieldSpec{
			{Name: "clicks", DataType: "LONG"},
			{Name: "revenue", DataType: "DOUBLE"},
		},
		DateTimeFieldSpecs: []DateTimeFieldSpec{
			{Name: "created_at", DataType: "TIMESTAMP", Format: "1:MILLISECONDS:EPOCH", Granularity: "1:MILLISECONDS"},
		},
	}

	body, _ := json.Marshal(schemaResponse)
	httpmock.RegisterResponder("GET", "http://test-controller:9000/tables/testTable/schema",
		httpmock.NewBytesResponder(200, body))

	client, err := New(PinotClientOptions{
		BrokerUrl:      "http://test-broker:8099",
		BrokerAuthType: AuthTypeNone,
		ControllerUrl:  "http://test-controller:9000",
		ControllerAuthType: AuthTypeNone,
	})
	require.NoError(t, err)
	httpmock.ActivateNonDefault(client.controllerClient.httpClient)

	schema, err := client.TableSchema(context.Background(), "testTable")
	require.NoError(t, err)
	require.NotNil(t, schema)

	assert.Equal(t, "testTable", schema.SchemaName)
	assert.Len(t, schema.DimensionFieldSpecs, 2)
	assert.Len(t, schema.MetricFieldSpecs, 2)
	assert.Len(t, schema.DateTimeFieldSpecs, 1)
	
	assert.Equal(t, "user_id", schema.DimensionFieldSpecs[0].Name)
	assert.Equal(t, "LONG", schema.DimensionFieldSpecs[0].DataType)
	assert.Equal(t, "clicks", schema.MetricFieldSpecs[0].Name)
	assert.Equal(t, "created_at", schema.DateTimeFieldSpecs[0].Name)
}

func TestTableSchemaNoController(t *testing.T) {
	client, err := New(PinotClientOptions{
		BrokerUrl:      "http://test-broker:8099",
		BrokerAuthType: AuthTypeNone,
	})
	require.NoError(t, err)

	_, err = client.TableSchema(context.Background(), "testTable")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "controller client not configured")
}

func TestCallResource_TableSchema(t *testing.T) {
	httpmock.Activate()
	defer httpmock.DeactivateAndReset()

	// Mock schema response
	schemaResponse := TableSchemaResponse{
		SchemaName: "airlineStats",
		DimensionFieldSpecs: []FieldSpec{
			{Name: "Origin", DataType: "STRING"},
			{Name: "Dest", DataType: "STRING"},
		},
		MetricFieldSpecs: []FieldSpec{
			{Name: "Distance", DataType: "INT"},
		},
		DateTimeFieldSpecs: []DateTimeFieldSpec{
			{Name: "DaysSinceEpoch", DataType: "INT", Format: "1:DAYS:EPOCH", Granularity: "1:DAYS"},
		},
	}

	body, _ := json.Marshal(schemaResponse)
	httpmock.RegisterResponder("GET", "http://test-controller:9000/tables/airlineStats/schema",
		httpmock.NewBytesResponder(200, body))

	client, err := New(PinotClientOptions{
		BrokerUrl:          "http://test-broker:8099",
		BrokerAuthType:     AuthTypeNone,
		ControllerUrl:      "http://test-controller:9000",
		ControllerAuthType: AuthTypeNone,
	})
	require.NoError(t, err)
	httpmock.ActivateNonDefault(client.controllerClient.httpClient)

	ds := &DataSource{client: client}

	req := &backend.CallResourceRequest{
		Path: "table/airlineStats/schema",
	}

	var responses []*backend.CallResourceResponse
	sender := &mockSender{
		send: func(resp *backend.CallResourceResponse) error {
			responses = append(responses, resp)
			return nil
		},
	}

	err = ds.CallResource(context.Background(), req, sender)
	require.NoError(t, err)
	require.Len(t, responses, 1)

	resp := responses[0]
	assert.Equal(t, http.StatusOK, resp.Status)

	var result map[string]interface{}
	err = json.Unmarshal(resp.Body, &result)
	require.NoError(t, err)

	columns, ok := result["columns"].([]interface{})
	require.True(t, ok)
	assert.Len(t, columns, 4) // 2 dimensions + 1 metric + 1 datetime

	// Check first column
	col0 := columns[0].(map[string]interface{})
	assert.Equal(t, "Origin", col0["name"])
	assert.Equal(t, "STRING", col0["type"])
}

func TestCallResource_TableSchemaNotFound(t *testing.T) {
	httpmock.Activate()
	defer httpmock.DeactivateAndReset()

	httpmock.RegisterResponder("GET", "http://test-controller:9000/tables/nonexistent/schema",
		httpmock.NewStringResponder(404, `{"error": "table not found"}`))

	client, err := New(PinotClientOptions{
		BrokerUrl:          "http://test-broker:8099",
		BrokerAuthType:     AuthTypeNone,
		ControllerUrl:      "http://test-controller:9000",
		ControllerAuthType: AuthTypeNone,
	})
	require.NoError(t, err)
	httpmock.ActivateNonDefault(client.controllerClient.httpClient)

	ds := &DataSource{client: client}

	req := &backend.CallResourceRequest{
		Path: "table/nonexistent/schema",
	}

	var responses []*backend.CallResourceResponse
	sender := &mockSender{
		send: func(resp *backend.CallResourceResponse) error {
			responses = append(responses, resp)
			return nil
		},
	}

	err = ds.CallResource(context.Background(), req, sender)
	require.NoError(t, err)
	require.Len(t, responses, 1)

	resp := responses[0]
	// Should still return 200 with empty columns to allow raw SQL mode
	assert.Equal(t, http.StatusOK, resp.Status)

	var result map[string]interface{}
	err = json.Unmarshal(resp.Body, &result)
	require.NoError(t, err)

	columns, ok := result["columns"].([]interface{})
	require.True(t, ok)
	assert.Len(t, columns, 0)
}

func TestCallResource_TableSchemaInvalidPath(t *testing.T) {
	client, err := New(PinotClientOptions{
		BrokerUrl:      "http://test-broker:8099",
		BrokerAuthType: AuthTypeNone,
		ControllerUrl:  "http://test-controller:9000",
		ControllerAuthType: AuthTypeNone,
	})
	require.NoError(t, err)

	ds := &DataSource{client: client}

	req := &backend.CallResourceRequest{
		Path: "table//schema", // Invalid: empty table name
	}

	var responses []*backend.CallResourceResponse
	sender := &mockSender{
		send: func(resp *backend.CallResourceResponse) error {
			responses = append(responses, resp)
			return nil
		},
	}

	err = ds.CallResource(context.Background(), req, sender)
	require.NoError(t, err)
	require.Len(t, responses, 1)

	resp := responses[0]
	assert.Equal(t, http.StatusBadRequest, resp.Status)
}
