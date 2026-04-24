import { describe, it, expect, vi } from "vitest";
import { DataExtractorService } from "./service.js";

// Mock OpenClawPluginApi
const mockApi = {
  pluginConfig: {
    enabled: true,
    databasePath: "~/.openclaw/data/test",
    maxEntries: 1000,
    autoValidate: true,
    defaultConfidence: 0.7,
    defaultProvider: "openai",
    defaultModel: "gpt-3.5-turbo",
    allowedModels: [],
    maxTokens: 2000,
    timeoutMs: 30000,
    debugMode: false,
    fallbackToOriginal: true,
  },
  config: {
    agents: {
      defaults: {
        model: "openai/gpt-3.5-turbo",
      },
    },
  },
} as any;

describe("DataExtractorService", () => {
  it("should create service instance", () => {
    const service = new DataExtractorService(mockApi);
    expect(service).toBeDefined();
  });

  it("should handle data extraction", async () => {
    const service = new DataExtractorService(mockApi);

    const event = {
      text: "我的名字是测试",
      schema: {
        type: "object",
        properties: {
          name: { type: "string" },
        },
      },
      tableName: "test",
    };

    // Mock the database and LLM calls
    vi.spyOn(service as any, "db", "get").mockReturnValue({
      store: vi.fn().mockResolvedValue({ id: "test-id", success: true }),
    });

    const result = await service.handleDataExtraction(event);
    expect(result).toBeDefined();
  });

  it("should handle commands", async () => {
    const service = new DataExtractorService(mockApi);

    // Mock console.log to capture output
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await service.handleCommand(["help"]);

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
