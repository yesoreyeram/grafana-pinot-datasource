package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/data"
)

// ============================================================================
// TYPES - Query Request
// ============================================================================

// QueryModel represents the frontend query model
type QueryModel struct {
	RawSQL      string                 `json:"rawSql"`
	EditorMode  string                 `json:"editorMode"`
	Format      string                 `json:"format"`
	Table       string                 `json:"table"`
	Dataset     string                 `json:"dataset"`
	TimeColumn  string                 `json:"timeColumn"`
	QueryOptions map[string]interface{} `json:"queryOptions"`
}

// ============================================================================
// TYPES - Pinot Response
// ============================================================================

// PinotResponse represents the response from Pinot broker
type PinotResponse struct {
	ResultTable *ResultTable `json:"resultTable"`
	Exceptions  []Exception  `json:"exceptions"`
	NumDocsScanned int64     `json:"numDocsScanned"`
	TotalDocs   int64        `json:"totalDocs"`
	TimeUsedMs  int64        `json:"timeUsedMs"`
}

// ResultTable represents the result table in Pinot response
type ResultTable struct {
	DataSchema DataSchema    `json:"dataSchema"`
	Rows       [][]interface{} `json:"rows"`
}

// DataSchema represents the schema of the result
type DataSchema struct {
	ColumnNames     []string         `json:"columnNames"`
	ColumnDataTypes []string         `json:"columnDataTypes"`
}

// Exception represents an error in Pinot response
type Exception struct {
	ErrorCode int    `json:"errorCode"`
	Message   string `json:"message"`
}

// ============================================================================
// QUERY EXECUTION
// ============================================================================

// executeQuery executes a Pinot query and returns data frames
func (ds *DataSource) executeQuery(ctx context.Context, query backend.DataQuery) backend.DataResponse {
	var qm QueryModel

	// Parse query model
	if err := json.Unmarshal(query.JSON, &qm); err != nil {
		return backend.DataResponse{
			Error: fmt.Errorf("failed to parse query model: %w", err),
		}
	}

	// Determine SQL query
	sql := qm.RawSQL
	if sql == "" {
		return backend.DataResponse{
			Error: fmt.Errorf("no SQL query provided"),
		}
	}

	// Apply Grafana time range macros
	sql = applyMacros(sql, query.TimeRange)

	// Execute query against Pinot
	resp, err := ds.client.Query(ctx, sql)
	if err != nil {
		return backend.DataResponse{
			Error: fmt.Errorf("failed to execute query: %w", err),
		}
	}
	defer resp.Body.Close()

	// Read response body
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return backend.DataResponse{
			Error: fmt.Errorf("failed to read response: %w", err),
		}
	}

	// Parse Pinot response
	var pinotResp PinotResponse
	if err := json.Unmarshal(body, &pinotResp); err != nil {
		return backend.DataResponse{
			Error: fmt.Errorf("failed to parse Pinot response: %w", err),
		}
	}

	// Check for exceptions
	if len(pinotResp.Exceptions) > 0 {
		var messages []string
		for _, exc := range pinotResp.Exceptions {
			messages = append(messages, fmt.Sprintf("[%d] %s", exc.ErrorCode, exc.Message))
		}
		return backend.DataResponse{
			Error: fmt.Errorf("query failed: %s", strings.Join(messages, "; ")),
		}
	}

	// Check for result table
	if pinotResp.ResultTable == nil {
		return backend.DataResponse{
			Error: fmt.Errorf("no result table in response"),
		}
	}

	// Convert to data frames
	frames, err := convertToDataFrames(pinotResp.ResultTable, qm, query)
	if err != nil {
		return backend.DataResponse{
			Error: fmt.Errorf("failed to convert to data frames: %w", err),
		}
	}

	return backend.DataResponse{
		Frames: frames,
		Status: backend.StatusOK,
	}
}

// ============================================================================
// DATA FRAME CONVERSION
// ============================================================================

