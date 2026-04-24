// Narrow plugin-sdk surface for the bundled loop-warning plugin.
// Keep this list additive and scoped to symbols used under extensions/loop-warning.

export { definePluginEntry } from "./plugin-entry.js";
export { simpleLlmCall } from "../agents/simple-llm-call.js";
export {
  getDiagnosticSessionState,
  diagnosticSessionStates,
  type SessionRef,
  type SessionState,
  type ToolCallRecord,
} from "../logging/diagnostic-session-state.js";
export type { OpenClawPluginApi } from "../plugins/types.js";
export type { OpenClawConfig } from "../config/config.js";
export type { AgentMessage } from "@mariozechner/pi-agent-core";
export type {
  PluginHookBeforeMessageWriteEvent,
  PluginHookBeforeMessageWriteResult,
  PluginHookToolResultPersistEvent,
  PluginHookToolResultPersistResult,
  PluginHookToolResultPersistContext,
} from "../plugins/types.js";
