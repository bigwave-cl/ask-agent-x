<script setup lang="ts">
definePageMeta({ layout: 'workspace' })
const localePath = useLocalePath()

await navigateTo(`${localePath('/settings')}#theme`, { redirectCode: 308 })
</script>
