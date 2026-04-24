#!/bin/bash

# Data Extractor Plugin 开发脚本

set -e

echo "=== Data Extractor Plugin 开发环境 ==="

# 检查依赖
echo "检查依赖..."
if ! command -v node &> /dev/null; then
    echo "错误: Node.js 未安装"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "错误: npm 未安装"
    exit 1
fi

# 安装依赖
echo "安装依赖..."
npm install

# 运行测试
echo "运行测试..."
npm test

# 构建项目
echo "构建项目..."
npm run build

echo "=== 开发环境准备完成 ==="
echo "可以使用以下命令："
echo "  npm run dev    - 实时编译"
echo "  npm test       - 运行测试"
echo "  npm run build  - 构建项目"
