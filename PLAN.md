# AskAgent X：本地 Agent 体验增强与扩展平台

## 总结

顶层产品使用工作名 `AskAgent X`：

- `X` = eXperience、eXtension、cross-agent
- 产品标语：`Extend every agent. Keep control.`
- npm 包：`askagent-x`
- CLI：`askx`
- 数据目录：`~/.askx`
- 本地界面：`askx ui`

`askagent` 已存在同名 npm 包，因此不直接占用该命令。[askagent npm](https://www.npmjs.com/package/askagent)

AskAgent X 是可扩展平台，Skill 管理只是首个 `Skills` 模块。后续可增加 Rules、MCP、Hooks、Profiles、环境诊断和备份迁移等模块。

## 平台架构

使用 Node.js 22、TypeScript、pnpm workspace：

- `core`：平台检测、不可变计划、用户授权、事务、备份和回滚。
- `cli`：根命令 `askx`，按模块注册子命令，使用 Ink 构建终端交互界面。
- `web`：最新稳定版 Nuxt 4，本地 Nitro 服务。
- `platform-adapters`：统一描述 Codex、Claude、Cursor 的版本、配置目录和发现规则。
- `modules/skills`：首个正式模块。

内部模块统一实现：

```ts
interface AskXModule {
  id: string
  name: string
  detect(context: ModuleContext): Promise<DetectionReport>
  plan(action: string, input: unknown): Promise<ActionPlan>
  apply(plan: ActionPlan, consent: UserConsent): Promise<ActionReceipt>
  rollback(receipt: ActionReceipt): Promise<RollbackResult>
}
```

所有模块必须经过共享安全内核：

`detect → plan → resolve → consent → apply → verify → rollback`

第一版只加载随产品发布的内置模块，不开放第三方动态插件；但模块接口保持稳定，为后续扩展预留。

## Skills 模块

### 安全同步与挂接

- 扫描 `~/.agents/skills`、`~/.codex/skills`、`~/.claude/skills`、`~/.cursor/skills`。
- 统一源为 `~/.askx/skills`，使用逐 Skill 软链，不接管整个 skills 根目录。
- 同名同内容自动归并；同名不同内容必须展示 diff，由用户选择版本、改名或手动合并。
- 同步成功后生成带内容 hash 的 `SyncReceipt`；没有有效 receipt、存在未解决冲突或检测结果发生变化时，禁止创建软链。
- 创建软链前展示最终平台、Skill 和文件操作，并记录绑定 plan hash 的用户确认。
- Cursor 的兼容扫描可能让其他平台目录中的 Skill 同时可见，界面展示“实际发现范围”，不承诺严格平台隔离。
- Claude Code 版本不足 `2.1.203` 时禁止该平台应用软链。

### 备份、取消与更新

- 创建软链前询问是否保留长期备份，默认推荐备份。
- 备份保存到 `~/.askx/backups/skills/<transaction-id>/<platform>/<skill>.bak`，避免被 Agent 当成 Skill 扫描。
- 即使用户拒绝长期备份，事务期间仍保留临时快照，失败时自动恢复。
- 一键取消默认把中央当前版本物化回平台，然后删除托管软链。
- 有 `.bak` 时额外支持恢复接入前版本，并在恢复前展示差异。
- 更新操作重新检测新增 Skill、坏链、平台选择和内容漂移；生成新计划并再次要求确认，不复用旧授权。
- 只删除 manifest 中登记且指向 `~/.askx/skills` 的软链，不处理未知软链和真实目录。

## CLI、界面与数据

### CLI

- `askx modules list`：查看已安装模块。
- `askx doctor`：统一检测 Agent 版本、路径、权限和事务状态。
- `askx settings show|set`：CLI 与 Web 共享设置，使用 revision 防止并发覆盖。
- `askx settings set theme cyan|rose`：切换 CLI/Web 共享主题色。
- `askx skills scan [--json]`：只读检测 Skill 拓扑。
- `askx skills status`：显示冲突、未同步、已挂接、漂移和可恢复状态。
- `askx skills sync`：解决冲突并汇总到统一源。
- `askx skills link`：校验同步凭证、询问备份并确认后创建软链。
- `askx skills unlink`：物化中央版本并取消软链。
- `askx skills update`：重新生成并应用挂接计划。
- `askx skills backups list|restore|remove`：管理备份。
- `askx ui`：启动仅监听 `127.0.0.1` 的管理界面。
- `askx ui token`：输出当前活动 UI 会话 token，用于欢迎登录页验证。

### Web UI

- 首页展示 Agent 安装状态、异常和各模块入口。
- Skills 模块提供“检测、冲突处理、同步、平台选择、备份、确认、执行、验证”向导。
- 操作面板支持按 Skill 更新、取消、恢复和查看实际平台可见性。
- 所有界面操作调用与 CLI 相同的 core，不能绕过同步凭证、用户授权或事务保护。
- 未建立会话时仅展示欢迎登录页；设置 API 保持 401，token 验证成功后写入 HttpOnly Cookie。

### 数据布局

```text
~/.askx/
├── config.json
├── state.json
├── skills/
├── transactions/
└── backups/
    └── skills/
```

配置和状态使用 Zod 版本化 schema；事务通过锁文件防止 CLI 与 Web 并发写入。Web UI 使用随机会话 token、限制本地 Origin，不执行 Skill 附带脚本。

## 测试与默认边界

- 核心测试：模块注册、平台适配、计划签名、授权失效、事务锁和回滚。
- Skills 测试：冲突检测、同步凭证、无授权禁止挂接、逐 Skill 软链、坏链更新和幂等执行。
- 备份测试：选择/拒绝备份、物化取消、`.bak` 恢复和操作中断恢复。
- UI E2E：完整挂接向导、一键取消、更新、恢复和错误提示。
- 真机验收：Codex、Claude、Cursor 能发现挂接 Skill，统一源修改可正确生效。

第一版采用 macOS 优先、个人全局范围、本地 Web UI、无后台自动修改和无遥测。Rules、MCP、Hooks、Profiles 等只建立模块入口和接口，不在首版实现。
