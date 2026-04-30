import { useState, useCallback, useMemo } from 'react'
import './JsonViewer.css'

interface JsonViewerProps {
    data: unknown
    error: string | null
}

function JsonViewer({ data, error }: JsonViewerProps) {
    if (error) {
        return (
            <div className="json-viewer-empty">
                <div className="empty-icon">📋</div>
                <div className="empty-text">请输入有效的 JSON 字符串</div>
            </div>
        )
    }

    if (data === null || data === undefined) {
        return (
            <div className="json-viewer-empty">
                <div className="empty-icon">{ }</div>
                <div className="empty-text">在左侧粘贴 JSON 数据</div>
                <div className="empty-hint">格式化结果将在此显示</div>
            </div>
        )
    }

    return (
        <div className="json-viewer">
            <JsonNode value={data} isRoot />
        </div>
    )
}

interface JsonNodeProps {
    value: unknown
    keyName?: string
    isRoot?: boolean
    isLast?: boolean
}

function JsonNode({ value, keyName, isRoot = false, isLast = true }: JsonNodeProps) {
    const [collapsed, setCollapsed] = useState(false)

    const toggleCollapsed = useCallback(() => {
        setCollapsed((prev) => !prev)
    }, [])

    const { type, preview, childCount } = useMemo(() => {
        if (value === null) {
            return { type: 'null' as const, preview: null, childCount: 0 }
        }
        if (Array.isArray(value)) {
            return {
                type: 'array' as const,
                preview: `[${value.length} 项]`,
                childCount: value.length
            }
        }
        if (typeof value === 'object') {
            const keys = Object.keys(value as object)
            return {
                type: 'object' as const,
                preview: `{${keys.length} 项}`,
                childCount: keys.length
            }
        }
        return { type: typeof value as 'string' | 'number' | 'boolean', preview: null, childCount: 0 }
    }, [value])

    const isExpandable = type === 'object' || type === 'array'
    const isEmpty = childCount === 0

    // 渲染键名
    const renderKey = () => {
        if (keyName === undefined) return null
        return (
            <>
                <span className="json-key">"{keyName}"</span>
                <span className="json-colon">: </span>
            </>
        )
    }

    // 渲染原始值
    const renderPrimitive = () => {
        const comma = isLast ? '' : ','

        if (value === null) {
            return (
                <span className="json-line">
                    {renderKey()}
                    <span className="json-null">null</span>
                    <span className="json-comma">{comma}</span>
                </span>
            )
        }

        if (typeof value === 'string') {
            return (
                <span className="json-line">
                    {renderKey()}
                    <span className="json-string">"{escapeString(value)}"</span>
                    <span className="json-comma">{comma}</span>
                </span>
            )
        }

        if (typeof value === 'number') {
            return (
                <span className="json-line">
                    {renderKey()}
                    <span className="json-number">{String(value)}</span>
                    <span className="json-comma">{comma}</span>
                </span>
            )
        }

        if (typeof value === 'boolean') {
            return (
                <span className="json-line">
                    {renderKey()}
                    <span className="json-boolean">{String(value)}</span>
                    <span className="json-comma">{comma}</span>
                </span>
            )
        }

        return null
    }

    // 如果不是可展开的类型，直接渲染原始值
    if (!isExpandable) {
        return <div className="json-node">{renderPrimitive()}</div>
    }

    const openBracket = type === 'array' ? '[' : '{'
    const closeBracket = type === 'array' ? ']' : '}'
    const comma = isLast ? '' : ','

    // 空数组或空对象
    if (isEmpty) {
        return (
            <div className="json-node">
                <span className="json-line">
                    {renderKey()}
                    <span className="json-bracket">{openBracket}{closeBracket}</span>
                    <span className="json-comma">{comma}</span>
                </span>
            </div>
        )
    }

    const children = type === 'array'
        ? (value as unknown[])
        : Object.entries(value as object)

    return (
        <div className={`json-node ${isRoot ? 'is-root' : ''}`}>
            <div
                className={`json-line expandable ${collapsed ? 'collapsed' : ''}`}
                onClick={toggleCollapsed}
            >
                <span className="expand-icon">{collapsed ? '▶' : '▼'}</span>
                {renderKey()}
                <span className="json-bracket">{openBracket}</span>
                {collapsed && (
                    <>
                        <span className="json-preview">{preview}</span>
                        <span className="json-bracket">{closeBracket}</span>
                        <span className="json-comma">{comma}</span>
                    </>
                )}
            </div>

            {!collapsed && (
                <>
                    <div className="json-children">
                        {type === 'array' ? (
                            (children as unknown[]).map((item, index) => (
                                <JsonNode
                                    key={index}
                                    value={item}
                                    isLast={index === children.length - 1}
                                />
                            ))
                        ) : (
                            (children as [string, unknown][]).map(([key, val], index) => (
                                <JsonNode
                                    key={key}
                                    keyName={key}
                                    value={val}
                                    isLast={index === children.length - 1}
                                />
                            ))
                        )}
                    </div>
                    <div className="json-line">
                        <span className="json-bracket">{closeBracket}</span>
                        <span className="json-comma">{comma}</span>
                    </div>
                </>
            )}
        </div>
    )
}

// 转义字符串中的特殊字符
function escapeString(str: string): string {
    return str
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t')
}

export default JsonViewer
