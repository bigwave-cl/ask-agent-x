<script setup lang="ts">
import { MAX_CUSTOM_SKILL_DIRECTORIES } from '@askx/module-skills/skill-types'
import type { SkillPlatformId, SkillPlatformStatus } from '@askx/module-skills/skill-types'
import { skillPlatformPresentations } from '@/lib/skillPlatformPresentation'

/** 平台根目录软链接入选择属性。 */
interface Props {
    /** AskX 统一 Skill 根目录。 */
    canonicalSkillsDir: string
    /** AskX 当前支持的全部平台状态。 */
    platforms: SkillPlatformStatus[]
    /** 第一步选择的扫描来源平台，用于标记默认项。 */
    sourcePlatforms: SkillPlatformId[]
    /** 当前明确选择建立软链的平台。 */
    selected: SkillPlatformId[]
    /** 用户明确同意接管外部软链的平台。 */
    takeover: SkillPlatformId[]
    /** 第一步选择的自定义扫描来源。 */
    sourceDirectories: Array<{ name: string, path: string }>
    /** 当前明确选择建立软链的自定义使用目录。 */
    directories: Array<{ name: string, path: string }>
    /** 历史绑定与本次选择去重后的软链目录总数。 */
    totalDirectoryCount: number
    /** 是否正在保存或重新扫描。 */
    busy?: boolean
    /** 是否正在等待系统目录选择器。 */
    pickingDirectories?: boolean
}

const props = withDefaults(defineProps<Props>(), { busy: false, pickingDirectories: false })
const emit = defineEmits<{
    /** 更新软链接入平台。 */
    'update:selected': [value: SkillPlatformId[]]
    /** 更新外部软链接管授权。 */
    'update:takeover': [value: SkillPlatformId[]]
    /** 更新自定义软链使用目录。 */
    'update:directories': [value: Array<{ name: string, path: string }>]
    /** 打开系统目录选择器补充软链使用目录。 */
    'select-directories': []
}>()
const { t } = useI18n()
/** 本步骤出现过的自定义文件夹选项，取消勾选后仍保留以便恢复。 */
const directoryOptions = ref<Array<{ name: string, path: string }>>([])

watch([() => props.sourceDirectories, () => props.directories], ([sources, selected]) => {
    const merged = new Map(directoryOptions.value.map(directory => [directory.path, directory]))
    for (const directory of [...sources, ...selected]) merged.set(directory.path, directory)
    directoryOptions.value = [...merged.values()].sort((left, right) => left.path.localeCompare(right.path))
}, { immediate: true, deep: true })

/**
 * 切换一个平台的软链接入选择。
 * @param platform 要切换的平台状态。
 */
function togglePlatform(platform: SkillPlatformStatus): void {
    if (!platform.linkSupported) return
    const removing = props.selected.includes(platform.id)
    emit('update:selected', removing ? props.selected.filter(entry => entry !== platform.id) : [...props.selected, platform.id])
    if (removing && props.takeover.includes(platform.id)) emit('update:takeover', props.takeover.filter(entry => entry !== platform.id))
}

/**
 * 切换外部软链的接管授权。
 * @param platform 要处理的平台状态。
 */
function toggleTakeover(platform: SkillPlatformStatus): void {
    emit('update:takeover', props.takeover.includes(platform.id)
        ? props.takeover.filter(entry => entry !== platform.id)
        : [...props.takeover, platform.id])
}

/** 切换一个自定义文件夹的软链接入选择。 */
function toggleDirectory(directory: { name: string, path: string }): void {
    const removing = props.directories.some(entry => entry.path === directory.path)
    emit('update:directories', removing
        ? props.directories.filter(entry => entry.path !== directory.path)
        : [...props.directories, directory].sort((left, right) => left.path.localeCompare(right.path)))
}

/** 判断自定义软链目录是否也来自第一步扫描来源。 */
function isSourceDirectory(path: string): boolean {
    return props.sourceDirectories.some(directory => directory.path === path)
}

/** 根据已知平台目录推断外部软链的可能来源。 */
function suspectedOwner(platform: SkillPlatformStatus): string {
    const owner = props.platforms.find(entry => entry.id !== platform.id && entry.skillsDir === platform.linkTarget)
    return owner ? skillPlatformPresentations[owner.id].name : t('skills.externalLinkOwnerUnknown')
}
</script>

