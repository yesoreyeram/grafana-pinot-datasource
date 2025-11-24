package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

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
func (ds *DataSource) handleTableSchema(ctx context.Context, req *backend.CallResourceRequest, sender backend.CallResourceResponseSender) error {
	// Extract table name from path: table/{tableName}/schema
	tableName := ""
	if len(req.Path) > 6 && req.Path[:6] == "table/" {
		parts := strings.Split(req.Path, "/")
		if len(parts) >= 2 {
			tableName = parts[1]
		}
	}

	if tableName == "" {
		return sender.Send(&backend.CallResourceResponse{
			Status: http.StatusBadRequest,
			Body:   []byte(`{"error": "table name is required"}`),
		})
	}

	// Fetch schema from Pinot controller
	schema, err := ds.client.TableSchema(ctx, tableName)
	if err != nil {
		backend.Logger.Warn("Failed to fetch table schema", "table", tableName, "error", err)
		// Return empty columns to allow raw SQL mode to work
		response := map[string]interface{}{
			"columns": []map[string]string{},
		}
		body, _ := json.Marshal(response)
		return sender.Send(&backend.CallResourceResponse{
			Status: http.StatusOK,
			Body:   body,
			Headers: map[string][]string{
				"Content-Type": {"application/json"},
			},
		})
	}

	// Convert schema to columns format for SQLEditor
	columns := []map[string]string{}
	
	// Add dimension fields
	for _, field := range schema.DimensionFieldSpecs {
		columns = append(columns, map[string]string{
			"name": field.Name,
			"type": field.DataType,
		})
	}
	
	// Add metric fields
	for _, field := range schema.MetricFieldSpecs {
		columns = append(columns, map[string]string{
			"name": field.Name,
			"type": field.DataType,
		})
	}
	
	// Add date-time fields
	for _, field := range schema.DateTimeFieldSpecs {
		columns = append(columns, map[string]string{
			"name": field.Name,
			"type": field.DataType,
		})
	}
	
	// Add time field if present (deprecated but still supported)
	if schema.TimeFieldSpec != nil && schema.TimeFieldSpec.IncomingGranularitySpec != nil {
		columns = append(columns, map[string]string{
			"name": schema.TimeFieldSpec.IncomingGranularitySpec.Name,
			"type": schema.TimeFieldSpec.IncomingGranularitySpec.DataType,
		})
	}

	response := map[string]interface{}{
		"columns": columns,
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
