const VERSION_SUFFIX = / - V(\d+)$/

export function baseProjectName(name: string): string {
  return name.replace(VERSION_SUFFIX, '')
}

export function nextVersionName(sourceName: string, existingNames: string[]): string {
  const base = baseProjectName(sourceName)
  const maxVersion = existingNames.reduce((max, candidate) => {
    if (baseProjectName(candidate) !== base) return max
    const match = candidate.match(VERSION_SUFFIX)
    return match ? Math.max(max, Number(match[1])) : max
  }, 1)

  return `${base} - V${maxVersion + 1}`
}
