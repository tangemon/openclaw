import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/data-extractor";
import type { DataExtractorConfig } from "../config.js";
import type { DataEntry } from "../types/index.js";

export class DatabaseManager {
  private config: DataExtractorConfig;
  private api: OpenClawPluginApi;
  private dataDir: string;

  constructor(api: OpenClawPluginApi) {
    this.api = api;
    this.config = (api.pluginConfig || {}) as DataExtractorConfig;

    // 安全处理数据库路径
    const defaultPath = "~/.openclaw/data/data-extractor-data";
    const databasePath = this.config.databasePath || defaultPath;
    const dataDir = databasePath.replace(".db", "-data");

    console.log(`[DataExtractor] 构造函数开始: databasePath=${databasePath}, dataDir=${dataDir}`);

    // 确保路径处理的安全性
    const expandedPath = this.expandPath(dataDir);
    console.log(`[DataExtractor] expandPath结果: ${expandedPath}`);

    this.dataDir = expandedPath || defaultPath;

    // 额外的安全检查
    if (!this.dataDir || typeof this.dataDir !== "string") {
      console.log(`[DataExtractor] dataDir无效，使用默认路径: ${defaultPath}`);
      this.dataDir = defaultPath;
    }

    console.log(`[DataExtractor] 最终dataDir: ${this.dataDir}`);

    this.initialize();
  }

  private async initialize() {
    console.log(`[DataExtractor] initialize开始: dataDir=${this.dataDir}`);

    // 确保 dataDir 有效
    if (!this.dataDir || typeof this.dataDir !== "string" || this.dataDir.trim() === "") {
      console.log(`[DataExtractor] initialize跳过: dataDir无效`);
      return; // 跳过初始化
    }

    try {
      // 确保数据目录存在
      if (!fsSync.existsSync(this.dataDir)) {
        console.log(`[DataExtractor] 创建目录: ${this.dataDir}`);
        await fs.mkdir(this.dataDir, { recursive: true });
        console.log(`[DataExtractor] 目录创建成功`);
      } else {
        console.log(`[DataExtractor] 目录已存在: ${this.dataDir}`);
      }
    } catch (error) {
      console.log(
        `[DataExtractor] 初始化失败: ${error instanceof Error ? error.message : String(error)}`,
      );
      // 初始化失败时静默处理
    }
  }

