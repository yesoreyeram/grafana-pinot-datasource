import React, { useState } from 'react';
import { DataSourcePlugin, DataSourceJsonData, DataSourceInstanceSettings, SelectableValue } from '@grafana/data';
import { DataQuery } from '@grafana/schema';
import { DataSourceWithBackend } from '@grafana/runtime';
import { Field, SecretInput, Input, FieldSet, Select, Alert, Collapse } from '@grafana/ui';

type AuthType = 'none' | 'basic' | 'bearer';

type Config = {
  brokerUrl?: string;
  controllerUrl?: string;
  brokerAuthType?: AuthType;
  brokerUsername?: string;
  controllerAuthType?: AuthType;
  controllerUsername?: string;
  tlsSkipVerify?: boolean;
} & DataSourceJsonData;

type SecureConfig = {
  brokerPassword?: string;
  brokerToken?: string;
  controllerPassword?: string;
  controllerToken?: string;
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

  const [brokerOpen, setBrokerOpen] = useState(true);
  const [controllerOpen, setControllerOpen] = useState(false);

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

  // Broker Auth handlers
  const onBrokerAuthTypeChange = (option: SelectableValue<AuthType>) => {
    onOptionsChange({
      ...options,
      jsonData: {
        ...jsonData,
        brokerAuthType: option.value || 'none',
      },
    });
  };

  const onBrokerUsernameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      jsonData: {
        ...jsonData,
        brokerUsername: event.target.value,
      },
    });
  };

  const onBrokerPasswordChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      secureJsonData: {
        ...secureJsonData,
        brokerPassword: event.target.value,
      },
    });
  };

  const onBrokerPasswordReset = () => {
    onOptionsChange({
      ...options,
      secureJsonFields: {
        ...secureJsonFields,
        brokerPassword: false,
      },
      secureJsonData: {
        ...secureJsonData,
        brokerPassword: '',
      },
    });
  };

  const onBrokerTokenChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      secureJsonData: {
        ...secureJsonData,
        brokerToken: event.target.value,
      },
    });
  };

  const onBrokerTokenReset = () => {
    onOptionsChange({
      ...options,
      secureJsonFields: {
        ...secureJsonFields,
        brokerToken: false,
      },
      secureJsonData: {
        ...secureJsonData,
        brokerToken: '',
      },
    });
  };

  // Controller Auth handlers
  const onControllerAuthTypeChange = (option: SelectableValue<AuthType>) => {
    onOptionsChange({
      ...options,
      jsonData: {
        ...jsonData,
        controllerAuthType: option.value || 'none',
      },
    });
  };

  const onControllerUsernameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      jsonData: {
        ...jsonData,
        controllerUsername: event.target.value,
      },
    });
  };

  const onControllerPasswordChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      secureJsonData: {
        ...secureJsonData,
        controllerPassword: event.target.value,
      },
    });
  };

  const onControllerPasswordReset = () => {
    onOptionsChange({
      ...options,
      secureJsonFields: {
        ...secureJsonFields,
        controllerPassword: false,
      },
      secureJsonData: {
        ...secureJsonData,
        controllerPassword: '',
      },
    });
  };

  const onControllerTokenChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      secureJsonData: {
        ...secureJsonData,
        controllerToken: event.target.value,
      },
    });
  };

  const onControllerTokenReset = () => {
    onOptionsChange({
      ...options,
      secureJsonFields: {
        ...secureJsonFields,
        controllerToken: false,
      },
      secureJsonData: {
        ...secureJsonData,
        controllerToken: '',
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

  const brokerAuthType = jsonData.brokerAuthType || 'none';
  const controllerAuthType = jsonData.controllerAuthType || 'none';
  const hasControllerUrl = jsonData.controllerUrl && jsonData.controllerUrl.trim() !== '';

  return (
    <>
      <Alert title="Broker vs Controller Configuration" severity="info">
        <p><strong>Broker-only mode:</strong> Only queries are supported. You can execute SQL queries but cannot retrieve table or schema metadata.</p>
        <p><strong>Broker + Controller mode:</strong> Full functionality with query execution and metadata operations (listing tables, schemas, etc.). Recommended for production use.</p>
      </Alert>

      <Collapse label="Broker Configuration" isOpen={brokerOpen} onToggle={() => setBrokerOpen(!brokerOpen)}>
        <FieldSet>
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
            label="Authentication Type"
            description="Select the authentication method for the broker"
          >
            <Select
              width={60}
              options={authTypeOptions}
              value={brokerAuthType}
              onChange={onBrokerAuthTypeChange}
            />
          </Field>

          {brokerAuthType === 'basic' && (
            <>
              <Field
                label="Username"
                description="Username for broker basic authentication"
              >
                <Input
                  width={60}
                  value={jsonData.brokerUsername || ''}
                  onChange={onBrokerUsernameChange}
                  placeholder="Username"
                />
              </Field>

              <Field
                label="Password"
                description="Password for broker basic authentication"
              >
                <SecretInput
                  width={60}
                  value={secureJsonData?.brokerPassword || ''}
                  isConfigured={secureJsonFields?.brokerPassword}
                  onChange={onBrokerPasswordChange}
                  onReset={onBrokerPasswordReset}
                  placeholder="Password"
                />
              </Field>
            </>
          )}

          {brokerAuthType === 'bearer' && (
            <Field
              label="Bearer Token"
              description="Bearer token for broker authentication"
            >
              <SecretInput
                width={60}
                value={secureJsonData?.brokerToken || ''}
                isConfigured={secureJsonFields?.brokerToken}
                onChange={onBrokerTokenChange}
                onReset={onBrokerTokenReset}
                placeholder="Bearer token"
              />
            </Field>
          )}
        </FieldSet>
      </Collapse>

      <Collapse label="Controller Configuration (Optional)" isOpen={controllerOpen} onToggle={() => setControllerOpen(!controllerOpen)}>
        <FieldSet>
          <Alert title="Controller enables metadata operations" severity="info">
            Configure the controller to enable metadata operations such as listing tables and schemas. Leave blank for broker-only (query-only) mode.
          </Alert>

          <Field
            label="Controller URL"
            description="URL of the Apache Pinot controller (optional, for metadata operations)"
          >
            <Input
              width={60}
              value={jsonData.controllerUrl || ''}
              onChange={onControllerUrlChange}
              placeholder="http://localhost:9000"
            />
          </Field>

          {hasControllerUrl && (
            <>
              <Alert title="Separate Controller Authentication" severity="info">
                Configure separate authentication for the controller. This allows different security settings for query operations (broker) and metadata operations (controller).
              </Alert>

              <Field
                label="Authentication Type"
                description="Select the authentication method for the controller"
              >
                <Select
                  width={60}
                  options={authTypeOptions}
                  value={controllerAuthType}
                  onChange={onControllerAuthTypeChange}
                />
              </Field>

              {controllerAuthType === 'basic' && (
                <>
                  <Field
                    label="Username"
                    description="Username for controller basic authentication"
                  >
                    <Input
                      width={60}
                      value={jsonData.controllerUsername || ''}
                      onChange={onControllerUsernameChange}
                      placeholder="Username"
                    />
                  </Field>

                  <Field
                    label="Password"
                    description="Password for controller basic authentication"
                  >
                    <SecretInput
                      width={60}
                      value={secureJsonData?.controllerPassword || ''}
                      isConfigured={secureJsonFields?.controllerPassword}
                      onChange={onControllerPasswordChange}
                      onReset={onControllerPasswordReset}
                      placeholder="Password"
                    />
                  </Field>
                </>
              )}

              {controllerAuthType === 'bearer' && (
                <Field
                  label="Bearer Token"
                  description="Bearer token for controller authentication"
                >
                  <SecretInput
                    width={60}
                    value={secureJsonData?.controllerToken || ''}
                    isConfigured={secureJsonFields?.controllerToken}
                    onChange={onControllerTokenChange}
                    onReset={onControllerTokenReset}
                    placeholder="Bearer token"
                  />
                </Field>
              )}
            </>
          )}
        </FieldSet>
      </Collapse>

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
