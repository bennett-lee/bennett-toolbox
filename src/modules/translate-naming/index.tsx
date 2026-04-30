import { useState, useCallback } from 'react'
import './styles/index.css'

type TranslationDirection = 'zh-to-en' | 'en-to-zh'

// 命名格式类型
type NamingStyle = 'camelCase' | 'PascalCase' | 'snake_case' | 'SCREAMING_SNAKE_CASE' | 'kebab-case' | 'flatcase'

interface NamingResult {
    style: NamingStyle
    label: string
    value: string
    description: string
}

interface TranslationPayload {
    translatedText: string
}

const directionContent: Record<TranslationDirection, {
    toggleLabel: string
    placeholder: string
    buttonLabel: string
    inputHint: string
    emptyText: string
    emptyHint: string
}> = {
    'zh-to-en': {
        toggleLabel: '中 -> 英',
        placeholder: '请输入中文，如：用户信息、获取列表...',
        buttonLabel: '翻译并生成',
        inputHint: '按 Enter 快速翻译 · 在线翻译中文并生成英文变量名',
        emptyText: '输入中文并点击翻译',
        emptyHint: '支持在线翻译并生成常见命名格式',
    },
    'en-to-zh': {
        toggleLabel: '英 -> 中',
        placeholder: '请输入英文，如：user profile、user_status...',
        buttonLabel: '翻译并生成',
        inputHint: '按 Enter 快速翻译 · 在线翻译英文并保留变量命名生成',
        emptyText: '输入英文并点击翻译',
        emptyHint: '支持连字符、下划线和空格等英文输入形式',
    },
}

const normalizeEnglishWords = (text: string): string[] => {
    return text
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .map(word => word.trim().toLowerCase())
        .filter(word => word.length > 0 && !/^\d+$/.test(word))
}

const normalizeTranslatedWords = (text: string): string[] => {
    return text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 0 && !/^\d+$/.test(word))
}

