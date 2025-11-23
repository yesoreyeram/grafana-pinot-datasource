package main

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/jarcoal/httpmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ============================================================================
// HTTPClient Tests
// ============================================================================

func TestNewHTTPClient(t *testing.T) {
	tests := []struct {
		name     string
		config   HTTPClientBuildConfig
		validate func(t *testing.T, client *HTTPClient)
	}{
		{
			name: "creates client with all fields",
			config: HTTPClientBuildConfig{
				URL:           "http://localhost:8099",
				AuthType:      AuthTypeBasic,
				Username:      "testuser",
				Password:      "testpass",
				Token:         "testtoken",
				TlsSkipVerify: true,
				Timeout:       10 * time.Second,
			},
			validate: func(t *testing.T, client *HTTPClient) {
				assert.Equal(t, "http://localhost:8099", client.url)
				assert.Equal(t, AuthTypeBasic, client.authType)
				assert.Equal(t, "testuser", client.username)
				assert.Equal(t, "testpass", client.password)
				assert.Equal(t, "testtoken", client.token)
				assert.NotNil(t, client.httpClient)
			},
		},
		{
			name: "strips trailing slash from URL",
			config: HTTPClientBuildConfig{
				URL:      "http://localhost:8099/",
				AuthType: AuthTypeNone,
			},
			validate: func(t *testing.T, client *HTTPClient) {
				assert.Equal(t, "http://localhost:8099", client.url)
			},
		},
		{
			name: "uses default timeout when not specified",
			config: HTTPClientBuildConfig{
				URL:      "http://localhost:8099",
				AuthType: AuthTypeNone,
			},
			validate: func(t *testing.T, client *HTTPClient) {
				assert.NotNil(t, client.httpClient)
				assert.Equal(t, 30*time.Second, client.httpClient.Timeout)
			},
		},
		{
			name: "uses custom timeout when specified",
			config: HTTPClientBuildConfig{
				URL:      "http://localhost:8099",
				AuthType: AuthTypeNone,
				Timeout:  5 * time.Second,
			},
			validate: func(t *testing.T, client *HTTPClient) {
				assert.Equal(t, 5*time.Second, client.httpClient.Timeout)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client := NewHTTPClient(tt.config)
			require.NotNil(t, client)
			tt.validate(t, client)
		})
	}
}

func TestHTTPClient_addAuth(t *testing.T) {
	tests := []struct {
		name         string
		authType     AuthType
		username     string
		password     string
		token        string
		validateAuth func(t *testing.T, req *http.Request)
	}{
		{
			name:     "no authentication",
			authType: AuthTypeNone,
			validateAuth: func(t *testing.T, req *http.Request) {
				assert.Empty(t, req.Header.Get("Authorization"))
			},
		},
		{
			name:     "basic authentication with credentials",
			authType: AuthTypeBasic,
			username: "testuser",
			password: "testpass",
			validateAuth: func(t *testing.T, req *http.Request) {
				username, password, ok := req.BasicAuth()
				assert.True(t, ok)
				assert.Equal(t, "testuser", username)
				assert.Equal(t, "testpass", password)
			},
		},
		{
			name:     "basic authentication without credentials",
			authType: AuthTypeBasic,
			validateAuth: func(t *testing.T, req *http.Request) {
				_, _, ok := req.BasicAuth()
				assert.False(t, ok)
			},
		},
		{
			name:     "bearer token authentication",
			authType: AuthTypeBearer,
			token:    "test-token-123",
			validateAuth: func(t *testing.T, req *http.Request) {
				assert.Equal(t, "Bearer test-token-123", req.Header.Get("Authorization"))
			},
		},
		{
			name:     "bearer authentication without token",
			authType: AuthTypeBearer,
			validateAuth: func(t *testing.T, req *http.Request) {
				assert.Empty(t, req.Header.Get("Authorization"))
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client := &HTTPClient{
				authType: tt.authType,
				username: tt.username,
				password: tt.password,
				token:    tt.token,
			}

			req, err := http.NewRequest("GET", "http://example.com", nil)
			require.NoError(t, err)

			client.addAuth(req)
			tt.validateAuth(t, req)
		})
	}
}

