import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests',timeout:120000,workers:1,use:{baseURL:'http://localhost:5173',headless:true,launchOptions:{executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']}},webServer:{command:'npm run dev -w @nimb/web',url:'http://localhost:5173',reuseExistingServer:true,timeout:30000}});
