import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GIFEncoder, applyPalette, quantize } from 'gifenc'
import {
    GifOptions,
    buildGifFileName,
    buildVideoFramePlan,
    clampGifOptions,
    formatVideoDuration,
    formatVideoSize,
} from './utils'
import './styles/index.css'

interface SelectedVideo {
    file: File
    url: string
    name: string
    size: number
    duration: number
    width: number
    height: number
}

interface GifResult {
    url: string
    size: number
    name: string
}

const DEFAULT_OPTIONS: GifOptions = {
    startTime: 0,
    duration: 6,
    fps: 8,
    width: 640,
    quality: 128,
}

const loadVideoMetadata = (url: string): Promise<{ duration: number; width: number; height: number }> => {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video')
        video.preload = 'metadata'
        video.muted = true
        video.onloadedmetadata = () => {
            resolve({
                duration: video.duration,
                width: video.videoWidth,
                height: video.videoHeight,
            })
        }
        video.onerror = () => reject(new Error('无法读取视频信息，请确认文件格式是否受支持'))
        video.src = url
    })
}

const waitForSeek = (video: HTMLVideoElement, time: number) => {
    return new Promise<void>((resolve, reject) => {
        const cleanup = () => {
            video.removeEventListener('seeked', handleSeeked)
            video.removeEventListener('error', handleError)
        }
        const handleSeeked = () => {
            cleanup()
            resolve()
        }
        const handleError = () => {
            cleanup()
            reject(new Error('读取视频帧失败'))
        }

        video.addEventListener('seeked', handleSeeked, { once: true })
        video.addEventListener('error', handleError, { once: true })
        video.currentTime = Math.max(0, time)
    })
}

