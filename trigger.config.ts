import { defineConfig } from "@trigger.dev/sdk/v3"

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF || "dudit-whatsapp",
  runtime: "node",
  logLevel: "info",
  maxDuration: 300,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 5,
      factor: 2,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 60000,
      randomize: true,
    },
  },
  dirs: ["./trigger"],
})
