# AskAgent X

> Extend every agent. Keep control.

AskAgent X 是一个面向本地 Agent 的体验增强与扩展平台。当前仓库建立了共享安全内核、平台检测、Skills 模块、Ink `askx` CLI 与 Nuxt 4 本地管理界面的基础架构。Web 使用 shadcn-vue、Reka UI、Tailwind CSS v4 与 Nuxt i18n，颜色通过 PG DS 语义 token 统一管理。

## 环境要求

- Node.js 22+
- npm、pnpm 11+、Yarn Classic 或 Bun（发布包安装任选其一；仓库开发使用 pnpm 11+）

## 文档导航

| 文档 | 内容 |
| --- | --- |
| [CLI 命令索引](./docs/cli.md) | 按使用场景快速定位命令和对应 API |
| [基础与 Web API](./docs/cli-base.md) | 安装、诊断、清空、Web 服务、Token 和卸载命令 |
| [Skills API](./docs/cli-skills.md) | 所有 Skills 命令、参数、副作用和示例 |
| [本地安装验证](./docs/npm-local-preview.md) | 使用不同包管理器验证 tarball、持续观察、升级与卸载 |
| [Agent 开发指南](./AGENTS.md) | 仓库结构、package 导航与开发约束 |

## 开始使用

```bash
pnpm install
pnpm check
pnpm askx doctor
pnpm askx clear
pnpm askx clear --links
pnpm askx clear --skills
pnpm askx clear --backup-name "调整配置前"
pnpm askx clear --no-backup
pnpm askx skills scan
pnpm askx skills scan --platform codex --platform claude --json
pnpm askx skills scan --platform claude
pnpm askx skills link --platform claude
# 仅在确认需要替换其他工具创建的软链时显式接管
pnpm askx skills link --platform claude --takeover-external-link
pnpm askx skills unlink --platform claude
pnpm askx skills history list
pnpm askx skills rollback <receipt-id>
pnpm askx skills backups list
pnpm askx skills backups restore <backup-version>
pnpm askx skills backups remove <backup-version>
pnpm askx skills stats
pnpm askx skills usage record my-skill
pnpm askx skills manager repair
pnpm askx ui
pnpm askx ui token
```

## 本地开发

### 启动完整开发环境

在项目根目录执行：

```bash
pnpm dev
```

该命令会先构建 CLI 依赖，再同时启动 CLI 依赖链监听和 Nuxt 热更新服务。开发 Web 固定监听 `127.0.0.1:4242`，默认开发 Token 固定为 `askx-local-dev`。

保持第一个终端运行，在第二个终端获取当前开发登录地址：

```bash
pnpm askx ui token
```

开发服务正常时输出：

```text
快速登录地址: http://127.0.0.1:4242/?token=askx-local-dev
Token: askx-local-dev
```

