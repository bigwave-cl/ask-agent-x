<script setup lang="ts">
import { computed } from 'vue'
import BusBridgeRelations from './BusBridgeRelations.vue'
import { useBridgeCatalog } from '@/composables/useBridgeCatalog'

/** 路由负责恢复管理页分类。 */
const route = useRoute()
/** 管理页共用目录读取与历史项目合并规则。 */
const { projectOptions, loadCatalog } = useBridgeCatalog()
/** 分类变更保留其他查询参数与锚点。 */
const managementMode = computed<'groups' | 'projects'>({
    get: () => route.query.tab === 'projects' ? 'projects' : 'groups',
    set: tab => {
        if (tab === managementMode.value) return
        void navigateTo({ path: route.path, query: { ...route.query, tab }, hash: route.hash }, { replace: true })
    },
})
</script>

<template>
    <div class="h-full min-h-0 min-w-0">
        <BusBridgeRelations
            v-model:mode="managementMode"
            page
            :show-mode-tabs="true"
            :projects="projectOptions"
            @saved="loadCatalog"
        />
    </div>
</template>
