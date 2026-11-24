<script setup lang="ts">
import Button from '@/components/ui/button/Button.vue'
import Input from '@/components/ui/input/Input.vue'
import ScrollArea from '@/components/ui/scroll-area/ScrollArea.vue'
import Tooltip from '@/components/ui/tooltip/Tooltip.vue'
import TooltipTrigger from '@/components/ui/tooltip/TooltipTrigger.vue'
import TooltipContent from '@/components/ui/tooltip/TooltipContent.vue'
import BusBridgeItemMenu from './BusBridgeItemMenu.vue'
import type { BridgeCatalogChange } from './BusBridgeItemMenu.vue'

/** 项目列表消费的目录记录。 */
interface Project {
    /** 目录身份。 */
    path: string
    /** 显示名称。 */
    name: string
    /** 目录是否可用，省略时默认可用。 */
    available?: boolean
}
/** 项目列表由调用方提供目录及关联状态。 */
const props = withDefaults(defineProps<{
    /** 全部登记项目。 */
    projects: Project[]
    /** 展示群组关联操作。 */
    relationMode?: boolean
    /** 已绑定的目录身份。 */
    linkedPaths?: string[]
    /** 当前激活目录。 */
    activePath?: string
    /** 正在提交关联的目录。 */
    pendingPaths?: string[]
}>(), { relationMode: false, linkedPaths: () => [], activePath: '', pendingPaths: () => [] })
/** 上层负责编辑器及关联事务。 */
const emit = defineEmits<{ import: [], edit: [project: Project], changed: [change: BridgeCatalogChange], toggle: [project: Project], activate: [project: Project] }>()
/** 翻译入口。 */
const { t } = useI18n()
/** 仅用于当前列表的搜索草稿。 */
const search = ref('')
/** 按名称和完整路径筛选，不建立目录身份索引。 */
const filteredProjects = computed(() => {
    /** 忽略大小写的搜索文本。 */
    const query = search.value.trim().toLocaleLowerCase()
    return props.projects.filter(project => `${project.name}\n${project.path}`.toLocaleLowerCase().includes(query))
})
</script>

<template>
    <div class="flex min-h-0 flex-1 flex-col gap-5">
        <div class="flex shrink-0 flex-wrap items-center gap-3">
            <div
                class="relative min-w-40 flex-1"
                :class="relationMode ? '' : 'sm:max-w-sm'"
            >
                <Icon
                    name="askx-actions:search"
                    class="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                    v-model="search"
                    :placeholder="t('bridge.searchProjects')"
                    :aria-label="t('bridge.searchProjects')"
                    class="h-10 bg-card pl-9"
                />
            </div>
            <Button
                :variant="relationMode ? 'outlined' : 'primary'"
                :size="40"
                class="ml-auto"
                @click="emit('import')"
            >
                <Icon name="askx-actions:add" />{{ t('bridge.importProject') }}
            </Button>
        </div>
        <component
            :is="relationMode ? 'div' : ScrollArea"
            v-bind="relationMode ? {} : { viewportClass: 'p-1' }"
            class="min-h-0 flex-1"
            :class="{ 'p-1': relationMode }"
        >
            <div class="space-y-2">
                <div
                    v-for="project in filteredProjects"
                    :key="project.path"
                    class="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4 transition-colors sm:gap-4"
                    :class="relationMode && activePath === project.path ? 'border-primary/40 bg-accent/60' : 'border-border/60 hover:border-border'"
                >
                    <div
                        class="flex size-10 shrink-0 items-center justify-center rounded-xl"
                        :class="relationMode && activePath === project.path ? 'bg-primary/10 text-ds-text-brand' : 'bg-muted/70 text-muted-foreground'"
                    >
                        <Icon
                            :name="relationMode && activePath === project.path ? 'askx-objects:folder-open' : 'askx-objects:folder'"
                            class="size-5"
                        />
                    </div>
                    <div class="min-w-0 flex-1 basis-28 space-y-1">
                        <div class="flex min-w-0 items-center gap-2">
                            <span class="truncate text-sm font-semibold">{{ project.name }}</span>
                            <Tooltip v-if="project.available === false">
                                <TooltipTrigger as-child>
                                    <span
                                        tabindex="0"
                                        class="inline-flex shrink-0 items-center gap-1 text-xs text-destructive"
                                        :aria-label="t('bridge.projectUnavailableHint')"
                                    >
                                        <Icon
                                            name="askx-status:error"
                                            class="size-3.5"
                                        />{{ t('bridge.projectUnavailable') }}
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent class="max-w-64">
                                    {{ t('bridge.projectUnavailableHint') }}
                                </TooltipContent>
                            </Tooltip>
                        </div>
                        <p
                            class="truncate font-mono text-xs text-muted-foreground"
                            :title="project.path"
                        >
                            {{ project.path }}
                        </p>
                    </div>
                    <div
                        v-if="relationMode"
                        class="ml-auto flex shrink-0 items-center gap-2"
                    >
                        <span
                            v-if="activePath === project.path"
                            class="inline-flex h-9 items-center gap-2 rounded-lg bg-primary/10 px-3 text-xs font-semibold text-ds-text-brand"
                        >
                            <span class="size-1.5 rounded-full bg-current" />{{ t('bridge.currentProject') }}
                        </span>
                        <Button
                            v-else-if="linkedPaths.includes(project.path) && project.available !== false"
                            variant="outlined"
                            :size="36"
                            :disabled="pendingPaths.includes(project.path)"
                            :aria-label="`${t('bridge.activateProject')} · ${project.name}`"
                            @click="emit('activate', project)"
                        >
                            <Icon name="askx-navigation:arrow-right" />{{ t('bridge.activateProject') }}
                        </Button>
                        <Tooltip>
                            <TooltipTrigger as-child>
                                <Button
                                    :variant="linkedPaths.includes(project.path) ? 'ghost' : 'tertiary'"
                                    :size="36"
                                    square
                                    :class="linkedPaths.includes(project.path) ? 'text-muted-foreground hover:text-destructive' : ''"
                                    :disabled="pendingPaths.includes(project.path) || (project.available === false && !linkedPaths.includes(project.path))"
                                    :aria-label="`${t(linkedPaths.includes(project.path) ? 'bridge.unlinkProject' : 'bridge.linkProject')} · ${project.name}`"
                                    @click="emit('toggle', project)"
                                >
                                    <Icon
                                        :name="pendingPaths.includes(project.path) ? 'askx-status:loading' : linkedPaths.includes(project.path) ? 'askx-actions:unlink' : 'askx-actions:link'"
                                        :class="{ 'animate-spin': pendingPaths.includes(project.path) }"
                                    />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>{{ t(linkedPaths.includes(project.path) ? 'bridge.unlinkProject' : 'bridge.linkProject') }}</TooltipContent>
                        </Tooltip>
                    </div>
                    <slot
                        v-else
                        name="operations"
                        :project="project"
                    >
                        <BusBridgeItemMenu
                            kind="project"
                            :item-id="project.path"
                            :label="project.name"
                            :disabled="project.available === false"
                            @settings="emit('edit', project)"
                            @changed="emit('changed', $event)"
                        />
                    </slot>
                </div>
            </div>
        </component>
    </div>
</template>
