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
const props = defineProps<{ mode: 'groups' | 'projects', showModeTabs: boolean, groups: { chatId: string, name: string }[], syncing: boolean }>()
/** 所有关系行为交回唯一 owner。 */
const emit = defineEmits<{ 'update:mode': [value: 'groups' | 'projects'], settings: [chatId: string], sync: [] }>()
/** 翻译入口。 */
const { t } = useI18n()
/** 群名称搜索。 */
const search = ref('')
/** 当前展示群。 */
const groups = computed(() => props.groups.filter(group => `${group.name} ${group.chatId}`.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase())))
</script>

<template>
    <div class="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-6 px-5 pb-6 sm:px-8">
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
            >
                <div
                    v-if="groups.length"
                    class="overflow-hidden rounded-2xl border border-border/70 bg-card"
                >
                    <div
                        v-for="group in groups"
                        :key="group.chatId"
                        class="group relative flex min-h-20 items-center gap-4 border-b border-border/50 px-4 py-4 last:border-0 sm:px-5"
                    >
                        <button
                            type="button"
                            class="absolute inset-0 rounded-xl transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                            :aria-label="`${t('bridge.projectSettings')} · ${group.name}`"
                            @click="emit('settings', group.chatId)"
                        />
                        <div class="pointer-events-none relative flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/40 bg-muted/60 text-muted-foreground group-hover:text-ds-text-brand">
                            <Icon
                                name="askx-objects:users"
                                class="size-5"
                            />
                        </div>
                        <div class="pointer-events-none relative min-w-0 flex-1 space-y-1">
                            <p class="truncate text-sm font-semibold text-foreground">
                                {{ group.name }}
                            </p>
                            <p class="truncate font-mono text-xs text-muted-foreground">
                                {{ group.chatId }}
                            </p>
                        </div>
                        <Tooltip>
                            <TooltipTrigger as-child>
                                <Button
                                    variant="ghost"
                                    :size="36"
                                    square
                                    class="relative text-muted-foreground hover:text-ds-text-brand"
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
                    </div>
                </div>
            </ScrollArea>
        </template>
        <slot v-else />
    </div>
</template>
