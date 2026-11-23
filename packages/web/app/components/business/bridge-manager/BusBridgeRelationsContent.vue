<script setup lang="ts">
import Button from '@/components/ui/button/Button.vue'
import Input from '@/components/ui/input/Input.vue'
import ScrollArea from '@/components/ui/scroll-area/ScrollArea.vue'
import Tabs from '@/components/ui/tabs/Tabs.vue'
import TabsList from '@/components/ui/tabs/TabsList.vue'
import TabsTrigger from '@/components/ui/tabs/TabsTrigger.vue'
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
    <div class="flex min-h-0 flex-1 flex-col gap-4 p-6">
        <Tabs
            v-if="showModeTabs"
            :model-value="mode"
            @update:model-value="emit('update:mode', $event as 'groups' | 'projects')"
        >
            <TabsList
                variant="line"
                size="40"
                shape="regular"
                class="w-full"
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
            <div class="flex items-center gap-2">
                <Input
                    v-model="search"
                    :placeholder="t('bridge.searchGroups')"
                    :aria-label="t('bridge.searchGroups')"
                    class="min-w-0 flex-1"
                />
                <Button
                    variant="outlined"
                    :size="36"
                    :disabled="syncing"
                    @click="emit('sync')"
                >
                    <Icon name="askx-actions:refresh" />{{ t('bridge.syncGroups') }}
                </Button>
            </div>
            <ScrollArea class="min-h-0 flex-1">
                <div class="divide-y divide-border">
                    <div
                        v-for="group in groups"
                        :key="group.chatId"
                        class="flex items-center gap-3 py-4"
                    >
                        <Icon
                            name="askx-objects:users"
                            class="size-4 shrink-0 text-muted-foreground"
                        />
                        <div class="min-w-0 flex-1">
                            <p class="truncate text-sm font-medium">
                                {{ group.name }}
                            </p><p class="truncate text-xs text-muted-foreground">
                                {{ group.chatId }}
                            </p>
                        </div>
                        <Button
                            variant="outlined"
                            :size="36"
                            @click="emit('settings', group.chatId)"
                        >
                            {{ t('bridge.projectSettings') }}
                        </Button>
                    </div>
                </div>
                <p
                    v-if="!groups.length"
                    class="py-10 text-center text-sm text-muted-foreground"
                >
                    {{ t('bridge.noGroups') }}
                </p>
            </ScrollArea>
        </template>
        <slot v-else />
    </div>
</template>
