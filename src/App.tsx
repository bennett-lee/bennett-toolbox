import { useState, useEffect, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import JsonFormatter from './modules/json-formatter'
import TranslateNaming from './modules/translate-naming'
import ImageConverter from './modules/image-converter'
import FileSearch from './modules/file-search'
import ScreenshotFloat from './modules/screenshot-float'
import ColorPicker from './modules/color-picker'
import DocumentConverter from './modules/document-converter'
import './styles/App.css'

// 默认模块配置
const defaultModules = [
    { id: 'json-formatter', name: 'JSON 格式化', icon: '{ }' },
    { id: 'translate-naming', name: '变量命名', icon: 'Aa' },
    { id: 'image-converter', name: '图片转换', icon: '🖼️' },
    { id: 'file-search', name: '文件搜索', icon: '🔍' },
    { id: 'document-converter', name: '文档转 MD', icon: 'MD' },
    { id: 'screenshot-float', name: '截图悬浮', icon: '📌' },
    { id: 'color-picker', name: '屏幕取色', icon: '🎨' },
]

// 从 localStorage 加载模块顺序
const loadModuleOrder = () => {
    try {
        const saved = localStorage.getItem('bennett-module-order')
        if (saved) {
            const order = JSON.parse(saved)
            // 根据保存的顺序重新排列模块
            const orderedModules = order
                .map((id: string) => defaultModules.find(m => m.id === id))
                .filter(Boolean)
            // 添加可能新增的模块（不在保存的顺序中）
            const newModules = defaultModules.filter(m => !order.includes(m.id))
            return [...orderedModules, ...newModules]
        }
    } catch (e) {
        console.error('加载模块顺序失败:', e)
    }
    return defaultModules
}

function App() {
    const [modules, setModules] = useState(loadModuleOrder)
    const [activeModule, setActiveModule] = useState('json-formatter')

    // 保存模块顺序到 localStorage
    useEffect(() => {
        const order = modules.map(m => m.id)
        localStorage.setItem('bennett-module-order', JSON.stringify(order))
    }, [modules])

    // 处理模块排序
    const handleModuleReorder = useCallback((fromIndex: number, toIndex: number) => {
        setModules(prev => {
            const newModules = [...prev]
            const [removed] = newModules.splice(fromIndex, 1)
            newModules.splice(toIndex, 0, removed)
            return newModules
        })
    }, [])

    const renderModule = () => {
        switch (activeModule) {
            case 'json-formatter':
                return <JsonFormatter />
            case 'translate-naming':
                return <TranslateNaming />
            case 'image-converter':
                return <ImageConverter />
            case 'file-search':
                return <FileSearch />
            case 'document-converter':
                return <DocumentConverter />
            case 'screenshot-float':
                return <ScreenshotFloat />
            case 'color-picker':
                return <ColorPicker />
            default:
                return <div className="empty-state">请选择一个工具</div>
        }
    }

    return (
        <div className="app">
            <Sidebar
                modules={modules}
                activeModule={activeModule}
                onModuleSelect={setActiveModule}
                onModuleReorder={handleModuleReorder}
            />
            <main className="main-content">
                {renderModule()}
            </main>
        </div>
    )
}

export default App
