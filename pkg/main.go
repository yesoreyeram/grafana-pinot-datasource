package main

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/datasource"
	"github.com/grafana/grafana-plugin-sdk-go/backend/instancemgmt"
	"github.com/grafana/grafana-plugin-sdk-go/data"
)

// ============================================================================
// CONSTANTS
// ============================================================================

const PluginId = "yesoreyeram-pinot-datasource"

// ============================================================================
// TYPES - Authentication
// ============================================================================

// AuthType represents the type of authentication to use
type AuthType string

const (
	AuthTypeNone   AuthType = "none"   // No authentication
	AuthTypeBasic  AuthType = "basic"  // Basic authentication (username + password)
	AuthTypeBearer AuthType = "bearer" // Bearer token authentication
)

// ============================================================================
// TYPES - Configuration
// ============================================================================

// DataSourceConfig holds the public configuration for the datasource
type DataSourceConfig struct {
	// Broker configuration
	BrokerUrl           string   `json:"brokerUrl"`
	BrokerAuthType      AuthType `json:"brokerAuthType"`
	BrokerUsername      string   `json:"brokerUsername"`
	BrokerTlsSkipVerify bool     `json:"brokerTlsSkipVerify"`

	// Controller configuration
	ControllerUrl           string   `json:"controllerUrl"`
	ControllerAuthType      AuthType `json:"controllerAuthType"`
	ControllerUsername      string   `json:"controllerUsername"`
	ControllerTlsSkipVerify bool     `json:"controllerTlsSkipVerify"`
}

// SecureDataSourceConfig holds the secure/encrypted configuration for the datasource
type SecureDataSourceConfig struct {
	// Broker secure configuration
	BrokerPassword string `json:"brokerPassword"`
	BrokerToken    string `json:"brokerToken"`

	// Controller secure configuration
	ControllerPassword string `json:"controllerPassword"`
	ControllerToken    string `json:"controllerToken"`
}

// ============================================================================
// TYPES - HTTP Client
// ============================================================================

// HTTPClientConfig holds the configuration for creating an HTTP client
type HTTPClientConfig struct {
	URL           string
	AuthType      AuthType
	Username      string
	Password      string
	Token         string
	TlsSkipVerify bool
	Timeout       time.Duration
}

// HTTPClient wraps http.Client with Pinot-specific authentication and configuration
type HTTPClient struct {
	url        string
	authType   AuthType
	username   string
	password   string
	token      string
	httpClient *http.Client
}

// ============================================================================
// TYPES - Pinot Client
// ============================================================================

// PinotClientOptions holds options for creating a Pinot client
type PinotClientOptions struct {
	// Broker options
	BrokerUrl           string
	BrokerAuthType      AuthType
	BrokerUsername      string
	BrokerPassword      string
	BrokerToken         string
	BrokerTlsSkipVerify bool
	BrokerTimeout       time.Duration

	// Controller options
	ControllerUrl           string
	ControllerAuthType      AuthType
	ControllerUsername      string
	ControllerPassword      string
	ControllerToken         string
	ControllerTlsSkipVerify bool
	ControllerTimeout       time.Duration
}

// PinotClient is the main client for interacting with Apache Pinot
// It maintains separate HTTP clients for broker and controller endpoints
type PinotClient struct {
	brokerClient     *HTTPClient
	controllerClient *HTTPClient
}

// TablesResponse represents the response from the tables API
type TablesResponse struct {
	Tables []string `json:"tables"`
}

// ============================================================================
// TYPES - Grafana DataSource
// ============================================================================

// DataSource implements the Grafana datasource interface
type DataSource struct {
	client *PinotClient
}

// ============================================================================
// HTTP CLIENT - Factory and Methods
// ============================================================================

// NewHTTPClient creates a new HTTP client with the given configuration
func NewHTTPClient(config HTTPClientConfig) *HTTPClient {
	// Set default timeout if not specified
	timeout := config.Timeout
	if timeout == 0 {
		timeout = 30 * time.Second
	}

	// Create TLS configuration
	tlsConfig := &tls.Config{
		InsecureSkipVerify: config.TlsSkipVerify,
	}

	// Create HTTP client with timeout and TLS config
	httpClient := &http.Client{
		Timeout: timeout,
		Transport: &http.Transport{
			TLSClientConfig: tlsConfig,
		},
	}

	return &HTTPClient{
		url:        strings.TrimSuffix(config.URL, "/"),
		authType:   config.AuthType,
		username:   config.Username,
		password:   config.Password,
		token:      config.Token,
		httpClient: httpClient,
	}
}

// doRequest performs an HTTP request with authentication
func (c *HTTPClient) doRequest(ctx context.Context, method, path string, body io.Reader) (*http.Response, error) {
	url := c.url + path
	req, err := http.NewRequestWithContext(ctx, method, url, body)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	c.addAuth(req)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to execute request: %w", err)
	}

	return resp, nil
}

