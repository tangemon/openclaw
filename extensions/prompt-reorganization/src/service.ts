import { promises as fs } from "node:fs";
import * as os from "node:os";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { simpleLlmCall, type OpenClawPluginApi } from "openclaw/plugin-sdk/prompt-reorganization";
import type { PromptReorganizationConfig } from "./config.js";
import { PromptReorganizationState } from "./state.js";

// Footer message (shared constant)
const FOOTER_MESSAGE = `
**IMPORTANT RULE:**
- If exactly one skill clearly applies: read its SKILL.md at <location> with \`read\`, then follow it.
- If multiple could apply: choose the most specific one, then read/follow it.
- If none clearly apply: do not read any SKILL.md.
**NEVER FORGET**: If existing skills are insufficient to complete the user's task, then use \`search-skills\` skill to search for high-quality external skills. Only consider using coding if the search results are empty.`;

interface BeforePromptBuildResult {
  prependContext?: string;
}

// Standard Hook type definition
interface BeforePromptBuildEvent {
  prompt: string;
  messages: unknown[];
}

// Logger placeholder
const log = {
  warn: (message: string) => console.warn(`[WARN] ${message}`),
  debug: (message: string) => console.debug(`[DEBUG] ${message}`),
};

interface IntentAnalysisResult {
  hasTaskIntent: boolean;
  shouldReorganize: boolean;
  currentIntent: string;
  reasoning: string;
}

// Reorganization result type
interface ReorganizationResult {
  content: string;
  hasSkills: boolean;
}

export interface PromptReorganizationEvent {
  originalPrompt: string;
  sessionMessages: unknown[];
  sessionId?: string;
  runId?: string;
  workspaceDir?: string;
  model?: any;
  authStorage?: any;
  modelRegistry?: any;
}

export interface PromptReorganizationResult {
  reorganizedPrompt?: string;
  metadata?: {
    skillsUsed: string[];
    confidence: number;
    processingTime: number;
    originalPromptLength: number;
    reorganizedPromptLength: number;
  };
}

export class PromptReorganizationService {
  private api: OpenClawPluginApi;
  private config: PromptReorganizationConfig;
  private state: PromptReorganizationState;
  private hookRegistered: boolean = true; // 跟踪hook注册状态

  constructor(api: OpenClawPluginApi) {
    this.api = api;
    this.config = this.loadConfig();
    this.state = new PromptReorganizationState();
  }

  /**
   * 从 OpenClaw 全局配置获取默认模型信息
   */
  private getModelConfig(): { provider: string; model: string } {
    // 查找有 API key 的 provider
    const authConfig = this.api.config?.auth;
    const modelsConfig = this.api.config?.models;

    // 查找第一个有 API key 的 provider
    if (authConfig && typeof authConfig === "object") {
      for (const [providerKey, providerData] of Object.entries(authConfig)) {
        if (providerData && typeof providerData === "object" && "apiKey" in providerData) {
          const apiKey = (providerData as { apiKey?: string }).apiKey;
          if (apiKey) {
            console.log(
              `🔍 [PromptReorganization] Using provider: ${providerKey} from auth config`,
            );

            // 尝试找对应的 model
            const modelKey = Object.keys(modelsConfig || {}).find((k) =>
              k.startsWith(providerKey + "/"),
            );
            if (modelKey) {
              const model = modelKey.substring(providerKey.length + 1);
              return { provider: providerKey, model };
            }

            // 没有找到对应 model，使用 provider 名称作为 model
            return { provider: providerKey, model: "default" };
          }
        }
      }
    }

    const defaultsModel = this.api.config?.agents?.defaults?.model;

    let primary: string | undefined;

    if (typeof defaultsModel === "string") {
      primary = defaultsModel.trim();
    } else if (defaultsModel?.primary) {
      primary = defaultsModel.primary.trim();
    }

    if (primary) {
      // 解析 provider/model 格式：provider/model 或 custom-provider-name/model
      // 找到第一个 / 的位置来分割
      const slashIndex = primary.indexOf("/");
      if (slashIndex > 0) {
        const provider = primary.substring(0, slashIndex);
        const model = primary.substring(slashIndex + 1);
        return { provider, model };
      }
    }

    // Fallback: 从可用模型列表中获取第一个
    const availableModels = this.api.config?.agents?.defaults?.models;
    if (availableModels) {
      const modelKeys = Object.keys(availableModels);
      if (modelKeys.length > 0) {
        const firstModelKey = modelKeys[0];
        const slashIndex = firstModelKey.indexOf("/");
        if (slashIndex > 0) {
          const provider = firstModelKey.substring(0, slashIndex);
          const model = firstModelKey.substring(slashIndex + 1);
          console.log(
            `🔍 [PromptReorganization] Fallback to first available model: provider=${provider}, model=${model}`,
          );
          return { provider, model };
        }
      }
    }

    // 最终默认值
    console.log(`🔍 [PromptReorganization] Using default model`);
    return { provider: "anthropic", model: "claude-sonnet-4-20250514" };
  }

