const SUPPORTED_EXTENSIONS = new Set([
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
])

export const getReadableExtension = (fileName: string): string => {
    const extension = fileName.split('.').pop()
    if (!extension || extension === fileName) return 'FILE'
    return extension.toUpperCase()
}

export const canConvertDocument = (fileName: string): boolean => {
    const extension = fileName.split('.').pop()?.toLowerCase()
    return Boolean(extension && extension !== fileName && SUPPORTED_EXTENSIONS.has(extension))
}

export const formatDocumentSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export const getMarkdownDownloadName = (fileName: string): string => {
    const baseName = fileName.includes('.')
        ? fileName.replace(/\.[^.]+$/, '')
        : fileName
    return `${baseName}.md`
}
