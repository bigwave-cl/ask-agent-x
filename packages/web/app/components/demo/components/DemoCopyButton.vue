<script setup lang="ts">
import type { ButtonVariants } from '@/components/ui/button'
import { Check, Copy } from '@lucide/vue'
import { Button } from '@/components/ui/button'

defineOptions({ name: 'DemoCopyButton' })

const props = withDefaults(defineProps<{
  text: string
  label?: string
  copiedLabel?: string
  variant?: ButtonVariants['variant']
  size?: ButtonVariants['size']
  square?: boolean
}>(), {
  label: 'Copy',
  copiedLabel: 'Copied',
  variant: 'ghost',
  size: '36',
})

const copied = ref(false)
const toast = useToast()
let resetTimer: ReturnType<typeof setTimeout> | undefined

async function handleCopy(event: MouseEvent) {
  if (!import.meta.client) return
  const targetElement = event.currentTarget instanceof Element ? event.currentTarget : undefined
  copied.value = await useCopyText({ text: props.text, el: targetElement })
  if (!copied.value) {
    toast.error('复制失败，请重试')
    return
  }
  toast.success(props.copiedLabel)
  if (resetTimer) clearTimeout(resetTimer)
  resetTimer = setTimeout(() => { copied.value = false }, 1400)
}

onBeforeUnmount(() => resetTimer && clearTimeout(resetTimer))
</script>

<template>
  <Button type="button" :variant="variant" :size="size" :square="square" :aria-label="copied ? copiedLabel : label" @click="handleCopy">
    <Check v-if="copied" />
    <Copy v-else />
    <slot v-if="!square">{{ copied ? copiedLabel : label }}</slot>
  </Button>
</template>
