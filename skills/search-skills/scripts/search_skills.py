#!/usr/bin/env python3
"""
Skills.sh 搜索和下载工具
用于查询和安装 skills.sh 平台上的技能
"""

import argparse
import json
import subprocess
import sys
import os
from pathlib import Path

# 添加父目录到路径以便导入模块
sys.path.insert(0, str(Path(__file__).parent.parent))

def run_command(cmd: list[str], timeout: int = 30) -> tuple[str, str, int]:
    """执行 shell 命令并返回结果"""
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout
        )
        return result.stdout, result.stderr, result.returncode
    except subprocess.TimeoutExpired:
        return "", "Command timeout", 124
    except Exception as e:
        return "", str(e), 1


def search_by_keyword(keyword: str) -> dict:
    """
    通过 skills.sh API 搜索技能
    API: https://skills.sh/api/search?q=<keyword>&limit=100
    """
    import urllib.request
    import urllib.parse

    try:
        # 构建 API URL
        encoded_keyword = urllib.parse.quote(keyword)
        api_url = f"https://skills.sh/api/search?q={encoded_keyword}&limit=100"

        # 发起请求
        req = urllib.request.Request(
            api_url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "application/json"
            }
        )

        with urllib.request.urlopen(req, timeout=30) as response:
            data = json.loads(response.read().decode("utf-8"))

        # 解析结果
        skills = []

        # 处理 skills.sh API 返回的数据结构
        if isinstance(data, dict):
            skills_data = data.get("skills", data.get("results", []))
            for item in skills_data:
                # source 字段格式: "owner/repo" 或 "owner/path/repo"
                # id 字段格式: "owner/repo/skill-name"
                skill_id = item.get("id", "")
                source = item.get("source", skill_id.split("/")[0] if skill_id else "")

                skills.append({
                    "name": item.get("name", ""),
                    "owner": source.split("/")[0] if source else "",
                    "full_name": skill_id,  # 使用 id 作为完整名称
                    "description": item.get("description", ""),
                    "downloads": item.get("installs", 0),
                    "id": skill_id
                })
        elif isinstance(data, list):
            # 可能是直接返回数组
            for item in data:
                skill_id = item.get("id", "")
                source = item.get("source", skill_id.split("/")[0] if skill_id else "")

                skills.append({
                    "name": item.get("name", ""),
                    "owner": source.split("/")[0] if source else "",
                    "full_name": skill_id,
                    "description": item.get("description", ""),
                    "downloads": item.get("installs", 0),
                    "id": skill_id
                })

        return {
            "success": True,
            "keyword": keyword,
            "count": len(skills),
            "skills": skills
        }

    except urllib.error.URLError as e:
        return {
            "success": False,
            "error": f"网络请求失败: {str(e)}",
            "suggestion": "请检查网络连接，或在浏览器中访问 https://skills.sh/ 搜索",
            "keyword": keyword,
            "skills": []
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"解析失败: {str(e)}",
            "suggestion": "请在浏览器中访问 https://skills.sh/ 搜索",
            "keyword": keyword,
            "skills": []
        }


