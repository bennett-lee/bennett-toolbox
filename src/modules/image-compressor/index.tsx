import { useCallback, useMemo, useRef, useState } from 'react'
import JSZip from 'jszip'
import {
    buildCompressedFileName,
    chooseBestCompressionCandidate,
    clampCompressionOptions,
    CompressionCandidate,
    CompressionFormat,
    CompressionOptions,
    formatBytes,
    getCompressionMimeType,
    getCompressionRatio,
    getTargetBytes,
} from './utils'
import './styles/index.css'

type CompressionStatus = 'success' | 'warning' | 'error'

interface ImageItem {
    id: string
    file: File
    dataUrl: string
    width: number
    height: number
    size: number
}

interface CompressedImage {
    id: string
    sourceName: string
    outputName: string
    dataUrl?: string
    blob?: Blob
    outputSize?: number
    quality?: number
    ratio?: number
    status: CompressionStatus
    message?: string
}

const DEFAULT_OPTIONS: CompressionOptions = {
    targetSizeMb: 3,
    maxQuality: 92,
    minQuality: 25,
    format: 'jpg',
}

const isSupportedImageFile = (file: File) => {
    const name = file.name.toLowerCase()
    return file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg|bmp)$/.test(name)
}

const readFileAsDataUrl = (file: File) => {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(new Error('文件读取失败'))
        reader.readAsDataURL(file)
    })
}

const loadImage = (dataUrl: string) => {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve(image)
        image.onerror = () => reject(new Error('图片加载失败'))
        image.src = dataUrl
    })
}

const dataUrlToBlob = async (dataUrl: string) => {
    const response = await fetch(dataUrl)
    return response.blob()
}

const encodeImage = (
    image: HTMLImageElement,
    format: CompressionFormat,
    quality: number,
) => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('画布初始化失败')

    canvas.width = image.naturalWidth || image.width
    canvas.height = image.naturalHeight || image.height

    if (format === 'jpg') {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
    }

    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL(getCompressionMimeType(format), quality)
}

const compressImage = async (
    item: ImageItem,
    options: CompressionOptions,
): Promise<CompressedImage> => {
    const safeOptions = clampCompressionOptions(options)
    const targetBytes = getTargetBytes(safeOptions.targetSizeMb)
    const targetLimitBytes = Math.min(targetBytes, item.size)
    const image = await loadImage(item.dataUrl)
    const minQuality = safeOptions.minQuality / 100
    const maxQuality = safeOptions.maxQuality / 100
    const candidates: CompressionCandidate[] = []
    const triedQualities = new Set<number>()

    let low = minQuality
    let high = maxQuality

    for (let attempt = 0; attempt < 8; attempt += 1) {
        const quality = Number(((low + high) / 2).toFixed(3))
        if (triedQualities.has(quality)) break
        triedQualities.add(quality)

        const dataUrl = encodeImage(image, safeOptions.format, quality)
        const blob = await dataUrlToBlob(dataUrl)
        candidates.push({ dataUrl, quality, size: blob.size })

        if (blob.size > targetLimitBytes) high = quality
        else low = quality
    }

    for (const quality of [minQuality, maxQuality]) {
        const normalizedQuality = Number(quality.toFixed(3))
        if (triedQualities.has(normalizedQuality)) continue
        const dataUrl = encodeImage(image, safeOptions.format, normalizedQuality)
        const blob = await dataUrlToBlob(dataUrl)
        candidates.push({ dataUrl, quality: normalizedQuality, size: blob.size })
    }

    const best = chooseBestCompressionCandidate(candidates, targetLimitBytes)
    if (!best) throw new Error('图片压缩失败')

    const blob = await dataUrlToBlob(best.dataUrl)
    const reachedTarget = blob.size <= targetBytes

    return {
        id: item.id,
        sourceName: item.file.name,
        outputName: '',
        dataUrl: best.dataUrl,
        blob,
        outputSize: blob.size,
        quality: Math.round(best.quality * 100),
        ratio: getCompressionRatio(item.size, blob.size),
        status: reachedTarget ? 'success' : 'warning',
        message: reachedTarget ? undefined : `最低质量仍超过 ${formatBytes(targetBytes)}，已保留同尺寸最小体积结果`,
    }
}

