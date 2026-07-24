<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { ToasterProps } from 'vue-sonner'
import { Toaster as Sonner } from 'vue-sonner'
import 'vue-sonner/style.css'
import { cn } from '@/lib/utils'

const props = withDefaults(defineProps<ToasterProps>(), {
  position: 'top-right',
  closeButton: true,
  richColors: true,
  duration: 3600,
  offset: 18,
  mobileOffset: 12,
})

const toasterStyle = computed<CSSProperties>(() => ({
  '--normal-bg': 'var(--popover)',
  '--normal-bg-hover': 'var(--muted)',
  '--normal-text': 'var(--popover-foreground)',
  '--normal-border': 'var(--border)',
  '--normal-border-hover': 'var(--input)',
  '--success-bg': 'color-mix(in srgb, var(--ds-color-success-default) 12%, var(--popover))',
  '--success-border': 'color-mix(in srgb, var(--ds-color-success-default) 30%, var(--border))',
  '--success-text': 'color-mix(in srgb, var(--ds-color-success-default) 82%, var(--foreground))',
  '--info-bg': 'color-mix(in srgb, var(--ds-color-brand-default) 12%, var(--popover))',
  '--info-border': 'color-mix(in srgb, var(--ds-color-brand-default) 32%, var(--border))',
  '--info-text': 'var(--ds-color-text-brand)',
  '--warning-bg': 'color-mix(in srgb, var(--ds-color-warning-default) 14%, var(--popover))',
  '--warning-border': 'color-mix(in srgb, var(--ds-color-warning-default) 34%, var(--border))',
  '--warning-text': 'color-mix(in srgb, var(--ds-color-warning-default) 72%, var(--foreground))',
  '--error-bg': 'color-mix(in srgb, var(--ds-color-danger-default) 11%, var(--popover))',
  '--error-border': 'color-mix(in srgb, var(--ds-color-danger-default) 30%, var(--border))',
  '--error-text': 'color-mix(in srgb, var(--ds-color-danger-default) 84%, var(--foreground))',
  ...props.style,
}))
</script>

<template>
  <Sonner
    v-bind="props"
    :class="cn('askx-toaster pointer-events-auto', props.class)"
    :style="toasterStyle"
  />
</template>

<style>
.askx-toaster[data-sonner-toaster] {
  --border-radius: var(--radius-lg);
  --width: min(23rem, calc(100vw - 1.5rem));
  font-family: var(--font-sans);
}

.askx-toaster[data-sonner-toaster] [data-sonner-toast][data-styled="true"] {
  min-height: 3.5rem;
  gap: 0.625rem;
  padding: 0.875rem 1rem;
  box-shadow: 0 16px 40px color-mix(in srgb, var(--foreground) 10%, transparent);
}

.askx-toaster[data-sonner-toaster] [data-title] {
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0;
}

.askx-toaster[data-sonner-toaster] [data-description] {
  color: color-mix(in srgb, currentColor 72%, transparent);
  font-size: 0.75rem;
}

.askx-toaster[data-sonner-toaster] [data-button] {
  border-radius: var(--radius-md);
}

.askx-toaster[data-sonner-toaster] [data-close-button] {
  background: var(--popover);
  border-color: var(--border);
  color: var(--muted-foreground);
}

.askx-toaster[data-sonner-toaster] [data-sonner-toast]:focus-visible {
  box-shadow: 0 16px 40px color-mix(in srgb, var(--foreground) 10%, transparent), 0 0 0 3px color-mix(in srgb, var(--ring) 35%, transparent);
}
</style>
