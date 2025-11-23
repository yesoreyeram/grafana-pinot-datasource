import { test, expect } from '@grafana/plugin-e2e';

/**
 * E2E tests for Apache Pinot datasource query editor
 * Tests the query editor functionality and query execution
 */

test.describe('Apache Pinot Query Editor', () => {
  let datasourceUid: string;

  test.beforeAll(async ({ createDataSourceConfigPage }) => {
    // Create and configure datasource before running query tests
    const configPage = await createDataSourceConfigPage({
      type: 'yesoreyeram-pinot-datasource',
      deleteDataSourceAfterTest: false,
    });

    // Configure broker URL
    const page = configPage.page;
    await expect(page.getByPlaceholder('http://localhost:8099')).toBeVisible({ timeout: 15000 });
    await page.getByPlaceholder('http://localhost:8099').fill('http://pinot-broker:8099');

    // Save and verify
    const healthCheckResponse = await configPage.saveAndTest();
    expect(healthCheckResponse.status()).toBe(200);

    datasourceUid = configPage.datasource.uid;
  });

  test('should display query editor with default options', async ({ explorePage, page }) => {
    await explorePage.datasource.set(datasourceUid);
    await page.waitForTimeout(1000);

    // Check for query editor elements
    // The query editor should have format selector
    const formatSelectors = page.locator('select').filter({ hasText: /time series|table/i });
    await expect(formatSelectors.first()).toBeVisible({ timeout: 10000 });
  });

  test('should execute a simple SELECT query', async ({ explorePage, page }) => {
    await explorePage.datasource.set(datasourceUid);
    await page.waitForTimeout(1000);

    // Enter a simple query
    // Look for CodeEditor or textarea for SQL
    const codeEditor = page.locator('[data-testid="data-testid Code editor container"]').first();
    if (await codeEditor.isVisible({ timeout: 5000 }).catch(() => false)) {
      await codeEditor.click();
      await page.keyboard.type('SELECT 1 as value');
    } else {
      // Fallback to finding any visible textarea
      const textarea = page.locator('textarea').first();
      await expect(textarea).toBeVisible({ timeout: 10000 });
      await textarea.fill('SELECT 1 as value');
    }

    // Run the query
    await explorePage.runQuery();

    // Wait for results - check for either table or graph
    await page.waitForTimeout(2000);

    // Should not show error
    const errorElements = page.locator('[role="alert"]').filter({ hasText: /error|failed/i });
    const errorCount = await errorElements.count();
    expect(errorCount).toBe(0);
  });

  test('should switch between table and timeseries format', async ({ explorePage, page }) => {
    await explorePage.datasource.set(datasourceUid);
    await page.waitForTimeout(1000);

    // Find format selector
    const formatSelector = page.locator('select').filter({ hasText: /time series|table/i }).first();
    await expect(formatSelector).toBeVisible({ timeout: 10000 });

    // Switch to timeseries
    await formatSelector.selectOption('timeseries');

    // Time column input should appear
    const timeColumnInput = page.getByPlaceholder(/timestamp|created_at/i);
    await expect(timeColumnInput).toBeVisible({ timeout: 5000 });

    // Switch back to table
    await formatSelector.selectOption('table');

    // Time column input should disappear
    await expect(timeColumnInput).not.toBeVisible({ timeout: 5000 });
  });

  test('should allow entering time column for timeseries queries', async ({ explorePage, page }) => {
    await explorePage.datasource.set(datasourceUid);
    await page.waitForTimeout(1000);

    // Switch to timeseries format
    const formatSelector = page.locator('select').filter({ hasText: /time series|table/i }).first();
    await expect(formatSelector).toBeVisible({ timeout: 10000 });
    await formatSelector.selectOption('timeseries');

    // Enter time column name
    const timeColumnInput = page.getByPlaceholder(/timestamp|created_at/i);
    await expect(timeColumnInput).toBeVisible({ timeout: 5000 });
    await timeColumnInput.fill('created_at');

    // Verify the value was entered
    await expect(timeColumnInput).toHaveValue('created_at');
  });

  test('should handle query errors gracefully', async ({ explorePage, page }) => {
    await explorePage.datasource.set(datasourceUid);
    await page.waitForTimeout(1000);

    // Enter an invalid query
    const codeEditor = page.locator('[data-testid="data-testid Code editor container"]').first();
    if (await codeEditor.isVisible({ timeout: 5000 }).catch(() => false)) {
      await codeEditor.click();
      // Clear existing content
      await page.keyboard.press('Control+A');
      await page.keyboard.type('SELECT * FROM nonexistent_table_xyz');
    } else {
      const textarea = page.locator('textarea').first();
      await expect(textarea).toBeVisible({ timeout: 10000 });
      await textarea.fill('SELECT * FROM nonexistent_table_xyz');
    }

    // Run the query
    await explorePage.runQuery();

    // Wait for error to appear
    await page.waitForTimeout(2000);

    // Should show an error message (either in alert or in query result area)
    const hasError = await page.locator('[role="alert"]').isVisible({ timeout: 5000 }).catch(() => false);
    const hasErrorInResults = await page.locator('text=/error|failed|not found/i').isVisible({ timeout: 5000 }).catch(() => false);
    
    expect(hasError || hasErrorInResults).toBe(true);
  });

  test.afterAll(async ({ gotoDataSourceConfigPage, page }) => {
    // Clean up - delete the datasource
    if (datasourceUid) {
      await gotoDataSourceConfigPage(datasourceUid);
      await page.waitForTimeout(1000);

      // Find and click delete button
      const deleteButton = page.getByRole('button', { name: /delete/i });
      if (await deleteButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await deleteButton.click();

        // Confirm deletion if prompted
        const confirmButton = page.getByRole('button', { name: /confirm|yes|delete/i });
        if (await confirmButton.isVisible({ timeout: 3000 }).catch(() => false)) {
          await confirmButton.click();
        }
      }
    }
  });
});

test.describe('Apache Pinot Query Editor - Advanced Features', () => {
  test.skip('should support query builder mode', async ({ explorePage, page }) => {
    // This test is skipped as query builder implementation depends on
    // SQLEditor component behavior which is handled by @grafana/plugin-ui
    expect(true).toBe(true);
  });

  test.skip('should fetch and display available tables', async ({ explorePage, page }) => {
    // This test is skipped as it requires controller configuration
    // and sample data loaded in Pinot
    expect(true).toBe(true);
  });
});
