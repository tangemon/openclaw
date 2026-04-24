import type { OpenClawPluginApi } from "openclaw/plugin-sdk/data-extractor";
import type { DataExtractorConfig } from "./config.js";
import { DatabaseManager } from "./database/operations.js";
import { DataExtractorState } from "./state.js";
import { CONTACT_SCHEMA, PRODUCT_SCHEMA, ADDRESS_SCHEMA } from "./types/index.js";
import { callLLMForExtraction } from "./utils/llm-helper.js";

interface DataExtractionEvent {
  text: string;
  schema: any;
  tableName?: string;
  extractionRules?: string;
  confidence?: number;
  provider?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

interface DataExtractionResult {
  success: boolean;
  data?: any;
  metadata?: any;
  storageResult?: any;
  error?: string;
}

export class DataExtractorService {
  private api: OpenClawPluginApi;
  private config: DataExtractorConfig;
  private state: DataExtractorState;
  private db: DatabaseManager;
  private hookRegistered: boolean = true;

  constructor(api: OpenClawPluginApi) {
    this.api = api;
    this.config = this.loadConfig();
    this.state = new DataExtractorState();
    this.db = new DatabaseManager(api);
  }

  private getModelConfig(): { provider: string; model: string } {
    // 获取模型配置逻辑
    return {
      provider: this.config.defaultProvider || "openai",
      model: this.config.defaultModel || "gpt-4",
    };
  }

  private loadConfig(): DataExtractorConfig {
    const pluginConfig = (this.api.pluginConfig || {}) as Partial<DataExtractorConfig>;
    return {
      enabled: pluginConfig.enabled ?? true,
      databasePath: pluginConfig.databasePath || "~/.openclaw/data/data-extractor-data",
      maxEntries: pluginConfig.maxEntries || 10000,
      autoValidate: pluginConfig.autoValidate ?? true,
      defaultConfidence: pluginConfig.defaultConfidence ?? 0.7,
      defaultProvider: pluginConfig.defaultProvider,
      defaultModel: pluginConfig.defaultModel,
      allowedModels: pluginConfig.allowedModels || [],
      maxTokens: pluginConfig.maxTokens || 2000,
      timeoutMs: pluginConfig.timeoutMs || 30000,
      debugMode: pluginConfig.debugMode ?? false,
      fallbackToOriginal: pluginConfig.fallbackToOriginal ?? true,
    };
  }

