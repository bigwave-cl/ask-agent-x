# AskAgent X CLI Skills 管理

本文档对应 AskAgent X `26.806.1`，按照用户实际操作顺序说明如何查看、扫描、验证、关联、管理和统计 Skill，并提供完整的 Skills CLI API 参考。

- [CLI 文档总览](./cli.md)
- [CLI 基础使用](./cli-base.md)

## 1. 推荐操作流程

日常使用按以下顺序进行：

1. 查看 Skill。
2. 扫描 Skill，并验证扫描结果。
3. 设置平台或自定义文件夹软链。
4. 管理 Skill。
5. 查看统计并配置需要纳管的 Skill。
6. 管理 Web 服务或卸载 AskAgent X。

### 1.1 查看 Skill

```bash
askx skills
```

已完成初始化时，命令直接显示：

- AskX 统一 Skill 文件夹，默认为 `~/.askx/skills`。
- 当前已关联的平台。
- 当前可用 Skill 列表和每个 Skill 的文件夹地址。
- 软链管理、Skill 管理和统计相关命令提示。

首次使用且尚未建立统一 Skill 列表时，`askx skills` 会进入初始化引导。推荐先执行下一节的扫描流程，确认来源和处理结果后再保存。

### 1.2 扫描 Skill

交互终端直接运行：

```bash
askx skills scan
```

当前版本会打开平台多选，可选择：

- ChatGPT / Codex
- Claude / Claude Code
- Cursor

选择后，CLI 会显示对应的 Skills 文件夹地址并开始只读扫描。

扫描自定义文件夹时，当前版本需要显式输入绝对路径：

```bash
askx skills scan --directory /absolute/path/to/skills
```

平台和自定义文件夹可以一起扫描：

```bash
askx skills scan --platform codex,claude --directory /absolute/path/to/skills
```

> 当前 CLI 尚未在无参数扫描界面中提供“输入自定义文件夹”选项；Web 已提供文件夹选择器。CLI 后续需要补齐该交互，补齐前以 `--directory` 为准。

扫描只读取目录，不复制 Skill、不修改源文件夹，也不建立软链。

#### 扫描后的验证

扫描完成后，逐项检查输出：

| 状态 | 含义 | 保存行为 |
| --- | --- | --- |
| 可接管 | 只有一个有效来源 | 可以保存到统一源 |
| 可合并 | 多个来源内容一致 | 合并为一个 Skill |
| 内容冲突 | 同名 Skill 内容不同 | 不自动覆盖，需要保留或重新处理 |
| 无效 Skill | 缺少必要元数据或目录结构不符合要求 | 不保存 |
| 失效软链 | 链接目标不存在 | 不保存，并提示修复来源 |

扫描本身不会进入写入步骤。确认扫描结果后，使用 `askx skills sync` 生成保存计划：

```bash
askx skills sync --platform codex,claude
askx skills sync --directory /absolute/path/to/skills
```

CLI 会再次扫描，展示将接管、合并、保留和跳过的 Skill，并显示不可变计划 Hash。按 `Y` 确认后才会保存到 `~/.askx/skills`；按 `N` 或 `Esc` 取消。

### 1.3 设置和管理软链

Skill 保存到统一源后，再设置软链。软链操作只改变平台或文件夹与统一源的绑定关系，不会重新扫描或同步 Skill。

#### 关联平台

```bash
askx skills link --platform codex
askx skills link --platform claude,cursor
```

命令会显示：

- 平台原 Skills 文件夹。
- AskX 统一 Skill 文件夹。
- 原文件夹保护方式。
- 将创建或恢复的目录软链。

确认后，平台通过软链读取 AskX 统一 Skill 列表。

#### 取消平台绑定

```bash
askx skills unlink --platform codex
```

取消绑定会恢复关联前的平台目录，不删除 AskX 统一源，也不会把统一源内容复制回平台。

#### 恢复平台绑定

