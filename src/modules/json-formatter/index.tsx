import { useState, useCallback } from 'react'
import JsonInput from './components/JsonInput'
import JsonViewer from './components/JsonViewer'
import './styles/index.css'

function JsonFormatter() {
    const [inputValue, setInputValue] = useState('')
    const [parsedJson, setParsedJson] = useState<unknown>(null)
    const [error, setError] = useState<string | null>(null)

    const handleInputChange = useCallback((value: string) => {
        setInputValue(value)

        if (!value.trim()) {
            setParsedJson(null)
            setError(null)
            return
        }

        try {
            const parsed = JSON.parse(value)
            setParsedJson(parsed)
            setError(null)
        } catch (e) {
            setParsedJson(null)
            if (e instanceof SyntaxError) {
                // 提取错误位置信息
                const match = e.message.match(/position (\d+)/)
                const position = match ? parseInt(match[1]) : null

                if (position !== null) {
                    // 计算行号和列号
                    const lines = value.substring(0, position).split('\n')
                    const line = lines.length
                    const column = lines[lines.length - 1].length + 1
                    setError(`JSON 语法错误：第 ${line} 行，第 ${column} 列 - ${e.message}`)
                } else {
                    setError(`JSON 语法错误：${e.message}`)
                }
            } else {
                setError('解析错误')
            }
        }
    }, [])

    const handleClear = useCallback(() => {
        setInputValue('')
        setParsedJson(null)
        setError(null)
    }, [])

    const handleCopy = useCallback(() => {
        if (parsedJson !== null) {
            const formatted = JSON.stringify(parsedJson, null, 2)
            navigator.clipboard.writeText(formatted)
        }
    }, [parsedJson])

    const handleFormat = useCallback(() => {
        if (parsedJson !== null) {
            const formatted = JSON.stringify(parsedJson, null, 2)
            setInputValue(formatted)
        }
    }, [parsedJson])

    const handleCompress = useCallback(() => {
        if (parsedJson !== null) {
            const compressed = JSON.stringify(parsedJson)
            setInputValue(compressed)
        }
    }, [parsedJson])

    return (
        <div className="json-formatter">
            <div className="json-formatter-header">
                <h1 className="module-title">JSON 格式化</h1>
                <div className="header-actions">
                    <button className="btn btn-secondary" onClick={handleClear}>
                        <span>🗑️</span>
                        清空
                    </button>
                    <button
                        className="btn btn-secondary"
                        onClick={handleCompress}
                        disabled={!parsedJson}
                    >
                        <span>📦</span>
                        压缩
                    </button>
                    <button
                        className="btn btn-secondary"
                        onClick={handleFormat}
                        disabled={!parsedJson}
                    >
                        <span>✨</span>
                        格式化
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={handleCopy}
                        disabled={!parsedJson}
                    >
                        <span>📋</span>
                        复制结果
                    </button>
                </div>
            </div>

            <div className="json-formatter-body">
                <div className="panel input-panel">
                    <div className="panel-header">
                        <span className="panel-title">输入 JSON</span>
                        {error && <span className="error-badge">❌ 错误</span>}
                        {parsedJson !== null && <span className="success-badge">✓ 有效</span>}
                    </div>
                    <JsonInput
                        value={inputValue}
                        onChange={handleInputChange}
                        error={error}
                    />
                </div>

                <div className="panel-divider" />

                <div className="panel output-panel">
                    <div className="panel-header">
                        <span className="panel-title">格式化结果</span>
                        {parsedJson !== null && (
                            <span className="info-text">
                                点击节点可折叠/展开
                            </span>
                        )}
                    </div>
                    <JsonViewer data={parsedJson} error={error} />
                </div>
            </div>
        </div>
    )
}

export default JsonFormatter