  private loadConfig(): PromptReorganizationConfig {
    // 从插件配置中加载配置
    const pluginConfig = (this.api.pluginConfig || {}) as Partial<PromptReorganizationConfig>;
    return {
      enabled: pluginConfig.enabled ?? true,
      confidenceThreshold: pluginConfig.confidenceThreshold ?? 0.7,
      maxSkills: pluginConfig.maxSkills ?? 10,
      timeoutMs: pluginConfig.timeoutMs ?? 5000,
      customPrompt: pluginConfig.customPrompt,
      debugMode: pluginConfig.debugMode ?? false,
      fallbackToOriginal: pluginConfig.fallbackToOriginal ?? true,
    };
  }

  /**
   * before_prompt_build hook handler
   * 智能分析用户输入并推荐相关技能
   */
  async handleBeforePromptBuild(
    event: BeforePromptBuildEvent,
    ctx: any,
  ): Promise<BeforePromptBuildResult | void> {
    const startTime = Date.now();
    const prompt = typeof event.prompt === "string" ? event.prompt : String(event.prompt);
    const messages = event.messages || [];

    console.log(`🔄 [PromptReorganization] before_prompt_build hook triggered`);
    console.log(`📝 [PromptReorganization] Original prompt length: ${prompt.length} chars`);

    // 加载技能库
    const skillLibrary = await this.loadSkillLibrary();
    console.log(`🧠 [PromptReorganization] Available skills: ${skillLibrary.length}`);

    try {
      // 检查功能是否启用
      if (!this.config.enabled) {
        console.log(`⚠️ [PromptReorganization] Feature is disabled, skipping reorganization`);
        return;
      }

      // 检查hook是否注册
      if (!this.hookRegistered) {
        console.log(
          `🚫 [PromptReorganization] Hook registration is disabled, skipping reorganization`,
        );
        return;
      }

      // 构建事件对象用于 reorganizePrompt
      const reorganizationEvent: PromptReorganizationEvent = {
        originalPrompt: prompt,
        sessionMessages: messages,
        sessionId: ctx?.sessionId || "",
        runId: ctx?.runId || "",
        workspaceDir: ctx?.workspaceDir || "",
        model: ctx?.model,
        authStorage: ctx?.authStorage,
        modelRegistry: ctx?.modelRegistry,
      };

      // 执行 skill 推荐
      const reorganizeResult = await this.reorganizePrompt(reorganizationEvent, skillLibrary);

      // 如果返回的是原始 prompt（未改动），说明跳过了推荐，直接返回空
      if (reorganizeResult.content === prompt) {
        console.log(`⏭️ [PromptReorganization] Skipped (intent check), returning empty result`);
        await this.state.recordUsage(Date.now() - startTime, true);
        return; // 返回 undefined，不修改 prompt
      }

      // 构建最终结果（如果有匹配技能或无匹配时使用默认 search-skills）
      const result = this.buildPrependContext(
        reorganizeResult.content,
        reorganizeResult.hasSkills,
        skillLibrary,
      );

      // 记录使用统计
      const processingTime = Date.now() - startTime;
      await this.state.recordUsage(processingTime, true);
      console.log(`✅ [PromptReorganization] Completed successfully in ${processingTime}ms`);
      console.log(
        `📏 [PromptReorganization] Prepend context length: ${result.prependContext?.length ?? 0} chars`,
      );

      return result;
    } catch (error) {
      console.log(`❌ [PromptReorganization] Failed: ${String(error)}`);
      console.log(`⏱️ [PromptReorganization] Failed after ${Date.now() - startTime}ms`);

      // 记录失败统计
      await this.state.recordUsage(Date.now() - startTime, false);

      // 如果配置了回退，则返回undefined让调用方使用原始prompt
      if (this.config.fallbackToOriginal) {
        return;
      }

      throw error;
    }
  }