  async handleDataExtraction(event: DataExtractionEvent): Promise<DataExtractionResult> {
    const startTime = Date.now();

    try {
      this.log(`开始数据提取: ${event.tableName || "default"}`);

      // 1. 构建智能提取prompt
      const systemPrompt = this.buildSystemPrompt();
      const prompt = this.buildExtractionPrompt(event);
      this.log(
        `Prompt构建完成，systemPrompt长度: ${systemPrompt.length}, prompt长度: ${prompt.length}`,
      );

      // 2. 使用LLM进行数据提取
      const llmResult = await callLLMForExtraction(this.api, {
        prompt,
        systemPrompt,
        schema: event.schema,
        provider: event.provider,
        model: event.model,
        temperature: event.temperature,
        maxTokens: event.maxTokens,
      });
      this.log(`LLM调用完成: ${JSON.stringify(llmResult)}`);

      // 3. 验证和后处理
      const extractedData = await this.validateAndProcess(llmResult, event);
      this.log(`数据处理完成: ${JSON.stringify(extractedData)}`);

      // 确保数据有效性
      if (!extractedData || typeof extractedData !== "object") {
        throw new Error("数据提取结果无效");
      }

      // 4. 存储到数据库
      const storageResult = await this.db.store(
        event.tableName || "extractions",
        extractedData.data || {},
        extractedData.metadata || {},
      );
      this.log(`数据库存储完成: ${JSON.stringify(storageResult)}`);

      // 记录统计信息
      const processingTime = Date.now() - startTime;
      await this.state.recordUsage(processingTime, true, extractedData.metadata?.confidence);
      await this.state.incrementDataEntries();

      return {
        success: true,
        data: extractedData.data,
        metadata: extractedData.metadata,
        storageResult,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      await this.state.recordUsage(processingTime, false);

      this.log(`数据提取失败: ${error instanceof Error ? error.message : String(error)}`);

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async handleCommand(args: string[]): Promise<void> {
    const command = args[0];

    switch (command) {
      case "status":
        await this.showStatus();
        break;
      case "config":
        await this.showConfig();
        break;
      case "test":
        await this.testExtraction(args.slice(1));
        break;
      case "contact":
        await this.extractWithPredefinedSchema("contact", args.slice(1));
        break;
      case "product":
        await this.extractWithPredefinedSchema("product", args.slice(1));
        break;
      case "address":
        await this.extractWithPredefinedSchema("address", args.slice(1));
        break;
      case "reset-stats":
        await this.resetStats();
        break;
      default:
        this.showHelp();
    }
  }

  private async showStatus(): Promise<void> {
    const stats = await this.state.getStats();

    console.log("=== Data Extractor Status ===");
    console.log(`Enabled: ${this.config.enabled}`);
    console.log(`Total extractions: ${stats.totalExtractions}`);
    console.log(`Success rate: ${(stats.successRate * 100).toFixed(1)}%`);
    console.log(`Average processing time: ${stats.averageProcessingTime.toFixed(0)}ms`);
    console.log(`Total data entries: ${stats.totalDataEntries}`);
    console.log(`Average confidence: ${stats.averageConfidence.toFixed(2)}`);
    console.log(`Last used: ${stats.lastUsed || "Never"}`);
  }

  private async showConfig(): Promise<void> {
    console.log("=== Data Extractor Configuration ===");
    console.log(`Database path: ${this.config.databasePath}`);
    console.log(`Max entries: ${this.config.maxEntries}`);
    console.log(`Auto validate: ${this.config.autoValidate}`);
    console.log(`Default confidence: ${this.config.defaultConfidence}`);
    console.log(`Default provider: ${this.config.defaultProvider || "OpenClaw global"}`);
    console.log(`Default model: ${this.config.defaultModel || "OpenClaw global"}`);
    console.log(`Max tokens: ${this.config.maxTokens}`);
    console.log(`Timeout: ${this.config.timeoutMs}ms`);
    console.log(`Debug mode: ${this.config.debugMode}`);
    console.log(`Fallback to original: ${this.config.fallbackToOriginal}`);
  }

  private async testExtraction(args: string[]): Promise<void> {
    if (args.length < 2) {
      console.log("用法: data-extractor test <text> <schema>");
      return;
    }

    const text = args[0];
    const schemaStr = args[1];

    try {
      const schema = JSON.parse(schemaStr);
      const result = await this.handleDataExtraction({
        text,
        schema,
        tableName: "test",
      });

      if (result.success) {
        console.log("✅ 测试成功!");
        console.log("提取结果:", JSON.stringify(result.data, null, 2));
      } else {
        console.log("❌ 测试失败:", result.error);
      }
    } catch (error) {
      console.log("❌ 测试失败:", error instanceof Error ? error.message : String(error));
    }
  }

  private async extractWithPredefinedSchema(type: string, args: string[]): Promise<void> {
    if (args.length === 0) {
      console.log(`用法: data-extractor ${type} <text>`);
      return;
    }

    const text = args.join(" ");
    let schema: any;
    let tableName: string;

    // 根据类型选择schema
    switch (type.toLowerCase()) {
      case "contact":
        schema = CONTACT_SCHEMA;
        tableName = "contacts";
        break;
      case "product":
        schema = PRODUCT_SCHEMA;
        tableName = "products";
        break;
      case "address":
        schema = ADDRESS_SCHEMA;
        tableName = "addresses";
        break;
      default:
        console.log(`未知的数据类型：${type}`);
        return;
    }

    try {
      const result = await this.handleDataExtraction({
        text,
        schema,
        tableName,
      });

      if (result.success) {
        console.log(`✅ ${type}信息提取成功!`);
        console.log("提取结果:", JSON.stringify(result.data, null, 2));
      } else {
        console.log(`❌ ${type}信息提取失败:`, result.error);
      }
    } catch (error) {
      console.log(
        `❌ ${type}信息提取失败:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async resetStats(): Promise<void> {
    await this.state.resetStats();
    console.log("统计信息已重置");
  }

  private showHelp(): void {
    console.log("Data Extractor Plugin Commands:");
    console.log("  data-extractor status       - 查看插件状态");
    console.log("  data-extractor config       - 显示当前配置");
    console.log("  data-extractor test <text> <schema> - 测试数据提取");
    console.log("  data-extractor contact <text> - 提取联系人信息");
    console.log("  data-extractor product <text> - 提取产品信息");
    console.log("  data-extractor address <text> - 提取地址信息");
    console.log("  data-extractor reset-stats  - 重置统计信息");
    console.log("");
    console.log("示例:");
    console.log(
      '  data-extractor contact "张三在阿里巴巴工作，邮箱zhangsan@alibaba.com，电话13800138000"',
    );
    console.log('  data-extractor product "iPhone 15 Pro 售价7999元，是苹果公司的旗舰产品"');
    console.log('  data-extractor address "北京市朝阳区建国门外大街1号国贸大厦"');
  }

  private buildSystemPrompt(): string {
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

  private buildExtractionPrompt(event: DataExtractionEvent): string {
    const { text, schema, extractionRules, confidence } = event;

    return `**提取目标：**
- 文本内容：${text}
- 期望数据结构：${JSON.stringify(schema, null, 2)}
${extractionRules ? `- 自定义规则：${extractionRules}` : ""}
${confidence ? `- 最低置信度：${confidence}` : ""}`;
  }

  private async validateAndProcess(llmResult: any, event: DataExtractionEvent) {
    const { confidence, extractionRules } = event;

    // 检查返回格式
    this.log(`验证LLM返回格式: ${JSON.stringify(llmResult)}`);

    if (!llmResult || typeof llmResult !== "object") {
      throw new Error("LLM返回结果无效");
    }

    // 检查是否有extracted_data字段
    if (!llmResult.extracted_data) {
      this.log(`LLM返回的字段: ${Object.keys(llmResult).join(", ")}`);

      // 如果LLM直接返回了数据（而不是包装在extracted_data中），尝试处理
      if (
        llmResult.name ||
        llmResult.email ||
        llmResult.phone ||
        llmResult.company ||
        llmResult.role
      ) {
        this.log(`检测到直接返回的数据格式，自动包装`);
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
        this.log(`检测到数组格式返回`);
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
      processedData = await this.applyCustomRules(processedData, extractionRules);
    }

    // 数据清洗和标准化
    processedData = await this.cleanAndNormalize(processedData);

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

  private async applyCustomRules(data: any, rules: string): Promise<any> {
    // 这里可以实现自定义规则的逻辑
    // 例如：数据转换、字段映射、值验证等
    // 目前作为占位符实现
    return data;
  }

  private async cleanAndNormalize(data: any): Promise<any> {
    // 数据清洗和标准化逻辑
    if (!data) {
      return data;
    }

    // 如果是数组，对每个元素进行清洗
    if (Array.isArray(data)) {
      const cleanedArray = [];
      for (const item of data) {
        cleanedArray.push(await this.cleanAndNormalize(item));
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

  private log(message: string): void {
    if (this.config.debugMode) {
      console.log(`[DataExtractor] ${message}`);
    }
  }
}