func TestHTTPClient_doRequest(t *testing.T) {
	tests := []struct {
		name           string
		setupMock      func()
		method         string
		path           string
		body           io.Reader
		expectedStatus int
		expectError    bool
	}{
		{
			name: "successful GET request",
			setupMock: func() {
				httpmock.RegisterResponder("GET", "http://test-broker:8099/health",
					httpmock.NewStringResponder(200, "OK"))
			},
			method:         "GET",
			path:           "/health",
			expectedStatus: 200,
			expectError:    false,
		},
		{
			name: "successful POST request with body",
			setupMock: func() {
				httpmock.RegisterResponder("POST", "http://test-broker:8099/query/sql",
					httpmock.NewStringResponder(200, `{"result":"success"}`))
			},
			method:         "POST",
			path:           "/query/sql",
			body:           strings.NewReader(`{"sql":"SELECT 1"}`),
			expectedStatus: 200,
			expectError:    false,
		},
		{
			name: "handles server error",
			setupMock: func() {
				httpmock.RegisterResponder("GET", "http://test-broker:8099/error",
					httpmock.NewStringResponder(500, "Internal Server Error"))
			},
			method:         "GET",
			path:           "/error",
			expectedStatus: 500,
			expectError:    false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			httpmock.Activate()
			defer httpmock.DeactivateAndReset()
			tt.setupMock()

			client := NewHTTPClient(HTTPClientBuildConfig{
				URL:      "http://test-broker:8099",
				AuthType: AuthTypeNone,
				Timeout:  5 * time.Second,
			})

			// Replace the client's httpClient with a mock-enabled one
			httpmock.ActivateNonDefault(client.httpClient)

			resp, err := client.doRequest(context.Background(), tt.method, tt.path, tt.body)

			if tt.expectError {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
				require.NotNil(t, resp)
				assert.Equal(t, tt.expectedStatus, resp.StatusCode)
				resp.Body.Close()
			}
		})
	}
}

// ============================================================================
// PinotClient Tests
// ============================================================================

func TestNew(t *testing.T) {
	tests := []struct {
		name        string
		opts        PinotClientOptions
		expectError bool
		errorMsg    string
		validate    func(t *testing.T, client *PinotClient)
	}{
		{
			name: "creates client with broker only",
			opts: PinotClientOptions{
				BrokerUrl:      "http://localhost:8099",
				BrokerAuthType: AuthTypeNone,
			},
			expectError: false,
			validate: func(t *testing.T, client *PinotClient) {
				assert.NotNil(t, client.brokerClient)
				assert.Nil(t, client.controllerClient)
			},
		},
		{
			name: "creates client with broker and controller",
			opts: PinotClientOptions{
				BrokerUrl:       "http://localhost:8099",
				BrokerAuthType:  AuthTypeNone,
				ControllerUrl:   "http://localhost:9000",
				ControllerAuthType: AuthTypeNone,
			},
			expectError: false,
			validate: func(t *testing.T, client *PinotClient) {
				assert.NotNil(t, client.brokerClient)
				assert.NotNil(t, client.controllerClient)
			},
		},
		{
			name: "creates client with authentication",
			opts: PinotClientOptions{
				BrokerUrl:       "http://localhost:8099",
				BrokerAuthType:  AuthTypeBasic,
				BrokerUsername:  "user",
				BrokerPassword:  "pass",
				ControllerUrl:   "http://localhost:9000",
				ControllerAuthType: AuthTypeBearer,
				ControllerToken: "token123",
			},
			expectError: false,
			validate: func(t *testing.T, client *PinotClient) {
				assert.NotNil(t, client.brokerClient)
				assert.Equal(t, AuthTypeBasic, client.brokerClient.authType)
				assert.Equal(t, "user", client.brokerClient.username)
				assert.Equal(t, "pass", client.brokerClient.password)
				assert.NotNil(t, client.controllerClient)
				assert.Equal(t, AuthTypeBearer, client.controllerClient.authType)
				assert.Equal(t, "token123", client.controllerClient.token)
			},
		},
		{
			name:        "fails without broker URL",
			opts:        PinotClientOptions{},
			expectError: true,
			errorMsg:    "broker URL is required",
		},
		{
			name: "uses default timeouts",
			opts: PinotClientOptions{
				BrokerUrl:      "http://localhost:8099",
				BrokerAuthType: AuthTypeNone,
			},
			expectError: false,
			validate: func(t *testing.T, client *PinotClient) {
				assert.Equal(t, 30*time.Second, client.brokerClient.httpClient.Timeout)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client, err := New(tt.opts)

			if tt.expectError {
				assert.Error(t, err)
				if tt.errorMsg != "" {
					assert.Contains(t, err.Error(), tt.errorMsg)
				}
			} else {
				assert.NoError(t, err)
				require.NotNil(t, client)
				if tt.validate != nil {
					tt.validate(t, client)
				}
			}
		})
	}
}

