# @askx/core Agent Guide

本文件适用于 `packages/core`。同时遵守仓库根目录的 [AGENTS.md](../../AGENTS.md)。

## 职责

- 定义跨入口共享的类型、安全契约和 `AskXModule` 生命周期。
- 管理配置与状态的 Zod schema、默认值和上下文路径。
- 提供稳定 hash、不可变 ActionPlan、授权校验和模块注册。
- 通过 `SettingsStore` 提供带 revision、锁和原子写入的 CLI/Web 共享设置。

## 边界规则

- 不依赖 Vue、React、Ink、Commander、Nuxt 或具体平台适配器。
- 不在 Core 中加入终端文案、页面状态或 Codex/Claude/Cursor 特例。
- 公开数据必须有明确 TypeScript 类型；外部输入和持久化数据必须经 Zod 校验。
- Hash 和计划生成必须确定性；不要让对象键顺序、当前工作目录或随机值改变同一输入的签名。
- 设置写入必须保留 revision 冲突检测、锁文件和临时文件原子替换，不能退化为直接覆盖。
- 新的公共能力从 `src/index.ts` 导出，并为关键不变量补充相邻测试。

## 目录提示

- `src/types.ts`：跨包契约与安全生命周期类型。
- `src/config.ts`：配置 schema、默认配置和运行上下文。
- `src/plans.ts` / `src/hash.ts`：计划签名与授权校验。
- `src/settings-store.ts`：共享设置的并发安全读写。
- `src/registry.ts`：内置模块注册。

## 验证

```bash
pnpm --filter @askx/core build
pnpm --filter @askx/core typecheck
pnpm --filter @askx/core test
```