function VideoToGif() {
    const [selectedVideo, setSelectedVideo] = useState<SelectedVideo | null>(null)
    const [options, setOptions] = useState<GifOptions>(DEFAULT_OPTIONS)
    const [gifResult, setGifResult] = useState<GifResult | null>(null)
    const [loading, setLoading] = useState(false)
    const [progress, setProgress] = useState(0)
    const [progressLabel, setProgressLabel] = useState('')
    const [error, setError] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const videoRef = useRef<HTMLVideoElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)

    const clampedOptions = useMemo(() => {
        return clampGifOptions(options, selectedVideo?.duration || DEFAULT_OPTIONS.duration)
    }, [options, selectedVideo])

    useEffect(() => {
        return () => {
            if (selectedVideo?.url) URL.revokeObjectURL(selectedVideo.url)
            if (gifResult?.url) URL.revokeObjectURL(gifResult.url)
        }
    }, [selectedVideo, gifResult])

    const setOption = useCallback((key: keyof GifOptions, value: number) => {
        setOptions(prev => ({ ...prev, [key]: value }))
        setGifResult(null)
        setError(null)
    }, [])

    const handleFileSelect = useCallback(async (file: File) => {
        if (!file.type.startsWith('video/')) {
            setError('请选择视频文件')
            return
        }

        const url = URL.createObjectURL(file)
        setError(null)
        setGifResult(null)
        setProgress(0)
        setProgressLabel('')

        try {
            const metadata = await loadVideoMetadata(url)
            if (!Number.isFinite(metadata.duration) || metadata.duration <= 0) {
                throw new Error('无法读取视频时长')
            }

            setSelectedVideo(prev => {
                if (prev?.url) URL.revokeObjectURL(prev.url)
                return {
                    file,
                    url,
                    name: file.name,
                    size: file.size,
                    duration: metadata.duration,
                    width: metadata.width,
                    height: metadata.height,
                }
            })
            setOptions(prev => clampGifOptions({
                ...prev,
                duration: Math.min(DEFAULT_OPTIONS.duration, metadata.duration),
                width: Math.min(DEFAULT_OPTIONS.width, metadata.width || DEFAULT_OPTIONS.width),
            }, metadata.duration))
        } catch (e) {
            URL.revokeObjectURL(url)
            setError(e instanceof Error ? e.message : '视频读取失败')
        }
    }, [])

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        const file = e.dataTransfer.files[0]
        if (file) {
            handleFileSelect(file)
        }
    }, [handleFileSelect])

    const handleGenerateGif = useCallback(async () => {
        if (!selectedVideo || !videoRef.current || !canvasRef.current) return

        setLoading(true)
        setError(null)
        setGifResult(prev => {
            if (prev?.url) URL.revokeObjectURL(prev.url)
            return null
        })
        setProgress(0)
        setProgressLabel('准备抽取视频帧')

        try {
            const safeOptions = clampGifOptions(options, selectedVideo.duration)
            const plan = buildVideoFramePlan(safeOptions)
            const video = videoRef.current
            const canvas = canvasRef.current
            const scale = selectedVideo.width > 0 ? safeOptions.width / selectedVideo.width : 1
            const targetWidth = Math.max(1, Math.round(safeOptions.width))
            const targetHeight = Math.max(1, Math.round((selectedVideo.height || safeOptions.width) * scale))
            canvas.width = targetWidth
            canvas.height = targetHeight

            const ctx = canvas.getContext('2d', { willReadFrequently: true })
            if (!ctx) throw new Error('无法初始化画布')

            video.pause()
            const gif = GIFEncoder()

            for (let index = 0; index < plan.times.length; index += 1) {
                const time = plan.times[index]
                setProgressLabel(`抽取第 ${index + 1} / ${plan.frameCount} 帧`)
                await waitForSeek(video, Math.min(time, selectedVideo.duration - 0.05))
                ctx.drawImage(video, 0, 0, targetWidth, targetHeight)
                const frame = ctx.getImageData(0, 0, targetWidth, targetHeight)
                const palette = quantize(frame.data, safeOptions.quality)
                const indexedFrame = applyPalette(frame.data, palette)
                gif.writeFrame(indexedFrame, targetWidth, targetHeight, {
                    palette,
                    delay: plan.delay,
                    repeat: 0,
                })
                setProgress(Math.round(((index + 1) / plan.frameCount) * 95))
            }

            setProgressLabel('正在写入 GIF 文件')
            gif.finish()
            const bytes = gif.bytes()
            const gifBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
            const blob = new Blob([gifBuffer], { type: 'image/gif' })
            const url = URL.createObjectURL(blob)
            setGifResult({
                url,
                size: blob.size,
                name: buildGifFileName(selectedVideo.name),
            })
            setProgress(100)
            setProgressLabel('GIF 已生成')
        } catch (e) {
            setProgress(0)
            setProgressLabel('')
            setError(e instanceof Error ? e.message : 'GIF 生成失败')
        } finally {
            setLoading(false)
        }
    }, [options, selectedVideo])

    const handleDownload = useCallback(() => {
        if (!gifResult) return
        const link = document.createElement('a')
        link.href = gifResult.url
        link.download = gifResult.name
        link.click()
    }, [gifResult])

    const handleClear = useCallback(() => {
        setSelectedVideo(prev => {
            if (prev?.url) URL.revokeObjectURL(prev.url)
            return null
        })
        setGifResult(prev => {
            if (prev?.url) URL.revokeObjectURL(prev.url)
            return null
        })
        setOptions(DEFAULT_OPTIONS)
        setProgress(0)
        setProgressLabel('')
        setError(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }, [])

    return (
        <div className="video-to-gif">
            <div className="video-to-gif-header">
                <h1 className="module-title">视频转 GIF</h1>
                <div className="header-actions">
                    <button className="btn btn-secondary" onClick={handleClear}>
                        <span>清</span>
                        清空
                    </button>
                </div>
            </div>

            <div className="video-to-gif-body">
                <canvas ref={canvasRef} style={{ display: 'none' }} />

                {!selectedVideo && (
                    <section
                        className="video-upload-zone"
                        onDrop={handleDrop}
                        onDragOver={(e) => e.preventDefault()}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="video/*"
                            onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                            style={{ display: 'none' }}
                        />
                        <div className="video-upload-icon">GIF</div>
                        <div className="video-upload-title">拖拽视频到此处或点击上传</div>
                        <div className="video-upload-hint">支持浏览器可播放的视频格式，如 MP4、WebM、MOV</div>
                    </section>
                )}

                {error && (
                    <div className="error-box">
                        <span className="error-icon">警</span>
                        <span>{error}</span>
                    </div>
                )}

                {selectedVideo && (
                    <div className="video-workspace">
                        <section className="video-preview-card">
                            <div className="panel-header">
                                <span className="panel-title">源视频</span>
                                <span className="format-badge">VIDEO</span>
                            </div>
                            <video
                                ref={videoRef}
                                src={selectedVideo.url}
                                className="video-preview"
                                controls
                                muted
                                playsInline
                                preload="auto"
                            />
                            <div className="video-summary">
                                <div className="summary-item">
                                    <span className="summary-label">时长</span>
                                    <span className="summary-value">{formatVideoDuration(selectedVideo.duration)}</span>
                                </div>
                                <div className="summary-item">
                                    <span className="summary-label">尺寸</span>
                                    <span className="summary-value">{selectedVideo.width} × {selectedVideo.height}</span>
                                </div>
                                <div className="summary-item">
                                    <span className="summary-label">大小</span>
                                    <span className="summary-value">{formatVideoSize(selectedVideo.size)}</span>
                                </div>
                            </div>
                        </section>

                        <section className="gif-settings-card">
                            <div className="settings-grid">
                                <label className="setting-field">
                                    <span>开始时间：{clampedOptions.startTime.toFixed(1)} 秒</span>
                                    <input
                                        type="range"
                                        min="0"
                                        max={Math.max(0, selectedVideo.duration - 0.5)}
                                        step="0.1"
                                        value={clampedOptions.startTime}
                                        onChange={(e) => setOption('startTime', Number(e.target.value))}
                                    />
                                </label>
                                <label className="setting-field">
                                    <span>截取时长：{clampedOptions.duration.toFixed(1)} 秒</span>
                                    <input
                                        type="range"
                                        min="0.5"
                                        max={Math.min(12, selectedVideo.duration)}
                                        step="0.5"
                                        value={clampedOptions.duration}
                                        onChange={(e) => setOption('duration', Number(e.target.value))}
                                    />
                                </label>
                                <label className="setting-field">
                                    <span>帧率：{clampedOptions.fps} FPS</span>
                                    <input
                                        type="range"
                                        min="1"
                                        max="15"
                                        step="1"
                                        value={clampedOptions.fps}
                                        onChange={(e) => setOption('fps', Number(e.target.value))}
                                    />
                                </label>
                                <label className="setting-field">
                                    <span>宽度：{clampedOptions.width}px</span>
                                    <input
                                        type="range"
                                        min="120"
                                        max="960"
                                        step="20"
                                        value={clampedOptions.width}
                                        onChange={(e) => setOption('width', Number(e.target.value))}
                                    />
                                </label>
                                <label className="setting-field">
                                    <span>颜色数：{clampedOptions.quality}</span>
                                    <input
                                        type="range"
                                        min="16"
                                        max="256"
                                        step="16"
                                        value={clampedOptions.quality}
                                        onChange={(e) => setOption('quality', Number(e.target.value))}
                                    />
                                </label>
                            </div>

                            <button
                                className="btn btn-primary generate-gif-btn"
                                onClick={handleGenerateGif}
                                disabled={loading}
                            >
                                {loading ? '生成中...' : '生成 GIF'}
                            </button>

                            {(loading || progress > 0) && (
                                <div className="gif-progress">
                                    <div className="gif-progress-meta">
                                        <span>{progressLabel}</span>
                                        <span>{progress}%</span>
                                    </div>
                                    <div className="gif-progress-track">
                                        <div className="gif-progress-fill" style={{ width: `${progress}%` }} />
                                    </div>
                                </div>
                            )}
                        </section>

                        <section className="gif-result-card">
                            <div className="panel-header">
                                <span className="panel-title">GIF 结果</span>
                                {gifResult && <span className="format-badge success">GIF</span>}
                            </div>
                            <div className="gif-result-preview">
                                {gifResult ? (
                                    <img src={gifResult.url} alt="生成的 GIF 预览" className="gif-preview-image" />
                                ) : (
                                    <div className="gif-empty-state">设置参数后点击生成 GIF</div>
                                )}
                            </div>
                            {gifResult && (
                                <div className="gif-result-footer">
                                    <span>{formatVideoSize(gifResult.size)}</span>
                                    <button className="btn btn-primary" onClick={handleDownload}>
                                        下载 GIF
                                    </button>
                                </div>
                            )}
                        </section>
                    </div>
                )}
            </div>
        </div>
    )
}

export default VideoToGif
