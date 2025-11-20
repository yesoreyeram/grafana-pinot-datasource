import React from 'react';
import { DataSourcePlugin, DataSourceJsonData, DataSourceInstanceSettings, SelectableValue } from '@grafana/data';
import { DataQuery } from '@grafana/schema';
import { DataSourceWithBackend } from '@grafana/runtime';
import { Field, SecretInput, Input, FieldSet, Select } from '@grafana/ui';

type AuthType = 'none' | 'basic' | 'bearer';

type Config = {
  brokerUrl?: string;
  controllerUrl?: string;
  authType?: AuthType;
  username?: string;
  tlsSkipVerify?: boolean;
} & DataSourceJsonData;

type SecureConfig = {
  password?: string;
  token?: string;
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

  const authTypeOptions: Array<SelectableValue<AuthType>> = [
    { label: 'No Authentication', value: 'none' },
    { label: 'Basic Authentication', value: 'basic' },
    { label: 'Bearer Token', value: 'bearer' },
  ];

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

  const onAuthTypeChange = (option: SelectableValue<AuthType>) => {
    onOptionsChange({
      ...options,
      jsonData: {
        ...jsonData,
        authType: option.value || 'none',
      },
    });
  };

  const onUsernameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      jsonData: {
        ...jsonData,
        username: event.target.value,
      },
    });
  };

  const onPasswordChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      secureJsonData: {
        ...secureJsonData,
        password: event.target.value,
      },
    });
  };

  const onPasswordReset = () => {
    onOptionsChange({
      ...options,
      secureJsonFields: {
        ...secureJsonFields,
        password: false,
      },
      secureJsonData: {
        ...secureJsonData,
        password: '',
      },
    });
  };

  const onTokenChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      secureJsonData: {
        ...secureJsonData,
        token: event.target.value,
      },
    });
  };

  const onTokenReset = () => {
    onOptionsChange({
      ...options,
      secureJsonFields: {
        ...secureJsonFields,
        token: false,
      },
      secureJsonData: {
        ...secureJsonData,
        token: '',
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

  const authType = jsonData.authType || 'none';

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
          label="Authentication Type"
          description="Select the authentication method to use"
        >
          <Select
            width={60}
            options={authTypeOptions}
            value={authType}
            onChange={onAuthTypeChange}
          />
        </Field>

        {authType === 'basic' && (
          <>
            <Field
              label="Username"
              description="Username for basic authentication"
            >
              <Input
                width={60}
                value={jsonData.username || ''}
                onChange={onUsernameChange}
                placeholder="Username"
              />
            </Field>

            <Field
              label="Password"
              description="Password for basic authentication"
            >
              <SecretInput
                width={60}
                value={secureJsonData?.password || ''}
                isConfigured={secureJsonFields?.password}
                onChange={onPasswordChange}
                onReset={onPasswordReset}
                placeholder="Password"
              />
            </Field>
          </>
        )}

        {authType === 'bearer' && (
          <Field
            label="Bearer Token"
            description="Bearer token for authentication"
          >
            <SecretInput
              width={60}
              value={secureJsonData?.token || ''}
              isConfigured={secureJsonFields?.token}
              onChange={onTokenChange}
              onReset={onTokenReset}
              placeholder="Bearer token"
            />
          </Field>
        )}
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
