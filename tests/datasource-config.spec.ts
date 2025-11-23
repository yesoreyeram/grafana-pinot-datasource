import { test, expect } from '@grafana/plugin-e2e';
import { selectors } from '../src/module';

/**
 * E2E tests for Apache Pinot datasource configuration
 * Tests the datasource configuration page and health check functionality
 */

const sel = selectors.ConfigEditor;

test.describe('Apache Pinot Datasource Configuration - Broker', () => {
  
  test('should display health check error when broker URL is missing', async ({ createDataSourceConfigPage, page }) => {
    const configPage = await createDataSourceConfigPage({ type: 'yesoreyeram-pinot-datasource' });
    
    // Wait for the broker URL field to be visible
    await expect(page.getByPlaceholder(sel.BrokerURL.placeholder)).toBeVisible({ timeout: 15000 });
    
    // Click "Save & test" button without filling broker URL
    const healthCheckResponse = await configPage.saveAndTest();
    
    // Expect error response
    expect(healthCheckResponse.status()).not.toBe(200);
  });

  test('should pass health check with valid broker URL only', async ({ createDataSourceConfigPage, page }) => {
    const configPage = await createDataSourceConfigPage({ type: 'yesoreyeram-pinot-datasource' });
    
    // Wait for the broker URL field to be visible
    await expect(page.getByPlaceholder(sel.BrokerURL.placeholder)).toBeVisible({ timeout: 15000 });
    
    // Fill in the broker URL (using docker-compose service name)
    await page.getByPlaceholder(sel.BrokerURL.placeholder).fill('http://pinot-broker:8099');
    
    // Click "Save & test" button
    const healthCheckResponse = await configPage.saveAndTest();
    
    // Expect successful response
    expect(healthCheckResponse.status()).toBe(200);
    
    // Verify success messages in the UI
    await expect(page.getByText(/broker health check passed/i)).toBeVisible({ timeout: 15000 });
  });

  test('should show error when broker URL is incorrect', async ({ createDataSourceConfigPage, page }) => {
    const configPage = await createDataSourceConfigPage({ type: 'yesoreyeram-pinot-datasource' });
    
    // Wait for the broker URL field to be visible
    await expect(page.getByPlaceholder(sel.BrokerURL.placeholder)).toBeVisible({ timeout: 15000 });
    
    // Fill in an incorrect broker URL
    await page.getByPlaceholder(sel.BrokerURL.placeholder).fill('http://invalid-broker:9999');
    
    // Click "Save & test" button
    const healthCheckResponse = await configPage.saveAndTest();
    
    // Expect error response
    expect(healthCheckResponse.status()).not.toBe(200);
    
    // Verify error message
    await expect(page.getByText(/health check failed|failed to connect/i)).toBeVisible({ timeout: 15000 });
  });

  test('should handle authentication type selection for broker', async ({ createDataSourceConfigPage, page }) => {
    const configPage = await createDataSourceConfigPage({ type: 'yesoreyeram-pinot-datasource' });
    
    // Wait for the broker URL field to be visible
    await expect(page.getByPlaceholder(sel.BrokerURL.placeholder)).toBeVisible({ timeout: 15000 });
    
    // Fill in the broker URL
    await page.getByPlaceholder(sel.BrokerURL.placeholder).fill('http://pinot-broker:8099');
    
    // Find auth type dropdown by looking for the first combobox
    const authTypeField = page.getByRole('combobox').first();
    await expect(authTypeField).toBeVisible({ timeout: 15000 });
    
    // Change to Basic Authentication
    await authTypeField.click();
    await page.getByRole('option', { name: sel.AuthOptions.basic.label }).click();
    
    // Verify username and password fields appear
    await expect(page.getByPlaceholder(sel.BrokerUsername.placeholder).first()).toBeVisible();
    await expect(page.getByPlaceholder(sel.BrokerPassword.placeholder).first()).toBeVisible();
    
    // Change back to No Authentication to verify field hiding
    await authTypeField.click();
    await page.getByRole('option', { name: sel.AuthOptions.none.label }).click();
    
    // Verify username and password fields are hidden
    await expect(page.getByPlaceholder(sel.BrokerUsername.placeholder).first()).not.toBeVisible();
  });

  test('should persist broker configuration after save', async ({ createDataSourceConfigPage, gotoDataSourceConfigPage, page }) => {
    const configPage = await createDataSourceConfigPage({ 
      type: 'yesoreyeram-pinot-datasource',
      deleteDataSourceAfterTest: false
    });
    
    // Wait for broker URL field to be visible
    await expect(page.getByPlaceholder(sel.BrokerURL.placeholder)).toBeVisible({ timeout: 15000 });
    
    // Fill in the broker URL
    const brokerUrl = 'http://pinot-broker:8099';
    await page.getByPlaceholder(sel.BrokerURL.placeholder).fill(brokerUrl);
    
    // Save the datasource
    const healthCheckResponse = await configPage.saveAndTest();
    expect(healthCheckResponse.status()).toBe(200);
    
    // Navigate back to the config page to verify persistence
    const uid = configPage.datasource.uid;
    await page.goto('/connections/datasources');
    await gotoDataSourceConfigPage(uid);
    
    // Verify the broker URL is still there
    await expect(page.getByPlaceholder(sel.BrokerURL.placeholder)).toHaveValue(brokerUrl);
    
    // Clean up - delete the datasource
    await configPage.deleteDataSource();
  });
});

