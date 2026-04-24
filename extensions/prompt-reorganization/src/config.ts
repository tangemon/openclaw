import { z } from "zod";

export const promptReorganizationConfigSchema = () => {
  return z.object({
    enabled: z.boolean().default(true).describe("是否启用prompt重新整理功能"),
    confidenceThreshold: z.number().min(0).max(1).default(0.7).describe("重新整理结果的置信度阈值"),
    maxSkills: z.number().min(1).max(3).default(3).describe("最大推荐技能数量"),
    timeoutMs: z.number().min(1000).max(30000).default(5000).describe("重新整理超时时间(毫秒)"),
    customPrompt: z.string().optional().describe("自定义重新整理prompt模板"),
    debugMode: z.boolean().default(false).describe("是否启用调试模式"),
    fallbackToOriginal: z.boolean().default(true).describe("失败时是否回退到原始prompt"),
  });
};

export type PromptReorganizationConfig = z.infer<
  ReturnType<typeof promptReorganizationConfigSchema>
>;
