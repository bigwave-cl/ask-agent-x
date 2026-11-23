<script setup lang="ts">
import Button from '@/components/ui/button/Button.vue'
import Input from '@/components/ui/input/Input.vue'
import { ScrollArea } from '@/components/ui/scroll-area'
import Tabs from '@/components/ui/tabs/Tabs.vue'
import TabsList from '@/components/ui/tabs/TabsList.vue'
import TabsTrigger from '@/components/ui/tabs/TabsTrigger.vue'
import { useConfirm } from '@/composables/useConfirm'
import { useBridgeServiceControl } from '@/composables/useBridgeServiceControl'
/** 飞书可编辑配置，不包含凭据引用。 */
interface FeishuDraft {
    /** 凭据来源。 */
    source: 'openclaw' | 'custom'
    /** 应用编号。 */
    appId: string
    /** 私聊管理员。 */
    adminOpenId?: string
    /** 服务端是否持有密钥。 */
    hasSecret?: boolean
}
/** 设置响应。 */
interface Config {
    /** 乐观锁版本。 */
    revision: number
    /** 已保存但运行时应用失败。 */
    applicationError?: string
    /** 设置内容。 */
    bridge: {
        /** 工作时间。 */
        workTime: { mode: 'always' | 'windows', window: { start: string, end: string }, outsideWindow: 'stop-service' }
        /** 桥接专用 Codex 运行目录。 */
        paths: { codexHome: string, authFile: string, configFile: string }
        /** 飞书设置。 */
        feishu: FeishuDraft
    }
}
/** 面板开关。 */
const open = defineModel<boolean>('open', { default: false })
/** 翻译入口。 */
const { t } = useI18n()
const toast = useToast()
/** 服务端配置草稿。 */
const config = ref<Config | null>(null)
/** 当前设置区。 */
const { status, statusIcon, refreshStatus } = useBridgeServiceControl()
const logs = ref<string[]>([])
let logsGeneration = 0
const serviceLastError = computed(() => status.value?.lastError)
const serverStatusRunning = computed(() => status.value?.runtimeStatus === 'running' && status.value.healthy)
const serverStatusIcon = computed(() => statusIcon.value === 'askx-status:loading' ? statusIcon.value : serverStatusRunning.value ? 'askx-status:check' : 'askx-status:prohibited')
const serverStatusLabel = computed(() => serverStatusRunning.value ? t('bridge.statusRunning') : t('bridge.statusNotRunning'))
/** 设置分区枚举。 */
const tab = ref<'server' | 'config' | 'feishu'>('server')
/** 密钥仅暂存内存。 */
const secret = ref('')
/** 检测到的应用。 */
const accounts = ref<{ appId: string, name: string }[]>([])
/** 操作进行状态。 */
const busy = ref(false)
/** 面板提示。 */
/** 拒绝关闭后返回的异步结果。 */
let generation = 0
/** 读取配置与服务状态。 */
async function load(): Promise<void> {
    const current = ++generation
    try {
        const settings = await $fetch<Config>('/api/bridge/config')
        if (current !== generation || !open.value) return
        config.value = settings
    }
    catch { if (current === generation) toast.error(t('bridge.loadError')) }
}
/** 读取最近运行日志，响应失效时丢弃结果。 */
async function loadLogs(): Promise<void> {
    const current = ++logsGeneration
    try {
        const result = await $fetch<{ file: string, lines: string[] }>('/api/bridge/logs?limit=40')
        if (current === logsGeneration && open.value && tab.value === 'server') logs.value = result.lines
    }
    catch { if (current === logsGeneration) toast.error(t('bridge.logsLoadError')) }
}
/** 即时服务控制只使用已保存版本。 */
async function action(name: string): Promise<void> {
    if (!config.value || busy.value) return
    busy.value = true
    const current = generation
    try {
        await $fetch('/api/bridge/action', { method: 'POST', body: { action: name, revision: config.value.revision, confirmation: true } })
        if (current === generation) { await refreshStatus(true); toast.success(t('bridge.actionApplied')) }
    }
    catch { if (current === generation) toast.error(t('bridge.loadError')) }
    finally { if (current === generation) busy.value = false }
}
/** 检测本机 OpenClaw 应用，不读取密钥。 */
async function detect(): Promise<void> {
    const current = generation
    try {
        const result = await $fetch<{ accounts: { appId: string, name: string }[] }>('/api/bridge/feishu/import')
        if (current !== generation) return
        accounts.value = result.accounts
        if (config.value && result.accounts[0]) config.value.bridge.feishu.appId = result.accounts[0].appId
        if (!result.accounts.length) toast.error(t('bridge.noAccounts'))
    }
    catch { if (current === generation) toast.error(t('bridge.loadError')) }
}
/** 验证草稿连接，不保存配置。 */
async function test(): Promise<void> {
    if (!config.value || busy.value) return
    busy.value = true
    const current = generation
    try {
        await $fetch('/api/bridge/feishu/test', { method: 'POST', body: { ...config.value.bridge.feishu, adminOpenId: config.value.bridge.feishu.adminOpenId?.trim() || undefined, hasSecret: undefined, appSecret: secret.value || undefined } })
        if (current === generation) toast.success(t('bridge.connectionOk'))
    }
    catch { if (current === generation) toast.error(t('bridge.loadError')) }
    finally { if (current === generation) busy.value = false }
}
/** 保存当前区配置，冲突时重新读取版本。 */
function save(): void {
    if (!config.value || busy.value) return
    useConfirm({
        title: t('bridge.saveRestartTitle'),
        desc: t('bridge.saveRestartConfirm'),
        cancelText: t('common.cancel'),
        okText: t('bridge.save'),
        onOk: done => saveConfirmed(done),
    })
}
/** 保存确认后的配置并应用服务重启。 */
async function saveConfirmed(done: () => void): Promise<void> {
    if (!config.value || busy.value) return
    busy.value = true
    const current = generation
    const submittedSecret = secret.value
    const submittedTab = tab.value
    /** 仅快照本次提交区块，其他区块始终保持本地草稿。 */
    const submittedBlock = JSON.stringify(submittedTab === 'config'
        ? { workTime: config.value.bridge.workTime, paths: { codexHome: config.value.bridge.paths.codexHome.trim(), authFile: config.value.bridge.paths.authFile.trim(), configFile: config.value.bridge.paths.configFile.trim() } }
        : config.value.bridge.feishu)
    const { source, appId, adminOpenId } = config.value.bridge.feishu
    const configPatch = submittedTab === 'config'
        ? { workTime: JSON.parse(JSON.stringify(config.value.bridge.workTime)), paths: { codexHome: config.value.bridge.paths.codexHome.trim(), authFile: config.value.bridge.paths.authFile.trim(), configFile: config.value.bridge.paths.configFile.trim() } }
        : undefined
    try {
        const result = await $fetch<Config>('/api/bridge/config', { method: 'PUT', body: { revision: config.value.revision, patch: configPatch ?? { feishu: { source, appId, adminOpenId: adminOpenId?.trim() || undefined } }, appSecret: submittedTab === 'feishu' && secret.value ? secret.value : undefined } })
        if (current !== generation) return
        if (config.value) {
            config.value.revision = result.revision
            if (submittedTab === 'config') {
                const currentBlock = JSON.stringify({ workTime: config.value.bridge.workTime, paths: { codexHome: config.value.bridge.paths.codexHome.trim(), authFile: config.value.bridge.paths.authFile.trim(), configFile: config.value.bridge.paths.configFile.trim() } })
                if (currentBlock === submittedBlock) {
                    config.value.bridge.workTime = result.bridge.workTime
                    config.value.bridge.paths = result.bridge.paths
                }
            }
            else if (JSON.stringify(config.value.bridge.feishu) === submittedBlock) config.value.bridge.feishu = result.bridge.feishu
        }
        if (submittedTab === 'feishu' && secret.value === submittedSecret) secret.value = ''
        if (result.applicationError) toast.error(t('bridge.savedApplyFailed'))
        else toast.success(t('bridge.saved'))
        await refreshStatus(true)
        if (!result.applicationError) done()
    }
    catch (error) {
        if (current !== generation) return
        const code = (error as { statusCode?: number }).statusCode
        if (code === 409) toast.error(t('bridge.draftConflict'))
        else toast.error(t('bridge.loadError'))
    }
    finally { if (current === generation) busy.value = false }
}
watch(open, value => {
    secret.value = ''; busy.value = false; accounts.value = []; logs.value = []
    if (value) { void load(); void loadLogs() }
    else { generation += 1; config.value = null }
})
watch(tab, value => { if (value === 'server' && open.value) void loadLogs() })
onUnmounted(() => { generation += 1; secret.value = '' })
</script>

