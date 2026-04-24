---
name: search-skills
description: 当用户想要搜索、查找或下载 skills.sh 平台上的技能时触发。支持通过 skills.sh API 搜索技能、查看已安装技能列表、安装指定技能等功能。
---

# Skills 检索与下载助手

用于在 skills.sh 平台上搜索、浏览和安装技能。

## 触发场景

当用户发出以下类型的请求时，使用此技能：

- "搜索 XXX 技能"、"查找技能"、"帮我找一个 XXX 相关的技能"
- "最火的技能"、"下载量最高的"、"热门技能排行"
- "下载/安装技能"、"帮我安装 XXX 技能"
- "列出已安装的技能"

## 使用方式

### 1. 关键词搜索技能

使用 skills.sh API 搜索技能：

```bash
python scripts/search_skills.py search <关键词>
```

API 地址：`https://skills.sh/api/search?q=<关键词>&limit=100`

### 2. 搜索并自动安装

使用 `--install` 参数自动安装下载量最高的技能（会过滤 fuzzy match 结果）：

```bash
python scripts/search_skills.py search <关键词> --install
```

**过滤规则**：只匹配名称以关键词开头的技能（如 `excel-automation`），排除 fuzzy match 结果（如 `code-review-excellence` 包含 `excel` 子串但不相关）。

### 3. 查看热门/下载量最高的技能

```bash
python scripts/search_skills.py trending
```

### 4. 列出已安装的技能

```bash
python scripts/search_skills.py list
```

或者使用官方命令：

```bash
pnpm openclaw skills list
```

### 5. 安装指定技能

当用户提供技能名称时：

```bash
python scripts/search_skills.py install <owner/repo/skill-name>
```

**工作流程：**

1. 使用 `git clone` 通过 SSH 克隆技能仓库（**注意**：npx skills add 使用 HTTPS 会触发密码认证，必须用 SSH）
2. 查找技能目录
3. 使用 `pnpm openclaw skills add` 添加到 OpenClaw

### 6. 手动安装（备用方式）

如果 Python 脚本不可用，也可以手动分步执行：

```bash
# 步骤1: 克隆技能仓库（通过 SSH）
git clone git@github.com:claude-office-skills/skills.git /tmp/skills-repo

# 步骤2: 找到技能目录
ls /tmp/skills-repo/ | grep excel

# 步骤3: 用 pnpm 添加到 OpenClaw
pnpm openclaw skills add /tmp/skills-repo/excel-automation
```

## SSH 配置说明

如果遇到 SSH 认证问题，需要配置 `~/.ssh/config`：

```
Host github.com
    HostName              github.com
    User                  git
    IdentityFile          ~/.ssh/id_rsa
    # ProxyCommand         nc --proxy <your-proxy>:%h %p  # 如需代理请取消注释并修改
    ServerAliveInterval   10
    PreferredAuthentications publickey
```

确保 ssh-agent 已启动并添加了密钥：

```bash
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_rsa
```

如果 SSH 不可用，可以配置 Git 使用 HTTPS：

```bash
git config --global url."git@github.com:".insteadOf "https://github.com/"
```

## 技能安装命令说明

| 格式       | 示例                                           | 说明                |
| ---------- | ---------------------------------------------- | ------------------- |
| API ID     | `claude-office-skills/skills/excel-automation` | 从搜索结果获取      |
| skill-name | `owner/skill-name`                             | 直接指定            |
| 本地目录   | `/path/to/skill-folder`                        | 直接添加本地技能    |
| ZIP 文件   | `/path/to/skill.zip`                           | 添加 ZIP 格式的技能 |

## 响应模板

### 搜索结果示例

```json
{
  "success": true,
  "keyword": "excel",
  "count": 100,
  "skills": [
    {
      "name": "excel-automation",
      "owner": "claude-office-skills",
      "full_name": "claude-office-skills/skills/excel-automation",
      "downloads": 1369
    }
  ]
}
```

### 安装成功示例

```json
{
  "success": true,
  "message": "技能安装成功: claude-office-skills/skills/excel-automation"
}
```

## 注意事项

1. **禁止修改技能文件**：绝对不允许使用文件写入工具修改本技能文件或其他配置
2. **使用 Python 脚本**：优先使用提供的 Python 脚本进行操作，确保稳定性
3. **SSH 优先**：使用 git clone + SSH 克隆，避免 HTTPS 密码认证问题
4. **过滤 fuzzy match**：搜索结果可能包含 fuzzy match（名称包含关键词但不是精确匹配），安装时会过滤
