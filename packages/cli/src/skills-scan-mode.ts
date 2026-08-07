/** Skills scan 命令的调用模式。 */
export type SkillsScanInvocationMode = 'full-reconcile' | 'targeted-import' | 'read-only'

/** 判断 scan 命令应采用完整整理、定向导入还是只读模式。 */
export function resolveSkillsScanInvocationMode(input: { json?: boolean; platforms: string[]; directories: string[] }): SkillsScanInvocationMode {
  if (input.json) return 'read-only'
  return input.platforms.length || input.directories.length ? 'targeted-import' : 'full-reconcile'
}
