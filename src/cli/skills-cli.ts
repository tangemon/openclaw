import * as fsSync from "node:fs";
import { createWriteStream } from "node:fs";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { Command } from "commander";
import { extract } from "tar";
import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../agents/agent-scope.js";
import {
  installSkillFromClawHub,
  readTrackedClawHubSkillSlugs,
  searchSkillsFromClawHub,
  updateSkillsFromClawHub,
} from "../agents/skills-clawhub.js";

import { bumpSkillsSnapshotVersion } from "../agents/skills/refresh.js";
import { loadConfig, writeConfigFile } from "../config/config.js";
import type { OpenClawConfig } from "../config/config.js";
import { defaultRuntime } from "../runtime.js";
import { formatDocsLink } from "../terminal/links.js";
import { theme } from "../terminal/theme.js";
import { formatSkillInfo, formatSkillsCheck, formatSkillsList } from "./skills-cli.format.js";

type RunEmbeddedPiAgentFn = (params: Record<string, unknown>) => Promise<unknown>;

async function loadRunEmbeddedPiAgent(): Promise<RunEmbeddedPiAgentFn> {
  defaultRuntime.log("Loading runEmbeddedPiAgent function...");

  // Source checkout (tests/dev)
  try {
    const mod = await import("../agents/pi-embedded-runner.js");
    defaultRuntime.log(`Loaded module, keys: ${Object.keys(mod).join(", ")}`);
    if (typeof (mod as any).runEmbeddedPiAgent === "function") {
      defaultRuntime.log("Found runEmbeddedPiAgent in source module");
      return (mod as any).runEmbeddedPiAgent;
    }
  } catch (err) {
    defaultRuntime.log(`Failed to load from source: ${String(err)}`);
    // ignore
  }

  // Bundled install (built)
  const mod = await import("../agents/pi-embedded-runner.js");
  if (typeof mod.runEmbeddedPiAgent !== "function") {
    throw new Error("Internal error: runEmbeddedPiAgent not available");
  }
  defaultRuntime.log("Found runEmbeddedPiAgent in bundled module");
  return mod.runEmbeddedPiAgent as RunEmbeddedPiAgentFn;
}

export type {
  SkillInfoOptions,
  SkillsCheckOptions,
  SkillsListOptions,
} from "./skills-cli.format.js";
export { formatSkillInfo, formatSkillsCheck, formatSkillsList } from "./skills-cli.format.js";

type SkillStatusReport = Awaited<
  ReturnType<(typeof import("../agents/skills-status.js"))["buildWorkspaceSkillStatus"]>
>;

async function loadSkillsStatusReport(): Promise<SkillStatusReport> {
  const config = loadConfig();
  const workspaceDir = resolveAgentWorkspaceDir(config, resolveDefaultAgentId(config));
  const { buildWorkspaceSkillStatus } = await import("../agents/skills-status.js");
  return buildWorkspaceSkillStatus(workspaceDir, { config });
}

async function runSkillsAction(render: (report: SkillStatusReport) => string): Promise<void> {
  try {
    const report = await loadSkillsStatusReport();
    defaultRuntime.log(render(report));
  } catch (err) {
    defaultRuntime.error(String(err));
    defaultRuntime.exit(1);
  }
}

function resolveActiveWorkspaceDir(): string {
  const config = loadConfig();
  return resolveAgentWorkspaceDir(config, resolveDefaultAgentId(config));
}

