import { definePluginEntry, type OpenClawPluginApi } from "./api.js";
import { promptReorganizationConfigSchema } from "./src/config.js";
import { PromptReorganizationService } from "./src/service.js";

export default definePluginEntry({
  id: "prompt-reorganization",
  name: "Prompt重新整理",
  description: "智能分析用户输入并推荐相关技能的插件",
  configSchema: promptReorganizationConfigSchema,

  register(api: OpenClawPluginApi) {
    const service = new PromptReorganizationService(api);

    // 注册 before_prompt_build hook（标准 hook，用于智能分析和技能推荐）
    console.log(
      `📋 [PromptReorganization Plugin] Registering hook: before_prompt_build with priority 10`,
    );
    api.on("before_prompt_build", service.handleBeforePromptBuild.bind(service), {
      priority: 10,
    });

    console.log(
      `✅ [PromptReorganization Plugin] Hook 'before_prompt_build' registered successfully`,
    );

    // 注册CLI命令（使用正确的API）
    api.registerCli(
      ({ program }) => {
        const reorg = program
          .command("prompt-reorganization")
          .description("管理prompt重新整理功能");

        reorg
          .command("status")
          .description("查看重新整理功能状态")
          .action(async () => {
            await service.handleCommand(["status"]);
          });

        reorg
          .command("config")
          .description("显示当前配置")
          .action(async () => {
            await service.handleCommand(["config"]);
          });

        reorg
          .command("test")
          .description("测试重新整理功能")
          .argument("<prompt>", "测试用的prompt")
          .action(async (prompt: string) => {
            // 确保prompt是字符串类型
            const promptStr = String(prompt || "").trim();
            if (!promptStr) {
              console.log("错误: 请提供测试用的prompt");
              return;
            }
            await service.handleCommand(["test", promptStr]);
          });

        // Hook管理命令
        const hookCmd = reorg.command("hook").description("管理hook注册状态");

        hookCmd
          .command("enable")
          .description("启用prompt重新整理hook")
          .action(async () => {
            await service.handleCommand(["hook", "enable"]);
          });

        hookCmd
          .command("disable")
          .description("禁用prompt重新整理hook")
          .action(async () => {
            await service.handleCommand(["hook", "disable"]);
          });

        hookCmd
          .command("status")
          .description("查看hook注册状态")
          .action(async () => {
            await service.handleCommand(["hook", "status"]);
          });

        hookCmd
          .command("list")
          .description("列出所有可用的hook事件")
          .action(async () => {
            await service.handleCommand(["hook", "list"]);
          });
      },
      { commands: ["prompt-reorganization"] },
    );
  },
});
