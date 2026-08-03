<script setup lang="ts">
import type { MarkdownRenderNode, MarkdownTableAlign } from './markdownTokens'
import RenderCodeBlock from './RenderCodeBlock.vue'
import RenderImage from './RenderImage.vue'
import { ScrollArea } from '@/components/ui/scroll-area'

defineOptions({ name: 'BusMdcRenderNode' })

/** MDC 节点渲染器属性。 */
interface Props {
  /** 需要递归渲染的受控节点。 */
  nodes: MarkdownRenderNode[]
}

defineProps<Props>()

/** MDC 子节点异步布局事件。 */
const emit = defineEmits<{
  /** 图片加载或失败后的布局刷新事件。 */
  resolve: []
}>()

/**
 * 返回表格单元格的文本对齐样式。
 *
 * @param align 单元格对齐方式。
 * @returns Tailwind v4 对齐样式类。
 */
function getTableAlignClass(align: MarkdownTableAlign) {
  if (align === 'center') return 'text-center'
  if (align === 'right') return 'text-right'
  return 'text-left'
}

/**
 * 判断当前段落是否包含块级图片节点。
 *
 * @param childNodes 段落子节点。
 * @returns 是否包含图片节点。
 */
function hasImageNode(childNodes: MarkdownRenderNode[]): boolean {
  return childNodes.some((node) => {
    if (node.type === 'image') return true
    return 'children' in node && hasImageNode(node.children)
  })
}

/** 向上转发图片加载后的布局刷新事件。 */
function emitResolve() {
  emit('resolve')
}
</script>

<template>
  <template v-for="(node, index) in nodes" :key="`${node.type}-${index}`">
    <template v-if="node.type === 'text'">{{ node.value }}</template>
    <div v-else-if="node.type === 'paragraph' && hasImageNode(node.children)" class="mdc-render-media">
      <RenderNode :nodes="node.children" @resolve="emitResolve" />
    </div>
    <p v-else-if="node.type === 'paragraph'">
      <RenderNode :nodes="node.children" @resolve="emitResolve" />
    </p>
    <component :is="`h${node.depth}`" v-else-if="node.type === 'heading'">
      <RenderNode :nodes="node.children" @resolve="emitResolve" />
    </component>
    <strong v-else-if="node.type === 'strong'">
      <RenderNode :nodes="node.children" @resolve="emitResolve" />
    </strong>
    <em v-else-if="node.type === 'emphasis'">
      <RenderNode :nodes="node.children" @resolve="emitResolve" />
    </em>
    <del v-else-if="node.type === 'deletion'">
      <RenderNode :nodes="node.children" @resolve="emitResolve" />
    </del>
    <code v-else-if="node.type === 'inlineCode'">{{ node.value }}</code>
    <RenderCodeBlock v-else-if="node.type === 'codeBlock'" :value="node.value" :language="node.language" @resolve="emitResolve" />
    <br v-else-if="node.type === 'lineBreak'" />
    <hr v-else-if="node.type === 'horizontalRule'" />
    <blockquote v-else-if="node.type === 'blockquote'">
      <RenderNode :nodes="node.children" @resolve="emitResolve" />
    </blockquote>
    <template v-else-if="node.type === 'link'">
      <a v-if="node.href" :href="node.href" :title="node.title || undefined">
        <RenderNode :nodes="node.children" @resolve="emitResolve" />
      </a>
      <RenderNode v-else :nodes="node.children" @resolve="emitResolve" />
    </template>
    <RenderImage
      v-else-if="node.type === 'image'"
      :src="node.src"
      :alt="node.alt"
      :title="node.title"
      @resolve="emitResolve"
    />
    <ol v-else-if="node.type === 'list' && node.ordered" :start="node.start">
      <li v-for="(item, itemIndex) in node.items" :key="itemIndex">
        <RenderNode :nodes="item" @resolve="emitResolve" />
      </li>
    </ol>
    <ul v-else-if="node.type === 'list'">
      <li v-for="(item, itemIndex) in node.items" :key="itemIndex">
        <RenderNode :nodes="item" @resolve="emitResolve" />
      </li>
    </ul>
    <ScrollArea v-else-if="node.type === 'table'" orientation="horizontal" type="auto" class="mdc-render-table" viewport-class="mdc-render-scroll-viewport">
      <table>
        <thead>
          <tr>
            <th v-for="(cell, cellIndex) in node.header" :key="cellIndex" :class="getTableAlignClass(cell.align)">
              <RenderNode :nodes="cell.children" @resolve="emitResolve" />
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, rowIndex) in node.rows" :key="rowIndex">
            <td v-for="(cell, cellIndex) in row" :key="cellIndex" :class="getTableAlignClass(cell.align)">
              <RenderNode :nodes="cell.children" @resolve="emitResolve" />
            </td>
          </tr>
        </tbody>
      </table>
    </ScrollArea>
  </template>
</template>