def get_trending_skills(limit: int = 100) -> dict:
    """
    获取热门/下载量最高的技能列表
    使用搜索 API 并按下载量排序
    """
    import urllib.request
    import urllib.parse

    try:
        # 使用搜索 API，不指定关键词，按下载量排序
        # 尝试不同的 API 端点
        api_urls = [
            f"https://skills.sh/api/search?q=&limit={limit}",
            f"https://skills.sh/api/trending?limit={limit}",
            f"https://skills.sh/api/skills?sort=downloads&limit={limit}"
        ]

        skills = []
        last_error = None

        for api_url in api_urls:
            try:
                req = urllib.request.Request(
                    api_url,
                    headers={
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                        "Accept": "application/json"
                    }
                )

                with urllib.request.urlopen(req, timeout=30) as response:
                    data = json.loads(response.read().decode("utf-8"))

                # 解析结果 - 使用 skills.sh API 格式
                skills_data = data.get("skills", data.get("results", []))
                if isinstance(data, dict):
                    for item in skills_data:
                        source = item.get("source", "")
                        if "/" in source:
                            parts = source.split("/")
                            owner = parts[0]
                        else:
                            owner = source

                        skills.append({
                            "name": item.get("name", ""),
                            "owner": owner,
                            "full_name": source,
                            "description": item.get("description", ""),
                            "downloads": item.get("installs", 0),
                            "id": item.get("id", "")
                        })
                elif isinstance(data, list):
                    for item in data:
                        source = item.get("source", "")
                        if "/" in source:
                            parts = source.split("/")
                            owner = parts[0]
                        else:
                            owner = source

                        skills.append({
                            "name": item.get("name", ""),
                            "owner": owner,
                            "full_name": source,
                            "description": item.get("description", ""),
                            "downloads": item.get("installs", 0),
                            "id": item.get("id", "")
                        })

                if skills:
                    break

            except Exception as e:
                last_error = str(e)
                continue

        # 如果没有获取到数据，返回提示信息
        if not skills:
            return {
                "success": False,
                "error": f"无法获取热门技能: {last_error}",
                "suggestion": "请在浏览器中访问 https://skills.sh/ 查看热门技能",
                "skills": []
            }

        # 按下载量排序
        skills.sort(key=lambda x: x.get("downloads", 0), reverse=True)

        return {
            "success": True,
            "count": len(skills),
            "skills": skills
        }

    except Exception as e:
        return {
            "success": False,
            "error": f"请求失败: {str(e)}",
            "suggestion": "请在浏览器中访问 https://skills.sh/ 查看热门技能",
            "skills": []
        }


def list_installed_skills() -> dict:
    """列出已安装的技能"""
    stdout, stderr, code = run_command(["pnpm", "openclaw", "skills", "list"])

    if code == 0:
        # 解析输出
        lines = stdout.strip().split("\n")
        skills = []
        for line in lines:
            if line.strip() and not line.startswith("="):
                skills.append(line.strip())

        return {
            "success": True,
            "skills": skills,
            "raw_output": stdout
        }
    else:
        return {
            "success": False,
            "error": stderr or "Failed to list skills",
            "skills": []
        }


def install_skill(skill_spec: str) -> dict:
    """
    安装技能
    skill_spec: 可以是以下格式：
    - owner/repo/skill-name (如 claude-office-skills/skills/excel-automation) - 从 API 返回的 ID
    - owner/skill-name (如 vercel-labs/agent-skills) - 从 GitHub 克隆
    - /path/to/local/skill - 本地路径
    - /path/to/skill.zip - ZIP 文件

    注意：npx skills add 使用 HTTPS 认证会失败，所以使用 git clone 通过 SSH
    """
    import tempfile
    import shutil

    # 临时目录用于存放下载的技能
    temp_dir = tempfile.mkdtemp(prefix="skill_install_")

    try:
        # 判断安装来源
        if "/" in skill_spec and not os.path.exists(skill_spec):
            # 处理 skills.sh API 返回的 ID 格式
            # API 返回: owner/repo/skill-name (如 claude-office-skills/skills/excel-automation)
            parts = skill_spec.split("/")

            if len(parts) >= 3:
                # 格式: owner/repo/skill-name -> 提取 owner 和 skill-name
                owner = parts[0]
                skill_name = parts[-1]
                repo_path = "/".join(parts[:-1])  # owner/repo
                print(f"从 GitHub 克隆技能仓库: {owner}/{skill_name}")
            else:
                # 格式: owner/skill-name
                owner = parts[0]
                skill_name = parts[1] if len(parts) > 1 else parts[0]
                repo_path = skill_spec
                print(f"从 GitHub 克隆技能仓库: {skill_spec}")

            # 使用 git clone 通过 SSH 克隆
            # 注意：npx skills add 使用 HTTPS 会触发密码认证，必须用 SSH
            clone_url = f"git@github.com:{repo_path}.git"
            clone_dir = os.path.join(temp_dir, "repo")

            git_cmd = ["git", "clone", clone_url, clone_dir]
            stdout, stderr, code = run_command(git_cmd, timeout=120)

            if code != 0:
                # 如果 SSH 失败，尝试 HTTPS（需要 Token）
                print(f"SSH 克隆失败，尝试 HTTPS: {stderr}")
                clone_url = f"https://github.com/{repo_path}.git"
                git_cmd = ["git", "clone", clone_url, clone_dir]
                stdout, stderr, code = run_command(git_cmd, timeout=120)

                if code != 0:
                    return {
                        "success": False,
                        "error": f"克隆失败: {stderr}",
                        "suggestion": "请确保 SSH 密钥已配置或配置 GitHub Token"
                    }

            # 查找技能目录
            skill_path = None
            if os.path.exists(clone_dir):
                # 检查是否有与技能名匹配的目录
                for item in os.listdir(clone_dir):
                    item_path = os.path.join(clone_dir, item)
                    if os.path.isdir(item_path):
                        # 优先找名称匹配的
                        if item == skill_name or item == skill_name.replace("_", "-"):
                            skill_path = item_path
                            break
                        elif skill_path is None:
                            skill_path = item_path

            if skill_path is None:
                return {
                    "success": False,
                    "error": "未找到技能目录",
                    "suggestion": "请检查仓库结构"
                }

        elif os.path.exists(skill_spec):
            # 本地路径，直接使用
            skill_path = skill_spec
        else:
            return {
                "success": False,
                "error": f"技能路径不存在: {skill_spec}",
                "suggestion": "请提供有效的本地路径、ZIP 文件或 skill-name（如 owner/skill-name）"
            }

        # 使用 pnpm openclaw skills add 添加技能
        cmd = ["pnpm", "openclaw", "skills", "add", skill_path]
        stdout, stderr, code = run_command(cmd, timeout=120)

        if code == 0:
            return {
                "success": True,
                "message": f"技能安装成功: {skill_spec}",
                "output": stdout
            }
        else:
            return {
                "success": False,
                "error": stderr or "安装失败",
                "suggestion": "请检查技能路径是否正确"
            }

    finally:
        # 清理临时目录
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)


