import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import JSZip from 'jszip'
import {
    GlobalWorkerOptions,
    getDocument,
    PDFDocumentProxy,
    PDFPageProxy,
} from 'pdfjs-dist/legacy/build/pdf.mjs'
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url'
import {
    buildPageImageName,
    buildZipName,
    clampPdfRenderOptions,
    formatBytes,
    getMimeType,
    PdfImageFormat,
    PdfRenderOptions,
} from './utils'
import './styles/index.css'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

interface PdfFileInfo {
    file: File
    pageCount: number
    size: number
}

interface PageImage {
    pageNumber: number
    name: string
    url: string
    blob: Blob
    width: number
    height: number
}

const DEFAULT_OPTIONS: PdfRenderOptions = {
    scale: 2,
    format: 'png',
    quality: 92,
}

const readFileAsArrayBuffer = (file: File) => {
    return file.arrayBuffer()
}

const canvasToBlob = (canvas: HTMLCanvasElement, format: PdfImageFormat, quality: number) => {
    return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(blob => {
            if (blob) resolve(blob)
            else reject(new Error('页面图片导出失败'))
        }, getMimeType(format), format === 'jpg' ? quality / 100 : undefined)
    })
}

const renderPageToImage = async (
    pdf: PDFDocumentProxy,
    pageNumber: number,
    fileName: string,
    totalPages: number,
    options: PdfRenderOptions,
): Promise<PageImage> => {
    const safeOptions = clampPdfRenderOptions(options)
    const page: PDFPageProxy = await pdf.getPage(pageNumber)
    const viewport = page.getViewport({ scale: safeOptions.scale })
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法创建 PDF 渲染画布')

    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)

    if (safeOptions.format === 'jpg') {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
    }

    await page.render({
        canvas,
        canvasContext: ctx,
        viewport,
        background: '#ffffff',
    }).promise

    const blob = await canvasToBlob(canvas, safeOptions.format, safeOptions.quality)
    const name = buildPageImageName(fileName, pageNumber, totalPages, safeOptions.format)

    return {
        pageNumber,
        name,
        blob,
        url: URL.createObjectURL(blob),
        width: canvas.width,
        height: canvas.height,
    }
}

