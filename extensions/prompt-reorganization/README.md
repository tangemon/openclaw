# Prompt重新整理插件

一个智能分析用户输入并推荐相关技能的OpenClaw插件。

## 功能特性

- **智能分析**: 自动分析用户输入，理解任务意图
- **技能推荐**: 基于技能库智能推荐最相关的技能
- **可配置**: 支持自定义参数和阈值
- **统计监控**: 提供使用统计和性能监控
- **容错处理**: 支持失败回退到原始prompt

## 安装

```bash
# 从本地安装
openclaw plugins install ./extensions/prompt-reorganization

# 或者从npm安装（如果发布到npm）
npm install @openclaw/prompt-reorganization
openclaw plugins install @openclaw/prompt-reorganization
```

## 配置

插件支持以下配置选项：

```json
{
  "enabled": true,
  "confidenceThreshold": 0.7,
  "maxSkills": 10,
  "timeoutMs": 5000,
  "customPrompt": "",
  "debugMode": false,
  "fallbackToOriginal": true
}
```

### 配置说明

- **enabled**: 是否启用插件功能
- **confidenceThreshold**: 重新整理结果的置信度阈值 (0-1)
- **maxSkills**: 最大推荐技能数量 (1-20)
- **timeoutMs**: 重新整理超时时间 (毫秒)
- **customPrompt**: 自定义重新整理prompt模板
- **debugMode**: 是否启用调试模式
- **fallbackToOriginal**: 失败时是否回退到原始prompt

## 使用方法

### 1. 基本使用

插件安装后会自动启用，在每次agent运行时会自动进行prompt重新整理。

### 2. 命令行管理

```bash
# 查看插件状态
openclaw prompt-reorganization status

# 查看当前配置
openclaw prompt-reorganization config

# 测试重新整理功能
openclaw prompt-reorganization test "帮我写一个Python爬虫"
```

### 3. 配置调整

```bash
# 启用插件
openclaw config set prompt-reorganization.enabled true

# 调整置信度阈值
openclaw config set prompt-reorganization.confidenceThreshold 0.8

# 设置最大技能数量
openclaw config set prompt-reorganization.maxSkills 15

# 启用调试模式
openclaw config set prompt-reorganization.debugMode true
```

## 工作原理

1. **分析阶段**: 插件接收原始prompt和技能库信息
2. **临时会话**: 创建临时AI会话进行重新整理分析
3. **智能匹配**: 分析用户输入并匹配最相关的技能
4. **结果整合**: 将分析结果整合到原始prompt中
5. **质量检查**: 验证重新整理结果的质量和置信度

## 输出格式

重新整理后的prompt会包含以下结构：

```
原始用户输入

---

[智能分析与Skill推荐]:
<技能分析结果>

**IMPORTANT RULE:**
- If exactly one skill clearly applies: read its SKILL.md at <location> with `read`, then follow it.
- If multiple could apply: choose the most specific one, then read/follow it.
- If none clearly apply: do not read any SKILL.md.
```

## 统计信息

插件会记录以下统计信息：

- 总重新整理次数
- 成功率
- 平均处理时间
- 最后使用时间

统计信息保存在 `.openclaw/plugins/prompt-reorganization/stats.json`

## 故障排除

### 常见问题

1. **插件未生效**
   - 检查插件是否正确安装: `openclaw plugins list`
   - 确认配置中enabled为true

2. **重新整理失败**
   - 检查debug模式日志: `openclaw config set prompt-reorganization.debugMode true`
   - 确认fallbackToOriginal设置为true以保证功能可用性

3. **性能问题**
   - 调整timeoutMs配置
   - 减少maxSkills数量
   - 检查网络连接

### 日志查看

启用调试模式后，相关日志会输出到控制台：

```bash
openclaw config set prompt-reorganization.debugMode true
# 重启openclaw后查看日志
```

## 开发

### 本地开发

```bash
cd extensions/prompt-reorganization
npm install
npm run dev
```

### 测试

```bash
npm test
```

### 构建

```bash
npm run build
```

## 贡献

欢迎提交Issue和Pull Request来改进这个插件。

## 许可证

MIT License

## 更新日志

### v1.0.0

- 初始版本发布
- 支持基本的prompt重新整理功能
- 提供配置管理和统计功能
- 支持命令行管理界面
