import { test, expect } from '@grafana/plugin-e2e';

/**
 * E2E tests for Apache Pinot datasource configuration
 * Tests the datasource configuration page and health check functionality
 */

test.describe('Apache Pinot Datasource Configuration', () => {
  
  test('should display health check error when broker URL is missing', async ({ page }) => {
    // Navigate to new datasource page
    await page.goto('/connections/datasources/new');
    
    // Find and click on Apache Pinot datasource
    await page.getByRole('link', { name: 'Apache Pinot™' }).click();
    
    // Wait for the config page to load
    await expect(page.getByText('Broker Configuration')).toBeVisible();
    
    // Click "Save & test" button without filling broker URL
    await page.getByRole('button', { name: /save.*test/i }).click();
    
    // Expect error message about broker URL being required or health check failing
    await expect(page.getByText(/broker.*url.*required|health check failed|broker.*failed/i)).toBeVisible({ timeout: 10000 });
  });

  test('should pass health check with valid broker URL only', async ({ page }) => {
    // Navigate to new datasource page
    await page.goto('/connections/datasources/new');
    
    // Find and click on Apache Pinot datasource
    await page.getByRole('link', { name: 'Apache Pinot™' }).click();
    
    // Wait for the config page to load
    await expect(page.getByText('Broker Configuration')).toBeVisible();
    
    // Expand broker section if collapsed
    const brokerSection = page.getByText('Broker Configuration');
    await brokerSection.click();
    
    // Fill in the broker URL (using docker-compose service name)
    await page.getByLabel(/broker url/i).fill('http://pinot-broker:8099');
    
    // Click "Save & test" button
    await page.getByRole('button', { name: /save.*test/i }).click();
    
    // Wait for and verify success message
    await expect(page.getByText(/broker health check passed/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/broker query endpoint verified/i)).toBeVisible({ timeout: 15000 });
  });

  test('should pass health check with both broker and controller URLs', async ({ page }) => {
    // Navigate to new datasource page
    await page.goto('/connections/datasources/new');
    
    // Find and click on Apache Pinot datasource
    await page.getByRole('link', { name: 'Apache Pinot™' }).click();
    
    // Wait for the config page to load
    await expect(page.getByText('Broker Configuration')).toBeVisible();
    
    // Expand broker section if collapsed
    const brokerSection = page.getByText('Broker Configuration');
    await brokerSection.click();
    
    // Fill in the broker URL
    await page.getByLabel(/broker url/i).fill('http://pinot-broker:8099');
    
    // Expand controller section
    const controllerSection = page.getByText('Controller Configuration');
    await controllerSection.click();
    
    // Fill in the controller URL
    await page.getByLabel(/controller url/i).fill('http://pinot-controller:9000');
    
    // Click "Save & test" button
    await page.getByRole('button', { name: /save.*test/i }).click();
    
    // Wait for and verify success messages for both broker and controller
    await expect(page.getByText(/broker health check passed/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/broker query endpoint verified/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/controller connected/i)).toBeVisible({ timeout: 15000 });
  });

  test('should show error when broker URL is incorrect', async ({ page }) => {
    // Navigate to new datasource page
    await page.goto('/connections/datasources/new');
    
    // Find and click on Apache Pinot datasource
    await page.getByRole('link', { name: 'Apache Pinot™' }).click();
    
    // Wait for the config page to load
    await expect(page.getByText('Broker Configuration')).toBeVisible();
    
    // Expand broker section if collapsed
    const brokerSection = page.getByText('Broker Configuration');
    await brokerSection.click();
    
    // Fill in an incorrect broker URL
    await page.getByLabel(/broker url/i).fill('http://invalid-broker:9999');
    
    // Click "Save & test" button
    await page.getByRole('button', { name: /save.*test/i }).click();
    
    // Expect error message about connection failure
    await expect(page.getByText(/health check failed|failed to connect|connection refused/i)).toBeVisible({ timeout: 15000 });
  });

  test('should show error when controller URL is incorrect but broker is correct', async ({ page }) => {
    // Navigate to new datasource page
    await page.goto('/connections/datasources/new');
    
    // Find and click on Apache Pinot datasource
    await page.getByRole('link', { name: 'Apache Pinot™' }).click();
    
    // Wait for the config page to load
    await expect(page.getByText('Broker Configuration')).toBeVisible();
    
    // Expand broker section if collapsed
    const brokerSection = page.getByText('Broker Configuration');
    await brokerSection.click();
    
    // Fill in a correct broker URL
    await page.getByLabel(/broker url/i).fill('http://pinot-broker:8099');
    
    // Expand controller section
    const controllerSection = page.getByText('Controller Configuration');
    await controllerSection.click();
    
    // Fill in an incorrect controller URL
    await page.getByLabel(/controller url/i).fill('http://invalid-controller:9999');
    
    // Click "Save & test" button
    await page.getByRole('button', { name: /save.*test/i }).click();
    
    // Expect error message about controller connection failure
    await expect(page.getByText(/controller.*failed|controller connection failed/i)).toBeVisible({ timeout: 15000 });
  });

  test('should handle authentication type selection for broker', async ({ page }) => {
    // Navigate to new datasource page
    await page.goto('/connections/datasources/new');
    
    // Find and click on Apache Pinot datasource
    await page.getByRole('link', { name: 'Apache Pinot™' }).click();
    
    // Wait for the config page to load
    await expect(page.getByText('Broker Configuration')).toBeVisible();
    
    // Expand broker section if collapsed
    const brokerSection = page.getByText('Broker Configuration');
    await brokerSection.click();
    
    // Fill in the broker URL
    await page.getByLabel(/broker url/i).fill('http://pinot-broker:8099');
    
    // Find auth type dropdown - it should default to "No Authentication"
    const authTypeField = page.locator('label:has-text("Authentication Type")').locator('..').getByRole('combobox');
    await expect(authTypeField).toHaveText(/no authentication/i);
    
    // Change to Basic Authentication
    await authTypeField.click();
    await page.getByText('Basic Authentication').click();
    
    // Verify username and password fields appear
    await expect(page.getByLabel(/username/i).first()).toBeVisible();
    await expect(page.getByLabel(/password/i).first()).toBeVisible();
    
    // Change to Bearer Token
    await authTypeField.click();
    await page.getByText('Bearer Token').click();
    
    // Verify token field appears
    await expect(page.getByLabel(/bearer token/i).first()).toBeVisible();
  });

  test('should persist configuration after save', async ({ page }) => {
    // Navigate to new datasource page
    await page.goto('/connections/datasources/new');
    
    // Find and click on Apache Pinot datasource
    await page.getByRole('link', { name: 'Apache Pinot™' }).click();
    
    // Wait for the config page to load
    await expect(page.getByText('Broker Configuration')).toBeVisible();
    
    // Expand broker section if collapsed
    const brokerSection = page.getByText('Broker Configuration');
    await brokerSection.click();
    
    // Fill in the broker URL
    const brokerUrl = 'http://pinot-broker:8099';
    await page.getByLabel(/broker url/i).fill(brokerUrl);
    
    // Expand controller section
    const controllerSection = page.getByText('Controller Configuration');
    await controllerSection.click();
    
    // Fill in the controller URL
    const controllerUrl = 'http://pinot-controller:9000';
    await page.getByLabel(/controller url/i).fill(controllerUrl);
    
    // Click "Save & test" button
    await page.getByRole('button', { name: /save.*test/i }).click();
    
    // Wait for success
    await expect(page.getByText(/broker health check passed/i)).toBeVisible({ timeout: 15000 });
    
    // Navigate back to the datasources list
    await page.goto('/connections/datasources');
    
    // Find and click on the newly created datasource
    await page.getByRole('link', { name: /apache pinot/i }).first().click();
    
    // Verify the URLs are still there
    await expect(page.getByLabel(/broker url/i)).toHaveValue(brokerUrl);
    await expect(page.getByLabel(/controller url/i)).toHaveValue(controllerUrl);
  });
});
