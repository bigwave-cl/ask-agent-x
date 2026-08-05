# AskAgent X CLI 操作手册

本文档对应 AskAgent X `26.805.2`，按照 `askx --help` 中的命令顺序说明用途、语法、操作过程、输出和影响。

- [返回项目 README](../README.md)

## 1. 安装与通用用法

### 安装

```bash
npm install --global askagent-x
askx --help
```

安装完成后，npm `postinstall` 会自动启动本地 Web 服务。使用 `askx ui status` 查看服务状态，使用 `askx ui token` 获取快速登录地址。

如果安装时使用 `--ignore-scripts`，自动启动会被跳过，需要手动执行：

```bash
askx ui start
```

### 通用帮助

```bash
askx --version
askx --help
askx <command> --help
```

### 通用参数

| 参数 | 说明 |
| --- | --- |
| `--json` | 输出适合脚本读取的 JSON |
| `-y, --yes` | 明确授权当前已展示的写入计划，跳过交互确认 |
| `-p, --platform <platform>` | 指定 `codex`、`claude` 或 `cursor`；可重复或用逗号分隔 |
| `-d, --directory <path>` | 指定额外的本地 Skill 文件夹 |

除只读命令外，AskAgent X 会先生成不可变计划。交互终端按 `Y` 确认，按 `N` 或 `Esc` 取消；非交互环境必须显式传入 `--yes`。

## 2. 从关联到统计、清理的完整流程

本节是一条可以从上往下直接执行的完整操作路径。只想完成首次关联、查看统计并安全清理时，不需要先阅读后面的命令参考。

### 第一步：检查本机平台

```bash
askx doctor
```

确认 ChatGPT/Codex、Claude、Cursor 的安装状态及 Skills 文件夹地址。该步骤只读，不修改文件。

### 第二步：完成首次关联

```bash
askx skills
```

按照终端提示依次完成：

1. 选择哪些平台包含需要扫描的 Skill。
2. 核对终端输出的平台 Skills 文件夹地址。
3. 查看扫描得到的待处理 Skill 列表。
4. 选择需要设置目录软链的平台。
5. 核对接管、合并、保留、冲突和软链操作。
6. 按 `Y` 确认保存。

完成后，终端会输出统一目录、已关联平台和最终 Skill 列表。

### 第三步：查看当前 Skill 列表

```bash
askx skills
```

初始化完成后再次运行不再进入引导，而是直接显示当前可用 Skill。统一目录默认为 `~/.askx/skills`。

### 第四步：记录使用并查看统计

先从列表中找到 Skill 名称，再记录一次明确使用：

```bash
askx skills usage record <skill-name>
```

确认计划后查看统计：

```bash
askx skills stats
```

统计包含当前可用 Skill 的版本、usage 和关联目标。已经清空或移除的 Skill 不会显示。

### 第五步：日常扫描、同步和软链调整

只检查平台目录，不修改内容：

```bash
askx skills scan --platform codex,claude,cursor
askx skills status
```

把新 Skill 保存到统一源，但暂不设置软链：

```bash
askx skills sync --platform codex --platform claude
```

新增或恢复平台软链：

```bash
askx skills link --platform codex --platform claude
```

无损停用平台软链并恢复平台原目录：

```bash
askx skills unlink --platform codex --platform claude
```

### 第六步：查看可恢复记录

执行清理前先查看事务和已有备份：

```bash
askx skills history list
askx skills backups list
```

### 第七步：清空当前 Skill 列表

如果还需要平台恢复各自原目录，先执行 `askx skills unlink`。然后清空统一 Skill 列表：

```bash
askx skills clear
```

命令会先展示当前 Skill 数量、是否创建备份和计划 Hash。按 `Y` 后才会清空；用户 Skill 会进入长期备份，系统 Skill Manager、事务记录和平台软链关系不会被静默删除。

清理后验证：

```bash
askx skills
askx skills stats
askx skills backups list
```

Skill 列表和统计只显示当前仍可用的内容，历史 Registry 条目不会继续出现在统计中。

