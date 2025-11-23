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
    
    // Change back to No Authentication to verify field hiding
    await authTypeField.click();
    await page.getByRole('option', { name: 'No Authentication' }).click();
    
    // Verify username and password fields are hidden
    await expect(page.getByPlaceholder('Username').first()).not.toBeVisible();
  });

  test('should persist broker configuration after save', async ({ createDataSourceConfigPage, gotoDataSourceConfigPage, page }) => {
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
    
    // Save the datasource
    const healthCheckResponse = await configPage.saveAndTest();
    expect(healthCheckResponse.status()).toBe(200);
    
    // Navigate back to the config page to verify persistence
    const uid = configPage.datasource.uid;
    await page.goto('/connections/datasources');
    await gotoDataSourceConfigPage(uid);
    
    // Verify the broker URL is still there
    await expect(page.getByPlaceholder('http://localhost:8099')).toHaveValue(brokerUrl);
    
    // Clean up - delete the datasource
    await configPage.deleteDataSource();
  });
});
