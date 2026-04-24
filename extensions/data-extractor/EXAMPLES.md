# Data Extractor Plugin 使用示例

## 基本使用示例

### 1. 安装和启用插件

```bash
# 安装插件
openclaw plugins install ./extensions/data-extractor

# 启用插件
openclaw config set data-extractor.enabled true

# 查看插件状态
openclaw data-extractor status
```

### 2. 基本配置

```bash
# 设置数据库路径
openclaw config set data-extractor.databasePath "~/my-extracted-data"

# 设置置信度阈值为0.8（更高要求）
openclaw config set data-extractor.defaultConfidence 0.8

# 设置最大token数
openclaw config set data-extractor.maxTokens 1500

# 启用调试模式
openclaw config set data-extractor.debugMode true
```

### 3. 测试数据提取功能

```bash
# 简单联系人信息提取
openclaw data-extractor test "我叫张三，邮箱是zhangsan@company.com，电话是13812345678" '{"type":"object","properties":{"name":{"type":"string"},"email":{"type":"string"},"phone":{"type":"string"}},"required":["name"]}'

# 产品信息提取
openclaw data-extractor test "我需要购买一台苹果MacBook Pro，预算大约15000元，主要用于编程开发" '{"type":"object","properties":{"product":{"type":"string"},"brand":{"type":"string"},"price":{"type":"number"},"category":{"type":"string"},"purpose":{"type":"string"}}}'
```

## 高级配置示例

### 1. 自定义模型配置

```bash
# 设置默认模型提供商和模型
openclaw config set data-extractor.defaultProvider "openai"
openclaw config set data-extractor.defaultModel "gpt-4"

# 限制允许的模型列表
openclaw config set data-extractor.allowedModels '["openai/gpt-4", "openai/gpt-3.5-turbo"]'

# 设置超时时间
openclaw config set data-extractor.timeoutMs 45000
```

### 2. 性能优化配置

```bash
# 对于快速处理要求
openclaw config set data-extractor.timeoutMs 10000
openclaw config set data-extractor.maxTokens 1000
openclaw config set data-extractor.defaultConfidence 0.6

# 对于高质量提取要求
openclaw config set data-extractor.timeoutMs 60000
openclaw config set data-extractor.maxTokens 3000
openclaw config set data-extractor.defaultConfidence 0.9
```

### 3. 生产环境配置

```bash
# 生产环境推荐配置
openclaw config set data-extractor.enabled true
openclaw config set data-extractor.databasePath "/var/openclaw/data-extractor"
openclaw config set data-extractor.maxEntries 50000
openclaw config set data-extractor.autoValidate true
openclaw config set data-extractor.debugMode false
openclaw config set data-extractor.fallbackToOriginal true
```

## 实际使用场景

### 场景1：联系人信息提取

**用户输入**: "我刚认识了一个新朋友，他叫李明，在腾讯工作，邮箱是liming@tencent.com，手机是13900139000，住在深圳市南山区"

**插件处理后**:

```bash
openclaw data-extractor test "我刚认识了一个新朋友，他叫李明，在腾讯工作，邮箱是liming@tencent.com，手机是13900139000，住在深圳市南山区" '{"type":"object","properties":{"name":{"type":"string"},"company":{"type":"string"},"email":{"type":"string"},"phone":{"type":"string"},"address":{"type":"string"}},"required":["name"]}'
```

**预期输出**:

```json
{
  "success": true,
  "data": {
    "name": "李明",
    "company": "腾讯",
    "email": "liming@tencent.com",
    "phone": "13900139000",
    "address": "深圳市南山区"
  },
  "metadata": {
    "confidence": {
      "name": 0.98,
      "company": 0.95,
      "email": 0.99,
      "phone": 0.97,
      "address": 0.92
    },
    "notes": "成功从文本中提取联系人信息",
    "warnings": []
  }
}
```

### 场景2：产品信息提取

**用户输入**: "我想买一台联想ThinkPad X1 Carbon，预算8000左右，主要用于办公，需要轻便一些的"

**插件处理后**:

```bash
openclaw data-extractor test "我想买一台联想ThinkPad X1 Carbon，预算8000左右，主要用于办公，需要轻便一些的" '{"type":"object","properties":{"product":{"type":"string"},"brand":{"type":"string"},"model":{"type":"string"},"price":{"type":"number"},"category":{"type":"string"},"purpose":{"type":"string"},"features":{"type":"array","items":{"type":"string"}}}}'
```

### 场景3：地址信息提取

**用户输入**: "请把货物送到北京市朝阳区建国门外大街1号国贸大厦A座2001室，邮编100004"

**插件处理后**:

```bash
openclaw data-extractor test "请把货物送到北京市朝阳区建国门外大街1号国贸大厦A座2001室，邮编100004" '{"type":"object","properties":{"full_address":{"type":"string"},"province":{"type":"string"},"city":{"type":"string"},"district":{"type":"string"},"street":{"type":"string"},"postal_code":{"type":"string"}},"required":["full_address"]}'
```

## 批量处理示例

### 1. 创建批量处理脚本

