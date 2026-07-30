<script setup lang="ts">
import type {
  DropUploadOptions,
  DropUploadPayload,
} from '@/components/common/drop-upload/dropUploadTypes'
import vDropUpload from '@/components/common/drop-upload/vDropUpload'
import { Button } from '@/components/ui/button'
import DemoCopyButton from '../../components/DemoCopyButton.vue'
import DemoSection from '../../components/DemoSection.vue'

defineOptions({ name: 'DemoDropUpload' })

/** Demo 拖拽结果来源。 */
type DropUploadDemoSource = 'local' | 'fullscreen'

/** 当前 Demo 是否展开。 */
const isOpen = defineModel<boolean>({ default: false })
/** 是否禁用局部区域拖拽。 */
const isLocalDisabled = ref(false)
/** 是否启用全屏拖拽。 */
const isFullscreenEnabled = ref(false)
/** 最近一次成功解析的内容。 */
const latestPayload = ref<DropUploadPayload | null>(null)
/** 最近一次校验错误。 */
const latestErrors = ref<string[]>([])
/** 最近一次拖拽结果的来源。 */
const latestSource = ref<DropUploadDemoSource | null>(null)

/** 局部区域指令的响应式配置。 */
const localDropUploadOptions = computed<DropUploadOptions>(() => ({
  targetSelector: '#demo-drop-upload-target',
  multiple: true,
  maxFiles: 3,
  disabled: isLocalDisabled.value || isFullscreenEnabled.value,
  overlayHint: '松开即可读取文件或 URL',
  limitHint: '支持多选，最多三个项目',
  onDrop: payload => handleDropUpload(payload, 'local'),
  onError: errors => handleDropError(errors, 'local'),
}))
/** 全屏指令的响应式配置。 */
const fullscreenDropUploadOptions = computed<DropUploadOptions>(() => ({
  targetSelector: 'body',
  multiple: true,
  maxFiles: 3,
  disabled: !isFullscreenEnabled.value,
  overlayHint: '拖拽到页面任意位置即可上传',
  limitHint: '支持文件或 HTTP(S) URL，最多三个项目',
  onDrop: payload => handleDropUpload(payload, 'fullscreen'),
  onError: errors => handleDropError(errors, 'fullscreen'),
}))
/** Demo 展示的解析结果摘要。 */
const resultSummary = computed(() => {
  if (latestErrors.value.length) return latestErrors.value.join('；')
  if (!latestPayload.value) {
    return isFullscreenEnabled.value
      ? '全屏拖拽监听中，尚未捕获拖拽内容'
      : '尚未捕获拖拽内容'
  }

  const sourceLabel = latestSource.value === 'fullscreen' ? '全屏区域' : '局部区域'
  if (latestPayload.value.files.length) {
    return `${sourceLabel}：已捕获 ${latestPayload.value.files.length} 个文件`
  }
  return `${sourceLabel}：已捕获 ${latestPayload.value.urls.length} 个 URL`
})
/** 可复制的局部区域指令示例。 */
const localUsageCode = `<script setup lang="ts">
import type { DropUploadOptions, DropUploadPayload } from '@/components/common/drop-upload/dropUploadTypes'
import vDropUpload from '@/components/common/drop-upload/vDropUpload'

const options: DropUploadOptions = {
  targetSelector: '#upload-target',
  multiple: true,
  maxFiles: 3,
  onDrop: (payload: DropUploadPayload) => console.log(payload),
}
</${'script'}>

<template>
  <div v-drop-upload="options">
    <div id="upload-target">拖拽文件到此处</div>
  </div>
</template>`
/** 可复制的全屏指令示例。 */
const fullscreenUsageCode = `<script setup lang="ts">
import type { DropUploadOptions } from '@/components/common/drop-upload/dropUploadTypes'
import vDropUpload from '@/components/common/drop-upload/vDropUpload'

const options: DropUploadOptions = {
  targetSelector: 'body',
  multiple: true,
  maxFiles: 3,
  onDrop: handleDropUpload,
}
</${'script'}>

<template>
  <main v-drop-upload="options">页面业务内容</main>
</template>`

/** 切换局部区域拖拽能力。 */
function handleToggleLocalDisabled() {
  isLocalDisabled.value = !isLocalDisabled.value
}