<template>
    <section class="relative overflow-hidden rounded-[28px] border bg-card p-5 shadow-sm sm:p-8">
        <div class="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-primary/10 to-transparent" />
        <div class="relative max-w-3xl">
            <Badge
                variant="secondary"
                class="mb-4 gap-1.5"
            >
                <Icon
                    name="askx-status:lock"
                    class="size-3.5"
                />{{ t('skills.linkOptional') }}
            </Badge>
            <h2 class="text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
                {{ t('skills.linkSelectionTitle') }}
            </h2>
            <p class="mt-2 text-sm leading-6 text-muted-foreground">
                {{ t('skills.linkSelectionDescription') }}
            </p>
        </div>

        <div class="relative mt-7 overflow-hidden rounded-2xl border bg-background/75">
            <button
                v-for="platform in platforms"
                :key="platform.id"
                type="button"
                class="grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 border-b px-4 py-4 text-left transition-colors last:border-b-0 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/40 sm:px-5"
                :class="[
                    selected.includes(platform.id) ? 'bg-ds-fill-brand-transparent-5' : 'bg-muted/10',
                    platform.linkSupported ? 'hover:bg-muted/40' : 'cursor-not-allowed opacity-50',
                ]"
                :disabled="!platform.linkSupported"
                :aria-pressed="selected.includes(platform.id)"
                @click="togglePlatform(platform)"
            >
                <span class="grid size-11 shrink-0 place-items-center rounded-xl border bg-card text-foreground shadow-sm"><Icon
                    :name="skillPlatformPresentations[platform.id].icon"
                    class="size-5.5"
                    aria-hidden="true"
                /></span>
                <span class="min-w-0">
                    <strong class="block truncate text-sm text-foreground sm:text-base">{{ skillPlatformPresentations[platform.id].name }}</strong>
                    <span class="mt-1 block truncate font-mono text-[10px] text-muted-foreground sm:text-[11px]">{{ platform.skillsDir }}</span>
                    <span class="mt-1.5 block text-xs text-muted-foreground">
                        {{ !platform.linkSupported
                            ? t('skills.linkSelectionItemBlocked')
                            : sourcePlatforms.includes(platform.id)
                                ? t('skills.linkSelectionItemSource')
                                : t('skills.linkSelectionItemAdditional') }}
                    </span>
                </span>
                <span
                    class="grid size-7 shrink-0 place-items-center rounded-full border transition"
                    :class="selected.includes(platform.id) ? 'border-primary bg-primary text-ds-text-white' : 'bg-card text-muted-foreground'"
                >
                    <Icon
                        name="askx-status:check"
                        :class="['size-3.5', { 'text-transparent': !selected.includes(platform.id) }]"
                    />
                </span>
            </button>
            <div
                v-for="platform in platforms.filter(entry => selected.includes(entry.id) && entry.skillsPathKind === 'symlink' && entry.linkTarget)"
                :key="`${platform.id}-external-link`"
                class="border-b border-warning/20 bg-warning/5 px-4 py-4 last:border-b-0 sm:px-5"
            >
                <div class="flex items-start gap-3">
                    <Icon
                        name="askx-status:warning"
                        class="mt-0.5 size-4 shrink-0 text-warning"
                    />
                    <div class="min-w-0 flex-1">
                        <strong class="text-sm">{{ t('skills.externalLinkConflictTitle', { platform: skillPlatformPresentations[platform.id].name }) }}</strong>
                        <p class="mt-1 text-xs leading-5 text-muted-foreground">
                            {{ t('skills.externalLinkConflictDescription') }}
                        </p>
                        <dl class="mt-3 grid gap-1.5 text-xs sm:grid-cols-[7rem_minmax(0,1fr)]">
                            <dt class="text-muted-foreground">
                                {{ t('skills.externalLinkPath') }}
                            </dt><dd><code class="break-all">{{ platform.skillsDir }}</code></dd>
                            <dt class="text-muted-foreground">
                                {{ t('skills.externalLinkCurrentTarget') }}
                            </dt><dd><code class="break-all">{{ platform.linkTarget }}</code></dd>
                            <dt class="text-muted-foreground">
                                {{ t('skills.externalLinkOwner') }}
                            </dt><dd>{{ suspectedOwner(platform) }}</dd>
                            <dt class="text-muted-foreground">
                                {{ t('skills.externalLinkNewTarget') }}
                            </dt><dd><code class="break-all">{{ canonicalSkillsDir }}</code></dd>
                        </dl>
                        <Button
                            class="mt-3"
                            :variant="takeover.includes(platform.id) ? 'destructive' : 'outline'"
                            :size="36"
                            @click="toggleTakeover(platform)"
                        >
                            {{ takeover.includes(platform.id) ? t('skills.externalLinkTakeoverSelected') : t('skills.externalLinkKeepExisting') }}
                        </Button>
                    </div>
                </div>
            </div>
        </div>

        <section class="relative mt-5 overflow-hidden rounded-2xl border border-dashed bg-muted/15 p-4 sm:p-5">
            <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div class="flex min-w-0 items-start gap-3">
                    <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-ds-fill-brand-transparent-10 text-primary"><Icon
                        name="askx-objects:folder"
                        class="size-5"
                        aria-hidden="true"
                    /></span>
                    <div class="min-w-0">
                        <div class="flex flex-wrap items-center gap-2">
                            <h3 class="text-sm font-semibold sm:text-base">
                                {{ t('skills.linkCustomFolderTitle') }}
                            </h3>
                            <Badge
                                variant="outline"
                                :class="{ 'border-destructive text-destructive': totalDirectoryCount > MAX_CUSTOM_SKILL_DIRECTORIES }"
                            >
                                {{ totalDirectoryCount }}/{{ MAX_CUSTOM_SKILL_DIRECTORIES }}
                            </Badge>
                        </div>
                        <p class="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
                            {{ t('skills.linkCustomFolderDescription', { max: MAX_CUSTOM_SKILL_DIRECTORIES }) }}
                        </p>
                    </div>
                </div>
                <Button
                    variant="outline"
                    :size="40"
                    :disabled="busy || pickingDirectories || totalDirectoryCount >= MAX_CUSTOM_SKILL_DIRECTORIES"
                    @click="emit('select-directories')"
                >
                    <Icon
                        name="askx-actions:upload"
                        :class="['size-4', { 'animate-pulse': pickingDirectories }]"
                    />
                    {{ pickingDirectories ? t('skills.choosingFolders') : t('skills.addCustomFolder') }}
                </Button>
            </div>

            <div
                v-if="directoryOptions.length"
                class="mt-4 grid gap-2 border-t pt-4 sm:grid-cols-2"
            >
                <button
                    v-for="directory in directoryOptions"
                    :key="directory.path"
                    type="button"
                    class="flex min-w-0 items-center gap-3 rounded-xl border px-3 py-2.5 text-left shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
                    :class="directories.some(entry => entry.path === directory.path) ? 'border-primary/30 bg-ds-fill-brand-transparent-5' : 'bg-card hover:bg-muted/40'"
                    :aria-pressed="directories.some(entry => entry.path === directory.path)"
                    @click="toggleDirectory(directory)"
                >
                    <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icon
                        name="askx-objects:folder"
                        class="size-4"
                        aria-hidden="true"
                    /></span>
                    <span class="min-w-0 flex-1"><span class="flex items-center gap-2"><strong class="block truncate text-xs text-foreground">{{ directory.name }}</strong><Badge
                        v-if="isSourceDirectory(directory.path)"
                        variant="secondary"
                        class="shrink-0"
                    >{{ t('skills.linkSourceBadge') }}</Badge></span><code
                        class="mt-0.5 block truncate font-mono text-[9px] text-muted-foreground sm:text-[10px]"
                        :title="directory.path"
                    >{{ directory.path }}</code></span>
                    <span
                        class="grid size-7 shrink-0 place-items-center rounded-full border transition"
                        :class="directories.some(entry => entry.path === directory.path) ? 'border-primary bg-primary text-ds-text-white' : 'bg-card text-muted-foreground'"
                    >
                        <Icon
                            name="askx-status:check"
                            class="size-3.5"
                            :class="{ 'text-transparent': !directories.some(entry => entry.path === directory.path) }"
                        />
                    </span>
                </button>
            </div>
            <p
                v-else
                class="mt-4 border-t pt-4 text-xs text-muted-foreground"
            >
                {{ t('skills.linkNoCustomFolders') }}
            </p>
        </section>

        <div class="relative mt-5 flex items-start gap-3 rounded-2xl border border-dashed bg-muted/15 p-4 text-xs leading-5 text-muted-foreground">
            <Icon
                name="askx-status:info"
                class="mt-0.5 size-4 shrink-0 text-primary"
            />
            <p>{{ selected.length || directories.length ? t('skills.linkSelectedCount', { platformCount: selected.length, directoryCount: directories.length }) : t('skills.linkSkippedHint') }}</p>
        </div>
    </section>
</template>