async function setSkillEnabled(skillName: string, enabled: boolean): Promise<void> {
  const config = loadConfig();
  const report = await loadSkillsStatusReport();

  // 查找skill
  const skill = report.skills.find((s) => s.name === skillName);
  if (!skill) {
    throw new Error(`Skill "${skillName}" not found`);
  }

  // 检查是否是always类型的skill
  if (skill.always && !enabled) {
    defaultRuntime.log(
      `Warning: Skill "${skillName}" is marked as always-enabled and cannot be disabled`,
    );
    return;
  }

  // 更新配置
  const skillKey = skill.skillKey;
  if (!config.skills) {
    config.skills = {};
  }
  if (!config.skills.entries) {
    config.skills.entries = {};
  }

  if (!config.skills.entries[skillKey]) {
    config.skills.entries[skillKey] = {};
  }

  config.skills.entries[skillKey].enabled = enabled;

  // 写入配置
  await writeConfigFile(config);

  // 强制刷新skills缓存，确保系统提示词立即更新
  const workspaceDir = resolveAgentWorkspaceDir(config, resolveDefaultAgentId(config));
  bumpSkillsSnapshotVersion({ workspaceDir, reason: "manual" });

  // 反馈结果
  const status = enabled ? "enabled" : "disabled";
  defaultRuntime.log(`Skill "${skillName}" has been ${status}`);
}

async function getSkillEnabledState(skillName: string): Promise<boolean> {
  const config = loadConfig();
  const report = await loadSkillsStatusReport();

  const skill = report.skills.find((s) => s.name === skillName);
  if (!skill) {
    throw new Error(`Skill "${skillName}" not found`);
  }

  const skillKey = skill.skillKey;
  const skillConfig = config.skills?.entries?.[skillKey];

  // 如果在配置中明确设置为false，则认为是禁用状态
  if (skillConfig?.enabled === false) {
    return false;
  }

  // 默认启用状态（除非是bundled skill且被allowlist阻止）
  return !skill.disabled && !skill.blockedByAllowlist;
}

/**
 * Register the skills CLI commands
 */
