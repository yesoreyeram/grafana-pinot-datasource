import React from 'react';
import { DataSourcePlugin, DataSourceJsonData, DataSourceInstanceSettings } from '@grafana/data';
import { DataQuery } from '@grafana/schema';
import { DataSourceWithBackend } from '@grafana/runtime';

type Config = {} & DataSourceJsonData;

type SecureConfig = {};

type Query = {} & DataQuery;

class DataSource extends DataSourceWithBackend<Query, Config> {
  constructor(instanceSettings: DataSourceInstanceSettings<Config>) {
    super(instanceSettings);
  }
}

const ConfigEditor = () => <>Apache Pinot™ Config Editor</>;

const QueryEditor = () => <>Apache Pinot™ Query Editor</>;

export const plugin = new DataSourcePlugin<DataSource, Query, Config, SecureConfig>(DataSource)
  .setConfigEditor(ConfigEditor)
  .setQueryEditor(QueryEditor);
