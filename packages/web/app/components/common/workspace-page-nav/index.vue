<script setup lang="ts">
import type { AskxIconName } from '@/lib/iconCatalog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

defineOptions({ name: 'WorkspacePageNav' })

/** 工作台页面顶部导览属性。 */
interface WorkspacePageNavProps {
  /** 当前页面标识图标。 */
  icon: AskxIconName
  /** 当前页面标识文案。 */
  label: string
}

/** 工作台页面顶部导览属性。 */
defineProps<WorkspacePageNavProps>()
/** 本地化路径生成器。 */
const localePath = useLocalePath()
/** 工作台页面顶部导览文案。 */
const { t } = useI18n()
</script>

<template>
  <div class="mb-4 flex flex-wrap items-center gap-2">
    <Button as-child variant="ghost" size="40" shape="pill" class="text-ds-text-secondary">
      <NuxtLink :to="localePath('/')">
        <Icon name="askx-navigation:arrow-left" data-icon="inline-start" />
        {{ t('layout.backToHome') }}
      </NuxtLink>
    </Button>

    <span class="h-4 w-px bg-ds-border-subtle-10" aria-hidden="true" />

    <Badge variant="secondary" class="text-primary">
      <Icon :name="icon" data-icon="inline-start" />
      {{ label }}
    </Badge>
  </div>
</template>
