export { default as ScrollArea } from './ScrollArea.vue'
export { default as ScrollBar } from './ScrollBar.vue'

export interface ScrollAreaInstance {
  getViewportElement: () => HTMLElement | null
  scrollTo: (options: ScrollToOptions) => void
}
