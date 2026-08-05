<script setup lang="ts">
import type {
  ManagedPlatformHealth,
  ManagedSkillDetail,
  ManagedSkillFile,
  ManagedSkillHealth,
  ManagedSkillRecord,
  ManagedSkillTreeNode,
  SkillFileUpdatePlan,
  SkillFileUpdateReceipt,
  SkillPlatformStatus,
  SkillsScanReport,
} from '@askx/module-skills/skill-types'
import { useResizeObserver } from '@vueuse/core'
import Tabs from '@/components/ui/tabs/Tabs.vue'
import TabsList from '@/components/ui/tabs/TabsList.vue'
import TabsTrigger from '@/components/ui/tabs/TabsTrigger.vue'
import { resolveSkillTreeIcon } from './skillTreeIcon'

/** Skills 管理列表属性。 */
interface Props {
  /** manifest 中已接管的 Skill。 */
  managedSkills: ManagedSkillRecord[]
  /** 最新只读扫描报告。 */
  report: SkillsScanReport
  /** 受管 Skill 的只读健康状态。 */
  health: ManagedSkillHealth[]
  /** 平台根目录绑定健康状态。 */
  platformHealth: ManagedPlatformHealth[]
  /** 当前平台预检测结果。 */
  platforms: SkillPlatformStatus[]
  /** 是否有其他 Skills 写操作正在进行。 */
  busy?: boolean
}

const props = withDefaults(defineProps<Props>(), { busy: false })
const emit = defineEmits<{
  /** 打开添加 Skill 流程。 */
  'add': []
  /** 文件保存后要求父级刷新 manifest 状态。 */
  'updated': []
}>()
const { t } = useI18n()
const toast = useToast()

/** 左侧 Skill 搜索词。 */
const search = ref('')
/** 当前选择的受管 Skill 标识。 */
const selectedSkillId = ref(props.managedSkills[0]?.id ?? '')
/** 当前 Skill 的完整资源详情。 */
const detail = ref<ManagedSkillDetail | null>(null)
/** 当前正在查看的文本文件。 */
const currentFile = ref<ManagedSkillFile | null>(null)
/** 编辑器中的草稿内容。 */
const draft = ref('')
/** 编辑器展示模式。 */
const viewMode = ref<'edit' | 'preview'>('edit')
/** 详情或文件请求是否正在进行。 */
const loading = ref(false)
/** 文件保存计划请求是否正在进行。 */
const saving = ref(false)
/** 等待用户确认的文件更新计划。 */
const updatePlan = ref<SkillFileUpdatePlan | null>(null)
/** 文件更新确认弹窗是否打开。 */
const confirmOpen = ref(false)
/** 详情标题区中被限制为三行的描述元素。 */
const descriptionElement = ref<HTMLElement | null>(null)
/** 当前描述是否超出三行展示区域。 */
const descriptionOverflow = ref(false)
/** 完整描述响应式弹层是否打开。 */
const descriptionOpen = ref(false)

/** 受管 Skill 的健康状态索引。 */
const healthById = computed(() => new Map(props.health.map((health) => [health.skillId, health])))
/** 与搜索词匹配的受管 Skill。 */
const filteredSkills = computed(() => {
  const keyword = search.value.trim().toLocaleLowerCase()
  if (!keyword) return props.managedSkills
  return props.managedSkills.filter((skill) => skill.name.toLocaleLowerCase().includes(keyword))
})
/** 当前编辑器是否存在未保存修改。 */
const dirty = computed(() => Boolean(currentFile.value && draft.value !== currentFile.value.content))
/** 当前文件是否支持 Markdown 预览。 */
const markdownFile = computed(() => /\.mdx?$/i.test(currentFile.value?.path ?? ''))
/** 当前选中 Skill 的健康状态。 */
const selectedHealth = computed(() => healthById.value.get(selectedSkillId.value))
/** 当前打开文件对应的类型图标。 */
const currentFileIcon = computed(() => resolveSkillTreeIcon(currentFile.value?.path.split('/').pop() ?? '', 'file'))

/**
 * 将文件字节数格式化为紧凑的可读单位。
 * @param bytes 文件字节数。
 * @returns 按 G、M、KB、B 递减选择的大小文本。
 */