<template>
    <CsResponsiveOverlayDialogDrawer
        v-model:open="open"
        :title="t('bridge.settingsTitle')"
        :description="t('bridge.settingsDescription')"
        :dialog="{ content: { class: 'h-[min(52rem,92dvh)] sm:max-w-xl' } }"
        :drawer="{ content: { class: 'h-[92dvh]' } }"
        shell-class="h-full min-h-0"
        header-class="pb-2 md:pb-2"
        body-class="min-h-0 flex flex-1 flex-col overflow-hidden px-6 pb-6 pt-0"
        footer-class="shrink-0 border-t bg-card p-4"
        :close-label="t('common.close')"
    >
        <ScrollArea
            class="min-h-0 flex-1"
            viewport-class="pr-2"
        >
            <Tabs
                v-model="tab"
                class="gap-5 pt-1"
            >
                <TabsList
                    variant="line"
                    size="40"
                    shape="regular"
                    class="w-full"
                    :aria-label="t('bridge.settingsTabs')"
                >
                    <TabsTrigger value="server">
                        {{ t('bridge.tabServer') }}
                    </TabsTrigger>
                    <TabsTrigger value="config">
                        {{ t('bridge.tabConfig') }}
                    </TabsTrigger>
                    <TabsTrigger value="feishu">
                        {{ t('bridge.feishu') }}
                    </TabsTrigger>
                </TabsList>
            </Tabs>
            <template v-if="config">
                <div
                    v-if="tab === 'server'"
                    class="mt-5 min-h-0 flex flex-col space-y-7"
                >
                    <section class="space-y-4">
                        <div class="flex justify-between text-sm">
                            <strong>{{ t('bridge.serviceControl') }}</strong><span class="inline-flex items-center gap-2 text-muted-foreground"><Icon
                                :name="serverStatusIcon"
                                class="size-4"
                                :class="serverStatusIcon === 'askx-status:loading' ? 'animate-spin' : ''"
                            />{{ serverStatusLabel }}</span>
                        </div>
                        <div class="flex flex-wrap gap-2">
                            <Button
                                :size="36"
                                :disabled="busy"
                                @click="action(status?.desiredState === 'enabled' ? 'stop' : 'start')"
                            >
                                <Icon :name="status?.desiredState === 'enabled' ? 'askx-actions:stop' : 'askx-actions:play'" />{{ t(status?.desiredState === 'enabled' ? 'bridge.stop' : 'bridge.start') }}
                            </Button>
                            <Button
                                :size="36"
                                variant="outlined"
                                :disabled="busy"
                                @click="action('restart')"
                            >
                                <Icon name="askx-actions:refresh" />{{ t('bridge.restart') }}
                            </Button>
                            <Button
                                :size="36"
                                variant="outlined"
                                class="ml-auto"
                                :disabled="busy"
                                @click="action('update')"
                            >
                                <Icon name="askx-actions:upload" />{{ t('bridge.update') }}
                            </Button>
                        </div>
                        <p
                            v-if="serviceLastError"
                            class="rounded-lg bg-destructive/5 p-3 text-sm text-destructive"
                        >
                            <strong>{{ t('bridge.errorReason') }}</strong> {{ serviceLastError }}
                        </p>
                        <section class="space-y-3 border-t pt-5">
                            <h3 class="text-sm font-semibold">
                                {{ t('bridge.runtimeLogs') }}
                            </h3>
                            <ScrollArea
                                class="h-[420px] shrink-0 rounded-lg bg-muted/40 font-mono text-xs"
                                viewport-class="p-3"
                            >
                                <template v-if="logs.length">
                                    <p
                                        v-for="(line, index) in logs"
                                        :key="index"
                                    >
                                        {{ line }}
                                    </p>
                                </template>
                                <p
                                    v-else
                                    class="text-sm text-muted-foreground"
                                >
                                    {{ t('bridge.noLogs') }}
                                </p>
                            </ScrollArea>
                        </section>
                    </section>
                </div>
                <div
                    v-else-if="tab === 'config'"
                    class="mt-5 space-y-7"
                >
                    <section class="space-y-4">
                        <h3 class="text-sm font-semibold">
                            {{ t('bridge.workTime') }}
                        </h3>
                        <p class="text-xs text-muted-foreground">
                            {{ t('bridge.scheduleSaveHint') }}
                        </p>
                        <CsResponsiveSelect
                            :model-value="config.bridge.workTime.mode"
                            :title="t('bridge.workTime')"
                            :placeholder="t('bridge.workTime')"
                            :close-label="t('common.close')"
                            :clear-label="t('common.close')"
                            :empty-text="t('bridge.noAccounts')"
                            :options="[{ value: 'always', label: t('bridge.alwaysMode') }, { value: 'windows', label: t('bridge.windowMode') }]"
                            @update:model-value="value => { if (config && (value === 'always' || value === 'windows')) config.bridge.workTime.mode = value }"
                        />
                        <template v-if="config.bridge.workTime.mode === 'windows'">
                            <div class="flex items-end gap-2">
                                <label class="min-w-0 flex-1 space-y-1 text-xs"><span>{{ t('bridge.startTime') }}</span><Input
                                    v-model="config.bridge.workTime.window.start"
                                    type="time"
                                /></label>
                                <label class="min-w-0 flex-1 space-y-1 text-xs"><span>{{ t('bridge.endTime') }}</span><Input
                                    v-model="config.bridge.workTime.window.end"
                                    type="time"
                                /></label>
                            </div>
                        </template>
                        <label class="block space-y-2 text-sm">
                            <span>{{ t('bridge.codexHome') }}</span>
                            <Input
                                v-model="config.bridge.paths.codexHome"
                                :placeholder="t('bridge.codexHomePlaceholder')"
                                spellcheck="false"
                            />
                            <span class="block text-xs text-muted-foreground">{{ t('bridge.codexHomeHint') }}</span>
                        </label>
                        <label class="block space-y-2 text-sm">
                            <span>{{ t('bridge.authFile') }}</span>
                            <Input
                                v-model="config.bridge.paths.authFile"
                                :placeholder="t('bridge.authFilePlaceholder')"
                                spellcheck="false"
                            />
                            <span class="block text-xs text-muted-foreground">{{ t('bridge.authFileHint') }}</span>
                        </label>
                        <label class="block space-y-2 text-sm">
                            <span>{{ t('bridge.configFile') }}</span>
                            <Input
                                v-model="config.bridge.paths.configFile"
                                :placeholder="t('bridge.configFilePlaceholder')"
                                spellcheck="false"
                            />
                            <span class="block text-xs text-muted-foreground">{{ t('bridge.configFileHint') }}</span>
                        </label>
                    </section>
                </div>
                <div
                    v-else
                    class="mt-5 space-y-5"
                >
                    <div class="space-y-2 text-sm">
                        <p>{{ t('bridge.source') }}</p><CsResponsiveSelect
                            :model-value="config.bridge.feishu.source"
                            :title="t('bridge.source')"
                            :placeholder="t('bridge.source')"
                            :close-label="t('common.close')"
                            :clear-label="t('common.close')"
                            :empty-text="t('bridge.noAccounts')"
                            :options="[{ value: 'openclaw', label: 'OpenClaw' }, { value: 'custom', label: t('bridge.custom') }]"
                            @update:model-value="value => { if (config && (value === 'openclaw' || value === 'custom')) { config.bridge.feishu.source = value; secret = '' } }"
                        />
                    </div>
                    <template v-if="config.bridge.feishu.source === 'openclaw'">
                        <Button
                            variant="outlined"
                            :size="36"
                            @click="detect"
                        >
                            <Icon name="askx-actions:search" />{{ t('bridge.detectApps') }}
                        </Button>
                        <div class="space-y-2 text-sm">
                            <p>App ID</p><CsResponsiveSelect
                                v-if="accounts.length"
                                v-model="config.bridge.feishu.appId"
                                title="App ID"
                                placeholder="App ID"
                                :close-label="t('common.close')"
                                :clear-label="t('common.close')"
                                :empty-text="t('bridge.noAccounts')"
                                :options="accounts.map(account => ({ value: account.appId, label: `${account.name} · ${account.appId}` }))"
                            /><span
                                v-else
                                class="block rounded-lg bg-muted p-3 font-mono text-xs"
                            >{{ config.bridge.feishu.appId || '—' }}</span>
                        </div>
                    </template>
                    <template v-else>
                        <label class="block space-y-2 text-sm"><span>App ID</span><Input v-model="config.bridge.feishu.appId" /></label>
                        <label class="block space-y-2 text-sm"><span>App Secret</span><Input
                            v-model="secret"
                            type="password"
                            autocomplete="new-password"
                            :placeholder="t('bridge.secretHint')"
                        /></label>
                    </template>
                    <label class="block space-y-2 text-sm"><span>{{ t('bridge.adminOpenId') }}</span><Input v-model="config.bridge.feishu.adminOpenId" /><span class="block text-xs text-muted-foreground">{{ t('bridge.adminHint') }}</span></label>
                    <Button
                        variant="outlined"
                        :size="36"
                        :disabled="busy"
                        @click="test"
                    >
                        <Icon name="askx-status:check" />{{ t('bridge.testConnection') }}
                    </Button>
                </div>
            </template>
        </ScrollArea>
        <template #footer>
            <Button
                v-if="tab !== 'server'"
                :size="36"
                class="ml-auto"
                :disabled="busy || !config"
                @click="save"
            >
                {{ t('bridge.save') }}
            </Button>
        </template>
    </CsResponsiveOverlayDialogDrawer>
</template>