  async store(
    tableName: string,
    data: any,
    metadata: any,
  ): Promise<{ id: string; success: boolean }> {
    console.log(`[DataExtractor] store开始: tableName=${tableName}, dataDir=${this.dataDir}`);

    // 验证输入参数
    if (!tableName || typeof tableName !== "string") {
      console.log(`[DataExtractor] store失败: tableName无效`);
      throw new Error("表名无效");
    }

    // 确保 dataDir 有效
    if (!this.dataDir || typeof this.dataDir !== "string" || this.dataDir.trim() === "") {
      console.log(`[DataExtractor] store失败: dataDir无效`);
      throw new Error("数据目录无效");
    }

    const id = this.generateId();
    console.log(`[DataExtractor] 生成ID: ${id}`);

    const entry: DataEntry = {
      id,
      data: data || {},
      metadata: {
        ...(metadata || {}),
        tableName,
        timestamp: Date.now(),
      },
      created_at: Date.now(),
    };

    try {
      // 创建表目录
      const tableDir = path.join(this.dataDir, tableName);
      console.log(`[DataExtractor] 表目录: ${tableDir}`);

      if (!fsSync.existsSync(tableDir)) {
        console.log(`[DataExtractor] 创建表目录: ${tableDir}`);
        await fs.mkdir(tableDir, { recursive: true });
        console.log(`[DataExtractor] 表目录创建成功`);
      } else {
        console.log(`[DataExtractor] 表目录已存在: ${tableDir}`);
      }

      // 写入数据文件
      const filePath = path.join(tableDir, `${id}.json`);
      console.log(`[DataExtractor] 文件路径: ${filePath}`);

      await fs.writeFile(filePath, JSON.stringify(entry, null, 2));
      console.log(`[DataExtractor] 文件写入成功`);

      // 检查是否超过最大条目数
      console.log(`[DataExtractor] 检查清理旧数据`);
      await this.cleanupOldEntries();
      console.log(`[DataExtractor] store完成: ${id}`);

      return { id, success: true };
    } catch (error) {
      console.log(
        `[DataExtractor] store失败: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new Error(`数据存储失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async get(id: string): Promise<DataEntry | null> {
    // 搜索所有表目录中的文件
    const tableDirs = await this.getTableDirectories();

    for (const tableDir of tableDirs) {
      try {
        // 确保 tableDir 是有效字符串
        if (!tableDir || typeof tableDir !== "string") {
          continue;
        }

        const filePath = path.join(tableDir, `${id}.json`);
        const content = await fs.readFile(filePath, "utf-8");
        return JSON.parse(content);
      } catch {
        // 文件不存在，继续搜索
        continue;
      }
    }

    return null;
  }

  async search(query: {
    tableName?: string;
    startDate?: number;
    endDate?: number;
    limit?: number;
    offset?: number;
  }): Promise<DataEntry[]> {
    const entries: DataEntry[] = [];

    // 获取要搜索的表目录
    const tableDirs =
      query.tableName && this.dataDir
        ? [path.join(this.dataDir, query.tableName)]
        : await this.getTableDirectories();

    for (const tableDir of tableDirs) {
      try {
        // 确保 tableDir 是有效字符串
        if (!tableDir || typeof tableDir !== "string") {
          continue;
        }

        const files = await fs.readdir(tableDir);

        for (const file of files) {
          // 确保 file 是有效字符串
          if (!file || typeof file !== "string" || !file.endsWith(".json")) {
            continue;
          }

          const content = await fs.readFile(path.join(tableDir, file), "utf-8");
          const entry: DataEntry = JSON.parse(content);

          // 应用过滤条件
          if (query.startDate && entry.created_at < query.startDate) continue;
          if (query.endDate && entry.created_at > query.endDate) continue;

          entries.push(entry);
        }
      } catch {
        // 目录不存在或无法读取，跳过
        continue;
      }
    }

    // 按创建时间排序
    entries.sort((a, b) => b.created_at - a.created_at);

    // 应用分页
    const offset = query.offset || 0;
    const limit = query.limit || entries.length;

    return entries.slice(offset, offset + limit);
  }

  async count(query: {
    tableName?: string;
    startDate?: number;
    endDate?: number;
  }): Promise<number> {
    const entries = await this.search({ ...query, limit: undefined });
    return entries.length;
  }

  async delete(id: string): Promise<boolean> {
    const tableDirs = await this.getTableDirectories();

    for (const tableDir of tableDirs) {
      try {
        // 确保 tableDir 是有效字符串
        if (!tableDir || typeof tableDir !== "string") {
          continue;
        }

        const filePath = path.join(tableDir, `${id}.json`);
        await fs.unlink(filePath);
        return true; // 删除成功
      } catch {
        // 文件不存在，继续搜索
        continue;
      }
    }

    return false; // 未找到文件
  }

  async export(query: {
    tableName?: string;
    startDate?: number;
    endDate?: number;
    format?: "json" | "csv";
  }): Promise<string> {
    const entries = await this.search(query);

    if (query.format === "csv") {
      return this.exportToCsv(entries);
    }

    return JSON.stringify(entries, null, 2);
  }

  private exportToCsv(entries: DataEntry[]): string {
    if (entries.length === 0) {
      return "";
    }

    // 获取所有可能的字段名
    const allFields = new Set<string>();
    entries.forEach((entry) => {
      Object.keys(entry.data).forEach((field) => allFields.add(field));
    });

    const fields = Array.from(allFields);

    // CSV头部
    const headers = ["id", "created_at", ...fields];
    const csvLines = [headers.join(",")];

    // CSV数据行
    entries.forEach((entry) => {
      const row = [
        entry.id,
        new Date(entry.created_at).toISOString(),
        ...fields.map((field) => {
          const value = entry.data[field];
          if (value === null || value === undefined) {
            return "";
          }
          const str = String(value);
          // 如果包含逗号或引号，需要用引号包围并转义内部的引号
          if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        }),
      ];
      csvLines.push(row.join(","));
    });

    return csvLines.join("\n");
  }

  async getTableNames(): Promise<string[]> {
    console.log(`[DataExtractor] getTableNames开始: dataDir=${this.dataDir}`);

    try {
      // 确保 dataDir 有效
      if (!this.dataDir || typeof this.dataDir !== "string" || this.dataDir.trim() === "") {
        console.log(`[DataExtractor] getTableNames返回空: dataDir无效`);
        return [];
      }

      // 再次验证路径
      const safeDataDir = this.expandPath(this.dataDir);
      console.log(`[DataExtractor] safeDataDir: ${safeDataDir}`);

      if (!safeDataDir || typeof safeDataDir !== "string") {
        console.log(`[DataExtractor] getTableNames返回空: safeDataDir无效`);
        return [];
      }

      console.log(`[DataExtractor] 读取目录: ${safeDataDir}`);
      const items = await fs.readdir(safeDataDir);
      console.log(`[DataExtractor] 目录内容: ${JSON.stringify(items)}`);

      const tableNames: string[] = [];

      for (const item of items) {
        // 确保 item 是有效字符串
        if (!item || typeof item !== "string") {
          console.log(`[DataExtractor] 跳过无效项目: ${item}`);
          continue;
        }

        const itemPath = path.join(safeDataDir, item);
        console.log(`[DataExtractor] 检查项目: ${item} -> ${itemPath}`);

        try {
          const stats = await fs.stat(itemPath);
          console.log(`[DataExtractor] 项目状态: ${item} isDirectory=${stats.isDirectory()}`);

          if (stats.isDirectory()) {
            console.log(`[DataExtractor] 添加表名: ${item}`);
            tableNames.push(item);
          }
        } catch (error) {
          console.log(
            `[DataExtractor] 忽略无法访问的项目: ${item} - ${error instanceof Error ? error.message : String(error)}`,
          );
          // 忽略无法访问的项目
          continue;
        }
      }

      const sortedNames = tableNames.sort();
      console.log(`[DataExtractor] getTableNames完成: ${JSON.stringify(sortedNames)}`);
      return sortedNames;
    } catch (error) {
      console.log(
        `[DataExtractor] getTableNames异常: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  async getStatistics(): Promise<{
    totalEntries: number;
    tableCounts: Record<string, number>;
    dateRange: { earliest: number; latest: number };
  }> {
    const totalEntries = await this.count({});
    const tableNames = await this.getTableNames();

    const tableCounts: Record<string, number> = {};
    for (const tableName of tableNames) {
      tableCounts[tableName] = await this.count({ tableName });
    }

    // 计算时间范围
    const allEntries = await this.search({ limit: 1000 }); // 获取最近1000条记录来估算时间范围
    let earliest = 0;
    let latest = 0;

    if (allEntries.length > 0) {
      earliest = Math.min(...allEntries.map((e) => e.created_at));
      latest = Math.max(...allEntries.map((e) => e.created_at));
    }

    return {
      totalEntries,
      tableCounts,
      dateRange: { earliest, latest },
    };
  }

  private async getTableDirectories(): Promise<string[]> {
    // 确保 dataDir 有效
    if (!this.dataDir || typeof this.dataDir !== "string" || this.dataDir.trim() === "") {
      return [];
    }

    const tableNames = await this.getTableNames();
    return tableNames
      .filter((name) => name && typeof name === "string") // 过滤无效名称
      .map((name) => path.join(this.dataDir, name));
  }

  private async cleanupOldEntries() {
    const totalEntries = await this.count({});

    if (totalEntries > this.config.maxEntries) {
      const entriesToDelete = totalEntries - this.config.maxEntries;
      const allEntries = await this.search({ limit: entriesToDelete });

      // 删除最旧的条目
      for (const entry of allEntries) {
        await this.delete(entry.id);
      }
    }
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  private expandPath(path: string): string {
    console.log(`[DataExtractor] expandPath输入: ${path} (类型: ${typeof path})`);

    // 确保输入有效
    if (!path || typeof path !== "string" || path.trim() === "") {
      console.log(`[DataExtractor] expandPath返回默认路径: 输入无效`);
      return "~/.openclaw/data/data-extractor-data";
    }

    const trimmedPath = path.trim();
    console.log(`[DataExtractor] expandPath处理后: ${trimmedPath}`);

    if (trimmedPath.startsWith("~/")) {
      const homeDir = process.env.HOME || "";
      console.log(`[DataExtractor] HOME目录: ${homeDir}`);
      if (!homeDir) {
        console.log(`[DataExtractor] expandPath返回默认路径: HOME为空`);
        return "~/.openclaw/data/data-extractor-data";
      }
      const result = trimmedPath.replace("~", homeDir);
      console.log(`[DataExtractor] expandPath结果: ${result}`);
      return result;
    }

    console.log(`[DataExtractor] expandPath返回: ${trimmedPath}`);
    return trimmedPath;
  }

  close() {
    // 文件系统存储不需要显式关闭连接
    // 但可以在这里添加清理逻辑
  }
}
