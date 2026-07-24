# @askx/module-skills Agent Guide

本文件适用于 `packages/modules/skills`。同时遵守仓库根目录的 [AGENTS.md](../../../AGENTS.md)。

## 职责

- 扫描统一源和各平台 Skills 根目录，生成可解释的拓扑结果。
- 识别重复 Skill、同名冲突、坏链和平台可见范围。
- 实现 `SkillsModule`，把 Skills 行为接入 Core 的检测、计划、授权、应用与回滚契约。

## 边界规则

- 扫描阶段严格只读，不执行 Skill 中的任何脚本、二进制或安装步骤。
- 内容相同的 Skill 可以归并；同名但内容不同必须报告冲突，不能自动选择覆盖方。
- 后续写操作只能处理 plan/manifest 明确登记、且目标位于 `~/.askx/skills` 范围内的链接。
- 所有可变更操作必须使用最新检测结果、计划 hash 和用户授权；授权不得跨计划复用。
- 临时快照、长期备份、验证和回滚属于同一事务，不允许出现只有 apply 没有恢复路径的实现。
- 拓扑输出保持稳定排序，测试使用临时 home/data 目录，不读取或修改真实 `~/.askx`。
- 模块入口与公共扫描类型从 `src/index.ts` 导出。

## 目录提示

- `src/scanner.ts`：Skills 文件系统发现和拓扑建模。
- `src/index.ts`：`SkillsModule` 与公共导出。

## 验证

```bash
pnpm --filter @askx/module-skills build
pnpm --filter @askx/module-skills typecheck
pnpm --filter @askx/module-skills test
```
