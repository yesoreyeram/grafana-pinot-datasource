import { test, expect } from '@grafana/plugin-e2e';

/**
 * E2E tests for Apache Pinot datasource configuration
 * Tests the datasource configuration page and health check functionality
 */

test.describe('Apache Pinot Datasource Configuration', () => {
  
  test('should display health check error when broker URL is missing', async ({ createDataSourceConfigPage, page }) => {
    // Create a new datasource config page
    const configPage = await createDataSourceConfigPage({ type: 'yesoreyeram-pinot-datasource' });
    
    // Wait for the broker URL field to be visible
    await expect(page.getByPlaceholder('http://localhost:8099')).toBeVisible({ timeout: 15000 });
    
    // Click "Save & test" button without filling broker URL
    const healthCheckResponse = await configPage.saveAndTest();
    
    // Expect error response
    expect(healthCheckResponse.status()).not.toBe(200);
  });

  test('should pass health check with valid broker URL only', async ({ createDataSourceConfigPage, page }) => {
    // Create a new datasource config page
    const configPage = await createDataSourceConfigPage({ type: 'yesoreyeram-pinot-datasource' });
    
    // Wait for the broker URL field to be visible
    await expect(page.getByPlaceholder('http://localhost:8099')).toBeVisible({ timeout: 15000 });
    
    // Fill in the broker URL (using docker-compose service name)
    await page.getByPlaceholder('http://localhost:8099').fill('http://pinot-broker:8099');
    
    // Click "Save & test" button
    const healthCheckResponse = await configPage.saveAndTest();
    
    // Expect successful response
    expect(healthCheckResponse.status()).toBe(200);
    
    // Verify success messages in the UI
    await expect(page.getByText(/broker health check passed/i)).toBeVisible({ timeout: 15000 });
  });

  test('should pass health check with both broker and controller URLs', async ({ createDataSourceConfigPage, page }) => {
    // Create a new datasource config page
    const configPage = await createDataSourceConfigPage({ type: 'yesoreyeram-pinot-datasource' });
    
    // Wait for broker URL field to be visible
    await expect(page.getByPlaceholder('http://localhost:8099')).toBeVisible({ timeout: 15000 });
    
    // Fill in the broker URL
    await page.getByPlaceholder('http://localhost:8099').fill('http://pinot-broker:8099');
    
    // Fill in the controller URL
    await page.getByPlaceholder('http://localhost:9000').fill('http://pinot-controller:9000');
    
    // Click "Save & test" button
    const healthCheckResponse = await configPage.saveAndTest();
    
    // Expect successful response
    expect(healthCheckResponse.status()).toBe(200);
    
    // Verify success messages
    await expect(page.getByText(/broker health check passed/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/controller connected/i)).toBeVisible({ timeout: 15000 });
  });

  test('should show error when broker URL is incorrect', async ({ createDataSourceConfigPage, page }) => {
    // Create a new datasource config page
    const configPage = await createDataSourceConfigPage({ type: 'yesoreyeram-pinot-datasource' });
    
    // Wait for the broker URL field to be visible
    await expect(page.getByPlaceholder('http://localhost:8099')).toBeVisible({ timeout: 15000 });
    
    // Fill in an incorrect broker URL
    await page.getByPlaceholder('http://localhost:8099').fill('http://invalid-broker:9999');
    
    // Click "Save & test" button
    const healthCheckResponse = await configPage.saveAndTest();
    
    // Expect error response
    expect(healthCheckResponse.status()).not.toBe(200);
    
    // Verify error message
    await expect(page.getByText(/health check failed|failed to connect/i)).toBeVisible({ timeout: 15000 });
  });

  test('should show error when controller URL is incorrect but broker is correct', async ({ createDataSourceConfigPage, page }) => {
    // Create a new datasource config page
    const configPage = await createDataSourceConfigPage({ type: 'yesoreyeram-pinot-datasource' });
    
    // Wait for the broker URL field to be visible
    await expect(page.getByPlaceholder('http://localhost:8099')).toBeVisible({ timeout: 15000 });
    
    // Fill in a correct broker URL
    await page.getByPlaceholder('http://localhost:8099').fill('http://pinot-broker:8099');
    
    // Fill in an incorrect controller URL
    await page.getByPlaceholder('http://localhost:9000').fill('http://invalid-controller:9999');
    
    // Click "Save & test" button
    const healthCheckResponse = await configPage.saveAndTest();
    
    // Expect error response for controller
    expect(healthCheckResponse.status()).not.toBe(200);
    
    // Verify error message
    await expect(page.getByText(/controller.*failed/i)).toBeVisible({ timeout: 15000 });
  });

  test('should handle authentication type selection for broker', async ({ createDataSourceConfigPage, page }) => {
    // Create a new datasource config page
    const configPage = await createDataSourceConfigPage({ type: 'yesoreyeram-pinot-datasource' });
    
    // Wait for the broker URL field to be visible
    await expect(page.getByPlaceholder('http://localhost:8099')).toBeVisible({ timeout: 15000 });
    
    // Fill in the broker URL
    await page.getByPlaceholder('http://localhost:8099').fill('http://pinot-broker:8099');
    
    // Find auth type dropdown by looking for the first combobox
    const authTypeField = page.getByRole('combobox').first();
    await expect(authTypeField).toBeVisible({ timeout: 15000 });
    
    // Change to Basic Authentication
    await authTypeField.click();
    await page.getByRole('option', { name: 'Basic Authentication' }).click();
    
    // Verify username and password fields appear
    await expect(page.getByPlaceholder('Username').first()).toBeVisible();
    await expect(page.getByPlaceholder('Password').first()).toBeVisible();
    
    // Change to Bearer Token
    await authTypeField.click();
    await page.getByRole('option', { name: /\*\*\*\*\*\*/ }).click();
    
    // Verify token field appears
    await expect(page.getByPlaceholder(/\*\*\*\*\*\*/).first()).toBeVisible();
  });

  test('should persist configuration after save', async ({ createDataSourceConfigPage, gotoDataSourceConfigPage, page }) => {
    // Create a new datasource config page
    const configPage = await createDataSourceConfigPage({ 
      type: 'yesoreyeram-pinot-datasource',
      deleteDataSourceAfterTest: false // Keep it to verify persistence
    });
    
    // Wait for broker URL field to be visible
    await expect(page.getByPlaceholder('http://localhost:8099')).toBeVisible({ timeout: 15000 });
    
    // Fill in the broker URL
    const brokerUrl = 'http://pinot-broker:8099';
    await page.getByPlaceholder('http://localhost:8099').fill(brokerUrl);
    
    // Fill in the controller URL
    const controllerUrl = 'http://pinot-controller:9000';
    await page.getByPlaceholder('http://localhost:9000').fill(controllerUrl);
    
    // Save the datasource
    const healthCheckResponse = await configPage.saveAndTest();
    expect(healthCheckResponse.status()).toBe(200);
    
    // Navigate back to the config page to verify persistence
    const uid = configPage.datasource.uid;
    await page.goto('/connections/datasources');
    await gotoDataSourceConfigPage(uid);
    
    // Verify the URLs are still there
    await expect(page.getByPlaceholder('http://localhost:8099')).toHaveValue(brokerUrl);
    await expect(page.getByPlaceholder('http://localhost:9000')).toHaveValue(controllerUrl);
    
    // Clean up - delete the datasource
    await configPage.deleteDataSource();
  });
});
