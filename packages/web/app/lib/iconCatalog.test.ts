import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { askxIconCatalog, askxIconCategories, getAskxIconFileName } from './iconCatalog'

/** Web 应用源码目录。 */
const appDirectory = join(dirname(fileURLToPath(import.meta.url)), '..')
/** 本地图标资源目录。 */
const iconDirectory = join(appDirectory, 'assets/icons')

/**
 * 递归读取目录中的全部文件。
 *
 * @param directory 待读取的目录。
 * @returns 目录内全部文件的绝对路径。
 */
async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? listFiles(path) : [path]
  }))
  return files.flat()
}

describe('AskX icon catalog', () => {
  it('uses unique semantic names and matching collection prefixes', () => {
    const names = askxIconCatalog.map(icon => icon.name)
    expect(new Set(names).size).toBe(names.length)

    for (const icon of askxIconCatalog) {
      expect(askxIconCategories).toContain(icon.category)
      expect(icon.name).toMatch(new RegExp(`^askx-${icon.category}:[a-z0-9]+(?:-[a-z0-9]+)*$`))
    }
  })

  it('keeps the catalog and local SVG files in sync', async () => {
    const catalogFiles = askxIconCatalog.map(icon => `${icon.category}/${getAskxIconFileName(icon.name)}.svg`).sort()
    const localFiles = (await listFiles(iconDirectory))
      .filter(file => file.endsWith('.svg'))
      .map(file => relative(iconDirectory, file))
      .sort()

    expect(localFiles).toEqual(catalogFiles)
  })

  it('keeps local SVGs safe, scalable and theme-aware', async () => {
    const files = (await listFiles(iconDirectory)).filter(file => file.endsWith('.svg'))

    for (const file of files) {
      const source = await readFile(file, 'utf8')
      const svgTag = source.match(/<svg\b[^>]*>/)?.[0] ?? ''
      expect(svgTag, relative(iconDirectory, file)).toContain('viewBox=')
      expect(svgTag, relative(iconDirectory, file)).not.toMatch(/\s(?:width|height)=/)
      expect(source, relative(iconDirectory, file)).not.toMatch(/<(?:script|foreignObject)\b/i)
      expect(source, relative(iconDirectory, file)).not.toMatch(/(?:href|xlink:href)=["']https?:/i)
      expect(source, relative(iconDirectory, file)).toContain('currentColor')
    }
  })

  it('restricts Lucide imports to shadcn UI sources', async () => {
    const sourceFiles = (await listFiles(appDirectory)).filter(file => /\.(?:ts|vue)$/.test(file))
    const violations: string[] = []

    for (const file of sourceFiles) {
      const sourcePath = relative(appDirectory, file)
      if (sourcePath.startsWith('components/ui/') || sourcePath.endsWith('.test.ts')) continue
      const source = await readFile(file, 'utf8')
      if (/from\s+['"]@lucide\/vue['"]/.test(source) || /name=["']lucide:/.test(source)) violations.push(sourcePath)
    }

    expect(violations).toEqual([])
  })
})
