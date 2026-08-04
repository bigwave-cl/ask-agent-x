<script setup lang="ts">
/** Skills 空状态属性。 */
interface Props {
  /** 是否已经完成首次初始化。 */
  initialized: boolean
}

defineProps<Props>()
const emit = defineEmits<{ /** 打开配置或扫描引导。 */ action: [] }>()
const { t } = useI18n()
</script>

<template>
  <section class="relative grid min-h-80 place-items-center overflow-hidden rounded-[28px] border border-dashed bg-card px-6 py-16 text-center">
    <div class="pointer-events-none absolute inset-0 opacity-50 [background-image:radial-gradient(circle_at_center,var(--ds-color-brand-default)_1px,transparent_1px)] [background-size:24px_24px] [mask-image:radial-gradient(circle_at_center,black,transparent_72%)]" />
    <div class="relative max-w-md">
      <span class="mx-auto grid size-16 place-items-center rounded-[22px] border bg-background shadow-xl"><Icon name="askx-objects:skills" class="size-7 text-primary" /></span>
      <h2 class="mt-6 text-2xl font-semibold tracking-[-0.03em]">{{ initialized ? t('skills.emptyTitle') : t('skills.setupEmptyTitle') }}</h2>
      <p class="mt-3 text-sm leading-6 text-muted-foreground">{{ initialized ? t('skills.emptyDescription') : t('skills.setupEmptyDescription') }}</p>
      <Button class="mt-7" size="40" :variant="initialized ? 'outline' : 'default'" @click="emit('action')"><Icon :name="initialized ? 'askx-actions:upload' : 'askx-actions:adjust'" />{{ initialized ? t('skills.addSkill') : t('skills.startSetup') }}</Button>
    </div>
  </section>
</template>