export function registerSkillsCli(program: Command) {
  const skills = program
    .command("skills")
    .description("List and inspect available skills")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/cli/skills", "docs.openclaw.ai/cli/skills")}\n`,
    );

  skills
    .command("search")
    .description("Search ClawHub skills")
    .argument("[query...]", "Optional search query")
    .option("--limit <n>", "Max results", (value) => Number.parseInt(value, 10))
    .option("--json", "Output as JSON", false)
    .action(async (queryParts: string[], opts: { limit?: number; json?: boolean }) => {
      try {
        const results = await searchSkillsFromClawHub({
          query: queryParts.join(" ").trim() || undefined,
          limit: opts.limit,
        });
        if (opts.json) {
          defaultRuntime.writeJson({ results });
          return;
        }
        if (results.length === 0) {
          defaultRuntime.log("No ClawHub skills found.");
          return;
        }
        for (const entry of results) {
          const version = entry.version ? ` v${entry.version}` : "";
          const summary = entry.summary ? `  ${entry.summary}` : "";
          defaultRuntime.log(`${entry.slug}${version}  ${entry.displayName}${summary}`);
        }
      } catch (err) {
        defaultRuntime.error(String(err));
        defaultRuntime.exit(1);
      }
    });

  skills
    .command("install")
    .description("Install a skill from ClawHub into the active workspace")
    .argument("<slug>", "ClawHub skill slug")
    .option("--version <version>", "Install a specific version")
    .option("--force", "Overwrite an existing workspace skill", false)
    .action(async (slug: string, opts: { version?: string; force?: boolean }) => {
      try {
        const workspaceDir = resolveActiveWorkspaceDir();
        const result = await installSkillFromClawHub({
          workspaceDir,
          slug,
          version: opts.version,
          force: Boolean(opts.force),
          logger: {
            info: (message) => defaultRuntime.log(message),
          },
        });
        if (!result.ok) {
          defaultRuntime.error(result.error);
          defaultRuntime.exit(1);
          return;
        }
        defaultRuntime.log(`Installed ${result.slug}@${result.version} -> ${result.targetDir}`);
      } catch (err) {
        defaultRuntime.error(String(err));
        defaultRuntime.exit(1);
      }
    });

  skills
    .command("update")
    .description("Update ClawHub-installed skills in the active workspace")
    .argument("[slug]", "Single skill slug")
    .option("--all", "Update all tracked ClawHub skills", false)
    .action(async (slug: string | undefined, opts: { all?: boolean }) => {
      try {
        if (!slug && !opts.all) {
          defaultRuntime.error("Provide a skill slug or use --all.");
          defaultRuntime.exit(1);
          return;
        }
        if (slug && opts.all) {
          defaultRuntime.error("Use either a skill slug or --all.");
          defaultRuntime.exit(1);
          return;
        }
        const workspaceDir = resolveActiveWorkspaceDir();
        const tracked = await readTrackedClawHubSkillSlugs(workspaceDir);
        if (opts.all && tracked.length === 0) {
          defaultRuntime.log("No tracked ClawHub skills to update.");
          return;
        }
        const results = await updateSkillsFromClawHub({
          workspaceDir,
          slug,
          logger: {
            info: (message) => defaultRuntime.log(message),
          },
        });
        for (const result of results) {
          if (!result.ok) {
            defaultRuntime.error(result.error);
            continue;
          }
          if (result.changed) {
            defaultRuntime.log(
              `Updated ${result.slug}: ${result.previousVersion ?? "unknown"} -> ${result.version}`,
            );
            continue;
          }
          defaultRuntime.log(`${result.slug} already at ${result.version}`);
        }
      } catch (err) {
        defaultRuntime.error(String(err));
        defaultRuntime.exit(1);
      }
    });

  skills
    .command("list")
    .description("List all available skills")
    .option("--json", "Output as JSON", false)
    .option("--eligible", "Show only eligible (ready to use) skills", false)
    .option("-v, --verbose", "Show more details including missing requirements", false)
    .action(async (opts) => {
      await runSkillsAction((report) => formatSkillsList(report, opts));
    });

  skills
    .command("info")
    .description("Show detailed information about a skill")
    .argument("<name>", "Skill name")
    .option("--json", "Output as JSON", false)
    .action(async (name, opts) => {
      await runSkillsAction((report) => formatSkillInfo(report, name, opts));
    });

  skills
    .command("check")
    .description("Check which skills are ready vs missing requirements")
    .option("--json", "Output as JSON", false)
    .action(async (opts) => {
      await runSkillsAction((report) => formatSkillsCheck(report, opts));
    });

  skills
    .command("enable")
    .description("Enable a skill")
    .argument("<name>", "Skill name")
    .action(async (name) => {
      try {
        await setSkillEnabled(name, true);
      } catch (err) {
        defaultRuntime.error(String(err));
        defaultRuntime.exit(1);
      }
    });

  skills
    .command("disable")
    .description("Disable a skill")
    .argument("<name>", "Skill name")
    .action(async (name) => {
      try {
        await setSkillEnabled(name, false);
      } catch (err) {
        defaultRuntime.error(String(err));
        defaultRuntime.exit(1);
      }
    });

  skills
    .command("toggle")
    .description("Toggle a skill enabled/disabled state")
    .argument("<name>", "Skill name")
    .action(async (name) => {
      try {
        const isEnabled = await getSkillEnabledState(name);
        await setSkillEnabled(name, !isEnabled);
      } catch (err) {
        defaultRuntime.error(String(err));
        defaultRuntime.exit(1);
      }
    });

  skills
    .command("disable-all")
    .description("Temporarily disable all non-always skills")
    .option("--force", "Disable all skills including always-enabled ones (dangerous)", false)
    .action(async (opts) => {
      try {
        const report = await loadSkillsStatusReport();
        const skillsToDisable = report.skills.filter((skill) => {
          if (opts.force) {
            return true;
          }
          return !skill.always;
        });

        if (skillsToDisable.length === 0) {
          defaultRuntime.log("No skills to disable.");
          return;
        }

        let successCount = 0;
        let skipCount = 0;
        let errorCount = 0;

        for (const skill of skillsToDisable) {
          try {
            if (skill.always && !opts.force) {
              defaultRuntime.log(`Skipping always-enabled skill: ${skill.name}`);
              skipCount++;
              continue;
            }

            await setSkillEnabled(skill.name, false);
            successCount++;
          } catch (err) {
            defaultRuntime.error(`Failed to disable skill "${skill.name}": ${String(err)}`);
            errorCount++;
          }
        }

        defaultRuntime.log(`\nResults:`);
        defaultRuntime.log(`- Successfully disabled: ${successCount} skills`);
        if (skipCount > 0) {
          defaultRuntime.log(`- Skipped (always-enabled): ${skipCount} skills`);
        }
        if (errorCount > 0) {
          defaultRuntime.log(`- Errors: ${errorCount} skills`);
        }

        if (errorCount > 0) {
          defaultRuntime.exit(1);
        }
      } catch (err) {
        defaultRuntime.error(String(err));
        defaultRuntime.exit(1);
      }
    });

  skills
    .command("enable-all")
    .description("Enable all skills that are not blocked by allowlist")
    .action(async () => {
      try {
        const report = await loadSkillsStatusReport();
        const skillsToEnable = report.skills.filter((skill) => {
          return !skill.disabled && !skill.blockedByAllowlist;
        });

        if (skillsToEnable.length === 0) {
          defaultRuntime.log("No skills to enable.");
          return;
        }

        let successCount = 0;
        let skipCount = 0;
        let errorCount = 0;

        for (const skill of skillsToEnable) {
          try {
            await setSkillEnabled(skill.name, true);
            successCount++;
          } catch (err) {
            defaultRuntime.error(`Failed to enable skill "${skill.name}": ${String(err)}`);
            errorCount++;
          }
        }

        defaultRuntime.log(`\nResults:`);
        defaultRuntime.log(`- Successfully enabled: ${successCount} skills`);
        if (skipCount > 0) {
          defaultRuntime.log(`- Skipped (blocked/disabled): ${skipCount} skills`);
        }
        if (errorCount > 0) {
          defaultRuntime.log(`- Errors: ${errorCount} skills`);
        }

        if (errorCount > 0) {
          defaultRuntime.exit(1);
        }
      } catch (err) {
        defaultRuntime.error(String(err));
        defaultRuntime.exit(1);
      }
    });

  skills
    .command("add")
    .description("Add a skill from zip file or directory to skill library")
    .argument("<source>", "Skill source: either a .zip file path or directory path")
    .option("--force", "Overwrite existing skill if it already exists", false)
    .action(async (source, opts) => {
      try {
        await addSkillToLibrary(source, opts.force);
      } catch (err) {
        defaultRuntime.error(String(err));
        defaultRuntime.exit(1);
      }
    });

  // Default action (no subcommand) - show list
  skills.action(async () => {
    await runSkillsAction((report) => formatSkillsList(report, {}));
  });
}

