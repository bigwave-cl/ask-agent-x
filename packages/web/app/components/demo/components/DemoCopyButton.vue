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
let resetTimer: ReturnType<typeof setTimeout> | undefined

async function handleCopy() {
  if (!import.meta.client) return
  try {
    await navigator.clipboard.writeText(props.text)
    copied.value = true
    if (resetTimer) clearTimeout(resetTimer)
    resetTimer = setTimeout(() => { copied.value = false }, 1400)
  } catch {
    copied.value = false
  }
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
