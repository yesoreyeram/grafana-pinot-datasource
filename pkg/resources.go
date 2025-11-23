package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

// ============================================================================
// RESOURCE HANDLERS
// ============================================================================

// CallResource handles resource calls for the datasource
func (ds *DataSource) CallResource(ctx context.Context, req *backend.CallResourceRequest, sender backend.CallResourceResponseSender) error {
	switch req.Path {
	case "tables":
		return ds.handleTables(ctx, req, sender)
	default:
		// Check if it's a table schema request
		if len(req.Path) > 6 && req.Path[:6] == "table/" {
			return ds.handleTableSchema(ctx, req, sender)
		}
		return sender.Send(&backend.CallResourceResponse{
			Status: http.StatusNotFound,
			Body:   []byte(`{"error": "resource not found"}`),
		})
	}
}

// handleTables returns list of tables from Pinot controller
func (ds *DataSource) handleTables(ctx context.Context, req *backend.CallResourceRequest, sender backend.CallResourceResponseSender) error {
	tables, err := ds.client.Tables(ctx)
	if err != nil {
		return sender.Send(&backend.CallResourceResponse{
			Status: http.StatusInternalServerError,
			Body:   []byte(fmt.Sprintf(`{"error": "%s"}`, err.Error())),
		})
	}

	response := map[string]interface{}{
		"tables": tables,
	}

	body, err := json.Marshal(response)
	if err != nil {
		return sender.Send(&backend.CallResourceResponse{
			Status: http.StatusInternalServerError,
			Body:   []byte(fmt.Sprintf(`{"error": "failed to marshal response: %s"}`, err.Error())),
		})
	}

	return sender.Send(&backend.CallResourceResponse{
		Status: http.StatusOK,
		Body:   body,
		Headers: map[string][]string{
			"Content-Type": {"application/json"},
		},
	})
}

// handleTableSchema returns schema for a specific table
// Note: This feature requires controller API access to fetch table schemas.
// Currently returns empty array but the SQLEditor component handles this gracefully.
func (ds *DataSource) handleTableSchema(ctx context.Context, req *backend.CallResourceRequest, sender backend.CallResourceResponseSender) error {
	// TODO: Extract table name from path and fetch schema from Pinot controller
	// Implementation requires controller API endpoint: GET /tables/{tableName}/schema
	// For now, return empty columns which allows query builder to work with raw SQL mode
	
	response := map[string]interface{}{
		"columns": []map[string]string{},
	}

	body, err := json.Marshal(response)
	if err != nil {
		return sender.Send(&backend.CallResourceResponse{
			Status: http.StatusInternalServerError,
			Body:   []byte(fmt.Sprintf(`{"error": "failed to marshal response: %s"}`, err.Error())),
		})
	}

	return sender.Send(&backend.CallResourceResponse{
		Status: http.StatusOK,
		Body:   body,
		Headers: map[string][]string{
			"Content-Type": {"application/json"},
		},
	})
}
