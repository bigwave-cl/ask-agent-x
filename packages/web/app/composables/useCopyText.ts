import type ClipboardJS from 'clipboard'

export type UseCopyTextArg = string | {
  el?: string | Element
  text: string
}

type ClipboardConstructor = typeof ClipboardJS

let clipboardCtor: ClipboardConstructor | null = null
let clipboardImportPromise: Promise<ClipboardConstructor> | null = null

async function loadClipboard() {
  if (clipboardCtor) return clipboardCtor

  if (!clipboardImportPromise) {
    clipboardImportPromise = import('clipboard')
      .then((clipboardModule) => {
        clipboardCtor = clipboardModule.default
        return clipboardCtor
      })
      .catch((error) => {
        clipboardImportPromise = null
        throw error
      })
  }

  return clipboardImportPromise
}

function resolveCopyArg(arg: UseCopyTextArg) {
  return typeof arg === 'string'
    ? { textToCopy: arg, targetElement: null }
    : { textToCopy: arg.text, targetElement: arg.el ?? null }
}

function getElementFromTarget(targetElement: string | Element | null) {
  if (!targetElement) return null
  return typeof targetElement === 'string' ? document.querySelector(targetElement) : targetElement
}

function getClosestCopyContainer(element: Element | null | undefined) {
  return element?.closest('[role="dialog"]')
    || element?.closest('[data-slot="dialog-content"]')
    || element?.closest('[data-slot="popover-content"]')
    || element?.closest('[data-slot="dropdown-menu-content"]')
    || element?.closest('[data-slot="context-menu-content"]')
    || element?.closest('[data-reka-popper-content-wrapper]')
    || element?.closest('.dialog')
    || element?.closest('.modal')
    || null
}

function getCopyContainer(targetElement: string | Element | null) {
  const resolvedTargetElement = getElementFromTarget(targetElement)
  return getClosestCopyContainer(resolvedTargetElement)
    || getClosestCopyContainer(document.activeElement)
    || null
}

export async function useCopyText(arg: UseCopyTextArg): Promise<boolean> {
  if (typeof document === 'undefined') return false

  try {
    const Clipboard = await loadClipboard()
    const { textToCopy, targetElement } = resolveCopyArg(arg)
    const container = getCopyContainer(targetElement)
    const options = container ? { container } : undefined

    return Clipboard.copy(textToCopy, options) === textToCopy
  } catch (error) {
    console.error('复制文本失败:', error)
    return false
  }
}