```bash
#!/bin/bash
# batch-extract.sh

echo "开始批量数据提取..."

# 联系人信息提取
echo "提取联系人信息..."
openclaw data-extractor test "联系人：张伟，电话：13800138001，邮箱：zhangwei@email.com" '{"type":"object","properties":{"name":{"type":"string"},"phone":{"type":"string"},"email":{"type":"string"}},"required":["name"]}'

openclaw data-extractor test "联系人：王丽，电话：13800138002，邮箱：wangli@email.com" '{"type":"object","properties":{"name":{"type":"string"},"phone":{"type":"string"},"email":{"type":"string"}},"required":["name"]}'

# 产品信息提取
echo "提取产品信息..."
openclaw data-extractor test "产品：iPhone 14，价格：5999元，品牌：苹果" '{"type":"object","properties":{"product":{"type":"string"},"price":{"type":"number"},"brand":{"type":"string"}},"required":["product"]}'

echo "批量提取完成！"
```

### 2. 运行批量处理

```bash
chmod +x batch-extract.sh
./batch-extract.sh
```

## 监控和调试

### 1. 查看使用统计

```bash
# 查看详细统计信息
openclaw data-extractor status

# 输出示例:
# === Data Extractor Status ===
# Enabled: true
# Total extractions: 156
# Success rate: 94.2%
# Average processing time: 1250ms
# Total data entries: 234
# Average confidence: 0.87
# Last used: 2024-03-13T10:30:00.000Z
```

### 2. 调试模式日志

启用调试模式后，可以看到详细的处理日志：

```
[DataExtractor] 开始数据提取: contacts
[DataExtractor] Prompt构建完成，systemPrompt长度: 450, prompt长度: 180
[DataExtractor] 调用LLM...
[DataExtractor] LLM调用完成: {"text": "{\n  \"extracted_data\": {...}\n}"}
[DataExtractor] 验证和处理数据...
[DataExtractor] 数据处理完成: {"data": {...}, "metadata": {...}}
[DataExtractor] 存储到数据库...
[DataExtractor] 数据库存储完成: {"id": "1640995200000-abc123", "success": true}
[DataExtractor] 数据提取完成: 成功
```

### 3. 错误排查

```bash
# 检查插件是否正确安装
openclaw plugins list | grep data-extractor

# 检查配置是否正确
openclaw config get data-extractor

# 测试插件连接
openclaw data-extractor test "测试消息" '{"type":"object","properties":{"test":{"type":"string"}}}'
```

## 性能优化建议

### 1. 根据环境调整配置

**开发环境**:

```bash
openclaw config set data-extractor.debugMode true
openclaw config set data-extractor.timeoutMs 30000
openclaw config set data-extractor.defaultConfidence 0.6
```

**生产环境**:

```bash
openclaw config set data-extractor.debugMode false
openclaw config set data-extractor.timeoutMs 15000
openclaw config set data-extractor.maxTokens 1500
```

### 2. 监控关键指标

- **成功率**: 应该保持在90%以上
- **平均处理时间**: 应该小于3秒
- **超时率**: 应该低于5%
- **平均置信度**: 应该保持在0.8以上

### 3. 常见性能问题解决

**问题1: 处理时间过长**

```bash
# 减少token数量
openclaw config set data-extractor.maxTokens 1000

# 降低置信度要求
openclaw config set data-extractor.defaultConfidence 0.6

# 简化schema
```

**问题2: 成功率低**

```bash
# 提高超时时间
openclaw config set data-extractor.timeoutMs 45000

# 降低置信度要求
openclaw config set data-extractor.defaultConfidence 0.5

# 检查模型配置
```

## 集成到工作流

### 1. 与其他插件协作

Data Extractor插件可以与其他插件协作，例如：

- **与Webhook插件协作**: 自动提取收到的消息中的数据
- **与数据库插件协作**: 将提取的数据存储到数据库
- **与通知插件协作**: 提取完成后发送通知

### 2. 自定义工作流

```bash
#!/bin/bash
# data-extraction-workflow.sh

echo "启动数据提取工作流..."

# 1. 检查插件状态
openclaw data-extractor status

# 2. 运行测试提取
openclaw data-extractor test "测试数据提取功能" '{"type":"object","properties":{"test":{"type":"string"}}}'

# 3. 查看配置
openclaw data-extractor config

# 4. 清理旧数据（可选）
# openclaw data-extractor reset-stats
```

### 3. 定时任务集成

创建cron任务定期运行数据提取：

```bash
# 编辑crontab
crontab -e

# 添加定时任务（每小时运行一次）
0 * * * * /path/to/data-extraction-workflow.sh >> /var/log/data-extractor.log 2>&1
```

## 故障排除指南

### 1. 插件未启动

**症状**: 插件不工作，没有提取效果

**解决方案**:

```bash
# 检查插件是否安装
openclaw plugins list

# 重新安装插件
openclaw plugins uninstall data-extractor
openclaw plugins install ./extensions/data-extractor

# 检查配置
openclaw config set data-extractor.enabled true
```

### 2. 提取失败

**症状**: 提示提取失败或返回空结果

**解决方案**:

```bash
# 启用调试模式查看详细错误
openclaw config set data-extractor.debugMode true

# 检查网络连接
ping api.openclaw.ai

# 调整超时时间
openclaw config set data-extractor.timeoutMs 30000

# 检查模型配置
openclaw config set data-extractor.defaultProvider "openai"
openclaw config set data-extractor.defaultModel "gpt-3.5-turbo"
```

### 3. 性能问题

**症状**: 处理速度慢或超时

**解决方案**:

```bash
# 优化配置
openclaw config set data-extractor.maxTokens 1000
openclaw config set data-extractor.timeoutMs 15000

# 检查系统资源
top | grep openclaw

# 清理旧数据
openclaw data-extractor reset-stats
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

通过这些示例和最佳实践，您可以更好地使用和优化Data Extractor插件。
