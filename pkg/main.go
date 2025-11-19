package main

import (
	"context"
	"os"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/datasource"
	"github.com/grafana/grafana-plugin-sdk-go/backend/instancemgmt"
	"github.com/grafana/grafana-plugin-sdk-go/data"
)

const PluginId = "yesoreyeram-pinot-datasource"

type DataSource struct {
}

func (ds *DataSource) CheckHealth(ctx context.Context, req *backend.CheckHealthRequest) (*backend.CheckHealthResult, error) {
	return &backend.CheckHealthResult{
		Status:  backend.HealthStatusOk,
		Message: "Apache Pinot™ datasource just works but does nothing",
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
		return &DataSource{}, nil
	}, datasource.ManageOpts{})
	if err != nil {
		backend.Logger.Error(err.Error())
		os.Exit(1)
	}
}
