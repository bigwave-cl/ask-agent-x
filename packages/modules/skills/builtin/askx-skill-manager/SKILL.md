---
name: askx-skill-manager
description: AskX 本地 Skill 生命周期管理器。用于维护 Skill 身份、版本、usage、本地专属边界以及平台和文件夹同步状态。
---

# AskX Skill Manager

统一管理 AskX 中 Skill 的身份、版本、显式 usage 统计、local-only 边界和同步状态。

## Safety Boundary

1. 只通过 `askx skills` 命令生成计划、请求授权和应用写操作。
2. 不直接修改 Agent 平台目录，不绕过 AskX 的 manifest、revision、备份和回滚链路。
3. 不执行其他 Skill 附带的脚本，不上传数据，不后台采集使用行为。
4. usage 只能由用户明确运行 `askx skills usage record <name-or-id>` 后记录。

## Metadata Model

纳入版本管理的 Skill 使用 `.skill-manager.json` 保存稳定 `skill_id`、`YY.MDD.N` 版本、local-only 状态和业务内容指纹。业务指纹排除 `.skill-manager.json`、旧 `.skill-sync.json` 以及本系统 Skill 的 `registry/`。

## Version Workflow

1. 新 Skill 从当前 Asia/Shanghai 日期的 `.1` 版本开始。
2. 同日更新递增末段，跨日重新从 `.1` 开始。
3. 编辑受管 Skill 时，由 AskX 在同一事务中更新内容、版本、业务指纹和 registry。
4. 同版本不同指纹、同名不同身份或显式降级都必须由用户决定。

## Local-only Workflow

`local_only: true` 的 Skill 保存在 AskX 本地专属目录，不进入平台根目录软链，也不参与导出。只有用户明确执行迁移计划后，才可以进入共享 Skills。

## Registry

`registry/skills.json` 是 Skill 身份、版本、usage、别名和同步状态的本地索引。manifest 仍是文件系统所有权和事务状态的唯一权威。Registry 不参与系统 Skill 的业务指纹，导出的 registry 快照不能反向合并。

## Commands

```text
askx skills stats [--json]
askx skills usage record <name-or-id> [--yes] [--json]
askx skills manager repair [--yes]
askx skills sync --manage-all
askx skills sync --manage-skill <name>
askx skills sync --migrate-bobo <name>
```

## Managed By

This system skill is managed by `askx-skill-manager`.
After using a managed skill, record usage through `askx skills usage record`.