// addAuth adds authentication headers to the HTTP request based on auth type
func (c *HTTPClient) addAuth(req *http.Request) {
	switch c.authType {
	case AuthTypeBasic:
		if c.username != "" && c.password != "" {
			req.SetBasicAuth(c.username, c.password)
		}
	case AuthTypeBearer:
		if c.token != "" {
			req.Header.Set("Authorization", "Bearer "+c.token)
		}
	case AuthTypeNone:
		// No authentication required
	}
}

// ============================================================================
// PINOT CLIENT - Factory and Core Methods
// ============================================================================

// New creates a new Pinot client with separate broker and controller configurations
func New(opts PinotClientOptions) (*PinotClient, error) {
	// Validate required configuration
	if opts.BrokerUrl == "" {
		return nil, fmt.Errorf("broker URL is required")
	}

	// Set default timeouts if not specified
	if opts.BrokerTimeout == 0 {
		opts.BrokerTimeout = 30 * time.Second
	}
	if opts.ControllerTimeout == 0 {
		opts.ControllerTimeout = 30 * time.Second
	}

	// Create broker HTTP client with separate TLS configuration
	brokerClient := NewHTTPClient(HTTPClientConfig{
		URL:           opts.BrokerUrl,
		AuthType:      opts.BrokerAuthType,
		Username:      opts.BrokerUsername,
		Password:      opts.BrokerPassword,
		Token:         opts.BrokerToken,
		TlsSkipVerify: opts.BrokerTlsSkipVerify,
		Timeout:       opts.BrokerTimeout,
	})

	// Create controller HTTP client with separate TLS configuration (if URL provided)
	var controllerClient *HTTPClient
	if opts.ControllerUrl != "" {
		controllerClient = NewHTTPClient(HTTPClientConfig{
			URL:           opts.ControllerUrl,
			AuthType:      opts.ControllerAuthType,
			Username:      opts.ControllerUsername,
			Password:      opts.ControllerPassword,
			Token:         opts.ControllerToken,
			TlsSkipVerify: opts.ControllerTlsSkipVerify,
			Timeout:       opts.ControllerTimeout,
		})
	}

	return &PinotClient{
		brokerClient:     brokerClient,
		controllerClient: controllerClient,
	}, nil
}

// ============================================================================
// PINOT CLIENT - Broker Operations
// ============================================================================

// Health checks the health of the Pinot broker
func (c *PinotClient) Health(ctx context.Context) error {
	resp, err := c.brokerClient.doRequest(ctx, "GET", "/health", nil)
	if err != nil {
		return fmt.Errorf("failed to connect to Pinot broker: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("health check failed with status %d: %s", resp.StatusCode, string(body))
	}

	return nil
}

// Query executes a SQL query against the Pinot broker
func (c *PinotClient) Query(ctx context.Context, sql string) (*http.Response, error) {
	queryPayload := fmt.Sprintf(`{"sql": "%s"}`, sql)

	resp, err := c.brokerClient.doRequest(ctx, "POST", "/query/sql", strings.NewReader(queryPayload))
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		return nil, fmt.Errorf("query failed with status %d: %s", resp.StatusCode, string(body))
	}

	return resp, nil
}

// ============================================================================
// PINOT CLIENT - Controller Operations
// ============================================================================

// Tables retrieves the list of tables from the Pinot controller
func (c *PinotClient) Tables(ctx context.Context) ([]string, error) {
	if c.controllerClient == nil {
		return nil, fmt.Errorf("controller client not configured")
	}

	resp, err := c.controllerClient.doRequest(ctx, "GET", "/tables", nil)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to Pinot controller: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("list tables failed with status %d: %s", resp.StatusCode, string(body))
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	var tablesResp TablesResponse
	if err := json.Unmarshal(body, &tablesResp); err != nil {
		return nil, fmt.Errorf("failed to parse tables response: %w", err)
	}

	return tablesResp.Tables, nil
}

// Schemas retrieves schema information from the Pinot controller
// TODO: Implement schema retrieval from controller API
func (c *PinotClient) Schemas(ctx context.Context) ([]string, error) {
	if c.controllerClient == nil {
		return nil, fmt.Errorf("controller client not configured")
	}

	// Placeholder for future implementation
	return []string{}, nil
}

// ============================================================================
// DATASOURCE - Grafana Interface Implementation
// ============================================================================

