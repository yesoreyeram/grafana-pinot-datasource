import React, { useState } from 'react';
import { DataSourcePlugin, DataSourceJsonData, DataSourceInstanceSettings, SelectableValue } from '@grafana/data';
import { DataQuery } from '@grafana/schema';
import { DataSourceWithBackend } from '@grafana/runtime';
import { Field, SecretInput, Input, FieldSet, Select, Collapse } from '@grafana/ui';

type AuthType = 'none' | 'basic' | 'bearer';

type Config = {
  brokerUrl?: string;
  controllerUrl?: string;
  brokerAuthType?: AuthType;
  brokerUsername?: string;
  brokerTlsSkipVerify?: boolean;
  controllerAuthType?: AuthType;
  controllerUsername?: string;
  controllerTlsSkipVerify?: boolean;
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

// Selectors for UI text content
const selectors = {
  ConfigEditor: {
    // Broker section
    BrokerSection: { label: 'Broker Configuration' },
    BrokerURL: {
      label: 'Broker URL',
      description: 'URL of the Apache Pinot broker (e.g., http://localhost:8099)',
      placeholder: 'http://localhost:8099',
    },
    BrokerAuthType: {
      label: 'Authentication Type',
      description: 'Select the authentication method for the broker',
    },
    BrokerUsername: {
      label: 'Username',
      description: 'Username for broker basic authentication',
      placeholder: 'Username',
    },
    BrokerPassword: {
      label: 'Password',
      description: 'Password for broker basic authentication',
      placeholder: 'Password',
    },
    BrokerToken: {
      label: 'Bearer Token',
      description: 'Bearer token for broker authentication',
      placeholder: 'Bearer token',
    },
    BrokerTlsSkipVerify: {
      label: 'Skip TLS Verify (Broker)',
      description: 'Skip TLS certificate verification for broker connections (not recommended for production)',
    },
    
    // Controller section
    ControllerSection: { label: 'Controller Configuration (Optional)' },
    ControllerURL: {
      label: 'Controller URL',
      description: 'URL of the Apache Pinot controller (optional, for metadata operations)',
      placeholder: 'http://localhost:9000',
    },
    ControllerAuthType: {
      label: 'Authentication Type',
      description: 'Select the authentication method for the controller',
    },
    ControllerUsername: {
      label: 'Username',
      description: 'Username for controller basic authentication',
      placeholder: 'Username',
    },
    ControllerPassword: {
      label: 'Password',
      description: 'Password for controller basic authentication',
      placeholder: 'Password',
    },
    ControllerToken: {
      label: 'Bearer Token',
      description: 'Bearer token for controller authentication',
      placeholder: 'Bearer token',
    },
    ControllerTlsSkipVerify: {
      label: 'Skip TLS Verify (Controller)',
      description: 'Skip TLS certificate verification for controller connections (not recommended for production)',
    },
    
    // Auth options
    AuthOptions: {
      none: { label: 'No Authentication', value: 'none' },
      basic: { label: 'Basic Authentication', value: 'basic' },
      bearer: { label: 'Bearer Token', value: 'bearer' },
    },
  },
};

// Constants
const FIELD_WIDTH = 60;

const ConfigEditor = (props: any) => {
  const { options, onOptionsChange } = props;
  const { jsonData, secureJsonFields, secureJsonData } = options;

  const [brokerOpen, setBrokerOpen] = useState(true);
  const [controllerOpen, setControllerOpen] = useState(false);

  const authTypeOptions: Array<SelectableValue<AuthType>> = [
    selectors.ConfigEditor.AuthOptions.none,
    selectors.ConfigEditor.AuthOptions.basic,
    selectors.ConfigEditor.AuthOptions.bearer,
  ];

  // Common abstraction for option changes
  const onOptionChange = <Key extends keyof Config, Value extends Config[Key]>(
    option: Key,
    value: Value
  ) => {
    onOptionsChange({
      ...options,
      jsonData: { ...jsonData, [option]: value },
    });
  };

  const onSecureOptionChange = <Key extends keyof SecureConfig, Value extends SecureConfig[Key]>(
    option: Key,
    value: Value,
    set: boolean
  ) => {
    onOptionsChange({
      ...options,
      secureJsonData: { ...secureJsonData, [option]: value },
      secureJsonFields: { ...secureJsonFields, [option]: set },
    });
  };

  const brokerAuthType = jsonData.brokerAuthType || 'none';
  const controllerAuthType = jsonData.controllerAuthType || 'none';
  const hasControllerUrl = jsonData.controllerUrl && jsonData.controllerUrl.trim() !== '';

  return (
    <>
      <Collapse
        label={selectors.ConfigEditor.BrokerSection.label}
        isOpen={brokerOpen}
        onToggle={() => setBrokerOpen(!brokerOpen)}
      >
        <FieldSet style={{ marginInline: '10px' }}>
          <Field
            horizontal={true}
            label={selectors.ConfigEditor.BrokerURL.label}
            description={selectors.ConfigEditor.BrokerURL.description}
            required
          >
            <Input
              width={FIELD_WIDTH}
              value={jsonData.brokerUrl || ''}
              onChange={(e) => onOptionChange('brokerUrl', e.currentTarget.value)}
              placeholder={selectors.ConfigEditor.BrokerURL.placeholder}
            />
          </Field>

          <Field
            horizontal={true}
            label={selectors.ConfigEditor.BrokerAuthType.label}
            description={selectors.ConfigEditor.BrokerAuthType.description}
          >
            <Select
              width={FIELD_WIDTH}
              options={authTypeOptions}
              value={brokerAuthType}
              onChange={(v) => onOptionChange('brokerAuthType', v.value!)}
            />
          </Field>

          {brokerAuthType === 'basic' && (
            <>
              <Field
                horizontal={true}
                label={selectors.ConfigEditor.BrokerUsername.label}
                description={selectors.ConfigEditor.BrokerUsername.description}
              >
                <Input
                  width={FIELD_WIDTH}
                  value={jsonData.brokerUsername || ''}
                  onChange={(e) => onOptionChange('brokerUsername', e.currentTarget.value)}
                  placeholder={selectors.ConfigEditor.BrokerUsername.placeholder}
                />
              </Field>

              <Field
                horizontal={true}
                label={selectors.ConfigEditor.BrokerPassword.label}
                description={selectors.ConfigEditor.BrokerPassword.description}
              >
                <SecretInput
                  width={secureJsonFields?.brokerPassword ? FIELD_WIDTH - 10 : FIELD_WIDTH}
                  value={secureJsonData?.brokerPassword || ''}
                  isConfigured={secureJsonFields?.brokerPassword}
                  onChange={(e) => onSecureOptionChange('brokerPassword', e.currentTarget.value, false)}
                  onReset={() => onSecureOptionChange('brokerPassword', '', true)}
                  placeholder={selectors.ConfigEditor.BrokerPassword.placeholder}
                />
              </Field>
            </>
          )}

          {brokerAuthType === 'bearer' && (
            <Field
              horizontal={true}
              label={selectors.ConfigEditor.BrokerToken.label}
              description={selectors.ConfigEditor.BrokerToken.description}
            >
              <SecretInput
                width={secureJsonFields?.brokerToken ? FIELD_WIDTH - 10 : FIELD_WIDTH}
                value={secureJsonData?.brokerToken || ''}
                isConfigured={secureJsonFields?.brokerToken}
                onChange={(e) => onSecureOptionChange('brokerToken', e.currentTarget.value, false)}
                onReset={() => onSecureOptionChange('brokerToken', '', true)}
                placeholder={selectors.ConfigEditor.BrokerToken.placeholder}
              />
            </Field>
          )}

          <Field
            horizontal={true}
            label={selectors.ConfigEditor.BrokerTlsSkipVerify.label}
            description={selectors.ConfigEditor.BrokerTlsSkipVerify.description}
          >
            <Input
              type="checkbox"
              width={FIELD_WIDTH}
              checked={jsonData.brokerTlsSkipVerify || false}
              onChange={(e) => onOptionChange('brokerTlsSkipVerify', e.currentTarget.checked)}
            />
          </Field>
        </FieldSet>
      </Collapse>

      <Collapse
        label={selectors.ConfigEditor.ControllerSection.label}
        isOpen={controllerOpen}
        onToggle={() => setControllerOpen(!controllerOpen)}
      >
        <FieldSet style={{ marginInline: '10px' }}>
          <Field
            horizontal={true}
            label={selectors.ConfigEditor.ControllerURL.label}
            description={selectors.ConfigEditor.ControllerURL.description}
          >
            <Input
              width={FIELD_WIDTH}
              value={jsonData.controllerUrl || ''}
              onChange={(e) => onOptionChange('controllerUrl', e.currentTarget.value)}
              placeholder={selectors.ConfigEditor.ControllerURL.placeholder}
            />
          </Field>

          {hasControllerUrl && (
            <>
              <Field
                horizontal={true}
                label={selectors.ConfigEditor.ControllerAuthType.label}
                description={selectors.ConfigEditor.ControllerAuthType.description}
              >
                <Select
                  width={FIELD_WIDTH}
                  options={authTypeOptions}
                  value={controllerAuthType}
                  onChange={(v) => onOptionChange('controllerAuthType', v.value!)}
                />
              </Field>

              {controllerAuthType === 'basic' && (
                <>
                  <Field
                    horizontal={true}
                    label={selectors.ConfigEditor.ControllerUsername.label}
                    description={selectors.ConfigEditor.ControllerUsername.description}
                  >
                    <Input
                      width={FIELD_WIDTH}
                      value={jsonData.controllerUsername || ''}
                      onChange={(e) => onOptionChange('controllerUsername', e.currentTarget.value)}
                      placeholder={selectors.ConfigEditor.ControllerUsername.placeholder}
                    />
                  </Field>

                  <Field
                    horizontal={true}
                    label={selectors.ConfigEditor.ControllerPassword.label}
                    description={selectors.ConfigEditor.ControllerPassword.description}
                  >
                    <SecretInput
                      width={secureJsonFields?.controllerPassword ? FIELD_WIDTH - 10 : FIELD_WIDTH}
                      value={secureJsonData?.controllerPassword || ''}
                      isConfigured={secureJsonFields?.controllerPassword}
                      onChange={(e) => onSecureOptionChange('controllerPassword', e.currentTarget.value, false)}
                      onReset={() => onSecureOptionChange('controllerPassword', '', true)}
                      placeholder={selectors.ConfigEditor.ControllerPassword.placeholder}
                    />
                  </Field>
                </>
              )}

              {controllerAuthType === 'bearer' && (
                <Field
                  horizontal={true}
                  label={selectors.ConfigEditor.ControllerToken.label}
                  description={selectors.ConfigEditor.ControllerToken.description}
                >
                  <SecretInput
                    width={secureJsonFields?.controllerToken ? FIELD_WIDTH - 10 : FIELD_WIDTH}
                    value={secureJsonData?.controllerToken || ''}
                    isConfigured={secureJsonFields?.controllerToken}
                    onChange={(e) => onSecureOptionChange('controllerToken', e.currentTarget.value, false)}
                    onReset={() => onSecureOptionChange('controllerToken', '', true)}
                    placeholder={selectors.ConfigEditor.ControllerToken.placeholder}
                  />
                </Field>
              )}

              <Field
                horizontal={true}
                label={selectors.ConfigEditor.ControllerTlsSkipVerify.label}
                description={selectors.ConfigEditor.ControllerTlsSkipVerify.description}
              >
                <Input
                  type="checkbox"
                  width={FIELD_WIDTH}
                  checked={jsonData.controllerTlsSkipVerify || false}
                  onChange={(e) => onOptionChange('controllerTlsSkipVerify', e.currentTarget.checked)}
                />
              </Field>
            </>
          )}
        </FieldSet>
      </Collapse>
    </>
  );
};

const QueryEditor = () => <>Apache Pinot™ Query Editor</>;

export const plugin = new DataSourcePlugin<DataSource, Query, Config, SecureConfig>(DataSource)
  .setConfigEditor(ConfigEditor)
  .setQueryEditor(QueryEditor);
