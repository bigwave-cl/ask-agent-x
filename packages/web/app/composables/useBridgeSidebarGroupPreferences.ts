import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { BridgeSidebarPreferences, BridgeSidebarPreferenceChange } from '@askx/core/bridge-relations'

/** 旧版浏览器偏好仅作为一次性迁移来源。 */
const storageKey = 'askx.bridge.sidebar-groups'
/** 偏好接口的关系版本与共享快照。 */
interface PreferenceSnapshot {
    /** 整份关系数据的并发版本。 */
    revision: number
    /** null 表示尚未初始化共享偏好。 */
    preferences: BridgeSidebarPreferences | null
}

/** 为群组侧栏串行保存操作，并在冲突后基于最新共享快照重放。 */
export function useBridgeSidebarGroupPreferences<T extends { chatId: string }>(groups: Readonly<Ref<readonly T[]>>) {
    /** 用户可见的乐观偏好。 */
    const preferences = ref<BridgeSidebarPreferences>({ order: [], collapsed: [] })
    /** 接口错误使用统一提示。 */
    const toast = useToast()
    /** 共享文案。 */
    const { t } = useI18n()
    /** 最近确认的服务端快照。 */
    let snapshot: PreferenceSnapshot | undefined
    /** 按用户操作顺序保存，避免整份快照覆盖其他页面修改。 */
    const pending: BridgeSidebarPreferenceChange[] = []
    /** 当前生命周期是否仍有效。 */
    let active = false
    /** 当前串行事务是否运行。 */
    let running = false
    /** 正在保存期间的焦点或目录刷新在事务结束后执行。 */
    let refreshRequested = false

    /** 从确认状态叠加尚未提交的操作，保持连续交互。 */
    function render(): void {
        /** 复制数组以免乐观操作修改接口返回数据。 */
        const next = { order: [...(snapshot?.preferences?.order ?? [])], collapsed: [...(snapshot?.preferences?.collapsed ?? [])] }
        for (const operation of pending) {
            if (operation.type === 'order') next.order = [...operation.order]
            if (operation.type === 'open') {
                next.collapsed = next.collapsed.filter(id => id !== operation.chatId)
                if (!operation.open) next.collapsed.push(operation.chatId)
            }
        }
        preferences.value = next
    }

    /** 已共享或迁移成功后才删除旧键，失败保留迁移来源。 */
    function clearLegacy(): void {
        if (!snapshot?.preferences) return
        try { window.localStorage.removeItem(storageKey) }
        catch { /* 存储被禁用不影响共享偏好。 */ }
    }

    /** 仅在共享尚未初始化时读取旧偏好，历史非法字段交给边界过滤。 */
    function legacy(): BridgeSidebarPreferences | undefined {
        try {
            /** 浏览器数据属于不可信迁移输入。 */
            const value: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? 'null')
            if (!value || typeof value !== 'object' || Array.isArray(value)) return
            /** 只迁移已知字段并移除历史重复标识。 */
            const fields = value as Record<string, unknown>
            if (!Array.isArray(fields.order) || !Array.isArray(fields.collapsed)) return
            /** 过滤旧版可能保存的空值与重复项。 */
            const ids = (input: unknown[]) => [...new Set(input.filter((id): id is string => typeof id === 'string' && /^oc_[A-Za-z0-9]+$/.test(id)))]
            return { order: ids(fields.order), collapsed: ids(fields.collapsed) }
        }
        catch { /* 损坏或禁用的浏览器存储不阻止读取共享偏好。 */ }
    }

    /** 加载、迁移、用户更新共用串行入口，卸载后停止提交与 UI 写入。 */
    async function synchronize(refresh = false): Promise<void> {
        if (!active) return
        if (running) { refreshRequested ||= refresh; return }
        running = true
        try {
            if (refresh || !snapshot) {
                /** 用户更新复用已确认版本，仅加载或冲突时重新读取。 */
                const loaded = await $fetch<PreferenceSnapshot>('/api/bridge/sidebar-preferences')
                if (!active) return
                snapshot = loaded
            }
            if (!snapshot!.preferences) {
                /** 仅真实存在的旧偏好可以发起首次迁移。 */
                const previous = legacy()
                if (previous) pending.unshift({ type: 'migrate', preferences: previous })
            }
            render()
            clearLegacy()
            while (active && pending.length) {
                /** 当前操作重试时仍保持在队首。 */
                const operation = pending[0]!
                /** 有界重试避免其他写入者持续冲突时无限请求。 */
                let attempts = 0
                while (active) {
                    try {
                        /** PATCH 只发送本次意图，服务端负责关系校验。 */
                        const result: PreferenceSnapshot = await $fetch<PreferenceSnapshot>('/api/bridge/sidebar-preferences', { method: 'PATCH', body: { revision: snapshot!.revision, operation } })
                        if (!active) return
                        snapshot = result
                        break
                    }
                    catch (error) {
                        if (!active) return
                        if ((error as { statusCode?: number }).statusCode !== 409 || ++attempts > 3) throw error
                        snapshot = await $fetch<PreferenceSnapshot>('/api/bridge/sidebar-preferences')
                        if (!active) return
                    }
                }
                if (!active) return
                pending.shift()
                render()
                clearLegacy()
            }
        }
        catch {
            if (active) {
                pending.length = 0
                render()
                toast.error(t('bridge.sidebarPreferencesError'))
            }
        }
        finally {
            running = false
            if (active && refreshRequested) { refreshRequested = false; void synchronize(true) }
        }
    }

    /** 排序提交使用完整的当前成员集合，过滤过期或重复拖动结果。 */
    const orderedGroups = computed<T[]>({
        get: () => {
            /** 当前目录身份索引，始终消费最新对象。 */
            const remaining = new Map(groups.value.map(group => [group.chatId, group]))
            /** 已保存顺序中仍存在的群组。 */
            const result: T[] = []
            for (const id of preferences.value.order) {
                /** 最新群组对象。 */
                const group = remaining.get(id)
                if (group) { result.push(group); remaining.delete(id) }
            }
            return [...result, ...remaining.values()]
        },
        set: value => {
            /** 拖动所见的完整身份集合。 */
            const ids = value.map(group => group.chatId)
            /** 最新目录的身份集合。 */
            const currentIds = new Set(groups.value.map(group => group.chatId))
            if (ids.length !== currentIds.size || new Set(ids).size !== ids.length || ids.some(id => !currentIds.has(id))) return
            pending.push({ type: 'order', order: ids })
            render()
            void synchronize()
        },
    })

    /** 未显式折叠的群组默认展开。 */
    function isGroupOpen(chatId: string): boolean { return !preferences.value.collapsed.includes(chatId) }
    /** 折叠单个群组只提交该群意图。 */
    function setGroupOpen(chatId: string, open: boolean): void {
        if (!groups.value.some(group => group.chatId === chatId) || isGroupOpen(chatId) === open) return
        pending.push({ type: 'open', chatId, open })
        render()
        void synchronize()
    }

    /** 焦点恢复读取其他页面提交的最新偏好。 */
    function refresh(): void { void synchronize(true) }

    watch(() => groups.value.length, (count, previous) => {
        if (count > 0 && previous === 0 && !snapshot?.preferences) refresh()
    })

    onMounted(() => {
        active = true
        window.addEventListener('focus', refresh)
        void synchronize()
    })
    onUnmounted(() => {
        active = false
        window.removeEventListener('focus', refresh)
        pending.length = 0
    })
    return { orderedGroups, isGroupOpen, setGroupOpen }
}