function TranslateNaming() {
    const [direction, setDirection] = useState<TranslationDirection>('zh-to-en')
    const [inputValue, setInputValue] = useState('')
    const [translatedText, setTranslatedText] = useState('')
    const [englishWords, setEnglishWords] = useState<string[]>([])
    const [results, setResults] = useState<NamingResult[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

    const translateText = async (text: string, languagePair: 'zh|en' | 'en|zh'): Promise<TranslationPayload> => {
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${languagePair}`
        const response = await fetch(url)
        const data = await response.json()

        if (data.responseStatus !== 200 || !data.responseData?.translatedText) {
            throw new Error('在线翻译失败，请稍后重试')
        }

        return {
            translatedText: String(data.responseData.translatedText).trim(),
        }
    }

    // 生成各种命名格式
    const generateNamingStyles = (words: string[]): NamingResult[] => {
        if (words.length === 0) return []

        const lowerWords = words.map(w => w.toLowerCase())
        const capitalizedWords = words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())

        return [
            {
                style: 'camelCase',
                label: '小驼峰',
                value: lowerWords[0] + capitalizedWords.slice(1).join(''),
                description: '首字母小写，后续单词首字母大写',
            },
            {
                style: 'PascalCase',
                label: '大驼峰',
                value: capitalizedWords.join(''),
                description: '每个单词首字母大写',
            },
            {
                style: 'snake_case',
                label: '蛇形',
                value: lowerWords.join('_'),
                description: '全小写，下划线分隔',
            },
            {
                style: 'SCREAMING_SNAKE_CASE',
                label: '常量',
                value: lowerWords.join('_').toUpperCase(),
                description: '全大写，下划线分隔',
            },
            {
                style: 'kebab-case',
                label: '短横线',
                value: lowerWords.join('-'),
                description: '全小写，短横线分隔',
            },
            {
                style: 'flatcase',
                label: '全小写',
                value: lowerWords.join(''),
                description: '全部连写，无分隔符',
            },
        ]
    }

    // 处理翻译
    const handleTranslate = useCallback(async () => {
        const text = inputValue.trim()
        if (!text) return

        setLoading(true)
        setError(null)
        setTranslatedText('')
        setCopiedIndex(null)

        try {
            const { translatedText } = await translateText(
                text,
                direction === 'zh-to-en' ? 'zh|en' : 'en|zh',
            )
            const words = direction === 'zh-to-en'
                ? normalizeTranslatedWords(translatedText)
                : normalizeEnglishWords(text)

            setTranslatedText(translatedText)
            setEnglishWords(words)
            setResults(generateNamingStyles(words))
        } catch {
            setError('在线翻译失败，请稍后重试')
            setTranslatedText('')
            setEnglishWords([])
            setResults([])
        } finally {
            setLoading(false)
        }
    }, [direction, inputValue])

    // 处理回车键
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleTranslate()
        }
    }, [handleTranslate])

    // 复制到剪贴板
    const handleCopy = useCallback((text: string, index: number) => {
        navigator.clipboard.writeText(text)
        setCopiedIndex(index)
        setTimeout(() => setCopiedIndex(null), 2000)
    }, [])

    // 清空
    const handleClear = useCallback(() => {
        setInputValue('')
        setTranslatedText('')
        setEnglishWords([])
        setResults([])
        setError(null)
        setCopiedIndex(null)
    }, [])

    const currentContent = directionContent[direction]

    return (
        <div className="translate-naming" data-testid="translate-naming-root-scroll">
            <div className="translate-naming-header">
                <h1 className="module-title">变量命名</h1>
                <div className="header-actions">
                    <button className="btn btn-secondary" onClick={handleClear}>
                        <span>🗑️</span>
                        清空
                    </button>
                </div>
            </div>

            <div className="translate-naming-body" data-testid="translate-naming-scroll">
                {/* 输入区域 */}
                <div className="input-section">
                    <div className="direction-switch" role="group" aria-label="翻译方向">
                        {(['zh-to-en', 'en-to-zh'] as TranslationDirection[]).map((item) => (
                            <button
                                key={item}
                                type="button"
                                className={`direction-btn ${direction === item ? 'active' : ''}`}
                                onClick={() => setDirection(item)}
                            >
                                {directionContent[item].toggleLabel}
                            </button>
                        ))}
                    </div>
                    <div className="input-wrapper">
                        <input
                            type="text"
                            className="translate-input"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={currentContent.placeholder}
                        />
                        <button
                            className="btn btn-primary translate-btn"
                            onClick={handleTranslate}
                            disabled={loading || !inputValue.trim()}
                        >
                            {loading ? (
                                <span className="loading-spinner" />
                            ) : (
                                <>
                                    <span>🔄</span>
                                    {currentContent.buttonLabel}
                                </>
                            )}
                        </button>
                    </div>
                    <div className="input-hint">{currentContent.inputHint}</div>
                </div>

                {/* 错误提示 */}
                {error && (
                    <div className="error-box">
                        <span className="error-icon">⚠️</span>
                        <span>{error}</span>
                    </div>
                )}

                {translatedText && (
                    <div className="translation-card">
                        <div className="section-title">翻译结果</div>
                        <div className="translation-meta">
                            <span className="label">
                                {direction === 'zh-to-en' ? '英文翻译:' : '中文翻译:'}
                            </span>
                            <span className="translation-text">{translatedText}</span>
                        </div>
                    </div>
                )}

                {/* 翻译结果 */}
                {englishWords.length > 0 && (
                    <div className="english-words">
                        <span className="label">
                            {direction === 'zh-to-en' ? '英文拆词:' : '命名拆词:'}
                        </span>
                        <span className="words">{englishWords.join(' ')}</span>
                    </div>
                )}

                {/* 命名格式结果 */}
                {results.length > 0 && (
                    <div className="results-section" data-testid="naming-results-section">
                        <div className="section-title">命名结果</div>
                        <div className="results-scroll" data-testid="naming-results-scroll">
                            <div className="results-grid">
                                {results.map((result, index) => (
                                    <div
                                        key={result.style}
                                        className={`result-card ${copiedIndex === index ? 'copied' : ''}`}
                                        onClick={() => handleCopy(result.value, index)}
                                    >
                                        <div className="result-header">
                                            <span className="result-label">{result.label}</span>
                                            <span className="result-style">{result.style}</span>
                                        </div>
                                        <div className="result-value">{result.value}</div>
                                        <div className="result-description">{result.description}</div>
                                        <div className="copy-hint">
                                            {copiedIndex === index ? '✓ 已复制' : '点击复制'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* 空状态 */}
                {results.length === 0 && !error && !loading && (
                    <div className="empty-state">
                        <div className="empty-icon">Aa</div>
                        <div className="empty-text">{currentContent.emptyText}</div>
                        <div className="empty-hint">{currentContent.emptyHint}</div>
                    </div>
                )}
            </div>
        </div>
    )
}

export default TranslateNaming
