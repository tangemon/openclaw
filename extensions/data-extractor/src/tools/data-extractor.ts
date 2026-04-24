import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/data-extractor";
import { DatabaseManager } from "../database/operations.js";
import { ExtractionParams, ExtractionContext } from "../types/index.js";
import { callLLMForExtraction } from "../utils/llm-helper.js";

export function createDataExtractorTool(api: OpenClawPluginApi) {
  const db = new DatabaseManager(api);

  return {
    name: "extract-data",
    label: "数据提取工具",
    description: "使用大模型从自然语言中提取结构化数据并存储到数据库",
    parameters: Type.Object({
      text: Type.String({ description: "要解析的自然语言文本" }),
      schema: Type.String({ description: "期望的数据结构schema (JSON字符串)" }),
      tableName: Type.String({ description: "目标数据表名" }),
      extractionRules: Type.Optional(Type.String({ description: "自定义提取规则" })),
      confidence: Type.Optional(Type.Number({ description: "最低置信度阈值" })),
      provider: Type.Optional(Type.String({ description: "模型提供商override" })),
      model: Type.Optional(Type.String({ description: "模型名称override" })),
      temperature: Type.Optional(Type.Number({ description: "生成温度" })),
      maxTokens: Type.Optional(Type.Number({ description: "最大token数" })),
    }),

    async execute(_id: string, params: Record<string, unknown>) {
      console.log(`[DataExtractor] execute开始: ${JSON.stringify(params)}`);

      const extractionParams = validateAndParseParams(params);
      console.log(`[DataExtractor] 解析参数完成: tableName=${extractionParams.tableName}`);

      const config = api.pluginConfig || {};

      try {
        // 1. 构建智能提取prompt
        console.log(`[DataExtractor] 构建prompt...`);
        const systemPrompt = buildSystemPrompt();
        const prompt = buildExtractionPrompt(extractionParams);
        console.log(
          `[DataExtractor] prompt构建完成，systemPrompt长度: ${systemPrompt.length}, prompt长度: ${prompt.length}`,
        );

        // 2. 使用LLM进行数据提取
        console.log(`[DataExtractor] 调用LLM...`);
        const llmResult = await callLLMForExtraction(api, {
          prompt,
          systemPrompt,
          schema: extractionParams.schema,
          provider: extractionParams.provider,
          model: extractionParams.model,
          temperature: extractionParams.temperature,
          maxTokens: extractionParams.maxTokens,
        });
        console.log(`[DataExtractor] LLM调用完成: ${JSON.stringify(llmResult)}`);

        // 3. 验证和后处理
        console.log(`[DataExtractor] 验证和处理数据...`);
        const extractedData = await validateAndProcess(llmResult, extractionParams, config);
        console.log(`[DataExtractor] 数据处理完成: ${JSON.stringify(extractedData)}`);

        // 确保数据有效性
        if (!extractedData || typeof extractedData !== "object") {
          console.log(`[DataExtractor] 数据提取结果无效`);
          throw new Error("数据提取结果无效");
        }

        // 4. 存储到数据库
        console.log(`[DataExtractor] 存储到数据库...`);
        const storageResult = await db.store(
          extractionParams.tableName,
          extractedData.data || {},
          extractedData.metadata || {},
        );
        console.log(`[DataExtractor] 数据库存储完成: ${JSON.stringify(storageResult)}`);

        const result = {
          content: [
            {
              type: "text",
              text: `✅ 数据提取成功！\n\n提取结果：\n${JSON.stringify(extractedData.data, null, 2)}\n\n存储ID：${storageResult.id}`,
            },
          ],
          details: {
            extractedData,
            storageResult,
            model: llmResult.model || "unknown",
          },
        };

        console.log(`[DataExtractor] execute完成: 成功`);
        return result;
      } catch (error) {
        console.log(
          `[DataExtractor] execute失败: ${error instanceof Error ? error.message : String(error)}`,
        );
        console.log(
          `[DataExtractor] 错误堆栈: ${error instanceof Error ? error.stack : String(error)}`,
        );

        return {
          content: [
            {
              type: "text",
              text: `❌ 数据提取失败：${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          details: { error: error instanceof Error ? error.message : String(error) },
        };
      }
    },
  };
}

function validateAndParseParams(params: Record<string, unknown>): ExtractionParams {
  const text = typeof params.text === "string" ? params.text : "";
  const schemaStr = typeof params.schema === "string" ? params.schema : "";
  const tableName = typeof params.tableName === "string" ? params.tableName : "extractions";

  if (!text.trim()) {
    throw new Error("文本内容不能为空");
  }

  if (!schemaStr.trim()) {
    throw new Error("必须提供有效的数据结构schema");
  }

  // 解析 JSON schema
  let schema: any;
  try {
    schema = JSON.parse(schemaStr);
  } catch (error) {
    throw new Error(
      `无效的JSON schema格式: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!schema || typeof schema !== "object") {
    throw new Error("schema必须是有效的JSON对象");
  }

  return {
    text,
    schema,
    tableName,
    extractionRules:
      typeof params.extractionRules === "string" ? params.extractionRules : undefined,
    confidence: typeof params.confidence === "number" ? params.confidence : undefined,
    provider: typeof params.provider === "string" ? params.provider : undefined,
    model: typeof params.model === "string" ? params.model : undefined,
    temperature: typeof params.temperature === "number" ? params.temperature : undefined,
    maxTokens: typeof params.maxTokens === "number" ? params.maxTokens : undefined,
  };
}

function buildSystemPrompt(): string {
  return `你是一个专业的数据提取专家。请严格按照用户提供的schema结构提取数据。

提取要求：
1. 严格按照提供的schema结构提取数据
2. 对于无法确定的值，设为null
3. 提供每个字段的置信度评分(0-1)
4. 如果文本中包含多个实体，请提取为数组
5. 保持原始数据的语义完整性
6. 确保提取的数据符合schema的类型要求

输出格式：
返回严格的JSON对象，包含：
- extracted_data: 提取的结构化数据
- confidence_scores: 每个字段的置信度
- extraction_notes: 提取过程的说明
- warnings: 潜在的数据质量问题

请确保返回的JSON符合提供的schema结构，不要包含任何额外的文本或格式。`;
}

function buildExtractionPrompt(params: ExtractionParams): string {
  const { text, schema, extractionRules, confidence } = params;

  return `**提取目标：**
- 文本内容：${text}
- 期望数据结构：${JSON.stringify(schema, null, 2)}
${extractionRules ? `- 自定义规则：${extractionRules}` : ""}
${confidence ? `- 最低置信度：${confidence}` : ""}`;
}

async function validateAndProcess(llmResult: any, params: ExtractionParams, config: any) {
  const { confidence, extractionRules } = params;

  // 检查返回格式
  console.log(`[DataExtractor] 验证LLM返回格式: ${JSON.stringify(llmResult)}`);

  if (!llmResult || typeof llmResult !== "object") {
    throw new Error("LLM返回结果无效");
  }

  // 检查是否有extracted_data字段
  if (!llmResult.extracted_data) {
    console.log(`[DataExtractor] LLM返回的字段: ${Object.keys(llmResult).join(", ")}`);

    // 如果LLM直接返回了数据（而不是包装在extracted_data中），尝试处理
    if (
      llmResult.name ||
      llmResult.email ||
      llmResult.phone ||
      llmResult.company ||
      llmResult.role
    ) {
      console.log(`[DataExtractor] 检测到直接返回的数据格式，自动包装`);
      return {
        data: llmResult,
        metadata: {
          confidence_scores: llmResult.confidence_scores || {},
          extraction_notes: llmResult.extraction_notes || "自动提取",
          warnings: llmResult.warnings || [],
        },
      };
    }

    // 如果返回的是数组格式（多实体提取）
    if (Array.isArray(llmResult)) {
      console.log(`[DataExtractor] 检测到数组格式返回`);
      return {
        data: llmResult,
        metadata: {
          confidence_scores: {},
          extraction_notes: "多实体提取",
          warnings: [],
        },
      };
    }

    throw new Error(
      `LLM返回格式错误：缺少extracted_data字段。可用字段: ${Object.keys(llmResult).join(", ")}`,
    );
  }

  // 置信度检查
  if (confidence && llmResult.confidence_scores) {
    const lowConfidenceFields = Object.entries(llmResult.confidence_scores)
      .filter(([_, score]: [string, any]) => typeof score === "number" && score < confidence)
      .map(([field]: [string, any]) => field);

    if (lowConfidenceFields.length > 0) {
      throw new Error(`以下字段置信度低于阈值 ${confidence}: ${lowConfidenceFields.join(", ")}`);
    }
  }

  // 应用自定义规则
  let processedData = llmResult.extracted_data;
  if (extractionRules) {
    processedData = await applyCustomRules(processedData, extractionRules);
  }

  // 数据清洗和标准化
  processedData = await cleanAndNormalize(processedData);

  // 处理数组格式的extracted_data
  let finalData = processedData;
  if (Array.isArray(processedData)) {
    // 如果是数组且只有一个元素，直接返回该元素
    if (processedData.length === 1) {
      finalData = processedData[0];
    }
    // 如果是多个元素，保持数组格式
  }

  return {
    data: finalData,
    metadata: {
      confidence: llmResult.confidence_scores || {},
      notes: llmResult.extraction_notes || "",
      warnings: llmResult.warnings || [],
      timestamp: Date.now(),
    },
  };
}

async function applyCustomRules(data: any, rules: string): Promise<any> {
  // 这里可以实现自定义规则的逻辑
  // 例如：数据转换、字段映射、值验证等
  // 目前作为占位符实现
  return data;
}

async function cleanAndNormalize(data: any): Promise<any> {
  // 数据清洗和标准化逻辑
  if (!data) {
    return data;
  }

  // 如果是数组，对每个元素进行清洗
  if (Array.isArray(data)) {
    const cleanedArray = [];
    for (const item of data) {
      cleanedArray.push(await cleanAndNormalize(item));
    }
    return cleanedArray;
  }

  // 如果不是对象，直接返回
  if (typeof data !== "object") {
    return data;
  }

  const cleaned = { ...data };

  // 清理字符串字段
  Object.keys(cleaned).forEach((key) => {
    if (typeof cleaned[key] === "string") {
      cleaned[key] = cleaned[key].trim();
      // 移除多余的空格
      cleaned[key] = cleaned[key].replace(/\s+/g, " ");
    }
  });

  // 标准化邮箱格式
  if (cleaned.email && typeof cleaned.email === "string") {
    cleaned.email = cleaned.email.toLowerCase();
  }

  // 标准化电话号码
  if (cleaned.phone && typeof cleaned.phone === "string") {
    cleaned.phone = cleaned.phone.replace(/[^\d]/g, "");
  }

  return cleaned;
}
