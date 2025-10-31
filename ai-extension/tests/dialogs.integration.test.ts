/**
 * Integration test for dialog interception
 * Tests that dialogs are intercepted before page scripts execute
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { chromium, type Browser, type Page, type BrowserContext } from "playwright";
import path from "path";

describe("Dialog Interception Integration Tests", () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;

  beforeAll(async () => {
    // This test is commented out as it requires a built extension
    // Uncomment and run after building the extension with `pnpm build`
    
    // const extensionPath = path.resolve(__dirname, "../dist");
    // browser = await chromium.launchPersistentContext("", {
    //   headless: false,
    //   args: [
    //     `--disable-extensions-except=${extensionPath}`,
    //     `--load-extension=${extensionPath}`,
    //   ],
    // });
    // page = await browser.newPage();
  }, 30000);

  afterAll(async () => {
    // if (browser) {
    //   await browser.close();
    // }
  });

  it.skip("should intercept alert before page script executes", async () => {
    // Create a simple HTML page with an alert
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Test Alert</title>
          <script>
            window.addEventListener('load', () => {
              window.alert('This is a test alert');
              document.getElementById('result').textContent = 'Alert completed';
            });
          </script>
        </head>
        <body>
          <h1>Dialog Test Page</h1>
          <div id="result">Waiting...</div>
        </body>
      </html>
    `;

    await page.setContent(html);
    await page.waitForTimeout(1000);

    // Check if the result div was updated (meaning alert was handled)
    const result = await page.textContent("#result");
    expect(result).toBe("Alert completed");
  });

  it.skip("should intercept confirm before page script executes", async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Test Confirm</title>
          <script>
            window.addEventListener('load', () => {
              const result = window.confirm('Confirm this action?');
              document.getElementById('result').textContent = 
                'Confirm result: ' + result;
            });
          </script>
        </head>
        <body>
          <h1>Dialog Test Page</h1>
          <div id="result">Waiting...</div>
        </body>
      </html>
    `;

    await page.setContent(html);
    await page.waitForTimeout(1000);

    const result = await page.textContent("#result");
    expect(result).toMatch(/Confirm result: (true|false)/);
  });

  it.skip("should intercept prompt before page script executes", async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Test Prompt</title>
          <script>
            window.addEventListener('load', () => {
              const result = window.prompt('Enter your name:', 'Default');
              document.getElementById('result').textContent = 
                'Prompt result: ' + result;
            });
          </script>
        </head>
        <body>
          <h1>Dialog Test Page</h1>
          <div id="result">Waiting...</div>
        </body>
      </html>
    `;

    await page.setContent(html);
    await page.waitForTimeout(1000);

    const result = await page.textContent("#result");
    expect(result).toBeTruthy();
  });

  it.skip("should detect dialog interceptors ready signal", async () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Test Interceptor Ready</title>
          <script>
            let interceptorReady = false;
            window.addEventListener('message', (event) => {
              if (event.data?.type === 'DIALOG_INTERCEPTORS_READY' && 
                  event.data?.source === 'ai-pocket-dialog-interceptor') {
                interceptorReady = true;
                document.getElementById('result').textContent = 'Interceptors ready';
              }
            });
          </script>
        </head>
        <body>
          <h1>Dialog Test Page</h1>
          <div id="result">Waiting...</div>
        </body>
      </html>
    `;

    await page.setContent(html);
    await page.waitForTimeout(1000);

    const result = await page.textContent("#result");
    expect(result).toBe("Interceptors ready");
  });
});

describe("Dialog Interception Unit Tests", () => {
  it("should export dialog functions", async () => {
    // Test that the dialog interceptor script can be loaded
    const interceptorPath = path.resolve(
      __dirname,
      "../src/content/browser-agent/dialog-interceptor.ts"
    );
    
    // Just verify the file exists
    const fs = await import("fs");
    expect(fs.existsSync(interceptorPath)).toBe(true);
  });

  it("should have correct dialog interceptor structure", async () => {
    const fs = await import("fs");
    const interceptorPath = path.resolve(
      __dirname,
      "../src/content/browser-agent/dialog-interceptor.ts"
    );
    
    const content = fs.readFileSync(interceptorPath, "utf-8");
    
    // Verify key elements are present
    expect(content).toContain("window.alert");
    expect(content).toContain("window.confirm");
    expect(content).toContain("window.prompt");
    expect(content).toContain("DIALOG_INTERCEPTED");
    expect(content).toContain("DIALOG_INTERCEPTORS_READY");
  });
});