// convertToDataFrames converts Pinot result table to Grafana data frames
func convertToDataFrames(resultTable *ResultTable, qm QueryModel, query backend.DataQuery) (data.Frames, error) {
	if resultTable.DataSchema.ColumnNames == nil || len(resultTable.DataSchema.ColumnNames) == 0 {
		return nil, fmt.Errorf("no columns in result")
	}

	// Determine if this is a time series query
	isTimeSeries := qm.Format == "timeseries"
	timeColumnIndex := -1

	if isTimeSeries && qm.TimeColumn != "" {
		// Find the time column index
		for i, col := range resultTable.DataSchema.ColumnNames {
			if strings.EqualFold(col, qm.TimeColumn) {
				timeColumnIndex = i
				break
			}
		}
		if timeColumnIndex == -1 {
			return nil, fmt.Errorf("time column '%s' not found in results", qm.TimeColumn)
		}
	}

	// Create frame
	frame := data.NewFrame(query.RefID)

	// Create fields for each column
	columnCount := len(resultTable.DataSchema.ColumnNames)
	rowCount := len(resultTable.Rows)

	// Initialize field slices
	fields := make([]*data.Field, columnCount)

	for colIdx := 0; colIdx < columnCount; colIdx++ {
		colName := resultTable.DataSchema.ColumnNames[colIdx]
		colType := ""
		if colIdx < len(resultTable.DataSchema.ColumnDataTypes) {
			colType = resultTable.DataSchema.ColumnDataTypes[colIdx]
		}

		// Create field based on type
		field := createFieldForColumn(colName, colType, rowCount)
		fields[colIdx] = field

		// For time series, mark time column
		if isTimeSeries && colIdx == timeColumnIndex {
			field.Config = &data.FieldConfig{}
		}
	}

	// Populate field values
	for rowIdx, row := range resultTable.Rows {
		for colIdx := 0; colIdx < columnCount && colIdx < len(row); colIdx++ {
			value := row[colIdx]
			colType := ""
			if colIdx < len(resultTable.DataSchema.ColumnDataTypes) {
				colType = resultTable.DataSchema.ColumnDataTypes[colIdx]
			}

			// Convert and set value
			if err := setFieldValue(fields[colIdx], rowIdx, value, colType, isTimeSeries && colIdx == timeColumnIndex); err != nil {
				backend.Logger.Warn("Failed to set field value", "column", resultTable.DataSchema.ColumnNames[colIdx], "row", rowIdx, "error", err)
			}
		}
	}

	// Add fields to frame
	for _, field := range fields {
		frame.Fields = append(frame.Fields, field)
	}

	return data.Frames{frame}, nil
}

// createFieldForColumn creates a data.Field based on Pinot column type
func createFieldForColumn(name string, columnType string, rowCount int) *data.Field {
	columnType = strings.ToUpper(columnType)

	switch {
	case strings.Contains(columnType, "INT"):
		return data.NewField(name, nil, make([]*int64, rowCount))
	case strings.Contains(columnType, "LONG"):
		return data.NewField(name, nil, make([]*int64, rowCount))
	case strings.Contains(columnType, "FLOAT"):
		return data.NewField(name, nil, make([]*float64, rowCount))
	case strings.Contains(columnType, "DOUBLE"):
		return data.NewField(name, nil, make([]*float64, rowCount))
	case strings.Contains(columnType, "BOOLEAN"):
		return data.NewField(name, nil, make([]*bool, rowCount))
	case strings.Contains(columnType, "TIMESTAMP"):
		return data.NewField(name, nil, make([]*time.Time, rowCount))
	case strings.Contains(columnType, "STRING"):
		return data.NewField(name, nil, make([]*string, rowCount))
	case strings.Contains(columnType, "BYTES"):
		return data.NewField(name, nil, make([]*string, rowCount))
	case strings.Contains(columnType, "JSON"):
		return data.NewField(name, nil, make([]*string, rowCount))
	default:
		// Default to string for unknown types
		return data.NewField(name, nil, make([]*string, rowCount))
	}
}

// setFieldValue sets a value in a field at the specified index
func setFieldValue(field *data.Field, index int, value interface{}, columnType string, isTimeColumn bool) error {
	if value == nil {
		return nil // Leave as nil/default
	}

	columnType = strings.ToUpper(columnType)

	switch v := field.At(index).(type) {
	case *int64:
		intVal, err := convertToInt64(value)
		if err != nil {
			return err
		}
		field.Set(index, &intVal)

	case *float64:
		floatVal, err := convertToFloat64(value)
		if err != nil {
			return err
		}
		field.Set(index, &floatVal)

	case *bool:
		boolVal, err := convertToBool(value)
		if err != nil {
			return err
		}
		field.Set(index, &boolVal)

	case *time.Time:
		timeVal, err := convertToTime(value, isTimeColumn)
		if err != nil {
			return err
		}
		field.Set(index, &timeVal)

	case *string:
		strVal := convertToString(value)
		field.Set(index, &strVal)

	default:
		_ = v
		strVal := convertToString(value)
		field.Set(index, &strVal)
	}

	return nil
}

// ============================================================================
// TYPE CONVERTERS
// ============================================================================

// convertToInt64 converts a value to int64
func convertToInt64(value interface{}) (int64, error) {
	switch v := value.(type) {
	case int64:
		return v, nil
	case int:
		return int64(v), nil
	case float64:
		return int64(v), nil
	case string:
		return strconv.ParseInt(v, 10, 64)
	case json.Number:
		return v.Int64()
	default:
		return 0, fmt.Errorf("cannot convert %T to int64", value)
	}
}

