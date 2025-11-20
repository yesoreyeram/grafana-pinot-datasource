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
	BrokerUrl     string   `json:"brokerUrl"`
	ControllerUrl string   `json:"controllerUrl"`
	AuthType      AuthType `json:"authType"`
	Username      string   `json:"username"`
	TlsSkipVerify bool     `json:"tlsSkipVerify"`
}

type SecureDataSourceConfig struct {
	Password string `json:"password"`
	Token    string `json:"token"`
}

type PinotClientOptions struct {
	BrokerUrl     string
	ControllerUrl string
	AuthType      AuthType
	Username      string
	Password      string
	Token         string
	HTTPClient    *http.Client
}

type PinotClient struct {
	brokerUrl     string
	controllerUrl string
	authType      AuthType
	username      string
	password      string
	token         string
	httpClient    *http.Client
}

type DataSource struct {
	client *PinotClient
}

// New creates a new Pinot client with the given options
func New(opts PinotClientOptions) (*PinotClient, error) {
	if opts.BrokerUrl == "" {
		return nil, fmt.Errorf("broker URL is required")
	}

	return &PinotClient{
		brokerUrl:     strings.TrimSuffix(opts.BrokerUrl, "/"),
		controllerUrl: strings.TrimSuffix(opts.ControllerUrl, "/"),
		authType:      opts.AuthType,
		username:      opts.Username,
		password:      opts.Password,
		token:         opts.Token,
		httpClient:    opts.HTTPClient,
	}, nil
}

// addAuth adds authentication headers to the HTTP request based on auth type
func (c *PinotClient) addAuth(req *http.Request) {
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
func (c *PinotClient) doRequest(ctx context.Context, method, url string, body io.Reader) (*http.Response, error) {
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

// Health checks the health of the Pinot broker
func (c *PinotClient) Health(ctx context.Context) error {
	healthUrl := c.brokerUrl + "/health"

	resp, err := c.doRequest(ctx, "GET", healthUrl, nil)
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
	queryUrl := c.brokerUrl + "/query/sql"
	queryPayload := fmt.Sprintf(`{"sql": "%s"}`, sql)

	resp, err := c.doRequest(ctx, "POST", queryUrl, strings.NewReader(queryPayload))
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

// Tables retrieves the list of tables from Pinot (stub for future implementation)
func (c *PinotClient) Tables(ctx context.Context) ([]string, error) {
	// This would typically call the controller API
	// For now, return empty list as placeholder
	return []string{}, nil
}

// Schemas retrieves the schema information from Pinot (stub for future implementation)
func (c *PinotClient) Schemas(ctx context.Context) ([]string, error) {
	// This would typically call the controller API
	// For now, return empty list as placeholder
	return []string{}, nil
}

func (ds *DataSource) CheckHealth(ctx context.Context, req *backend.CheckHealthRequest) (*backend.CheckHealthResult, error) {
	// Check broker health
	if err := ds.client.Health(ctx); err != nil {
		return &backend.CheckHealthResult{
			Status:  backend.HealthStatusError,
			Message: fmt.Sprintf("Health check failed: %v", err),
		}, nil
	}

	// Test query endpoint with a simple query
	resp, err := ds.client.Query(ctx, "SELECT 1")
	if err != nil {
		return &backend.CheckHealthResult{
			Status:  backend.HealthStatusOk,
			Message: fmt.Sprintf("Connected to Pinot broker, but query test failed: %v", err),
		}, nil
	}
	defer resp.Body.Close()

	return &backend.CheckHealthResult{
		Status:  backend.HealthStatusOk,
		Message: "Successfully connected to Apache Pinot broker and verified query endpoint",
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
			if password, ok := settings.DecryptedSecureJSONData["password"]; ok {
				secureConfig.Password = password
			}
			if token, ok := settings.DecryptedSecureJSONData["token"]; ok {
				secureConfig.Token = token
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
			BrokerUrl:     config.BrokerUrl,
			ControllerUrl: config.ControllerUrl,
			AuthType:      config.AuthType,
			Username:      config.Username,
			Password:      secureConfig.Password,
			Token:         secureConfig.Token,
			HTTPClient:    httpClient,
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
