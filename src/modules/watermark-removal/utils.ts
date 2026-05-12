export interface InpaintOptions {
    radius: number
    iterations: number
}

export interface InpaintStats {
    maskedPixels: number
    filledPixels: number
}

const clamp = (value: number, min: number, max: number) => {
    if (Number.isNaN(value)) return min
    return Math.min(max, Math.max(min, value))
}

export const clampInpaintOptions = (options: InpaintOptions): InpaintOptions => {
    return {
        radius: Math.round(clamp(options.radius, 2, 24)),
        iterations: Math.round(clamp(options.iterations, 1, 6)),
    }
}

export const createMaskFromAlpha = (
    data: Uint8ClampedArray,
    width: number,
    height: number,
    threshold = 16,
) => {
    const mask = new Uint8Array(width * height)

    for (let index = 0; index < mask.length; index += 1) {
        mask[index] = data[index * 4 + 3] > threshold ? 1 : 0
    }

    return mask
}

export const countMaskedPixels = (mask: Uint8Array) => {
    let count = 0
    for (let index = 0; index < mask.length; index += 1) {
        count += mask[index]
    }
    return count
}

const isInside = (x: number, y: number, width: number, height: number) => {
    return x >= 0 && y >= 0 && x < width && y < height
}

const copyPixel = (from: Uint8ClampedArray, to: Uint8ClampedArray, fromIndex: number, toIndex: number) => {
    const sourceOffset = fromIndex * 4
    const targetOffset = toIndex * 4
    to[targetOffset] = from[sourceOffset]
    to[targetOffset + 1] = from[sourceOffset + 1]
    to[targetOffset + 2] = from[sourceOffset + 2]
    to[targetOffset + 3] = from[sourceOffset + 3]
}

export const inpaintMaskedPixels = (
    source: Uint8ClampedArray,
    width: number,
    height: number,
    mask: Uint8Array,
    options: InpaintOptions,
) => {
    const safeOptions = clampInpaintOptions(options)
    const result = new Uint8ClampedArray(source)
    const workingMask = new Uint8Array(mask)
    let filledPixels = 0

    for (let pass = 0; pass < safeOptions.iterations; pass += 1) {
        const next = new Uint8ClampedArray(result)
        const nextMask = new Uint8Array(workingMask)
        let filledThisPass = 0

        for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
                const index = y * width + x
                if (!workingMask[index]) continue

                let red = 0
                let green = 0
                let blue = 0
                let alpha = 0
                let weightSum = 0

                for (let dy = -safeOptions.radius; dy <= safeOptions.radius; dy += 1) {
                    for (let dx = -safeOptions.radius; dx <= safeOptions.radius; dx += 1) {
                        if (dx === 0 && dy === 0) continue
                        const distance = Math.sqrt(dx * dx + dy * dy)
                        if (distance > safeOptions.radius) continue

                        const sampleX = x + dx
                        const sampleY = y + dy
                        if (!isInside(sampleX, sampleY, width, height)) continue

                        const sampleIndex = sampleY * width + sampleX
                        if (workingMask[sampleIndex]) continue

                        const weight = 1 / Math.max(1, distance)
                        const offset = sampleIndex * 4
                        red += result[offset] * weight
                        green += result[offset + 1] * weight
                        blue += result[offset + 2] * weight
                        alpha += result[offset + 3] * weight
                        weightSum += weight
                    }
                }

                if (weightSum > 0) {
                    const offset = index * 4
                    next[offset] = Math.round(red / weightSum)
                    next[offset + 1] = Math.round(green / weightSum)
                    next[offset + 2] = Math.round(blue / weightSum)
                    next[offset + 3] = Math.round(alpha / weightSum)
                    nextMask[index] = 0
                    filledThisPass += 1
                }
            }
        }

        result.set(next)
        workingMask.set(nextMask)
        filledPixels += filledThisPass

        if (filledThisPass === 0) break
    }

    for (let index = 0; index < workingMask.length; index += 1) {
        if (!workingMask[index]) continue
        let nearestIndex = -1

        for (let radius = safeOptions.radius + 1; radius <= Math.max(width, height); radius += 1) {
            for (let dy = -radius; dy <= radius; dy += 1) {
                for (let dx = -radius; dx <= radius; dx += 1) {
                    if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue
                    const x = index % width
                    const y = Math.floor(index / width)
                    const sampleX = x + dx
                    const sampleY = y + dy
                    if (!isInside(sampleX, sampleY, width, height)) continue
                    const sampleIndex = sampleY * width + sampleX
                    if (!workingMask[sampleIndex]) {
                        nearestIndex = sampleIndex
                        break
                    }
                }
                if (nearestIndex >= 0) break
            }
            if (nearestIndex >= 0) break
        }

        if (nearestIndex >= 0) {
            copyPixel(result, result, nearestIndex, index)
            workingMask[index] = 0
            filledPixels += 1
        }
    }

    return {
        data: result,
        stats: {
            maskedPixels: countMaskedPixels(mask),
            filledPixels,
        } satisfies InpaintStats,
    }
}

export const buildWatermarkRemovalFileName = (sourceName: string) => {
    const baseName = sourceName.replace(/\.[^.]+$/, '') || 'image'
    return `${baseName}-去水印.png`
}

export const formatImageSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}