func TestPinotClient_Health(t *testing.T) {
	tests := []struct {
		name        string
		setupMock   func()
		expectError bool
		errorMsg    string
	}{
		{
			name: "successful health check",
			setupMock: func() {
				httpmock.RegisterResponder("GET", "http://test-broker:8099/health",
					httpmock.NewStringResponder(200, "OK"))
			},
			expectError: false,
		},
		{
			name: "health check returns non-200 status",
			setupMock: func() {
				httpmock.RegisterResponder("GET", "http://test-broker:8099/health",
					httpmock.NewStringResponder(503, "Service Unavailable"))
			},
			expectError: true,
			errorMsg:    "health check failed with status 503",
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

			// Replace the client's httpClient with a mock-enabled one
			httpmock.ActivateNonDefault(client.brokerClient.httpClient)

			err = client.Health(context.Background())

			if tt.expectError {
				assert.Error(t, err)
				if tt.errorMsg != "" {
					assert.Contains(t, err.Error(), tt.errorMsg)
				}
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestPinotClient_Query(t *testing.T) {
	tests := []struct {
		name        string
		sql         string
		setupMock   func()
		expectError bool
		errorMsg    string
	}{
		{
			name: "successful query",
			sql:  "SELECT * FROM myTable",
			setupMock: func() {
				httpmock.RegisterResponder("POST", "http://test-broker:8099/query/sql",
					httpmock.NewStringResponder(200, `{"resultTable":{"dataSchema":{},"rows":[]}}`))
			},
			expectError: false,
		},
		{
			name: "query with error response",
			sql:  "SELECT * FROM nonexistent",
			setupMock: func() {
				httpmock.RegisterResponder("POST", "http://test-broker:8099/query/sql",
					httpmock.NewStringResponder(400, `{"error":"Table not found"}`))
			},
			expectError: true,
			errorMsg:    "query failed with status 400",
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

			// Replace the client's httpClient with a mock-enabled one
			httpmock.ActivateNonDefault(client.brokerClient.httpClient)

			resp, err := client.Query(context.Background(), tt.sql)

			if tt.expectError {
				assert.Error(t, err)
				if tt.errorMsg != "" {
					assert.Contains(t, err.Error(), tt.errorMsg)
				}
			} else {
				assert.NoError(t, err)
				require.NotNil(t, resp)
				resp.Body.Close()
			}
		})
	}
}

func TestPinotClient_Tables(t *testing.T) {
	tests := []struct {
		name            string
		hasController   bool
		setupMock       func()
		expectedTables  []string
		expectError     bool
		errorMsg        string
	}{
		{
			name:          "retrieves tables successfully",
			hasController: true,
			setupMock: func() {
				httpmock.RegisterResponder("GET", "http://test-controller:9000/tables",
					httpmock.NewStringResponder(200, `{"tables":["table1","table2","table3"]}`))
			},
			expectedTables: []string{"table1", "table2", "table3"},
			expectError:    false,
		},
		{
			name:          "retrieves empty table list",
			hasController: true,
			setupMock: func() {
				httpmock.RegisterResponder("GET", "http://test-controller:9000/tables",
					httpmock.NewStringResponder(200, `{"tables":[]}`))
			},
			expectedTables: []string{},
			expectError:    false,
		},
		{
			name:          "fails when controller not configured",
			hasController: false,
			setupMock:     func() {},
			expectError:   true,
			errorMsg:      "controller client not configured",
		},
		{
			name:          "handles server error",
			hasController: true,
			setupMock: func() {
				httpmock.RegisterResponder("GET", "http://test-controller:9000/tables",
					httpmock.NewStringResponder(500, "Internal Server Error"))
			},
			expectError: true,
			errorMsg:    "list tables failed with status 500",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			httpmock.Activate()
			defer httpmock.DeactivateAndReset()
			tt.setupMock()

			opts := PinotClientOptions{
				BrokerUrl:      "http://test-broker:8099",
				BrokerAuthType: AuthTypeNone,
			}
			if tt.hasController {
				opts.ControllerUrl = "http://test-controller:9000"
				opts.ControllerAuthType = AuthTypeNone
			}

			client, err := New(opts)
			require.NoError(t, err)

			if tt.hasController {
				// Replace the controller's httpClient with a mock-enabled one
				httpmock.ActivateNonDefault(client.controllerClient.httpClient)
			}

			tables, err := client.Tables(context.Background())

			if tt.expectError {
				assert.Error(t, err)
				if tt.errorMsg != "" {
					assert.Contains(t, err.Error(), tt.errorMsg)
				}
			} else {
				assert.NoError(t, err)
				if len(tt.expectedTables) == 0 {
					assert.Empty(t, tables)
				} else {
					assert.Equal(t, tt.expectedTables, tables)
				}
			}
		})
	}
}

func TestPinotClient_Schemas(t *testing.T) {
	tests := []struct {
		name          string
		hasController bool
		expectError   bool
		errorMsg      string
	}{
		{
			name:          "returns empty list when controller configured",
			hasController: true,
			expectError:   false,
		},
		{
			name:          "fails when controller not configured",
			hasController: false,
			expectError:   true,
			errorMsg:      "controller client not configured",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			opts := PinotClientOptions{
				BrokerUrl:      "http://test-broker:8099",
				BrokerAuthType: AuthTypeNone,
			}
			if tt.hasController {
				opts.ControllerUrl = "http://test-controller:9000"
				opts.ControllerAuthType = AuthTypeNone
			}

			client, err := New(opts)
			require.NoError(t, err)

			schemas, err := client.Schemas(context.Background())

			if tt.expectError {
				assert.Error(t, err)
				if tt.errorMsg != "" {
					assert.Contains(t, err.Error(), tt.errorMsg)
				}
			} else {
				assert.NoError(t, err)
				assert.Empty(t, schemas)
			}
		})
	}
}

// ============================================================================
// DataSource Tests
// ============================================================================

func TestDataSource_CheckHealth(t *testing.T) {
	tests := []struct {
		name           string
		hasController  bool
		setupMock      func()
		expectedStatus backend.HealthStatus
		expectedMsgs   []string
	}{
		{
			name:          "successful health check with broker only",
			hasController: false,
			setupMock: func() {
				httpmock.RegisterResponder("GET", "http://test-broker:8099/health",
					httpmock.NewStringResponder(200, "OK"))
				httpmock.RegisterResponder("POST", "http://test-broker:8099/query/sql",
					httpmock.NewStringResponder(200, `{}`))
			},
			expectedStatus: backend.HealthStatusOk,
			expectedMsgs:   []string{"Broker health check passed", "Broker query endpoint verified", "Controller URL not configured"},
		},
		{
			name:          "successful health check with broker and controller",
			hasController: true,
			setupMock: func() {
				httpmock.RegisterResponder("GET", "http://test-broker:8099/health",
					httpmock.NewStringResponder(200, "OK"))
				httpmock.RegisterResponder("POST", "http://test-broker:8099/query/sql",
					httpmock.NewStringResponder(200, `{}`))
				httpmock.RegisterResponder("GET", "http://test-controller:9000/tables",
					httpmock.NewStringResponder(200, `{"tables":["table1","table2"]}`))
			},
			expectedStatus: backend.HealthStatusOk,
			expectedMsgs:   []string{"Broker health check passed", "Broker query endpoint verified", "Controller connected (2 tables available)"},
		},
		{
			name:          "broker health check fails",
			hasController: false,
			setupMock: func() {
				httpmock.RegisterResponder("GET", "http://test-broker:8099/health",
					httpmock.NewStringResponder(503, "Service Unavailable"))
			},
			expectedStatus: backend.HealthStatusError,
			expectedMsgs:   []string{"Broker health check failed"},
		},
		{
			name:          "broker query test fails",
			hasController: false,
			setupMock: func() {
				httpmock.RegisterResponder("GET", "http://test-broker:8099/health",
					httpmock.NewStringResponder(200, "OK"))
				httpmock.RegisterResponder("POST", "http://test-broker:8099/query/sql",
					httpmock.NewStringResponder(500, "Query error"))
			},
			expectedStatus: backend.HealthStatusError,
			expectedMsgs:   []string{"query test failed"},
		},
		{
			name:          "controller connection fails",
			hasController: true,
			setupMock: func() {
				httpmock.RegisterResponder("GET", "http://test-broker:8099/health",
					httpmock.NewStringResponder(200, "OK"))
				httpmock.RegisterResponder("POST", "http://test-broker:8099/query/sql",
					httpmock.NewStringResponder(200, `{}`))
				httpmock.RegisterResponder("GET", "http://test-controller:9000/tables",
					httpmock.NewStringResponder(500, "Controller error"))
			},
			expectedStatus: backend.HealthStatusError,
			expectedMsgs:   []string{"Controller connection failed"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			httpmock.Activate()
			defer httpmock.DeactivateAndReset()
			tt.setupMock()

			opts := PinotClientOptions{
				BrokerUrl:      "http://test-broker:8099",
				BrokerAuthType: AuthTypeNone,
			}
			if tt.hasController {
				opts.ControllerUrl = "http://test-controller:9000"
				opts.ControllerAuthType = AuthTypeNone
			}

			client, err := New(opts)
			require.NoError(t, err)

			// Replace the broker and controller httpClient with mock-enabled ones
			httpmock.ActivateNonDefault(client.brokerClient.httpClient)
			if tt.hasController {
				httpmock.ActivateNonDefault(client.controllerClient.httpClient)
			}

			ds := &DataSource{client: client}

			result, err := ds.CheckHealth(context.Background(), &backend.CheckHealthRequest{})

			assert.NoError(t, err)
			require.NotNil(t, result)
			assert.Equal(t, tt.expectedStatus, result.Status)

			for _, msg := range tt.expectedMsgs {
				assert.Contains(t, result.Message, msg)
			}
		})
	}
}

func TestDataSource_QueryData(t *testing.T) {
	client, err := New(PinotClientOptions{
		BrokerUrl:      "http://test-broker:8099",
		BrokerAuthType: AuthTypeNone,
	})
	require.NoError(t, err)

	ds := &DataSource{client: client}

	req := &backend.QueryDataRequest{
		Queries: []backend.DataQuery{
			{RefID: "A", QueryType: "test"},
			{RefID: "B", QueryType: "test"},
		},
	}

	resp, err := ds.QueryData(context.Background(), req)

	assert.NoError(t, err)
	require.NotNil(t, resp)
	assert.Len(t, resp.Responses, 2)
	assert.Contains(t, resp.Responses, "A")
	assert.Contains(t, resp.Responses, "B")
}

// ============================================================================
// Configuration Parsing Tests
// ============================================================================

func TestNewDataSourceInstance(t *testing.T) {
	tests := []struct {
		name         string
		jsonData     string
		secureData   map[string]string
		expectError  bool
		errorMsg     string
		validate     func(t *testing.T, instance *DataSource)
	}{
		{
			name:     "creates instance with broker only",
			jsonData: `{"broker":{"url":"http://localhost:8099","authType":"none"}}`,
			expectError: false,
			validate: func(t *testing.T, instance *DataSource) {
				assert.NotNil(t, instance.client)
				assert.NotNil(t, instance.client.brokerClient)
				assert.Nil(t, instance.client.controllerClient)
			},
		},
		{
			name:     "creates instance with broker and controller",
			jsonData: `{"broker":{"url":"http://localhost:8099","authType":"none"},"controller":{"url":"http://localhost:9000","authType":"none"}}`,
			expectError: false,
			validate: func(t *testing.T, instance *DataSource) {
				assert.NotNil(t, instance.client.brokerClient)
				assert.NotNil(t, instance.client.controllerClient)
			},
		},
		{
			name:     "creates instance with basic auth",
			jsonData: `{"broker":{"url":"http://localhost:8099","authType":"basic","userName":"testuser"}}`,
			secureData: map[string]string{
				"brokerPassword": "testpass",
			},
			expectError: false,
			validate: func(t *testing.T, instance *DataSource) {
				assert.Equal(t, AuthTypeBasic, instance.client.brokerClient.authType)
				assert.Equal(t, "testuser", instance.client.brokerClient.username)
				assert.Equal(t, "testpass", instance.client.brokerClient.password)
			},
		},
		{
			name:     "creates instance with bearer token",
			jsonData: `{"broker":{"url":"http://localhost:8099","authType":"bearer"}}`,
			secureData: map[string]string{
				"brokerToken": "test-token-123",
			},
			expectError: false,
			validate: func(t *testing.T, instance *DataSource) {
				assert.Equal(t, AuthTypeBearer, instance.client.brokerClient.authType)
				assert.Equal(t, "test-token-123", instance.client.brokerClient.token)
			},
		},
		{
			name:        "fails with invalid JSON",
			jsonData:    `{invalid json}`,
			expectError: true,
			errorMsg:    "failed to parse datasource config",
		},
		{
			name:        "fails without broker URL",
			jsonData:    `{}`,
			expectError: true,
			errorMsg:    "broker URL is required",
		},
		{
			name:     "creates instance with TLS skip verify",
			jsonData: `{"broker":{"url":"http://localhost:8099","authType":"none","tlsSkipVerify":true}}`,
			expectError: false,
			validate: func(t *testing.T, instance *DataSource) {
				assert.NotNil(t, instance.client.brokerClient)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			settings := backend.DataSourceInstanceSettings{
				JSONData:                []byte(tt.jsonData),
				DecryptedSecureJSONData: tt.secureData,
			}

			instance, err := newDataSourceInstance(context.Background(), settings)

			if tt.expectError {
				assert.Error(t, err)
				if tt.errorMsg != "" {
					assert.Contains(t, err.Error(), tt.errorMsg)
				}
			} else {
				assert.NoError(t, err)
				require.NotNil(t, instance)
				ds, ok := instance.(*DataSource)
				require.True(t, ok)
				if tt.validate != nil {
					tt.validate(t, ds)
				}
			}
		})
	}
}

// ============================================================================
// Type Tests
// ============================================================================

func TestAuthType(t *testing.T) {
	tests := []struct {
		name     string
		authType AuthType
		expected string
	}{
		{"none auth type", AuthTypeNone, "none"},
		{"basic auth type", AuthTypeBasic, "basic"},
		{"bearer auth type", AuthTypeBearer, "bearer"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.expected, string(tt.authType))
		})
	}
}

