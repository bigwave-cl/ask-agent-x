<script setup lang="ts">
import type { ManagedSkillTreeNode } from '@askx/module-skills/skill-types'
import { resolveSkillTreeIcon } from './skillTreeIcon'

/** Skill 目录树节点属性。 */
interface Props {
  /** 当前目录层级的节点。 */
  node: ManagedSkillTreeNode
  /** 当前选中的相对文件路径。 */
  selectedPath?: string
  /** 当前节点深度。 */
  depth?: number
}

const props = withDefaults(defineProps<Props>(), { selectedPath: '', depth: 0 })
const emit = defineEmits<{ /** 选择一个普通文件。 */ 'select': [node: ManagedSkillTreeNode] }>()
/** 目录节点是否展开。 */
const open = ref(props.depth < 1)
/** 当前节点对应的文件类型图标。 */
const nodeIcon = computed(() => resolveSkillTreeIcon(props.node.name, props.node.kind, open.value))

/** 切换目录或选择文件。 */
function activate(): void {
  if (props.node.kind === 'directory') {
    open.value = !open.value
    return
  }
  if (props.node.kind === 'file') emit('select', props.node)
}
</script>

<template>
  <li>
    <button
      type="button"
      class="group/tree flex h-8 w-full min-w-0 items-center gap-2 rounded-lg pr-2 text-left text-xs transition-colors"
      :class="[
        node.path === selectedPath ? 'bg-ds-fill-brand-transparent-10 text-ds-text-brand' : 'text-ds-text-secondary hover:bg-ds-fill-bw-transparent-3 hover:text-ds-text-primary',
        node.kind === 'symlink' ? 'cursor-default opacity-55' : '',
      ]"
      :style="{ paddingLeft: `${8 + depth * 14}px` }"
      :aria-expanded="node.kind === 'directory' ? open : undefined"
      @click="activate"
    >
      <Icon
        v-if="node.kind === 'directory'"
        name="askx-navigation:chevron-right"
        class="size-3 shrink-0 transition-transform duration-200"
        :class="open ? 'rotate-90' : ''"
        aria-hidden="true"
      />
      <span v-else class="w-3 shrink-0" />
      <Icon :name="nodeIcon" class="size-3.5 shrink-0" aria-hidden="true" />
      <span class="truncate">{{ node.name }}</span>
      <span v-if="node.kind === 'symlink'" class="ml-auto font-mono text-[9px] text-ds-text-tertiary">LINK</span>
    </button>
    <ul v-if="node.kind === 'directory' && open && node.children?.length" class="grid">
      <BusSkillsSkillTreeItem
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :selected-path="selectedPath"
        :depth="depth + 1"
        @select="emit('select', $event)"
      />
    </ul>
  </li>
</template>
