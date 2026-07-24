import type { Component } from 'vue'

export type DemoModuleId = 'overview' | 'button' | 'theming'

export interface DemoModule {
  id: DemoModuleId
  index: string
  group: 'guide' | 'components' | 'foundation'
  groupLabel: string
  title: string
  description: string
  sourcePath: string
  loader: () => Promise<{ default: Component }>
}

export const demoModules: DemoModule[] = [
  {
    id: 'overview',
    index: '00',
    group: 'guide',
    groupLabel: '使用指南',
    title: '开始使用',
    description: '了解公开 Demo、组件分层和源码导航方式。',
    sourcePath: 'app/components/demo/modules/overview/index.vue',
    loader: () => import('./modules/overview/index.vue'),
  },
  {
    id: 'button',
    index: '01',
    group: 'components',
    groupLabel: '基础组件',
    title: 'Button 按钮',
    description: '直接预览和调试 components/ui/button 的项目定制样式。',
    sourcePath: 'app/components/demo/modules/components/DemoButton.vue',
    loader: () => import('./modules/components/index.vue'),
  },
  {
    id: 'theming',
    index: '02',
    group: 'foundation',
    groupLabel: '基础规范',
    title: '主题规范',
    description: '检查语义色、明暗外观和两套品牌主题色。',
    sourcePath: 'app/components/demo/modules/theming/index.vue',
    loader: () => import('./modules/theming/index.vue'),
  },
]

export function getDemoModule(moduleId?: string | null) {
  return demoModules.find(module => module.id === moduleId) ?? demoModules[0]!
}
