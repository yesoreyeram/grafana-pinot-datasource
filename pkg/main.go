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

const PluginId = "yesoreyeram-pinot-datasource"

type AuthType string

const (
	AuthTypeNone   AuthType = "none"
	AuthTypeBasic  AuthType = "basic"
	AuthTypeBearer AuthType = "bearer"
)

type DataSourceConfig struct {
	BrokerUrl          string   `json:"brokerUrl"`
	ControllerUrl      string   `json:"controllerUrl"`
	BrokerAuthType     AuthType `json:"brokerAuthType"`
	BrokerUsername     string   `json:"brokerUsername"`
	ControllerAuthType AuthType `json:"controllerAuthType"`
	ControllerUsername string   `json:"controllerUsername"`
	TlsSkipVerify      bool     `json:"tlsSkipVerify"`
}

type SecureDataSourceConfig struct {
	BrokerPassword     string `json:"brokerPassword"`
	BrokerToken        string `json:"brokerToken"`
	ControllerPassword string `json:"controllerPassword"`
	ControllerToken    string `json:"controllerToken"`
}

type HTTPClientConfig struct {
	URL        string
	AuthType   AuthType
	Username   string
	Password   string
	Token      string
	HTTPClient *http.Client
}

type HTTPClient struct {
	url        string
	authType   AuthType
	username   string
	password   string
	token      string
	httpClient *http.Client
}

type PinotClientOptions struct {
	BrokerUrl          string
	ControllerUrl      string
	BrokerAuthType     AuthType
	BrokerUsername     string
	BrokerPassword     string
	BrokerToken        string
	ControllerAuthType AuthType
	ControllerUsername string
	ControllerPassword string
	ControllerToken    string
	HTTPClient         *http.Client
}

type PinotClient struct {
	brokerClient     *HTTPClient
	controllerClient *HTTPClient
}

type DataSource struct {
	client *PinotClient
}

// NewHTTPClient creates a new HTTP client with the given configuration
func NewHTTPClient(config HTTPClientConfig) *HTTPClient {
	return &HTTPClient{
		url:        strings.TrimSuffix(config.URL, "/"),
		authType:   config.AuthType,
		username:   config.Username,
		password:   config.Password,
		token:      config.Token,
		httpClient: config.HTTPClient,
	}
}

// addAuth adds authentication headers to the HTTP request
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
		// No authentication
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

// New creates a new Pinot client with the given options
func New(opts PinotClientOptions) (*PinotClient, error) {
	if opts.BrokerUrl == "" {
		return nil, fmt.Errorf("broker URL is required")
	}

	brokerClient := NewHTTPClient(HTTPClientConfig{
		URL:        opts.BrokerUrl,
		AuthType:   opts.BrokerAuthType,
		Username:   opts.BrokerUsername,
		Password:   opts.BrokerPassword,
		Token:      opts.BrokerToken,
		HTTPClient: opts.HTTPClient,
	})

	var controllerClient *HTTPClient
	if opts.ControllerUrl != "" {
		controllerClient = NewHTTPClient(HTTPClientConfig{
			URL:        opts.ControllerUrl,
			AuthType:   opts.ControllerAuthType,
			Username:   opts.ControllerUsername,
			Password:   opts.ControllerPassword,
			Token:      opts.ControllerToken,
			HTTPClient: opts.HTTPClient,
		})
	}

	return &PinotClient{
		brokerClient:     brokerClient,
		controllerClient: controllerClient,
	}, nil
}

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

// Query executes a SQL query against Pinot
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

type TablesResponse struct {
	Tables []string `json:"tables"`
}

