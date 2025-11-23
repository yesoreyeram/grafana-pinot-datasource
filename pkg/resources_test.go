package main

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/jarcoal/httpmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ============================================================================
// Resource Handler Tests
// ============================================================================

func TestCallResource_Tables(t *testing.T) {
	httpmock.Activate()
	defer httpmock.DeactivateAndReset()

	// Mock tables response
	httpmock.RegisterResponder("GET", "http://test-controller:9000/tables",
		httpmock.NewStringResponder(200, `{"tables":["table1","table2","table3"]}`))

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
		Path: "tables",
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

	tables, ok := result["tables"].([]interface{})
	require.True(t, ok)
	assert.Len(t, tables, 3)
}

func TestCallResource_TablesError(t *testing.T) {
	client, err := New(PinotClientOptions{
		BrokerUrl:      "http://test-broker:8099",
		BrokerAuthType: AuthTypeNone,
		// No controller configured
	})
	require.NoError(t, err)

	ds := &DataSource{client: client}

	req := &backend.CallResourceRequest{
		Path: "tables",
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
	assert.Equal(t, http.StatusInternalServerError, resp.Status)
}

func TestCallResource_TableSchema(t *testing.T) {
	client, err := New(PinotClientOptions{
		BrokerUrl:      "http://test-broker:8099",
		BrokerAuthType: AuthTypeNone,
	})
	require.NoError(t, err)

	ds := &DataSource{client: client}

	req := &backend.CallResourceRequest{
		Path: "table/myTable/schema",
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
	assert.Equal(t, 0, len(columns)) // Currently returns empty array
}

func TestCallResource_NotFound(t *testing.T) {
	client, err := New(PinotClientOptions{
		BrokerUrl:      "http://test-broker:8099",
		BrokerAuthType: AuthTypeNone,
	})
	require.NoError(t, err)

	ds := &DataSource{client: client}

	req := &backend.CallResourceRequest{
		Path: "unknown/path",
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
	assert.Equal(t, http.StatusNotFound, resp.Status)
}

// ============================================================================
// Mock Sender
// ============================================================================

type mockSender struct {
	send func(*backend.CallResourceResponse) error
}

func (m *mockSender) Send(resp *backend.CallResourceResponse) error {
	return m.send(resp)
}