```bash
askx skills link --platform codex
```

对已经取消绑定的平台再次执行 `link`，会恢复受管软链，不触发 Skill 扫描。

#### 关联自定义文件夹

```bash
askx skills link --directory /absolute/path/to/agent-skills
```

自定义路径必须是希望绑定到统一源的 Skills 根目录，而不是某一个 Skill 的子目录。

> 当前 CLI 可以新增自定义文件夹绑定，但 `askx skills unlink` 尚未提供 `--directory`，因此不能在 CLI 中取消、恢复或删除自定义文件夹绑定。Web 已支持对应管理操作。CLI 补齐后应保持与平台一致的 `link/unlink` 语义，且不得隐式触发扫描。

#### 检查软链状态

```bash
askx skills status
```

该命令只读检查当前目录中的内容冲突、无效 Skill 和失效软链。

### 1.4 管理 Skill

#### 添加 Skill

CLI 当前通过“扫描来源并同步到统一源”添加 Skill：

```bash
askx skills sync --directory /absolute/path/to/skills
askx skills sync --platform codex
```

同步遵守扫描、计划、确认、写入和验证链路，不会静默覆盖同名冲突。

#### 导出 Skill

当前 CLI 尚未提供 `askx skills export`。请在 Web 的 Skill 资源管理页面选择 Skill 后使用“导出 Skill”。

CLI 后续增加导出命令时，应只读取当前统一源并输出到用户指定位置，不改变 Skill、软链或统计数据。

#### 清空全部 Skill

```bash
askx skills clear
```

命令会先展示当前 Skill 数量、备份版本和计划 Hash。确认后清空统一 Skill 列表，并在存在用户 Skill 时创建长期备份。

清空不会静默删除：

- 平台或自定义文件夹中的非 AskX 管理内容。
- Skill Manager Registry。
- 事务历史。
- 已创建的长期备份。

清空后检查：

```bash
askx skills
askx skills stats
askx skills backups list
```

#### 恢复清空前的 Skill

```bash
askx skills backups list
askx skills backups restore <backup-version>
askx skills
```

确认不再需要备份时：

```bash
askx skills backups remove <backup-version>
```

### 1.5 查看统计并配置纳管 Skill

```bash
askx skills stats
```

统计页面显示：

- 当前可用 Skill 数量。
- 每个 Skill 的版本。
- 显式 usage 次数。
- 已关联目标及健康状态。
- 已纳入和未纳入版本管理的 Skill。

统计只显示当前统一源中仍然可用的 Skill。已清空或移除的 Skill 不继续占用当前统计，但 Registry 中的历史 usage 会保留，以便恢复同一 Skill 后继续累计。

CLI 当前通过同步命令动态配置需要纳管的 Skill：

```bash
# 纳管全部符合条件的 Skill
askx skills sync --platform codex --manage-all

# 只纳管指定 Skill；参数可重复
askx skills sync --platform codex --manage-skill my-skill
askx skills sync --platform codex --manage-skill skill-a --manage-skill skill-b

# 保留原 ID 和版本，迁移旧 bobo 管理身份
askx skills sync --platform codex --migrate-bobo old-skill
```

记录一次明确使用：

```bash
askx skills usage record <skill-name-or-id>
```

> 当前 CLI 没有独立的 `skills stats manage` 子命令。纳管配置在 `skills sync` 中完成；Web 可以在统计页直接调整单个 Skill 的管理状态。

### 1.6 保存后的常用命令

完成同步和软链设置后，建议终端提示并使用以下命令：

```bash
# 查看当前 Skill
askx skills

# 软链管理
askx skills link --platform <platform>
askx skills unlink --platform <platform>
askx skills status

# Skill 管理
askx skills sync --platform <platform>
askx skills clear
askx skills backups list

# Skill 统计
askx skills stats
askx skills usage record <skill-name-or-id>
```

### 1.7 完成后进入 Web

完成 Skill 配置后，可打开本地 Web 查看相同数据：

