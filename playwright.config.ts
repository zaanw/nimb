import { defineConfig } from "@playwright/test";
const externalURL = process.env.NIMB_BROWSER_URL;
export default defineConfig({
  testDir: "./tests",
  timeout: 120000,
  workers: 1,
  use: {
    baseURL: externalURL || "http://localhost:5173",
    headless: true,
    ignoreHTTPSErrors: process.env.NIMB_TEST_SELF_SIGNED === "true",
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
  },
  webServer: externalURL
    ? undefined
    : {
        command: "npm run dev -w @nimb/web",
        url: "http://localhost:5173",
        reuseExistingServer: true,
        timeout: 30000,
      },
});
