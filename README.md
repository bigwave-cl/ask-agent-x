# AskAgent X

> Extend every agent. Keep control.

AskAgent X 是一个面向本地 Agent 的体验增强与扩展平台。当前仓库建立了共享安全内核、平台检测、Skills 模块、Ink `askx` CLI 与 Nuxt 4 本地管理界面的基础架构。Web 使用 shadcn-vue、Reka UI、Tailwind CSS v4 与 Nuxt i18n，颜色通过 PG DS 语义 token 统一管理。

## 环境要求

- Node.js 22+
- pnpm 11+

## 文档导航

| 文档 | 内容 |
| --- | --- |
| [CLI 操作手册](./docs/cli.md) | 完整命令、参数、Skills 同步与软链流程、共享设置及常见问题 |
| [产品规划](./PLAN.md) | 产品边界、阶段目标和未来能力 |
| [Agent 开发指南](./AGENTS.md) | 仓库结构、package 导航与开发约束 |

## 开始使用

```bash
pnpm install
pnpm check
pnpm askx modules list
pnpm askx doctor
pnpm askx skills scan
pnpm askx skills scan --platform codex --platform claude --json
pnpm askx skills sync --platform claude
pnpm askx skills sync --platform claude --manage-all
pnpm askx skills link --platform claude
pnpm askx skills unlink --platform claude
pnpm askx skills history list
pnpm askx skills rollback <receipt-id>
pnpm askx skills backups list
pnpm askx skills backups restore <backup-version>
pnpm askx skills backups remove <backup-version>
pnpm askx skills stats
pnpm askx skills usage record my-skill
pnpm askx skills manager repair
pnpm askx settings show
pnpm askx settings set backup off
pnpm askx settings set platforms codex cursor
pnpm askx settings set language en
pnpm askx settings set theme rose
pnpm askx ui
pnpm askx ui token
```

## 本地开发

在根目录启动 CLI 依赖链监听和 Nuxt 热更新服务：

```bash
pnpm dev
```

无需 Token 的 UI Demo 支持 `http://127.0.0.1:4242/demo` 和 `http://127.0.0.1:4242/en/demo` 两个 locale 路径，但内容固定展示中文，不解析多语言资源。Demo 只展示和调试 `packages/web/app/components/ui` 中的 shadcn 组件，不读取本地配置。Nuxt Pages 只提供 `/demo` 单页入口，通过 `?module=` 与 `catalog.ts` 异步加载各个示例模块。

Nuxt 开发页面：`http://127.0.0.1:4242/?token=askx-local-dev`。在另一个终端中直接验证 CLI：

```bash
pnpm askx modules list
pnpm askx doctor
pnpm askx skills scan
```

也可以只启动一侧：

```bash
pnpm dev:cli
pnpm dev:web
```

`askx ui` 只监听 `127.0.0.1`，发布版未指定 `--port` 时会由系统选择一个当前可用的五位端口；本地 `pnpm dev` 仍固定使用 `4242`，方便日常联调。启动时会生成一次性会话 token。打开不带 token 的页面会进入欢迎登录页，可通过 `askx ui token` 获取当前 token；验证成功后使用 HttpOnly Cookie 保存本次会话。共享设置已支持 CLI/Web 双向写入。

首次进入 `/skills-x` 会先选择 Codex、Claude Code、Cursor 管理范围，再执行只读目录扫描。平台只是 AskX 根据当前操作系统预设的 Skills 目录，自选文件夹与平台目录复用同一套枚举、读取、内容指纹和去重规则。用户确认后，AskX 先生成 `~/.askx/skills` 统一源，再逐个平台备份原 Skills 目录并接入统一源；单个平台失败只恢复并标记该平台。已接入平台可以随时无损取消或恢复软链：取消时隐藏 AskX 创建的根目录软链并原样放回接入前的平台目录，恢复时将该目录原样收回原备份位并放回软链；两种操作都不会扫描、同步或改写任何 Skill，任一步失败都会逆序恢复已经完成的路径移动。任何相关路径被占用时都会安全停止，不覆盖现有内容。macOS/Linux 使用目录软链，原生 Windows 使用目录 junction。

CLI 提供相同的计划与授权链路：`askx skills sync` 只把平台或 `--directory` 指定目录中的安全版本同步到统一源，内容冲突默认保留；`askx skills link` 只建立或恢复所选平台的整目录软链；`askx skills unlink` 只无损停用软链。交互终端会显示计划并等待确认，自动化脚本必须显式传入 `--yes`，需要稳定机器输出时同时使用 `--json`。首次交互扫描提供 Ink 平台多选；非交互环境通过重复的 `--platform` 明确范围。

AskX 首次保存 Skills 配置时会显式安装内置 `askx-skill-manager`。用户可以在扫描确认阶段选择“一键纳入版本管理”，或通过 CLI 的 `--manage-all`、`--manage-skill`、`--migrate-bobo` 逐项决定；默认不改造普通 Skill。版本管理使用稳定 `skill_id`、`YY.MDD.N` 和排除管理元数据的业务 Hash。usage 只在用户明确执行 `askx skills usage record` 后写入本地 Registry，不监听平台、不后台采集、不上传。Web 的 Skill 资源区域提供“共享 Skills / 本地 Skills / 统计”三个视图，统计页首次打开时才异步读取 Registry。

```bash
# 从 Claude Code 和额外目录同步到统一源，不建立软链
pnpm askx skills sync --platform claude --directory /absolute/path/to/skills

# 将 Claude Code 的整个 Skills 目录绑定到统一源
pnpm askx skills link --platform claude

# 无损停用 Claude Code 软链并恢复接入前目录
pnpm askx skills unlink --platform claude

# 自动化环境明确授权并输出纯 JSON
pnpm askx skills sync --platform claude --yes --json

# 查看本地版本、usage 与同步目标统计
pnpm askx skills stats
```

CLI 和 Web 设置统一写入 `~/.askx/config.json`。配置带 revision 和来源标记，使用原子写入与锁避免两个入口静默覆盖；Web 会自动检测 CLI 产生的新 revision。界面支持简体中文与英文，语言选择同样在两个入口间同步；CLI 可通过 `askx settings set language zh-CN|en` 切换。Web 默认中文路由不带前缀，英文路由统一使用 `/en`，例如 `/settings` 与 `/en/settings`。主题色提供 `cyan` 与 `rose` 两套方案，可通过 Web 主题入口或 `askx settings set theme cyan|rose` 修改。

## Workspace

```text
packages/
├── core/                 # 安全契约、计划签名、配置与模块注册
├── platform-adapters/    # Codex / Claude / Cursor 检测
├── modules/skills/       # Skills 拓扑扫描与模块入口
├── cli/                  # Commander + Ink 命令行
└── web/                  # Nuxt 4 + shadcn-vue + Tailwind CSS v4 本地界面
```

完整产品边界见 [PLAN.md](./PLAN.md)。