复制快速登录地址到浏览器即可完成验证；也可以直接打开 [http://127.0.0.1:4242/?token=askx-local-dev](http://127.0.0.1:4242/?token=askx-local-dev)。Token 验证成功后由 HttpOnly Cookie 保持本次浏览器会话。

### 开发环境执行 CLI

`pnpm dev` 保持运行时，在另一个终端通过 `pnpm askx` 调用当前仓库构建出的 CLI：

```bash
pnpm askx doctor
pnpm askx ui token
pnpm askx skills
pnpm askx skills scan
pnpm askx skills status
```

开发模式下无需执行 `pnpm askx ui start`。`ui start/status/stop/restart` 管理的是安装包启动的后台生产服务；Nuxt 开发服务由 `pnpm dev` 或 `pnpm dev:web` 所在的前台终端管理，停止时在该终端按 `Ctrl+C`。

### 只启动 CLI 或 Web

```bash
# 只监听 Core、Adapters、Skills 和 CLI
pnpm dev:cli

# 只启动 Nuxt Web，固定使用 4242 和 askx-local-dev
pnpm dev:web
```

首次进入仓库或 CLI 依赖发生变化时，优先使用 `pnpm dev`。如果只执行 `pnpm dev:web`，需要确保 CLI 已经构建过，之后才能在另一终端运行 `pnpm askx ui token`。

### 自定义开发 Token

默认联调不需要修改 Token。确需临时指定时，不使用预设的 `pnpm dev:web` 脚本，改为直接启动 Nuxt：

```bash
NUXT_ASKX_SESSION_TOKEN=my-local-token \
pnpm --filter @askx/web exec nuxt dev --host 127.0.0.1 --port 4242
```

此时快速登录地址为 `http://127.0.0.1:4242/?token=my-local-token`。当前 `pnpm askx ui token` 只自动识别默认开发 Token `askx-local-dev`，自定义 Token 由启动者自行保存和使用。

### 无需 Token 的组件 Demo

UI Demo 支持 `http://127.0.0.1:4242/demo` 和 `http://127.0.0.1:4242/en/demo` 两个 locale 路径，不需要 Token。Demo 内容固定展示中文，不读取本地配置；Nuxt Pages 只提供 `/demo` 单页入口，通过 `?module=` 与 `catalog.ts` 异步加载组件示例。

## 发布前本地安装

生成与正式发布内容一致的本地 tarball：

```bash
pnpm package:pack
```

默认输出 `./dist/npm/askagent-x-26.812.1.tgz`。本地验证和正式发布都使用这个文件。可直接选择一种包管理器全局安装：

```bash
npm install --global ./dist/npm/askagent-x-26.812.1.tgz
pnpm add --global ./dist/npm/askagent-x-26.812.1.tgz
yarn global add ./dist/npm/askagent-x-26.812.1.tgz
bun add --global ./dist/npm/askagent-x-26.812.1.tgz
```

Yarn 命令仅适用于 Yarn Classic。npm、pnpm 或 Yarn Classic 允许生命周期脚本时会通过 `postinstall` 自动启动后台 UI；Bun 默认拦截不受信任依赖的生命周期脚本，需执行 `askx ui start`。使用 `askx ui start|status|stop|restart` 管理服务。

卸载必须优先使用：

```bash
askx uninstall
```

它会先停止后台服务，再调用安装时使用的包管理器删除包。直接使用包管理器卸载可能删除源文件但留下仍在运行、继续占用端口的进程，因此必须先执行 `askx ui stop`。禁用安装脚本也会跳过自动启动。

完整的更新、检查和卸载流程见 [发布前本地安装与观察](./docs/npm-local-preview.md)。

本地观察通过后，正式发布同一份已验证产物，不重新打包：

```bash
npm publish ./dist/npm/askagent-x-26.812.1.tgz --access public
```

`askx ui` 只监听 `127.0.0.1`。开发环境固定使用 `4242`；发布版首次启动会选择可用的五位端口并记住，后续 `start/restart` 默认复用该生产端口。记住的端口被占用时会明确提示先停止占用服务，不会静默切换端口。启动时会生成一次性会话 token。打开不带 token 的页面会进入欢迎登录页，可通过 `askx ui token` 获取当前 token；验证成功后使用 HttpOnly Cookie 保存本次会话。

首次进入 `/skills-x` 会先选择 Codex、Claude Code、Cursor 管理范围，再执行只读目录扫描。平台只是 AskX 根据当前操作系统预设的 Skills 目录，自选文件夹与平台目录复用同一套枚举、读取、内容指纹和去重规则。用户确认后，AskX 先生成 `~/.askx/skills` 统一源，再逐个平台备份原 Skills 目录并接入统一源；单个平台失败只恢复并标记该平台。已接入平台可以随时无损取消或恢复软链：取消时隐藏 AskX 创建的根目录软链并原样放回接入前的平台目录，恢复时将该目录原样收回原备份位并放回软链；两种操作都不会扫描、同步或改写任何 Skill，任一步失败都会逆序恢复已经完成的路径移动。任何相关路径被占用时都会安全停止，不覆盖现有内容。macOS/Linux 使用目录软链，原生 Windows 使用目录 junction。

CLI 提供相同的计划与授权链路：`askx skills scan` 负责完整重新扫描或带参数定向导入；`askx skills link` 只建立或恢复所选平台和文件夹的整目录软链；`askx skills unlink` 只无损停用软链。交互终端会显示计划并等待确认，`scan --json` 只输出稳定的只读扫描结果。首次交互扫描提供 Ink 平台多选；定向导入通过重复的 `--platform` 或 `--directory` 明确范围。导入根目录第一层的 `local/` 子目录默认映射为本地专属 Skill，验证时可逐项切换共享/本地范围；已有 Skill 可通过 `askx skills scope <name> --local|--shared` 或 Web 在两种范围间安全迁移。

AskX 首次保存 Skills 配置时会显式安装内置 `askx-skill-manager`。版本管理状态在 Web 统计页中逐项配置，默认不改造普通 Skill。版本管理使用稳定 `skill_id`、`YY.MDD.N` 和排除管理元数据的业务 Hash。usage 只在用户明确执行 `askx skills usage record` 后写入本地 Registry，不监听平台、不后台采集、不上传。Web 的 Skill 资源区域提供“共享 Skills / 本地 Skills / 统计”三个视图，统计页首次打开时才异步读取 Registry。

```bash
# 从 Claude Code 和额外目录定向扫描并选择要导入的 Skill
pnpm askx skills scan --platform claude --directory /absolute/path/to/skills

# 将 Claude Code 的整个 Skills 目录绑定到统一源
pnpm askx skills link --platform claude

# 无损停用 Claude Code 软链并恢复接入前目录
pnpm askx skills unlink --platform claude

# 自动化环境输出只读扫描 JSON
pnpm askx skills scan --platform claude --json

# 查看本地版本、usage 与同步目标统计
pnpm askx skills stats

# 将已有共享 Skill 改为本地专属，或恢复为共享
pnpm askx skills scope my-skill --local
pnpm askx skills scope my-skill --shared
```

AskX 内部状态写入 `~/.askx/config.json`，并使用 revision、原子写入和文件锁避免并发覆盖。语言和主题属于 Web 界面设置，只通过 Web 修改；CLI 不提供通用设置命令。

## Workspace

```text
packages/
├── core/                 # 安全契约、计划签名、配置与模块注册
├── platform-adapters/    # Codex / Claude / Cursor 检测
├── modules/skills/       # Skills 拓扑扫描与模块入口
├── cli/                  # Commander + Ink 命令行
└── web/                  # Nuxt 4 + shadcn-vue + Tailwind CSS v4 本地界面
```
