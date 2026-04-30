import { useState, useCallback, useRef } from 'react'
import './styles/index.css'

const isElectron = typeof window !== 'undefined' && typeof window.require === 'function'
const electron = isElectron ? window.require('electron') : null
const ipcRenderer = electron?.ipcRenderer

// 支持的图片格式
type ImageFormat = 'png' | 'jpg' | 'webp' | 'gif' | 'svg' | 'ico' | 'heic'
type TargetFormat = Exclude<ImageFormat, 'heic' | 'svg'>

interface ImageInfo {
    file: File
    dataUrl: string
    format: ImageFormat
    width: number
    height: number
    size: number
    sourcePath?: string
    svgCode?: string
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

function ImageConverter() {
    const [imageInfo, setImageInfo] = useState<ImageInfo | null>(null)
    const [targetFormat, setTargetFormat] = useState<TargetFormat>('png')
    const [quality, setQuality] = useState(92)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [convertedUrl, setConvertedUrl] = useState<string | null>(null)
    const [copiedSvg, setCopiedSvg] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)

    // 获取文件格式
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

    // 格式化文件大小
    const formatSize = (bytes: number): string => {
        if (bytes < 1024) return bytes + ' B'
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
    }

    // 处理文件上传
    const handleFileSelect = useCallback(async (file: File) => {
        setLoading(true)
        setError(null)
        setConvertedUrl(null)
        setCopiedSvg(false)

        try {
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

            // 获取图片尺寸
            const { width, height } = await getImageDimensions(dataUrl)

            // 如果是 SVG，读取代码
            let svgCode: string | undefined
            if (format === 'svg') {
                svgCode = await readFileAsText(file)
            }

            setImageInfo({
                file,
                dataUrl,
                format,
                width,
                height,
                size: file.size,
                sourcePath,
                svgCode,
            })

            // 设置默认目标格式
            if (format === 'svg') {
                setTargetFormat('png')
            } else if (format === 'heic') {
                setTargetFormat('jpg')
            } else if (format === 'jpg') {
                setTargetFormat('png')
            } else {
                setTargetFormat('jpg')
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : '文件读取失败')
        } finally {
            setLoading(false)
        }
    }, [])

