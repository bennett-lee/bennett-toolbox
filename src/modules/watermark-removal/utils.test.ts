import { describe, expect, test } from 'vitest'
import {
    buildWatermarkRemovalFileName,
    clampInpaintOptions,
    countMaskedPixels,
    createMaskFromAlpha,
    inpaintMaskedPixels,
} from './utils'

describe('watermark removal utils', () => {
    test('clamps inpaint options to practical ranges', () => {
        expect(clampInpaintOptions({ radius: 1, iterations: 0 })).toEqual({
            radius: 2,
            iterations: 1,
        })
        expect(clampInpaintOptions({ radius: 99, iterations: 99 })).toEqual({
            radius: 24,
            iterations: 6,
        })
    })

    test('builds mask from alpha channel', () => {
        const pixels = new Uint8ClampedArray([
            0, 0, 0, 0,
            0, 0, 0, 17,
            0, 0, 0, 255,
        ])
        const mask = createMaskFromAlpha(pixels, 3, 1)

        expect([...mask]).toEqual([0, 1, 1])
        expect(countMaskedPixels(mask)).toBe(2)
    })

    test('fills masked pixel from surrounding colors', () => {
        const source = new Uint8ClampedArray([
            20, 40, 60, 255,
            90, 90, 90, 255,
            20, 40, 60, 255,
            20, 40, 60, 255,
            255, 255, 255, 255,
            20, 40, 60, 255,
            20, 40, 60, 255,
            20, 40, 60, 255,
            20, 40, 60, 255,
        ])
        const mask = new Uint8Array([
            0, 0, 0,
            0, 1, 0,
            0, 0, 0,
        ])

        const result = inpaintMaskedPixels(source, 3, 3, mask, { radius: 1, iterations: 1 })
        const centerOffset = 4 * 4

        expect(result.stats.maskedPixels).toBe(1)
        expect(result.stats.filledPixels).toBe(1)
        expect(Array.from(result.data.slice(centerOffset, centerOffset + 4))).toEqual([30, 47, 64, 255])
    })

    test('uses a safe output filename', () => {
        expect(buildWatermarkRemovalFileName('photo.jpg')).toBe('photo-去水印.png')
        expect(buildWatermarkRemovalFileName('')).toBe('image-去水印.png')
    })
})