### 第八步：恢复或永久删除备份

需要恢复时：

```bash
askx skills backups list
askx skills backups restore <backup-version>
askx skills
```

确认不再需要某份备份后永久删除：

```bash
askx skills backups remove <backup-version>
```

### 第九步：恢复默认设置

```bash
askx settings reset
```

这只恢复语言、主题、平台选择和备份开关，不会清空 Skill。清空 Skill 必须使用 `askx skills clear`。

### 第十步：登录 Web 或安全卸载

```bash
askx ui status
askx ui token
```

不再使用 AskAgent X 时：

```bash
askx uninstall
```

该命令会先停止后台 Web 服务，再调用 npm 完成全局卸载。

## 3. `askx modules`

### `askx modules list`

用途：查看当前注册到 AskAgent X Core 的内置模块。

```bash
askx modules list
```

操作过程：读取当前模块注册表并输出模块名称。该命令不扫描平台、不修改配置或文件。

## 4. `askx doctor`

用途：检查 ChatGPT/Codex、Claude、Cursor 的安装状态、Skills 文件夹和目录软链条件。

```bash
askx doctor
askx doctor --json
```

操作过程：

1. 检查 CLI 版本、桌面客户端和用户配置目录。
2. 输出各平台默认 Skills 文件夹。
3. 检查目标路径是否允许建立受管目录软链。

默认目录：

| 平台 | Skills 文件夹 |
| --- | --- |
| ChatGPT / Codex | `~/.codex/skills` |
| Claude / Claude Code | `~/.claude/skills` |
| Cursor | `~/.cursor/skills` |
| Agents shared | `~/.agents/skills`，只读发现，不属于当前可管理平台 |

该命令只读。桌面客户端已安装但 CLI 未加入 `PATH` 时，仍可通过应用或配置目录识别。

## 5. `askx skills`

### `askx skills`

用途：查看当前 Skill 列表；首次使用时完成扫描、接管和平台软链设置。

```bash
askx skills
```

已初始化时直接输出：

- AskX 统一 Skill 文件夹。
- 当前已关联平台。
- 当前可用 Skill 列表及其文件夹。
- 查看统计命令 `askx skills stats`。

首次使用时依次执行：

1. 选择存放 Skill 的平台。
2. 输出所选平台的 Skills 文件夹地址。
3. 扫描并列出需要接管、合并、保留或处理冲突的 Skill。
4. 选择需要设置目录软链的平台。
5. 展示完整保存计划并等待确认。
6. 保存后输出最终 Skill 列表。

统一源位于 `~/.askx/skills`。平台建立整目录软链后，会读取这份统一列表。

### `askx skills scan`

用途：只扫描指定文件夹并输出待处理 Skill，不复制内容、不建立软链。

```bash
askx skills scan --platform codex
askx skills scan --platform codex,claude
askx skills scan --platform cursor --directory /absolute/path/to/skills
askx skills scan --platform codex --json
```

操作过程：读取平台和自定义文件夹，按 Skill 名称与内容指纹合并结果，标记内容冲突、无效 Skill 和失效链接。

首次交互运行时可以不传 `--platform`，CLI 会打开平台多选；非交互环境必须明确传入平台。

### `askx skills sync`

用途：把扫描到且可以安全处理的 Skill 保存到 AskX 统一源，但不设置平台软链。

```bash
askx skills sync --platform claude
askx skills sync --platform codex --directory /absolute/path/to/skills
askx skills sync --platform codex --manage-all
askx skills sync --platform codex --manage-skill my-skill
askx skills sync --platform codex --migrate-bobo old-skill
askx skills sync --platform codex --yes --json
```

处理规则：

- 单一有效版本进入统一源。
- 多个来源内容一致时合并为一个 Skill。
- 同名但内容不同、无效或失效的 Skill 保留现状，不静默覆盖。
- `--manage-all` 为全部符合条件的 Skill 开启版本与 usage 管理。
- `--manage-skill <name>` 只管理指定 Skill，可重复传入。
- `--migrate-bobo <name>` 保留旧 `skill_id` 和版本并迁移身份。

