# Data Extractor Plugin

一个使用大模型从自然语言中提取结构化数据的OpenClaw插件。

## 功能特性

- **智能数据提取**: 使用大模型从自然语言文本中提取结构化数据
- **Schema验证**: 支持自定义JSON Schema验证提取结果
- **多格式支持**: 支持联系人、产品、地址等多种预定义Schema
- **数据存储**: 自动将提取的数据存储到文件系统
- **置信度评估**: 为每个提取字段提供置信度评分
- **批量处理**: 支持批量提取和存储多个数据条目
- **数据导出**: 支持JSON和CSV格式的数据导出

## 安装

```bash
# 从本地安装
openclaw plugins install ./extensions/data-extractor

# 或者从npm安装（如果发布到npm）
npm install @openclaw/data-extractor
openclaw plugins install @openclaw/data-extractor
```

## 配置

插件支持以下配置选项：

```json
{
  "enabled": true,
  "databasePath": "~/.openclaw/data/data-extractor-data",
  "maxEntries": 10000,
  "autoValidate": true,
  "defaultConfidence": 0.7,
  "defaultProvider": "",
  "defaultModel": "",
  "allowedModels": [],
  "maxTokens": 2000,
  "timeoutMs": 30000,
  "debugMode": false,
  "fallbackToOriginal": true
}
```

### 配置说明

- **enabled**: 是否启用插件功能
- **databasePath**: 数据存储目录路径
- **maxEntries**: 最大存储条目数
- **autoValidate**: 是否自动验证数据格式
- **defaultConfidence**: 默认置信度阈值 (0-1)
- **defaultProvider**: 默认模型提供商
- **defaultModel**: 默认模型名称
- **allowedModels**: 允许使用的模型列表
- **maxTokens**: 最大token数
- **timeoutMs**: 超时时间(毫秒)
- **debugMode**: 是否启用调试模式
- **fallbackToOriginal**: 失败时是否回退到原始数据

## 使用方法

### 1. 基本使用

插件安装后可以通过CLI命令使用：

```bash
# 查看插件状态
openclaw data-extractor status

# 查看当前配置
openclaw data-extractor config
```

### 2. 测试数据提取

```bash
# 测试数据提取功能
openclaw data-extractor test "我的名字是张三，邮箱是zhangsan@example.com，电话是13800138000" '{"type":"object","properties":{"name":{"type":"string"},"email":{"type":"string"},"phone":{"type":"string"}}}'
```

### 3. 配置调整

```bash
# 启用插件
openclaw config set data-extractor.enabled true

# 设置数据库路径
openclaw config set data-extractor.databasePath "/path/to/data"

# 设置置信度阈值
openclaw config set data-extractor.defaultConfidence 0.8

# 启用调试模式
openclaw config set data-extractor.debugMode true
```

## 预定义Schema

插件提供了几种常用的数据Schema：

### 联系人信息 (CONTACT_SCHEMA)

```json
{
  "name": "姓名",
  "email": "邮箱地址",
  "phone": "电话号码",
  "company": "公司名称",
  "role": "职位角色",
  "address": "地址",
  "wechat": "微信号",
  "qq": "QQ号"
}
```

### 产品信息 (PRODUCT_SCHEMA)

```json
{
  "name": "产品名称",
  "price": "价格",
  "category": "产品分类",
  "brand": "品牌",
  "model": "型号规格",
  "description": "产品描述"
}
```

### 地址信息 (ADDRESS_SCHEMA)

```json
{
  "full_address": "完整地址",
  "province": "省份",
  "city": "城市",
  "district": "区县",
  "street": "街道地址",
  "postal_code": "邮政编码"
}
```

## 工作原理

1. **文本分析**: 接收自然语言文本和目标数据结构
2. **LLM调用**: 使用配置的大模型进行数据提取
3. **结果验证**: 根据提供的Schema验证提取结果
4. **数据清洗**: 对提取的数据进行清洗和标准化
5. **存储管理**: 将数据按表名分类存储到文件系统
6. **统计记录**: 记录提取统计信息和性能指标

## 数据存储结构

数据按表名存储在指定目录中：

```
~/.openclaw/data/data-extractor-data/
├── contacts/
│   ├── 1640995200000-abc123.json
│   └── 1640995260000-def456.json
├── products/
│   └── 1640995320000-ghi789.json
└── addresses/
    └── 1640995380000-jkl012.json
```

每个文件包含一个数据条目：

```json
{
  "id": "1640995200000-abc123",
  "data": {
    "name": "张三",
    "email": "zhangsan@example.com",
    "phone": "13800138000"
  },
  "metadata": {
    "confidence": {
      "name": 0.95,
      "email": 0.98,
      "phone": 0.92
    },
    "notes": "从文本中成功提取联系人信息",
    "warnings": [],
    "timestamp": 1640995200000,
    "source": "manual-input",
    "channel": "cli",
    "tableName": "contacts"
  },
  "created_at": 1640995200000
}
```

## 统计信息

插件会记录以下统计信息：

- 总提取次数
- 成功率
- 平均处理时间
- 总数据条目数
- 平均置信度
- 最后使用时间

统计信息保存在 `.openclaw/plugins/data-extractor/stats.json`

## API使用

### 在其他插件中使用

```typescript
import { DataExtractorService } from "@openclaw/data-extractor";

// 在你的插件中
const extractor = new DataExtractorService(api);

// 提取数据
const result = await extractor.handleDataExtraction({
  text: "我的名字是张三，邮箱是zhangsan@example.com",
  schema: CONTACT_SCHEMA,
  tableName: "contacts",
  confidence: 0.8,
});

if (result.success) {
  console.log("提取成功:", result.data);
} else {
  console.log("提取失败:", result.error);
}
```

## 故障排除

### 常见问题

1. **插件未生效**
   - 检查插件是否正确安装: `openclaw plugins list`
   - 确认配置中enabled为true

2. **提取失败**
   - 检查debug模式日志: `openclaw config set data-extractor.debugMode true`
   - 确认模型配置正确
   - 检查Schema格式是否正确

3. **性能问题**
   - 调整timeoutMs配置
   - 减少maxTokens数量
   - 检查网络连接

### 日志查看

启用调试模式后，相关日志会输出到控制台：

```bash
openclaw config set data-extractor.debugMode true
# 重启openclaw后查看日志
```

## 开发

### 本地开发

```bash
cd extensions/data-extractor
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

### v1.0.7

- 迁移到新版本API结构
- 添加配置管理和状态监控
- 改进错误处理和调试功能
- 更新文档和示例

### v1.0.6

- 初始版本发布
- 支持基本的数据提取功能
- 提供多种预定义Schema
- 支持文件存储和导出功能
