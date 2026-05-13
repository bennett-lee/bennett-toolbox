export type PdfImageFormat = 'png' | 'jpg'

export interface PdfRenderOptions {
    scale: number
    format: PdfImageFormat
    quality: number
}

const clamp = (value: number, min: number, max: number) => {
    if (Number.isNaN(value)) return min
    return Math.min(max, Math.max(min, value))
}

export const clampPdfRenderOptions = (options: PdfRenderOptions): PdfRenderOptions => {
    return {
        scale: Number(clamp(options.scale, 1, 3).toFixed(1)),
        format: options.format === 'jpg' ? 'jpg' : 'png',
        quality: Math.round(clamp(options.quality, 60, 100)),
    }
}

export const getPdfBaseName = (fileName: string) => {
    return fileName.replace(/\.[^.]+$/, '') || 'document'
}

export const buildPageImageName = (fileName: string, pageNumber: number, totalPages: number, format: PdfImageFormat) => {
    const width = String(Math.max(1, totalPages)).length
    const paddedPage = String(pageNumber).padStart(width, '0')
    return `${getPdfBaseName(fileName)}-page-${paddedPage}.${format}`
}

export const buildZipName = (fileName: string) => {
    return `${getPdfBaseName(fileName)}-images.zip`
}

export const getMimeType = (format: PdfImageFormat) => {
    return format === 'jpg' ? 'image/jpeg' : 'image/png'
}

export const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}