// convertToFloat64 converts a value to float64
func convertToFloat64(value interface{}) (float64, error) {
	switch v := value.(type) {
	case float64:
		return v, nil
	case int64:
		return float64(v), nil
	case int:
		return float64(v), nil
	case string:
		return strconv.ParseFloat(v, 64)
	case json.Number:
		return v.Float64()
	default:
		return 0, fmt.Errorf("cannot convert %T to float64", value)
	}
}

// convertToBool converts a value to bool
func convertToBool(value interface{}) (bool, error) {
	switch v := value.(type) {
	case bool:
		return v, nil
	case string:
		return strconv.ParseBool(v)
	case int64:
		return v != 0, nil
	case float64:
		return v != 0, nil
	default:
		return false, fmt.Errorf("cannot convert %T to bool", value)
	}
}

// convertToTime converts a value to time.Time
// Handles various timestamp formats from Pinot
func convertToTime(value interface{}, isTimeColumn bool) (time.Time, error) {
	switch v := value.(type) {
	case time.Time:
		return v, nil
	case int64:
		// Pinot timestamps are typically in milliseconds
		return time.UnixMilli(v), nil
	case float64:
		// Convert to milliseconds and then to time
		return time.UnixMilli(int64(v)), nil
	case string:
		// Try parsing as Pinot timestamp format first: "2006-01-04 14:35:13.0"
		if t, err := time.Parse("2006-01-02 15:04:05.999999999", v); err == nil {
			return t, nil
		}
		// Try without fractional seconds: "2006-01-04 14:35:13"
		if t, err := time.Parse("2006-01-02 15:04:05", v); err == nil {
			return t, nil
		}
		// Try parsing as RFC3339
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			return t, nil
		}
		// Try parsing as timestamp (milliseconds)
		if ts, err := strconv.ParseInt(v, 10, 64); err == nil {
			return time.UnixMilli(ts), nil
		}
		return time.Time{}, fmt.Errorf("cannot parse time from string: %s", v)
	default:
		return time.Time{}, fmt.Errorf("cannot convert %T to time.Time", value)
	}
}

// convertToString converts any value to string
func convertToString(value interface{}) string {
	switch v := value.(type) {
	case string:
		return v
	case int64:
		return strconv.FormatInt(v, 10)
	case float64:
		return strconv.FormatFloat(v, 'f', -1, 64)
	case bool:
		return strconv.FormatBool(v)
	case nil:
		return ""
	default:
		// For complex types like arrays, objects, etc., use JSON encoding
		if bytes, err := json.Marshal(v); err == nil {
			return string(bytes)
		}
		return fmt.Sprintf("%v", v)
	}
}

// ============================================================================
// MACRO SUBSTITUTION
// ============================================================================

// applyMacros replaces Grafana time range macros in SQL query
// Supports: $__timeFrom, $__timeTo, $__timeFilter(column)
func applyMacros(sql string, timeRange backend.TimeRange) string {
	// Convert time range to milliseconds (Pinot's default timestamp format)
	fromMs := timeRange.From.UnixMilli()
	toMs := timeRange.To.UnixMilli()

	// Replace $__timeFrom() and $__timeFromMs
	sql = strings.ReplaceAll(sql, "$__timeFrom()", fmt.Sprintf("%d", fromMs))
	sql = strings.ReplaceAll(sql, "$__timeFromMs", fmt.Sprintf("%d", fromMs))
	sql = strings.ReplaceAll(sql, "$__timeFrom", fmt.Sprintf("%d", fromMs))

	// Replace $__timeTo() and $__timeToMs
	sql = strings.ReplaceAll(sql, "$__timeTo()", fmt.Sprintf("%d", toMs))
	sql = strings.ReplaceAll(sql, "$__timeToMs", fmt.Sprintf("%d", toMs))
	sql = strings.ReplaceAll(sql, "$__timeTo", fmt.Sprintf("%d", toMs))

	// Replace $__timeFilter(column) with column >= fromMs AND column < toMs
	// Pattern: $__timeFilter(columnName)
	// Note: Column name is NOT quoted to allow it to work in all SQL contexts
	// (SELECT, WHERE, GROUP BY, ORDER BY). Users can manually quote if needed.
	filterPattern := "$__timeFilter("
	for {
		startIdx := strings.Index(sql, filterPattern)
		if startIdx == -1 {
			break
		}
		
		// Find the closing parenthesis
		endIdx := strings.Index(sql[startIdx:], ")")
		if endIdx == -1 {
			break
		}
		endIdx += startIdx
		
		// Extract column name (includes quotes if user provided them)
		columnName := sql[startIdx+len(filterPattern) : endIdx]
		columnName = strings.TrimSpace(columnName)
		
		// Create the replacement filter (no automatic quoting)
		replacement := fmt.Sprintf("%s >= %d AND %s < %d", columnName, fromMs, columnName, toMs)
		
		// Replace in SQL
		sql = sql[:startIdx] + replacement + sql[endIdx+1:]
	}

	return sql
}