function PdfToImages() {
    const [pdfInfo, setPdfInfo] = useState<PdfFileInfo | null>(null)
    const [options, setOptions] = useState<PdfRenderOptions>(DEFAULT_OPTIONS)
    const [pageImages, setPageImages] = useState<PageImage[]>([])
    const [loading, setLoading] = useState(false)
    const [progress, setProgress] = useState(0)
    const [progressLabel, setProgressLabel] = useState('')
    const [error, setError] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const pdfRef = useRef<PDFDocumentProxy | null>(null)

    const safeOptions = useMemo(() => clampPdfRenderOptions(options), [options])

    const revokePageImages = useCallback((images: PageImage[]) => {
        images.forEach(image => URL.revokeObjectURL(image.url))
    }, [])

    useEffect(() => {
        return () => {
            revokePageImages(pageImages)
        }
    }, [pageImages, revokePageImages])

    useEffect(() => {
        return () => {
            pdfRef.current?.destroy()
        }
    }, [])

    const handleFileSelect = useCallback(async (file: File) => {
        if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
            setError('请选择 PDF 文件')
            return
        }

        setLoading(true)
        setError(null)
        setProgress(0)
        setProgressLabel('正在读取 PDF')
        setPdfInfo(null)
        setPageImages(prev => {
            revokePageImages(prev)
            return []
        })

        try {
            pdfRef.current?.destroy()
            const buffer = await readFileAsArrayBuffer(file)
            const pdf = await getDocument({ data: new Uint8Array(buffer) }).promise
            pdfRef.current = pdf
            setPdfInfo({
                file,
                pageCount: pdf.numPages,
                size: file.size,
            })
            setProgress(0)
            setProgressLabel('')
        } catch (e) {
            setError(e instanceof Error ? e.message : 'PDF 读取失败')
        } finally {
            setLoading(false)
        }
    }, [revokePageImages])

    const handleConvert = useCallback(async () => {
        if (!pdfInfo || !pdfRef.current) return

        setLoading(true)
        setError(null)
        setPageImages(prev => {
            revokePageImages(prev)
            return []
        })
        setProgress(0)
        setProgressLabel('准备渲染 PDF 页面')

        try {
            const pdf = pdfRef.current
            const nextImages: PageImage[] = []

            for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
                setProgressLabel(`正在转换第 ${pageNumber} / ${pdf.numPages} 页`)
                const image = await renderPageToImage(
                    pdf,
                    pageNumber,
                    pdfInfo.file.name,
                    pdf.numPages,
                    safeOptions,
                )
                nextImages.push(image)
                setProgress(Math.round((pageNumber / pdf.numPages) * 100))
            }

            setPageImages(nextImages)
            setProgress(100)
            setProgressLabel(`已生成 ${nextImages.length} 张图片`)
        } catch (e) {
            setProgress(0)
            setProgressLabel('')
            setError(e instanceof Error ? e.message : 'PDF 转图片失败')
        } finally {
            setLoading(false)
        }
    }, [pdfInfo, revokePageImages, safeOptions])

    const handleDownloadOne = useCallback((image: PageImage) => {
        const link = document.createElement('a')
        link.href = image.url
        link.download = image.name
        link.click()
    }, [])

    const handleDownloadZip = useCallback(async () => {
        if (!pdfInfo || pageImages.length === 0) return

        setLoading(true)
        setError(null)
        setProgressLabel('正在打包图片')

        try {
            const zip = new JSZip()
            pageImages.forEach(image => zip.file(image.name, image.blob))
            const blob = await zip.generateAsync({ type: 'blob' }, metadata => {
                setProgress(Math.round(metadata.percent))
            })
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = buildZipName(pdfInfo.file.name)
            link.click()
            URL.revokeObjectURL(url)
            setProgress(100)
            setProgressLabel('图片打包完成')
        } catch (e) {
            setError(e instanceof Error ? e.message : '图片打包失败')
        } finally {
            setLoading(false)
        }
    }, [pageImages, pdfInfo])

    const handleClear = useCallback(() => {
        setPdfInfo(null)
        setError(null)
        setProgress(0)
        setProgressLabel('')
        setPageImages(prev => {
            revokePageImages(prev)
            return []
        })
        pdfRef.current?.destroy()
        pdfRef.current = null
        if (fileInputRef.current) fileInputRef.current.value = ''
    }, [revokePageImages])

    const setOption = useCallback((key: keyof PdfRenderOptions, value: number | PdfImageFormat) => {
        setOptions(prev => ({ ...prev, [key]: value }))
        setPageImages(prev => {
            revokePageImages(prev)
            return []
        })
        setProgress(0)
        setProgressLabel('')
    }, [revokePageImages])

    const handleDrop = useCallback((event: React.DragEvent) => {
        event.preventDefault()
        const file = event.dataTransfer.files[0]
        if (file) handleFileSelect(file)
    }, [handleFileSelect])

    return (
        <div className="pdf-to-images">
            <div className="pdf-to-images-header">
                <h1 className="module-title">PDF 转图片</h1>
                <div className="header-actions">
                    <button className="btn btn-secondary" onClick={handleClear}>
                        <span>清</span>
                        清空
                    </button>
                </div>
            </div>

            <div className="pdf-to-images-body">
                {!pdfInfo && (
                    <section
                        className="pdf-upload-zone"
                        onDrop={handleDrop}
                        onDragOver={event => event.preventDefault()}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="application/pdf,.pdf"
                            onChange={event => event.target.files?.[0] && handleFileSelect(event.target.files[0])}
                            style={{ display: 'none' }}
                        />
                        <div className="pdf-upload-icon">PDF</div>
                        <div className="pdf-upload-title">拖拽 PDF 到此处或点击上传</div>
                        <div className="pdf-upload-hint">每一页都会转换成一张 PNG 或 JPG 图片</div>
                    </section>
                )}

                {error && (
                    <div className="error-box">
                        <span className="error-icon">警</span>
                        <span>{error}</span>
                    </div>
                )}

                {pdfInfo && (
                    <div className="pdf-workspace">
                        <section className="pdf-source-card">
                            <div className="panel-header">
                                <span className="panel-title">PDF 文件</span>
                                <span className="format-badge">PDF</span>
                            </div>
                            <div className="pdf-file-summary">
                                <div className="pdf-file-icon">PDF</div>
                                <div className="pdf-file-name">{pdfInfo.file.name}</div>
                                <div className="pdf-file-meta">
                                    <span>{pdfInfo.pageCount} 页</span>
                                    <span>{formatBytes(pdfInfo.size)}</span>
                                </div>
                            </div>
                        </section>

                        <section className="pdf-settings-card">
                            <div className="pdf-format-switch">
                                <button
                                    className={safeOptions.format === 'png' ? 'active' : ''}
                                    onClick={() => setOption('format', 'png')}
                                >
                                    PNG
                                </button>
                                <button
                                    className={safeOptions.format === 'jpg' ? 'active' : ''}
                                    onClick={() => setOption('format', 'jpg')}
                                >
                                    JPG
                                </button>
                            </div>

                            <label className="pdf-setting-field">
                                <span>清晰度倍率：{safeOptions.scale.toFixed(1)}x</span>
                                <input
                                    type="range"
                                    min="1"
                                    max="3"
                                    step="0.5"
                                    value={safeOptions.scale}
                                    onChange={event => setOption('scale', Number(event.target.value))}
                                />
                            </label>

                            {safeOptions.format === 'jpg' && (
                                <label className="pdf-setting-field">
                                    <span>JPG 质量：{safeOptions.quality}%</span>
                                    <input
                                        type="range"
                                        min="60"
                                        max="100"
                                        step="5"
                                        value={safeOptions.quality}
                                        onChange={event => setOption('quality', Number(event.target.value))}
                                    />
                                </label>
                            )}

                            <button
                                className="btn btn-primary pdf-convert-btn"
                                onClick={handleConvert}
                                disabled={loading}
                            >
                                {loading ? '处理中...' : '转换全部页面'}
                            </button>

                            {(loading || progress > 0) && (
                                <div className="pdf-progress">
                                    <div className="pdf-progress-meta">
                                        <span>{progressLabel}</span>
                                        <span>{progress}%</span>
                                    </div>
                                    <div className="pdf-progress-track">
                                        <div className="pdf-progress-fill" style={{ width: `${progress}%` }} />
                                    </div>
                                </div>
                            )}
                        </section>

                        <section className="pdf-result-card">
                            <div className="panel-header">
                                <span className="panel-title">图片结果</span>
                                {pageImages.length > 0 && (
                                    <span className="format-badge success">{pageImages.length} 张</span>
                                )}
                            </div>

                            {pageImages.length === 0 ? (
                                <div className="pdf-empty-result">转换后每页图片会显示在这里</div>
                            ) : (
                                <>
                                    <div className="pdf-result-actions">
                                        <button className="btn btn-primary" onClick={handleDownloadZip} disabled={loading}>
                                            下载全部 ZIP
                                        </button>
                                    </div>
                                    <div className="pdf-page-grid">
                                        {pageImages.map(image => (
                                            <article className="pdf-page-card" key={image.name}>
                                                <div className="pdf-page-preview">
                                                    <img src={image.url} alt={`第 ${image.pageNumber} 页`} />
                                                </div>
                                                <div className="pdf-page-meta">
                                                    <strong>第 {image.pageNumber} 页</strong>
                                                    <span>{image.width} × {image.height}</span>
                                                    <span>{formatBytes(image.blob.size)}</span>
                                                </div>
                                                <button className="btn btn-secondary" onClick={() => handleDownloadOne(image)}>
                                                    下载
                                                </button>
                                            </article>
                                        ))}
                                    </div>
                                </>
                            )}
                        </section>
                    </div>
                )}
            </div>
        </div>
    )
}

export default PdfToImages
