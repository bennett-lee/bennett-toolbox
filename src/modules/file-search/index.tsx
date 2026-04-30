import { useState, useCallback, useRef, useEffect } from 'react'
import './styles/index.css'

// 检测是否在 Electron 环境中
const isElectron = typeof window !== 'undefined' && typeof window.require === 'function'

// 使用 Electron 的 Node.js 集成（仅在 Electron 环境中可用）
const fs = isElectron ? window.require('fs') : null
const path = isElectron ? window.require('path') : null
const os = isElectron ? window.require('os') : null
const electron = isElectron ? window.require('electron') : null
const shell = electron?.shell
const ipcRenderer = electron?.ipcRenderer

interface FileResult {
    name: string
    path: string
    isDirectory: boolean
    size: number
    modifiedTime: Date
    extension: string
}

interface SearchState {
    searching: boolean
    progress: string
    results: FileResult[]
    totalScanned: number
    error: string | null
}

function FileSearch() {
    // 如果不在 Electron 环境，显示提示
    if (!isElectron) {
        return (
            <div className="file-search">
                <div className="file-search-header">
                    <h1 className="module-title">文件搜索</h1>
                </div>
                <div className="file-search-body">
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

    const [searchQuery, setSearchQuery] = useState('')
    const [searchPath, setSearchPath] = useState(os.homedir())
    const [maxDepth, setMaxDepth] = useState(5)
    const [searchState, setSearchState] = useState<SearchState>({
        searching: false,
        progress: '',
        results: [],
        totalScanned: 0,
        error: null,
    })
    const [sortBy, setSortBy] = useState<'name' | 'size' | 'date'>('name')
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
    const abortRef = useRef(false)
    const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // 格式化文件大小
    const formatSize = (bytes: number): string => {
        if (bytes === 0) return '-'
        if (bytes < 1024) return bytes + ' B'
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
        if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
        return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
    }

    // 格式化日期
    const formatDate = (date: Date): string => {
        return date.toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        })
    }

    // 获取文件图标
    const getFileIcon = (result: FileResult): string => {
        if (result.isDirectory) return '📁'
        const ext = result.extension.toLowerCase()
        const iconMap: Record<string, string> = {
            // 图片
            jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', svg: '🖼️', webp: '🖼️', ico: '🖼️',
            // 文档
            pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊', ppt: '📽️', pptx: '📽️',
            txt: '📄', md: '📝', json: '📋', xml: '📋', csv: '📊',
            // 代码
            js: '💛', ts: '💙', jsx: '💛', tsx: '💙', vue: '💚', py: '🐍', java: '☕',
            html: '🌐', css: '🎨', scss: '🎨', less: '🎨',
            go: '🐹', rs: '🦀', rb: '💎', php: '🐘', swift: '🍎', kt: '🟣',
            // 压缩包
            zip: '📦', rar: '📦', '7z': '📦', tar: '📦', gz: '📦',
            // 可执行
            exe: '⚙️', app: '⚙️', dmg: '💿', pkg: '📦',
            // 媒体
            mp3: '🎵', wav: '🎵', flac: '🎵', aac: '🎵',
            mp4: '🎬', avi: '🎬', mkv: '🎬', mov: '🎬', wmv: '🎬',
            // 其他
            sh: '⚡', bat: '⚡', ps1: '⚡',
        }
        return iconMap[ext] || '📄'
    }

    // 搜索文件
    const searchFiles = useCallback(async () => {
        const query = searchQuery.trim().toLowerCase()
        if (!query) {
            setSearchState(prev => ({ ...prev, results: [], totalScanned: 0 }))
            return
        }

        abortRef.current = false
        setSearchState({
            searching: true,
            progress: '正在搜索...',
            results: [],
            totalScanned: 0,
            error: null,
        })

        const results: FileResult[] = []
        let scanned = 0
        const maxResults = 500

        const searchDir = async (dirPath: string, depth: number) => {
            if (abortRef.current || depth > maxDepth || results.length >= maxResults) return

            try {
                const entries = fs.readdirSync(dirPath, { withFileTypes: true })

                for (const entry of entries) {
                    if (abortRef.current || results.length >= maxResults) break

                    // 跳过隐藏文件和系统目录
                    if (entry.name.startsWith('.')) continue
                    if (['node_modules', 'Library', 'System', '$Recycle.Bin', 'Windows'].includes(entry.name)) continue

                    const fullPath = path.join(dirPath, entry.name)
                    scanned++

                    // 更新进度（每 100 个文件更新一次）
                    if (scanned % 100 === 0) {
                        setSearchState(prev => ({
                            ...prev,
                            progress: `已扫描 ${scanned} 个文件...`,
                            totalScanned: scanned,
                        }))
                    }

                    // 检查文件名是否匹配
                    const nameMatch = entry.name.toLowerCase().includes(query)

                    if (nameMatch) {
                        try {
                            const stats = fs.statSync(fullPath)
                            const ext = path.extname(entry.name).slice(1)

                            results.push({
                                name: entry.name,
                                path: fullPath,
                                isDirectory: entry.isDirectory(),
                                size: entry.isDirectory() ? 0 : stats.size,
                                modifiedTime: stats.mtime,
                                extension: ext,
                            })

                            // 实时更新结果
                            if (results.length % 10 === 0) {
                                setSearchState(prev => ({
                                    ...prev,
                                    results: [...results],
                                }))
                            }
                        } catch {
                            // 忽略无法访问的文件
                        }
                    }

                    // 递归搜索子目录
                    if (entry.isDirectory()) {
                        await searchDir(fullPath, depth + 1)
                    }
                }
            } catch {
                // 忽略无法访问的目录
            }
        }

        try {
            await searchDir(searchPath, 0)

            setSearchState({
                searching: false,
                progress: '',
                results,
                totalScanned: scanned,
                error: null,
            })
        } catch (e) {
            setSearchState({
                searching: false,
                progress: '',
                results: [],
                totalScanned: 0,
                error: e instanceof Error ? e.message : '搜索失败',
            })
        }
    }, [searchQuery, searchPath, maxDepth])

    // 防抖搜索
    useEffect(() => {
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current)
        }

        if (searchQuery.trim()) {
            searchTimeoutRef.current = setTimeout(() => {
                searchFiles()
            }, 300)
        } else {
            setSearchState(prev => ({ ...prev, results: [], totalScanned: 0 }))
        }

        return () => {
            if (searchTimeoutRef.current) {
                clearTimeout(searchTimeoutRef.current)
            }
        }
    }, [searchQuery, searchFiles])

    // 停止搜索
    const handleStopSearch = useCallback(() => {
        abortRef.current = true
    }, [])

    // 打开文件
    const handleOpenFile = useCallback((filePath: string) => {
        shell.openPath(filePath)
    }, [])

    // 打开文件所在文件夹
    const handleOpenFolder = useCallback((filePath: string) => {
        shell.showItemInFolder(filePath)
    }, [])

    // 排序结果
    const sortedResults = [...searchState.results].sort((a, b) => {
        let comparison = 0
        switch (sortBy) {
            case 'name':
                comparison = a.name.localeCompare(b.name)
                break
            case 'size':
                comparison = a.size - b.size
                break
            case 'date':
                comparison = a.modifiedTime.getTime() - b.modifiedTime.getTime()
                break
        }
        return sortOrder === 'asc' ? comparison : -comparison
    })

    // 切换排序
    const handleSort = (field: 'name' | 'size' | 'date') => {
        if (sortBy === field) {
            setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
        } else {
            setSortBy(field)
            setSortOrder('asc')
        }
    }

    // 清空
    const handleClear = useCallback(() => {
        abortRef.current = true
        setSearchQuery('')
        setSearchState({
            searching: false,
            progress: '',
            results: [],
            totalScanned: 0,
            error: null,
        })
    }, [])

    // 选择搜索目录
    const handleSelectPath = useCallback(async () => {
        try {
            const selectedPath = await ipcRenderer.invoke('select-directory', searchPath)
            if (selectedPath) {
                setSearchPath(selectedPath)
            }
        } catch (e) {
            console.error('选择目录失败:', e)
        }
    }, [searchPath])

    return (
        <div className="file-search">
            <div className="file-search-header">
                <h1 className="module-title">文件搜索</h1>
                <div className="header-actions">
                    <button className="btn btn-secondary" onClick={handleClear}>
                        <span>🗑️</span>
                        清空
                    </button>
                </div>
            </div>

            <div className="file-search-body">
                {/* 搜索设置 */}
                <div className="search-settings">
                    <div className="search-input-wrapper">
                        <span className="search-icon">🔍</span>
                        <input
                            type="text"
                            className="search-input"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="输入文件名搜索..."
                            autoFocus
                        />
                        {searchState.searching && (
                            <button className="stop-btn" onClick={handleStopSearch}>
                                ⏹️
                            </button>
                        )}
                    </div>

                    <div className="search-options">
                        <div className="option-group">
                            <label className="option-label">搜索目录</label>
                            <div className="path-selector">
                                <input
                                    type="text"
                                    className="path-input"
                                    value={searchPath}
                                    onChange={(e) => setSearchPath(e.target.value)}
                                />
                                <button className="btn btn-secondary btn-sm" onClick={handleSelectPath}>
                                    📂
                                </button>
                            </div>
                        </div>

                        <div className="option-group">
                            <label className="option-label">搜索深度</label>
                            <select
                                className="depth-select"
                                value={maxDepth}
                                onChange={(e) => setMaxDepth(Number(e.target.value))}
                            >
                                <option value={3}>3 层</option>
                                <option value={5}>5 层</option>
                                <option value={10}>10 层</option>
                                <option value={20}>20 层</option>
                                <option value={100}>无限制</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* 搜索状态 */}
                {searchState.searching && (
                    <div className="search-status">
                        <div className="loading-spinner" />
                        <span>{searchState.progress}</span>
                        <span className="result-count">找到 {searchState.results.length} 个结果</span>
                    </div>
                )}

                {/* 错误提示 */}
                {searchState.error && (
                    <div className="error-box">
                        <span className="error-icon">⚠️</span>
                        <span>{searchState.error}</span>
                    </div>
                )}

                {/* 结果统计 */}
                {!searchState.searching && searchState.results.length > 0 && (
                    <div className="results-stats">
                        <span>共扫描 {searchState.totalScanned} 个文件，找到 {searchState.results.length} 个匹配结果</span>
                    </div>
                )}

                {/* 搜索结果 */}
                {sortedResults.length > 0 && (
                    <div className="results-section">
                        <div className="results-header">
                            <div
                                className={`header-cell name-cell sortable ${sortBy === 'name' ? 'active' : ''}`}
                                onClick={() => handleSort('name')}
                            >
                                名称 {sortBy === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
                            </div>
                            <div
                                className={`header-cell size-cell sortable ${sortBy === 'size' ? 'active' : ''}`}
                                onClick={() => handleSort('size')}
                            >
                                大小 {sortBy === 'size' && (sortOrder === 'asc' ? '↑' : '↓')}
                            </div>
                            <div
                                className={`header-cell date-cell sortable ${sortBy === 'date' ? 'active' : ''}`}
                                onClick={() => handleSort('date')}
                            >
                                修改时间 {sortBy === 'date' && (sortOrder === 'asc' ? '↑' : '↓')}
                            </div>
                            <div className="header-cell action-cell">操作</div>
                        </div>

                        <div className="results-list">
                            {sortedResults.map((result, index) => (
                                <div
                                    key={result.path + index}
                                    className="result-item"
                                    onDoubleClick={() => handleOpenFile(result.path)}
                                >
                                    <div className="result-cell name-cell">
                                        <span className="file-icon">{getFileIcon(result)}</span>
                                        <div className="file-info">
                                            <span className="file-name">{result.name}</span>
                                            <span className="file-path">{result.path}</span>
                                        </div>
                                    </div>
                                    <div className="result-cell size-cell">
                                        {result.isDirectory ? '-' : formatSize(result.size)}
                                    </div>
                                    <div className="result-cell date-cell">
                                        {formatDate(result.modifiedTime)}
                                    </div>
                                    <div className="result-cell action-cell">
                                        <button
                                            className="action-btn"
                                            onClick={() => handleOpenFile(result.path)}
                                            title="打开"
                                        >
                                            📂
                                        </button>
                                        <button
                                            className="action-btn"
                                            onClick={() => handleOpenFolder(result.path)}
                                            title="在文件夹中显示"
                                        >
                                            📍
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* 空状态 */}
                {!searchState.searching && searchState.results.length === 0 && searchQuery && (
                    <div className="empty-state">
                        <div className="empty-icon">🔍</div>
                        <div className="empty-text">未找到匹配的文件</div>
                        <div className="empty-hint">尝试修改搜索关键词或更换搜索目录</div>
                    </div>
                )}

                {/* 初始状态 */}
                {!searchQuery && (
                    <div className="empty-state">
                        <div className="empty-icon">🔍</div>
                        <div className="empty-text">输入关键词开始搜索</div>
                        <div className="empty-hint">支持模糊匹配，输入即搜</div>
                    </div>
                )}
            </div>
        </div>
    )
}

export default FileSearch
