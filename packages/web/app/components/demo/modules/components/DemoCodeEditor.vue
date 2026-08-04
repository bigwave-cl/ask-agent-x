<script setup lang="ts">
import type { ResponsiveSelectOption } from '@/components/common/responsive-select/types'
import type { AskxIconName } from '@/lib/iconCatalog'
import type { CodeHighlightLanguage } from '@/lib/codeHighlight'
import { Badge } from '@/components/ui/badge'
import DemoSection from '../../components/DemoSection.vue'

defineOptions({ name: 'DemoCodeEditor' })

/** Code Editor Demo Section 的展开状态。 */
const isOpen = defineModel<boolean>({ default: false })

/** 单个代码编辑器示例。 */
interface CodeEditorSample {
  /** 下拉列表名称。 */
  label: string
  /** 语言能力说明。 */
  description: string
  /** 对应的本地文件图标。 */
  icon: AskxIconName
  /** 用于文件类型识别的文件名。 */
  filename: string
  /** 显式高亮语言。 */
  language: CodeHighlightLanguage
  /** 初始示例源码。 */
  source: string
}

/** 用于检查全部异步语法的示例集合。 */
const samples = {
  html: {
    label: 'HTML / XML',
    description: '标签、属性、注释及内嵌 CSS、JavaScript',
    icon: 'askx-objects:file-html',
    filename: 'index.html',
    language: 'xml',
    source: `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <title>AskAgent X</title>
    <style>
      .skill-card { color: #18aebd; }
    </style>
  </head>
  <body>
    <!-- HTML 标签、属性、注释和嵌套 CSS 均应有独立颜色。 -->
    <main class="skill-card" data-ready="true">
      <h1>Skills X</h1>
    </main>
    <script type="module">
      const ready = true
      console.info({ ready })
    <\/script>
  </body>
</html>`,
  },
  css: {
    label: 'CSS',
    description: '选择器、属性、变量与媒体查询',
    icon: 'askx-objects:file-style',
    filename: 'theme.css',
    language: 'css',
    source: `:root {
  --skill-accent: #18aebd;
}

.skill-card:hover {
  color: var(--skill-accent);
  transform: translateY(-2px);
}

@media (width <= 768px) {
  .skill-card { padding: 1rem; }
}`,
  },
  scss: {
    label: 'SCSS',
    description: '变量、嵌套规则与混入',
    icon: 'askx-objects:file-style',
    filename: 'theme.scss',
    language: 'scss',
    source: `$accent: #18aebd;

@mixin interactive-card($radius: 8px) {
  border-radius: $radius;
  transition: transform 160ms ease;
}

.skill-card {
  @include interactive-card;
  color: $accent;

  &:hover { transform: translateY(-2px); }
}`,
  },
  javascript: {
    label: 'JavaScript',
    description: '模块、函数、对象和模板字符串',
    icon: 'askx-objects:file-code',
    filename: 'scanner.mjs',
    language: 'javascript',
    source: `const platforms = ['codex', 'claude', 'cursor']

export async function scanSkills(root) {
  const result = await Promise.all(
    platforms.map(platform => scanPlatform(root, platform)),
  )
  return { root, count: result.length }
}`,
  },
  typescript: {
    label: 'TypeScript',
    description: '类型、接口、泛型与异步函数',
    icon: 'askx-objects:file-code',
    filename: 'skills.ts',
    language: 'typescript',
    source: `type SkillPlatform = 'codex' | 'claude' | 'cursor'

interface ManagedSkill<TMetadata extends object> {
  name: string
  platforms: SkillPlatform[]
  metadata: TMetadata
}

async function loadSkill<T extends object>(name: string): Promise<ManagedSkill<T>> {
  return await fetchSkill(name)
}`,
  },
  python: {
    label: 'Python',
    description: '装饰器、类型标注、异步函数与字典推导式',
    icon: 'askx-objects:file-code',
    filename: 'scanner.py',
    language: 'python',
    source: `from dataclasses import dataclass

@dataclass(slots=True)
class Skill:
    name: str
    enabled: bool = True

async def scan_skills(paths: list[str]) -> dict[str, Skill]:
    return {path: Skill(name=path) for path in paths}`,
  },
  json: {
    label: 'JSON',
    description: '对象、数组、布尔值及模板配置文件',
    icon: 'askx-objects:file-json',
    filename: 'config.local.json.example',
    language: 'json',
    source: `{
  "name": "askagent-x",
  "localFirst": true,
  "platforms": ["codex", "claude", "cursor"]
}`,
  },
  markdown: {
    label: 'Markdown',
    description: '标题、列表、引用、链接和 fenced code',
    icon: 'askx-objects:file-markdown',
    filename: 'SKILL.md',
    language: 'markdown',
    source: `# Skills X

统一管理本地 **Skills**，以一份目录作为唯一来源。

- 支持多 Agent
- 保持本地优先
- 写入前生成安全计划

> 一次维护，多端复用。

\`\`\`sh
askx skills scan
\`\`\``,
  },
  yaml: {
    label: 'YAML',
    description: '键值、数组、布尔值和多层配置',
    icon: 'askx-objects:file-config',
    filename: 'skill.yaml',
    language: 'yaml',
    source: `name: askagent-x
enabled: true
platforms:
  - codex
  - claude
  - cursor`,
  },
  shell: {
    label: 'Shell',
    description: '命令、变量、管道和执行选项',
    icon: 'askx-objects:file-shell',
    filename: 'install.sh',
    language: 'bash',
    source: `#!/usr/bin/env bash
set -euo pipefail

PACKAGE="@askx/web"
pnpm --filter "$PACKAGE" build`,
  },
  c: {
    label: 'C',
    description: '预处理指令、结构体、指针与函数',
    icon: 'askx-objects:file-code',
    filename: 'skill.c',
    language: 'c',
    source: `#include <stdio.h>

typedef struct {
  const char *name;
  int enabled;
} Skill;

int main(void) {
  Skill skill = { "askx", 1 };
  return printf("%s: %d\\n", skill.name, skill.enabled);
}`,
  },
  cpp: {
    label: 'C++',
    description: '命名空间、模板、容器与范围循环',
    icon: 'askx-objects:file-code',
    filename: 'skill.cpp',
    language: 'cpp',
    source: `#include <iostream>
#include <vector>

template <typename T>
void print_all(const std::vector<T>& values) {
  for (const auto& value : values) std::cout << value << '\\n';
}`,
  },
  csharp: {
    label: 'C#',
    description: '记录类型、LINQ 与异步任务',
    icon: 'askx-objects:file-code',
    filename: 'SkillService.cs',
    language: 'csharp',
    source: `public record Skill(string Name, bool Enabled);

public static async Task<IReadOnlyList<Skill>> LoadAsync()
{
    await Task.Delay(10);
    return [new("AskX", true)];
}`,
  },
  go: {
    label: 'Go',
    description: '结构体、接口、goroutine 与错误处理',
    icon: 'askx-objects:file-code',
    filename: 'scanner.go',
    language: 'go',
    source: `package skills

import "context"

type Skill struct {
    Name    string
    Enabled bool
}

func Scan(ctx context.Context, root string) ([]Skill, error) {
    return []Skill{{Name: root, Enabled: true}}, nil
}`,
  },
  java: {
    label: 'Java',
    description: 'Record、泛型集合与 Stream',
    icon: 'askx-objects:file-code',
    filename: 'Skill.java',
    language: 'java',
    source: `import java.util.List;

public record Skill(String name, boolean enabled) {
    public static List<String> activeNames(List<Skill> skills) {
        return skills.stream()
            .filter(Skill::enabled)
            .map(Skill::name)
            .toList();
    }
}`,
  },
  kotlin: {
    label: 'Kotlin',
    description: '数据类、空安全与集合转换',
    icon: 'askx-objects:file-code',
    filename: 'Skill.kt',
    language: 'kotlin',
    source: `data class Skill(val name: String, val enabled: Boolean = true)

fun activeNames(skills: List<Skill>): List<String> =
    skills.filter { it.enabled }
        .map { it.name }
        .sorted()`,
  },
  php: {
    label: 'PHP',
    description: '属性、数组映射与类型声明',
    icon: 'askx-objects:file-code',
    filename: 'Skill.php',
    language: 'php',
    source: `<?php

final class Skill
{
    public function __construct(
        public readonly string $name,
        public readonly bool $enabled = true,
    ) {}
}`,
  },
  ruby: {
    label: 'Ruby',
    description: '类、符号、块与安全导航',
    icon: 'askx-objects:file-code',
    filename: 'skill.rb',
    language: 'ruby',
    source: `class Skill
  attr_reader :name

  def initialize(name:, enabled: true)
    @name = name
    @enabled = enabled
  end

  def enabled? = @enabled
end`,
  },
  rust: {
    label: 'Rust',
    description: '结构体、枚举、模式匹配与 Result',
    icon: 'askx-objects:file-code',
    filename: 'skill.rs',
    language: 'rust',
    source: `#[derive(Debug)]
struct Skill {
    name: String,
    enabled: bool,
}

fn load(name: &str) -> Result<Skill, String> {
    Ok(Skill { name: name.into(), enabled: true })
}`,
  },
  sql: {
    label: 'SQL',
    description: '查询、连接、条件与排序',
    icon: 'askx-objects:file-code',
    filename: 'skills.sql',
    language: 'sql',
    source: `SELECT s.name, COUNT(p.platform_id) AS platform_count
FROM skills AS s
LEFT JOIN skill_platforms AS p ON p.skill_id = s.id
WHERE s.enabled = TRUE
GROUP BY s.id, s.name
ORDER BY platform_count DESC;`,
  },
  swift: {
    label: 'Swift',
    description: '结构体、可选值与 async/await',
    icon: 'askx-objects:file-code',
    filename: 'Skill.swift',
    language: 'swift',
    source: `struct Skill: Codable, Sendable {
    let name: String
    var enabled = true
}

func loadSkill(named name: String) async throws -> Skill {
    return Skill(name: name)
}`,
  },
  dockerfile: {
    label: 'Dockerfile',
    description: '镜像阶段、环境变量与运行命令',
    icon: 'askx-objects:file-shell',
    filename: 'Dockerfile',
    language: 'dockerfile',
    source: `FROM node:24-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

CMD ["node", ".output/server/index.mjs"]`,
  },
  ini: {
    label: 'INI / ENV / TOML',
    description: '节、键值、环境变量与 TOML 基础结构',
    icon: 'askx-objects:file-config',
    filename: '.env.local',
    language: 'ini',
    source: `# AskX local settings
ASKX_HOST=127.0.0.1
ASKX_PORT=4242

[workspace]
local_first = true`,
  },
} satisfies Record<string, CodeEditorSample>

