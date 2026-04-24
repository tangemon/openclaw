export class PromptReorganizationState {
  private stats = {
    totalReorganizations: 0,
    successfulReorganizations: 0,
    averageProcessingTime: 0,
    lastUsed: null as Date | null,
  };

  async recordUsage(processingTime: number, success: boolean): Promise<void> {
    this.stats.totalReorganizations++;
    if (success) {
      this.stats.successfulReorganizations++;
    }

    // 计算新的平均处理时间
    if (this.stats.averageProcessingTime === 0) {
      this.stats.averageProcessingTime = processingTime;
    } else {
      this.stats.averageProcessingTime = (this.stats.averageProcessingTime + processingTime) / 2;
    }

    this.stats.lastUsed = new Date();

    await this.saveStats();
  }

  async getStats() {
    return {
      ...this.stats,
      successRate:
        this.stats.totalReorganizations > 0
          ? this.stats.successfulReorganizations / this.stats.totalReorganizations
          : 0,
    };
  }

  private async saveStats(): Promise<void> {
    try {
      // 这里可以将统计数据保存到文件系统或数据库
      // 暂时使用localStorage或文件系统
      const fs = await import("node:fs/promises");
      const path = await import("node:path");

      const statsDir = path.join(process.cwd(), ".openclaw", "plugins", "prompt-reorganization");
      const statsFile = path.join(statsDir, "stats.json");

      // 确保目录存在
      await fs.mkdir(statsDir, { recursive: true });

      // 保存统计数据
      await fs.writeFile(statsFile, JSON.stringify(this.stats, null, 2));
    } catch (error) {
      // 静默失败，不影响主流程
      console.warn("Failed to save prompt reorganization stats:", error);
    }
  }

  async loadStats(): Promise<void> {
    try {
      const fs = await import("node:fs/promises");
      const path = await import("node:path");

      const statsFile = path.join(
        process.cwd(),
        ".openclaw",
        "plugins",
        "prompt-reorganization",
        "stats.json",
      );

      const data = await fs.readFile(statsFile, "utf-8");
      const loadedStats = JSON.parse(data);

      // 合并加载的统计数据
      this.stats = { ...this.stats, ...loadedStats };
    } catch (error) {
      // 文件不存在或读取失败，使用默认统计
      console.debug("No existing prompt reorganization stats found, starting fresh");
    }
  }

  async resetStats(): Promise<void> {
    this.stats = {
      totalReorganizations: 0,
      successfulReorganizations: 0,
      averageProcessingTime: 0,
      lastUsed: null,
    };

    await this.saveStats();
  }
}
