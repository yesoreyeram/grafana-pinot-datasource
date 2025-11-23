import { test, expect } from '@grafana/plugin-e2e';

/**
 * E2E tests for Apache Pinot datasource configuration
 * Tests the datasource configuration page and health check functionality
 */

test.describe('Apache Pinot Datasource Configuration', () => {
  
  test('should display health check error when broker URL is missing', async ({ page }) => {
    // Navigate to add new connection page
    await page.goto('/connections/add-new-connection?cat=data-source');
    
    // Wait for and click on Apache Pinot datasource
    await page.getByRole('heading', { name: /apache pinot/i }).click();
    
    // Click "Add new data source" button
    await page.getByRole('button', { name: /add new data source/i }).click();
    
    // Wait for navigation to config page
    await page.waitForURL(/\/connections\/datasources\/edit\/.+/);
    
    // Wait for the config form to load by checking for broker URL field
    await expect(page.getByPlaceholder('http://localhost:8099')).toBeVisible({ timeout: 15000 });
    
    // Click "Save & test" button without filling broker URL
    await page.getByRole('button', { name: /save.*test/i }).click();
    
    // Expect error message about broker URL being required or health check failing
    await expect(page.getByText(/broker.*url.*required|health check failed|broker.*failed|failed to connect/i)).toBeVisible({ timeout: 15000 });
  });

  test('should pass health check with valid broker URL only', async ({ page }) => {
    // Navigate to add new connection page
    await page.goto('/connections/add-new-connection?cat=data-source');
    
    // Wait for and click on Apache Pinot datasource
    await page.getByRole('heading', { name: /apache pinot/i }).click();
    
    // Click "Add new data source" button
    await page.getByRole('button', { name: /add new data source/i }).click();
    
    // Wait for navigation to config page
    await page.waitForURL(/\/connections\/datasources\/edit\/.+/);
    
    // Wait for the config form to load by checking for broker URL field
    await expect(page.getByPlaceholder('http://localhost:8099')).toBeVisible({ timeout: 15000 });
    
    // Fill in the broker URL (using docker-compose service name)
    await page.getByPlaceholder('http://localhost:8099').fill('http://pinot-broker:8099');
    
    // Click "Save & test" button
    await page.getByRole('button', { name: /save.*test/i }).click();
    
    // Wait for and verify success message
    await expect(page.getByText(/broker health check passed/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/broker query endpoint verified/i)).toBeVisible({ timeout: 15000 });
  });

  test('should pass health check with both broker and controller URLs', async ({ page }) => {
    // Navigate to add new connection page
    await page.goto('/connections/add-new-connection?cat=data-source');
    
    // Wait for and click on Apache Pinot datasource
    await page.getByRole('heading', { name: /apache pinot/i }).click();
    
    // Click "Add new data source" button
    await page.getByRole('button', { name: /add new data source/i }).click();
    
    // Wait for navigation to config page
    await page.waitForURL(/\/connections\/datasources\/edit\/.+/);
    
    // Wait for the config form to load by checking for both URL fields
    await expect(page.getByPlaceholder('http://localhost:8099')).toBeVisible({ timeout: 15000 });
    await expect(page.getByPlaceholder('http://localhost:9000')).toBeVisible({ timeout: 15000 });
    
    // Fill in the broker URL
    await page.getByPlaceholder('http://localhost:8099').fill('http://pinot-broker:8099');
    
    // Fill in the controller URL
    await page.getByPlaceholder('http://localhost:9000').fill('http://pinot-controller:9000');
    
    // Click "Save & test" button
    await page.getByRole('button', { name: /save.*test/i }).click();
    
    // Wait for and verify success messages for both broker and controller
    await expect(page.getByText(/broker health check passed/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/broker query endpoint verified/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/controller connected/i)).toBeVisible({ timeout: 15000 });
  });

  test('should show error when broker URL is incorrect', async ({ page }) => {
    // Navigate to add new connection page
    await page.goto('/connections/add-new-connection?cat=data-source');
    
    // Wait for and click on Apache Pinot datasource
    await page.getByRole('heading', { name: /apache pinot/i }).click();
    
    // Click "Add new data source" button
    await page.getByRole('button', { name: /add new data source/i }).click();
    
    // Wait for navigation to config page
    await page.waitForURL(/\/connections\/datasources\/edit\/.+/);
    
    // Wait for the config form to load by checking for broker URL field
    await expect(page.getByPlaceholder('http://localhost:8099')).toBeVisible({ timeout: 15000 });
    
    // Fill in an incorrect broker URL
    await page.getByPlaceholder('http://localhost:8099').fill('http://invalid-broker:9999');
    
    // Click "Save & test" button
    await page.getByRole('button', { name: /save.*test/i }).click();
    
    // Expect error message about connection failure
    await expect(page.getByText(/health check failed|failed to connect|connection refused/i)).toBeVisible({ timeout: 15000 });
  });

  test('should show error when controller URL is incorrect but broker is correct', async ({ page }) => {
    // Navigate to add new connection page
    await page.goto('/connections/add-new-connection?cat=data-source');
    
    // Wait for and click on Apache Pinot datasource
    await page.getByRole('heading', { name: /apache pinot/i }).click();
    
    // Click "Add new data source" button
    await page.getByRole('button', { name: /add new data source/i }).click();
    
    // Wait for navigation to config page
    await page.waitForURL(/\/connections\/datasources\/edit\/.+/);
    
    // Wait for the config form to load by checking for both URL fields
    await expect(page.getByPlaceholder('http://localhost:8099')).toBeVisible({ timeout: 15000 });
    await expect(page.getByPlaceholder('http://localhost:9000')).toBeVisible({ timeout: 15000 });
    
    // Fill in a correct broker URL
    await page.getByPlaceholder('http://localhost:8099').fill('http://pinot-broker:8099');
    
    // Fill in an incorrect controller URL
    await page.getByPlaceholder('http://localhost:9000').fill('http://invalid-controller:9999');
    
    // Click "Save & test" button
    await page.getByRole('button', { name: /save.*test/i }).click();
    
    // Expect error message about controller connection failure
    await expect(page.getByText(/controller.*failed|controller connection failed/i)).toBeVisible({ timeout: 15000 });
  });

  test('should handle authentication type selection for broker', async ({ page }) => {
    // Navigate to add new connection page
    await page.goto('/connections/add-new-connection?cat=data-source');
    
    // Wait for and click on Apache Pinot datasource
    await page.getByRole('heading', { name: /apache pinot/i }).click();
    
    // Click "Add new data source" button
    await page.getByRole('button', { name: /add new data source/i }).click();
    
    // Wait for navigation to config page
    await page.waitForURL(/\/connections\/datasources\/edit\/.+/);
    
    // Wait for the config form to load by checking for broker URL field
    await expect(page.getByPlaceholder('http://localhost:8099')).toBeVisible({ timeout: 15000 });
    
    // Fill in the broker URL
    await page.getByPlaceholder('http://localhost:8099').fill('http://pinot-broker:8099');
    
    // Find auth type dropdown by looking for the first one under broker section
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
    await page.getByRole('option', { name: 'Bearer Token' }).click();
    
    // Verify token field appears
    await expect(page.getByPlaceholder('Bearer token').first()).toBeVisible();
  });

  test('should persist configuration after save', async ({ page }) => {
    // Navigate to add new connection page
    await page.goto('/connections/add-new-connection?cat=data-source');
    
    // Wait for and click on Apache Pinot datasource
    await page.getByRole('heading', { name: /apache pinot/i }).click();
    
    // Click "Add new data source" button
    await page.getByRole('button', { name: /add new data source/i }).click();
    
    // Wait for navigation to config page
    await page.waitForURL(/\/connections\/datasources\/edit\/.+/);
    
    // Wait for the config form to load by checking for both URL fields
    await expect(page.getByPlaceholder('http://localhost:8099')).toBeVisible({ timeout: 15000 });
    await expect(page.getByPlaceholder('http://localhost:9000')).toBeVisible({ timeout: 15000 });
    
    // Fill in the broker URL
    const brokerUrl = 'http://pinot-broker:8099';
    await page.getByPlaceholder('http://localhost:8099').fill(brokerUrl);
    
    // Fill in the controller URL
    const controllerUrl = 'http://pinot-controller:9000';
    await page.getByPlaceholder('http://localhost:9000').fill(controllerUrl);
    
    // Click "Save & test" button
    await page.getByRole('button', { name: /save.*test/i }).click();
    
    // Wait for success
    await expect(page.getByText(/broker health check passed/i)).toBeVisible({ timeout: 15000 });
    
    // Navigate back to the datasources list
    await page.goto('/connections/datasources');
    
    // Find and click on the newly created datasource
    await page.getByRole('link', { name: /apache pinot/i }).first().click();
    
    // Verify the URLs are still there
    await expect(page.getByPlaceholder('http://localhost:8099')).toHaveValue(brokerUrl);
    await expect(page.getByPlaceholder('http://localhost:9000')).toHaveValue(controllerUrl);
  });
});
