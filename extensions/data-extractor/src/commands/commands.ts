import type { OpenClawPluginApi } from "openclaw/plugin-sdk/data-extractor";
import { DatabaseManager } from "../database/operations.js";
import { createDataExtractorTool } from "../tools/data-extractor.js";
import { CONTACT_SCHEMA, PRODUCT_SCHEMA, ADDRESS_SCHEMA } from "../types/index.js";

export function registerCommands(api: OpenClawPluginApi) {
  const db = new DatabaseManager(api);
  const extractorTool = createDataExtractorTool(api);

  // 注册数据提取命令
  api.registerCommand({
    name: "extract",
    description: "从自然语言中提取结构化数据",
    acceptsArgs: true,
    requireAuth: true,
    handler: async (ctx) => {
      console.log(`[DataExtractor] /extract命令开始: args="${ctx.args}"`);

      const args = ctx.args?.split(" ") || [];

      if (args.length === 0) {
        console.log(`[DataExtractor] /extract命令返回帮助信息`);
        return {
          text: `📋 数据提取命令使用说明：

/extract contact <文本> - 提取联系信息
/extract product <文本> - 提取产品信息  
/extract address <文本> - 提取地址信息
/extract custom <schema> <文本> - 使用自定义schema提取

示例：
/extract contact 张三在阿里巴巴工作，邮箱是zhangsan@alibaba.com，电话13800138000
/extract product iPhone 15 Pro 售价7999元，是苹果公司的最新旗舰手机`,
        };
      }

      try {
        const [type, ...textParts] = args;
        const text = textParts.join(" ");
        console.log(`[DataExtractor] 解析参数: type="${type}", text="${text}"`);

        if (!text.trim()) {
          console.log(`[DataExtractor] 文本为空，返回错误`);
          return { text: "请提供要提取的文本内容" };
        }

        let schema;
        let tableName;

        // 根据类型选择schema
        switch (type.toLowerCase()) {
          case "contact":
            schema = CONTACT_SCHEMA;
            tableName = "contacts";
            console.log(`[DataExtractor] 选择contact schema`);
            break;
          case "product":
            schema = PRODUCT_SCHEMA;
            tableName = "products";
            console.log(`[DataExtractor] 选择product schema`);
            break;
          case "address":
            schema = ADDRESS_SCHEMA;
            tableName = "addresses";
            console.log(`[DataExtractor] 选择address schema`);
            break;
          case "custom":
            console.log(`[DataExtractor] 处理custom模式`);
            // 自定义schema模式：/extract custom <schema_json> <text>
            const schemaMatch = text.match(/^(\{.*?\})\s+(.*)$/s);
            if (!schemaMatch) {
              console.log(`[DataExtractor] custom模式格式错误`);
              return { text: "自定义模式格式错误，请提供有效的JSON schema" };
            }
            try {
              schema = JSON.parse(schemaMatch[1]);
              const customText = schemaMatch[2];
              console.log(`[DataExtractor] custom模式解析成功`);
              return await performExtraction(extractorTool, customText, schema, "custom");
            } catch (error) {
              console.log(
                `[DataExtractor] JSON schema解析错误: ${error instanceof Error ? error.message : String(error)}`,
              );
              return {
                text: `JSON schema解析错误：${error instanceof Error ? error.message : String(error)}`,
              };
            }
          default:
            console.log(`[DataExtractor] 未知类型: ${type}`);
            return {
              text: `未知的数据类型：${type}。支持的类型：contact, product, address, custom`,
            };
        }

        console.log(`[DataExtractor] 开始执行提取: tableName="${tableName}"`);
        const result = await performExtraction(extractorTool, text, schema, tableName);
        console.log(`[DataExtractor] 提取完成`);
        return result;
      } catch (error) {
        console.log(
          `[DataExtractor] /extract命令异常: ${error instanceof Error ? error.message : String(error)}`,
        );
        return {
          text: `❌ 提取失败：${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  });

  // 注册查询命令
  api.registerCommand({
    name: "extractions",
    description: "查询已提取的数据",
    acceptsArgs: true,
    requireAuth: true,
    handler: async (ctx) => {
      const args = ctx.args?.split(" ") || [];

      try {
        if (args.length === 0) {
          // 显示统计信息
          const stats = await db.getStatistics();
          const tableNames = await db.getTableNames();

          let text = `📊 数据提取统计：\n\n`;
          text += `总条目数：${stats.totalEntries}\n`;
          text += `数据表：${tableNames.length} 个\n\n`;

          if (tableNames.length > 0) {
            text += `各表统计：\n`;
            for (const [tableName, count] of Object.entries(stats.tableCounts)) {
              text += `- ${tableName}: ${count} 条\n`;
            }
          }

          if (stats.dateRange.earliest > 0) {
            text += `\n时间范围：\n`;
            text += `最早：${new Date(stats.dateRange.earliest).toLocaleString()}\n`;
            text += `最新：${new Date(stats.dateRange.latest).toLocaleString()}\n`;
          }

          text += `\n使用说明：\n`;
          text += `/extractions list [表名] [数量] - 列出数据\n`;
          text += `/extractions search <关键词> - 搜索数据\n`;
          text += `/extractions export [表名] [格式] - 导出数据\n`;
          text += `/extractions delete <ID> - 删除数据\n`;

          return { text };
        }

        const [action, ...actionArgs] = args;

        switch (action.toLowerCase()) {
          case "list":
            return await handleList(db, actionArgs);
          case "search":
            return await handleSearch(db, actionArgs);
          case "export":
            return await handleExport(db, actionArgs);
          case "delete":
            return await handleDelete(db, actionArgs);
          default:
            return { text: `未知操作：${action}。支持的操作：list, search, export, delete` };
        }
      } catch (error) {
        return {
          text: `❌ 查询失败：${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  });

  // 注册帮助命令
  api.registerCommand({
    name: "extract-help",
    description: "显示数据提取帮助信息",
    requireAuth: false,
    handler: async () => {
      const helpText = `
🤖 数据提取插件帮助

📋 主要命令：
/extract <类型> <文本> - 提取结构化数据
/extractions [操作] - 管理提取的数据

🔧 支持的数据类型：
• contact - 联系信息（姓名、邮箱、电话、公司、职位等）
• product - 产品信息（名称、价格、分类、品牌等）  
• address - 地址信息（完整地址、省份、城市等）
• custom - 自定义数据结构

📝 使用示例：
/extract contact 张三在阿里巴巴工作，邮箱zhangsan@alibaba.com，电话13800138000
/extract product iPhone 15 Pro 售价7999元，是苹果公司的旗舰产品
/extract address 北京市朝阳区建国门外大街1号国贸大厦

🔍 查询功能：
/extractions - 查看统计信息
/extractions list contacts 10 - 列出最近10条联系信息
/extractions search 张三 - 搜索包含"张三"的数据
/extractions export products csv - 导出产品数据为CSV格式

⚙️ 配置说明：
插件会自动使用你在OpenClaw中配置的大模型，无需额外设置。
可以在插件配置中调整置信度阈值、数据库路径等参数。

📞 如有问题，请检查OpenClaw的模型配置是否正确。
      `;

      return { text: helpText.trim() };
    },
  });
}

async function performExtraction(extractorTool: any, text: string, schema: any, tableName: string) {
  console.log(`[DataExtractor] performExtraction开始: text="${text}", tableName="${tableName}"`);

  const result = await extractorTool.execute("extract-1", {
    text,
    schema,
    tableName,
    confidence: 0.7,
  });

  console.log(
    `[DataExtractor] performExtraction完成: ${result.content[0].text.substring(0, 100)}...`,
  );
  return { text: result.content[0].text };
}

async function handleList(db: DatabaseManager, args: string[]) {
  const tableName = args[0] || undefined;
  const limit = args[1] ? parseInt(args[1]) : 10;

  const entries = await db.search({ tableName, limit });

  if (entries.length === 0) {
    return { text: "未找到匹配的数据" };
  }

  let text = `📋 找到 ${entries.length} 条记录：\n\n`;

  for (const entry of entries) {
    text += `ID: ${entry.id}\n`;
    text += `表: ${entry.metadata.tableName}\n`;
    text += `时间: ${new Date(entry.created_at).toLocaleString()}\n`;
    text += `数据: ${JSON.stringify(entry.data, null, 2)}\n`;
    text += `---\n\n`;
  }

  return { text };
}

async function handleSearch(db: DatabaseManager, args: string[]) {
  if (args.length === 0) {
    return { text: "请提供搜索关键词" };
  }

  const keyword = args.join(" ");
  const entries = await db.search({ limit: 20 });

  // 简单的关键词匹配（实际应用中可以实现更复杂的搜索）
  const matchedEntries = entries.filter((entry) =>
    JSON.stringify(entry.data).toLowerCase().includes(keyword.toLowerCase()),
  );

  if (matchedEntries.length === 0) {
    return { text: `未找到包含 "${keyword}" 的数据` };
  }

  let text = `🔍 找到 ${matchedEntries.length} 条包含 "${keyword}" 的记录：\n\n`;

  for (const entry of matchedEntries.slice(0, 5)) {
    // 限制显示前5条
    text += `ID: ${entry.id}\n`;
    text += `数据: ${JSON.stringify(entry.data, null, 2)}\n`;
    text += `---\n\n`;
  }

  if (matchedEntries.length > 5) {
    text += `... 还有 ${matchedEntries.length - 5} 条记录\n`;
  }

  return { text };
}

async function handleExport(db: DatabaseManager, args: string[]) {
  const tableName = args[0];
  const format = args[1] || "json";

  if (!tableName) {
    return { text: "请指定要导出的表名" };
  }

  if (!["json", "csv"].includes(format)) {
    return { text: "不支持的导出格式，支持：json, csv" };
  }

  try {
    const exportData = await db.export({ tableName, format: format as "json" | "csv" });

    let text = `📤 导出 ${tableName} 表数据 (${format.toUpperCase()}格式)：\n\n`;

    if (format === "json") {
      text += "```json\n";
      text += exportData;
      text += "\n```";
    } else {
      text += "```csv\n";
      text += exportData;
      text += "\n```";
    }

    return { text };
  } catch (error) {
    return { text: `导出失败：${error instanceof Error ? error.message : String(error)}` };
  }
}

async function handleDelete(db: DatabaseManager, args: string[]) {
  if (args.length === 0) {
    return { text: "请提供要删除的数据ID" };
  }

  const id = args[0];
  const success = await db.delete(id);

  if (success) {
    return { text: `✅ 已删除ID为 ${id} 的数据` };
  } else {
    return { text: `❌ 未找到ID为 ${id} 的数据` };
  }
}
