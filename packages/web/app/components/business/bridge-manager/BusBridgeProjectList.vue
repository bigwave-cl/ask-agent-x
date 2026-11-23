<script setup lang="ts">
import Button from '@/components/ui/button/Button.vue'
import Input from '@/components/ui/input/Input.vue'
import ScrollArea from '@/components/ui/scroll-area/ScrollArea.vue'
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
    <div class="flex min-h-0 flex-1 flex-col gap-3">
        <div class="flex items-center gap-2">
            <Input
                v-model="search"
                :placeholder="t('bridge.searchProjects')"
                :aria-label="t('bridge.searchProjects')"
                class="min-w-0 flex-1"
            />
            <Button
                variant="outlined"
                :size="36"
                @click="emit('import')"
            >
                <Icon name="askx-actions:add" />{{ t('bridge.importProject') }}
            </Button>
        </div>
        <ScrollArea
            class="min-h-0 flex-1"
            viewport-class="max-h-[55vh]"
        >
            <div class="divide-y divide-border">
                <div
                    v-for="project in filteredProjects"
                    :key="project.path"
                    class="flex items-center gap-2 py-3"
                >
                    <Icon
                        name="askx-objects:folder"
                        class="size-4 shrink-0 text-muted-foreground"
                    />
                    <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2">
                            <span class="truncate text-sm font-medium">{{ project.name }}</span>
                            <span
                                v-if="activePath === project.path"
                                class="shrink-0 text-xs text-primary"
                            >{{ t('bridge.active') }}</span>
                            <span
                                v-if="project.available === false"
                                class="shrink-0 text-xs text-destructive"
                            >{{ t('bridge.projectUnavailable') }}</span>
                        </div>
                        <p
                            class="truncate text-xs text-muted-foreground"
                            :title="project.path"
                        >
                            {{ project.path }}
                        </p>
                    </div>
                    <Button
                        v-if="relationMode && linkedPaths.includes(project.path) && activePath !== project.path && project.available !== false"
                        variant="ghost"
                        :size="36"
                        square
                        :disabled="pendingPaths.includes(project.path)"
                        :aria-label="t('bridge.activateProject')"
                        @click="emit('activate', project)"
                    >
                        <Icon name="askx-actions:confirm" />
                    </Button>
                    <Button
                        v-if="relationMode"
                        :variant="linkedPaths.includes(project.path) ? 'ghost' : 'outlined'"
                        :size="36"
                        :disabled="pendingPaths.includes(project.path) || (project.available === false && !linkedPaths.includes(project.path))"
                        @click="emit('toggle', project)"
                    >
                        {{ t(linkedPaths.includes(project.path) ? 'bridge.unlinkProject' : 'bridge.linkProject') }}
                    </Button>
                    <slot
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
            <p
                v-if="!filteredProjects.length"
                class="py-10 text-center text-sm text-muted-foreground"
            >
                {{ t('bridge.noMatchingProjects') }}
            </p>
        </ScrollArea>
    </div>
</template>