/** 示例类型标识。 */
type SampleId = keyof typeof samples
/** 当前展示的示例类型。 */
const activeSample = ref<SampleId>('html')
/** 每种语言各自保留的可编辑草稿。 */
const drafts = reactive<Record<SampleId, string>>(Object.fromEntries(
  Object.entries(samples).map(([key, sample]) => [key, sample.source]),
) as Record<SampleId, string>)
/** 当前代码示例元数据。 */
const currentSample = computed(() => samples[activeSample.value])
/** 响应式下拉组件使用的语言选项。 */
const sampleOptions: ResponsiveSelectOption[] = Object.entries(samples).map(([value, sample]) => ({
  value,
  label: sample.label,
  description: sample.description,
}))
/** 为字符串 v-model 提供受控的示例标识转换。 */
const selectedSample = computed<string | undefined>({
  get: () => activeSample.value,
  set: (value) => {
    if (value && value in samples) activeSample.value = value as SampleId
  },
})

/** 根据下拉选项取得对应示例。 */
function getSample(value: string): CodeEditorSample {
  return samples[value as SampleId] ?? samples.html
}
</script>

<template>
  <DemoSection v-model="isOpen" sec-key="components-code-editor" title="Code Editor 代码编辑器" description="按需加载 grammar、显示逻辑行号并支持长行软换行的代码视图。">
    <div v-if="isOpen" class="grid gap-6 rounded-2xl border bg-background p-3 sm:p-5" data-testid="code-editor-demo">
      <article class="relative overflow-hidden rounded-2xl border bg-card p-5 sm:p-7">
        <div class="pointer-events-none absolute -right-12 -top-16 size-56 rounded-full bg-ds-fill-brand-transparent-20 blur-3xl" />
        <div class="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div class="flex flex-wrap items-center gap-2"><Badge variant="soft"><Icon name="askx-objects:file-code" />WORKER / LAZY GRAMMAR</Badge><Badge variant="secondary">{{ Object.keys(samples).length }} 种语法</Badge></div>
            <h3 class="mt-5 text-3xl font-semibold tracking-[-0.04em]">选择语言后才加载对应语法。</h3>
            <p class="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">每种 grammar 都保留独立异步 chunk；HTML 会在同一个 Worker 中补载 CSS 与 JavaScript，加载完成前由编辑器提供清晰反馈。</p>
          </div>
          <div class="rounded-lg border bg-background/80 px-3 py-2 font-mono text-[10px] text-muted-foreground">{{ currentSample.filename }}</div>
        </div>
      </article>

      <article class="grid min-w-0 gap-4 rounded-2xl border bg-card p-4 sm:p-5">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div class="grid w-full gap-2 sm:w-72">
            <label class="text-xs font-medium text-muted-foreground">高亮语言</label>
            <CsResponsiveSelect
              v-model="selectedSample"
              :options="sampleOptions"
              title="选择 Code Editor 高亮语言"
              placeholder="请选择语言"
              description="选择后异步载入对应 grammar"
              close-label="关闭语言选择"
              clear-label="清除语言"
              empty-text="暂无支持的语言"
              trigger-class="h-11 rounded-ds-8 bg-background px-3 data-[size=default]:h-11"
              content-class="w-full md:w-[320px] md:max-w-[calc(100vw-2rem)] [&_[data-slot=select-item]]:min-h-14"
            >
              <template #value="{ option, placeholder }">
                <span class="flex min-w-0 items-center gap-2.5 text-left">
                  <span class="grid size-7 shrink-0 place-items-center rounded-md bg-ds-fill-brand-transparent-10 text-ds-text-brand">
                    <Icon :name="currentSample.icon" class="size-4" aria-hidden="true" />
                  </span>
                  <span class="truncate text-sm font-medium text-foreground">{{ option?.label ?? placeholder }}</span>
                </span>
              </template>
              <template #item="{ option }">
                <span class="grid size-8 shrink-0 place-items-center rounded-md bg-ds-fill-brand-transparent-10 text-ds-text-brand">
                  <Icon :name="getSample(option.value).icon" class="size-4" aria-hidden="true" />
                </span>
                <span class="grid min-w-0 flex-1 gap-0.5 text-left">
                  <strong class="text-sm font-medium text-foreground">{{ option.label }}</strong>
                  <span class="whitespace-normal text-[11px] leading-4 text-muted-foreground">{{ option.description }}</span>
                </span>
              </template>
            </CsResponsiveSelect>
          </div>
          <span class="flex items-center gap-2 pb-3 text-xs text-muted-foreground"><Icon name="askx-status:info" class="size-4 text-primary" />示例内容可直接修改</span>
        </div>

        <CsCodeEditor
          v-model="drafts[activeSample]"
          class="h-[520px] w-full rounded-lg"
          :filename="currentSample.filename"
          :language="currentSample.language"
          :label="`${currentSample.label} 代码编辑示例`"
          :loading-label="`正在加载 ${currentSample.label} 语法…`"
        />
      </article>
    </div>
  </DemoSection>
</template>
