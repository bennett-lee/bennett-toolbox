import { useState, useCallback, useEffect } from 'react'
import './styles/index.css'

// 简单的颜色转换工具
const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null
}

const rgbToHsl = (r: number, g: number, b: number) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0; // achromatic
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }

    return {
        h: Math.round(h * 360),
        s: Math.round(s * 100),
        l: Math.round(l * 100)
    };
}

interface ColorRecord {
    id: string
    hex: string
    rgb: string
    hsl: string
    time: Date
}

function ColorPicker() {
    const [color, setColor] = useState({ hex: '#5078FF', rgb: 'rgb(80, 120, 255)', hsl: 'hsl(226, 100%, 66%)' })
    const [history, setHistory] = useState<ColorRecord[]>([])
    const [isPicking, setIsPicking] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // 加载历史记录
    useEffect(() => {
        try {
            const saved = localStorage.getItem('bennett-color-history')
            if (saved) {
                const parsed = JSON.parse(saved)
                setHistory(parsed.map((item: any) => ({ ...item, time: new Date(item.time) })))
            }
        } catch (e) {
            console.error('Failed to load history', e)
        }
    }, [])

    // 保存历史记录
    const saveHistory = useCallback((newHistory: ColorRecord[]) => {
        setHistory(newHistory)
        localStorage.setItem('bennett-color-history', JSON.stringify(newHistory))
    }, [])

    // 添加到历史
    const addToHistory = useCallback((hex: string, rgb: string, hsl: string) => {
        const newItem: ColorRecord = {
            id: Date.now().toString(),
            hex,
            rgb,
            hsl,
            time: new Date()
        }

        // 避免重复连续添加
        setHistory(prev => {
            if (prev.length > 0 && prev[0].hex === hex) return prev
            const newHistory = [newItem, ...prev].slice(0, 50) // 保留最近50条
            saveHistory(newHistory)
            return newHistory
        })
    }, [saveHistory])

    // 处理取色
    const handlePickColor = async () => {
        if (!window.EyeDropper) {
            setError('您的浏览器版本不支持原生取色器')
            return
        }

        setIsPicking(true)
        setError(null)

        try {
            const eyeDropper = new window.EyeDropper()
            const result = await eyeDropper.open()
            const hex = result.sRGBHex

            // 转换颜色
            const rgbObj = hexToRgb(hex)
            if (rgbObj) {
                const rgb = `rgb(${rgbObj.r}, ${rgbObj.g}, ${rgbObj.b})`
                const hslObj = rgbToHsl(rgbObj.r, rgbObj.g, rgbObj.b)
                const hsl = `hsl(${hslObj.h}, ${hslObj.s}%, ${hslObj.l}%)`

                setColor({ hex, rgb, hsl })
                addToHistory(hex, rgb, hsl)
            }
        } catch (e: any) {
            // 用户取消也会抛出错误，忽略即可
            console.log('Pick cancelled or failed', e)
        } finally {
            setIsPicking(false)
        }
    }

    // 复制到剪贴板
    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text)
        // 可以在这里加一个简单的Toast提示，为了保持简洁先省略
    }

    // 清空历史
    const clearHistory = () => {
        setHistory([])
        localStorage.removeItem('bennett-color-history')
    }

    // 选择历史颜色
    const selectHistoryColor = (item: ColorRecord) => {
        setColor({ hex: item.hex, rgb: item.rgb, hsl: item.hsl })
    }

    return (
        <div className="color-picker-module">
            <div className="picker-header">
                <h1 className="module-title">🎨 屏幕取色器</h1>
            </div>

            <div className="main-panel">
                {/* 左侧展示 */}
                <div className="color-display">
                    <div
                        className="color-preview"
                        style={{ backgroundColor: color.hex }}
                    >
                        <button
                            className="pick-btn-overlay"
                            onClick={handlePickColor}
                            disabled={isPicking}
                        >
                            {isPicking ? '正在取色...' : '🍭 点击开始吸取颜色'}
                        </button>
                    </div>

                    <div className="color-preview-info">
                        <div className="color-value-large">{color.hex.toUpperCase()}</div>

                        <div className="formats-list">
                            <FormatRow label="HEX" value={color.hex.toUpperCase()} onCopy={copyToClipboard} />
                            <FormatRow label="RGB" value={color.rgb} onCopy={copyToClipboard} />
                            <FormatRow label="HSL" value={color.hsl} onCopy={copyToClipboard} />
                            <FormatRow label="CSS" value={`background-color: ${color.hex};`} onCopy={copyToClipboard} />
                        </div>
                    </div>
                </div>

                {/* 右侧历史 */}
                <div className="history-panel">
                    <div className="history-header">
                        <span className="history-title">历史记录</span>
                        {history.length > 0 && (
                            <button className="btn btn-text btn-sm" onClick={clearHistory}>
                                清空
                            </button>
                        )}
                    </div>
                    <div className="history-list">
                        {history.length === 0 ? (
                            <div className="empty-history">暂无历史记录</div>
                        ) : (
                            history.map(item => (
                                <div
                                    key={item.id}
                                    className="history-item"
                                    onClick={() => selectHistoryColor(item)}
                                >
                                    <div
                                        className="history-color-preview"
                                        style={{ backgroundColor: item.hex }}
                                    />
                                    <div className="history-info">
                                        <div className="history-hex">{item.hex.toUpperCase()}</div>
                                        <div className="history-time">
                                            {item.time.toLocaleTimeString()}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {error && (
                <div className="error-message" style={{ color: '#ff5f56', marginTop: 10 }}>
                    ⚠️ {error}
                </div>
            )}
        </div>
    )
}

function FormatRow({ label, value, onCopy }: { label: string, value: string, onCopy: (v: string) => void }) {
    const [copied, setCopied] = useState(false)

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation()
        onCopy(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <div className="format-item">
            <span className="format-label">{label}</span>
            <span className="format-value">{value}</span>
            <div
                className="copy-btn-icon"
                onClick={handleCopy}
                title="复制"
            >
                {copied ? '✅' : '📋'}
            </div>
        </div>
    )
}

// 补充 EyeDropper 类型定义
declare global {
    interface Window {
        EyeDropper: any
    }
}

export default ColorPicker