写入前会显示扫描结果、处理数量、文件操作和计划 Hash；确认后才保存。

### `askx skills link`

用途：把平台的整个 Skills 文件夹关联到 AskX 统一源，或恢复之前停用的软链。

```bash
askx skills link --platform claude
askx skills link --platform codex --platform cursor
askx skills link --directory /absolute/path/to/agent-skills
askx skills link --platform codex --yes --json
```

操作过程：

1. 检查 Skills 管理是否已经初始化。
2. 输出平台原 Skills 路径和统一源目标路径。
3. 为首次关联的平台保护原文件夹。
4. 展示计划并要求确认。
5. 逐个平台建立或恢复目录软链。

已经关联的平台返回 `skipped`。单个平台失败不会阻止其他平台继续处理。

### `askx skills unlink`

用途：无损停用平台软链，并恢复关联前的平台 Skills 文件夹。

```bash
askx skills unlink --platform claude
askx skills unlink --platform codex --yes --json
```

该命令不会删除统一源，也不会把统一源内容复制回平台。路径被外部内容占用时会停止，不覆盖现有文件。之后运行 `askx skills link` 可以重新关联。

### `askx skills status`

用途：检查当前启用平台中的 Skill 冲突、失效链接和无效内容。

```bash
askx skills status
askx skills status --json
```

该命令只读。需要查看当前 Skill 列表和已关联平台时，直接运行 `askx skills`。

### `askx skills clear`

用途：清空当前统一 Skill 列表，并在有用户 Skill 时创建可恢复的长期备份。

```bash
askx skills clear
askx skills clear --yes
askx skills clear --yes --json
```

命令会先输出当前 Skill 数量、备份版本和计划 Hash。清理完成后可以通过 `askx skills backups list` 查看备份，通过 `askx skills backups restore <backup-version>` 恢复。

### `askx skills history list`

用途：查看已完成的 Skills 写入事务和回执 ID。

```bash
askx skills history list
askx skills history list --json
```

最新事务会优先显示。回执 ID 可用于下一条回滚命令。

### `askx skills rollback <receipt-id>`

用途：按回执回滚最新且状态未变化的 Skills 事务。

```bash
askx skills rollback <receipt-id>
askx skills rollback <receipt-id> --yes --json
```

操作过程：重新校验回执、manifest revision、计划指纹和当前文件状态，然后展示回滚计划。事务之后出现外部修改时会拒绝回滚。

### `askx skills stats`

用途：查看当前可用 Skill 的版本、显式使用次数和已关联目标状态。

```bash
askx skills stats
askx skills stats --json
```

统计只包含当前 manifest 和统一源中仍存在的 Skill。已经清空或移除的历史项不会显示；Registry 中的历史 usage 会保留，以便同一 Skill 恢复后继续使用。

### `askx skills usage record <name-or-id>`

用途：明确记录某个已纳入版本管理 Skill 的一次使用。

```bash
askx skills usage record my-skill
askx skills usage record skill_26_805_example --yes --json
```

该操作只增加 `usage_count` 并更新 `last_used_at`，不会修改 Skill 内容、版本或业务 Hash。

### `askx skills manager repair`

用途：修复缺失、损坏或过期的内置 `askx-skill-manager`。

```bash
askx skills manager repair
askx skills manager repair --yes --json
```

修复优先保留当前有效 Registry；当前 Registry 无效时，从 AskX 自有备份恢复最新有效快照。该命令不会执行 Skill 附带脚本。

### `askx skills backups list`

用途：查看清空统一源时保存的长期备份。

```bash
askx skills backups list
askx skills backups list --json
```

### `askx skills backups restore <backup-version>`

用途：从指定长期备份恢复统一 Skill 列表。

```bash
askx skills backups restore <backup-version>
askx skills backups restore <backup-version> --yes --json
```

恢复前会重新校验备份并要求确认；平台软链关系保持不变。

