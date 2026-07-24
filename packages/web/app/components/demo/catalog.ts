import type { Component } from 'vue'

export type DemoLocale = 'zh-CN' | 'en'
export type DemoModuleId = 'overview' | 'button' | 'theming'

export interface DemoModule {
  id: DemoModuleId
  index: string
  group: 'guide' | 'components' | 'foundation'
  groupLabel: Record<DemoLocale, string>
  title: Record<DemoLocale, string>
  description: Record<DemoLocale, string>
  sourcePath: string
  loader: () => Promise<{ default: Component }>
}

export const demoModules: DemoModule[] = [
  {
    id: 'overview',
    index: '00',
    group: 'guide',
    groupLabel: { 'zh-CN': '使用指南', en: 'Guide' },
    title: { 'zh-CN': '开始使用', en: 'Start here' },
    description: {
      'zh-CN': '了解公开 Demo、组件分层和源码导航方式。',
      en: 'Understand the public demo, component boundaries, and source navigation.',
    },
    sourcePath: 'app/components/demo/modules/overview/index.vue',
    loader: () => import('./modules/overview/index.vue'),
  },
  {
    id: 'button',
    index: '01',
    group: 'components',
    groupLabel: { 'zh-CN': '基础组件', en: 'Components' },
    title: { 'zh-CN': 'Button 按钮', en: 'Button' },
    description: {
      'zh-CN': '直接预览和调试 components/ui/button 的项目定制样式。',
      en: 'Preview and debug the customized components/ui/button primitive.',
    },
    sourcePath: 'app/components/demo/modules/components/DemoButton.vue',
    loader: () => import('./modules/components/index.vue'),
  },
  {
    id: 'theming',
    index: '02',
    group: 'foundation',
    groupLabel: { 'zh-CN': '基础规范', en: 'Foundation' },
    title: { 'zh-CN': '主题规范', en: 'Theming' },
    description: {
      'zh-CN': '检查语义色、明暗外观和两套品牌主题色。',
      en: 'Inspect semantic colors, appearance modes, and both brand themes.',
    },
    sourcePath: 'app/components/demo/modules/theming/index.vue',
    loader: () => import('./modules/theming/index.vue'),
  },
]

export function getDemoModule(moduleId?: string | null) {
  return demoModules.find(module => module.id === moduleId) ?? demoModules[0]!
}
