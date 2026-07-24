# @askx/platform-adapters Agent Guide

本文件适用于 `packages/platform-adapters`。同时遵守仓库根目录的 [AGENTS.md](../../AGENTS.md)。

## 职责

- 描述受支持 Agent 平台的名称、目录、最低版本和链接能力。
- 只读检测 Codex、Claude Code、Cursor 及通用 Agents 目录。
- 将平台差异归一化为稳定的 `PlatformDescriptor` 和 `PlatformDetection`。

## 边界规则

- 检测必须保持只读：不得创建目录、修改配置、安装程序或修复链接。
- 路径计算接受可注入的 home 目录，测试和调用方不能被真实用户目录绑死。
- 命令探测失败、程序未安装或版本不可识别应返回可解释的检测结果，不因正常缺失而崩溃。
- 版本比较保持纯函数和可测试性；平台最低版本只在 descriptor 中集中定义。
- 不包含 Skills 同步策略、UI 文案或用户授权逻辑；这些分别属于 Module、CLI/Web 和 Core。
- 新增平台时同步更新 `PlatformId`、descriptor、检测逻辑及使用该联合类型的消费者。

## 验证

```bash
pnpm --filter @askx/platform-adapters build
pnpm --filter @askx/platform-adapters typecheck
pnpm --filter @askx/platform-adapters test
```
