# Prompt重新整理插件使用示例

## 基本使用示例

### 1. 安装和启用插件

```bash
# 安装插件
openclaw plugins install ./extensions/prompt-reorganization

# 启用插件
openclaw config set prompt-reorganization.enabled true

# 查看插件状态
openclaw prompt-reorganization status
```

### 2. 基本配置

```bash
# 设置置信度阈值为0.8（更高要求）
openclaw config set prompt-reorganization.confidenceThreshold 0.8

# 设置最大技能数量为15
openclaw config set prompt-reorganization.maxSkills 15

# 启用调试模式
openclaw config set prompt-reorganization.debugMode true
```

### 3. 测试插件功能

```bash
# 测试重新整理功能
openclaw prompt-reorganization test "帮我写一个Python爬虫来获取天气数据"

# 查看当前配置
openclaw prompt-reorganization config
```

## 高级配置示例

### 1. 自定义Prompt模板

```bash
# 设置自定义重新整理模板
openclaw config set prompt-reorganization.customPrompt "
# 用户任务分析
请分析以下用户输入并推荐最相关的技能：

用户输入：{{prompt}}

技能库：
{{skills}}

请提供：
1. 任务类型分析
2. 推荐技能列表（最多{{maxSkills}}个）
3. 使用建议
"
```

### 2. 性能优化配置

```bash
# 对于性能要求较高的环境
openclaw config set prompt-reorganization.timeoutMs 3000
openclaw config set prompt-reorganization.maxSkills 5
openclaw config set prompt-reorganization.confidenceThreshold 0.6

# 对于质量要求较高的环境
openclaw config set prompt-reorganization.timeoutMs 10000
openclaw config set prompt-reorganization.maxSkills 20
openclaw config set prompt-reorganization.confidenceThreshold 0.9
```

### 3. 生产环境配置

```bash
# 生产环境推荐配置
openclaw config set prompt-reorganization.enabled true
openclaw config set prompt-reorganization.confidenceThreshold 0.7
openclaw config set prompt-reorganization.maxSkills 10
openclaw config set prompt-reorganization.timeoutMs 5000
openclaw config set prompt-reorganization.debugMode false
openclaw config set prompt-reorganization.fallbackToOriginal true
```

## 实际使用场景

### 场景1：开发任务

**用户输入**: "我需要创建一个React组件来显示用户列表"

**插件处理后**:

```
我需要创建一个React组件来显示用户列表

---

[智能分析与Skill推荐]:
**任务分析**: 用户需要创建React前端组件
**推荐技能列表**:
1. <skill><name>react</name><description>React前端框架</description><location>/skills/react</location></skill>
2. <skill><name>component-development</name><description>组件开发最佳实践</description><location>/skills/component-dev</location></skill>
3. <skill><name>javascript</name><description>JavaScript编程语言</description><location>/skills/javascript</location></skill>

**IMPORTANT RULE:**
- If exactly one skill clearly applies: read its SKILL.md at <location> with `read`, then follow it.
- If multiple could apply: choose the most specific one, then read/follow it.
- If none clearly apply: do not read any SKILL.md.
```

### 场景2：数据分析任务

**用户输入**: "分析销售数据并生成图表报告"

**插件处理后**:

```
分析销售数据并生成图表报告

---

[智能分析与Skill推荐]:
**任务分析**: 数据分析和可视化任务
**推荐技能列表**:
1. <skill><name>data-analysis</name><description>数据分析工具和方法</description><location>/skills/data-analysis</location></skill>
2. <skill><name>python-pandas</name><description>Python数据分析库</description><location>/skills/pandas</location></skill>
3. <skill><name>chart-generation</name><description>图表生成工具</description><location>/skills/charts</location></skill>

**IMPORTANT RULE:**
- If exactly one skill clearly applies: read its SKILL.md at <location> with `read`, then follow it.
- If multiple could apply: choose the most specific one, then read/follow it.
- If none clearly apply: do not read any SKILL.md.
```

### 场景3：运维任务

**用户输入**: "设置Docker容器化部署"

**插件处理后**:

```
设置Docker容器化部署

---

[智能分析与Skill推荐]:
**任务分析**: 容器化部署任务
**推荐技能列表**:
1. <skill><name>docker</name><description>Docker容器技术</description><location>/skills/docker</location></skill>
2. <skill><name>deployment</name><description>应用部署最佳实践</description><location>/skills/deployment</location></skill>
3. <skill><name>container-orchestration</name><description>容器编排技术</description><location>/skills/orchestration</location></skill>

**IMPORTANT RULE:**
- If exactly one skill clearly applies: read its SKILL.md at <location> with `read`, then follow it.
- If multiple could apply: choose the most specific one, then read/follow it.
- If none clearly apply: do not read any SKILL.md.
```

