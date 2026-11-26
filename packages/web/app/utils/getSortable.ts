import type Sortable from 'sortablejs'

/** 唯一加载缓存；热更新时沿用，避免官方拒绝重复注册插件。 */
const cache: { /** 并发和后续调用复用同一次加载结果。 */ promise?: Promise<typeof Sortable> } = import.meta.hot?.data.sortableCache ?? {}
if (import.meta.hot) import.meta.hot.data.sortableCache = cache

/** 按需加载官方实现，并且仅注册一次可选的官方插件。 */
export async function getSortable(): Promise<typeof Sortable> {
    if (!import.meta.client) throw new Error('SortableJS 只能在客户端加载')
    if (!cache.promise) {
        cache.promise = import('sortablejs').then(({ default: Constructor, Swap, MultiDrag }) => {
            Constructor.mount(new Swap(), new MultiDrag())
            return Constructor
        }).catch(error => {
            cache.promise = undefined
            throw error
        })
    }
    return cache.promise
}
