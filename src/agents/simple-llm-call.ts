import { Agent } from "@mariozechner/pi-agent-core";
import type { Model, Api } from "@mariozechner/pi-ai";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { resolveOpenClawAgentDir } from "./agent-paths.js";
import { ensureAuthProfileStore, getApiKeyForModel } from "./model-auth.js";
import { ensureOpenClawModelsJson } from "./models-config.js";
import { resolveModel } from "./pi-embedded-runner/model.js";

export interface SimpleLlmCallParams {
  provider: string;
  model: string;
  prompt: string;
  systemPrompt?: string;
  config?: OpenClawConfig;
  authProfileId?: string;
  temperature?: number;
  maxTokens?: number;
  thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
}

export interface SimpleLlmCallResult {
  text: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

/**
 * Simple single-shot LLM call for plugins.
 * Uses pi-agent-core native API instead of runEmbeddedPiAgent.
 */
export async function simpleLlmCall(params: SimpleLlmCallParams): Promise<SimpleLlmCallResult> {
  const {
    provider,
    model,
    prompt,
    systemPrompt,
    config = {},
    authProfileId,
    temperature = 0.1,
    maxTokens = 2000,
    thinkingLevel = "off",
  } = params;

  const agentDir = resolveOpenClawAgentDir();
  await ensureOpenClawModelsJson(config as OpenClawConfig, agentDir);

  // Resolve model
  const { model: resolvedModel } = resolveModel(
    provider,
    model,
    agentDir,
    config as OpenClawConfig,
  );

  if (!resolvedModel) {
    throw new Error(`Model not found: ${provider}/${model}`);
  }

  // Get API key
  const auth = await getApiKeyForModel({
    model: resolvedModel as Model<Api>,
    cfg: config as OpenClawConfig,
    profileId: authProfileId,
    store: ensureAuthProfileStore(agentDir, { allowKeychainPrompt: false }),
    agentDir,
  });

  if (!auth.apiKey) {
    throw new Error(`No API key found for provider: ${provider}`);
  }

  // Create Agent with the resolved model
  const agent = new Agent({
    initialState: {
      systemPrompt: systemPrompt ?? "You are a helpful assistant that responds in JSON format.",
      model: resolvedModel as Model<Api>,
      thinkingLevel,
    },
    // Pass API key via getApiKey callback
    getApiKey: async () => auth.apiKey,
  });

  // Collect the response
  let fullText = "";
  let usage: SimpleLlmCallResult["usage"] | undefined;

  agent.subscribe((event) => {
    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      fullText += event.assistantMessageEvent.delta;
    }
    if (event.type === "agent_end") {
      // Extract usage if available
      const messages = event.messages;
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && "usage" in lastMsg) {
        usage = (lastMsg as any).usage;
      }
    }
  });

  // Execute with stream params
  await agent.prompt(prompt);

  return {
    text: fullText,
    usage,
  };
}
