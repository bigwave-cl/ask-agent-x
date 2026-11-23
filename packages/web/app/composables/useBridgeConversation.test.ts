import { afterEach, expect, test, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import { useBridgeConversation } from './useBridgeConversation'

/** 测试结束释放自动导入的运行时替身。 */
afterEach(() => { vi.unstubAllGlobals() })

test('navigation during service preflight never sends the old draft to the new thread', async () => {
    vi.stubGlobal('useI18n', () => ({ t: (key: string) => key }))
    vi.stubGlobal('useToast', () => ({ error: vi.fn() }))
    const fetch = vi.fn().mockResolvedValue({ namespace: 'home', messages: [], turn: null, thread: { id: 'next', title: 'next' }, nextCursor: null })
    vi.stubGlobal('$fetch', fetch)
    const scope = effectScope()
    const threadId = ref('')
    let resume: (running: boolean) => void = () => {}
    const requireRunning = vi.fn(() => new Promise<boolean>(resolve => { resume = resolve }))
    const conversation = scope.run(() => useBridgeConversation({ threadId, context: ref({ chatId: 'chat', projectPath: '/project' }), canCompose: ref(true), requireRunning, onCreated: vi.fn(), onCatalogChanged: vi.fn(), onTitle: vi.fn() }))!
    conversation.draft.value = 'first'
    const first = conversation.send()
    const duplicate = conversation.send()
    expect(requireRunning).toHaveBeenCalledTimes(1)
    threadId.value = 'next'
    conversation.draft.value = 'new draft'
    resume(true)
    await Promise.all([first, duplicate])
    expect(fetch.mock.calls.every(([, options]) => options?.method !== 'POST')).toBe(true)
    expect(conversation.draft.value).toBe('new draft')
    expect(conversation.submitting.value).toBe(false)
    scope.stop()
})
