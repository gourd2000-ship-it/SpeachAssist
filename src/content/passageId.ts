function hash(value: string): string {
  let result = 0x811c9dc5
  for (const character of value) {
    result ^= character.codePointAt(0) ?? 0
    result = Math.imul(result, 0x01000193)
  }
  return (result >>> 0).toString(36)
}

export function passageIdFromFilename(filename: string): string {
  const stem = filename.replace(/\.[^.]+$/, '')
  const readable = stem
    .normalize('NFKD')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

  return readable || `passage-${hash(filename)}`
}
