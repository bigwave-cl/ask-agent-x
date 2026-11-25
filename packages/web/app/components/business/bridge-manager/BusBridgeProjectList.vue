<script setup lang="ts">
import Button from '@/components/ui/button/Button.vue'
import Input from '@/components/ui/input/Input.vue'
import Switch from '@/components/ui/switch/Switch.vue'
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
    /** Codex 项目最近更新时间。 */
    updatedAt?: string | null
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
const emit = defineEmits<{ import: [], edit: [project: Project], changed: [change: BridgeCatalogChange], toggle: [project: Project], 'activation-change': [project: Project, active: boolean] }>()
/** 翻译入口。 */
const { t, locale } = useI18n()
/** 将 ISO 时间转换为列表中的短日期时间。 */
function formatUpdatedAt(value?: string | null): string {
    if (!value) return t('bridge.neverUpdated')
    const timestamp = Date.parse(value)
    if (!Number.isFinite(timestamp)) return t('bridge.neverUpdated')
    return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp)
}
/** 仅用于当前列表的搜索草稿。 */
const search = ref('')
/** 当前列表的更新时间排序方向，默认最近更新优先。 */
const sortDirection = ref<'asc' | 'desc'>('desc')
/** 切换更新时间的升降序。 */
function toggleSort(): void {
    sortDirection.value = sortDirection.value === 'desc' ? 'asc' : 'desc'
}
/** 按名称和完整路径筛选，不建立目录身份索引。 */
const filteredProjects = computed(() => {
    /** 忽略大小写的搜索文本。 */
    const query = search.value.trim().toLocaleLowerCase()
    return props.projects
        .filter(project => `${project.name}\n${project.path}`.toLocaleLowerCase().includes(query))
        .sort((left, right) => {
            /** 无记录或非法日期始终排在有效时间之后。 */
            const leftTime = left.updatedAt ? Date.parse(left.updatedAt) : Number.NaN
            /** 右侧记录的有效时间戳。 */
            const rightTime = right.updatedAt ? Date.parse(right.updatedAt) : Number.NaN
            if (!Number.isFinite(leftTime)) return Number.isFinite(rightTime) ? 1 : 0
            if (!Number.isFinite(rightTime)) return -1
            return sortDirection.value === 'desc' ? rightTime - leftTime : leftTime - rightTime
        })
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
        <ScrollArea
            :class="relationMode ? 'min-w-0 shrink-0' : 'min-h-0 flex-1'"
            viewport-class="p-1"
            :orientation="relationMode ? 'horizontal' : 'both'"
        >
            <div
                class="overflow-hidden"
                :class="relationMode ? 'min-w-[600px]' : 'min-w-[720px]'"
            >
                <table class="w-full table-fixed">
                    <thead class="text-xs text-muted-foreground">
                        <tr>
                            <th
                                scope="col"
                                class="px-5 py-3 text-left font-medium"
                            >
                                {{ t('bridge.projectInfo') }}
                            </th>
                            <th
                                scope="col"
                                class="px-5 py-3 text-left font-medium"
                                :class="relationMode ? 'w-44' : 'w-52'"
                                :aria-sort="sortDirection === 'asc' ? 'ascending' : 'descending'"
                            >
                                <button
                                    type="button"
                                    class="inline-flex items-center gap-1.5 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    :aria-label="t(sortDirection === 'asc' ? 'bridge.updatedSortAscending' : 'bridge.updatedSortDescending')"
                                    @click="toggleSort"
                                >
                                    {{ t('bridge.updatedAt') }}
                                    <Icon
                                        name="askx-navigation:arrow-up"
                                        :class="{ 'rotate-180': sortDirection === 'desc' }"
                                        class="size-3.5"
                                        aria-hidden="true"
                                    />
                                </button>
                            </th>
                            <th
                                scope="col"
                                :class="relationMode ? 'w-36 px-5 py-3' : 'w-20 px-5 py-3'"
                            />
                        </tr>
                    </thead>
                    <tbody>
                        <tr
                            v-for="project in filteredProjects"
                            :key="project.path"
                            class="border-b border-border/50 last:border-0"
                        >
                            <td class="px-5 py-4">
                                <div class="flex min-w-0 items-center gap-4">
                                    <div
                                        class="flex size-10 shrink-0 items-center justify-center rounded-xl"
                                        :class="relationMode && activePath === project.path ? 'bg-primary/10 text-ds-text-brand' : 'bg-muted/70 text-muted-foreground'"
                                    >
                                        <Icon
                                            :name="relationMode && activePath === project.path ? 'askx-objects:folder-open' : 'askx-objects:folder'"
                                            class="size-5"
                                        />
                                    </div>
                                    <div class="min-w-0 flex-1 space-y-1">
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
                                </div>
                            </td>
                            <td class="px-5 py-4 text-xs text-muted-foreground">
                                {{ formatUpdatedAt(project.updatedAt) }}
                            </td>
                            <td class="px-5 py-4 text-right">
                                <div
                                    v-if="relationMode"
                                    class="flex justify-end items-center gap-2 whitespace-nowrap"
                                >
                                    <Tooltip v-if="linkedPaths.includes(project.path)">
                                        <TooltipTrigger
                                            v-if="pendingPaths.includes(project.path) || (project.available === false && activePath !== project.path)"
                                            as-child
                                        >
                                            <span
                                                class="inline-flex min-h-9 items-center"
                                                tabindex="0"
                                            >
                                                <Switch
                                                    :model-value="activePath === project.path"
                                                    disabled
                                                    :aria-busy="pendingPaths.includes(project.path)"
                                                    :aria-label="`${t(activePath === project.path ? 'bridge.deactivateProject' : 'bridge.activateProject')} · ${project.name}`"
                                                    @update:model-value="emit('activation-change', project, $event)"
                                                />
                                            </span>
                                        </TooltipTrigger>
                                        <TooltipTrigger
                                            v-else
                                            as-child
                                        >
                                            <Switch
                                                :model-value="activePath === project.path"
                                                :aria-busy="pendingPaths.includes(project.path)"
                                                :aria-label="`${t(activePath === project.path ? 'bridge.deactivateProject' : 'bridge.activateProject')} · ${project.name}`"
                                                @update:model-value="emit('activation-change', project, $event)"
                                            />
                                        </TooltipTrigger>
                                        <TooltipContent>{{ t(activePath === project.path ? 'bridge.currentProject' : 'bridge.activateProject') }}</TooltipContent>
                                    </Tooltip>
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
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </ScrollArea>
    </div>
</template>
