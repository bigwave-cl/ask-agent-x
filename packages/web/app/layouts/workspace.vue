<script setup lang="ts">
import { CloudCog, Code2, Command, LockKeyhole, Sparkles } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const route = useRoute()
const localePath = useLocalePath()
const commonMessages = useMessageSection('common')
const layoutMessages = useMessageSection('layout')
const copy = computed(() => ({
  ...commonMessages.value,
  ...layoutMessages.value,
}))

function isActive(path: string) {
  const localizedPath = localePath(path)
  return route.path === localizedPath || route.path.startsWith(`${localizedPath}/`)
}
</script>

<template>
  <div class="min-h-screen bg-background text-foreground">
    <header data-testid="workspace-header" class="sticky top-0 z-30 border-b bg-background/92 backdrop-blur-xl">
      <div class="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <NuxtLink :to="localePath('/')" class="flex min-w-0 items-center gap-3" :aria-label="copy.home">
          <BrandMark class="size-9 shrink-0" />
          <span class="min-w-0">
            <strong class="block truncate text-sm font-semibold tracking-tight">AskAgent X</strong>
            <small class="block truncate text-[11px] text-muted-foreground">{{ copy.productTagline }}</small>
          </span>
        </NuxtLink>

        <nav class="hidden items-center gap-1 md:flex" :aria-label="copy.overview">
          <Button as-child variant="ghost" size="sm">
            <NuxtLink :to="localePath('/demo')"><Code2 data-icon="inline-start" />{{ copy.demoNav }}</NuxtLink>
          </Button>
          <Button as-child :variant="isActive('/skills') ? 'secondary' : 'ghost'" size="sm">
            <NuxtLink :to="localePath('/skills')"><Command data-icon="inline-start" />{{ copy.skillsNav }}</NuxtLink>
          </Button>
          <Button as-child :variant="isActive('/theme') ? 'secondary' : 'ghost'" size="sm">
            <NuxtLink :to="localePath('/theme')"><Sparkles data-icon="inline-start" />{{ copy.themeNav }}</NuxtLink>
          </Button>
          <Button as-child :variant="isActive('/settings') ? 'secondary' : 'ghost'" size="sm">
            <NuxtLink :to="localePath('/settings')"><CloudCog data-icon="inline-start" />{{ copy.settingsNav }}</NuxtLink>
          </Button>
        </nav>

        <Badge variant="outline" class="gap-1.5 bg-card">
          <span class="size-1.5 rounded-full bg-success shadow-[0_0_0_3px_var(--ds-color-success-soft)]" />
          127.0.0.1 · {{ copy.localOnly }}
        </Badge>
      </div>
    </header>

    <slot />

    <footer v-if="route.path !== localePath('/')" data-testid="workspace-footer" class="border-t bg-card/50">
      <div class="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <span class="font-medium text-foreground">AskAgent X <span class="font-normal text-muted-foreground">/ 0.1.0</span></span>
        <span class="flex items-center gap-1.5"><LockKeyhole class="size-3" />{{ copy.footer }}</span>
      </div>
    </footer>
  </div>
</template>