function ImageCompressor() {
    const [imageItems, setImageItems] = useState<ImageItem[]>([])
    const [options, setOptions] = useState<CompressionOptions>(DEFAULT_OPTIONS)
    const [compressedItems, setCompressedItems] = useState<CompressedImage[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [progress, setProgress] = useState(0)
    const [progressLabel, setProgressLabel] = useState('')
    const fileInputRef = useRef<HTMLInputElement>(null)

    const safeOptions = useMemo(() => clampCompressionOptions(options), [options])
    const successCount = useMemo(
        () => compressedItems.filter(item => item.status === 'success' || item.status === 'warning').length,
        [compressedItems],
    )
    const targetBytes = useMemo(() => getTargetBytes(safeOptions.targetSizeMb), [safeOptions.targetSizeMb])

    const resetOutput = useCallback(() => {
        setCompressedItems([])
        setProgress(0)
        setProgressLabel('')
    }, [])

    const handleFilesSelect = useCallback(async (files: FileList | File[]) => {
        const selectedFiles = Array.from(files).filter(isSupportedImageFile)
        if (selectedFiles.length === 0) {
            setError('请选择支持的图片文件')
            return
        }

        setLoading(true)
        setError(null)
        resetOutput()
        setProgressLabel(`正在读取 0 / ${selectedFiles.length} 张图片`)

        const nextItems: ImageItem[] = []
        const errors: string[] = []

        for (let index = 0; index < selectedFiles.length; index += 1) {
            const file = selectedFiles[index]
            setProgressLabel(`正在读取 ${index + 1} / ${selectedFiles.length}: ${file.name}`)

            try {
                const dataUrl = await readFileAsDataUrl(file)
                const image = await loadImage(dataUrl)
                nextItems.push({
                    id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(16).slice(2)}`,
                    file,
                    dataUrl,
                    width: image.naturalWidth || image.width,
                    height: image.naturalHeight || image.height,
                    size: file.size,
                })
            } catch (e) {
                errors.push(`${file.name}: ${e instanceof Error ? e.message : '读取失败'}`)
            }

            setProgress(Math.round(((index + 1) / selectedFiles.length) * 100))
        }

        setImageItems(nextItems)
        setError(errors.length > 0 ? errors.join('；') : null)
        setProgressLabel(nextItems.length > 0 ? `已读取 ${nextItems.length} 张图片` : '')
        setLoading(false)
    }, [resetOutput])

    const handleDrop = useCallback((event: React.DragEvent) => {
        event.preventDefault()
        handleFilesSelect(event.dataTransfer.files)
    }, [handleFilesSelect])

    const handleDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault()
    }, [])

    const handleCompress = useCallback(async () => {
        if (imageItems.length === 0) return

        setLoading(true)
        setError(null)
        setCompressedItems([])
        setProgress(0)
        setProgressLabel(`准备压缩 ${imageItems.length} 张图片`)

        const nextItems: CompressedImage[] = []

        for (let index = 0; index < imageItems.length; index += 1) {
            const item = imageItems[index]
            setProgressLabel(`正在压缩 ${index + 1} / ${imageItems.length}: ${item.file.name}`)

            try {
                const compressed = await compressImage(item, safeOptions)
                compressed.outputName = buildCompressedFileName(
                    item.file.name,
                    safeOptions.format,
                    nextItems.map(output => output.outputName),
                )
                nextItems.push(compressed)
            } catch (e) {
                nextItems.push({
                    id: item.id,
                    sourceName: item.file.name,
                    outputName: buildCompressedFileName(
                        item.file.name,
                        safeOptions.format,
                        nextItems.map(output => output.outputName),
                    ),
                    status: 'error',
                    message: e instanceof Error ? e.message : '压缩失败',
                })
            }

            setCompressedItems([...nextItems])
            setProgress(Math.round(((index + 1) / imageItems.length) * 100))
        }

        const failedCount = nextItems.filter(item => item.status === 'error').length
        setProgressLabel(failedCount > 0
            ? `完成 ${nextItems.length - failedCount} 张，失败 ${failedCount} 张`
            : `已完成 ${nextItems.length} 张图片压缩`)
        setLoading(false)
    }, [imageItems, safeOptions])

    const handleDownload = useCallback((item: CompressedImage) => {
        if (!item.dataUrl) return
        const link = document.createElement('a')
        link.href = item.dataUrl
        link.download = item.outputName
        link.click()
    }, [])

    const handleDownloadAll = useCallback(async () => {
        const downloadableItems = compressedItems.filter(item => item.blob)
        if (downloadableItems.length === 0) return

        setLoading(true)
        setError(null)
        setProgress(0)
        setProgressLabel(`正在打包 0 / ${downloadableItems.length} 张图片`)

        try {
            const zip = new JSZip()
            downloadableItems.forEach((item, index) => {
                if (!item.blob) return
                zip.file(item.outputName, item.blob)
                setProgressLabel(`正在打包 ${index + 1} / ${downloadableItems.length}: ${item.outputName}`)
                setProgress(Math.round(((index + 1) / downloadableItems.length) * 70))
            })

            const blob = await zip.generateAsync({ type: 'blob' }, metadata => {
                setProgress(70 + Math.round(metadata.percent * 0.3))
            })
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = `compressed-images-${Date.now()}.zip`
            link.click()
            URL.revokeObjectURL(url)
            setProgress(100)
            setProgressLabel('图片打包完成')
        } catch (e) {
            setError(e instanceof Error ? e.message : '图片打包失败')
        } finally {
            setLoading(false)
        }
    }, [compressedItems])

    const handleClear = useCallback(() => {
        setImageItems([])
        setCompressedItems([])
        setError(null)
        setProgress(0)
        setProgressLabel('')
        if (fileInputRef.current) fileInputRef.current.value = ''
    }, [])

    const updateOptions = useCallback((partial: Partial<CompressionOptions>) => {
        setOptions(prev => clampCompressionOptions({ ...prev, ...partial }))
        resetOutput()
    }, [resetOutput])

    return (
        <div className="image-compressor">
            <div className="image-compressor-header">
                <h1 className="module-title">图片批量压缩</h1>
                <div className="header-actions">
                    <button className="btn btn-secondary" onClick={handleClear}>
                        <span>🗑️</span>
                        清空
                    </button>
                </div>
            </div>

            <div className="image-compressor-body">
                {imageItems.length === 0 && (
                    <div
                        className="compress-upload-zone"
                        onDrop={handleDrop}
                        onDragOver={handleDragOver}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.svg,.bmp"
                            multiple
                            onChange={(event) => event.target.files && handleFilesSelect(event.target.files)}
                            style={{ display: 'none' }}
                        />
                        <div className="compress-upload-icon">🗜️</div>
                        <div className="compress-upload-text">拖拽一批图片到此处或点击上传</div>
                        <div className="compress-upload-hint">
                            仅调整编码质量，保持原始宽高不变；适合 JPG、PNG、WebP 等常见图片
                        </div>
                    </div>
                )}

                {error && (
                    <div className="compress-error-box">
                        <span>⚠️</span>
                        <span>{error}</span>
                    </div>
                )}

                {imageItems.length > 0 && (
                    <div className="compress-content">
                        <div className="compress-toolbar">
                            <div className="compress-summary">
                                <strong>{imageItems.length}</strong>
                                <span>张图片</span>
                                {successCount > 0 && <span className="compress-success">{successCount} 张已压缩</span>}
                            </div>
                            <div className="compress-actions">
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
                                accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.svg,.bmp"
                                multiple
                                onChange={(event) => event.target.files && handleFilesSelect(event.target.files)}
                                style={{ display: 'none' }}
                            />
                        </div>

                        <section className="panel compress-control-panel">
                            <div className="panel-header">
                                <span className="panel-title">批量压缩设置</span>
                                <span className="format-badge">目标 ≤ {formatBytes(targetBytes)}</span>
                            </div>

                            <div className="compress-control-body">
                                <div className="compress-field">
                                    <label className="compress-label">目标大小上限</label>
                                    <div className="compress-input-row">
                                        <input
                                            type="number"
                                            min="0.1"
                                            max="100"
                                            step="0.1"
                                            value={safeOptions.targetSizeMb}
                                            onChange={(event) => updateOptions({ targetSizeMb: Number(event.target.value) })}
                                        />
                                        <span>MB / 张</span>
                                    </div>
                                </div>

                                <div className="compress-field">
                                    <label className="compress-label">输出格式</label>
                                    <div className="compress-format-buttons">
                                        {(['jpg', 'webp'] as CompressionFormat[]).map(format => (
                                            <button
                                                key={format}
                                                className={`format-btn ${safeOptions.format === format ? 'active' : ''}`}
                                                onClick={() => updateOptions({ format })}
                                            >
                                                {format.toUpperCase()}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="compress-field">
                                    <label className="compress-label">最高质量: {safeOptions.maxQuality}%</label>
                                    <input
                                        className="quality-slider"
                                        type="range"
                                        min="10"
                                        max="100"
                                        value={safeOptions.maxQuality}
                                        onChange={(event) => updateOptions({ maxQuality: Number(event.target.value) })}
                                    />
                                </div>

                                <div className="compress-field">
                                    <label className="compress-label">最低质量: {safeOptions.minQuality}%</label>
                                    <input
                                        className="quality-slider"
                                        type="range"
                                        min="10"
                                        max="95"
                                        value={safeOptions.minQuality}
                                        onChange={(event) => updateOptions({ minQuality: Number(event.target.value) })}
                                    />
                                </div>

                                <button
                                    className="btn btn-primary compress-start-btn"
                                    onClick={handleCompress}
                                    disabled={loading}
                                >
                                    {loading ? '处理中...' : '🗜️ 批量压缩'}
                                </button>
                            </div>

                            {(loading || progress > 0) && (
                                <div className="compress-progress">
                                    <div className="compress-progress-meta">
                                        <span>{progressLabel}</span>
                                        <span>{progress}%</span>
                                    </div>
                                    <div className="compress-progress-track">
                                        <div className="compress-progress-fill" style={{ width: `${progress}%` }} />
                                    </div>
                                </div>
                            )}
                        </section>

                        <div className="compress-grid">
                            {imageItems.map(item => {
                                const compressed = compressedItems.find(output => output.id === item.id)
                                return (
                                    <article className="compress-card" key={item.id}>
                                        <div className="compress-preview">
                                            <img src={compressed?.dataUrl || item.dataUrl} alt={item.file.name} />
                                        </div>
                                        <div className="compress-card-info">
                                            <div className="compress-card-name" title={item.file.name}>
                                                {item.file.name}
                                            </div>
                                            <div className="compress-card-meta">
                                                <span>{item.width} × {item.height}</span>
                                                <span>原图 {formatBytes(item.size)}</span>
                                            </div>

                                            {compressed?.outputSize && (
                                                <div className="compress-result-meta">
                                                    <span>输出 {formatBytes(compressed.outputSize)}</span>
                                                    <span>质量 {compressed.quality}%</span>
                                                    <span>减少 {compressed.ratio}%</span>
                                                </div>
                                            )}

                                            {compressed?.message && (
                                                <div className={`compress-card-message ${compressed.status}`}>
                                                    {compressed.message}
                                                </div>
                                            )}
                                        </div>
                                        <div className="compress-card-footer">
                                            <span className={`format-badge ${compressed?.status === 'success' ? 'success' : ''}`}>
                                                {compressed ? compressed.status === 'error' ? '失败' : safeOptions.format.toUpperCase() : '待压缩'}
                                            </span>
                                            {compressed?.dataUrl && (
                                                <button className="btn btn-secondary" onClick={() => handleDownload(compressed)}>
                                                    下载
                                                </button>
                                            )}
                                        </div>
                                    </article>
                                )
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

export default ImageCompressor
