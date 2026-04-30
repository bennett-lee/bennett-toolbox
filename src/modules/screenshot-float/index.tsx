import { useState, useCallback, useRef, useEffect } from 'react'
import './styles/index.css'

// 检测是否在 Electron 环境中
const isElectron = typeof window !== 'undefined' && typeof window.require === 'function'

// Electron 模块（仅在 Electron 环境中可用）
const electron = isElectron ? window.require('electron') : null
const ipcRenderer = electron?.ipcRenderer
const nativeImage = electron?.nativeImage

interface Screenshot {
    id: string
    dataUrl: string
    timestamp: Date
    width: number
    height: number
}

// 屏幕源接口（从主进程返回的序列化格式）
interface DesktopCapturerSource {
    id: string
    name: string
    thumbnail: string  // 已转换为 DataURL
    appIcon: string | null
}

function ScreenshotFloat() {
    const [screenshots, setScreenshots] = useState<Screenshot[]>([])
    const [capturing, setCapturing] = useState(false)
    const [selectedSource, setSelectedSource] = useState<string>('')
    const [sources, setSources] = useState<DesktopCapturerSource[]>([])
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [cropMode, setCropMode] = useState(false)
    const [cropStart, setCropStart] = useState<{ x: number; y: number } | null>(null)
    const [cropEnd, setCropEnd] = useState<{ x: number; y: number } | null>(null)
    const [permissionStatus, setPermissionStatus] = useState<string>('unknown')
    const [error, setError] = useState<string | null>(null)
    const previewRef = useRef<HTMLImageElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    // 如果不在 Electron 环境，显示提示
    if (!isElectron) {
        return (
            <div className="screenshot-float">
                <div className="screenshot-float-header">
                    <h1 className="module-title">截图悬浮</h1>
                </div>
                <div className="screenshot-float-body">
                    <div className="empty-state">
                        <div className="empty-icon">⚡</div>
                        <div className="empty-text">此功能需要在 Electron 应用中运行</div>
                        <div className="empty-hint">
                            请运行 <code>npm run electron:dev</code> 或打开打包后的桌面应用
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    // 检查屏幕录制权限
    const checkPermission = useCallback(async () => {
        try {
            const status = await ipcRenderer.invoke('check-screen-permission')
            setPermissionStatus(status)
            return status === 'granted'
        } catch (e) {
            console.error('检查权限失败:', e)
            return false
        }
    }, [])

    // 获取可用的屏幕源（通过 IPC 从主进程获取）
    const refreshSources = useCallback(async () => {
        setError(null)
        try {
            // 先检查权限
            await checkPermission()

            // 通过 IPC 获取屏幕源
            const availableSources = await ipcRenderer.invoke('get-desktop-sources')

            if (availableSources.length === 0) {
                setError('未找到可用的屏幕源。请确保已授予屏幕录制权限。')
            } else {
                setSources(availableSources)
                if (!selectedSource && availableSources.length > 0) {
                    setSelectedSource(availableSources[0].id)
                }
            }
        } catch (e) {
            console.error('获取屏幕源失败:', e)
            setError('获取屏幕源失败，请检查权限设置。')
        }
    }, [selectedSource, checkPermission])

    // 初始化时获取源
    useEffect(() => {
        refreshSources()

        // 监听框选截图结果
        const handleCaptureResult = (_: any, result: { success: boolean; dataUrl: string; width: number; height: number }) => {
            if (result.success) {
                const screenshot: Screenshot = {
                    id: Date.now().toString(),
                    dataUrl: result.dataUrl,
                    timestamp: new Date(),
                    width: result.width,
                    height: result.height,
                }
                setScreenshots(prev => [screenshot, ...prev])
            }
        }

        ipcRenderer.on('capture-result', handleCaptureResult)

        return () => {
            ipcRenderer.removeListener('capture-result', handleCaptureResult)
        }
    }, []) // 只在挂载时执行一次

    // 框选截图
    const startCaptureSelection = useCallback(async () => {
        setError(null)
        try {
            const result = await ipcRenderer.invoke('start-capture-selection')
            if (!result.success) {
                setError(result.error || '框选截图失败')
            }
        } catch (e: any) {
            console.error('框选截图失败:', e)
            setError(`框选截图失败: ${e.message || '未知错误'}`)
        }
    }, [])

    // 截取屏幕
    const captureScreen = useCallback(async () => {
        if (!selectedSource) {
            setError('请先选择一个截图源')
            return
        }

        setCapturing(true)
        setError(null)

        try {
            const source = sources.find(s => s.id === selectedSource)
            if (!source) {
                setError('未找到选定的截图源')
                return
            }

            // 使用 getUserMedia 获取屏幕流
            const stream = await (navigator.mediaDevices as any).getUserMedia({
                audio: false,
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: source.id,
                    },
                },
            })

            // 创建视频元素来获取帧
            const video = document.createElement('video')
            video.srcObject = stream
            await video.play()

            // 等待视频加载
            await new Promise(resolve => setTimeout(resolve, 100))

            // 创建 canvas 并绘制
            const canvas = document.createElement('canvas')
            canvas.width = video.videoWidth
            canvas.height = video.videoHeight
            const ctx = canvas.getContext('2d')!
            ctx.drawImage(video, 0, 0)

            // 停止流
            stream.getTracks().forEach((track: MediaStreamTrack) => track.stop())

            // 获取图像数据
            const dataUrl = canvas.toDataURL('image/png')
            setPreviewUrl(dataUrl)
            setCropMode(true)
        } catch (e: any) {
            console.error('截图失败:', e)
            if (e.name === 'NotAllowedError') {
                setError('屏幕录制权限被拒绝。请在 系统偏好设置 > 安全性与隐私 > 隐私 > 屏幕录制 中授予权限。')
            } else {
                setError(`截图失败: ${e.message || '未知错误'}`)
            }
        } finally {
            setCapturing(false)
        }
    }, [selectedSource, sources])

    // 处理裁剪开始
    const handleCropStart = useCallback((e: React.MouseEvent) => {
        if (!cropMode || !previewRef.current) return

        const rect = previewRef.current.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top
        setCropStart({ x, y })
        setCropEnd({ x, y })
    }, [cropMode])

    // 处理裁剪移动
    const handleCropMove = useCallback((e: React.MouseEvent) => {
        if (!cropStart || !previewRef.current) return

        const rect = previewRef.current.getBoundingClientRect()
        const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
        const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height))
        setCropEnd({ x, y })
    }, [cropStart])

    // 处理裁剪结束
    const handleCropEnd = useCallback(() => {
        if (!cropStart || !cropEnd || !previewUrl || !previewRef.current) {
            setCropStart(null)
            setCropEnd(null)
            return
        }

        const rect = previewRef.current.getBoundingClientRect()
        const img = previewRef.current

        // 计算实际坐标（考虑图像缩放）
        const scaleX = img.naturalWidth / rect.width
        const scaleY = img.naturalHeight / rect.height

        const x1 = Math.min(cropStart.x, cropEnd.x) * scaleX
        const y1 = Math.min(cropStart.y, cropEnd.y) * scaleY
        const x2 = Math.max(cropStart.x, cropEnd.x) * scaleX
        const y2 = Math.max(cropStart.y, cropEnd.y) * scaleY

        const width = x2 - x1
        const height = y2 - y1

        // 如果选区太小，取消裁剪
        if (width < 10 || height < 10) {
            setCropStart(null)
            setCropEnd(null)
            return
        }

        // 创建裁剪后的图像
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')!

        const tempImg = new Image()
        tempImg.onload = () => {
            ctx.drawImage(tempImg, x1, y1, width, height, 0, 0, width, height)
            const croppedDataUrl = canvas.toDataURL('image/png')

            // 添加到截图列表
            const screenshot: Screenshot = {
                id: Date.now().toString(),
                dataUrl: croppedDataUrl,
                timestamp: new Date(),
                width,
                height,
            }
            setScreenshots(prev => [screenshot, ...prev])

            // 重置状态
            setPreviewUrl(null)
            setCropMode(false)
            setCropStart(null)
            setCropEnd(null)
        }
        tempImg.src = previewUrl
    }, [cropStart, cropEnd, previewUrl])

    // 取消裁剪
    const handleCancelCrop = useCallback(() => {
        setPreviewUrl(null)
        setCropMode(false)
        setCropStart(null)
        setCropEnd(null)
    }, [])

    // 创建悬浮窗口
    const createFloatingWindow = useCallback((screenshot: Screenshot) => {
        // 通过 IPC 通知主进程创建悬浮窗口
        ipcRenderer.invoke('create-floating-window', {
            id: screenshot.id,
            dataUrl: screenshot.dataUrl,
            width: Math.min(screenshot.width, 400),
            height: Math.min(screenshot.height, 300),
        })
    }, [])

    // 删除截图
    const deleteScreenshot = useCallback((id: string) => {
        setScreenshots(prev => prev.filter(s => s.id !== id))
    }, [])

    // 复制截图到剪贴板
    const copyToClipboard = useCallback(async (dataUrl: string) => {
        try {
            const img = nativeImage.createFromDataURL(dataUrl)
            const { clipboard } = electron
            clipboard.writeImage(img)
        } catch (e) {
            console.error('复制失败:', e)
        }
    }, [])

    // 下载截图
    const downloadScreenshot = useCallback((screenshot: Screenshot) => {
        const link = document.createElement('a')
        link.download = `screenshot-${screenshot.id}.png`
        link.href = screenshot.dataUrl
        link.click()
    }, [])

    // 获取裁剪区域样式
    const getCropStyle = () => {
        if (!cropStart || !cropEnd) return {}

        const x1 = Math.min(cropStart.x, cropEnd.x)
        const y1 = Math.min(cropStart.y, cropEnd.y)
        const x2 = Math.max(cropStart.x, cropEnd.x)
        const y2 = Math.max(cropStart.y, cropEnd.y)

        return {
            left: x1,
            top: y1,
            width: x2 - x1,
            height: y2 - y1,
        }
    }

    return (
        <div className="screenshot-float">
            <div className="screenshot-float-header">
                <h1 className="module-title">截图悬浮</h1>
                <div className="header-actions">
                    <button className="btn btn-secondary" onClick={refreshSources}>
                        🔄 刷新源
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={startCaptureSelection}
                    >
                        ✂️ 框选截图
                    </button>
                    <button
                        className="btn btn-secondary"
                        onClick={captureScreen}
                        disabled={capturing || !selectedSource}
                    >
                        {capturing ? '截取中...' : '📷 截取整屏'}
                    </button>
                </div>
            </div>

            <div className="screenshot-float-body" ref={containerRef}>
                {/* 权限状态 */}
                {permissionStatus !== 'granted' && permissionStatus !== 'unknown' && (
                    <div className="permission-warning">
                        <span className="warning-icon">⚠️</span>
                        <span>屏幕录制权限状态: {permissionStatus}。请在 系统偏好设置 &gt; 安全性与隐私 &gt; 隐私 &gt; 屏幕录制 中授予权限。</span>
                    </div>
                )}

                {/* 错误提示 */}
                {error && (
                    <div className="error-box">
                        <span className="error-icon">❌</span>
                        <span>{error}</span>
                    </div>
                )}

                {/* 源选择 */}
                <div className="source-selector">
                    <label className="selector-label">选择截图源：{sources.length === 0 && '(点击刷新按钮获取)'}</label>
                    <div className="source-list">
                        {sources.length === 0 && (
                            <div className="no-sources">
                                <span>未找到可用的屏幕源</span>
                                <button className="btn btn-secondary btn-sm" onClick={refreshSources}>🔄 刷新</button>
                            </div>
                        )}
                        {sources.map(source => (
                            <div
                                key={source.id}
                                className={`source-item ${selectedSource === source.id ? 'active' : ''}`}
                                onClick={() => setSelectedSource(source.id)}
                            >
                                <img
                                    src={source.thumbnail}
                                    alt={source.name}
                                    className="source-thumbnail"
                                />
                                <span className="source-name">{source.name}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 裁剪预览 */}
                {cropMode && previewUrl && (
                    <div className="crop-overlay">
                        <div className="crop-container">
                            <div className="crop-header">
                                <span>拖拽选择截图区域</span>
                                <button className="btn btn-secondary btn-sm" onClick={handleCancelCrop}>
                                    取消
                                </button>
                            </div>
                            <div
                                className="crop-preview-wrapper"
                                onMouseDown={handleCropStart}
                                onMouseMove={handleCropMove}
                                onMouseUp={handleCropEnd}
                                onMouseLeave={() => cropStart && handleCropEnd()}
                            >
                                <img
                                    ref={previewRef}
                                    src={previewUrl}
                                    alt="预览"
                                    className="crop-preview-image"
                                    draggable={false}
                                />
                                {cropStart && cropEnd && (
                                    <div className="crop-selection" style={getCropStyle()}>
                                        <div className="crop-size">
                                            {Math.abs(cropEnd.x - cropStart.x).toFixed(0)} × {Math.abs(cropEnd.y - cropStart.y).toFixed(0)}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* 截图列表 */}
                {screenshots.length > 0 && (
                    <div className="screenshots-section">
                        <h3 className="section-title">已截图 ({screenshots.length})</h3>
                        <div className="screenshots-grid">
                            {screenshots.map(screenshot => (
                                <div key={screenshot.id} className="screenshot-card">
                                    <img
                                        src={screenshot.dataUrl}
                                        alt="截图"
                                        className="screenshot-image"
                                    />
                                    <div className="screenshot-info">
                                        <span className="screenshot-size">
                                            {screenshot.width} × {screenshot.height}
                                        </span>
                                        <span className="screenshot-time">
                                            {screenshot.timestamp.toLocaleTimeString()}
                                        </span>
                                    </div>
                                    <div className="screenshot-actions">
                                        <button
                                            className="action-btn"
                                            onClick={() => createFloatingWindow(screenshot)}
                                            title="创建悬浮窗"
                                        >
                                            📌
                                        </button>
                                        <button
                                            className="action-btn"
                                            onClick={() => copyToClipboard(screenshot.dataUrl)}
                                            title="复制到剪贴板"
                                        >
                                            📋
                                        </button>
                                        <button
                                            className="action-btn"
                                            onClick={() => downloadScreenshot(screenshot)}
                                            title="下载"
                                        >
                                            💾
                                        </button>
                                        <button
                                            className="action-btn danger"
                                            onClick={() => deleteScreenshot(screenshot.id)}
                                            title="删除"
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* 空状态 */}
                {screenshots.length === 0 && !cropMode && (
                    <div className="empty-state">
                        <div className="empty-icon">📷</div>
                        <div className="empty-text">点击截取屏幕开始</div>
                        <div className="empty-hint">
                            截图后可以创建悬浮窗口，方便参考
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

export default ScreenshotFloat