### `askx skills backups remove <backup-version>`

用途：永久删除指定长期备份。

```bash
askx skills backups remove <backup-version>
askx skills backups remove <backup-version> --yes --json
```

删除后不能通过 AskAgent X 恢复该备份。

## 6. `askx settings`

CLI 和 Web 共用 `~/.askx/config.json`，每次修改都会增加 revision。

### `askx settings show`

用途：查看当前共享配置。

```bash
askx settings show
askx settings show --json
```

输出语言、主题色、启用平台、挂接前备份开关、revision 和最近修改来源。

### `askx settings reset`

用途：恢复全部共享设置默认值。

```bash
askx settings reset
askx settings reset --yes
askx settings reset --yes --json
```

该命令重置语言、主题色、平台选择和备份开关，但不会删除 Skill、统一源、备份、受管链接或事务记录。

### `askx settings set backup <on|off>`

用途：设置建立平台软链前是否保护原 Skills 文件夹。

```bash
askx settings set backup on
askx settings set backup off
```

### `askx settings set platforms <platforms...>`

用途：设置默认扫描和管理的平台。

```bash
askx settings set platforms codex claude
askx settings set platforms codex,cursor
```

至少需要一个平台，只支持 `codex`、`claude`、`cursor`。

### `askx settings set language <zh-CN|en>`

用途：设置 CLI 与 Web 共用的语言。

```bash
askx settings set language zh-CN
askx settings set language en
```

### `askx settings set theme <cyan|rose>`

用途：设置 Web 使用的共享主题色。

```bash
askx settings set theme cyan
askx settings set theme rose
```

## 7. `askx ui`

Web 服务仅监听 `127.0.0.1`，每次启动生成本地会话 Token。

### `askx ui [--port <port>]`

用途：以前台方式启动 Web 服务，用于临时运行或故障排查。

```bash
askx ui
askx ui --port 4300
```

终端会保持占用，按 `Ctrl+C` 停止服务。

### `askx ui start`

用途：在后台启动本地 Web 服务。

```bash
askx ui start
askx ui start --port 4300
askx ui start --json
```

不指定端口时自动选择可用的五位端口。已有后台服务运行时不会重复启动。

### `askx ui stop`

用途：停止后台 Web 服务并等待进程退出。

```bash
askx ui stop
askx ui stop --json
```

### `askx ui status`

用途：查看后台服务是否运行、PID、端口和访问地址。

```bash
askx ui status
askx ui status --json
```

### `askx ui restart`

用途：停止并重新启动后台 Web 服务。

```bash
askx ui restart
askx ui restart --port 4300
askx ui restart --json
```

### `askx ui token`

用途：获取快速登录地址和独立 Token。

```bash
askx ui token
```

输出两行：

```text
快速登录地址: http://127.0.0.1:<port>/?token=<token>
Token: <token>
```

把第一行地址复制到浏览器后，Web 会自动校验 Token、建立会话并从地址栏移除 Token。已经打开登录页时，可以复制第二行 Token。不要把 Token 写入仓库、日志或远程脚本。

## 8. `askx uninstall`

用途：先停止后台 Web 服务，再安全卸载全局 AskAgent X 包。

```bash
askx uninstall
```

推荐始终使用该命令卸载。现代 npm 不提供可靠的卸载生命周期钩子；直接执行 `npm uninstall --global askagent-x` 时，包文件可能已删除，但后台进程仍在运行。

如果必须直接使用 npm，请先执行：

```bash
askx ui stop
npm uninstall --global askagent-x
```

## 9. 命令速查

### 首次使用

```bash
askx doctor
askx skills
askx skills stats
```

### 只扫描，不修改

```bash
askx skills scan --platform codex,claude,cursor
```

### 分步骤同步和关联

```bash
askx skills sync --platform codex --platform claude
askx skills link --platform codex --platform claude
askx skills
```

### 查看服务并登录 Web

```bash
askx ui status
askx ui token
```

### 查看历史并恢复

```bash
askx skills history list
askx skills backups list
```
