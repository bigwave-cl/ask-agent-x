import type { AskXModule } from './types.js'

export class ModuleRegistry {
  readonly #modules = new Map<string, AskXModule>()

  register(module: AskXModule): void {
    if (this.#modules.has(module.id)) throw new Error(`Module already registered: ${module.id}`)
    this.#modules.set(module.id, module)
  }

  get(id: string): AskXModule {
    const module = this.#modules.get(id)
    if (!module) throw new Error(`Unknown module: ${id}`)
    return module
  }

  list(): AskXModule[] {
    return [...this.#modules.values()]
  }
}