  /**
   * 判断是否需要执行 skill 推荐
   * 1. 快速规则过滤 - 纯打招呼直接跳过
   * 2. LLM 判断意图变化 - 只有任务目标变化时才推荐
   */
  private async checkIntentAndShouldReorganize(event: PromptReorganizationEvent): Promise<{
    shouldProceed: boolean;
    reason: string;
    intentResult?: IntentAnalysisResult;
  }> {
    // 1. 快速规则过滤 - 检测纯打招呼
    const greetingCheck = this.quickGreetingCheck(event.originalPrompt);
    console.log(`🔍 [PromptReorganization] Greeting check result:`, greetingCheck);
    if (greetingCheck.isGreeting) {
      return {
        shouldProceed: false,
        reason: `Detected greeting: "${greetingCheck.matches.join(", ")}"`,
      };
    }

    // 2. LLM 判断意图变化
    console.log(`🔍 [PromptReorganization] Starting LLM intent analysis...`);
    const intentResult = await this.analyzeIntentWithLLM(event);
    console.log(`🔍 [PromptReorganization] LLM intent result:`, JSON.stringify(intentResult));

    // 3. 根据 LLM 判断结果决定是否继续
    if (!intentResult.hasTaskIntent) {
      return {
        shouldProceed: false,
        reason: `No clear task intent: ${intentResult.reasoning}`,
        intentResult,
      };
    }

    if (!intentResult.shouldReorganize) {
      return {
        shouldProceed: false,
        reason: `Task intent unchanged: ${intentResult.reasoning}`,
        intentResult,
      };
    }

    // 需要执行 skill 推荐
    return {
      shouldProceed: true,
      reason: "Task intent changed or new session",
      intentResult,
    };
  }

  /**
   * 从 originalPrompt 中提取实际的用户消息内容
   * 格式通常是：Sender (untrusted metadata): {...}\n\n[时间戳] 消息内容
   */
  private extractUserMessage(prompt: string): string {
    // 尝试匹配 [时间戳] 之后的实际消息内容
    // 常见格式: [Thu 2026-03-19 14:17 GMT+8] 你好
    const timestampMatch = prompt.match(/\]\s*(.+)$/s);
    if (timestampMatch) {
      return timestampMatch[1].trim();
    }