    // 读取文件为 DataURL
    const readFileAsDataUrl = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = () => reject(new Error('文件读取失败'))
            reader.readAsDataURL(file)
        })
    }

    // 读取文件为文本
    const readFileAsText = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = () => reject(new Error('文件读取失败'))
            reader.readAsText(file)
        })
    }

    // 获取图片尺寸
    const getImageDimensions = (dataUrl: string): Promise<{ width: number; height: number }> => {
        return new Promise((resolve) => {
            const img = new Image()
            img.onload = () => resolve({ width: img.width, height: img.height })
            img.onerror = () => resolve({ width: 0, height: 0 })
            img.src = dataUrl
        })
    }

    // 处理拖放
    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        const file = e.dataTransfer.files[0]
        if (file && isSupportedImageFile(file)) {
            handleFileSelect(file)
        }
    }, [handleFileSelect])

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault()
    }, [])

    // 转换图片格式
    const handleConvert = useCallback(async () => {
        if (!imageInfo) return

        setLoading(true)
        setError(null)

        try {
            if (imageInfo.format === 'heic') {
                if (!ipcRenderer) {
                    throw new Error('HEIC 转换需要在 Electron 桌面应用中使用')
                }

                if (!imageInfo.sourcePath) {
                    throw new Error('无法读取 HEIC 文件路径，请重新选择文件')
                }

                if (!['png', 'jpg'].includes(targetFormat)) {
                    throw new Error('HEIC 当前支持转换为 PNG 或 JPG')
                }

                const result = await ipcRenderer.invoke('convert-heic-image', {
                    filePath: imageInfo.sourcePath,
                    targetFormat,
                }) as HeicConversionResult

                if (!result.success || !result.dataUrl) {
                    throw new Error(result.error || 'HEIC 转换失败')
                }

                setConvertedUrl(result.dataUrl)
                return
            }

            const canvas = canvasRef.current!
            const ctx = canvas.getContext('2d')!

            // 加载图片
            const img = new Image()
            await new Promise<void>((resolve, reject) => {
                img.onload = () => resolve()
                img.onerror = () => reject(new Error('图片加载失败'))
                img.src = imageInfo.dataUrl
            })

            // 设置画布尺寸
            canvas.width = img.width
            canvas.height = img.height

            // 绘制图片
            ctx.clearRect(0, 0, canvas.width, canvas.height)

            // JPG 不支持透明，填充白色背景
            if (targetFormat === 'jpg') {
                ctx.fillStyle = '#ffffff'
                ctx.fillRect(0, 0, canvas.width, canvas.height)
            }

            ctx.drawImage(img, 0, 0)

            // 转换格式
            const formatInfo = FORMAT_OPTIONS.find(f => f.value === targetFormat)
            const mimeType = formatInfo?.mime || 'image/png'
            const qualityValue = ['jpg', 'webp'].includes(targetFormat) ? quality / 100 : undefined

            let resultUrl: string

            if (targetFormat === 'ico') {
                // ICO 特殊处理：缩小到 32x32 或 64x64
                const icoCanvas = document.createElement('canvas')
                const icoCtx = icoCanvas.getContext('2d')!
                const size = Math.min(img.width, img.height, 64)
                icoCanvas.width = size
                icoCanvas.height = size
                icoCtx.drawImage(img, 0, 0, size, size)
                resultUrl = icoCanvas.toDataURL('image/png')
            } else {
                resultUrl = canvas.toDataURL(mimeType, qualityValue)
            }

            setConvertedUrl(resultUrl)
        } catch (e) {
            setError(e instanceof Error ? e.message : '转换失败')
        } finally {
            setLoading(false)
        }
    }, [imageInfo, targetFormat, quality])

    // 下载转换后的图片
    const handleDownload = useCallback(() => {
        if (!convertedUrl || !imageInfo) return

        const link = document.createElement('a')
        const baseName = imageInfo.file.name.replace(/\.[^.]+$/, '')
        link.download = `${baseName}.${targetFormat}`
        link.href = convertedUrl
        link.click()
    }, [convertedUrl, imageInfo, targetFormat])

    // 复制 SVG 代码
    const handleCopySvg = useCallback(() => {
        if (!imageInfo?.svgCode) return
        navigator.clipboard.writeText(imageInfo.svgCode)
        setCopiedSvg(true)
        setTimeout(() => setCopiedSvg(false), 2000)
    }, [imageInfo])

    // 下载 SVG 代码
    const handleDownloadSvg = useCallback(() => {
        if (!imageInfo?.svgCode) return
        const blob = new Blob([imageInfo.svgCode], { type: 'image/svg+xml' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.download = imageInfo.file.name
        link.href = url
        link.click()
        URL.revokeObjectURL(url)
    }, [imageInfo])

    // 清空
    const handleClear = useCallback(() => {
        setImageInfo(null)
        setConvertedUrl(null)
        setError(null)
        setCopiedSvg(false)
        if (fileInputRef.current) {
            fileInputRef.current.value = ''
        }
    }, [])

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
                {/* 隐藏的 canvas */}
                <canvas ref={canvasRef} style={{ display: 'none' }} />

                {/* 上传区域 */}
                {!imageInfo && (
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
                            onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                            style={{ display: 'none' }}
                        />
                        <div className="upload-icon">🖼️</div>
                        <div className="upload-text">拖拽图片到此处或点击上传</div>
                        <div className="upload-hint">
                            支持 PNG, JPG, WebP, GIF, SVG, ICO, HEIC
                        </div>
                    </div>
                )}

                {/* 错误提示 */}
                {error && (
                    <div className="error-box">
                        <span className="error-icon">⚠️</span>
                        <span>{error}</span>
                    </div>
                )}

                {/* 图片信息和转换区域 */}
                {imageInfo && (
                    <div className="converter-content">
                        <div className="converter-panels">
                            {/* 原图预览 */}
                            <div className="panel source-panel">
                                <div className="panel-header">
                                    <span className="panel-title">原图</span>
                                    <span className="format-badge">{imageInfo.format.toUpperCase()}</span>
                                </div>
                                <div className="preview-area">
                                    <img
                                        src={imageInfo.dataUrl}
                                        alt="原图预览"
                                        className="preview-image"
                                    />
                                </div>
                                <div className="image-info">
                                    <div className="info-item">
                                        <span className="info-label">尺寸</span>
                                        <span className="info-value">{imageInfo.width} × {imageInfo.height}</span>
                                    </div>
                                    <div className="info-item">
                                        <span className="info-label">大小</span>
                                        <span className="info-value">{formatSize(imageInfo.size)}</span>
                                    </div>
                                </div>
                            </div>

                            {/* 转换控制 */}
                            <div className="convert-controls">
                                <div className="arrow-icon">→</div>
                                <div className="format-selector">
                                    <label className="selector-label">目标格式</label>
                                    <div className="format-buttons">
                                        {FORMAT_OPTIONS.map(opt => (
                                            <button
                                                key={opt.value}
                                                className={`format-btn ${targetFormat === opt.value ? 'active' : ''}`}
                                                onClick={() => setTargetFormat(opt.value)}
                                                disabled={
                                                    imageInfo.format === opt.value ||
                                                    (imageInfo.format === 'heic' && !['png', 'jpg'].includes(opt.value))
                                                }
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* 质量控制（仅 JPG 和 WebP） */}
                                {['jpg', 'webp'].includes(targetFormat) && (
                                    <div className="quality-control">
                                        <label className="selector-label">
                                            质量: {quality}%
                                        </label>
                                        <input
                                            type="range"
                                            min="10"
                                            max="100"
                                            value={quality}
                                            onChange={(e) => setQuality(Number(e.target.value))}
                                            className="quality-slider"
                                        />
                                    </div>
                                )}

                                <button
                                    className="btn btn-primary convert-btn"
                                    onClick={handleConvert}
                                    disabled={loading}
                                >
                                    {loading ? '转换中...' : '🔄 转换'}
                                </button>
                            </div>

                            {/* 转换结果 */}
                            <div className="panel result-panel">
                                <div className="panel-header">
                                    <span className="panel-title">转换结果</span>
                                    {convertedUrl && (
                                        <span className="format-badge success">{targetFormat.toUpperCase()}</span>
                                    )}
                                </div>
                                <div className="preview-area">
                                    {convertedUrl ? (
                                        <img
                                            src={convertedUrl}
                                            alt="转换结果"
                                            className="preview-image"
                                        />
                                    ) : (
                                        <div className="preview-placeholder">
                                            选择目标格式并点击转换
                                        </div>
                                    )}
                                </div>
                                {convertedUrl && (
                                    <button
                                        className="btn btn-primary download-btn"
                                        onClick={handleDownload}
                                    >
                                        <span>💾</span>
                                        下载图片
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* SVG 代码区域 */}
                        {imageInfo.format === 'svg' && imageInfo.svgCode && (
                            <div className="svg-code-section">
                                <div className="svg-code-header">
                                    <span className="svg-code-title">📝 SVG 代码</span>
                                    <div className="svg-code-actions">
                                        <button
                                            className={`btn btn-secondary ${copiedSvg ? 'copied' : ''}`}
                                            onClick={handleCopySvg}
                                        >
                                            {copiedSvg ? '✓ 已复制' : '📋 复制代码'}
                                        </button>
                                        <button
                                            className="btn btn-secondary"
                                            onClick={handleDownloadSvg}
                                        >
                                            💾 下载 SVG
                                        </button>
                                    </div>
                                </div>
                                <pre className="svg-code-content">
                                    <code>{imageInfo.svgCode}</code>
                                </pre>
                            </div>
                        )}

                        {/* 重新上传 */}
                        <div className="reupload-section">
                            <button
                                className="btn btn-secondary"
                                onClick={handleClear}
                            >
                                📤 上传新图片
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

export default ImageConverter
