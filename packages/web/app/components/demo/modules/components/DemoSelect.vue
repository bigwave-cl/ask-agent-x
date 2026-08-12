<script setup lang="ts">
import type { ResponsiveSelectOption } from '@/components/common/responsive-select/types'
import DemoCopyButton from '../../components/DemoCopyButton.vue'
import DemoSection from '../../components/DemoSection.vue'

defineOptions({ name: 'DemoSelect' })
const isOpen = defineModel<boolean>({ default: false })
const lightValue = ref('en'); const darkValue = ref('warm'); const clearableValue = ref('asia'); const transparentValue = ref('pt'); const brandValue = ref('en'); const slotValue = ref('studio'); const longListValue = ref('item-01')
const languageOptions: ResponsiveSelectOption[] = [{ label: 'English', value: 'en' }, { label: 'Español', value: 'es' }, { label: 'Português', value: 'pt' }]
const voiceOptions: ResponsiveSelectOption[] = [{ label: 'Warm Voice', value: 'warm' }, { label: 'Clear Voice', value: 'clear' }, { label: 'Narration', value: 'narration' }]
const regionOptions: ResponsiveSelectOption[] = [{ label: 'Asia', value: 'asia' }, { label: 'Europe', value: 'europe' }, { label: 'America', value: 'america' }]
const modelOptions: ResponsiveSelectOption[] = [{ label: 'Studio', value: 'studio', description: '适合精修和稳定输出' }, { label: 'Realtime', value: 'realtime', description: '适合快速预览和轻量场景' }, { label: 'Creative', value: 'creative', description: '适合探索更强风格化结果' }]
const longListOptions: ResponsiveSelectOption[] = Array.from({ length: 18 }, (_, index) => ({ label: `Long Option ${String(index + 1).padStart(2, '0')}`, value: `item-${String(index + 1).padStart(2, '0')}`, description: `第 ${String(index + 1).padStart(2, '0')} 项，用于演示列表滚动。` }))
const selectedFormats = ref(['markdown', 'json'])
const formatOptions: ResponsiveSelectOption[] = [{ value: 'markdown', label: 'Markdown', description: '适合文档与说明内容' }, { value: 'json', label: 'JSON', description: '适合结构化数据' }, { value: 'csv', label: 'CSV', description: '适合表格数据' }]
</script>

