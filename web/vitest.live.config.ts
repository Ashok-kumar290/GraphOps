import { defineConfig } from "vitest/config";
export default defineConfig({test:{environment:"jsdom",include:["live/**/*.live.test.tsx"],testTimeout:180000,hookTimeout:15000,fileParallelism:false,maxWorkers:1,restoreMocks:true}});