def main():
    parser = argparse.ArgumentParser(description="Skills.sh 搜索和下载工具")
    subparsers = parser.add_subparsers(dest="command", help="可用命令")

    # 关键词搜索
    search_parser = subparsers.add_parser("search", help="搜索技能")
    search_parser.add_argument("keyword", help="搜索关键词")
    search_parser.add_argument("--install", "-i", action="store_true",
                                help="自动安装搜索结果中下载量最高的技能")

    # 热门技能
    subparsers.add_parser("trending", help="获取热门技能")

    # 已安装技能
    subparsers.add_parser("list", help="列出已安装技能")

    # 安装技能
    install_parser = subparsers.add_parser("install", help="安装技能")
    install_parser.add_argument("path", help="技能路径或 ZIP 文件")

    args = parser.parse_args()

    if args.command == "search":
        result = search_by_keyword(args.keyword)

        # 如果指定了 --install 参数，自动安装下载量最高的技能
        if args.install and result.get("success") and result.get("skills"):
            # 过滤出名称中包含关键词的技能（排除 fuzzy match 的不相关结果）
            # 使用精确匹配：技能名必须以关键词开头，或者技能名包含 "excel-" 或 "_excel" 等分隔形式
            keyword_lower = args.keyword.lower()
            relevant_skills = []
            for s in result["skills"]:
                name = s.get("name", "").lower()
                # 匹配规则：
                # 1. 以关键词开头 (如 excel-automation)
                # 2. 包含 -关键词 (如 csv-excel-merger)
                # 3. 完全等于关键词 (如 excel)
                # 4. 包含 _关键词_ (如 excel_data_analyzer)
                if (name.startswith(keyword_lower + "-") or
                    name.startswith(keyword_lower) or
                    f"-{keyword_lower}-" in name or
                    f"_{keyword_lower}_" in name or
                    name == keyword_lower):
                    relevant_skills.append(s)

            if not relevant_skills:
                # 如果没有精确匹配的，显示提示让用户选择
                print(f"未找到以 '{args.keyword}' 精确命名的技能，请手动选择")
                result["suggestion"] = "请从搜索结果中选择一个技能名称"
            else:
                # 按下载量排序，取第一个
                top_skill = max(relevant_skills, key=lambda x: x.get("downloads", 0))
                print(f"自动安装下载量最高的技能: {top_skill['full_name']} (下载量: {top_skill['downloads']})")

                install_result = install_skill(top_skill["full_name"])
                result["auto_install"] = install_result

    elif args.command == "trending":
        result = get_trending_skills()
    elif args.command == "list":
        result = list_installed_skills()
    elif args.command == "install":
        result = install_skill(args.path)
    else:
        parser.print_help()
        sys.exit(1)

    # 输出 JSON 格式结果
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()