test.describe('Apache Pinot Datasource Configuration - Controller', () => {
  
  test('should pass health check with both broker and controller URLs', async ({ createDataSourceConfigPage, page }) => {
    const configPage = await createDataSourceConfigPage({ type: 'yesoreyeram-pinot-datasource' });
    
    // Wait for broker URL field to be visible
    await expect(page.getByPlaceholder(sel.BrokerURL.placeholder)).toBeVisible({ timeout: 15000 });
    
    // Fill in the broker URL
    await page.getByPlaceholder(sel.BrokerURL.placeholder).fill('http://pinot-broker:8099');
    
    // Expand the controller section by clicking on it
    await page.getByText(sel.ControllerSection.label).click();
    
    // Wait for controller URL field to be visible after expanding
    await expect(page.getByPlaceholder(sel.ControllerURL.placeholder)).toBeVisible({ timeout: 15000 });
    
    // Fill in the controller URL
    await page.getByPlaceholder(sel.ControllerURL.placeholder).fill('http://pinot-controller:9000');
    
    // Click "Save & test" button
    const healthCheckResponse = await configPage.saveAndTest();
    
    // Expect successful response
    expect(healthCheckResponse.status()).toBe(200);
    
    // Verify success messages
    await expect(page.getByText(/broker health check passed/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/controller connected/i)).toBeVisible({ timeout: 15000 });
  });

  test('should show error when controller URL is incorrect but broker is correct', async ({ createDataSourceConfigPage, page }) => {
    const configPage = await createDataSourceConfigPage({ type: 'yesoreyeram-pinot-datasource' });
    
    // Wait for broker URL field to be visible
    await expect(page.getByPlaceholder(sel.BrokerURL.placeholder)).toBeVisible({ timeout: 15000 });
    
    // Fill in a correct broker URL
    await page.getByPlaceholder(sel.BrokerURL.placeholder).fill('http://pinot-broker:8099');
    
    // Expand the controller section
    await page.getByText(sel.ControllerSection.label).click();
    
    // Wait for controller URL field to be visible after expanding
    await expect(page.getByPlaceholder(sel.ControllerURL.placeholder)).toBeVisible({ timeout: 15000 });
    
    // Fill in an incorrect controller URL
    await page.getByPlaceholder(sel.ControllerURL.placeholder).fill('http://invalid-controller:9999');
    
    // Click "Save & test" button
    const healthCheckResponse = await configPage.saveAndTest();
    
    // Expect error response for controller
    expect(healthCheckResponse.status()).not.toBe(200);
    
    // Verify error message
    await expect(page.getByText(/controller.*failed/i)).toBeVisible({ timeout: 15000 });
  });

  test('should persist controller configuration after save', async ({ createDataSourceConfigPage, gotoDataSourceConfigPage, page }) => {
    const configPage = await createDataSourceConfigPage({ 
      type: 'yesoreyeram-pinot-datasource',
      deleteDataSourceAfterTest: false
    });
    
    // Wait for broker URL field to be visible
    await expect(page.getByPlaceholder(sel.BrokerURL.placeholder)).toBeVisible({ timeout: 15000 });
    
    // Fill in the broker URL
    const brokerUrl = 'http://pinot-broker:8099';
    await page.getByPlaceholder(sel.BrokerURL.placeholder).fill(brokerUrl);
    
    // Expand the controller section
    await page.getByText(sel.ControllerSection.label).click();
    
    // Wait for controller URL field to be visible after expanding
    await expect(page.getByPlaceholder(sel.ControllerURL.placeholder)).toBeVisible({ timeout: 15000 });
    
    // Fill in the controller URL
    const controllerUrl = 'http://pinot-controller:9000';
    await page.getByPlaceholder(sel.ControllerURL.placeholder).fill(controllerUrl);
    
    // Save the datasource
    const healthCheckResponse = await configPage.saveAndTest();
    expect(healthCheckResponse.status()).toBe(200);
    
    // Navigate back to the config page to verify persistence
    const uid = configPage.datasource.uid;
    await page.goto('/connections/datasources');
    await gotoDataSourceConfigPage(uid);
    
    // Verify the broker URL is still there
    await expect(page.getByPlaceholder(sel.BrokerURL.placeholder)).toHaveValue(brokerUrl);
    
    // Expand the controller section again
    await page.getByText(sel.ControllerSection.label).click();
    await expect(page.getByPlaceholder(sel.ControllerURL.placeholder)).toBeVisible({ timeout: 15000 });
    
    // Verify the controller URL is still there
    await expect(page.getByPlaceholder(sel.ControllerURL.placeholder)).toHaveValue(controllerUrl);
    
    // Clean up - delete the datasource
    await configPage.deleteDataSource();
  });

  test('should handle authentication type selection for controller', async ({ createDataSourceConfigPage, page }) => {
    const configPage = await createDataSourceConfigPage({ type: 'yesoreyeram-pinot-datasource' });
    
    // Wait for broker URL field to be visible
    await expect(page.getByPlaceholder(sel.BrokerURL.placeholder)).toBeVisible({ timeout: 15000 });
    
    // Fill in the broker URL
    await page.getByPlaceholder(sel.BrokerURL.placeholder).fill('http://pinot-broker:8099');
    
    // Expand the controller section
    await page.getByText(sel.ControllerSection.label).click();
    
    // Wait for controller URL field to be visible after expanding
    await expect(page.getByPlaceholder(sel.ControllerURL.placeholder)).toBeVisible({ timeout: 15000 });
    
    // Fill in the controller URL
    await page.getByPlaceholder(sel.ControllerURL.placeholder).fill('http://pinot-controller:9000');
    
    // Find controller auth type dropdown (second combobox on the page)
    const authTypeField = page.getByRole('combobox').nth(1);
    await expect(authTypeField).toBeVisible({ timeout: 15000 });
    
    // Change to Basic Authentication
    await authTypeField.click();
    await page.getByRole('option', { name: sel.AuthOptions.basic.label }).click();
    
    // Verify username and password fields appear (use nth to get controller fields)
    await expect(page.getByPlaceholder(sel.ControllerUsername.placeholder).first()).toBeVisible();
    await expect(page.getByPlaceholder(sel.ControllerPassword.placeholder).first()).toBeVisible();
    
    // Change to Bearer Token
    await authTypeField.click();
    await page.getByRole('option', { name: sel.AuthOptions.bearer.label }).click();
    
    // Verify token field appears
    await expect(page.getByPlaceholder(sel.ControllerToken.placeholder).first()).toBeVisible();
  });
});