<template>
    <DemoSection
        v-model="isOpen"
        title="Select"
        sec-key="components-ds-select"
    >
        <article class="grid gap-4 rounded-2xl border bg-background p-5">
            <div class="grid gap-2">
                <h4 class="text-2xl font-extrabold">
                    Select
                </h4><p class="max-w-3xl text-sm leading-6 text-muted-foreground">
                    Select 是旧选择器迁移后的唯一入口，样式集中管理；桌面端使用 Panel，H5 自动切换为 Drawer。
                </p>
            </div>
            <div class="grid gap-3 md:grid-cols-2">
                <section
                    v-for="example in [
                        { key: 'light', title: 'Light 默认主题', description: '不传 theme 时使用浅色 DS token，默认 size 为 36。' },
                        { key: 'dark', title: 'Dark 默认 size 36', description: '默认 size 为 36；业务暗色弹窗内显式传入 dark 主题。' },
                        { key: 'clearable', title: 'Clearable 清除', description: 'clearable 开启后点击清除会回写 clearValue。' },
                        { key: 'transparent', title: 'Transparent 透明', description: '透明变体仅让默认触发器透明，hover 和展开状态仍按 Select 状态样式处理。' },
                        { key: 'brand', title: 'Brand 浅色按钮', description: 'Brand 变体用于浅色按钮触发器，视觉状态对齐 DsButton outlined。' },
                        { key: 'rich', title: 'Option Brand 复合选项', description: 'icon、description、extra 可按业务自由组合。' },
                        { key: 'long', title: '长列表滚动', description: '内容较多时可通过 content-class 控制列表最大高度。' },
                        { key: 'slot', title: '自定义 Slot', description: 'value 和 item 可重置触发器与选项内容。' },
                    ]"
                    :key="example.key"
                    class="grid content-start gap-3 rounded-xl border bg-card p-4"
                >
                    <div class="flex items-start justify-between gap-3">
                        <div>
                            <h5 class="text-base font-extrabold">
                                {{ example.title }}
                            </h5><p class="mt-1 text-xs leading-5 text-muted-foreground">
                                {{ example.description }}
                            </p>
                        </div><DemoCopyButton
                            text="&lt;CsResponsiveSelect v-model=&#34;value&#34; :options=&#34;options&#34; /&gt;"
                            :size="36"
                        >
                            复制实现
                        </DemoCopyButton>
                    </div>
                    <div class="flex min-h-16 items-center gap-3 rounded-lg bg-muted/30 p-3">
                        <CsResponsiveSelect
                            v-if="example.key === 'light'"
                            v-model="lightValue"
                            title="选择语言"
                            placeholder="选择语言"
                            close-label="关闭"
                            clear-label="清除"
                            empty-text="暂无"
                            :options="languageOptions"
                        />
                        <CsResponsiveSelect
                            v-else-if="example.key === 'dark'"
                            v-model="darkValue"
                            theme="dark"
                            title="选择音色"
                            placeholder="选择音色"
                            close-label="关闭"
                            clear-label="清除"
                            empty-text="暂无"
                            :options="voiceOptions"
                        />
                        <CsResponsiveSelect
                            v-else-if="example.key === 'clearable'"
                            v-model="clearableValue"
                            clearable
                            title="筛选地区"
                            placeholder="筛选地区"
                            close-label="关闭"
                            clear-label="清除"
                            empty-text="暂无"
                            :options="regionOptions"
                        />
                        <CsResponsiveSelect
                            v-else-if="example.key === 'transparent'"
                            v-model="transparentValue"
                            variant="transparent"
                            title="透明触发器"
                            placeholder="透明触发器"
                            close-label="关闭"
                            clear-label="清除"
                            empty-text="暂无"
                            :options="languageOptions"
                        />
                        <CsResponsiveSelect
                            v-else-if="example.key === 'brand'"
                            v-model="brandValue"
                            variant="brand"
                            shape="pill"
                            title="浅色按钮"
                            placeholder="浅色按钮"
                            close-label="关闭"
                            clear-label="清除"
                            empty-text="暂无"
                            :options="languageOptions"
                        />
                        <CsResponsiveSelect
                            v-else-if="example.key === 'rich'"
                            v-model="slotValue"
                            title="Skills"
                            placeholder="选择模型"
                            close-label="关闭"
                            clear-label="清除"
                            empty-text="暂无"
                            :options="modelOptions"
                        >
                            <template #item="{ option }">
                                <span class="grid min-w-0 gap-0.5"><strong>{{ option.label }}</strong><small class="text-muted-foreground">{{ option.description }}</small></span>
                            </template>
                        </CsResponsiveSelect>
                        <CsResponsiveSelect
                            v-else-if="example.key === 'long'"
                            v-model="longListValue"
                            title="选择大量内容"
                            placeholder="选择大量内容"
                            close-label="关闭"
                            clear-label="清除"
                            empty-text="暂无"
                            content-class="max-h-52"
                            :options="longListOptions"
                        />
                        <CsResponsiveSelect
                            v-else
                            v-model="slotValue"
                            title="自定义选项"
                            placeholder="选择模型"
                            close-label="关闭"
                            clear-label="清除"
                            empty-text="暂无"
                            :options="modelOptions"
                        >
                            <template #value="{ option, placeholder }">
                                <span class="inline-flex items-center gap-2"><span class="size-2 rounded-full bg-primary" />{{ option?.label ?? placeholder }}</span>
                            </template>
                        </CsResponsiveSelect>
                    </div>
                </section>
            </div>
            <section class="grid gap-3 rounded-xl border bg-card p-4">
                <div>
                    <h5 class="text-base font-extrabold">
                        Size / Shape / Square
                    </h5><p class="text-xs leading-5 text-muted-foreground">
                        默认 size 为 36；square 是图标入口，不内置展开箭头。
                    </p>
                </div>
                <div class="grid gap-3 rounded-lg bg-muted/30 p-3 md:grid-cols-3">
                    <div class="grid content-start gap-2">
                        <span class="text-xs font-bold text-muted-foreground">size</span>
                        <div class="flex flex-wrap items-center gap-2">
                            <CsResponsiveSelect
                                v-model="lightValue"
                                size="36"
                                trigger-class="!w-36"
                                title="size 36"
                                placeholder="36"
                                close-label="关闭"
                                clear-label="清除"
                                empty-text="暂无"
                                :options="languageOptions"
                            />
                            <CsResponsiveSelect
                                v-model="darkValue"
                                size="40"
                                trigger-class="!w-40"
                                title="size 40"
                                placeholder="40"
                                close-label="关闭"
                                clear-label="清除"
                                empty-text="暂无"
                                :options="languageOptions"
                            />
                            <CsResponsiveSelect
                                v-model="brandValue"
                                size="48"
                                trigger-class="!w-44"
                                title="size 48"
                                placeholder="48"
                                close-label="关闭"
                                clear-label="清除"
                                empty-text="暂无"
                                :options="languageOptions"
                            />
                        </div>
                    </div>
                    <div class="grid content-start gap-2">
                        <span class="text-xs font-bold text-muted-foreground">shape</span>
                        <div class="flex flex-wrap items-center gap-2">
                            <CsResponsiveSelect
                                v-model="lightValue"
                                trigger-class="!w-36"
                                title="regular"
                                placeholder="regular"
                                close-label="关闭"
                                clear-label="清除"
                                empty-text="暂无"
                                :options="languageOptions"
                            />
                            <CsResponsiveSelect
                                v-model="brandValue"
                                shape="pill"
                                trigger-class="!w-36"
                                title="pill"
                                placeholder="pill"
                                close-label="关闭"
                                clear-label="清除"
                                empty-text="暂无"
                                :options="languageOptions"
                            />
                        </div>
                    </div>
                    <div class="grid content-start gap-2">
                        <span class="text-xs font-bold text-muted-foreground">square</span>
                        <CsResponsiveSelect
                            v-model="brandValue"
                            square
                            title="square"
                            placeholder=""
                            close-label="关闭"
                            clear-label="清除"
                            empty-text="暂无"
                            :options="languageOptions"
                        >
                            <template #value>
                                <Icon
                                    name="askx-status:info"
                                    class="size-4"
                                />
                            </template>
                        </CsResponsiveSelect>
                    </div>
                </div>
            </section>
            <section class="grid gap-2 rounded-xl border bg-card p-4">
                <h5 class="text-base font-extrabold">
                    响应式弹层行为
                </h5><ul class="grid gap-1 pl-5 text-xs leading-5 text-muted-foreground">
                    <li>桌面端使用 Select Panel，保持键盘导航和定位。</li><li>H5 自动切换为底部 Drawer，共享同一份选项和 model。</li><li>theme="dark" 时触发器、Panel 和 Drawer 使用暗色 token。</li>
                </ul>
            </section>
            <section class="grid gap-3 rounded-xl border bg-card p-4">
                <h5 class="text-base font-extrabold">
                    多选（AskX 扩展）
                </h5><p class="text-xs leading-5 text-muted-foreground">
                    多选场景追加在 PG 单选示例之后，选项样式参考 Agent Model。
                </p><CsResponsiveMultiSelect
                    v-model="selectedFormats"
                    size="40"
                    title="选择导出格式"
                    placeholder="选择格式"
                    close-label="关闭"
                    empty-text="暂无"
                    :options="formatOptions"
                />
            </section>
        </article>
    </DemoSection>
</template>