/**
 * Add a skill to the skill library from zip file or directory
 */
async function addSkillToLibrary(source: string, force: boolean = false): Promise<void> {
  const skillLibraryPath = path.join(os.homedir(), ".openclaw", "skill_library");

  // Ensure skill library directory exists
  await fs.mkdir(skillLibraryPath, { recursive: true });

  // Load OpenClaw config for LLM usage
  const config = loadConfig();

  defaultRuntime.log(`Adding skill from: ${source}`);

  // Check if source is a zip/tar.gz file or directory
  const isZipFile =
    source.toLowerCase().endsWith(".zip") || source.toLowerCase().endsWith(".tar.gz");
  const isDirectory = fsSync.existsSync(source) && fsSync.statSync(source).isDirectory();

  if (!isZipFile && !isDirectory) {
    throw new Error(`Source must be either a .zip/.tar.gz file or directory: ${source}`);
  }
  // Create temporary directory for extraction
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-skill-add-"));

  try {
    let skillSourceDir: string;
    let skillName: string;

    if (isZipFile) {
      defaultRuntime.log(`Extracting archive file: ${source}`);
      skillSourceDir = path.join(tempDir, "extracted");
      await fs.mkdir(skillSourceDir, { recursive: true });

      // Extract archive file (zip or tar.gz)
      await extractArchiveFile(source, skillSourceDir);

      // Find skill directory (should be same name as zip without extension)
      const zipBaseName = source.toLowerCase().endsWith(".tar.gz")
        ? path.basename(source, ".tar.gz")
        : path.basename(source, ".zip");
      const extractedDirs = await fs.readdir(skillSourceDir);

      // Look for directory matching zip name or use the first directory
      skillName = zipBaseName;
      const matchingDir = extractedDirs.find((dir) => dir === zipBaseName);
      if (matchingDir) {
        skillSourceDir = path.join(skillSourceDir, matchingDir);
      } else if (
        extractedDirs.length === 1 &&
        fsSync.statSync(path.join(skillSourceDir, extractedDirs[0])).isDirectory()
      ) {
        skillSourceDir = path.join(skillSourceDir, extractedDirs[0]);
        skillName = extractedDirs[0];
      } else {
        // Use the extracted directory itself if it contains skill files
        skillSourceDir = skillSourceDir;
      }
    } else {
      // Source is a directory
      skillSourceDir = source;
      skillName = path.basename(source);
    }

    defaultRuntime.log(`Skill name: ${skillName}`);
    defaultRuntime.log(`Skill source directory: ${skillSourceDir}`);

    // Validate skill structure
    await validateSkillStructure(skillSourceDir, skillName);

    // Check if skill already exists
    const targetSkillDir = path.join(skillLibraryPath, skillName);
    if (fsSync.existsSync(targetSkillDir) && !force) {
      throw new Error(`Skill "${skillName}" already exists. Use --force to overwrite.`);
    }

    // Copy skill files to library
    defaultRuntime.log(`Copying skill files to: ${targetSkillDir}`);
    if (force && fsSync.existsSync(targetSkillDir)) {
      await fs.rm(targetSkillDir, { recursive: true, force: true });
    }
    await fs.mkdir(targetSkillDir, { recursive: true });

    // Copy all files and directories
    await copyDirectory(skillSourceDir, targetSkillDir);

    // Generate overview.md
    defaultRuntime.log(`Generating overview for skill: ${skillName}`);
    await generateSkillOverview(targetSkillDir, skillName, config, {});

    defaultRuntime.log(`✅ Successfully added skill "${skillName}" to library`);
    defaultRuntime.log(`   Location: ${targetSkillDir}`);
    defaultRuntime.log(`   Overview: ${path.join(targetSkillDir, ".overview.md")}`);
  } finally {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (err) {
      defaultRuntime.log(`Warning: Failed to clean up temporary directory: ${String(err)}`);
    }
  }
}

