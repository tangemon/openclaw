import { z } from "zod";

export const dataExtractorConfigSchema = () => {
  return z.object({
    enabled: z.boolean().default(true).describe("是否启用数据提取功能"),
    databasePath: z
      .string()
      .default("~/.openclaw/data/data-extractor-data")
      .describe("数据存储目录"),
    maxEntries: z.number().min(1).max(100000).default(10000).describe("最大条目数"),
    autoValidate: z.boolean().default(true).describe("是否自动验证数据"),
    defaultConfidence: z.number().min(0).max(1).default(0.7).describe("默认置信度阈值"),
    defaultProvider: z.string().optional().describe("默认模型提供商"),
    defaultModel: z.string().optional().describe("默认模型"),
    allowedModels: z.array(z.string()).default([]).describe("允许的模型列表"),
    maxTokens: z.number().min(100).max(10000).default(2000).describe("最大token数"),
    timeoutMs: z.number().min(1000).max(60000).default(30000).describe("超时时间(毫秒)"),
    debugMode: z.boolean().default(false).describe("是否启用调试模式"),
    fallbackToOriginal: z.boolean().default(true).describe("失败时是否回退到原始数据"),
  });
};

export type DataExtractorConfig = z.infer<ReturnType<typeof dataExtractorConfigSchema>>;
