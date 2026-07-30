<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { usePasteFiles } from '@/utils/paste'
import DemoCopyButton from '../../components/DemoCopyButton.vue'
import DemoSection from '../../components/DemoSection.vue'

defineOptions({ name: 'DemoPasteFiles' })

/** 当前 Demo 区块是否展开。 */
const isOpen = defineModel<boolean>({ default: false })
/** 只接收当前区域 paste 事件的 DOM 元素。 */
const pasteAreaRef = ref<HTMLElement | null>(null)
/** Demo 已捕获的剪贴板文件。 */
const pastedFiles = ref<File[]>([])
/** 解除区域文件粘贴监听的方法。 */
let destroyPasteFiles = () => {}

/** 可复制的区域 paste 监听示例。 */
const usageCode = `import { usePasteFiles } from '@/utils/paste'

const pasteAreaRef = ref<HTMLElement | null>(null)
let destroyPasteFiles = () => {}

function handlePasteFiles(files: File[]) {
  uploadFiles(files)
}

onMounted(() => {
  if (!pasteAreaRef.value) return
  destroyPasteFiles = usePasteFiles(pasteAreaRef.value, handlePasteFiles).destroy
})

onScopeDispose(() => destroyPasteFiles())`

/**
 * 接收当前区域粘贴工具解析后的文件并记录。
 *
 * @param files 剪贴板内按原顺序排列的文件。
 */
function handlePasteFiles(files: File[]) {
  pastedFiles.value = [...pastedFiles.value, ...files]
}

/** 点击粘贴区时主动获取焦点，保证后续 paste 事件以该区域为目标。 */
function handleFocusPasteArea() {
  pasteAreaRef.value?.focus()
}

/** 清空 Demo 当前捕获的全部文件。 */
function handleClearFiles() {
  pastedFiles.value = []
}

/**
 * 为重复文件生成稳定的列表 key。
 *
 * @param file 当前剪贴板文件。
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

onMounted(() => {
  if (!pasteAreaRef.value) return
  destroyPasteFiles = usePasteFiles(pasteAreaRef.value, handlePasteFiles).destroy
})

onScopeDispose(() => destroyPasteFiles())
</script>

<template>
  <DemoSection
    v-model="isOpen"
    title="区域文件粘贴"
    description="仅监听指定区域中的 paste 事件，提取剪贴板文件并保留普通文本的默认行为。"
    sec-key="utils-paste-files"
  >
    <article class="grid gap-4 rounded-xl border border-ds-border-subtle-10 bg-background p-5">
      <header class="grid gap-2">
        <h4 class="m-0 text-2xl font-extrabold text-foreground">usePasteFiles</h4>
        <p class="m-0 max-w-220 text-sm leading-6 text-muted-foreground">
          paste 事件只绑定到下方区域。点击区域获取焦点后粘贴图片或其他文件，页面其他位置不会触发这个示例。
        </p>
      </header>

      <section class="grid gap-3 rounded-xl bg-card p-4">
        <div
          ref="pasteAreaRef"
          tabindex="0"
          role="region"
          aria-label="区域文件粘贴示例"
          class="flex min-h-40 cursor-text flex-col items-center justify-center gap-2.5 rounded-xl border border-dashed border-ds-border-subtle-20 bg-background p-6 text-center outline-none transition-colors focus:border-ds-border-brand-85 focus:bg-ds-fill-brand-transparent-5"
          @click="handleFocusPasteArea"
        >
          <span class="inline-flex size-10 items-center justify-center rounded-lg bg-ds-fill-brand-transparent-10 text-ds-text-brand">
            <Icon name="askx-objects:file" class="size-5" />
          </span>
          <div class="grid gap-1">
            <strong class="text-sm font-bold text-foreground">点击后粘贴文件</strong>
            <span class="text-xs leading-5 text-muted-foreground">监听目标仅为当前虚线区域</span>
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-2.5">
          <span class="text-[13px] text-muted-foreground" aria-live="polite">
            已捕获 <strong class="text-foreground">{{ pastedFiles.length }}</strong> 个文件
          </span>
          <Button
            type="button"
            variant="secondary-subtle"
            size="36"
            :disabled="!pastedFiles.length"
            @click="handleClearFiles"
          >
            清空
          </Button>
        </div>

        <div v-if="pastedFiles.length" class="grid gap-1.5">
          <div
            v-for="(file, index) in pastedFiles"
            :key="getFileKey(file, index)"
            class="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg bg-muted/45 px-3 py-2.5"
          >
            <div class="grid min-w-0 gap-0.5">
              <strong class="truncate text-[13px] font-bold text-foreground">{{ file.name || `clipboard-file-${index + 1}` }}</strong>
              <span class="truncate text-[11px] text-muted-foreground">{{ file.type || 'unknown' }}</span>
            </div>
            <span class="shrink-0 font-mono text-[11px] text-muted-foreground">{{ formatFileSize(file.size) }}</span>
          </div>
        </div>
      </section>

      <section class="grid gap-2 rounded-xl bg-muted/45 p-4">
        <div class="flex flex-wrap items-center justify-between gap-2.5">
          <h5 class="m-0 text-sm font-extrabold text-foreground">区域监听示例</h5>
          <DemoCopyButton :text="usageCode" label="复制代码" copied-label="已复制" />
        </div>
        <code class="block whitespace-pre-wrap break-words rounded-lg bg-ds-fill-bw-transparent-5 p-3 font-mono text-xs leading-5 text-muted-foreground">{{ usageCode }}</code>
      </section>
    </article>
  </DemoSection>
</template>
