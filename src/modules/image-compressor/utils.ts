export type CompressionFormat = 'jpg' | 'webp'

export interface CompressionOptions {
    targetSizeMb: number
    maxQuality: number
    minQuality: number
    format: CompressionFormat
}

export interface CompressionCandidate {
    quality: number
    size: number
    dataUrl: string
}

const clamp = (value: number, min: number, max: number) => {
    if (Number.isNaN(value)) return min
    return Math.min(max, Math.max(min, value))
}

export const clampCompressionOptions = (options: CompressionOptions): CompressionOptions => {
    let minQuality = Math.round(clamp(options.minQuality, 10, 95))
    let maxQuality = Math.round(clamp(options.maxQuality, 10, 100))

    if (minQuality > maxQuality) {
        minQuality = 10
        maxQuality = 95
    }

    return {
        targetSizeMb: Number(clamp(options.targetSizeMb, 0.1, 100).toFixed(2)),
        minQuality,
        maxQuality,
        format: options.format === 'webp' ? 'webp' : 'jpg',
    }
}

export const getTargetBytes = (targetSizeMb: number) => {
    return Math.round(targetSizeMb * 1024 * 1024)
}

export const getCompressionMimeType = (format: CompressionFormat) => {
    return format === 'webp' ? 'image/webp' : 'image/jpeg'
}

export const buildCompressedFileName = (
    sourceName: string,
    format: CompressionFormat,
    usedNames: string[],
) => {
    const baseName = sourceName.replace(/\.[^.]+$/, '') || 'image'
    let outputName = `${baseName}-compressed.${format}`
    let index = 2

    while (usedNames.includes(outputName)) {
        outputName = `${baseName}-compressed-${index}.${format}`
        index += 1
    }

    return outputName
}

export const chooseBestCompressionCandidate = (
    candidates: CompressionCandidate[],
    targetBytes: number,
) => {
    if (candidates.length === 0) return null

    const underTarget = candidates
        .filter(candidate => candidate.size <= targetBytes)
        .sort((a, b) => b.size - a.size)

    if (underTarget[0]) return underTarget[0]

    return [...candidates].sort((a, b) => a.size - b.size)[0]
}

export const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export const getCompressionRatio = (sourceSize: number, outputSize: number) => {
    if (sourceSize <= 0) return 0
    return Math.max(0, Math.round((1 - outputSize / sourceSize) * 100))
}