## 监控和调试

### 1. 查看使用统计

```bash
# 查看详细统计信息
openclaw prompt-reorganization status

# 输出示例:
# === Prompt Reorganization Status ===
# Enabled: true
# Total reorganizations: 156
# Success rate: 94.2%
# Average processing time: 1250ms
# Last used: 2024-03-13T10:30:00.000Z
```

### 2. 调试模式日志

启用调试模式后，可以看到详细的处理日志：

```
[PromptReorganization] Starting prompt reorganization for session abc123
[PromptReorganization] Plugin reorganized prompt: original=150, reorganized=450, metadata={"skillsUsed":["python","web-scraping"],"confidence":0.8,"processingTime":1200}
[PromptReorganization] Prompt reorganization completed in 1200ms
```

### 3. 错误排查

```bash
# 检查插件是否正确安装
openclaw plugins list | grep prompt-reorganization

# 检查配置是否正确
openclaw config get prompt-reorganization

# 测试插件连接
openclaw prompt-reorganization test "测试消息"
```

## 性能优化建议

### 1. 根据环境调整配置

**开发环境**:

```bash
openclaw config set prompt-reorganization.debugMode true
openclaw config set prompt-reorganization.timeoutMs 10000
```

**生产环境**:

```bash
openclaw config set prompt-reorganization.debugMode false
openclaw config set prompt-reorganization.timeoutMs 3000
openclaw config set prompt-reorganization.maxSkills 8
```

### 2. 监控关键指标

- **成功率**: 应该保持在90%以上
- **平均处理时间**: 应该小于2秒
- **超时率**: 应该低于5%

### 3. 常见性能问题解决

**问题1: 处理时间过长**

```bash
# 减少技能数量
openclaw config set prompt-reorganization.maxSkills 5

# 降低置信度阈值
openclaw config set prompt-reorganization.confidenceThreshold 0.6
```

**问题2: 成功率低**

```bash
# 提高超时时间
openclaw config set prompt-reorganization.timeoutMs 8000

# 降低置信度要求
openclaw config set prompt-reorganization.confidenceThreshold 0.5
```

## 集成到工作流

### 1. 与其他插件协作

Prompt重新整理插件可以与其他插件协作，例如：

- **与技能库插件协作**: 获取更准确的技能推荐
- **与监控插件协作**: 收集性能数据
- **与配置管理插件协作**: 动态调整参数

### 2. 自定义工作流

```bash
# 创建自定义工作流脚本
#!/bin/bash
# prompt-workflow.sh

echo "检查插件状态..."
openclaw prompt-reorganization status

echo "运行测试..."
openclaw prompt-reorganization test "$1"

echo "查看配置..."
openclaw prompt-reorganization config
```

### 3. 批量处理

```bash
# 批量测试多个prompt
for prompt in "写Python脚本" "创建数据库" "部署应用"; do
  openclaw prompt-reorganization test "$prompt"
done
```

## 故障排除指南

### 1. 插件未启动

**症状**: 插件不工作，没有重新整理效果

**解决方案**:

```bash
# 检查插件是否安装
openclaw plugins list

# 重新安装插件
openclaw plugins uninstall prompt-reorganization
openclaw plugins install ./extensions/prompt-reorganization

# 检查配置
openclaw config set prompt-reorganization.enabled true
```

### 2. 重新整理失败

**症状**: 提示重新整理失败

**解决方案**:

```bash
# 启用调试模式查看详细错误
openclaw config set prompt-reorganization.debugMode true

# 检查网络连接
ping api.openclaw.ai

# 调整超时时间
openclaw config set prompt-reorganization.timeoutMs 10000
```

### 3. 性能问题

**症状**: 处理速度慢或超时

**解决方案**:

```bash
# 优化配置
openclaw config set prompt-reorganization.maxSkills 5
openclaw config set prompt-reorganization.timeoutMs 3000

# 检查系统资源
top | grep openclaw
```

## 最佳实践

### 1. 配置管理

- 在开发环境中启用调试模式
- 在生产环境中关闭调试模式
- 定期检查和调整参数
- 使用版本控制管理配置文件

### 2. 监控和维护

- 定期查看使用统计
- 设置告警阈值
- 备份重要配置
- 及时更新插件版本

### 3. 用户体验

- 根据用户反馈调整参数
- 提供清晰的状态反馈
- 确保失败时的优雅降级
- 保持输出格式的一致性

通过这些示例和最佳实践，您可以更好地使用和优化Prompt重新整理插件。
