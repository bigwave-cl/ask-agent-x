# AskAgent X

> Extend every agent. Keep control.

AskAgent X 是一个面向本地 Agent 的体验增强与扩展平台。当前仓库建立了共享安全内核、平台检测、Skills 模块、Ink `askx` CLI 与 Nuxt 4 本地管理界面的基础架构。

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
pnpm askx ui
```

## 本地开发

在根目录启动 CLI 依赖链监听和 Nuxt 热更新服务：

```bash
pnpm dev
```

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

`askx ui` 只监听 `127.0.0.1`，启动时会生成一次性会话 token。当前阶段仅开放只读检测能力；同步、挂接和回滚将在事务与授权链路完整后开放。

## Workspace

```text
packages/
├── core/                 # 安全契约、计划签名、配置与模块注册
├── platform-adapters/    # Codex / Claude / Cursor 检测
├── modules/skills/       # Skills 拓扑扫描与模块入口
├── cli/                  # Commander + Ink 命令行
└── web/                  # Nuxt 4 + Nitro 本地界面
```

完整产品边界见 [PLAN.md](./PLAN.md)。
