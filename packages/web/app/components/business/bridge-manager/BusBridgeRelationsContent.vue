<script setup lang="ts">
import Button from '@/components/ui/button/Button.vue'
import Input from '@/components/ui/input/Input.vue'
import ScrollArea from '@/components/ui/scroll-area/ScrollArea.vue'
import Tabs from '@/components/ui/tabs/Tabs.vue'
import TabsList from '@/components/ui/tabs/TabsList.vue'
import TabsTrigger from '@/components/ui/tabs/TabsTrigger.vue'
import Tooltip from '@/components/ui/tooltip/Tooltip.vue'
import TooltipTrigger from '@/components/ui/tooltip/TooltipTrigger.vue'
import TooltipContent from '@/components/ui/tooltip/TooltipContent.vue'
/** 只读群列表与页级分类。 */
const props = defineProps<{ mode: 'groups' | 'projects', showModeTabs: boolean, groups: { chatId: string, name: string, updatedAt?: string | null }[], syncing: boolean }>()
/** 所有关系行为交回唯一 owner。 */
const emit = defineEmits<{ 'update:mode': [value: 'groups' | 'projects'], settings: [chatId: string], sync: [] }>()
/** 翻译入口。 */
const { t, locale } = useI18n()
/** 群名称搜索。 */
const search = ref('')
/** 当前列表的更新时间排序方向，默认最近更新优先。 */
const sortDirection = ref<'asc' | 'desc'>('desc')
/** 切换更新时间的升降序。 */
function toggleSort(): void {
    sortDirection.value = sortDirection.value === 'desc' ? 'asc' : 'desc'
}
/** 页面显示的群组按管理资料最近更新时间排序。 */
const groups = computed(() => [...props.groups]
    .filter(group => `${group.name} ${group.chatId}`.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase()))
    .sort((left, right) => {
        /** 无记录或非法日期始终排在有效时间之后。 */
        const leftTime = left.updatedAt ? Date.parse(left.updatedAt) : Number.NaN
        /** 右侧记录的有效时间戳。 */
        const rightTime = right.updatedAt ? Date.parse(right.updatedAt) : Number.NaN
        if (!Number.isFinite(leftTime)) return Number.isFinite(rightTime) ? 1 : 0
        if (!Number.isFinite(rightTime)) return -1
        return sortDirection.value === 'desc' ? rightTime - leftTime : leftTime - rightTime
    }))
/** 将 ISO 时间转换为当前语言环境的短日期时间。 */
function formatUpdatedAt(value?: string | null): string {
    if (!value) return t('bridge.neverUpdated')
    const timestamp = Date.parse(value)
    if (!Number.isFinite(timestamp)) return t('bridge.neverUpdated')
    return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp)
}
</script>

<template>
    <div class="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-7 px-4 pb-7 sm:px-6 lg:px-8">
        <Tabs
            v-if="showModeTabs"
            :model-value="mode"
            class="shrink-0"
            @update:model-value="emit('update:mode', $event as 'groups' | 'projects')"
        >
            <TabsList
                variant="line"
                size="44"
                shape="regular"
                class="w-full gap-6 border-b border-border/60"
                :aria-label="t('bridge.managementTabs')"
            >
                <TabsTrigger value="groups">
                    {{ t('bridge.groupManagement') }}
                </TabsTrigger>
                <TabsTrigger value="projects">
                    {{ t('bridge.projectManagement') }}
                </TabsTrigger>
            </TabsList>
        </Tabs>
        <template v-if="mode === 'groups'">
            <div class="flex shrink-0 flex-wrap items-center gap-3">
                <div class="relative min-w-40 flex-1 sm:max-w-sm">
                    <Icon
                        name="askx-actions:search"
                        class="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                        v-model="search"
                        :placeholder="t('bridge.searchGroups')"
                        :aria-label="t('bridge.searchGroups')"
                        class="h-10 bg-card pl-9"
                    />
                </div>
                <Button
                    variant="outlined"
                    :size="40"
                    class="ml-auto"
                    :disabled="syncing"
                    @click="emit('sync')"
                >
                    <Icon
                        :name="syncing ? 'askx-status:loading' : 'askx-actions:refresh'"
                        :class="{ 'animate-spin': syncing }"
                    />
                    {{ t(syncing ? 'bridge.refreshingGroups' : 'bridge.syncGroups') }}
                </Button>
            </div>
            <ScrollArea
                class="min-h-0 flex-1"
                viewport-class="p-1"
                orientation="both"
            >
                <div
                    class="min-w-[640px] overflow-hidden"
                >
                    <table class="w-full table-fixed">
                        <thead class="text-xs text-muted-foreground">
                            <tr>
                                <th
                                    scope="col"
                                    class="px-5 py-3 text-left font-medium"
                                >
                                    {{ t('bridge.groupInfo') }}
                                </th>
                                <th
                                    scope="col"
                                    class="w-52 px-5 py-3 text-left font-medium"
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
                                    class="w-20 px-5 py-3"
                                />
                            </tr>
                        </thead>
                        <tbody>
                            <tr
                                v-for="group in groups"
                                :key="group.chatId"
                                class="border-b border-border/50 last:border-0"
                            >
                                <td class="px-5 py-4">
                                    <button
                                        type="button"
                                        class="group flex w-full min-w-0 items-center gap-4 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        :aria-label="`${t('bridge.projectSettings')} · ${group.name}`"
                                        @click="emit('settings', group.chatId)"
                                    >
                                        <span class="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/40 bg-muted/60 text-muted-foreground group-hover:text-ds-text-brand">
                                            <Icon
                                                name="askx-objects:users"
                                                class="size-5"
                                            />
                                        </span>
                                        <span class="min-w-0 flex-1 space-y-1">
                                            <span class="block truncate text-sm font-semibold text-foreground">{{ group.name }}</span>
                                            <span class="block truncate font-mono text-xs text-muted-foreground">{{ group.chatId }}</span>
                                        </span>
                                    </button>
                                </td>
                                <td class="px-5 py-4 text-xs text-muted-foreground">
                                    {{ formatUpdatedAt(group.updatedAt) }}
                                </td>
                                <td class="px-5 py-4 text-right">
                                    <Tooltip>
                                        <TooltipTrigger as-child>
                                            <Button
                                                variant="ghost"
                                                :size="36"
                                                square
                                                class="text-muted-foreground hover:text-ds-text-brand"
                                                :aria-label="`${t('bridge.projectSettings')} · ${group.name}`"
                                                @click.stop="emit('settings', group.chatId)"
                                            >
                                                <Icon
                                                    name="askx-actions:settings"
                                                    class="size-4"
                                                />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>{{ t('bridge.projectSettings') }}</TooltipContent>
                                    </Tooltip>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </ScrollArea>
        </template>
        <slot v-else />
    </div>
</template>
