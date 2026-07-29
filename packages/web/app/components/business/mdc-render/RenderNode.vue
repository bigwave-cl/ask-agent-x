<script setup lang="ts">
import type { MarkdownRenderNode, MarkdownTableAlign } from './markdownTokens'
import { ScrollArea } from '@/components/ui/scroll-area'

defineOptions({ name: 'BusMdcRenderNode' })

/** MDC 节点渲染器属性。 */
interface Props {
  /** 需要递归渲染的受控节点。 */
  nodes: MarkdownRenderNode[]
}

defineProps<Props>()

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
</script>

<template>
  <template v-for="(node, index) in nodes" :key="`${node.type}-${index}`">
    <template v-if="node.type === 'text'">{{ node.value }}</template>
    <p v-else-if="node.type === 'paragraph'">
      <RenderNode :nodes="node.children" />
    </p>
    <component :is="`h${node.depth}`" v-else-if="node.type === 'heading'">
      <RenderNode :nodes="node.children" />
    </component>
    <strong v-else-if="node.type === 'strong'">
      <RenderNode :nodes="node.children" />
    </strong>
    <em v-else-if="node.type === 'emphasis'">
      <RenderNode :nodes="node.children" />
    </em>
    <del v-else-if="node.type === 'deletion'">
      <RenderNode :nodes="node.children" />
    </del>
    <code v-else-if="node.type === 'inlineCode'">{{ node.value }}</code>
    <ScrollArea v-else-if="node.type === 'codeBlock'" orientation="horizontal" type="auto" class="mdc-render-code" viewport-class="mdc-render-scroll-viewport">
      <pre :data-language="node.language || undefined"><code>{{ node.value }}</code></pre>
    </ScrollArea>
    <br v-else-if="node.type === 'lineBreak'" />
    <hr v-else-if="node.type === 'horizontalRule'" />
    <blockquote v-else-if="node.type === 'blockquote'">
      <RenderNode :nodes="node.children" />
    </blockquote>
    <template v-else-if="node.type === 'link'">
      <a v-if="node.href" :href="node.href" :title="node.title || undefined">
        <RenderNode :nodes="node.children" />
      </a>
      <RenderNode v-else :nodes="node.children" />
    </template>
    <ol v-else-if="node.type === 'list' && node.ordered" :start="node.start">
      <li v-for="(item, itemIndex) in node.items" :key="itemIndex">
        <RenderNode :nodes="item" />
      </li>
    </ol>
    <ul v-else-if="node.type === 'list'">
      <li v-for="(item, itemIndex) in node.items" :key="itemIndex">
        <RenderNode :nodes="item" />
      </li>
    </ul>
    <ScrollArea v-else-if="node.type === 'table'" orientation="horizontal" type="auto" class="mdc-render-table" viewport-class="mdc-render-scroll-viewport">
      <table>
        <thead>
          <tr>
            <th v-for="(cell, cellIndex) in node.header" :key="cellIndex" :class="getTableAlignClass(cell.align)">
              <RenderNode :nodes="cell.children" />
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, rowIndex) in node.rows" :key="rowIndex">
            <td v-for="(cell, cellIndex) in row" :key="cellIndex" :class="getTableAlignClass(cell.align)">
              <RenderNode :nodes="cell.children" />
            </td>
          </tr>
        </tbody>
      </table>
    </ScrollArea>
  </template>
</template>
