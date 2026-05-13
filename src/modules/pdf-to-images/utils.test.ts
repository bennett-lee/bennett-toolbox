import { describe, expect, test } from 'vitest'
import {
    buildPageImageName,
    buildZipName,
    clampPdfRenderOptions,
    formatBytes,
    getMimeType,
    getPdfBaseName,
} from './utils'

describe('pdf to images utils', () => {
    test('clamps render options', () => {
        expect(clampPdfRenderOptions({ scale: 0.2, format: 'png', quality: 20 })).toEqual({
            scale: 1,
            format: 'png',
            quality: 60,
        })
        expect(clampPdfRenderOptions({ scale: 5, format: 'jpg', quality: 120 })).toEqual({
            scale: 3,
            format: 'jpg',
            quality: 100,
        })
    })

    test('builds output names with stable page padding', () => {
        expect(getPdfBaseName('report.final.pdf')).toBe('report.final')
        expect(getPdfBaseName('')).toBe('document')
        expect(buildPageImageName('report.pdf', 3, 120, 'png')).toBe('report-page-003.png')
        expect(buildZipName('report.pdf')).toBe('report-images.zip')
    })

    test('returns mime type by format', () => {
        expect(getMimeType('png')).toBe('image/png')
        expect(getMimeType('jpg')).toBe('image/jpeg')
    })

    test('formats byte sizes', () => {
        expect(formatBytes(512)).toBe('512 B')
        expect(formatBytes(1536)).toBe('1.5 KB')
        expect(formatBytes(2 * 1024 * 1024)).toBe('2.00 MB')
    })
})