func TestDataSourceConfig_JSON(t *testing.T) {
	tests := []struct {
		name     string
		config   DataSourceConfig
		validate func(t *testing.T, jsonBytes []byte)
	}{
		{
			name: "serializes broker config",
			config: DataSourceConfig{
				Broker: &HTTPClientConfig{
					Url:      "http://localhost:8099",
					AuthType: AuthTypeBasic,
					UserName: "testuser",
				},
			},
			validate: func(t *testing.T, jsonBytes []byte) {
				var parsed map[string]interface{}
				err := json.Unmarshal(jsonBytes, &parsed)
				require.NoError(t, err)
				assert.NotNil(t, parsed["broker"])
			},
		},
		{
			name: "serializes broker and controller config",
			config: DataSourceConfig{
				Broker: &HTTPClientConfig{
					Url:      "http://localhost:8099",
					AuthType: AuthTypeNone,
				},
				Controller: &HTTPClientConfig{
					Url:      "http://localhost:9000",
					AuthType: AuthTypeBearer,
				},
			},
			validate: func(t *testing.T, jsonBytes []byte) {
				var parsed map[string]interface{}
				err := json.Unmarshal(jsonBytes, &parsed)
				require.NoError(t, err)
				assert.NotNil(t, parsed["broker"])
				assert.NotNil(t, parsed["controller"])
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			jsonBytes, err := json.Marshal(tt.config)
			require.NoError(t, err)
			tt.validate(t, jsonBytes)
		})
	}
}

func TestTablesResponse_JSON(t *testing.T) {
	jsonStr := `{"tables":["table1","table2","table3"]}`

	var resp TablesResponse
	err := json.Unmarshal([]byte(jsonStr), &resp)
	require.NoError(t, err)
	assert.Equal(t, []string{"table1", "table2", "table3"}, resp.Tables)
}
