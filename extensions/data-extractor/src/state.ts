export class DataExtractorState {
  private stats = {
    totalExtractions: 0,
    successfulExtractions: 0,
    averageProcessingTime: 0,
    lastUsed: null as Date | null,
    totalDataEntries: 0,
    averageConfidence: 0,
  };

  async recordUsage(processingTime: number, success: boolean, confidence?: number): Promise<void> {
    this.stats.totalExtractions++;
    if (success) {
      this.stats.successfulExtractions++;
    }

    // 计算新的平均处理时间
    if (this.stats.averageProcessingTime === 0) {
      this.stats.averageProcessingTime = processingTime;
    } else {
      this.stats.averageProcessingTime = (this.stats.averageProcessingTime + processingTime) / 2;
    }

    // 更新置信度统计
    if (confidence !== undefined) {
      if (this.stats.averageConfidence === 0) {
        this.stats.averageConfidence = confidence;
      } else {
        this.stats.averageConfidence = (this.stats.averageConfidence + confidence) / 2;
      }
    }

    this.stats.lastUsed = new Date();

    await this.saveStats();
  }

  async incrementDataEntries(count: number = 1): Promise<void> {
    this.stats.totalDataEntries += count;
    await this.saveStats();
  }

  async getStats() {
    return {
      ...this.stats,
      successRate:
        this.stats.totalExtractions > 0
          ? this.stats.successfulExtractions / this.stats.totalExtractions
          : 0,
    };
  }

  private async saveStats(): Promise<void> {
    try {
      // 这里可以将统计数据保存到文件系统或数据库
      // 暂时使用localStorage或文件系统
      const fs = await import("node:fs/promises");
      const path = await import("node:path");

      const statsDir = path.join(process.cwd(), ".openclaw", "plugins", "data-extractor");
      const statsFile = path.join(statsDir, "stats.json");

      // 确保目录存在
      await fs.mkdir(statsDir, { recursive: true });

      // 保存统计数据
      await fs.writeFile(statsFile, JSON.stringify(this.stats, null, 2));
    } catch (error) {
      // 静默失败，不影响主流程
      console.warn("Failed to save data extractor stats:", error);
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
        "data-extractor",
        "stats.json",
      );

      const data = await fs.readFile(statsFile, "utf-8");
      const loadedStats = JSON.parse(data);

      // 合并加载的统计数据
      this.stats = { ...this.stats, ...loadedStats };
    } catch (error) {
      // 文件不存在或读取失败，使用默认统计
      console.debug("No existing data extractor stats found, starting fresh");
    }
  }

  async resetStats(): Promise<void> {
    this.stats = {
      totalExtractions: 0,
      successfulExtractions: 0,
      averageProcessingTime: 0,
      lastUsed: null,
      totalDataEntries: 0,
      averageConfidence: 0,
    };

    await this.saveStats();
  }
}
