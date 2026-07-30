# @askx/web Agent Guide

本文件适用于 `packages/web`。同时遵守仓库根目录的 [AGENTS.md](../../AGENTS.md)。

## 职责

- 提供 Nuxt 4 本地管理界面、Nitro API 和 `askx ui` 使用的服务启动器。
- 通过 Core 的 `SettingsStore` 与 CLI 双向同步设置。
- 管理本地会话 token、loopback/Origin 限制和 HttpOnly Cookie。
- 使用 shadcn-vue、Reka UI、Tailwind CSS v4 和 PG DS 语义颜色构建界面。

## 安全与数据规则

- 未认证页面默认进入欢迎登录流程；`/demo` 及其子路由是唯一公开的只读 UI 示例，不读取本地配置或调用受保护 API。受保护 API 对匿名请求返回 401。
- Token 只用于建立会话：不放入 localStorage/sessionStorage，不显示在日志，不通过页面状态长期保存。
- 会话 Cookie 保持 HttpOnly、SameSite=Strict、Path=/；服务只监听 `127.0.0.1`，并校验本地 Host/Origin。
- API 只负责输入校验、错误映射和调用共享能力，不在 handler 中复制业务规则。
- 设置更新必须携带 revision；冲突时重新加载，不能静默覆盖 CLI 的更新。

## UI 规则

- `app/` 使用 Vue Composition API 和 TypeScript；通用视觉能力拆成组件，不继续扩大单文件页面。
- 优先复用 `app/components/ui` 中的 shadcn-vue 组件；新增组件保持键盘可用、语义化标签和清晰焦点态。
- 项目自有组件统一通过 `@nuxt/icon` 使用 `askx-*` 本地 SVG 集合；`@lucide/vue` 仅允许 shadcn 管理的 `app/components/ui/**` 使用。新增图标必须同步维护 `app/lib/iconCatalog.ts`，不得启用 Iconify 公网回退。
- 保持当前 shadcn-vue CLI `init` 生成的 Tailwind 基础导入（`tw-animate-css` 与 `shadcn-vue/tailwind.css`）；不要把上游 variants、keyframes 和 utilities 复制进项目 CSS。
- 颜色从 `app/assets/css/main.css` 的 PG DS/shadcn token 获取，不在业务组件中扩散无语义品牌色。
- Web 工作台用户文案统一通过 `@nuxtjs/i18n` 管理，并同时提供 `zh-CN` 和 `en`；公开 Demo 可以生成 locale 路由，但固定使用中文静态文案，不解析翻译资源，也不提供独立语言切换入口。禁止在组件内新增双语 `messages` 对象或独立 locale 状态。CLI/Web 共享的偏好必须写回 Core 配置。
- Three.js、复杂动画和其他大体积浏览器能力使用客户端懒加载；页面隐藏或 `prefers-reduced-motion` 时暂停/降级。
- 不从外部 CDN 加载字体或运行时代码；本地 UI 应能离线工作。

## 目录提示

- `app/`：Vue 页面、入口体验、视觉组件和 shadcn-vue primitives。
- `app/components/common/`：跨页面公共组件，使用 Nuxt 自动导入的 `Cs` 前缀；不要再通过目录 `index.ts` 二次导出组件。
- `app/components/common/workspace-content/index.vue`：工作台内容宽度和水平留白的唯一 owner；工作台页面、Footer 与悬浮导航边界必须复用，不要在调用侧重复声明 `max-w`。
- `app/components/business/`：领域业务组件，使用 Nuxt 自动导入的 `Bus` 前缀；公共能力不要放入该目录。
- `app/components/ui/`：shadcn-vue primitives，由 shadcn 模块管理且不增加业务前缀；避免与 `Cs`、`Bus` 组件重名。
- `app/pages/`：Nuxt 文件路由；工作台页面在这里独立声明。Demo 只保留 `app/pages/demo.vue` 一个页面入口，不创建 `pages/demo/` 目录，也不为各模块新增 Page 文件。
- `app/components/demo/Page.vue`：唯一 Demo 页面装配入口；`index.vue`：根据 `?module=` 管理当前模块并异步加载；`catalog.ts`：模块注册、源码路径与 loader 入口。
- `app/components/demo/components/`：Demo 专属的导航、侧栏、Section、锚点和复制等公共能力；`modules/`：按模块分类存放实际示例，基础 UI 组件示例统一放在 `modules/components/`，图标规范使用独立的 `modules/icons/` 模块。
- `app/layouts/workspace-home.vue`：首页使用顶部悬浮工具条导航；`app/layouts/workspace.vue`：子页面使用右下角 Logo 信标导航并提供 Footer。两者共享同一导航 Drawer 和内容宽度边界，页面必须显式声明使用。默认布局保持为空，不创建 `default.vue`，登录页与公开 Demo 不继承工作台框架。
- `server/api/`：Nitro API；`server/middleware/`：会话边界。
- `server/utils/`：服务端共享实例。
- `src/server.ts`：CLI 启动 Nuxt UI 与活动 token 生命周期。

## 验证

```bash
pnpm --filter @askx/web typecheck
pnpm --filter @askx/web test
pnpm --filter @askx/web build
```

视觉或交互变更还应在 `http://127.0.0.1:4242/` 完成实际浏览器走查。
