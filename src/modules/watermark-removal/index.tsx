import { useCallback, useEffect, useRef, useState } from 'react'
import {
    buildWatermarkRemovalFileName,
    clampInpaintOptions,
    createMaskFromAlpha,
    countMaskedPixels,
    formatImageSize,
    inpaintMaskedPixels,
    InpaintOptions,
    InpaintStats,
} from './utils'
import './styles/index.css'

interface LoadedImage {
    file: File
    dataUrl: string
    width: number
    height: number
    size: number
}

type ToolMode = 'brush' | 'rectangle'

const DEFAULT_OPTIONS: InpaintOptions = {
    radius: 10,
    iterations: 3,
}

const readFileAsDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(new Error('文件读取失败'))
        reader.readAsDataURL(file)
    })
}

const loadImageElement = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('图片加载失败'))
        img.src = src
    })
}

function WatermarkRemoval() {
    const [image, setImage] = useState<LoadedImage | null>(null)
    const [resultUrl, setResultUrl] = useState<string | null>(null)
    const [toolMode, setToolMode] = useState<ToolMode>('brush')
    const [brushSize, setBrushSize] = useState(34)
    const [options, setOptions] = useState<InpaintOptions>(DEFAULT_OPTIONS)
    const [maskPixels, setMaskPixels] = useState(0)
    const [stats, setStats] = useState<InpaintStats | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const imageCanvasRef = useRef<HTMLCanvasElement>(null)
    const maskCanvasRef = useRef<HTMLCanvasElement>(null)
    const isDrawingRef = useRef(false)
    const rectStartRef = useRef<{ x: number; y: number } | null>(null)
    const snapshotRef = useRef<ImageData | null>(null)

    const safeOptions = clampInpaintOptions(options)

    useEffect(() => {
        return () => {
            if (resultUrl) URL.revokeObjectURL(resultUrl)
        }
    }, [resultUrl])

    const refreshMaskCount = useCallback(() => {
        const maskCanvas = maskCanvasRef.current
        if (!maskCanvas) return
        const ctx = maskCanvas.getContext('2d')
        if (!ctx) return
        const imageData = ctx.getImageData(0, 0, maskCanvas.width, maskCanvas.height)
        const mask = createMaskFromAlpha(imageData.data, maskCanvas.width, maskCanvas.height)
        setMaskPixels(countMaskedPixels(mask))
    }, [])

    const drawBaseImage = useCallback(async (loadedImage: LoadedImage) => {
        const imageCanvas = imageCanvasRef.current
        const maskCanvas = maskCanvasRef.current
        if (!imageCanvas || !maskCanvas) return

        const img = await loadImageElement(loadedImage.dataUrl)
        imageCanvas.width = img.width
        imageCanvas.height = img.height
        maskCanvas.width = img.width
        maskCanvas.height = img.height

        const imageCtx = imageCanvas.getContext('2d')
        const maskCtx = maskCanvas.getContext('2d')
        if (!imageCtx || !maskCtx) return

        imageCtx.clearRect(0, 0, img.width, img.height)
        imageCtx.drawImage(img, 0, 0)
        maskCtx.clearRect(0, 0, img.width, img.height)
        setMaskPixels(0)
        setStats(null)
    }, [])

    useEffect(() => {
        if (!image) return
        drawBaseImage(image).catch(e => {
            setError(e instanceof Error ? e.message : '图片渲染失败')
        })
    }, [drawBaseImage, image])

    const handleFileSelect = useCallback(async (file: File) => {
        if (!file.type.startsWith('image/')) {
            setError('请选择图片文件')
            return
        }

        setLoading(true)
        setError(null)
        setResultUrl(prev => {
            if (prev) URL.revokeObjectURL(prev)
            return null
        })

        try {
            const dataUrl = await readFileAsDataUrl(file)
            const img = await loadImageElement(dataUrl)
            setImage({
                file,
                dataUrl,
                width: img.width,
                height: img.height,
                size: file.size,
            })
        } catch (e) {
            setError(e instanceof Error ? e.message : '图片读取失败')
        } finally {
            setLoading(false)
        }
    }, [])

    const getCanvasPoint = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
        const canvas = maskCanvasRef.current
        if (!canvas) return null
        const rect = canvas.getBoundingClientRect()
        return {
            x: ((event.clientX - rect.left) / rect.width) * canvas.width,
            y: ((event.clientY - rect.top) / rect.height) * canvas.height,
        }
    }, [])

    const drawBrushPoint = useCallback((x: number, y: number) => {
        const maskCanvas = maskCanvasRef.current
        const ctx = maskCanvas?.getContext('2d')
        if (!maskCanvas || !ctx) return

        ctx.fillStyle = 'rgba(80, 120, 255, 0.52)'
        ctx.beginPath()
        ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2)
        ctx.fill()
    }, [brushSize])

    const handlePointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
        if (!image || loading) return
        const point = getCanvasPoint(event)
        const maskCanvas = maskCanvasRef.current
        const ctx = maskCanvas?.getContext('2d')
        if (!point || !maskCanvas || !ctx) return

        try {
            event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
            // Synthetic pointer events used by automated screenshots may not own capture.
        }
        setResultUrl(prev => {
            if (prev) URL.revokeObjectURL(prev)
            return null
        })
        setStats(null)
        isDrawingRef.current = true

        if (toolMode === 'rectangle') {
            rectStartRef.current = point
            snapshotRef.current = ctx.getImageData(0, 0, maskCanvas.width, maskCanvas.height)
            return
        }

        drawBrushPoint(point.x, point.y)
        refreshMaskCount()
    }, [drawBrushPoint, getCanvasPoint, image, loading, refreshMaskCount, toolMode])

    const handlePointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
        if (!isDrawingRef.current) return
        const point = getCanvasPoint(event)
        const maskCanvas = maskCanvasRef.current
        const ctx = maskCanvas?.getContext('2d')
        if (!point || !maskCanvas || !ctx) return

        if (toolMode === 'rectangle') {
            const start = rectStartRef.current
            const snapshot = snapshotRef.current
            if (!start || !snapshot) return
            ctx.putImageData(snapshot, 0, 0)
            ctx.fillStyle = 'rgba(80, 120, 255, 0.42)'
            ctx.strokeStyle = 'rgba(160, 185, 255, 0.95)'
            ctx.lineWidth = Math.max(2, maskCanvas.width / 600)
            ctx.fillRect(start.x, start.y, point.x - start.x, point.y - start.y)
            ctx.strokeRect(start.x, start.y, point.x - start.x, point.y - start.y)
            return
        }

        drawBrushPoint(point.x, point.y)
        refreshMaskCount()
    }, [drawBrushPoint, getCanvasPoint, refreshMaskCount, toolMode])

    const finishDrawing = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
        if (!isDrawingRef.current) return
        try {
            event.currentTarget.releasePointerCapture(event.pointerId)
        } catch {
            // Pointer capture can already be gone when the pointer leaves the canvas.
        }
        isDrawingRef.current = false
        rectStartRef.current = null
        snapshotRef.current = null
        refreshMaskCount()
    }, [refreshMaskCount])

    const handleDrop = useCallback((event: React.DragEvent) => {
        event.preventDefault()
        const file = event.dataTransfer.files[0]
        if (file) handleFileSelect(file)
    }, [handleFileSelect])

    const clearMask = useCallback(() => {
        const maskCanvas = maskCanvasRef.current
        const ctx = maskCanvas?.getContext('2d')
        if (!maskCanvas || !ctx) return
        ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height)
        setMaskPixels(0)
        setStats(null)
        setResultUrl(prev => {
            if (prev) URL.revokeObjectURL(prev)
            return null
        })
    }, [])

    const handleClear = useCallback(() => {
        setImage(null)
        setError(null)
        setMaskPixels(0)
        setStats(null)
        setResultUrl(prev => {
            if (prev) URL.revokeObjectURL(prev)
            return null
        })
        if (fileInputRef.current) fileInputRef.current.value = ''
    }, [])

    const handleRemoveWatermark = useCallback(async () => {
        const imageCanvas = imageCanvasRef.current
        const maskCanvas = maskCanvasRef.current
        const imageCtx = imageCanvas?.getContext('2d')
        const maskCtx = maskCanvas?.getContext('2d')
        if (!image || !imageCanvas || !maskCanvas || !imageCtx || !maskCtx) return

        setError(null)
        setLoading(true)

        try {
            const sourceImage = imageCtx.getImageData(0, 0, imageCanvas.width, imageCanvas.height)
            const maskImage = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height)
            const mask = createMaskFromAlpha(maskImage.data, maskCanvas.width, maskCanvas.height)
            const selectedPixels = countMaskedPixels(mask)
            if (selectedPixels === 0) {
                throw new Error('请先涂抹或框选需要去除的水印区域')
            }

            const result = inpaintMaskedPixels(
                sourceImage.data,
                imageCanvas.width,
                imageCanvas.height,
                mask,
                safeOptions,
            )
            const outputCanvas = document.createElement('canvas')
            outputCanvas.width = imageCanvas.width
            outputCanvas.height = imageCanvas.height
            const outputCtx = outputCanvas.getContext('2d')
            if (!outputCtx) throw new Error('无法创建输出画布')

            outputCtx.putImageData(new ImageData(result.data, imageCanvas.width, imageCanvas.height), 0, 0)
            const blob = await new Promise<Blob>((resolve, reject) => {
                outputCanvas.toBlob(nextBlob => {
                    if (nextBlob) resolve(nextBlob)
                    else reject(new Error('结果导出失败'))
                }, 'image/png')
            })
            const nextUrl = URL.createObjectURL(blob)
            setResultUrl(prev => {
                if (prev) URL.revokeObjectURL(prev)
                return nextUrl
            })
            setStats(result.stats)
        } catch (e) {
            setError(e instanceof Error ? e.message : '去水印失败')
        } finally {
            setLoading(false)
        }
    }, [image, safeOptions])

    const handleDownload = useCallback(() => {
        if (!image || !resultUrl) return
        const link = document.createElement('a')
        link.href = resultUrl
        link.download = buildWatermarkRemovalFileName(image.file.name)
        link.click()
    }, [image, resultUrl])

    const setOption = useCallback((key: keyof InpaintOptions, value: number) => {
        setOptions(prev => ({ ...prev, [key]: value }))
        setResultUrl(prev => {
            if (prev) URL.revokeObjectURL(prev)
            return null
        })
        setStats(null)
    }, [])

    return (
        <div className="watermark-removal">
            <div className="watermark-removal-header">
                <h1 className="module-title">图片去水印</h1>
                <div className="header-actions">
                    <button className="btn btn-secondary" onClick={handleClear}>
                        <span>清</span>
                        清空
                    </button>
                </div>
            </div>

            <div className="watermark-removal-body">
                {!image && (
                    <section
                        className="watermark-upload-zone"
                        onDrop={handleDrop}
                        onDragOver={event => event.preventDefault()}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={event => event.target.files?.[0] && handleFileSelect(event.target.files[0])}
                            style={{ display: 'none' }}
                        />
                        <div className="watermark-upload-icon">WM</div>
                        <div className="watermark-upload-title">拖拽图片到此处或点击上传</div>
                        <div className="watermark-upload-hint">框选或涂抹水印区域后生成修复图片</div>
                    </section>
                )}

                {error && (
                    <div className="error-box">
                        <span className="error-icon">警</span>
                        <span>{error}</span>
                    </div>
                )}

                {image && (
                    <div className="watermark-workspace">
                        <section className="watermark-editor-card">
                            <div className="panel-header">
                                <span className="panel-title">原图与遮罩</span>
                                <span className="format-badge">MASK</span>
                            </div>
                            <div className="watermark-canvas-shell">
                                <canvas ref={imageCanvasRef} className="watermark-image-canvas" />
                                <canvas
                                    ref={maskCanvasRef}
                                    className="watermark-mask-canvas"
                                    onPointerDown={handlePointerDown}
                                    onPointerMove={handlePointerMove}
                                    onPointerUp={finishDrawing}
                                    onPointerCancel={finishDrawing}
                                />
                            </div>
                            <div className="watermark-image-info">
                                <div>
                                    <span>尺寸</span>
                                    <strong>{image.width} × {image.height}</strong>
                                </div>
                                <div>
                                    <span>大小</span>
                                    <strong>{formatImageSize(image.size)}</strong>
                                </div>
                                <div>
                                    <span>已选区域</span>
                                    <strong>{maskPixels.toLocaleString()} px</strong>
                                </div>
                            </div>
                        </section>

                        <aside className="watermark-control-card">
                            <div className="tool-mode-switch">
                                <button
                                    className={toolMode === 'brush' ? 'active' : ''}
                                    onClick={() => setToolMode('brush')}
                                >
                                    画笔
                                </button>
                                <button
                                    className={toolMode === 'rectangle' ? 'active' : ''}
                                    onClick={() => setToolMode('rectangle')}
                                >
                                    框选
                                </button>
                            </div>

                            <label className="watermark-setting-field">
                                <span>画笔大小：{brushSize}px</span>
                                <input
                                    type="range"
                                    min="8"
                                    max="120"
                                    step="2"
                                    value={brushSize}
                                    onChange={event => setBrushSize(Number(event.target.value))}
                                />
                            </label>

                            <label className="watermark-setting-field">
                                <span>采样半径：{safeOptions.radius}px</span>
                                <input
                                    type="range"
                                    min="2"
                                    max="24"
                                    value={safeOptions.radius}
                                    onChange={event => setOption('radius', Number(event.target.value))}
                                />
                            </label>

                            <label className="watermark-setting-field">
                                <span>融合次数：{safeOptions.iterations}</span>
                                <input
                                    type="range"
                                    min="1"
                                    max="6"
                                    value={safeOptions.iterations}
                                    onChange={event => setOption('iterations', Number(event.target.value))}
                                />
                            </label>

                            <div className="watermark-actions">
                                <button className="btn btn-secondary" onClick={clearMask} disabled={loading}>
                                    清除遮罩
                                </button>
                                <button className="btn btn-primary" onClick={handleRemoveWatermark} disabled={loading}>
                                    {loading ? '处理中...' : '去除水印'}
                                </button>
                            </div>
                        </aside>

                        <section className="watermark-result-card">
                            <div className="panel-header">
                                <span className="panel-title">处理结果</span>
                                {resultUrl && <span className="format-badge success">PNG</span>}
                            </div>
                            <div className="watermark-result-preview">
                                {resultUrl ? (
                                    <img src={resultUrl} alt="去水印结果" />
                                ) : (
                                    <div className="watermark-empty-result">生成后在这里预览结果</div>
                                )}
                            </div>
                            {stats && (
                                <div className="watermark-result-meta">
                                    <span>处理像素：{stats.filledPixels.toLocaleString()}</span>
                                    <span>遮罩像素：{stats.maskedPixels.toLocaleString()}</span>
                                </div>
                            )}
                            {resultUrl && (
                                <button className="btn btn-primary watermark-download-btn" onClick={handleDownload}>
                                    下载图片
                                </button>
                            )}
                        </section>
                    </div>
                )}
            </div>
        </div>
    )
}

export default WatermarkRemoval
