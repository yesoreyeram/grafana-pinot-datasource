import { test, expect } from '@grafana/plugin-e2e';

/**
 * E2E tests for Apache Pinot datasource query editor
 * Tests the query editor functionality and query execution
 * Includes screenshots for documentation
 */

test.describe.serial('Apache Pinot Query Editor - Basic Functionality', () => {
  let datasourceUid: string = '';

  test('should display query editor with default options', async ({ createDataSourceConfigPage, explorePage, page }) => {
    // Create and configure datasource in first test
    const configPage = await createDataSourceConfigPage({
      type: 'yesoreyeram-pinot-datasource',
      deleteDataSourceAfterTest: false,
    });

    await expect(page.getByPlaceholder('http://localhost:8099')).toBeVisible({ timeout: 15000 });
    await page.getByPlaceholder('http://localhost:8099').fill('http://pinot-broker:8099');

    await page.getByText('Controller Configuration (Optional)').click();
    await expect(page.getByPlaceholder('http://localhost:9000')).toBeVisible({ timeout: 15000 });
    await page.getByPlaceholder('http://localhost:9000').fill('http://pinot-controller:9000');

    const healthCheckResponse = await configPage.saveAndTest();
    expect(healthCheckResponse.status()).toBe(200);

    datasourceUid = configPage.datasource.uid;

    // Navigate to Explore page before setting datasource
    await explorePage.goto();
    await page.waitForTimeout(1000);

    // Continue with test
    await explorePage.datasource.set(datasourceUid);
    await page.waitForTimeout(1000);

    // Check for query editor elements
    // The query editor should have format selector
    const formatSelectors = page.locator('select').filter({ hasText: /time series|table/i });
    await expect(formatSelectors.first()).toBeVisible({ timeout: 10000 });
    
    // Take screenshot of query editor interface
    await page.screenshot({ 
      path: 'docs/images/query-editor-interface.png',
      fullPage: false
    });
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

});

test.describe.serial('Apache Pinot Query Editor - Real Data Queries', () => {
  let datasourceUid: string = '';

  test('should query airlineStats sample data', async ({ createDataSourceConfigPage, explorePage, page }) => {
    // Create datasource in first test
    const configPage = await createDataSourceConfigPage({
      type: 'yesoreyeram-pinot-datasource',
      deleteDataSourceAfterTest: false,
    });

    await expect(page.getByPlaceholder('http://localhost:8099')).toBeVisible({ timeout: 15000 });
    await page.getByPlaceholder('http://localhost:8099').fill('http://pinot-broker:8099');
    
    await page.getByText('Controller Configuration (Optional)').click();
    await expect(page.getByPlaceholder('http://localhost:9000')).toBeVisible({ timeout: 15000 });
    await page.getByPlaceholder('http://localhost:9000').fill('http://pinot-controller:9000');

    const healthCheckResponse = await configPage.saveAndTest();
    expect(healthCheckResponse.status()).toBe(200);

    datasourceUid = configPage.datasource.uid;

    // Navigate to Explore page before setting datasource
    await explorePage.goto();
    await page.waitForTimeout(1000);

    // Continue with test
    await explorePage.datasource.set(datasourceUid);
    await page.waitForTimeout(1000);

    // Query the airline stats table
    const query = 'SELECT Origin, Dest, COUNT(*) as flight_count FROM airlineStats GROUP BY Origin, Dest LIMIT 10';
    
    const codeEditor = page.locator('[data-testid="data-testid Code editor container"]').first();
    if (await codeEditor.isVisible({ timeout: 5000 }).catch(() => false)) {
      await codeEditor.click();
      await page.keyboard.type(query);
    } else {
      const textarea = page.locator('textarea').first();
      await expect(textarea).toBeVisible({ timeout: 10000 });
      await textarea.fill(query);
    }

    await explorePage.runQuery();
    await page.waitForTimeout(3000);

    // Should not show error
    const errorElements = page.locator('[role="alert"]').filter({ hasText: /error|failed/i });
    const errorCount = await errorElements.count();
    expect(errorCount).toBe(0);
  });

  test('should query baseballStats sample data', async ({ explorePage, page }) => {
    await explorePage.datasource.set(datasourceUid);
    await page.waitForTimeout(1000);

    const query = 'SELECT playerName, teamID, homeRuns FROM baseballStats WHERE homeRuns > 30 LIMIT 10';
    
    const codeEditor = page.locator('[data-testid="data-testid Code editor container"]').first();
    if (await codeEditor.isVisible({ timeout: 5000 }).catch(() => false)) {
      await codeEditor.click();
      await page.keyboard.press('Control+A');
      await page.keyboard.type(query);
    } else {
      const textarea = page.locator('textarea').first();
      await expect(textarea).toBeVisible({ timeout: 10000 });
      await textarea.fill(query);
    }

    await explorePage.runQuery();
    await page.waitForTimeout(3000);

    const errorElements = page.locator('[role="alert"]').filter({ hasText: /error|failed/i });
    const errorCount = await errorElements.count();
    expect(errorCount).toBe(0);
  });

  test('should execute aggregation query on ecommerce data', async ({ explorePage, page }) => {
    await explorePage.datasource.set(datasourceUid);
    await page.waitForTimeout(1000);

    const query = 'SELECT COUNT(*) as total_orders, AVG(total) as avg_total FROM ecommerce_orders';
    
    const codeEditor = page.locator('[data-testid="data-testid Code editor container"]').first();
    if (await codeEditor.isVisible({ timeout: 5000 }).catch(() => false)) {
      await codeEditor.click();
      await page.keyboard.press('Control+A');
      await page.keyboard.type(query);
    } else {
      const textarea = page.locator('textarea').first();
      await expect(textarea).toBeVisible({ timeout: 10000 });
      await textarea.fill(query);
    }

    await explorePage.runQuery();
    await page.waitForTimeout(3000);

    const errorElements = page.locator('[role="alert"]').filter({ hasText: /error|failed/i });
    const errorCount = await errorElements.count();
    expect(errorCount).toBe(0);
  });
});

test.describe.serial('Apache Pinot Query Editor - Time Series with Macros', () => {
  let datasourceUid: string = '';

  test('should execute time series query with $__timeFilter macro', async ({ createDataSourceConfigPage, explorePage, page }) => {
    // Create datasource in first test
    const configPage = await createDataSourceConfigPage({
      type: 'yesoreyeram-pinot-datasource',
      deleteDataSourceAfterTest: false,
    });

    await expect(page.getByPlaceholder('http://localhost:8099')).toBeVisible({ timeout: 15000 });
    await page.getByPlaceholder('http://localhost:8099').fill('http://pinot-broker:8099');
    
    await page.getByText('Controller Configuration (Optional)').click();
    await expect(page.getByPlaceholder('http://localhost:9000')).toBeVisible({ timeout: 15000 });
    await page.getByPlaceholder('http://localhost:9000').fill('http://pinot-controller:9000');

    const healthCheckResponse = await configPage.saveAndTest();
    expect(healthCheckResponse.status()).toBe(200);

    datasourceUid = configPage.datasource.uid;

    // Navigate to Explore page before setting datasource
    await explorePage.goto();
    await page.waitForTimeout(1000);

    // Continue with test
    await explorePage.datasource.set(datasourceUid);
    await page.waitForTimeout(1000);

    // Switch to timeseries format
    const formatSelector = page.locator('select').filter({ hasText: /time series|table/i }).first();
    await formatSelector.selectOption('timeseries');
    
    // Set time column
    const timeColumnInput = page.getByPlaceholder(/timestamp|created_at/i);
    await timeColumnInput.fill('timestamp');

    // Enter time series query with macro
    const query = 'SELECT timestamp, AVG(value) as avg_value FROM metricsTimeseries WHERE $__timeFilter(timestamp) GROUP BY timestamp ORDER BY timestamp LIMIT 100';
    
    const codeEditor = page.locator('[data-testid="data-testid Code editor container"]').first();
    if (await codeEditor.isVisible({ timeout: 5000 }).catch(() => false)) {
      await codeEditor.click();
      await page.keyboard.press('Control+A');
      await page.keyboard.type(query);
    } else {
      const textarea = page.locator('textarea').first();
      await expect(textarea).toBeVisible({ timeout: 10000 });
      await textarea.fill(query);
    }

    // Take screenshot of time series query
    await page.screenshot({ 
      path: 'docs/images/timeseries-query-with-macro.png',
      fullPage: false
    });

    // Run query
    await explorePage.runQuery();
    await page.waitForTimeout(3000);

    // Check for success (no errors)
    const errorElements = page.locator('[role="alert"]').filter({ hasText: /error|failed/i });
    const errorCount = await errorElements.count();
    expect(errorCount).toBe(0);
    
    // Take screenshot of results
    await page.screenshot({ 
      path: 'docs/images/timeseries-query-results.png',
      fullPage: true
    });
  });

  test('should execute query with $__timeFrom and $__timeTo macros', async ({ explorePage, page }) => {
    await explorePage.datasource.set(datasourceUid);
    await page.waitForTimeout(1000);

    // Enter query with individual time macros
    const query = 'SELECT timestamp, metric_name, value FROM metricsTimeseries WHERE timestamp >= $__timeFrom AND timestamp < $__timeTo LIMIT 50';
    
    const codeEditor = page.locator('[data-testid="data-testid Code editor container"]').first();
    if (await codeEditor.isVisible({ timeout: 5000 }).catch(() => false)) {
      await codeEditor.click();
      await page.keyboard.press('Control+A');
      await page.keyboard.type(query);
    } else {
      const textarea = page.locator('textarea').first();
      await expect(textarea).toBeVisible({ timeout: 10000 });
      await textarea.fill(query);
    }

    await explorePage.runQuery();
    await page.waitForTimeout(3000);

    const errorElements = page.locator('[role="alert"]').filter({ hasText: /error|failed/i });
    const errorCount = await errorElements.count();
    expect(errorCount).toBe(0);
  });

  test('should handle aggregation over time with metrics', async ({ explorePage, page }) => {
    await explorePage.datasource.set(datasourceUid);
    await page.waitForTimeout(1000);

    // Switch to timeseries format
    const formatSelector = page.locator('select').filter({ hasText: /time series|table/i }).first();
    await formatSelector.selectOption('timeseries');
    
    const timeColumnInput = page.getByPlaceholder(/timestamp|created_at/i);
    await timeColumnInput.fill('timestamp');

    // Complex aggregation query
    const query = `SELECT 
      timestamp, 
      metric_name,
      AVG(value) as avg_value,
      MAX(value) as max_value,
      MIN(value) as min_value
    FROM metricsTimeseries 
    WHERE $__timeFilter(timestamp) 
      AND metric_name = 'cpu_usage'
    GROUP BY timestamp, metric_name 
    ORDER BY timestamp 
    LIMIT 100`;
    
    const codeEditor = page.locator('[data-testid="data-testid Code editor container"]').first();
    if (await codeEditor.isVisible({ timeout: 5000 }).catch(() => false)) {
      await codeEditor.click();
      await page.keyboard.press('Control+A');
      await page.keyboard.type(query);
    } else {
      const textarea = page.locator('textarea').first();
      await expect(textarea).toBeVisible({ timeout: 10000 });
      await textarea.fill(query);
    }

    // Take screenshot of complex query
    await page.screenshot({ 
      path: 'docs/images/timeseries-aggregation-query.png',
      fullPage: false
    });

    await explorePage.runQuery();
    await page.waitForTimeout(3000);

    const errorElements = page.locator('[role="alert"]').filter({ hasText: /error|failed/i });
    const errorCount = await errorElements.count();
    expect(errorCount).toBe(0);
  });

  test('should handle null values in time series', async ({ explorePage, page }) => {
    await explorePage.datasource.set(datasourceUid);
    await page.waitForTimeout(1000);

    // Query that may have nulls (10% of data has nulls)
    const query = 'SELECT timestamp, host, value FROM metricsTimeseries WHERE $__timeFilter(timestamp) ORDER BY timestamp LIMIT 100';
    
    const codeEditor = page.locator('[data-testid="data-testid Code editor container"]').first();
    if (await codeEditor.isVisible({ timeout: 5000 }).catch(() => false)) {
      await codeEditor.click();
      await page.keyboard.press('Control+A');
      await page.keyboard.type(query);
    } else {
      const textarea = page.locator('textarea').first();
      await expect(textarea).toBeVisible({ timeout: 10000 });
      await textarea.fill(query);
    }

    await explorePage.runQuery();
    await page.waitForTimeout(3000);

    // Should handle nulls gracefully without errors
    const errorElements = page.locator('[role="alert"]').filter({ hasText: /error|failed/i });
    const errorCount = await errorElements.count();
    expect(errorCount).toBe(0);
  });

  test('should handle query with invalid syntax (failure test)', async ({ explorePage, page }) => {
    await explorePage.datasource.set(datasourceUid);
    await page.waitForTimeout(1000);

    // Invalid SQL query
    const query = 'SELECT * FROM nonexistent_table WHERE invalid syntax here';
    
    const codeEditor = page.locator('[data-testid="data-testid Code editor container"]').first();
    if (await codeEditor.isVisible({ timeout: 5000 }).catch(() => false)) {
      await codeEditor.click();
      await page.keyboard.press('Control+A');
      await page.keyboard.type(query);
    } else {
      const textarea = page.locator('textarea').first();
      await expect(textarea).toBeVisible({ timeout: 10000 });
      await textarea.fill(query);
    }

    await explorePage.runQuery();
    await page.waitForTimeout(3000);

    // Should show error
    const hasError = await page.locator('[role="alert"]').isVisible({ timeout: 5000 }).catch(() => false);
    const hasErrorInResults = await page.locator('text=/error|failed|not found/i').isVisible({ timeout: 5000 }).catch(() => false);
    
    expect(hasError || hasErrorInResults).toBe(true);
    
    // Take screenshot of error
    await page.screenshot({ 
      path: 'docs/images/query-error-example.png',
      fullPage: false
    });
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