// CheckHealth performs a health check on the datasource
func (ds *DataSource) CheckHealth(ctx context.Context, req *backend.CheckHealthRequest) (*backend.CheckHealthResult, error) {
	var healthMessages []string

	// Check broker health endpoint
	if err := ds.client.Health(ctx); err != nil {
		return &backend.CheckHealthResult{
			Status:  backend.HealthStatusError,
			Message: fmt.Sprintf("Broker health check failed: %v", err),
		}, nil
	}
	healthMessages = append(healthMessages, "✓ Broker health check passed")

	// Test broker query endpoint with a simple query
	resp, err := ds.client.Query(ctx, "SELECT 1")
	if err != nil {
		return &backend.CheckHealthResult{
			Status:  backend.HealthStatusError,
			Message: fmt.Sprintf("Broker connected, but query test failed: %v", err),
		}, nil
	}
	resp.Body.Close()
	healthMessages = append(healthMessages, "✓ Broker query endpoint verified")

	// Check controller if configured
	if ds.client.controllerClient != nil {
		tables, err := ds.client.Tables(ctx)
		if err != nil {
			return &backend.CheckHealthResult{
				Status:  backend.HealthStatusError,
				Message: fmt.Sprintf("Controller connection failed: %v", err),
			}, nil
		}
		if len(tables) == 0 {
			healthMessages = append(healthMessages, "⚠ Controller connected, but no tables found")
		} else {
			healthMessages = append(healthMessages, fmt.Sprintf("✓ Controller connected (%d tables available)", len(tables)))
		}
	} else {
		healthMessages = append(healthMessages, "⚠ Controller URL not configured (metadata operations unavailable)")
	}

	return &backend.CheckHealthResult{
		Status:  backend.HealthStatusOk,
		Message: strings.Join(healthMessages, "\n"),
	}, nil
}

// QueryData handles query requests from Grafana
// TODO: Implement actual query execution and data transformation
func (ds *DataSource) QueryData(ctx context.Context, req *backend.QueryDataRequest) (*backend.QueryDataResponse, error) {
	response := backend.NewQueryDataResponse()

	for _, q := range req.Queries {
		frame := data.NewFrame(
			q.QueryType,
			data.NewField("response", nil, []string{"pinot response"}),
		).SetMeta(
			&data.FrameMeta{
				Notices: []data.Notice{
					{Text: "Apache Pinot™ query works, but not fully implemented"},
				},
			},
		)

		response.Responses[q.RefID] = backend.DataResponse{
			Frames: data.Frames{frame},
			Status: backend.StatusOK,
		}
	}

	return response, nil
}

// Dispose cleans up resources when the datasource instance is removed
func (ds *DataSource) Dispose() {
	backend.Logger.Debug("disposing plugin instance")
}

// ============================================================================
// MAIN - Plugin Initialization
// ============================================================================

func main() {
	backend.SetupPluginEnvironment(PluginId)

	err := datasource.Manage(
		PluginId,
		newDataSourceInstance,
		datasource.ManageOpts{},
	)

	if err != nil {
		backend.Logger.Error(err.Error())
		os.Exit(1)
	}
}

// newDataSourceInstance creates a new instance of the datasource
func newDataSourceInstance(ctx context.Context, settings backend.DataSourceInstanceSettings) (instancemgmt.Instance, error) {
	// Parse public configuration
	var config DataSourceConfig
	if err := json.Unmarshal(settings.JSONData, &config); err != nil {
		backend.Logger.Error("Failed to parse datasource config", "error", err)
		return nil, fmt.Errorf("failed to parse datasource config: %w", err)
	}

	// Parse secure configuration
	var secureConfig SecureDataSourceConfig
	if settings.DecryptedSecureJSONData != nil {
		// Broker secure fields
		if password, ok := settings.DecryptedSecureJSONData["brokerPassword"]; ok {
			secureConfig.BrokerPassword = password
		}
		if token, ok := settings.DecryptedSecureJSONData["brokerToken"]; ok {
			secureConfig.BrokerToken = token
		}

		// Controller secure fields
		if password, ok := settings.DecryptedSecureJSONData["controllerPassword"]; ok {
			secureConfig.ControllerPassword = password
		}
		if token, ok := settings.DecryptedSecureJSONData["controllerToken"]; ok {
			secureConfig.ControllerToken = token
		}
	}

	// Create Pinot client with separate configurations for broker and controller
	client, err := New(PinotClientOptions{
		// Broker configuration
		BrokerUrl:           config.BrokerUrl,
		BrokerAuthType:      config.BrokerAuthType,
		BrokerUsername:      config.BrokerUsername,
		BrokerPassword:      secureConfig.BrokerPassword,
		BrokerToken:         secureConfig.BrokerToken,
		BrokerTlsSkipVerify: config.BrokerTlsSkipVerify,
		BrokerTimeout:       30 * time.Second,

		// Controller configuration
		ControllerUrl:           config.ControllerUrl,
		ControllerAuthType:      config.ControllerAuthType,
		ControllerUsername:      config.ControllerUsername,
		ControllerPassword:      secureConfig.ControllerPassword,
		ControllerToken:         secureConfig.ControllerToken,
		ControllerTlsSkipVerify: config.ControllerTlsSkipVerify,
		ControllerTimeout:       30 * time.Second,
	})

	if err != nil {
		backend.Logger.Error("Failed to create Pinot client", "error", err)
		return nil, fmt.Errorf("failed to create Pinot client: %w", err)
	}

	return &DataSource{
		client: client,
	}, nil
}