    // 如果没有时间戳，尝试找最后的消息部分（去掉 sender 元数据）
    const senderMatch = prompt.match(/sender\s*\([^)]+\):\s*```json[\s\S]*?```\s*\n\n?/i);
    if (senderMatch) {
      return prompt.replace(senderMatch[0], "").trim();
    }

    // 返回原始内容
    return prompt;
  }

  /**
   * 快速规则过滤 - 检测纯打招呼（不含任务内容）
   */
  private quickGreetingCheck(prompt: string): { isGreeting: boolean; matches: string[] } {
    // 先提取实际的用户消息内容
    const userMessage = this.extractUserMessage(prompt);
    const trimmed = userMessage.trim().toLowerCase();

    const greetings = [
      "hi",
      "hello",
      "你好",
      "嗨",
      "hey",
      "您好",
      "yo",
      "heyya",
      "hi there",
      "greetings",
      "good morning",
      "good afternoon",
      "good evening",
      "早上好",
      "下午好",
      "晚上好",
    ];

    const matches: string[] = [];
    for (const greeting of greetings) {
      if (trimmed === greeting || trimmed === greeting + "!" || trimmed === greeting + ".") {
        matches.push(greeting);
      }
    }

    // 如果只有一个匹配且完全相等，认为是纯打招呼
    if (matches.length > 0 && trimmed === matches[0]) {
      return { isGreeting: true, matches };
    }

    // 检查是否只包含打招呼 + 简单客套话（不超过 30 个字符）
    const simpleGreetings = [
      "hi",
      "hello",
      "你好",
      "嗨",
      "hey",
      "您好",
      "yo",
      "good morning",
      "good afternoon",
      "good evening",
      "早上好",
      "下午好",
      "晚上好",
      "早安",
      "晚安",
    ];
    const isSimpleGreeting =
      trimmed.length <= 30 && simpleGreetings.some((g) => trimmed.startsWith(g));

    return { isGreeting: isSimpleGreeting, matches: isSimpleGreeting ? [trimmed] : [] };
  }

  /**
   * 使用 LLM 分析意图变化
   */
  private async analyzeIntentWithLLM(
    event: PromptReorganizationEvent,
  ): Promise<IntentAnalysisResult> {
    try {
      // 提取最近的用户消息作为历史
      const sessionMessages = event.sessionMessages as AgentMessage[];
      const recentUserMessages = sessionMessages.filter((m) => m.role === "user").slice(-5);

      const historyText = recentUserMessages
        .map((m) => {
          let content: string | unknown = m.content;
          // 字符串类型
          if (typeof content === "string") return content;
          // 数组类型（常见格式：[ { text: "..." } ]）
          if (Array.isArray(content)) {
            const textContent = content
              .map((item) => {
                if (typeof item === "string") return item;
                if (item && typeof item === "object" && "text" in item) {
                  return String((item as { text: unknown }).text);
                }
                return "";
              })
              .filter(Boolean)
              .join("");
            return textContent;
          }
          // 对象类型
          if (content && typeof content === "object" && "text" in content) {
            return this.extractUserMessage(String((content as { text: unknown }).text));
          }
          // 提取实际用户消息，去掉 sender 元数据和时间戳
          return this.extractUserMessage(String(content || ""));
        })
        .filter(Boolean)
        .join("\n---\n");

      const analysisPrompt = `Analyze the user's current request in context of the conversation history.

## History (recent user messages, latest first):
${historyText || "(new session, no history)"}

## Current User Message:
${event.originalPrompt}

Analyze and respond in JSON format with 4 fields:
{
  "hasTaskIntent": boolean,    // 当前消息是否有明确的新任务？（不只是简单回复/打招呼）
  "shouldReorganize": boolean, // 是否需要重新推荐 skill？（任务目标改变时为 true）
  "currentIntent": "简短描述用户当前意图",
  "reasoning": "你的判断理由"
}

## Decision Rules (IMPORTANT):
1. If current message is just greeting (hi/hello/你好/下午好 etc) -> hasTaskIntent=false, shouldReorganize=false
2. If current message is a SHORT REPLY to answer model's question (like "第4封邮件", "第一个", "ok", "yes", "no", "continue") -> shouldReorganize=false (continuing SAME task)
3. If current message is a NEW task different from history -> shouldReorganize=true
4. If current message is ASKING for clarification about current task -> shouldReorganize=false
5. If it's a new session (no meaningful history) -> shouldReorganize=true
6. If current mesage is ASKING again about current task -> shouldReorganize=true

Example scenarios:
- User said "帮我读邮件创建会议", then model asked "哪封邮件?", user replied "第4封" -> shouldReorganize=false (continuing task)
- User said "帮我写代码", then model asked "什么语言?", user replied "python" -> shouldReorganize=false (continuing task)
- User previously asked about X, now asks about completely different Y -> shouldReorganize=true
- User said "帮我收邮件", now asks again "请重新尝试帮我收邮件" -> shouldReorganize=true`;

      const analysisSystemPrompt = `You are a task intent analyzer. Always respond in valid JSON format.`;

      try {
        const modelConfig = this.getModelConfig();
        console.log(
          `🔍 [PromptReorganization] Using simpleLlmCall for intent analysis, model: ${modelConfig.provider}/${modelConfig.model}`,
        );

        // 使用 simpleLlmCall 调用 LLM
        const result = await simpleLlmCall({
          provider: modelConfig.provider,
          model: modelConfig.model,
          prompt: analysisPrompt,
          systemPrompt: analysisSystemPrompt,
          config: this.api.config,
          temperature: 0.3,
          maxTokens: 500,
        });

        const responseText = result.text.trim();

        // 解析 JSON 响应
        if (responseText) {
          // 尝试提取 JSON
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]) as IntentAnalysisResult;
            return parsed;
          }
        }

        // 解析失败时的默认行为
        return {
          hasTaskIntent: true,
          shouldReorganize: true,
          currentIntent: "unknown",
          reasoning: "Failed to parse LLM response, defaulting to proceed",
        };
      } catch (error) {
        console.warn(`⚠️ [PromptReorganization] Intent analysis failed: ${String(error)}`);
        // 意图分析失败时，默认执行推荐（保守策略）
        return {
          hasTaskIntent: true,
          shouldReorganize: true,
          currentIntent: "error",
          reasoning: `Intent analysis error: ${String(error)}, defaulting to proceed`,
        };
      }
    } catch (error) {
      console.error(`❌ [PromptReorganization] analyzeIntentWithLLM failed: ${String(error)}`);
      // 意图分析失败时，返回默认值（不阻止流程）
      return {
        hasTaskIntent: true,
        shouldReorganize: true,
        currentIntent: "error",
        reasoning: `Function error: ${String(error)}`,
      };
    }
  }

  private async reorganizePrompt(
    event: PromptReorganizationEvent,
    skillLibrary: Array<{ name: string; description: string; location: string }>,
  ): Promise<ReorganizationResult> {
    // 0. 意图分析 - 判断是否需要重新推荐 skill
    const intentCheck = await this.checkIntentAndShouldReorganize(event);
    if (!intentCheck.shouldProceed) {
      console.log(`⏭️ [PromptReorganization] Skipping - ${intentCheck.reason}`);
      return { content: event.originalPrompt, hasSkills: false };
    }

    // 1. 构建重新整理prompt
    console.log(`📝 [PromptReorganization] Building reorganization prompt`);
    const reorganizationPrompt = this.buildReorganizationPrompt(event, skillLibrary);
    const systemPrompt = this.buildSystemPrompt();
    console.log(
      `📏 [PromptReorganization] Reorganization prompt length: ${reorganizationPrompt.length} chars`,
    );

    // 2. 使用 simpleLlmCall 执行重新整理
    try {
      const modelConfig = this.getModelConfig();

      // 调用 LLM - 使用 simpleLlmCall
      const result = await simpleLlmCall({
        provider: modelConfig.provider,
        model: modelConfig.model,
        prompt: reorganizationPrompt,
        systemPrompt: systemPrompt,
        config: this.api.config,
        temperature: 0.3,
        maxTokens: 4096,
      });

      const responseText = result.text.trim();
      console.log(`🔍 [PromptReorganization] LLM response length: ${responseText.length} chars`);

      // 验证结果 - 如果为空或太短，使用默认 skills
      let trimmedContent = responseText.trim();
      const hasSkills = trimmedContent.includes("<skill>");
      if (!trimmedContent || trimmedContent.length < 50 || !hasSkills) {
        console.log(
          `⚠️ [PromptReorganization] LLM returned empty/short/no-skills content, using default skills`,
        );
        trimmedContent = this.buildDefaultSkillsXml(skillLibrary);
        return { content: trimmedContent, hasSkills: true };
      }

      if (!trimmedContent.includes("**IMPORTANT RULE:")) {
        trimmedContent = trimmedContent + FOOTER_MESSAGE;
      }

      console.log(
        `✅ [PromptReorganization] Reorganization executed, result length: ${trimmedContent.length} chars`,
      );

      return { content: trimmedContent, hasSkills: true };
    } catch (error) {
      console.warn(`⚠️ [PromptReorganization] Reorganization failed: ${String(error)}`);

      // 错误时返回基本的技能推荐
      const defaultContent = this.buildDefaultSkillsXml(skillLibrary);
      return { content: defaultContent, hasSkills: true };
    }
  }

  private buildSystemPrompt(): string {
    return `# Role
You are an intelligent task analysis assistant. Your **SOLE** function is to map user tasks to a predefined skill library.

# Critical Constraints (MUST FOLLOW)
- **NO TASK EXECUTION**: Under no circumstances should you attempt to solve, answer, or perform the user's input task. You are an analyzer, not a doer.
- **OUTPUT FORMAT**: Your response must contain **ONLY** a XML-formatted list of skill name, description and location struct.
   - Do not include any introductory text (e.g., "Here are the skills...").
   - Do not include any concluding text (e.g., "I hope this helps...").
   - Do not provide explanations for why you chose these skills.
- **SELECTION CRITERIA**: Select most relevant skills from the provided library based on the user's input. If NONE, return BLANK.

# Workflow
1. Analyze the user's input to understand the intent.
2. Match the intent against the provided skill library.
3. Select the most relevant matches.
4. Output the list or BLANK immediately.

# Few-Shot Examples (Strict Adherence)

User Input: "Help me write a python script to scrape weather data."
Correct Output:

<available_skills>
<skill>
<name>provided skill name</name>
<description>provided skill description</description>
<location>provided skill location</location>
</skill>
...
</available_skills>

(Incorrect Output Example: "Sure! Here are the skills you need for scraping weather data: [...]" -> DO NOT DO THIS)
`;
  }

  private buildReorganizationPrompt(
    event: PromptReorganizationEvent,
    skillLibrary: Array<{ name: string; description: string; location: string }>,
  ): string {
    const skillListText = skillLibrary
      .map(
        (skill, index) =>
          `${index + 1}. <skill><name>${skill.name}</name><description>${skill.description}</description><location>${skill.location}</location></skill>`,
      )
      .join("\n");

    const basePrompt =
      this.config.customPrompt ||
      `# Current Task
Analyze the following user input and output the skill list ONLY:
${event.originalPrompt}

**skill library counts=${skillLibrary.length}, as follows：**
${skillListText}

please start your job.`;

    return basePrompt;
  }

  /**
   * 构建默认 skills XML（当 LLM 返回为空时使用）
   */
  private buildDefaultSkillsXml(
    skillLibrary: Array<{ name: string; description: string; location: string }>,
  ): string {
    const defaultSkillNames = ["search-skills"];
    const defaultSkills = skillLibrary.filter((s) => defaultSkillNames.includes(s.name));

    // 拼装 XML 格式
    const skillsXml = defaultSkills
      .map(
        (skill) => `<skill>
<name>${skill.name}</name>
<description>${skill.description}</description>
<location>${skill.location}</location>
</skill>`,
      )
      .join("\n");

    return `<available_skills>
${skillsXml}
</available_skills>`;
  }

  /**
   * 构建最终的 prependContext 结果
   * 根据是否有匹配技能决定返回推荐技能或默认 search-skills
   */
  private buildPrependContext(
    content: string,
    hasSkills: boolean,
    skillLibrary: Array<{ name: string; description: string; location: string }>,
  ): BeforePromptBuildResult {
    // 如果没有匹配到技能，使用默认的 search-skills
    if (!hasSkills) {
      console.log(
        `⏭️ [PromptReorganization] No matching skills found, using default search-skills`,
      );
      const defaultSkillsXml = this.buildDefaultSkillsXml(skillLibrary);
      content = defaultSkillsXml;
    }

    // 提取 <available_skills> 标签内容
    const skillsMatch = content.match(/<available_skills>[\s\S]*?<\/available_skills>/);

    if (!skillsMatch) {
      throw new Error("Failed to extract skills content");
    }

    const skillsContent = skillsMatch[0].replace(/^<available_skills>|<\/available_skills>$/g, "");
    const finalContent = `<system-reminder><available_skills>${skillsContent}</available_skills>\n${FOOTER_MESSAGE}\n</system-reminder>`;

    return { prependContext: finalContent };
  }

  private extractSkills(content: string): string[] {
    const skillMatches = content.match(/<name>(.*?)<\/name>/g);
    return skillMatches ? skillMatches.map((match) => match.replace(/<\/?name>/g, "")) : [];
  }

  private calculateConfidence(content: string): number {
    const hasStructure = content.includes("<skill>") && content.includes("</skill>");
    const hasContent = content.length > 100;
    const hasFooter = content.includes("**IMPORTANT RULE:");

    let confidence = 0;
    if (hasStructure) confidence += 0.4;
    if (hasContent) confidence += 0.3;
    if (hasFooter) confidence += 0.3;

    return confidence;
  }

  private log(message: string): void {
    try {
      if (this.config.debugMode && this.api.logger?.debug) {
        this.api.logger.debug(`[PromptReorganization] ${message}`);
      }
    } catch (error) {
      // 静默失败，不影响主流程
      if (this.config.debugMode) {
        console.debug(`[PromptReorganization] ${message}`);
      }
    }
  }

  /**
   * 加载技能库信息
   * 从 ~/.openclaw/skill-library 目录读取技能信息
   */
  private async loadSkillLibrary(): Promise<
    Array<{ name: string; description: string; location: string }>
  > {
    const skills: Array<{ name: string; description: string; location: string }> = [];

    try {
      const skillLibraryPath = `${os.homedir()}/.openclaw/skill-library`;

      // 检查skill_library目录是否存在
      try {
        await fs.access(skillLibraryPath);
      } catch (err) {
        this.log(`Skill library directory ${skillLibraryPath} not found: ${String(err)}`);
        return skills;
      }

      // 读取目录内容
      const entries = await fs.readdir(skillLibraryPath, { withFileTypes: true });

      // 遍历所有条目
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillDir = `${skillLibraryPath}/${entry.name}`;

          // 查找skill描述文件（优先使用 .overview.md）
          const readmePath = `${skillDir}/.overview.md`;

          let description = "";
          let skillName = entry.name;

          try {
            // 提取所有内容作为描述
            description = await fs.readFile(readmePath, "utf-8");
          } catch (err) {
            description = `Skill located at ${skillDir}`;
            this.log(`Description not found for skill ${skillName}: ${String(err)}`);
          }

          skills.push({
            name: skillName,
            description: description,
            location: `${skillDir}/SKILL.md`,
          });

          // 限制在200个skill以内
          if (skills.length >= 200) {
            break;
          }
        }
      }

      this.log(`Loaded ${skills.length} skills from skill library`);
      return skills;
    } catch (err) {
      this.log(`Failed to load skill library: ${String(err)}`);
      return skills;
    }
  }

  async handleCommand(args: string[]): Promise<void> {
    // 确保args是数组且元素是字符串
    const safeArgs = (args || []).map((arg) => String(arg || "").trim()).filter(Boolean);
    const subcommand = safeArgs[0];

    switch (subcommand) {
      case "status":
        await this.showStatus();
        break;
      case "config":
        await this.showConfig();
        break;
      case "test":
        await this.testReorganization(safeArgs.slice(1));
        break;
      case "hook":
        await this.handleHookCommand(safeArgs.slice(1));
        break;
      default:
        this.showHelp();
    }
  }

  private async showStatus(): Promise<void> {
    const stats = await this.state.getStats();
    console.log("=== Prompt Reorganization Status ===");
    console.log(`Enabled: ${this.config.enabled}`);
    console.log(`Hook registered: ${this.hookRegistered ? "✅ YES" : "🚫 NO"}`);
    console.log(`Total reorganizations: ${stats.totalReorganizations}`);
    console.log(`Success rate: ${(stats.successRate * 100).toFixed(1)}%`);
    console.log(`Average processing time: ${stats.averageProcessingTime.toFixed(0)}ms`);
    console.log(`Last used: ${stats.lastUsed?.toISOString() || "Never"}`);

    if (!this.hookRegistered) {
      console.log(
        "\n💡 Tip: Use 'openclaw prompt-reorganization hook enable' to enable hook registration",
      );
    }
  }

  private async showConfig(): Promise<void> {
    console.log("=== Prompt Reorganization Config ===");
    console.log(`Enabled: ${this.config.enabled}`);
    console.log(`Confidence threshold: ${this.config.confidenceThreshold}`);
    console.log(`Max skills: ${this.config.maxSkills}`);
    console.log(`Timeout: ${this.config.timeoutMs}ms`);
    console.log(`Debug mode: ${this.config.debugMode}`);
    console.log(`Fallback to original: ${this.config.fallbackToOriginal}`);
  }

  private async testReorganization(args: string[]): Promise<void> {
    if (args.length === 0) {
      console.log("Usage: openclaw prompt-reorganization test <prompt>");
      return;
    }

    // 确保参数是字符串类型
    const testPrompt = args
      .map((arg) => String(arg || "").trim())
      .join(" ")
      .trim();

    if (!testPrompt) {
      console.log("错误: 测试prompt不能为空");
      return;
    }

    console.log(`Testing with prompt: ${testPrompt}`);

    // 这里可以添加测试逻辑
    console.log("Test completed. Check logs for details.");
  }

  private showHelp(): void {
    console.log("=== Prompt Reorganization Commands ===");
    console.log("openclaw prompt-reorganization status  - Show status");
    console.log("openclaw prompt-reorganization config  - Show config");
    console.log("openclaw prompt-reorganization test <prompt>  - Test reorganization");
    console.log("openclaw prompt-reorganization hook enable  - Enable hook registration");
    console.log("openclaw prompt-reorganization hook disable  - Disable hook registration");
    console.log("openclaw prompt-reorganization hook status  - Show hook status");
    console.log("openclaw prompt-reorganization hook list  - List available hook events");
  }

  private async handleHookCommand(args: string[]): Promise<void> {
    const hookSubcommand = args[0];

    switch (hookSubcommand) {
      case "enable":
        await this.enableHook();
        break;
      case "disable":
        await this.disableHook();
        break;
      case "status":
        await this.showHookStatus();
        break;
      case "list":
        await this.listAvailableHooks();
        break;
      default:
        this.showHookHelp();
    }
  }

  private async enableHook(): Promise<void> {
    try {
      this.hookRegistered = true;
      this.log("Hook registration enabled");
      console.log("✅ Prompt reorganization hook is now ENABLED");
      console.log("   The hook will be triggered for prompt reorganization events.");
    } catch (error) {
      console.log(`❌ Failed to enable hook: ${String(error)}`);
    }
  }

  private async disableHook(): Promise<void> {
    try {
      this.hookRegistered = false;
      this.log("Hook registration disabled");
      console.log("🚫 Prompt reorganization hook is now DISABLED");
      console.log("   The hook will NOT be triggered for prompt reorganization events.");
    } catch (error) {
      console.log(`❌ Failed to disable hook: ${String(error)}`);
    }
  }

  private async showHookStatus(): Promise<void> {
    console.log("=== Hook Registration Status ===");
    console.log(`Hook registered: ${this.hookRegistered ? "✅ YES" : "🚫 NO"}`);
    console.log(`Hook event: prompt_reorganization`);
    console.log(`Plugin ID: ${this.api.id}`);
    console.log(`Plugin name: ${this.api.name}`);

    if (this.hookRegistered) {
      console.log("\n📋 Current hook configuration:");
      console.log(`   - Priority: 10`);
      console.log(`   - Event: prompt_reorganization`);
      console.log(`   - Handler: handlePromptReorganization`);
    }
  }

  private async listAvailableHooks(): Promise<void> {
    console.log("=== Available Hook Events ===");
    console.log("The following hook events are supported by OpenClaw:");
    console.log("");

    const availableHooks = [
      { name: "prompt_reorganization", desc: "Called when prompt needs reorganization" },
      { name: "before_model_resolve", desc: "Called before model resolution" },
      { name: "before_prompt_build", desc: "Called before prompt building" },
      { name: "before_agent_start", desc: "Called before agent starts" },
      { name: "llm_input", desc: "Called before LLM input" },
      { name: "llm_output", desc: "Called after LLM output" },
      { name: "agent_end", desc: "Called when agent ends" },
      { name: "message_received", desc: "Called when message is received" },
      { name: "message_sending", desc: "Called when sending message" },
      { name: "before_tool_call", desc: "Called before tool call" },
      { name: "after_tool_call", desc: "Called after tool call" },
      { name: "session_start", desc: "Called when session starts" },
      { name: "session_end", desc: "Called when session ends" },
    ];

    availableHooks.forEach((hook) => {
      const marker = hook.name === "prompt_reorganization" ? "🎯" : "  ";
      console.log(`${marker} ${hook.name.padEnd(25)} - ${hook.desc}`);
    });

    console.log("\n💡 Note: This plugin is currently registered for 'prompt_reorganization' hook");
  }

  private showHookHelp(): void {
    console.log("=== Hook Management Commands ===");
    console.log("openclaw prompt-reorganization hook enable   - Enable hook registration");
    console.log("openclaw prompt-reorganization hook disable  - Disable hook registration");
    console.log("openclaw prompt-reorganization hook status   - Show hook registration status");
    console.log("openclaw prompt-reorganization hook list     - List available hook events");
  }
}
