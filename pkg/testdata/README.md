# Test Data Structure

This directory contains test data for the Pinot datasource plugin, organized following httpmock file responder best practices.

## Directory Structure

```
testdata/
├── golden/                    # Golden files for regression testing
│   ├── simple_select_table.golden.json
│   ├── timeseries_query.golden.json
│   ├── aggregation_query.golden.json
│   ├── all_data_types.golden.json
│   ├── join_query.golden.json
│   ├── null_values.golden.json
│   └── window_function.golden.json
└── responses/                 # Pinot API response mocks
    ├── simple_select_table.json
    ├── timeseries_query.json
    ├── aggregation_query.json
    ├── all_data_types.json
    ├── join_query.json
    ├── null_values.json
    └── window_function.json
```

## Naming Conventions

### File Naming
- **Same base name**: Both response and golden files share the same base filename
- **Response files**: `<test_name>.json` (Pinot API response)
- **Golden files**: `<test_name>.golden.json` (Expected Grafana data frame output)

### Examples
- `simple_select_table.json` → `simple_select_table.golden.json`
- `timeseries_query.json` → `timeseries_query.golden.json`
- `aggregation_query.json` → `aggregation_query.golden.json`

## File Contents

### Response Files (`responses/*.json`)
Contains the raw JSON response from Pinot broker API as it would be returned from a real Pinot cluster:

```json
{
  "resultTable": {
    "dataSchema": {
      "columnNames": ["id", "name", "age"],
      "columnDataTypes": ["LONG", "STRING", "INT"]
    },
    "rows": [
      [1, "Alice", 25],
      [2, "Bob", 30]
    ]
  },
  "numDocsScanned": 2,
  "timeUsedMs": 5
}
```

### Golden Files (`golden/*.golden.json`)
Contains the expected Grafana data frame structure after parsing the Pinot response:

```json
{
  "description": "Simple SELECT query with multiple data types",
  "frameName": "A",
  "rows": 2,
  "fields": [
    {
      "name": "id",
      "type": "[]*int64",
      "length": 2,
      "values": [1, 2]
    },
    {
      "name": "name",
      "type": "[]*string",
      "length": 2,
      "values": ["Alice", "Bob"]
    }
  ]
}
```

## Usage in Tests

### Reading Response Files
Tests use httpmock with file-based responses for better maintainability:

```go
// Load Pinot response from file
responsePath := filepath.Join("testdata", "responses", testName+".json")
responseData, err := os.ReadFile(responsePath)
require.NoError(t, err)

httpmock.RegisterResponder("POST", brokerURL,
    httpmock.NewBytesResponder(200, responseData))
```

### Comparing with Golden Files
Golden files are used for regression testing:

```go
// Golden file path (same base name)
goldenPath := filepath.Join("testdata", "golden", testName+".golden.json")

// Compare actual output with expected golden data
goldenBytes, err := os.ReadFile(goldenPath)
require.NoError(t, err)

var expected GoldenData
json.Unmarshal(goldenBytes, &expected)

// Perform comparison...
```

## Benefits of This Approach

1. **Colocation**: Response and expected output files share the same base name, making it easy to find related files
2. **Independent Verification**: Each file can be verified independently:
   - Response files can be validated against real Pinot API responses
   - Golden files can be validated against actual Grafana data frame structures
3. **Easy Updates**: Use `-update` flag to regenerate golden files when needed:
   ```bash
   go test -v -run TestQueryDataGolden -update ./pkg
   ```
4. **Version Control Friendly**: JSON files are human-readable and easy to review in diffs
5. **No Mock Code Duplication**: Response data is in files, not duplicated in test code

## Test Scenarios

Current test scenarios cover:

1. **simple_select_table**: Basic SELECT with multiple data types
2. **timeseries_query**: Timeseries data with timestamp and metrics
3. **aggregation_query**: Aggregations with GROUP BY
4. **all_data_types**: All 9 Pinot data types (INT, LONG, FLOAT, DOUBLE, BOOLEAN, TIMESTAMP, STRING, BYTES, JSON)
5. **join_query**: Multi-table JOIN queries
6. **null_values**: NULL value handling
7. **window_function**: Window functions like ROW_NUMBER()

## Adding New Test Scenarios

To add a new test scenario:

1. Create response file: `testdata/responses/<test_name>.json`
2. Add test case to `TestQueryDataGolden` in `query_golden_test.go`
3. Run with `-update` flag to generate golden file:
   ```bash
   go test -v -run TestQueryDataGolden/<test_name> -update ./pkg
   ```
4. Verify the generated golden file: `testdata/golden/<test_name>.golden.json`
5. Commit both files together

## Maintaining Test Data

- Keep response files synchronized with actual Pinot API format
- Update golden files when data frame structure changes intentionally
- Review golden file diffs carefully during code reviews
- Test files should be comprehensive but minimal