// Tables retrieves the list of tables from Pinot controller
func (c *PinotClient) Tables(ctx context.Context) ([]string, error) {
	if c.controllerClient == nil {
		return nil, fmt.Errorf("controller URL is required to list tables")
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

// Schemas retrieves the schema information from Pinot (stub for future implementation)
func (c *PinotClient) Schemas(ctx context.Context) ([]string, error) {
	// This would typically call the controller API
	// For now, return empty list as placeholder
	return []string{}, nil
}

func (ds *DataSource) CheckHealth(ctx context.Context, req *backend.CheckHealthRequest) (*backend.CheckHealthResult, error) {
	var healthMessages []string

	// Check broker health
	if err := ds.client.Health(ctx); err != nil {
		return &backend.CheckHealthResult{
			Status:  backend.HealthStatusError,
			Message: fmt.Sprintf("Broker health check failed: %v", err),
		}, nil
	}
	healthMessages = append(healthMessages, "✓ Broker health check passed")

	// Test query endpoint with a simple query
	resp, err := ds.client.Query(ctx, "SELECT 1")
	if err != nil {
		return &backend.CheckHealthResult{
			Status:  backend.HealthStatusError,
			Message: fmt.Sprintf("Broker connected, but query test failed: %v", err),
		}, nil
	}
	resp.Body.Close()
	healthMessages = append(healthMessages, "✓ Broker query endpoint verified")

	// Check controller if client is available
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

func (ds *DataSource) QueryData(ctx context.Context, req *backend.QueryDataRequest) (*backend.QueryDataResponse, error) {
	response := backend.NewQueryDataResponse()
	for _, q := range req.Queries {
		frame := data.NewFrame(
			q.QueryType, data.NewField("response", nil, []string{"pinot response"}),
		).SetMeta(
			&data.FrameMeta{Notices: []data.Notice{{Text: "Apache Pinot™ query works. but not fully implemented"}}},
		)
		response.Responses[q.RefID] = backend.DataResponse{
			Frames: data.Frames{frame},
			Status: backend.StatusOK,
		}
	}
	return response, nil
}

func (ds *DataSource) Dispose() {
	backend.Logger.Debug("disposing plugin instance")
}

func main() {
	backend.SetupPluginEnvironment(PluginId)
	err := datasource.Manage(PluginId, func(ctx context.Context, settings backend.DataSourceInstanceSettings) (instancemgmt.Instance, error) {
		var config DataSourceConfig
		var secureConfig SecureDataSourceConfig

		// Parse JSON data
		if err := json.Unmarshal(settings.JSONData, &config); err != nil {
			backend.Logger.Error("Failed to parse datasource config", "error", err)
			return nil, err
		}

		// Parse secure JSON data
		if settings.DecryptedSecureJSONData != nil {
			if password, ok := settings.DecryptedSecureJSONData["brokerPassword"]; ok {
				secureConfig.BrokerPassword = password
			}
			if token, ok := settings.DecryptedSecureJSONData["brokerToken"]; ok {
				secureConfig.BrokerToken = token
			}
			if password, ok := settings.DecryptedSecureJSONData["controllerPassword"]; ok {
				secureConfig.ControllerPassword = password
			}
			if token, ok := settings.DecryptedSecureJSONData["controllerToken"]; ok {
				secureConfig.ControllerToken = token
			}
		}

		// Create HTTP client with TLS configuration
		tlsConfig := &tls.Config{
			InsecureSkipVerify: config.TlsSkipVerify,
		}

		httpClient := &http.Client{
			Timeout: 30 * time.Second,
			Transport: &http.Transport{
				TLSClientConfig: tlsConfig,
			},
		}

		// Create Pinot client
		client, err := New(PinotClientOptions{
			BrokerUrl:          config.BrokerUrl,
			ControllerUrl:      config.ControllerUrl,
			BrokerAuthType:     config.BrokerAuthType,
			BrokerUsername:     config.BrokerUsername,
			BrokerPassword:     secureConfig.BrokerPassword,
			BrokerToken:        secureConfig.BrokerToken,
			ControllerAuthType: config.ControllerAuthType,
			ControllerUsername: config.ControllerUsername,
			ControllerPassword: secureConfig.ControllerPassword,
			ControllerToken:    secureConfig.ControllerToken,
			HTTPClient:         httpClient,
		})
		if err != nil {
			backend.Logger.Error("Failed to create Pinot client", "error", err)
			return nil, err
		}

		return &DataSource{
			client: client,
		}, nil
	}, datasource.ManageOpts{})
	if err != nil {
		backend.Logger.Error(err.Error())
		os.Exit(1)
	}
}