function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} G`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} M`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${Math.round(bytes)} B`
}

/** 检查当前描述是否需要提供完整内容入口。 */
function measureDescriptionOverflow(): void {
  const element = descriptionElement.value
  descriptionOverflow.value = Boolean(element && element.scrollHeight > element.clientHeight + 1)
}

useResizeObserver(descriptionElement, measureDescriptionOverflow)

/** 从目录树中寻找第一个可查看文本文件，优先选择 SKILL.md。 */
function findInitialFile(nodes: ManagedSkillTreeNode[]): ManagedSkillTreeNode | undefined {
  const flattened: ManagedSkillTreeNode[] = []
  /** 将目录树按展示顺序拍平。 */
  function visit(entries: ManagedSkillTreeNode[]): void {
    for (const entry of entries) {
      flattened.push(entry)
      if (entry.children) visit(entry.children)
    }
  }
  visit(nodes)
  return flattened.find((entry) => entry.path === 'SKILL.md' && entry.previewable) ?? flattened.find((entry) => entry.previewable)
}

/** 将接口错误转换为用户可见提示。 */
function notifyError(error: unknown): void {
  const candidate = error as { statusCode?: number; response?: { status?: number } }
  toast.error(t(candidate.statusCode === 409 || candidate.response?.status === 409 ? 'skills.fileChanged' : 'skills.fileRequestFailed'))
}

/** 读取指定受管 Skill 的元数据和目录树。 */
async function selectSkill(skillId: string): Promise<void> {
  if (dirty.value) {
    toast.warning(t('skills.unsavedFileHint'))
    return
  }
  selectedSkillId.value = skillId
  detail.value = null
  currentFile.value = null
  draft.value = ''
  loading.value = true
  try {
    detail.value = await $fetch<ManagedSkillDetail>('/api/skills/detail', { query: { skillId } })
    const initialFile = findInitialFile(detail.value.tree)
    if (initialFile) await selectFile(initialFile)
  } catch (error) {
    notifyError(error)
  } finally {
    loading.value = false
  }
}

/** 读取目录树中选中的文本文件。 */
async function selectFile(node: ManagedSkillTreeNode): Promise<void> {
  if (!selectedSkillId.value || node.kind !== 'file') return
  if (!node.previewable) {
    toast.warning(t('skills.binaryFilePreviewUnsupported'))
    return
  }
  if (dirty.value && node.path !== currentFile.value?.path) {
    toast.warning(t('skills.unsavedFileHint'))
    return
  }
  loading.value = true
  try {
    currentFile.value = await $fetch<ManagedSkillFile>('/api/skills/file', { query: { skillId: selectedSkillId.value, path: node.path } })
    draft.value = currentFile.value.content
    viewMode.value = 'edit'
  } catch (error) {
    notifyError(error)
  } finally {
    loading.value = false
  }
}

/** 放弃当前文件草稿。 */
function resetDraft(): void {
  if (currentFile.value) draft.value = currentFile.value.content
}

/** 为当前草稿生成文件更新计划并打开确认弹窗。 */
async function prepareSave(): Promise<void> {
  if (!currentFile.value || !dirty.value) return
  saving.value = true
  try {
    updatePlan.value = await $fetch<SkillFileUpdatePlan>('/api/skills/file/plan', {
      method: 'POST',
      body: {
        skillId: currentFile.value.skillId,
        path: currentFile.value.path,
        nextContent: draft.value,
        previousContentHash: currentFile.value.contentHash,
      },
    })
    confirmOpen.value = true
  } catch (error) {
    notifyError(error)
  } finally {
    saving.value = false
  }
}

/** 应用经过确认的文件更新计划。 */
async function applySave(): Promise<void> {
  if (!updatePlan.value) return
  saving.value = true
  try {
    const receipt = await $fetch<SkillFileUpdateReceipt>('/api/skills/file/apply', {
      method: 'POST',
      body: {
        plan: updatePlan.value,
        consent: { planHash: updatePlan.value.hash, confirmedAt: new Date().toISOString() },
      },
    })
    confirmOpen.value = false
    updatePlan.value = null
    toast.success(t('skills.fileSaved'))
    emit('updated')
    await selectSkill(receipt.skillId)
  } catch (error) {
    notifyError(error)
  } finally {
    saving.value = false
  }
}

/** 复制统一源或文件路径。 */
async function copyPath(path: string): Promise<void> {
  const copied = await useCopyText(path)
  if (copied) toast.success(t('skills.pathCopied'))
}

watch(() => props.managedSkills, (skills) => {
  if (!skills.some((skill) => skill.id === selectedSkillId.value)) selectedSkillId.value = skills[0]?.id ?? ''
}, { deep: true })
watch(() => detail.value?.description, async () => {
  descriptionOpen.value = false
  await nextTick()
  measureDescriptionOverflow()
})

onMounted(() => {
  if (selectedSkillId.value) void selectSkill(selectedSkillId.value)
})
</script>

<template>
  <section class="grid gap-5">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-ds-text-brand"><span class="h-px w-8 bg-ds-brand-default" />{{ t('skills.resourceEyebrow') }}</div>
        <h2 class="mt-3 text-2xl font-semibold tracking-[-0.03em]">{{ t('skills.listTitle') }}</h2>
        <p class="mt-2 text-sm text-muted-foreground">{{ t('skills.resourceDescription') }}</p>
      </div>
      <div class="grid w-full grid-cols-2 gap-2 sm:w-[22rem]">
        <BusSkillsSkillCopyManager :managed-skills="managedSkills" :platforms="platforms" :platform-health="platformHealth" :disabled="busy || dirty" />
        <Button variant="outline" size="40" class="w-full" :disabled="busy" @click="emit('add')"><Icon name="askx-actions:upload" />{{ t('skills.addSkill') }}</Button>
        <BusSkillsCanonicalSourceManager :disabled="busy" @updated="emit('updated')" />
      </div>
    </header>

    <div class="h-[1630px] overflow-hidden rounded-[28px] border bg-card shadow-sm sm:h-[1530px] lg:h-[760px]">
      <div class="grid h-full lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside class="flex min-h-0 flex-col border-b bg-ds-fill-bw-transparent-3 lg:border-r lg:border-b-0">
          <div class="border-b p-4">
            <div class="flex items-center justify-between gap-3"><div><strong class="text-sm">{{ t('skills.canonicalSkills') }}</strong><span class="ml-2 font-mono text-[10px] text-muted-foreground">{{ managedSkills.length }}</span></div><Icon name="askx-objects:skills" class="size-4 text-primary" aria-hidden="true" /></div>
            <label class="mt-3 flex h-9 items-center gap-2 rounded-xl border bg-background px-3 focus-within:ring-2 focus-within:ring-ring/40">
              <Icon name="askx-actions:search" class="size-3.5 text-muted-foreground" aria-hidden="true" />
              <input v-model="search" class="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground" :placeholder="t('skills.resourceSearch')">
            </label>
          </div>
          <ScrollArea class="h-[250px] lg:h-[600px]" viewport-class="px-2 py-1.5">
            <div v-if="filteredSkills.length" class="grid gap-1.5">
              <button
                v-for="(skill, index) in filteredSkills"
                :key="skill.id"
                type="button"
                class="group flex min-h-14 w-full min-w-0 items-center gap-3 rounded-md border border-transparent px-3 py-2.5 text-left outline-none transition-[background-color,border-color,box-shadow,color] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ds-brand-focus"
                :class="skill.id === selectedSkillId ? 'border-ds-border-brand-85 bg-ds-fill-brand-transparent-10 text-foreground shadow-sm' : 'text-muted-foreground hover:border-ds-border-subtle-10 hover:bg-background/70 hover:text-foreground'"
                @click="selectSkill(skill.id)"
              >
                <span class="grid size-8 shrink-0 place-items-center rounded-md transition-colors" :class="skill.id === selectedSkillId ? 'bg-ds-brand-default text-ds-text-inverse' : 'bg-ds-fill-brand-transparent-10 text-ds-text-brand group-hover:bg-ds-fill-brand-transparent-20'"><Icon name="askx-objects:skills" class="size-4" /></span>
                <span class="min-w-0 flex-1"><strong class="block truncate text-xs text-foreground">{{ skill.name }}</strong><span class="mt-1 block font-mono text-[9px] uppercase tracking-[0.12em]">{{ String(index + 1).padStart(2, '0') }}</span></span>
                <span v-if="healthById.get(skill.id)?.drifted" class="size-2 rounded-full bg-destructive" :title="t('skills.drifted')" />
              </button>
            </div>
            <p v-else class="p-6 text-center text-xs text-muted-foreground">{{ t('skills.noMatchingSkills') }}</p>
          </ScrollArea>
        </aside>

        <main class="min-w-0 bg-background">
          <div v-if="loading && !detail" class="grid gap-4 p-6"><Skeleton class="h-24 rounded-2xl" /><Skeleton class="h-[460px] rounded-2xl" /></div>
          <div v-else-if="detail" class="flex min-h-0 flex-col">
            <header class="relative overflow-hidden border-b px-5 py-5 sm:px-7">
              <div class="pointer-events-none absolute inset-y-0 right-0 w-2/5 bg-gradient-to-l from-ds-fill-brand-transparent-10 to-transparent" />
              <div class="relative flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2"><h3 class="text-2xl font-semibold tracking-[-0.03em]">{{ detail.name }}</h3><Badge variant="secondary">{{ detail.version ? `v${detail.version}` : t('skills.versionUnspecified') }}</Badge><Badge v-if="selectedHealth?.drifted" variant="destructive">{{ t('skills.drifted') }}</Badge></div>
                  <div class="mt-2 flex h-[4.5rem] max-w-3xl items-start gap-2">
                    <p ref="descriptionElement" class="line-clamp-3 min-w-0 flex-1 text-sm leading-6 text-muted-foreground">{{ detail.description || t('skills.noSkillDescription') }}</p>
                    <CsResponsiveOverlayPopoverDrawer
                      v-if="descriptionOverflow"
                      v-model:open="descriptionOpen"
                      :title="detail.name"
                      :description="t('skills.fullDescriptionHint')"
                      :popover="{ content: { side: 'bottom', align: 'start', sideOffset: 8, class: 'w-[min(34rem,calc(100vw-2rem))]' } }"
                      :drawer="{ root: { handleOnly: true }, content: { class: '[&>div:first-child]:hidden' } }"
                      :close-label="t('skills.closeFullDescription')"
                    >
                      <template #trigger>
                        <Button variant="ghost" size="sm" class="h-7 shrink-0 px-2 text-xs text-primary">
                          <Icon name="askx-status:info" class="size-3.5" />
                          {{ t('skills.viewFullDescription') }}
                        </Button>
                      </template>
                      <ScrollArea class="h-[min(16rem,40svh)]" viewport-class="pr-3">
                        <p class="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{{ detail.description }}</p>
                      </ScrollArea>
                    </CsResponsiveOverlayPopoverDrawer>
                  </div>
                </div>
                <div class="flex shrink-0 items-center gap-4 text-xs"><span><strong class="block text-lg tabular-nums">{{ detail.fileCount }}</strong><span class="text-muted-foreground">{{ t('skills.resourceFiles') }}</span></span><span class="h-8 w-px bg-border" /><span><strong class="block text-lg tabular-nums">{{ detail.tree.length }}</strong><span class="text-muted-foreground">{{ t('skills.rootEntries') }}</span></span></div>
              </div>
              <div class="relative mt-4 flex w-full max-w-full flex-wrap items-center justify-between gap-2">
                <button type="button" class="flex h-9 min-w-0 max-w-full items-center gap-2 rounded-lg bg-ds-fill-bw-transparent-3 px-3 font-mono text-[10px] text-muted-foreground transition hover:bg-ds-fill-bw-transparent-5 hover:text-foreground" @click="copyPath(detail.canonicalPath)"><Icon name="askx-actions:copy" class="size-3.5 shrink-0" /><span class="truncate">{{ detail.canonicalPath }}</span></button>
                <div class="flex flex-wrap items-center gap-2">
                  <CsLocalPathOpener :path="detail.canonicalPath" />
                </div>
              </div>
            </header>

            <div class="grid min-h-0 flex-1 lg:grid-cols-[260px_minmax(0,1fr)]">
              <section class="min-h-0 border-b lg:border-r lg:border-b-0">
                <div class="flex h-12 items-center justify-between border-b px-4"><strong class="text-xs">{{ t('skills.skillStructure') }}</strong><span class="font-mono text-[9px] text-muted-foreground">{{ detail.fileCount }} FILES</span></div>
                <ScrollArea class="h-[300px] lg:h-[500px]" viewport-class="p-2">
                  <ul class="grid"><BusSkillsSkillTreeItem v-for="node in detail.tree" :key="node.path" :node="node" :selected-path="currentFile?.path" @select="selectFile" /></ul>
                </ScrollArea>
              </section>

              <section class="flex min-w-0 flex-col">
                <template v-if="currentFile">
                  <div class="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
                    <div class="flex min-w-0 items-center gap-2"><Icon :name="currentFileIcon" class="size-4 shrink-0 text-primary" /><span class="truncate font-mono text-[11px]">{{ currentFile.path }}</span><Badge v-if="!currentFile.editable" variant="secondary">{{ t('skills.readOnlyFile') }}</Badge><span v-if="dirty" class="size-2 shrink-0 rounded-full bg-ds-warning-default" :title="t('skills.unsaved')" /></div>
                    <div class="flex items-center gap-2">
                      <Tabs v-if="markdownFile" v-model="viewMode" default-value="edit">
                        <TabsList variant="segment" size="36" shape="regular" :aria-label="`${t('skills.editFile')} / ${t('skills.previewFile')}`">
                          <TabsTrigger value="edit"><Icon name="askx-actions:edit" />{{ t('skills.editFile') }}</TabsTrigger>
                          <TabsTrigger value="preview"><Icon name="askx-actions:preview" />{{ t('skills.previewFile') }}</TabsTrigger>
                        </TabsList>
                      </Tabs>
                      <Button v-if="dirty" variant="ghost" size="36" @click="resetDraft">{{ t('skills.discardChanges') }}</Button>
                      <Button v-if="currentFile.editable" size="36" :disabled="!dirty || saving" @click="prepareSave"><Icon name="askx-actions:edit" />{{ saving ? t('skills.preparingFileSave') : t('skills.saveFile') }}</Button>
                    </div>
                  </div>
                  <div class="min-h-0 flex-1 bg-ds-fill-bw-transparent-3 p-3">
                    <CsCodeEditor
                      v-if="viewMode === 'edit' || !markdownFile"
                      v-model="draft"
                      class="h-[440px] w-full"
                      :filename="currentFile.path"
                      :language="currentFile.language"
                      :label="t(currentFile.editable ? 'skills.fileEditorLabel' : 'skills.fileViewerLabel', { path: currentFile.path })"
                      :loading-label="t('skills.fileSyntaxLoading')"
                      :readonly="!currentFile.editable"
                    />
                    <ScrollArea v-else class="h-[440px] rounded-xl border bg-background" viewport-class="p-6"><BusMdcRender :value="draft" :cache-key="`${currentFile.path}:${draft.length}`" /></ScrollArea>
                  </div>
                  <footer class="flex items-center justify-between gap-3 border-t px-4 py-2 font-mono text-[9px] text-muted-foreground"><span>{{ currentFile.language.toUpperCase() }} · {{ formatFileSize(currentFile.size) }}</span><span>{{ t('skills.contentFingerprint') }} {{ currentFile.contentHash.slice(0, 12) }}</span></footer>
                </template>
                <div v-else class="grid min-h-[500px] place-items-center p-8 text-center"><div><span class="mx-auto grid size-12 place-items-center rounded-2xl bg-ds-fill-brand-transparent-10 text-primary"><Icon name="askx-objects:file" class="size-5" /></span><h4 class="mt-4 font-semibold">{{ t('skills.selectFileTitle') }}</h4><p class="mt-2 text-xs text-muted-foreground">{{ t('skills.selectFileDescription') }}</p></div></div>
              </section>
            </div>
          </div>
          <div v-else class="grid min-h-[680px] place-items-center p-8 text-center"><p class="text-sm text-muted-foreground">{{ t('skills.noMatchingSkills') }}</p></div>
        </main>
      </div>
    </div>

    <Dialog v-model:open="confirmOpen">
      <DialogContent class="sm:max-w-lg">
        <DialogHeader><DialogTitle>{{ t('skills.saveFileConfirmTitle') }}</DialogTitle><DialogDescription>{{ t('skills.saveFileConfirmDescription') }}</DialogDescription></DialogHeader>
        <div v-if="updatePlan" class="grid gap-3 rounded-xl border bg-ds-fill-bw-transparent-3 p-4 text-xs">
          <div><span class="text-muted-foreground">{{ t('skills.targetSkill') }}</span><strong class="ml-2">{{ updatePlan.skillName }}</strong></div>
          <div><span class="text-muted-foreground">{{ t('skills.targetFile') }}</span><code class="ml-2">{{ updatePlan.path }}</code></div>
          <div><span class="text-muted-foreground">{{ t('skills.planHash') }}</span><code class="ml-2">{{ updatePlan.hash.slice(0, 16) }}</code></div>
        </div>
        <DialogFooter class="mt-2"><Button variant="outline" :disabled="saving" @click="confirmOpen = false">{{ t('skills.cancelFileSave') }}</Button><Button :disabled="saving" @click="applySave"><Icon name="askx-actions:edit" />{{ saving ? t('skills.savingFile') : t('skills.confirmSaveFile') }}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
</template>
