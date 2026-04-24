import type { AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";
import { definePluginEntry, type OpenClawPluginApi } from "./api.js";
import { dataExtractorConfigSchema } from "./src/config.js";
import { DataExtractorService } from "./src/service.js";
import { createDataExtractorTool } from "./src/tools/data-extractor.js";

export default definePluginEntry({
  id: "data-extractor",
  name: "Data Extractor",
  description: "使用大模型从自然语言中提取结构化数据并存储到文件系统",
  configSchema: dataExtractorConfigSchema,

  register(api: OpenClawPluginApi) {
    const service = new DataExtractorService(api);

    console.log(`📊 [Data Extractor Plugin] Registering data extraction service`);

    // 注册工具
    console.log(`📊 [Data Extractor Plugin] Registering data extraction tool`);
    api.registerTool(createDataExtractorTool(api) as AnyAgentTool);
    console.log(`✅ [Data Extractor Plugin] Tool registered successfully`);

    // 注册CLI命令
    api.registerCli(
      ({ program }) => {
        const extractor = program.command("data-extractor").description("管理数据提取功能");

        extractor
          .command("status")
          .description("查看数据提取功能状态")
          .action(async () => {
            await service.handleCommand(["status"]);
          });

        extractor
          .command("config")
          .description("显示当前配置")
          .action(async () => {
            await service.handleCommand(["config"]);
          });

        extractor
          .command("test")
          .description("测试数据提取功能")
          .argument("<text>", "要提取的文本")
          .argument("<schema>", "数据结构的JSON schema")
          .action(async (text: string, schema: string) => {
            // 确保参数是字符串类型
            const textStr = String(text || "").trim();
            const schemaStr = String(schema || "").trim();
            if (!textStr || !schemaStr) {
              console.log("错误: 请提供文本和schema");
              return;
            }
            await service.handleCommand(["test", textStr, schemaStr]);
          });

        // 预定义schema的快捷命令
        extractor
          .command("contact")
          .description("提取联系人信息")
          .argument("<text>", "包含联系人信息的文本")
          .action(async (text: string) => {
            const textStr = String(text || "").trim();
            if (!textStr) {
              console.log("错误: 请提供包含联系人信息的文本");
              return;
            }
            await service.handleCommand(["contact", textStr]);
          });

        extractor
          .command("product")
          .description("提取产品信息")
          .argument("<text>", "包含产品信息的文本")
          .action(async (text: string) => {
            const textStr = String(text || "").trim();
            if (!textStr) {
              console.log("错误: 请提供包含产品信息的文本");
              return;
            }
            await service.handleCommand(["product", textStr]);
          });

        extractor
          .command("address")
          .description("提取地址信息")
          .argument("<text>", "包含地址信息的文本")
          .action(async (text: string) => {
            const textStr = String(text || "").trim();
            if (!textStr) {
              console.log("错误: 请提供包含地址信息的文本");
              return;
            }
            await service.handleCommand(["address", textStr]);
          });

        extractor
          .command("reset-stats")
          .description("重置统计信息")
          .action(async () => {
            await service.handleCommand(["reset-stats"]);
          });
      },
      { commands: ["data-extractor"] },
    );

    console.log(`✅ [Data Extractor Plugin] Plugin registered successfully`);
  },
});