/**
 * Extract archive file (zip or tar.gz) to target directory
 */
async function extractArchiveFile(archivePath: string, targetDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const readStream = fsSync.createReadStream(archivePath);
    const extractStream = extract({ cwd: targetDir });

    readStream.on("error", reject);
    extractStream.on("error", reject);
    extractStream.on("finish", resolve);

    readStream.pipe(extractStream);
  });
}

/**
 * Validate skill directory structure
 */
async function validateSkillStructure(skillDir: string, skillName: string): Promise<void> {
  // Check if SKILL.md exists
  const skillMdPath = path.join(skillDir, "SKILL.md");
  if (!fsSync.existsSync(skillMdPath)) {
    throw new Error(`SKILL.md file not found in skill directory: ${skillDir}`);
  }

  // Read SKILL.md to get skill description
  const skillContent = await fs.readFile(skillMdPath, "utf-8");
  if (!skillContent.trim()) {
    throw new Error(`SKILL.md file is empty: ${skillMdPath}`);
  }

  defaultRuntime.log(`✓ Skill structure validated for: ${skillName}`);
}

/**
 * Copy directory recursively
 */
async function copyDirectory(src: string, dest: string): Promise<void> {
  const entries = await fs.readdir(src, { withFileTypes: true });

  await fs.mkdir(dest, { recursive: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else if (entry.isFile()) {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

/**
 * Generate overview.md for skill using LLM
 */
async function generateSkillOverview(
  skillDir: string,
  skillName: string,
  config: any,
  params?: { provider?: string; model?: string },
): Promise<void> {
  const skillMdPath = path.join(skillDir, "SKILL.md");
  const overviewPath = path.join(skillDir, ".overview.md");

  // Read SKILL.md content
  const skillContent = await fs.readFile(skillMdPath, "utf-8");

  // Extract description from SKILL.md (first paragraph or title)
  const lines = skillContent.split("\n");
  let description = "";

  // Try to find description in first few lines
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const line = lines[i].trim();
    if (line && !line.startsWith("#") && line.length > 10) {
      description = line;
      break;
    }
  }

  // If no description found, use the skill name
  if (!description) {
    description = `Skill: ${skillName}`;
  }

  try {
    // Load runEmbeddedPiAgent function
    const runEmbeddedPiAgent = await loadRunEmbeddedPiAgent();

    // Create temporary session file
    const sessionId = `skill-overview-${Date.now()}`;
    const sessionFile = path.join(os.tmpdir(), `skill-overview-${sessionId}.json`);

    // Prepare the prompt based on overview_generation.yaml
    const overviewPrompt = buildOverviewPrompt(skillName, description, skillContent);

    defaultRuntime.log(`Generating overview using LLM...`);

    // Parse model configuration like data-extractor does
    const defaultsModel = config?.agents?.defaults?.model;
    const primary =
      typeof defaultsModel === "string"
        ? defaultsModel.trim()
        : (defaultsModel?.primary?.trim() ?? undefined);
    const primaryProvider = typeof primary === "string" ? primary.split("/")[0] : undefined;
    const primaryModel =
      typeof primary === "string" ? primary.split("/").slice(1).join("/") : undefined;

    // Apply parameter priority like data-extractor does:
    // 1. Use provided params first (if any)
    // 2. Fall back to config defaults
    const provider =
      (typeof params.provider === "string" && params.provider.trim()) ||
      primaryProvider ||
      undefined;

    const model =
      (typeof params.model === "string" && params.model.trim()) || primaryModel || undefined;

    // Validate model configuration before attempting LLM call
    if (!provider || !model) {
      const errorMsg = `模型配置缺失: 请在配置中设置 agents.defaults.model (provider=${String(provider ?? "")}, model=${String(model ?? "")})`;
      defaultRuntime.log(`Warning: ${errorMsg}`);
      throw new Error(errorMsg);
    }

    const modelKey = `${provider}/${model}`;

    defaultRuntime.log(`Using provider: ${provider}, model: ${model}`);

    // Get workspace directory from config (like data-extractor does)
    const workspaceDir = config?.agents?.defaults?.workspace;
    const safeWorkspaceDir =
      workspaceDir && typeof workspaceDir === "string" && workspaceDir.trim() !== ""
        ? workspaceDir
        : process.cwd() || "/tmp";

    defaultRuntime.log(`Using workspace: ${safeWorkspaceDir}`);

    // Ensure config is valid (like data-extractor does)
    const safeConfig = config && typeof config === "object" ? config : {};
    defaultRuntime.log(`Using config keys: ${Object.keys(safeConfig).join(", ")}`);

    // Debug: log model resolution
    defaultRuntime.log(
      `Model resolution: params=${JSON.stringify(params)}, defaultsModel=${JSON.stringify(defaultsModel)}, primary=${primary}, primaryProvider=${primaryProvider}, primaryModel=${primaryModel}`,
    );

    // Debug: log all parameters before calling LLM
    defaultRuntime.log(`Calling runEmbeddedPiAgent with:`);
    defaultRuntime.log(`  sessionId: ${sessionId}`);
    defaultRuntime.log(`  sessionFile: ${sessionFile}`);
    defaultRuntime.log(`  workspaceDir: ${safeWorkspaceDir}`);
    defaultRuntime.log(`  prompt length: ${overviewPrompt.length}`);
    defaultRuntime.log(`  timeoutMs: 120000`);
    defaultRuntime.log(`  provider: ${provider}, model: ${model}`);
    defaultRuntime.log(`  authProfileId: undefined, authProfileIdSource: auto`);
    defaultRuntime.log(`  disableTools: true`);

    // Call LLM to generate overview
    const callStartedAt = Date.now();
    const result = await runEmbeddedPiAgent({
      sessionId,
      sessionFile,
      workspaceDir: safeWorkspaceDir,
      config: safeConfig,
      prompt: overviewPrompt,
      timeoutMs: 300000, // 5 minutes - LLM calls can take time especially on first invocation
      runId: `overview-${Date.now()}`,
      provider: provider,
      model: model,
      authProfileId: undefined,
      authProfileIdSource: "auto",
      streamParams: {
        temperature: 0.0,
        maxTokens: 1000,
      },
      disableTools: true,
    });

    const callDurationMs = Date.now() - callStartedAt;
    defaultRuntime.log(`runEmbeddedPiAgent completed in ${callDurationMs}ms`);

    // Debug: log result structure
    defaultRuntime.log(
      `LLM call completed, result type: ${typeof result}, keys: ${result ? Object.keys(result).join(", ") : "none"}`,
    );

    // Debug: log meta info if available
    if (result && typeof result === "object" && (result as any).meta) {
      const meta = (result as any).meta;
      defaultRuntime.log(
        `LLM meta: durationMs=${meta.durationMs}, aborted=${meta.aborted}, stopReason=${meta.stopReason}`,
      );
      if (meta.agentMeta?.usage) {
        defaultRuntime.log(
          `LLM usage: input=${meta.agentMeta.usage.input}, output=${meta.agentMeta.usage.output}, total=${meta.agentMeta.usage.total}`,
        );
      }
    }

    // Extract text from result (using same logic as data-extractor)
    const text = collectTextFromResult(result);

    defaultRuntime.log(`Extracted text length: ${text?.length ?? 0}`);

    if (text && text.trim()) {
      await fs.writeFile(overviewPath, text.trim(), "utf-8");
      defaultRuntime.log(`✓ Generated overview: ${overviewPath}`);
    } else {
      throw new Error("LLM returned empty overview");
    }
  } catch (error) {
    defaultRuntime.log(`Warning: Failed to generate overview with LLM: ${String(error)}`);

    // Fallback: create basic overview
    const fallbackOverview = generateFallbackOverview(skillName, description, skillContent);
    await fs.writeFile(overviewPath, fallbackOverview, "utf-8");
    defaultRuntime.log(`✓ Created fallback overview: ${overviewPath}`);
  }
}

/**
 * Build overview generation prompt
 */
function buildOverviewPrompt(
  skillName: string,
  skillDescription: string,
  skillContent: string,
): string {
  return `Please extract key information from the following Skill's complete content and generate a concise overview.

## Skill Information

**Name**: ${skillName}
**Description**: ${skillDescription}

## Complete Content

${skillContent}

## Task

Extract from the above content:
1. **When to use** (usage scenarios, trigger conditions)
2. **How to use** (main functions, core operations)
3. **Why to use** (what problems it solves)
4. **Key features** (important tools, methods, best practices)

## Output Requirements

- Concise and clear, don't copy the original text
- Highlight key information relevant to retrieval
- Avoid excessive code details
- Moderate length (no more than 1000 tokens)

Please output the extracted overview text directly:`;
}

/**
 * Extract text from LLM result (using same logic as data-extractor)
 */
function collectTextFromResult(result: any): string {
  if (!result || typeof result !== "object") {
    return "";
  }

  // Handle different result formats (same as data-extractor)
  if (result.payloads && Array.isArray(result.payloads)) {
    const texts = result.payloads
      .filter((p: any) => !p.isError && typeof p.text === "string")
      .map((p: any) => p.text || "");
    return texts.join("\n").trim();
  }

  if (typeof result.text === "string") {
    return result.text;
  }

  if (typeof result.content === "string") {
    return result.content;
  }

  return "";
}

/**
 * Generate fallback overview when LLM fails
 */
function generateFallbackOverview(
  skillName: string,
  description: string,
  skillContent: string,
): string {
  const lines = skillContent.split("\n");
  const title =
    lines
      .find((line) => line.trim().startsWith("#"))
      ?.trim()
      .replace(/^#\s*/, "") || skillName;

  return `# ${title} Overview

## Description
${description}

## Key Information
This skill is located at: \`${skillName}/\`

## Usage
Refer to the main SKILL.md file for detailed usage instructions and implementation details.

---
*This overview was automatically generated. For complete information, please refer to the SKILL.md file.*
`;
}
