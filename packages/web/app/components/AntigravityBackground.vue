<script setup lang="ts">
import {
  CapsuleGeometry,
  Clock,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three'

interface Particle {
  x: number
  y: number
  z: number
  cx: number
  cy: number
  cz: number
  phase: number
  speed: number
  variance: number
}

const props = withDefaults(defineProps<{
  count?: number
  color?: string
  magnetRadius?: number
  ringRadius?: number
  waveAmplitude?: number
  autoAnimate?: boolean
}>(), {
  count: 180,
  color: '#2fbdc7',
  magnetRadius: 12,
  ringRadius: 8.5,
  waveAmplitude: 0.75,
  autoAnimate: true,
})

const container = useTemplateRef<HTMLDivElement>('container')
let renderer: WebGLRenderer | null = null
let scene: Scene | null = null
let camera: PerspectiveCamera | null = null
let mesh: InstancedMesh | null = null
let material: MeshBasicMaterial | null = null
let geometry: CapsuleGeometry | null = null
let resizeObserver: ResizeObserver | null = null
let frameId = 0
let particles: Particle[] = []
let reducedMotion = false
let documentVisible = true
let lastPointerMove = 0
const pointer = { x: 0.62, y: 0.2 }
const virtualPointer = { x: 0, y: 0 }
const dummy = new Object3D()
const clock = new Clock()

function viewportSize() {
  if (!camera) return { width: 1, height: 1 }
  const height = 2 * Math.tan((camera.fov * Math.PI) / 360) * camera.position.z
  return { width: height * camera.aspect, height }
}

function seedParticles(width: number, height: number) {
  particles = Array.from({ length: props.count }, () => {
    const x = (Math.random() - 0.5) * width * 1.16
    const y = (Math.random() - 0.5) * height * 1.16
    const z = (Math.random() - 0.5) * 18
    return {
      x,
      y,
      z,
      cx: x,
      cy: y,
      cz: z,
      phase: Math.random() * Math.PI * 2,
      speed: 0.32 + Math.random() * 0.46,
      variance: 0.58 + Math.random() * 0.7,
    }
  })
}

function resize() {
  const element = container.value
  if (!element || !renderer || !camera) return
  const width = Math.max(element.clientWidth, 1)
  const height = Math.max(element.clientHeight, 1)
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  renderer.setSize(width, height, false)
}

function handlePointerMove(event: PointerEvent) {
  const element = container.value
  if (!element) return
  const bounds = element.getBoundingClientRect()
  pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1
  pointer.y = -(((event.clientY - bounds.top) / bounds.height) * 2 - 1)
  lastPointerMove = performance.now()
}

function handleVisibilityChange() {
  documentVisible = document.visibilityState === 'visible'
  if (documentVisible && !reducedMotion && !frameId) animate()
}

function renderFrame(elapsed: number) {
  if (!renderer || !scene || !camera || !mesh) return
  const viewport = viewportSize()
  const idle = props.autoAnimate && performance.now() - lastPointerMove > 1800
  const targetX = idle ? Math.sin(elapsed * 0.24) * viewport.width * 0.23 : pointer.x * viewport.width * 0.5
  const targetY = idle ? Math.cos(elapsed * 0.31) * viewport.height * 0.18 : pointer.y * viewport.height * 0.5
  virtualPointer.x += (targetX - virtualPointer.x) * 0.045
  virtualPointer.y += (targetY - virtualPointer.y) * 0.045

  particles.forEach((particle, index) => {
    const dx = particle.x - virtualPointer.x
    const dy = particle.y - virtualPointer.y
    const distance = Math.hypot(dx, dy)
    let targetParticleX = particle.x + Math.sin(elapsed * particle.speed + particle.phase) * 0.08
    let targetParticleY = particle.y + Math.cos(elapsed * particle.speed * 0.8 + particle.phase) * 0.08
    let targetParticleZ = particle.z

    if (distance < props.magnetRadius) {
      const angle = Math.atan2(dy, dx) + elapsed * 0.035
      const ringWave = Math.sin(elapsed * particle.speed + particle.phase) * props.waveAmplitude
      const radius = props.ringRadius + ringWave + (particle.variance - 0.9) * 1.2
      targetParticleX = virtualPointer.x + Math.cos(angle) * radius
      targetParticleY = virtualPointer.y + Math.sin(angle) * radius
      targetParticleZ = particle.z + Math.sin(elapsed * 0.5 + particle.phase) * 1.4
    }

    const lerp = reducedMotion ? 1 : 0.055
    particle.cx += (targetParticleX - particle.cx) * lerp
    particle.cy += (targetParticleY - particle.cy) * lerp
    particle.cz += (targetParticleZ - particle.cz) * lerp

    dummy.position.set(particle.cx, particle.cy, particle.cz)
    dummy.rotation.set(0, 0, Math.atan2(targetParticleY - virtualPointer.y, targetParticleX - virtualPointer.x) + Math.PI / 2)
    const pulse = reducedMotion ? 0.68 : 0.55 + Math.sin(elapsed * 1.3 + particle.phase) * 0.18
    const scale = Math.max(0.18, pulse * particle.variance)
    dummy.scale.setScalar(scale)
    dummy.updateMatrix()
    mesh?.setMatrixAt(index, dummy.matrix)
  })

  mesh.instanceMatrix.needsUpdate = true
  renderer.render(scene, camera)
}

function animate() {
  if (!documentVisible || reducedMotion) {
    frameId = 0
    return
  }
  frameId = requestAnimationFrame(animate)
  renderFrame(clock.getElapsedTime())
}

function setup() {
  const element = container.value
  if (!element) return
  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  renderer = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' })
  renderer.setClearColor(0x000000, 0)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
  element.appendChild(renderer.domElement)

  scene = new Scene()
  camera = new PerspectiveCamera(35, 1, 0.1, 1000)
  camera.position.z = 50
  resize()

  const viewport = viewportSize()
  seedParticles(viewport.width, viewport.height)
  geometry = new CapsuleGeometry(0.08, 0.3, 3, 6)
  material = new MeshBasicMaterial({ color: props.color, transparent: true, opacity: 0.64, depthWrite: false })
  mesh = new InstancedMesh(geometry, material, props.count)
  scene.add(mesh)

  resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(element)
  window.addEventListener('pointermove', handlePointerMove, { passive: true })
  document.addEventListener('visibilitychange', handleVisibilityChange)

  renderFrame(0)
  if (!reducedMotion) animate()
}

function cleanup() {
  if (frameId) cancelAnimationFrame(frameId)
  frameId = 0
  resizeObserver?.disconnect()
  window.removeEventListener('pointermove', handlePointerMove)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  geometry?.dispose()
  material?.dispose()
  renderer?.dispose()
  const canvas = renderer?.domElement
  if (canvas?.parentNode) canvas.parentNode.removeChild(canvas)
  renderer = null
  scene = null
  camera = null
  mesh = null
}

onMounted(setup)
onBeforeUnmount(cleanup)
</script>

<template>
  <div ref="container" class="antigravity-background" aria-hidden="true" />
</template>

<style scoped>
.antigravity-background {
  position: absolute;
  inset: 0;
  min-height: 34rem;
  overflow: hidden;
  pointer-events: none;
}

.antigravity-background :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
