import { useCallback, useMemo, useRef, useState } from 'react'
import JSZip from 'jszip'
import './styles/index.css'

const isElectron = typeof window !== 'undefined' && typeof window.require === 'function'
const electron = isElectron ? window.require('electron') : null
const ipcRenderer = electron?.ipcRenderer

type ImageFormat = 'png' | 'jpg' | 'webp' | 'gif' | 'svg' | 'ico' | 'heic'
type TargetFormat = Exclude<ImageFormat, 'heic' | 'svg'>
type ConvertStatus = 'pending' | 'success' | 'error'

interface ImageInfo {
    id: string
    file: File
    dataUrl: string
    format: ImageFormat
    width: number
    height: number
    size: number
    sourcePath?: string
    svgCode?: string
}

interface ConvertedImage {
    id: string
    sourceName: string
    outputName: string
    dataUrl?: string
    error?: string
    status: ConvertStatus
}

interface HeicConversionResult {
    success: boolean
    dataUrl?: string
    size?: number
    error?: string
}

const FORMAT_OPTIONS: { value: TargetFormat; label: string; mime: string }[] = [
    { value: 'png', label: 'PNG', mime: 'image/png' },
    { value: 'jpg', label: 'JPG', mime: 'image/jpeg' },
    { value: 'webp', label: 'WebP', mime: 'image/webp' },
    { value: 'gif', label: 'GIF', mime: 'image/gif' },
    { value: 'ico', label: 'ICO', mime: 'image/x-icon' },
]

const getFormat = (file: File): ImageFormat => {
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext === 'heic' || ext === 'heif') return 'heic'
    if (ext === 'svg') return 'svg'
    if (ext === 'jpg' || ext === 'jpeg') return 'jpg'
    if (ext === 'png') return 'png'
    if (ext === 'webp') return 'webp'
    if (ext === 'gif') return 'gif'
    if (ext === 'ico') return 'ico'
    return 'png'
}

const isSupportedImageFile = (file: File): boolean => {
    const ext = file.name.split('.').pop()?.toLowerCase()
    return file.type.startsWith('image/') || ext === 'heic' || ext === 'heif'
}

const getUniqueOutputName = (
    fileName: string,
    targetFormat: TargetFormat,
    usedNames: string[],
) => {
    const baseName = fileName.replace(/\.[^.]+$/, '') || 'image'
    let outputName = `${baseName}.${targetFormat}`
    let index = 2

    while (usedNames.includes(outputName)) {
        outputName = `${baseName}-${index}.${targetFormat}`
        index += 1
    }

    return outputName
}

const formatSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
}

const readFileAsDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(new Error('文件读取失败'))
        reader.readAsDataURL(file)
    })
}

const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(new Error('文件读取失败'))
        reader.readAsText(file)
    })
}

const getImageDimensions = (dataUrl: string): Promise<{ width: number; height: number }> => {
    return new Promise((resolve) => {
        const img = new Image()
        img.onload = () => resolve({ width: img.width, height: img.height })
        img.onerror = () => resolve({ width: 0, height: 0 })
        img.src = dataUrl
    })
}

const dataUrlToBlob = async (dataUrl: string) => {
    const response = await fetch(dataUrl)
    return response.blob()
}

