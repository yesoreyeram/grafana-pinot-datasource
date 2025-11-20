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

type DataSourceConfig struct {
	BrokerUrl     string `json:"brokerUrl"`
	ControllerUrl string `json:"controllerUrl"`
	TlsSkipVerify bool   `json:"tlsSkipVerify"`
}

type SecureDataSourceConfig struct {
	BasicAuthPassword string `json:"basicAuthPassword"`
	BearerToken       string `json:"bearerToken"`
}

type DataSource struct {
	config        DataSourceConfig
	secureConfig  SecureDataSourceConfig
	httpClient    *http.Client
	basicAuthUser string
}

func (ds *DataSource) CheckHealth(ctx context.Context, req *backend.CheckHealthRequest) (*backend.CheckHealthResult, error) {
	if ds.config.BrokerUrl == "" {
		return &backend.CheckHealthResult{
			Status:  backend.HealthStatusError,
			Message: "Broker URL is required",
		}, nil
	}

	// Try to ping the broker health endpoint
	healthUrl := strings.TrimSuffix(ds.config.BrokerUrl, "/") + "/health"

	httpReq, err := http.NewRequestWithContext(ctx, "GET", healthUrl, nil)
	if err != nil {
		return &backend.CheckHealthResult{
			Status:  backend.HealthStatusError,
			Message: fmt.Sprintf("Failed to create health check request: %v", err),
		}, nil
	}

	// Add authentication if configured
	if ds.secureConfig.BearerToken != "" {
		httpReq.Header.Set("Authorization", "Bearer "+ds.secureConfig.BearerToken)
	} else if ds.basicAuthUser != "" && ds.secureConfig.BasicAuthPassword != "" {
		httpReq.SetBasicAuth(ds.basicAuthUser, ds.secureConfig.BasicAuthPassword)
	}

	resp, err := ds.httpClient.Do(httpReq)
	if err != nil {
		return &backend.CheckHealthResult{
			Status:  backend.HealthStatusError,
			Message: fmt.Sprintf("Failed to connect to Pinot broker: %v", err),
		}, nil
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		return &backend.CheckHealthResult{
			Status:  backend.HealthStatusError,
			Message: fmt.Sprintf("Pinot broker health check failed with status %d: %s", resp.StatusCode, string(body)),
		}, nil
	}

	// Try a simple query to verify query endpoint is working
	queryUrl := strings.TrimSuffix(ds.config.BrokerUrl, "/") + "/query/sql"
	testQuery := `{"sql": "SELECT 1"}`

	queryReq, err := http.NewRequestWithContext(ctx, "POST", queryUrl, strings.NewReader(testQuery))
	if err != nil {
		return &backend.CheckHealthResult{
			Status:  backend.HealthStatusOk,
			Message: "Connected to Pinot broker (health check passed), but unable to verify query endpoint",
		}, nil
	}

	queryReq.Header.Set("Content-Type", "application/json")

	// Add authentication if configured
	if ds.secureConfig.BearerToken != "" {
		queryReq.Header.Set("Authorization", "Bearer "+ds.secureConfig.BearerToken)
	} else if ds.basicAuthUser != "" && ds.secureConfig.BasicAuthPassword != "" {
		queryReq.SetBasicAuth(ds.basicAuthUser, ds.secureConfig.BasicAuthPassword)
	}

	queryResp, err := ds.httpClient.Do(queryReq)
	if err != nil {
		return &backend.CheckHealthResult{
			Status:  backend.HealthStatusOk,
			Message: fmt.Sprintf("Connected to Pinot broker, but query endpoint test failed: %v", err),
		}, nil
	}
	defer queryResp.Body.Close()

	if queryResp.StatusCode != http.StatusOK {
		queryBody, _ := io.ReadAll(queryResp.Body)
		return &backend.CheckHealthResult{
			Status:  backend.HealthStatusOk,
			Message: fmt.Sprintf("Connected to Pinot broker, but query test returned status %d: %s", queryResp.StatusCode, string(queryBody)),
		}, nil
	}

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
			if password, ok := settings.DecryptedSecureJSONData["basicAuthPassword"]; ok {
				secureConfig.BasicAuthPassword = password
			}
			if token, ok := settings.DecryptedSecureJSONData["bearerToken"]; ok {
				secureConfig.BearerToken = token
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

		return &DataSource{
			config:        config,
			secureConfig:  secureConfig,
			httpClient:    httpClient,
			basicAuthUser: settings.User,
		}, nil
	}, datasource.ManageOpts{})
	if err != nil {
		backend.Logger.Error(err.Error())
		os.Exit(1)
	}
}
