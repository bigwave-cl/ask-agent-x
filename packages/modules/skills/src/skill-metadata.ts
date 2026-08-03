import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SkillMetadata } from './skill-types.js'

/**
 * 读取 Skill 的最小 frontmatter，不执行任何随包脚本。
 * @param skillPath Skill 目录绝对路径。
 * @returns 可供页面和规划器使用的元数据。
 */
export async function readSkillMetadata(skillPath: string): Promise<SkillMetadata> {
  try {
    const source = await readFile(join(skillPath, 'SKILL.md'), 'utf8')
    if (!source.trim()) return { valid: false, error: 'SKILL.md 内容为空。' }
    const frontmatter = source.match(/^---\s*\n([\s\S]*?)\n---(?:\s*\n|$)/)?.[1]
    if (!frontmatter) return { valid: false, error: 'SKILL.md 缺少 YAML frontmatter。' }
    const value = (key: string): string | undefined => {
      const matched = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1]?.trim()
      return matched?.replace(/^['"]|['"]$/g, '')
    }
    const name = value('name')
    const description = value('description')
    const version = value('version')
    if (!name) return { valid: false, error: 'SKILL.md frontmatter 缺少 name。' }
    return {
      name,
      ...(description ? { description } : {}),
      ...(version ? { version } : {}),
      valid: true,
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { valid: false, error: '缺少 SKILL.md。' }
    }
    return { valid: false, error: `无法读取 SKILL.md：${(error as Error).message}` }
  }
}
