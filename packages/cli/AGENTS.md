# askagent-x CLI Agent Guide

本文件适用于 `packages/cli`。同时遵守仓库根目录的 [AGENTS.md](../../AGENTS.md)。

## 职责

- 使用 Commander 定义 `askx` 命令树，使用 Ink 渲染人类可读终端界面。
- 编排 Core、平台适配器、Skills 模块和本地 Web UI 服务。
- 提供设置读写、环境诊断、Skills 检测及 UI token 获取入口。

## 边界规则

- CLI 是展示和编排层，不复制 Core 的 schema、revision、授权或事务规则。
- 人类输出使用 Ink；`--json` 等机器输出保持纯 JSON、字段稳定且不混入装饰文本。
- 新增用户可见命令、帮助和错误时同时维护简体中文与英文。
- 终端组件必须适用于无颜色、较窄宽度和非交互环境；颜色不能成为唯一状态信号。
- 写命令必须明确展示影响范围并经过 Core 授权；未完成安全链路的命令应保持显式锁定。
- `skills usage record`、`skills manager repair` 和版本管理同步参数必须调用 Skills 模块的计划与授权接口；CLI 不直接读写系统 Skill registry 或 manager 元数据。
- `askx ui` 继续只绑定 loopback；token 可以输出到当前终端，但不得写入日志或普通配置文件。
- 不直接编辑 Nuxt 数据或页面状态；CLI/Web 通过 Core 的共享设置存储同步。

## 开发提示

根命令 `pnpm askx` 执行构建产物 `packages/cli/dist/index.js`，修改源码后先构建，或使用根目录的 `pnpm dev:cli` 监听依赖链。

## 验证

```bash
pnpm --filter askagent-x build
pnpm --filter askagent-x typecheck
pnpm --filter askagent-x test
pnpm askx --help
```
