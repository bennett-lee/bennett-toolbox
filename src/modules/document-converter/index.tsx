import { useCallback, useEffect, useMemo, useState } from 'react'
import {
    canConvertDocument,
    formatDocumentSize,
    getMarkdownDownloadName,
    getReadableExtension,
} from './utils'
import './styles/index.css'

const isElectron = typeof window !== 'undefined' && typeof window.require === 'function'
const electron = isElectron ? window.require('electron') : null
const ipcRenderer = electron?.ipcRenderer

interface SelectedDocument {
    path: string
    name: string
    size: number
    extension: string
}

interface ConversionResult {
    success: boolean
    markdown?: string
    error?: string
    command?: string
    sourceName?: string
}

interface ConversionProgress {
    value: number
    label: string
    status: 'running' | 'success' | 'error'
}

function DocumentConverter() {
    const [selectedDocument, setSelectedDocument] = useState<SelectedDocument | null>(null)
    const [markdown, setMarkdown] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [copied, setCopied] = useState(false)
    const [command, setCommand] = useState<string | null>(null)
    const [conversionProgress, setConversionProgress] = useState<ConversionProgress | null>(null)

    const outputName = useMemo(() => {
        return selectedDocument ? getMarkdownDownloadName(selectedDocument.name) : 'converted.md'
    }, [selectedDocument])

    const resetResult = useCallback(() => {
        setMarkdown('')
        setError(null)
        setCopied(false)
        setCommand(null)
        setConversionProgress(null)
    }, [])

    useEffect(() => {
        if (!loading) return

        const startedAt = Date.now()
        const timer = window.setInterval(() => {
            const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000)
            setConversionProgress(prev => {
                if (!prev || prev.status !== 'running') return prev

                const nextValue = Math.min(92, prev.value + (prev.value < 50 ? 6 : 3))
                const label = elapsedSeconds < 2
                    ? '准备读取文件'
                    : elapsedSeconds < 8
                        ? '调用 MarkItDown 转换'
                        : '转换仍在进行，请稍候'

                return {
                    ...prev,
                    value: nextValue,
                    label,
                }
            })
        }, 700)

        return () => window.clearInterval(timer)
    }, [loading])

    const setDocumentFromPath = useCallback((filePath: string, name: string, size: number) => {
        if (!canConvertDocument(name)) {
            setError('暂不支持此文件类型，请选择 PDF、Office、HTML、图片、CSV、JSON、XML 或 ZIP 文件')
            return
        }

        setSelectedDocument({
            path: filePath,
            name,
            size,
            extension: getReadableExtension(name),
        })
        resetResult()
    }, [resetResult])

    const handleSelectDocument = useCallback(async () => {
        if (!isElectron) return

        try {
            const selected = await ipcRenderer.invoke('select-markitdown-file') as SelectedDocument | null
            if (!selected) return
            setSelectedDocument(selected)
            resetResult()
        } catch (e) {
            setError(e instanceof Error ? e.message : '选择文件失败')
        }
    }, [resetResult])

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        const file = e.dataTransfer.files[0] as (File & { path?: string }) | undefined
        if (!file) return

        if (!file.path) {
            setError('无法读取拖入文件路径，请使用“选择文件”按钮')
            return
        }

        setDocumentFromPath(file.path, file.name, file.size)
    }, [setDocumentFromPath])

    const handleConvert = useCallback(async () => {
        if (!selectedDocument) return

        setLoading(true)
        setError(null)
        setMarkdown('')
        setCopied(false)
        setCommand(null)
        setConversionProgress({
            value: 8,
            label: '准备转换',
            status: 'running',
        })

        try {
            const result = await ipcRenderer.invoke('convert-file-to-markdown', selectedDocument.path) as ConversionResult
            if (!result.success) {
                setError(result.error || '转换失败')
                setConversionProgress({
                    value: 100,
                    label: '转换失败',
                    status: 'error',
                })
                return
            }

            setMarkdown(result.markdown || '')
            setCommand(result.command || null)
            setConversionProgress({
                value: 100,
                label: '转换完成',
                status: 'success',
            })
        } catch (e) {
            setError(e instanceof Error ? e.message : '转换失败')
            setConversionProgress({
                value: 100,
                label: '转换失败',
                status: 'error',
            })
        } finally {
            setLoading(false)
        }
    }, [selectedDocument])

    const handleCopy = useCallback(async () => {
        if (!markdown) return
        await navigator.clipboard.writeText(markdown)
        setCopied(true)
    }, [markdown])

    const handleDownload = useCallback(() => {
        if (!markdown) return

        const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.download = outputName
        link.href = url
        link.click()
        URL.revokeObjectURL(url)
    }, [markdown, outputName])

    const handleClear = useCallback(() => {
        setSelectedDocument(null)
        resetResult()
    }, [resetResult])

    if (!isElectron) {
        return (
            <div className="document-converter">
                <div className="document-converter-header">
                    <h1 className="module-title">文档转 Markdown</h1>
                </div>
                <div className="document-converter-body">
                    <div className="empty-state">
                        <div className="empty-icon">MD</div>
                        <div className="empty-text">此功能需要在 Electron 应用中运行</div>
                        <div className="empty-hint">
                            请运行 <code>npm run electron:dev</code> 或打开打包后的桌面应用
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="document-converter">
            <div className="document-converter-header">
                <h1 className="module-title">文档转 Markdown</h1>
                <div className="header-actions">
                    <button className="btn btn-secondary" onClick={handleClear} disabled={!selectedDocument && !markdown}>
                        <span>清</span>
                        清空
                    </button>
                    <button className="btn btn-secondary" onClick={handleCopy} disabled={!markdown}>
                        <span>拷</span>
                        {copied ? '已复制' : '复制'}
                    </button>
                    <button className="btn btn-primary" onClick={handleDownload} disabled={!markdown}>
                        <span>存</span>
                        保存 .md
                    </button>
                </div>
            </div>

            <div className="document-converter-body">
                <section
                    className={`document-drop-zone ${selectedDocument ? 'has-file' : ''}`}
                    onDrop={handleDrop}
                    onDragOver={(e) => e.preventDefault()}
                    onClick={handleSelectDocument}
                >
                    <div className="document-drop-icon">MD</div>
                    <div className="document-drop-copy">
                        <div className="document-drop-title">
                            {selectedDocument ? selectedDocument.name : '选择或拖入文件'}
                        </div>
                        <div className="document-drop-hint">
                            PDF、Office、HTML、图片、CSV、JSON、XML、ZIP 等格式会转换为 Markdown
                        </div>
                    </div>
                    <button className="btn btn-secondary" type="button" onClick={(e) => {
                        e.stopPropagation()
                        handleSelectDocument()
                    }}>
                        选择文件
                    </button>
                </section>

                {selectedDocument && (
                    <section className="document-summary">
                        <div className="summary-item">
                            <span className="summary-label">格式</span>
                            <span className="summary-value">{selectedDocument.extension}</span>
                        </div>
                        <div className="summary-item">
                            <span className="summary-label">大小</span>
                            <span className="summary-value">{formatDocumentSize(selectedDocument.size)}</span>
                        </div>
                        <div className="summary-item path-item">
                            <span className="summary-label">路径</span>
                            <span className="summary-value">{selectedDocument.path}</span>
                        </div>
                        <button className="btn btn-primary" onClick={handleConvert} disabled={loading}>
                            {loading ? '转换中...' : '转换为 Markdown'}
                        </button>
                    </section>
                )}

                {conversionProgress && (
                    <section className={`conversion-progress ${conversionProgress.status}`}>
                        <div className="progress-copy">
                            <span className="progress-label">{conversionProgress.label}</span>
                            <span className="progress-value">{conversionProgress.value}%</span>
                        </div>
                        <div
                            className="progress-track"
                            role="progressbar"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={conversionProgress.value}
                            aria-label="文档转换进度"
                        >
                            <div
                                className="progress-fill"
                                style={{ width: `${conversionProgress.value}%` }}
                            />
                        </div>
                    </section>
                )}

                {error && (
                    <div className="error-box">
                        <span className="error-icon">!</span>
                        <pre>{error}</pre>
                    </div>
                )}

                <section className="markdown-output-panel">
                    <div className="panel-header">
                        <span className="panel-title">Markdown 输出</span>
                        {command && <span className="command-badge">via {command}</span>}
                    </div>
                    <textarea
                        className="markdown-output"
                        value={markdown}
                        onChange={(e) => setMarkdown(e.target.value)}
                        placeholder="转换结果会显示在这里"
                        spellCheck={false}
                    />
                </section>
            </div>
        </div>
    )
}

export default DocumentConverter
