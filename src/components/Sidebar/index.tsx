import { useState, useRef } from 'react'
import './Sidebar.css'

interface Module {
    id: string
    name: string
    icon: string
}

interface SidebarProps {
    modules: Module[]
    activeModule: string
    onModuleSelect: (id: string) => void
    onModuleReorder: (fromIndex: number, toIndex: number) => void
}

function Sidebar({ modules, activeModule, onModuleSelect, onModuleReorder }: SidebarProps) {
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
    const dragNodeRef = useRef<HTMLLIElement | null>(null)

    // 开始拖拽
    const handleDragStart = (e: React.DragEvent, index: number) => {
        setDraggedIndex(index)
        dragNodeRef.current = e.currentTarget as HTMLLIElement

        // 设置拖拽效果
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', index.toString())

        // 延迟添加拖拽样式，否则会影响拖拽预览图像
        setTimeout(() => {
            if (dragNodeRef.current) {
                dragNodeRef.current.classList.add('dragging')
            }
        }, 0)
    }

    // 拖拽结束
    const handleDragEnd = () => {
        if (dragNodeRef.current) {
            dragNodeRef.current.classList.remove('dragging')
        }
        setDraggedIndex(null)
        setDragOverIndex(null)
        dragNodeRef.current = null
    }

    // 拖拽经过
    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'

        if (draggedIndex === null || draggedIndex === index) return
        setDragOverIndex(index)
    }

    // 拖拽离开
    const handleDragLeave = () => {
        setDragOverIndex(null)
    }

    // 放置
    const handleDrop = (e: React.DragEvent, toIndex: number) => {
        e.preventDefault()

        if (draggedIndex === null || draggedIndex === toIndex) return

        onModuleReorder(draggedIndex, toIndex)
        setDraggedIndex(null)
        setDragOverIndex(null)
    }

    return (
        <aside className="sidebar">
            <div className="sidebar-header">
                <div className="logo">
                    <span className="logo-icon">⚡</span>
                    <span className="logo-text">工具箱</span>
                </div>
            </div>

            <nav className="sidebar-nav">
                <div className="nav-section">
                    <span className="nav-section-title">工具 <span className="drag-hint">可拖拽排序</span></span>
                    <ul className="nav-list">
                        {modules.map((module, index) => (
                            <li
                                key={module.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, index)}
                                onDragEnd={handleDragEnd}
                                onDragOver={(e) => handleDragOver(e, index)}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, index)}
                                className={`nav-item-wrapper ${dragOverIndex === index ? 'drag-over' : ''
                                    } ${draggedIndex === index ? 'is-dragging' : ''}`}
                            >
                                <button
                                    className={`nav-item ${activeModule === module.id ? 'active' : ''}`}
                                    onClick={() => onModuleSelect(module.id)}
                                >
                                    <span className="drag-handle">⋮⋮</span>
                                    <span className="nav-icon">{module.icon}</span>
                                    <span className="nav-label">{module.name}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            </nav>

            <div className="sidebar-footer">
                <span className="version">v1.0.0</span>
            </div>
        </aside>
    )
}

export default Sidebar

