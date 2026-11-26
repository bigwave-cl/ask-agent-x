import { computed, onMounted, ref } from 'vue'
import type { Ref } from 'vue'

/** 仅保存本浏览器会话侧栏的群组显示偏好。 */
const storageKey = 'askx.bridge.sidebar-groups'

/** 持久化字段只包含群组身份，不包含目录或会话内容。 */
interface GroupPreferences {
    /** 用户排列的群组顺序。 */
    order: string[]
    /** 用户折叠的群组身份，未记录时默认展开。 */
    collapsed: string[]
}

/** 从存储边界过滤无效身份和重复项。 */
function readIds(value: unknown): string[] {
    return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string' && id.length > 0))] : []
}

/** 为当前侧栏提供独立的排序和折叠偏好，目录仍由调用方持有。 */
export function useBridgeSidebarGroupPreferences<T extends { chatId: string }>(groups: Readonly<Ref<readonly T[]>>) {
    /** 组件首次渲染使用默认状态，挂载后恢复浏览器偏好。 */
    const preferences = ref<GroupPreferences>({ order: [], collapsed: [] })
    /** 仅在浏览器挂载后允许访问存储。 */
    let mounted = false

    /** 写入一次完整偏好，存储不可用时保留本次页面操作。 */
    function save(next: GroupPreferences): void {
        preferences.value = next
        if (!mounted) return
        try { window.localStorage.setItem(storageKey, JSON.stringify(next)) }
        catch { /* 浏览器存储被禁用时继续使用内存偏好。 */ }
    }

    /** 消费最新目录对象，新增群组接在已保存顺序之后。 */
    const orderedGroups = computed<T[]>({
        get: () => {
            /** 最新目录的身份索引，不缓存历史目录对象。 */
            const remaining = new Map(groups.value.map(group => [group.chatId, group]))
            /** 已保存且当前仍存在的群组。 */
            const result: T[] = []
            for (const id of preferences.value.order) {
                /** 当前目录提供的群组实例。 */
                const group = remaining.get(id)
                if (group) { result.push(group); remaining.delete(id) }
            }
            return [...result, ...remaining.values()]
        },
        set: value => {
            /** 拖动期间目录发生增删时，不提交过期排列。 */
            const ids = value.map(group => group.chatId)
            /** 当前完整目录的身份集合。 */
            const currentIds = new Set(groups.value.map(group => group.chatId))
            if (ids.length !== currentIds.size || new Set(ids).size !== ids.length || ids.some(id => !currentIds.has(id))) return
            save({ order: [...ids, ...preferences.value.order.filter(id => !currentIds.has(id))], collapsed: [...preferences.value.collapsed] })
        },
    })

    /** 未显式折叠的群组默认展开。 */
    function isGroupOpen(chatId: string): boolean {
        return !preferences.value.collapsed.includes(chatId)
    }

    /** 只更新指定群组的折叠状态。 */
    function setGroupOpen(chatId: string, open: boolean): void {
        if (!groups.value.some(group => group.chatId === chatId) || isGroupOpen(chatId) === open) return
        /** 删除旧记录后按当前操作重新确定折叠集合。 */
        const collapsed = preferences.value.collapsed.filter(id => id !== chatId)
        if (!open) collapsed.push(chatId)
        save({ order: [...preferences.value.order], collapsed })
    }

    onMounted(() => {
        mounted = true
        try {
            /** 存储内容在进入本地偏好状态前统一归一化。 */
            const stored: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? 'null')
            if (stored && typeof stored === 'object') {
                /** 只消费已声明的两个持久化字段。 */
                const fields = stored as Record<string, unknown>
                preferences.value = { order: readIds(fields.order), collapsed: readIds(fields.collapsed) }
            }
        }
        catch { /* 损坏或不可访问的存储使用默认展开顺序。 */ }
    })

    return { orderedGroups, isGroupOpen, setGroupOpen }
}
