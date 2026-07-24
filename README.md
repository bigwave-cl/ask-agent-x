# AskAgent X

> Extend every agent. Keep control.

AskAgent X 是一个面向本地 Agent 的体验增强与扩展平台。当前仓库建立了共享安全内核、平台检测、Skills 模块、Ink `askx` CLI 与 Nuxt 4 本地管理界面的基础架构。Web 使用 shadcn-vue、Reka UI 与 Tailwind CSS v4，颜色通过 PG DS 语义 token 统一管理。

## 环境要求

- Node.js 22+
- pnpm 11+

## 开始使用

```bash
pnpm install
pnpm check
pnpm askx modules list
pnpm askx doctor
pnpm askx skills scan
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

无需 Token 的 UI Demo：`http://127.0.0.1:4242/demo`。Demo 只展示和调试 `packages/web/app/components/ui` 中的 shadcn 组件，不读取本地配置。Nuxt Pages 只提供 `/demo` 单页入口，通过 `?module=` 与 `catalog.ts` 异步加载各个示例模块。

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

`askx ui` 只监听 `127.0.0.1`，启动时会生成一次性会话 token。打开不带 token 的页面会进入欢迎登录页，可通过 `askx ui token` 获取当前 token；验证成功后使用 HttpOnly Cookie 保存本次会话。共享设置已支持 CLI/Web 双向写入；Skills 模块仍只开放只读检测，同步、挂接和回滚将在事务与授权链路完整后开放。

CLI 和 Web 设置统一写入 `~/.askx/config.json`。配置带 revision 和来源标记，使用原子写入与锁避免两个入口静默覆盖；Web 会自动检测 CLI 产生的新 revision。界面支持简体中文与英文，语言选择同样在两个入口间同步；CLI 可通过 `askx settings set language zh-CN|en` 切换。主题色提供 `cyan` 与 `rose` 两套方案，可通过 Web 主题入口或 `askx settings set theme cyan|rose` 修改。

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
