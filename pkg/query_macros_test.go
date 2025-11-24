package main

import (
	"fmt"
	"testing"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/stretchr/testify/assert"
)

func TestApplyMacros(t *testing.T) {
	// Create a fixed time range for testing
	from := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2024, 1, 2, 0, 0, 0, 0, time.UTC)
	timeRange := backend.TimeRange{
		From: from,
		To:   to,
	}

	fromMs := from.UnixMilli()
	toMs := to.UnixMilli()

	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "$__timeFrom replacement",
			input:    "SELECT * FROM metrics WHERE timestamp >= $__timeFrom",
			expected: "SELECT * FROM metrics WHERE timestamp >= " + fmt.Sprintf("%d", fromMs),
		},
		{
			name:     "$__timeFrom() with parentheses",
			input:    "SELECT * FROM metrics WHERE timestamp >= $__timeFrom()",
			expected: "SELECT * FROM metrics WHERE timestamp >= " + fmt.Sprintf("%d", fromMs),
		},
		{
			name:     "$__timeTo replacement",
			input:    "SELECT * FROM metrics WHERE timestamp < $__timeTo",
			expected: "SELECT * FROM metrics WHERE timestamp < " + fmt.Sprintf("%d", toMs),
		},
		{
			name:     "$__timeTo() with parentheses",
			input:    "SELECT * FROM metrics WHERE timestamp < $__timeTo()",
			expected: "SELECT * FROM metrics WHERE timestamp < " + fmt.Sprintf("%d", toMs),
		},
		{
			name:     "$__timeFromMs variant",
			input:    "SELECT * FROM metrics WHERE ts >= $__timeFromMs",
			expected: "SELECT * FROM metrics WHERE ts >= " + fmt.Sprintf("%d", fromMs),
		},
		{
			name:     "$__timeToMs variant",
			input:    "SELECT * FROM metrics WHERE ts < $__timeToMs",
			expected: "SELECT * FROM metrics WHERE ts < " + fmt.Sprintf("%d", toMs),
		},
		{
			name:     "$__timeFilter(column) replacement",
			input:    "SELECT * FROM metrics WHERE $__timeFilter(timestamp)",
			expected: "SELECT * FROM metrics WHERE " + fmt.Sprintf("timestamp >= %d AND timestamp < %d", fromMs, toMs),
		},
		{
			name:     "$__timeFilter with spaces",
			input:    "SELECT * FROM metrics WHERE $__timeFilter( timestamp )",
			expected: "SELECT * FROM metrics WHERE " + fmt.Sprintf("timestamp >= %d AND timestamp < %d", fromMs, toMs),
		},
		{
			name:     "Multiple macros",
			input:    "SELECT * FROM metrics WHERE timestamp >= $__timeFrom AND timestamp < $__timeTo",
			expected: "SELECT * FROM metrics WHERE timestamp >= " + fmt.Sprintf("%d", fromMs) + " AND timestamp < " + fmt.Sprintf("%d", toMs),
		},
		{
			name:     "Complex query with time filter",
			input:    "SELECT timestamp, value FROM metrics WHERE $__timeFilter(timestamp) AND value > 10 ORDER BY timestamp",
			expected: "SELECT timestamp, value FROM metrics WHERE " + fmt.Sprintf("timestamp >= %d AND timestamp < %d", fromMs, toMs) + " AND value > 10 ORDER BY timestamp",
		},
		{
			name:     "No macros - unchanged",
			input:    "SELECT * FROM metrics WHERE timestamp > 1000",
			expected: "SELECT * FROM metrics WHERE timestamp > 1000",
		},
		{
			name:     "Multiple time filters",
			input:    "SELECT * FROM t1 WHERE $__timeFilter(ts1) UNION SELECT * FROM t2 WHERE $__timeFilter(ts2)",
			expected: "SELECT * FROM t1 WHERE " + fmt.Sprintf("ts1 >= %d AND ts1 < %d", fromMs, toMs) + " UNION SELECT * FROM t2 WHERE " + fmt.Sprintf("ts2 >= %d AND ts2 < %d", fromMs, toMs),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := applyMacros(tt.input, timeRange)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestApplyMacrosWithRealTimeRange(t *testing.T) {
	// Test with current time to ensure proper formatting
	now := time.Now()
	oneHourAgo := now.Add(-1 * time.Hour)
	
	timeRange := backend.TimeRange{
		From: oneHourAgo,
		To:   now,
	}

	sql := "SELECT * FROM metrics WHERE $__timeFilter(timestamp)"
	result := applyMacros(sql, timeRange)

	// Should contain the unquoted column name and numeric timestamps
	assert.Contains(t, result, "timestamp >=")
	assert.Contains(t, result, "AND timestamp <")
	assert.NotContains(t, result, "$__timeFilter")
}
