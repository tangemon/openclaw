// Narrow plugin-sdk surface for the bundled data-extractor plugin.
// Keep this list additive and scoped to symbols used under extensions/data-extractor.

export { definePluginEntry } from "./plugin-entry.js";
export { simpleLlmCall } from "../agents/simple-llm-call.js";
export type { OpenClawPluginApi } from "../plugins/types.js";
