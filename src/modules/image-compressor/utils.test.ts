import { describe, expect, test } from 'vitest'
import {
    buildCompressedFileName,
    chooseBestCompressionCandidate,
    clampCompressionOptions,
    formatBytes,
    getTargetBytes,
} from './utils'

describe('image compressor utils', () => {
    test('clamps compression options', () => {
        expect(clampCompressionOptions({
            targetSizeMb: 0,
            maxQuality: 5,
            minQuality: 99,
            format: 'png',
        } as unknown as Parameters<typeof clampCompressionOptions>[0])).toEqual({
            targetSizeMb: 0.1,
            maxQuality: 95,
            minQuality: 10,
            format: 'jpg',
        })

        expect(clampCompressionOptions({ targetSizeMb: 300, maxQuality: 120, minQuality: 80, format: 'webp' })).toEqual({
            targetSizeMb: 100,
            maxQuality: 100,
            minQuality: 80,
            format: 'webp',
        })
    })

    test('converts target size to bytes', () => {
        expect(getTargetBytes(3)).toBe(3 * 1024 * 1024)
        expect(getTargetBytes(1.5)).toBe(Math.round(1.5 * 1024 * 1024))
    })

    test('builds compressed image names without collisions', () => {
        expect(buildCompressedFileName('photo.final.png', 'jpg', [])).toBe('photo.final-compressed.jpg')
        expect(buildCompressedFileName('photo.png', 'webp', ['photo-compressed.webp'])).toBe('photo-compressed-2.webp')
    })

    test('chooses the largest candidate under the target size', () => {
        const candidate = chooseBestCompressionCandidate([
            { quality: 0.3, size: 1_500, dataUrl: 'a' },
            { quality: 0.6, size: 2_900, dataUrl: 'b' },
            { quality: 0.8, size: 3_300, dataUrl: 'c' },
        ], 3_000)

        expect(candidate?.dataUrl).toBe('b')
    })

    test('falls back to the smallest candidate when all outputs exceed the target', () => {
        const candidate = chooseBestCompressionCandidate([
            { quality: 0.5, size: 4_200, dataUrl: 'large' },
            { quality: 0.2, size: 3_800, dataUrl: 'smaller' },
        ], 3_000)

        expect(candidate?.dataUrl).toBe('smaller')
    })

    test('formats byte sizes', () => {
        expect(formatBytes(512)).toBe('512 B')
        expect(formatBytes(2048)).toBe('2.0 KB')
        expect(formatBytes(3 * 1024 * 1024)).toBe('3.00 MB')
    })
})
