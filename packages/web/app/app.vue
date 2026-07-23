<script setup lang="ts">
const agents = [
  { name: 'Codex', state: '待检测', mark: 'CX' },
  { name: 'Claude Code', state: '待检测', mark: 'CL' },
  { name: 'Cursor', state: '待检测', mark: 'CU' },
]

const pipeline = ['Detect', 'Plan', 'Resolve', 'Consent', 'Apply', 'Verify', 'Rollback']
</script>

<template>
  <main class="shell">
    <header class="masthead">
      <a class="brand" href="#" aria-label="AskAgent X 首页">
        <span class="brand-mark">X</span>
        <span><strong>ASKAGENT</strong><small>LOCAL EXTENSION CONTROL</small></span>
      </a>
      <div class="local-badge"><i /> 127.0.0.1 · PRIVATE SESSION</div>
    </header>

    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">CONTROL SURFACE / 001</p>
        <h1>Extend every agent.<br /><em>Keep control.</em></h1>
        <p class="lede">统一发现、规划和管理本地 Agent 扩展。每一次变更都有边界、有授权，也有回程。</p>
      </div>
      <aside class="system-card">
        <div class="card-label">SYSTEM STATE</div>
        <div class="system-value"><span>NUXT 4.4.8</span><strong>READY</strong></div>
        <div class="rule" />
        <p>写操作保持锁定，直到同步凭证、事务与回滚链路全部就绪。</p>
      </aside>
    </section>

    <section class="agent-grid" aria-label="Agent 状态">
      <article v-for="agent in agents" :key="agent.name" class="agent-card">
        <span class="agent-mark">{{ agent.mark }}</span>
        <div><h2>{{ agent.name }}</h2><p>{{ agent.state }}</p></div>
        <button type="button" disabled>SCAN</button>
      </article>
    </section>

    <section class="module-section">
      <div class="section-index">01</div>
      <div class="module-copy">
        <p class="eyebrow">BUILT-IN MODULE</p>
        <h2>Skills topology</h2>
        <p>扫描四个平台目录，识别同名冲突、内容漂移与坏链。当前版本提供只读检测基线。</p>
        <div class="pipeline" aria-label="安全执行流程">
          <template v-for="(item, index) in pipeline" :key="item">
            <span :class="{ active: index === 0 }">{{ item }}</span><b v-if="index < pipeline.length - 1">→</b>
          </template>
        </div>
      </div>
      <button class="primary-action" type="button" disabled><span>RUN</span> DETECTION</button>
    </section>

    <footer><span>ASKAGENT X / 0.1.0</span><span>NO TELEMETRY · LOCAL ONLY</span></footer>
  </main>
</template>

