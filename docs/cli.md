# AskAgent X CLI 文档总览

本文档对应 AskAgent X `26.807.3`。CLI 文档按基础运行能力和 Skills 管理两个模块拆分，每份文档都可以独立阅读。

- [返回项目 README](../README.md)

## 1. 文档模块

| 模块 | 文档 | 适合解决的问题 |
| --- | --- | --- |
| Base | [CLI 基础使用](./cli-base.md) | 如何安装、诊断平台、管理 Web 服务和安全卸载 |
| Skills | [Skills 管理](./cli-skills.md) | 如何查看、扫描、验证、保存、关联、清理、恢复和统计 Skill |

## 2. 首次使用顺序

### 第一步：确认安装和环境

```bash
askx --version
askx doctor
```

### 第二步：完成 Skill 扫描和关联

```bash
askx skills
askx skills scan
```

完整流程为：

```text
查看 Skill
  → 选择平台或自定义来源
  → 扫描并验证 Skill
  → 保存到统一源
  → 设置平台或文件夹软链
  → 查看最终列表和统计
```

具体交互、命令效果和当前 CLI/Web 差异见 [Skills 管理](./cli-skills.md)。

### 第三步：确认 Web 服务并登录

```bash
askx ui status
askx ui token
```

使用 npm、pnpm 或 Yarn Classic 全局安装且生命周期脚本获准执行时，Web 服务会自动在后台启动；Bun 或禁用脚本的安装需要执行 `askx ui start`。复制 `ui token` 输出的快速登录地址到浏览器即可进入 Web。

服务启动、停止、重启、端口、Token 和卸载说明见 [CLI 基础使用](./cli-base.md#7-web-服务管理)。

## 3. 最常用命令

```bash
# 基础诊断
askx doctor

# Skills
askx skills
askx skills scan
askx skills sync --platform codex
askx skills link --platform codex
askx skills stats

# Web
askx ui status
askx ui token

# 卸载
askx uninstall
```

## 4. 命令关系

| 命令范围 | 是否扫描 Skill | 是否修改 Skill | 是否修改软链 | 是否管理进程 |
| --- | --- | --- | --- | --- |
| `askx doctor` | 否 | 否 | 否 | 否 |
| `askx skills scan/status/stats` | `scan` 先只读扫描 | `scan` 最终确认后会 | `scan` 最终确认后会 | 否 |
| `askx skills sync/clear/backups` | `sync` 会扫描 | 是 | 否 | 否 |
| `askx skills link/unlink` | 否 | 否 | 是 | 否 |
| `askx ui/uninstall` | 否 | 否 | 否 | 是 |

独立软链管理命令 `link/unlink` 不会隐式扫描或同步。交互式 `scan` 会在扫描和验证后进入软链选择，并且只在最终确认后统一写入；`scan --json` 始终只读。

## 5. 获取帮助

```bash
askx --help
askx <command> --help
askx skills <command> --help
```

对外操作以这组文档和已安装版本的 `--help` 为准。本地开发命令、构建方式和发布前验证不属于用户 CLI 操作，分别见项目 README 与 [本地安装验证](./npm-local-preview.md)。
