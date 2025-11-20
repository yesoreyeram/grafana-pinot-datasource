import React from 'react';
import { DataSourcePlugin, DataSourceJsonData, DataSourceInstanceSettings } from '@grafana/data';
import { DataQuery } from '@grafana/schema';
import { DataSourceWithBackend } from '@grafana/runtime';
import { Field, SecretInput, Input, FieldSet } from '@grafana/ui';

type Config = {
  brokerUrl?: string;
  controllerUrl?: string;
  useBasicAuth?: boolean;
  tlsSkipVerify?: boolean;
} & DataSourceJsonData;

type SecureConfig = {
  basicAuthPassword?: string;
  bearerToken?: string;
};

type Query = {} & DataQuery;

class DataSource extends DataSourceWithBackend<Query, Config> {
  constructor(instanceSettings: DataSourceInstanceSettings<Config>) {
    super(instanceSettings);
  }
}

const ConfigEditor = (props: any) => {
  const { options, onOptionsChange } = props;
  const { jsonData, secureJsonFields, secureJsonData } = options;

  const onBrokerUrlChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      jsonData: {
        ...jsonData,
        brokerUrl: event.target.value,
      },
    });
  };

  const onControllerUrlChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      jsonData: {
        ...jsonData,
        controllerUrl: event.target.value,
      },
    });
  };

  const onBasicAuthPasswordChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      secureJsonData: {
        ...secureJsonData,
        basicAuthPassword: event.target.value,
      },
    });
  };

  const onBasicAuthPasswordReset = () => {
    onOptionsChange({
      ...options,
      secureJsonFields: {
        ...secureJsonFields,
        basicAuthPassword: false,
      },
      secureJsonData: {
        ...secureJsonData,
        basicAuthPassword: '',
      },
    });
  };

  const onBearerTokenChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      secureJsonData: {
        ...secureJsonData,
        bearerToken: event.target.value,
      },
    });
  };

  const onBearerTokenReset = () => {
    onOptionsChange({
      ...options,
      secureJsonFields: {
        ...secureJsonFields,
        bearerToken: false,
      },
      secureJsonData: {
        ...secureJsonData,
        bearerToken: '',
      },
    });
  };

  const onTlsSkipVerifyChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      jsonData: {
        ...jsonData,
        tlsSkipVerify: event.target.checked,
      },
    });
  };

  return (
    <>
      <FieldSet label="Connection">
        <Field
          label="Broker URL"
          description="URL of the Apache Pinot broker (e.g., http://localhost:8099)"
          required
        >
          <Input
            width={60}
            value={jsonData.brokerUrl || ''}
            onChange={onBrokerUrlChange}
            placeholder="http://localhost:8099"
          />
        </Field>

        <Field
          label="Controller URL"
          description="URL of the Apache Pinot controller (optional, for admin operations)"
        >
          <Input
            width={60}
            value={jsonData.controllerUrl || ''}
            onChange={onControllerUrlChange}
            placeholder="http://localhost:9000"
          />
        </Field>
      </FieldSet>

      <FieldSet label="Authentication">
        <Field
          label="Basic Auth Password"
          description="Password for basic authentication (username should be set in User field above)"
        >
          <SecretInput
            width={60}
            value={secureJsonData?.basicAuthPassword || ''}
            isConfigured={secureJsonFields?.basicAuthPassword}
            onChange={onBasicAuthPasswordChange}
            onReset={onBasicAuthPasswordReset}
            placeholder="Basic auth password"
          />
        </Field>

        <Field
          label="Bearer Token"
          description="Bearer token for authentication (alternative to basic auth)"
        >
          <SecretInput
            width={60}
            value={secureJsonData?.bearerToken || ''}
            isConfigured={secureJsonFields?.bearerToken}
            onChange={onBearerTokenChange}
            onReset={onBearerTokenReset}
            placeholder="Bearer token"
          />
        </Field>
      </FieldSet>

      <FieldSet label="TLS/SSL Settings">
        <Field label="Skip TLS Verify" description="Skip TLS certificate verification (not recommended for production)">
          <Input
            type="checkbox"
            checked={jsonData.tlsSkipVerify || false}
            onChange={onTlsSkipVerifyChange}
          />
        </Field>
      </FieldSet>
    </>
  );
};

const QueryEditor = () => <>Apache Pinot™ Query Editor</>;

export const plugin = new DataSourcePlugin<DataSource, Query, Config, SecureConfig>(DataSource)
  .setConfigEditor(ConfigEditor)
  .setQueryEditor(QueryEditor);