function ImageConverter() {
    const [imageItems, setImageItems] = useState<ImageInfo[]>([])
    const [targetFormat, setTargetFormat] = useState<TargetFormat>('png')
    const [quality, setQuality] = useState(92)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [convertedItems, setConvertedItems] = useState<ConvertedImage[]>([])
    const [copiedSvgId, setCopiedSvgId] = useState<string | null>(null)
    const [progress, setProgress] = useState(0)
    const [progressLabel, setProgressLabel] = useState('')
    const fileInputRef = useRef<HTMLInputElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)

    const selectedCount = imageItems.length
    const successCount = useMemo(
        () => convertedItems.filter(item => item.status === 'success').length,
        [convertedItems],
    )

    const resetProgress = useCallback(() => {
        setProgress(0)
        setProgressLabel('')
    }, [])

    const readImageFile = useCallback(async (file: File): Promise<ImageInfo> => {
        const format = getFormat(file)
        const sourcePath = (file as File & { path?: string }).path
        let dataUrl: string

        if (format === 'heic') {
            if (!isElectron || !ipcRenderer || !sourcePath) {
                throw new Error('HEIC 转换需要在 Electron 桌面应用中选择本地文件')
            }

            const preview = await ipcRenderer.invoke('convert-heic-image', {
                filePath: sourcePath,
                targetFormat: 'png',
            }) as HeicConversionResult

            if (!preview.success || !preview.dataUrl) {
                throw new Error(preview.error || 'HEIC 预览转换失败')
            }

            dataUrl = preview.dataUrl
        } else {
            dataUrl = await readFileAsDataUrl(file)
        }

        const { width, height } = await getImageDimensions(dataUrl)
        const svgCode = format === 'svg' ? await readFileAsText(file) : undefined

        return {
            id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(16).slice(2)}`,
            file,
            dataUrl,
            format,
            width,
            height,
            size: file.size,
            sourcePath,
            svgCode,
        }
    }, [])

    const handleFilesSelect = useCallback(async (files: FileList | File[]) => {
        const nextFiles = Array.from(files).filter(isSupportedImageFile)
        if (nextFiles.length === 0) {
            setError('请选择支持的图片文件')
            return
        }

        setLoading(true)
        setError(null)
        setConvertedItems([])
        setCopiedSvgId(null)
        setProgress(0)
        setProgressLabel(`正在读取 0 / ${nextFiles.length} 张图片`)

        const nextItems: ImageInfo[] = []
        const errors: string[] = []

        for (let index = 0; index < nextFiles.length; index += 1) {
            const file = nextFiles[index]
            setProgressLabel(`正在读取 ${index + 1} / ${nextFiles.length} 张图片`)
            try {
                nextItems.push(await readImageFile(file))
            } catch (e) {
                errors.push(`${file.name}: ${e instanceof Error ? e.message : '读取失败'}`)
            }
            setProgress(Math.round(((index + 1) / nextFiles.length) * 100))
        }

        setImageItems(nextItems)

        if (nextItems.length > 0) {
            const firstFormat = nextItems[0].format
            if (firstFormat === 'svg') setTargetFormat('png')
            else if (firstFormat === 'heic') setTargetFormat('jpg')
            else if (firstFormat === 'jpg') setTargetFormat('png')
            else setTargetFormat('jpg')
        }

        setError(errors.length > 0 ? errors.join('；') : null)
        setProgressLabel(nextItems.length > 0 ? `已读取 ${nextItems.length} 张图片` : '')
        setLoading(false)
    }, [readImageFile])

    const convertImage = useCallback(async (imageInfo: ImageInfo, target: TargetFormat): Promise<string> => {
        if (imageInfo.format === 'heic') {
            if (!ipcRenderer) {
                throw new Error('HEIC 转换需要在 Electron 桌面应用中使用')
            }

            if (!imageInfo.sourcePath) {
                throw new Error('无法读取 HEIC 文件路径，请重新选择文件')
            }

            if (!['png', 'jpg'].includes(target)) {
                throw new Error('HEIC 当前支持转换为 PNG 或 JPG')
            }

            const result = await ipcRenderer.invoke('convert-heic-image', {
                filePath: imageInfo.sourcePath,
                targetFormat: target,
            }) as HeicConversionResult

            if (!result.success || !result.dataUrl) {
                throw new Error(result.error || 'HEIC 转换失败')
            }

            return result.dataUrl
        }

        const canvas = canvasRef.current
        if (!canvas) throw new Error('画布初始化失败')
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('画布上下文初始化失败')

        const img = new Image()
        await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve()
            img.onerror = () => reject(new Error('图片加载失败'))
            img.src = imageInfo.dataUrl
        })

        canvas.width = img.width
        canvas.height = img.height
        ctx.clearRect(0, 0, canvas.width, canvas.height)

        if (target === 'jpg') {
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(0, 0, canvas.width, canvas.height)
        }

        ctx.drawImage(img, 0, 0)

        if (target === 'ico') {
            const icoCanvas = document.createElement('canvas')
            const icoCtx = icoCanvas.getContext('2d')
            if (!icoCtx) throw new Error('ICO 画布初始化失败')
            const size = Math.min(img.width, img.height, 64)
            icoCanvas.width = size
            icoCanvas.height = size
            icoCtx.drawImage(img, 0, 0, size, size)
            return icoCanvas.toDataURL('image/png')
        }

        const formatInfo = FORMAT_OPTIONS.find(f => f.value === target)
        const mimeType = formatInfo?.mime || 'image/png'
        const qualityValue = ['jpg', 'webp'].includes(target) ? quality / 100 : undefined
        return canvas.toDataURL(mimeType, qualityValue)
    }, [quality])

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        handleFilesSelect(e.dataTransfer.files)
    }, [handleFilesSelect])

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault()
    }, [])

    const handleConvert = useCallback(async () => {
        if (imageItems.length === 0) return

        setLoading(true)
        setError(null)
        setConvertedItems([])
        setProgress(0)
        setProgressLabel(`准备转换 ${imageItems.length} 张图片`)

        const nextConverted: ConvertedImage[] = []

        for (let index = 0; index < imageItems.length; index += 1) {
            const imageInfo = imageItems[index]
            const outputName = getUniqueOutputName(
                imageInfo.file.name,
                targetFormat,
                nextConverted.map(item => item.outputName),
            )
            setProgressLabel(`正在转换 ${index + 1} / ${imageItems.length}: ${imageInfo.file.name}`)

            try {
                const dataUrl = await convertImage(imageInfo, targetFormat)
                nextConverted.push({
                    id: imageInfo.id,
                    sourceName: imageInfo.file.name,
                    outputName,
                    dataUrl,
                    status: 'success',
                })
            } catch (e) {
                nextConverted.push({
                    id: imageInfo.id,
                    sourceName: imageInfo.file.name,
                    outputName,
                    error: e instanceof Error ? e.message : '转换失败',
                    status: 'error',
                })
            }

            setConvertedItems([...nextConverted])
            setProgress(Math.round(((index + 1) / imageItems.length) * 100))
        }

        const failedCount = nextConverted.filter(item => item.status === 'error').length
        setProgressLabel(failedCount > 0
            ? `完成 ${nextConverted.length - failedCount} 张，失败 ${failedCount} 张`
            : `已完成 ${nextConverted.length} 张图片转换`)
        setLoading(false)
    }, [convertImage, imageItems, targetFormat])

    const handleDownload = useCallback((item: ConvertedImage) => {
        if (!item.dataUrl) return

        const link = document.createElement('a')
        link.download = item.outputName
        link.href = item.dataUrl
        link.click()
    }, [])

    const handleDownloadAll = useCallback(async () => {
        const downloadableItems = convertedItems.filter(item => item.status === 'success' && item.dataUrl)
        if (downloadableItems.length === 0) return

        setLoading(true)
        setError(null)
        setProgress(0)
        setProgressLabel(`正在打包 0 / ${downloadableItems.length} 张图片`)

        try {
            const zip = new JSZip()

            for (let index = 0; index < downloadableItems.length; index += 1) {
                const item = downloadableItems[index]
                if (!item.dataUrl) continue
                setProgressLabel(`正在打包 ${index + 1} / ${downloadableItems.length}: ${item.outputName}`)
                zip.file(item.outputName, await dataUrlToBlob(item.dataUrl))
                setProgress(Math.round(((index + 1) / downloadableItems.length) * 70))
            }

            const blob = await zip.generateAsync({ type: 'blob' }, metadata => {
                setProgress(70 + Math.round(metadata.percent * 0.3))
            })
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = `converted-images-${Date.now()}.zip`
            link.click()
            URL.revokeObjectURL(url)
            setProgress(100)
            setProgressLabel('图片打包完成')
        } catch (e) {
            setError(e instanceof Error ? e.message : '图片打包失败')
        } finally {
            setLoading(false)
        }
    }, [convertedItems])

    const handleCopySvg = useCallback((imageInfo: ImageInfo) => {
        if (!imageInfo.svgCode) return
        navigator.clipboard.writeText(imageInfo.svgCode)
        setCopiedSvgId(imageInfo.id)
        setTimeout(() => setCopiedSvgId(null), 2000)
    }, [])

    const handleDownloadSvg = useCallback((imageInfo: ImageInfo) => {
        if (!imageInfo.svgCode) return
        const blob = new Blob([imageInfo.svgCode], { type: 'image/svg+xml' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.download = imageInfo.file.name
        link.href = url
        link.click()
        URL.revokeObjectURL(url)
    }, [])

    const handleClear = useCallback(() => {
        setImageItems([])
        setConvertedItems([])
        setError(null)
        setCopiedSvgId(null)
        resetProgress()
        if (fileInputRef.current) {
            fileInputRef.current.value = ''
        }
    }, [resetProgress])

    const isFormatDisabled = useCallback((format: TargetFormat) => {
        if (imageItems.length === 0) return false
        const allSameFormat = imageItems.every(item => item.format === format)
        const hasHeic = imageItems.some(item => item.format === 'heic')
        return allSameFormat || (hasHeic && !['png', 'jpg'].includes(format))
    }, [imageItems])

    return (
        <div className="image-converter">
            <div className="image-converter-header">
                <h1 className="module-title">图片转换</h1>
                <div className="header-actions">
                    <button className="btn btn-secondary" onClick={handleClear}>
                        <span>🗑️</span>
                        清空
                    </button>
                </div>
            </div>

            <div className="image-converter-body">
                <canvas ref={canvasRef} style={{ display: 'none' }} />

                {selectedCount === 0 && (
                    <div
                        className="upload-zone"
                        onDrop={handleDrop}
                        onDragOver={handleDragOver}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*,.heic,.heif"
                            multiple
                            onChange={(e) => e.target.files && handleFilesSelect(e.target.files)}
                            style={{ display: 'none' }}
                        />
                        <div className="upload-icon">🖼️</div>
                        <div className="upload-text">拖拽一批图片到此处或点击上传</div>
                        <div className="upload-hint">
                            支持 PNG, JPG, WebP, GIF, SVG, ICO, HEIC，可一次选择多张
                        </div>
                    </div>
                )}

                {error && (
                    <div className="error-box">
                        <span className="error-icon">⚠️</span>
                        <span>{error}</span>
                    </div>
                )}

                {selectedCount > 0 && (
                    <div className="converter-content">
                        <div className="batch-toolbar">
                            <div className="batch-summary">
                                <strong>{selectedCount}</strong>
                                <span>张图片</span>
                                {successCount > 0 && <span className="batch-success">{successCount} 张已转换</span>}
                            </div>
                            <div className="batch-actions">
                                <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
                                    📤 重新选择
                                </button>
                                {successCount > 0 && (
                                    <button className="btn btn-primary" onClick={handleDownloadAll} disabled={loading}>
                                        下载全部 ZIP
                                    </button>
                                )}
                            </div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*,.heic,.heif"
                                multiple
                                onChange={(e) => e.target.files && handleFilesSelect(e.target.files)}
                                style={{ display: 'none' }}
                            />
                        </div>

                        <section className="panel batch-control-panel">
                            <div className="panel-header">
                                <span className="panel-title">批量转换设置</span>
                                <span className="format-badge">{targetFormat.toUpperCase()}</span>
                            </div>
                            <div className="batch-control-body">
                                <div className="format-selector batch-format-selector">
                                    <label className="selector-label">目标格式</label>
                                    <div className="format-buttons">
                                        {FORMAT_OPTIONS.map(opt => (
                                            <button
                                                key={opt.value}
                                                className={`format-btn ${targetFormat === opt.value ? 'active' : ''}`}
                                                onClick={() => {
                                                    setTargetFormat(opt.value)
                                                    setConvertedItems([])
                                                    resetProgress()
                                                }}
                                                disabled={isFormatDisabled(opt.value)}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {['jpg', 'webp'].includes(targetFormat) && (
                                    <div className="quality-control batch-quality-control">
                                        <label className="selector-label">
                                            质量: {quality}%
                                        </label>
                                        <input
                                            type="range"
                                            min="10"
                                            max="100"
                                            value={quality}
                                            onChange={(e) => {
                                                setQuality(Number(e.target.value))
                                                setConvertedItems([])
                                                resetProgress()
                                            }}
                                            className="quality-slider"
                                        />
                                    </div>
                                )}

                                <button
                                    className="btn btn-primary convert-btn batch-convert-btn"
                                    onClick={handleConvert}
                                    disabled={loading}
                                >
                                    {loading ? '处理中...' : '🔄 批量转换'}
                                </button>
                            </div>

                            {(loading || progress > 0) && (
                                <div className="image-progress">
                                    <div className="image-progress-meta">
                                        <span>{progressLabel}</span>
                                        <span>{progress}%</span>
                                    </div>
                                    <div className="image-progress-track">
                                        <div className="image-progress-fill" style={{ width: `${progress}%` }} />
                                    </div>
                                </div>
                            )}
                        </section>

                        <div className="image-batch-grid">
                            {imageItems.map(imageInfo => {
                                const converted = convertedItems.find(item => item.id === imageInfo.id)
                                return (
                                    <article className="image-batch-card" key={imageInfo.id}>
                                        <div className="image-batch-preview">
                                            <img
                                                src={converted?.dataUrl || imageInfo.dataUrl}
                                                alt={imageInfo.file.name}
                                                className="preview-image"
                                            />
                                        </div>
                                        <div className="image-batch-info">
                                            <div className="image-batch-name" title={imageInfo.file.name}>
                                                {imageInfo.file.name}
                                            </div>
                                            <div className="image-batch-meta">
                                                <span>{imageInfo.format.toUpperCase()}</span>
                                                <span>{imageInfo.width} × {imageInfo.height}</span>
                                                <span>{formatSize(imageInfo.size)}</span>
                                            </div>
                                            {converted?.status === 'error' && (
                                                <div className="image-batch-error">{converted.error}</div>
                                            )}
                                        </div>
                                        <div className="image-batch-footer">
                                            <span className={`format-badge ${converted?.status === 'success' ? 'success' : ''}`}>
                                                {converted?.status === 'success' ? targetFormat.toUpperCase() : '待转换'}
                                            </span>
                                            {converted?.status === 'success' && (
                                                <button className="btn btn-secondary" onClick={() => handleDownload(converted)}>
                                                    下载
                                                </button>
                                            )}
                                        </div>
                                    </article>
                                )
                            })}
                        </div>

                        {imageItems.some(item => item.format === 'svg' && item.svgCode) && (
                            <div className="svg-code-section">
                                <div className="svg-code-header">
                                    <span className="svg-code-title">📝 SVG 代码</span>
                                </div>
                                {imageItems
                                    .filter(item => item.format === 'svg' && item.svgCode)
                                    .map(imageInfo => (
                                        <div className="svg-code-item" key={imageInfo.id}>
                                            <div className="svg-code-actions">
                                                <span className="svg-code-file">{imageInfo.file.name}</span>
                                                <button
                                                    className={`btn btn-secondary ${copiedSvgId === imageInfo.id ? 'copied' : ''}`}
                                                    onClick={() => handleCopySvg(imageInfo)}
                                                >
                                                    {copiedSvgId === imageInfo.id ? '✓ 已复制' : '📋 复制代码'}
                                                </button>
                                                <button
                                                    className="btn btn-secondary"
                                                    onClick={() => handleDownloadSvg(imageInfo)}
                                                >
                                                    💾 下载 SVG
                                                </button>
                                            </div>
                                            <pre className="svg-code-content">
                                                <code>{imageInfo.svgCode}</code>
                                            </pre>
                                        </div>
                                    ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

export default ImageConverter
