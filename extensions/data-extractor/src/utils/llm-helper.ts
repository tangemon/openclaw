import Ajv from "ajv";

const AjvCtor = Ajv as unknown as typeof import("ajv").default;
import { simpleLlmCall, type OpenClawPluginApi } from "openclaw/plugin-sdk/data-extractor";

// 复制 llm-task-tool.ts 中的工具函数
function stripCodeFences(s: string): string {
  const trimmed = s.trim();
  // 支持 ```json ... ``` 和 ``` ... ``` 格式
  const m = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (m) {
    return (m[1] ?? "").trim();
  }
  return trimmed;
}

// 从文本中提取JSON - 尝试找到JSON对象或数组
function extractJson(s: string): string {
  const trimmed = s.trim();
  // 尝试直接解析
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    // 不是直接有效的JSON
  }
  // 尝试提取 ``` 块内的内容
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch) {
    return (codeBlockMatch[1] ?? "").trim();
  }
  // 尝试找到第一个 { 或 [ 到最后一个 } 或 ] 的内容
  const firstBrace = trimmed.indexOf("{");
  const firstBracket = trimmed.indexOf("[");
  let start = -1;
  if (firstBrace >= 0 && firstBracket >= 0) {
    start = Math.min(firstBrace, firstBracket);
  } else if (firstBrace >= 0) {
    start = firstBrace;
  } else if (firstBracket >= 0) {
    start = firstBracket;
  }
  if (start >= 0) {
    let end = -1;
    if (trimmed[start] === "{") {
      // 找到对应的 }
      let depth = 0;
      for (let i = start; i < trimmed.length; i++) {
        if (trimmed[i] === "{") depth++;
        else if (trimmed[i] === "}") depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    } else if (trimmed[start] === "[") {
      // 找到对应的 ]
      let depth = 0;
      for (let i = start; i < trimmed.length; i++) {
        if (trimmed[i] === "[") depth++;
        else if (trimmed[i] === "]") depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end >= 0) {
      const jsonStr = trimmed.substring(start, end + 1);
      try {
        JSON.parse(jsonStr);
        return jsonStr;
      } catch {
        // 不是有效JSON
      }
    }
  }
  return trimmed;
}

// 过滤掉 thinking 块 (Anthropic thinking 格式)
function stripThinkingBlocks(s: string): string {
  // 匹配 "<think>...</think>" 块并替换为空格
  // 使用 (.|[\r\n])*? 来匹配任意字符（包括换行）
  const regex = new RegExp("<think>[\\s\\S]*?</think>", "gi");
  return s.replace(regex, " ").trim();
}

function toModelKey(provider?: string, model?: string): string | undefined {
  const p = provider?.trim();
  const m = model?.trim();
  if (!p || !m) {
    return undefined;
  }
  return `${p}/${m}`;
}

type PluginCfg = {
  defaultProvider?: string;
  defaultModel?: string;
  defaultAuthProfileId?: string;
  allowedModels?: string[];
  maxTokens?: number;
  timeoutMs?: number;
};

export interface LlmExtractionParams {
  prompt: string;
  systemPrompt?: string;
  schema?: any;
  provider?: string;
  model?: string;
  authProfileId?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export async function callLLMForExtraction(
  api: OpenClawPluginApi,
  params: LlmExtractionParams,
): Promise<any> {
  const pluginCfg = (api.pluginConfig ?? {}) as PluginCfg;

  // 获取OpenClaw全局默认模型
  const defaultsModel = api.config?.agents?.defaults?.model;
  const primary =
    typeof defaultsModel === "string"
      ? defaultsModel.trim()
      : (defaultsModel?.primary?.trim() ?? undefined);
  const primaryProvider = typeof primary === "string" ? primary.split("/")[0] : undefined;
  const primaryModel =
    typeof primary === "string" ? primary.split("/").slice(1).join("/") : undefined;

  // 按优先级选择模型
  const provider =
    (typeof params.provider === "string" && params.provider.trim()) ||
    (typeof pluginCfg.defaultProvider === "string" && pluginCfg.defaultProvider.trim()) ||
    primaryProvider ||
    undefined;

  const model =
    (typeof params.model === "string" && params.model.trim()) ||
    (typeof pluginCfg.defaultModel === "string" && pluginCfg.defaultModel.trim()) ||
    primaryModel ||
    undefined;

  const modelKey = toModelKey(provider, model);
  if (!provider || !model || !modelKey) {
    throw new Error(
      `无法解析provider/model (provider=${String(provider ?? "")}, model=${String(model ?? "")})`,
    );
  }

  // 检查允许的模型列表
  const allowed = Array.isArray(pluginCfg.allowedModels) ? pluginCfg.allowedModels : undefined;
  if (allowed && allowed.length > 0 && !allowed.includes(modelKey)) {
    throw new Error(
      `模型不被data-extractor插件配置允许: ${modelKey}. 允许的模型: ${allowed.join(", ")}`,
    );
  }

  // 获取认证配置
  const authProfileId =
    (typeof params.authProfileId === "string" && params.authProfileId.trim()) ||
    (typeof pluginCfg.defaultAuthProfileId === "string" && pluginCfg.defaultAuthProfileId.trim()) ||
    undefined;

  // 获取流参数
  const temperature = typeof params.temperature === "number" ? params.temperature : 0.1;
  const maxTokens =
    typeof params.maxTokens === "number"
      ? params.maxTokens
      : typeof pluginCfg.maxTokens === "number"
        ? pluginCfg.maxTokens
        : 2000;

  console.log(`[DataExtractor] temperature: ${temperature}, maxTokens: ${maxTokens}`);
  console.log(`[DataExtractor] provider: ${provider}, model: ${model}`);
  console.log(`[DataExtractor] authProfileId: ${authProfileId}`);

  // 调用LLM（使用简单的单次调用）
  const result = await simpleLlmCall({
    provider,
    model,
    prompt: params.prompt,
    systemPrompt: params.systemPrompt,
    config: api.config ?? {},
    authProfileId,
    temperature,
    maxTokens,
    thinkingLevel: "off",
  });

  // 处理结果
  console.log(`[DataExtractor] LLM文本输出: ${result.text}`);

  if (!result.text) {
    throw new Error("LLM返回空输出");
  }

  const raw = stripThinkingBlocks(stripCodeFences(result.text));
  console.log(`[DataExtractor] 清理后的JSON: ${raw}`);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
    console.log(`[DataExtractor] 解析后的JSON: ${JSON.stringify(parsed)}`);
  } catch (e) {
    // JSON解析失败，尝试从文本中提取JSON
    console.log(`[DataExtractor] JSON解析失败，尝试提取: ${e}`);
    const extracted = extractJson(result.text);
    console.log(`[DataExtractor] 提取的JSON: ${extracted}`);
    try {
      parsed = JSON.parse(extracted);
      console.log(`[DataExtractor] 提取后解析成功: ${JSON.stringify(parsed)}`);
    } catch (e2) {
      console.log(`[DataExtractor] JSON提取失败: ${e2}`);
      throw new Error("LLM返回无效JSON");
    }
  }

  // 验证schema - 只验证extracted_data部分
  if (params.schema && typeof params.schema === "object") {
    // 检查返回格式，提取extracted_data进行验证
    let dataToValidate = parsed;
    if (parsed && typeof parsed === "object" && "extracted_data" in parsed) {
      dataToValidate = (parsed as any).extracted_data;
    }

    const ajv = new AjvCtor({ allErrors: true, strict: false });

    // 添加email格式验证支持
    ajv.addFormat("email", /^[^\s@]+@[^\s@]+\.[^\s@]+$/);

    const validate = ajv.compile(params.schema);

    // 如果extracted_data是数组，验证每个元素
    if (Array.isArray(dataToValidate)) {
      for (let i = 0; i < dataToValidate.length; i++) {
        const ok = validate(dataToValidate[i]);
        if (!ok) {
          const msg =
            validate.errors
              ?.map(
                (e: { instancePath?: string; message?: string }) =>
                  `${e.instancePath || `<root>[${i}]`} ${e.message || "invalid"}`,
              )
              .join("; ") ?? "invalid";
          throw new Error(`LLM JSON不符合schema: ${msg}`);
        }
      }
    } else {
      // 如果是单个对象，直接验证
      const ok = validate(dataToValidate);
      if (!ok) {
        const msg =
          validate.errors
            ?.map(
              (e: { instancePath?: string; message?: string }) =>
                `${e.instancePath || "<root>"} ${e.message || "invalid"}`,
            )
            .join("; ") ?? "invalid";
        throw new Error(`LLM JSON不符合schema: ${msg}`);
      }
    }
  }

  return parsed;
}
