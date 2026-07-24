import {
  ScrollAreaCorner,
  ScrollAreaRoot,
  ScrollAreaScrollbar,
  ScrollAreaThumb,
  ScrollAreaViewport,
} from 'reka-ui'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { describe, expect, it } from 'vitest'

function renderScrollArea(type: 'always' | 'hover') {
  const app = createSSRApp({
    render: () => h(ScrollAreaRoot, { 'data-slot': 'scroll-area', type }, {
      default: () => [
        h(ScrollAreaViewport, { 'data-slot': 'scroll-area-viewport' }, {
          default: () => h('p', { 'data-testid': 'server-content' }, 'server content'),
        }),
        h(ScrollAreaScrollbar, {
          'data-slot': 'scroll-area-scrollbar',
          orientation: 'vertical',
        }, {
          default: () => h(ScrollAreaThumb, { 'data-slot': 'scroll-area-thumb' }),
        }),
        h(ScrollAreaCorner, { 'data-slot': 'scroll-area-corner' }),
      ],
    }),
  })

  return renderToString(app)
}

describe('ScrollArea SSR', () => {
  it('renders viewport content without a browser environment', async () => {
    const html = await renderScrollArea('hover')

    expect(html).toContain('data-slot="scroll-area"')
    expect(html).toContain('data-slot="scroll-area-viewport"')
    expect(html).toContain('data-testid="server-content"')
    expect(html).toContain('server content')
  })

  it('renders an always-visible scrollbar on the server', async () => {
    const html = await renderScrollArea('always')

    expect(html).toContain('data-slot="scroll-area-scrollbar"')
    expect(html).toContain('data-orientation="vertical"')
    expect(html).toContain('data-slot="scroll-area-thumb"')
  })
})
