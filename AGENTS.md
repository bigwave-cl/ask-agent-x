# AskAgent X Agent Guide

本文件适用于整个仓库。进入某个 package 工作前，必须继续阅读该目录中更近的 `AGENTS.md`；package 规则负责该包的实现细节，并可在不破坏根级安全约束的前提下补充或覆盖本文件。

## 项目原则

- AskAgent X 是本地优先、无遥测的 Agent 扩展平台，默认只操作当前设备中的数据。
- 写操作必须遵守 `detect → plan → resolve → consent → apply → verify → rollback` 安全链路；不能从 CLI 或 Web 绕过 Core 约束。
- 不执行 Skill 附带脚本，不静默覆盖冲突，不删除未被 AskAgent X manifest 管理的文件或链接。
- 共享设置位于 `~/.askx/config.json`，CLI 与 Web 必须使用相同 schema、revision 和冲突处理语义。
- 新增用户可见文案时同时维护简体中文和英文。

## Package 导航

| Package | 职责 | 局部规则 |
| --- | --- | --- |
| `@askx/core` | 安全契约、配置 schema、计划签名、模块注册和共享设置存储 | [packages/core/AGENTS.md](./packages/core/AGENTS.md) |
| `@askx/platform-adapters` | Codex、Claude Code、Cursor 等本地平台的只读发现与版本检测 | [packages/platform-adapters/AGENTS.md](./packages/platform-adapters/AGENTS.md) |
| `@askx/module-skills` | Skills 拓扑扫描与 Skills 模块入口 | [packages/modules/skills/AGENTS.md](./packages/modules/skills/AGENTS.md) |
| `askagent-x` | Commander + Ink CLI 与各 package 的命令编排 | [packages/cli/AGENTS.md](./packages/cli/AGENTS.md) |
| `@askx/web` | Nuxt 本地 UI、会话边界、设置 API 和 UI 服务启动器 | [packages/web/AGENTS.md](./packages/web/AGENTS.md) |

产品边界和未来里程碑见 [PLAN.md](./PLAN.md)，开发与运行命令见 [README.md](./README.md)。package 专属规则应写入对应 package 的 `AGENTS.md`，不要继续堆叠到根文件。

## Workspace 约定

- 使用 Node.js 22+、pnpm 11+ 和 TypeScript ESM；内部依赖使用 `workspace:*`。
- 依赖方向保持为基础能力流向入口层：Core/Adapters → Modules → CLI/Web。不要让 Core 反向依赖 UI 或具体平台实现。
- 修改公共导出时同步维护 package 的 `src/index.ts`、类型声明消费者和相关测试。
- 保留用户已有改动；不要提交生成目录、临时测试产物或本地 `~/.askx` 数据。
- 优先把业务规则放在 Core/Module，把 CLI/Web 保持为输入、展示和编排层。

## 常用验证

```bash
pnpm check
pnpm build
git diff --check
```

开发联调使用 `pnpm dev`；仅调试某一侧时使用 `pnpm dev:cli` 或 `pnpm dev:web`。变更单个 package 时先运行该 package 的 `build`、`typecheck` 和 `test`，跨包改动完成后再运行根级检查。