```bash
askx ui status
askx ui token
```

完整的启动、Token、停止和卸载说明见 [CLI 基础使用](./cli-base.md#7-web-服务管理)。

## 2. Skills CLI API 参考

本节覆盖当前 `askx skills --help` 中的全部命令。

### 2.1 通用参数

| 参数 | 适用命令 | 效果 |
| --- | --- | --- |
| `--json` | 支持该参数的查询和写命令 | 输出机器可读 JSON，不混入终端装饰 |
| `-y, --yes` | 写命令 | 授权已经生成的不可变计划，跳过终端确认 |
| `-p, --platform <platform>` | `scan/sync/link/unlink` | 指定 `codex`、`claude` 或 `cursor`；可重复或逗号分隔 |
| `-d, --directory <path>` | `scan/sync/link` | 增加自定义扫描来源或软链根目录 |

非交互环境执行写命令时必须使用 `--yes`。参数不会绕过计划签名、revision、冲突检测和写后验证。

### 2.2 `askx skills`

```bash
askx skills
```

作用：查看当前 Skill 列表；未初始化时进入平台扫描与关联引导。

读取：manifest、统一源、平台绑定状态。

写入：仅在首次引导中确认保存计划后写入。

不会：执行 Skill 附带脚本或静默覆盖冲突。

### 2.3 `askx skills scan`

```bash
askx skills scan
askx skills scan --platform codex,claude
askx skills scan --directory /absolute/path/to/skills
askx skills scan --platform cursor --directory /absolute/path/to/skills --json
```

作用：扫描平台和自定义来源，生成 Skill 拓扑及验证结果。

读取：来源目录、Skill 元数据、软链目标和内容指纹。

写入：无。

不会：保存 Skill、建立软链、修改配置或 Registry。

### 2.4 `askx skills sync`

```bash
askx skills sync --platform codex
askx skills sync --directory /absolute/path/to/skills
askx skills sync --platform codex --manage-all
askx skills sync --platform codex --manage-skill my-skill
askx skills sync --platform codex --migrate-bobo old-skill
askx skills sync --platform codex --yes --json
```

作用：重新扫描来源，把可安全处理的 Skill 保存到统一源。

附加参数：

| 参数 | 效果 |
| --- | --- |
| `--manage-all` | 为全部符合条件的未托管 Skill 初始化版本管理 |
| `--manage-skill <name>` | 纳管或刷新指定 Skill；可重复 |
| `--migrate-bobo <name>` | 保留稳定 ID 和版本迁移旧管理身份；可重复 |

写入：统一源、manifest、必要的 Skill Manager 元数据和事务回执。

不会：建立或取消平台软链。

### 2.5 `askx skills link`

```bash
askx skills link --platform codex
askx skills link --platform claude,cursor
askx skills link --directory /absolute/path/to/agent-skills
askx skills link --platform codex --yes --json
```

作用：把平台或自定义 Skills 根目录绑定到 AskX 统一源，或恢复之前停用的平台绑定。

写入：受管目录软链、平台绑定记录、必要的原目录保护数据。

不会：扫描或同步新的 Skill。

### 2.6 `askx skills unlink`

```bash
askx skills unlink --platform codex
askx skills unlink --platform claude,cursor --yes --json
```

作用：无损停用平台软链，并恢复关联前的平台目录。

写入：平台绑定状态和平台 Skills 根目录。

不会：删除统一源、复制统一源内容或扫描 Skill。

限制：当前只支持平台，不支持 `--directory`。

### 2.7 `askx skills status`

```bash
askx skills status
askx skills status --json
```

作用：只读检查当前 Skill 冲突、无效内容和失效软链。

写入：无。

### 2.8 `askx skills clear`

```bash
askx skills clear
askx skills clear --yes --json
```

作用：清空统一 Skill 列表，并为用户 Skill 创建可恢复的长期备份。

写入：统一源、manifest、备份和事务回执。

不会：删除长期备份、Registry 或未受 AskX 管理的外部文件。

### 2.9 `askx skills history list`

```bash
askx skills history list
askx skills history list --json
```

作用：按时间倒序列出已完成的 Skills 事务和回执 ID。

写入：无。

### 2.10 `askx skills rollback <receipt-id>`

```bash
askx skills rollback <receipt-id>
askx skills rollback <receipt-id> --yes --json
```

作用：回滚最新且当前文件状态未变化的事务。

校验：回执、manifest revision、计划指纹和当前文件状态。

拒绝条件：目标事务不是最新事务，或事务后发生外部修改。

### 2.11 `askx skills stats`

```bash
askx skills stats
askx skills stats --json
```

作用：显示当前可用 Skill 的版本、usage、目标健康状态和版本管理覆盖情况。

读取：manifest、Skill Manager Registry 和目标绑定状态。

写入：无。

### 2.12 `askx skills usage record <name-or-id>`

```bash
askx skills usage record my-skill
askx skills usage record skill_26_805_example --yes --json
```

作用：为指定已纳管 Skill 记录一次明确使用。

写入：`usage_count`、`last_used_at` 和 Registry revision。

不会：修改 Skill 内容、业务 Hash 或版本号。

### 2.13 `askx skills manager repair`

```bash
askx skills manager repair
askx skills manager repair --yes --json
```

作用：修复缺失、损坏或过期的内置 `askx-skill-manager`。

恢复规则：优先保留有效 Registry；Registry 无效时尝试从 AskX 自有备份恢复最新有效快照。

不会：执行 Skill 附带脚本。

### 2.14 `askx skills backups list`

```bash
askx skills backups list
askx skills backups list --json
```

作用：列出清空统一源时创建的长期备份及版本号。

写入：无。

### 2.15 `askx skills backups restore <backup-version>`

```bash
askx skills backups restore <backup-version>
askx skills backups restore <backup-version> --yes --json
```

作用：校验并恢复指定长期备份。

写入：统一源、manifest 和事务记录。

不会：改变现有平台软链关系。

### 2.16 `askx skills backups remove <backup-version>`

```bash
askx skills backups remove <backup-version>
askx skills backups remove <backup-version> --yes --json
```

作用：永久删除指定长期备份。

影响：删除后不能再通过 AskAgent X 恢复该备份。

## 3. 当前 CLI 与 Web 对齐状态

| 能力 | CLI | Web |
| --- | --- | --- |
| 查看当前 Skill | 已支持 | 已支持 |
| 选择平台扫描 | 已支持 | 已支持 |
| 自定义文件夹扫描 | 通过 `--directory` | 通过文件夹选择器 |
| 扫描结果验证 | 已支持 | 已支持 |
| 平台软链新增、取消、恢复 | 已支持 | 已支持 |
| 自定义文件夹软链新增 | 已支持 | 已支持 |
| 自定义文件夹软链取消、恢复、删除 | 尚未支持 | 已支持 |
| 添加 Skill | 通过 `sync` | 已支持 |
| 导出 Skill | 尚未支持 | 已支持 |
| 一键清空 | 已支持 | 已支持 |
| Skill 统计 | 已支持 | 已支持 |
| 动态配置纳管 Skill | 通过 `sync --manage-*` | 统计页直接管理 |

## 4. 常用命令速查

```bash
# 查看
askx skills

# 扫描和验证
askx skills scan
askx skills scan --directory /absolute/path/to/skills

# 保存 Skill
askx skills sync --platform codex
askx skills sync --directory /absolute/path/to/skills

# 软链管理
askx skills link --platform codex
askx skills unlink --platform codex
askx skills status

# Skill 管理
askx skills clear
askx skills backups list
askx skills backups restore <backup-version>

# 统计和纳管
askx skills stats
askx skills sync --platform codex --manage-skill my-skill
askx skills usage record my-skill
```
