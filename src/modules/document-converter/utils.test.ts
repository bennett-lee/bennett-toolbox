import { describe, expect, test } from 'vitest'
import {
    canConvertDocument,
    formatDocumentSize,
    getMarkdownDownloadName,
    getReadableExtension,
} from './utils'

describe('document converter utils', () => {
    test('accepts MarkItDown document formats case-insensitively', () => {
        expect(canConvertDocument('Quarterly Report.PDF')).toBe(true)
        expect(canConvertDocument('meeting-notes.docx')).toBe(true)
        expect(canConvertDocument('data.JSON')).toBe(true)
        expect(canConvertDocument('archive.zip')).toBe(true)
    })

    test('rejects files without supported extensions', () => {
        expect(canConvertDocument('video.mov')).toBe(false)
        expect(canConvertDocument('README')).toBe(false)
    })

    test('formats source file sizes for the summary panel', () => {
        expect(formatDocumentSize(512)).toBe('512 B')
        expect(formatDocumentSize(1536)).toBe('1.5 KB')
        expect(formatDocumentSize(2 * 1024 * 1024)).toBe('2.00 MB')
    })

    test('creates a markdown download name from the source name', () => {
        expect(getMarkdownDownloadName('Quarterly Report.pdf')).toBe('Quarterly Report.md')
        expect(getMarkdownDownloadName('README')).toBe('README.md')
    })

    test('returns a readable uppercase extension', () => {
        expect(getReadableExtension('budget.xlsx')).toBe('XLSX')
        expect(getReadableExtension('README')).toBe('FILE')
    })
})