/** 切换全屏拖拽能力。 */
function handleToggleFullscreen() {
  isFullscreenEnabled.value = !isFullscreenEnabled.value
}

/** 清空 Demo 当前展示的解析结果。 */
function handleClearResult() {
  latestPayload.value = null
  latestErrors.value = []
  latestSource.value = null
}

/**
 * 保存成功的拖拽结果。
 *
 * @param payload 指令解析结果。
 * @param source 拖拽结果来源。
 */
function handleDropUpload(payload: DropUploadPayload, source: DropUploadDemoSource) {
  latestErrors.value = []
  latestPayload.value = payload
  latestSource.value = source
}

/**
 * 保存数量校验错误。
 *
 * @param errors 已本地化的错误列表。
 * @param source 拖拽错误来源。
 */
function handleDropError(errors: string[], source: DropUploadDemoSource) {
  latestPayload.value = null
  latestErrors.value = errors
  latestSource.value = source
}

/**
 * 为重复文件生成稳定的列表 key。
 *
 * @param file 当前文件。
 * @param index 当前展示顺序。
 * @returns 文件属性与顺序组成的 key。
 */
function getFileKey(file: File, index: number) {
  return `${file.name}:${file.size}:${file.lastModified}:${index}`
}

/**
 * 将文件大小格式化为便于扫描的文本。
 *
 * @param size 文件字节数。
 * @returns 带单位的文件大小。
 */
function formatFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return '0 B'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<template>
  <DemoSection
    v-model="isOpen"
    title="拖拽上传指令"
    description="动态挂载局部或全屏覆盖层，统一解析文件、HTTP(S) URL 与数量限制。"
    sec-key="utils-drop-upload"
  >
    <article class="grid gap-4 rounded-xl border border-ds-border-subtle-10 bg-background p-5">
      <header class="grid gap-1.5">
        <h4 class="m-0 text-2xl font-extrabold text-foreground">v-drop-upload</h4>
        <p class="m-0 max-w-220 text-sm leading-6 text-muted-foreground">
          支持局部区域与全屏两种挂载方式，可拖入本地文件或 HTTP(S) URL。
        </p>
      </header>

      <section class="grid gap-3 rounded-xl bg-card p-4">
        <div class="flex flex-wrap items-center justify-between gap-2.5">
          <div class="grid gap-1">
            <h5 class="m-0 text-base font-extrabold text-foreground">1. 局部区域挂载</h5>
            <p class="m-0 text-[13px] leading-5 text-muted-foreground">
              仅监听当前容器，覆盖层挂载到 targetSelector 指定区域。
            </p>
          </div>
          <Button
            type="button"
            variant="secondary-subtle"
            size="36"
            :disabled="isFullscreenEnabled"
            @click="handleToggleLocalDisabled"
          >
            {{ isLocalDisabled ? '启用局部拖拽' : '禁用局部拖拽' }}
          </Button>
        </div>

        <div v-drop-upload="localDropUploadOptions" class="rounded-xl bg-muted/45 p-4">
          <div
            id="demo-drop-upload-target"
            class="flex min-h-40 items-center justify-center rounded-xl border border-dashed border-ds-border-subtle-20 bg-background p-6 text-center"
          >
            <div class="grid justify-items-center gap-2.5">
              <span class="inline-flex size-10 items-center justify-center rounded-lg bg-ds-fill-brand-transparent-10 text-ds-text-brand">
                <Icon name="askx-actions:upload" class="size-5" />
              </span>
              <div class="grid gap-1">
                <strong class="text-sm font-bold text-foreground">拖拽文件或网页链接到此区域</strong>
                <span class="text-xs leading-5 text-muted-foreground">支持多选，最多三个文件或 URL</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        id="demo-drop-upload-fullscreen-example"
        v-drop-upload="fullscreenDropUploadOptions"
        class="grid gap-3 rounded-xl bg-card p-4"
      >
        <div class="flex flex-wrap items-center justify-between gap-2.5">
          <div class="grid gap-1">
            <h5 class="m-0 text-base font-extrabold text-foreground">2. 全屏挂载拖拽</h5>
            <p class="m-0 text-[13px] leading-5 text-muted-foreground">
              开启后监听页面全局节点，覆盖层以 fixed 方式挂载到 document.body。
            </p>
          </div>
          <Button
            type="button"
            :variant="isFullscreenEnabled ? 'secondary-subtle' : 'primary'"
            size="36"
            @click="handleToggleFullscreen"
          >
            {{ isFullscreenEnabled ? '关闭全屏拖拽' : '启用全屏拖拽' }}
          </Button>
        </div>

        <div class="flex min-h-30 flex-wrap items-center justify-between gap-4 rounded-xl border border-dashed border-ds-border-subtle-20 bg-background p-5">
          <div class="flex min-w-0 items-center gap-3">
            <span class="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-ds-fill-brand-transparent-10 text-ds-text-brand">
              <Icon name="askx-actions:upload" class="size-5" />
            </span>
            <div class="grid min-w-0 gap-1">
              <strong class="text-sm font-bold text-foreground">{{ isFullscreenEnabled ? '全屏拖拽监听中' : '全屏拖拽尚未启用' }}</strong>
              <span class="text-xs leading-5 text-muted-foreground">{{ isFullscreenEnabled ? '现在可将文件拖入页面任意位置' : '点击启用后体验全屏覆盖层' }}</span>
            </div>
          </div>
          <span
            class="rounded-full px-2.5 py-1 text-xs font-bold"
            :class="isFullscreenEnabled
              ? 'bg-ds-fill-brand-transparent-10 text-ds-text-brand'
              : 'bg-ds-fill-bw-transparent-5 text-muted-foreground'"
          >
            {{ isFullscreenEnabled ? '已启用' : '已关闭' }}
          </span>
        </div>
      </section>

      <section class="grid gap-3 rounded-xl bg-card p-4">
        <div class="flex flex-wrap items-center justify-between gap-2.5">
          <span class="text-[13px] text-muted-foreground" aria-live="polite">{{ resultSummary }}</span>
          <Button
            type="button"
            variant="ghost"
            size="36"
            :disabled="!latestPayload && !latestErrors.length"
            @click="handleClearResult"
          >
            清空结果
          </Button>
        </div>

        <div v-if="latestPayload?.files.length" class="grid gap-1.5">
          <div
            v-for="(file, index) in latestPayload.files"
            :key="getFileKey(file, index)"
            class="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg bg-background px-3 py-2.5"
          >
            <span class="truncate text-[13px] font-bold">{{ file.name || `drop-file-${index + 1}` }}</span>
            <span class="shrink-0 font-mono text-[11px] text-muted-foreground">{{ formatFileSize(file.size) }}</span>
          </div>
        </div>
        <div v-else-if="latestPayload?.urls.length" class="grid gap-1.5">
          <code
            v-for="url in latestPayload.urls"
            :key="url"
            class="block break-all rounded-lg bg-background px-3 py-2.5 font-mono text-xs leading-5 text-muted-foreground"
          >{{ url }}</code>
        </div>
      </section>

      <section class="grid gap-3 rounded-xl bg-muted/45 p-4">
        <h5 class="m-0 text-sm font-extrabold text-foreground">局部引入代码示例</h5>
        <div class="grid gap-3 lg:grid-cols-2">
          <div class="grid min-w-0 gap-2">
            <div class="flex items-center justify-between gap-2">
              <strong class="text-[13px] font-bold">局部区域</strong>
              <DemoCopyButton :text="localUsageCode" label="复制代码" copied-label="已复制" />
            </div>
            <code class="block whitespace-pre-wrap break-words rounded-lg bg-ds-fill-bw-transparent-5 p-3 font-mono text-xs leading-5 text-muted-foreground">{{ localUsageCode }}</code>
          </div>
          <div class="grid min-w-0 gap-2">
            <div class="flex items-center justify-between gap-2">
              <strong class="text-[13px] font-bold">全屏挂载</strong>
              <DemoCopyButton :text="fullscreenUsageCode" label="复制代码" copied-label="已复制" />
            </div>
            <code class="block whitespace-pre-wrap break-words rounded-lg bg-ds-fill-bw-transparent-5 p-3 font-mono text-xs leading-5 text-muted-foreground">{{ fullscreenUsageCode }}</code>
          </div>
        </div>
      </section>
    </article>
  </DemoSection>
</template>
