export interface MarkitdownCommand {
  command: string
  argsPrefix: string[]
  label: string
}

export interface MarkitdownRuntimeContext {
  appPath: string
  cwd: string
  env: NodeJS.ProcessEnv
  existsSync: (filePath: string) => boolean
  platform: NodeJS.Platform
  resourcesPath?: string
}

export const MARKITDOWN_EXTENSIONS = [
  'pdf',
  'doc',
  'docx',
  'ppt',
  'pptx',
  'xls',
  'xlsx',
  'html',
  'htm',
  'txt',
  'csv',
  'json',
  'xml',
  'zip',
  'epub',
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'wav',
  'mp3',
]

const getBundledExecutableName = (platform: NodeJS.Platform) => {
  return platform === 'win32' ? 'markitdown.exe' : 'markitdown'
}

const joinPath = (...segments: string[]) => {
  return segments
    .map((segment, index) => {
      if (index === 0) return segment.replace(/\/+$/, '')
      return segment.replace(/^\/+|\/+$/g, '')
    })
    .filter(Boolean)
    .join('/')
}

const getBundledPaths = (context: MarkitdownRuntimeContext) => {
  const executableName = getBundledExecutableName(context.platform)
  const candidates = [
    context.resourcesPath ? joinPath(context.resourcesPath, 'markitdown', executableName) : null,
    joinPath(context.appPath, 'vendor', 'markitdown', executableName),
    joinPath(context.cwd, 'vendor', 'markitdown', executableName),
  ]

  return candidates.filter((candidate): candidate is string => Boolean(candidate))
}

export const getMarkitdownCommands = (context: MarkitdownRuntimeContext): MarkitdownCommand[] => {
  const commands: MarkitdownCommand[] = []

  if (context.env.MARKITDOWN_BIN) {
    commands.push({
      command: context.env.MARKITDOWN_BIN,
      argsPrefix: [],
      label: 'MARKITDOWN_BIN',
    })
  }

  for (const candidatePath of getBundledPaths(context)) {
    if (context.existsSync(candidatePath)) {
      commands.push({
        command: candidatePath,
        argsPrefix: [],
        label: '内置 MarkItDown',
      })
    }
  }

  return commands.filter((command, index, list) => (
    list.findIndex(item => item.command === command.command && item.argsPrefix.join(' ') === command.argsPrefix.join(' ')) === index
  ))
}

export const formatMarkitdownError = (message: string): string => {
  const lines = message
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .filter(line => {
      const trimmed = line.trim()
      if (!trimmed) return false
      if (trimmed.startsWith('Traceback')) return false
      if (trimmed.startsWith('[PYI-')) return false
      if (/^File ".*", line \d+/.test(trimmed)) return false
      if (trimmed.includes('pydub/utils.py') && trimmed.includes('RuntimeWarning')) return false
      return true
    })
    .map(line => line.replace(/^markitdown\._exceptions\.FileConversionException:\s*/, ''))

  return lines.join('\n') || 'MarkItDown 转换失败'
}
