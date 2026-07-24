import { defineComponent } from 'vue'
import { describe, expect, it } from 'vitest'
import { mountComponent } from './componentMount'

describe('mountComponent', () => {
  it('returns a safe empty handle during server rendering', () => {
    const Component = defineComponent({ template: '<div>client only</div>' })
    const mounted = mountComponent(Component)

    expect(mounted.instance).toBeNull()
    expect(mounted.container).toBeNull()
    expect(() => mounted.unmount()).not.toThrow()
  })
})

