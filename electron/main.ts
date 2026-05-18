import { app, BrowserWindow, ipcMain, dialog, screen, desktopCapturer, systemPreferences } from 'electron'
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import heicConvert from 'heic-convert'
import { MARKITDOWN_EXTENSIONS, MarkitdownCommand, formatMarkitdownError, getMarkitdownCommands } from './markitdown'

// 存储悬浮窗口
const floatingWindows = new Map<string, BrowserWindow>()
let captureWindow: BrowserWindow | null = null
let isAppQuitting = false

const closeAuxiliaryWindows = () => {
  if (captureWindow && !captureWindow.isDestroyed()) {
    captureWindow.close()
  }
  captureWindow = null

  for (const win of floatingWindows.values()) {
    if (!win.isDestroyed()) {
      win.close()
    }
  }
  floatingWindows.clear()
}

const convertWithCommand = (candidate: MarkitdownCommand, filePath: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const child = spawn(candidate.command, [...candidate.argsPrefix, filePath], {
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    let settled = false

    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill()
      reject(new Error('转换超时，请确认文件大小或 MarkItDown 安装状态'))
    }, 120000)

    child.stdout.on('data', chunk => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', chunk => {
      stderr += chunk.toString()
    })

    child.on('error', error => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      reject(error)
    })

    child.on('close', code => {
      if (settled) return
      settled = true
      clearTimeout(timeout)

      if (code === 0) {
        resolve(stdout)
        return
      }

      reject(new Error(stderr.trim() || `MarkItDown 退出码：${code}`))
    })
  })
}

const convertHeicWithSips = (
  filePath: string,
  targetFormat: 'png' | 'jpg',
): Promise<{ dataUrl: string; size: number }> => {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'darwin') {
      reject(new Error('HEIC 转换当前仅支持 macOS'))
      return
    }

    const outputExtension = targetFormat === 'jpg' ? 'jpg' : 'png'
    const sipsFormat = targetFormat === 'jpg' ? 'jpeg' : 'png'
    const outputPath = path.join(
      app.getPath('temp'),
      `bennett-heic-${Date.now()}-${Math.random().toString(16).slice(2)}.${outputExtension}`,
    )
    const child = spawn('sips', ['-s', 'format', sipsFormat, filePath, '--out', outputPath], {
      windowsHide: true,
    })
    let stderr = ''
    let settled = false

    const cleanup = () => {
      fs.promises.unlink(outputPath).catch(() => undefined)
    }

    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill()
      cleanup()
      reject(new Error('HEIC 转换超时'))
    }, 60000)

    child.stderr.on('data', chunk => {
      stderr += chunk.toString()
    })

    child.on('error', error => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      cleanup()
      reject(error)
    })

    child.on('close', async code => {
      if (settled) return
      settled = true
      clearTimeout(timeout)

      if (code !== 0) {
        cleanup()
        reject(new Error(stderr.trim() || `sips 退出码：${code}`))
        return
      }

      try {
        const [buffer, stats] = await Promise.all([
          fs.promises.readFile(outputPath),
          fs.promises.stat(outputPath),
        ])
        cleanup()
        const mimeType = targetFormat === 'jpg' ? 'image/jpeg' : 'image/png'
        resolve({
          dataUrl: `data:${mimeType};base64,${buffer.toString('base64')}`,
          size: stats.size,
        })
      } catch (error) {
        cleanup()
        reject(error)
      }
    })
  })
}

const convertHeicWithNode = async (
  filePath: string,
  targetFormat: 'png' | 'jpg',
): Promise<{ dataUrl: string; size: number }> => {
  const inputBuffer = await fs.promises.readFile(filePath)
  const format = targetFormat === 'jpg' ? 'JPEG' : 'PNG'
  const outputBuffer = Buffer.from(await heicConvert({
    buffer: inputBuffer,
    format,
    quality: 0.92,
  }))
  const mimeType = targetFormat === 'jpg' ? 'image/jpeg' : 'image/png'

  return {
    dataUrl: `data:${mimeType};base64,${outputBuffer.toString('base64')}`,
    size: outputBuffer.length,
  }
}

const convertHeicImage = (
  filePath: string,
  targetFormat: 'png' | 'jpg',
) => {
  if (process.platform === 'darwin') {
    return convertHeicWithSips(filePath, targetFormat)
  }

  return convertHeicWithNode(filePath, targetFormat)
}

const convertFileToMarkdown = async (filePath: string) => {
  const commands = getMarkitdownCommands({
    appPath: app.getAppPath(),
    cwd: process.cwd(),
    env: process.env,
    existsSync: fs.existsSync,
    platform: process.platform,
    resourcesPath: process.resourcesPath,
  })

  if (commands.length === 0) {
    return {
      success: false,
      error: '应用未找到随包 MarkItDown。请先运行 npm run setup:markitdown 生成内置转换器，再重新启动应用。',
      sourcePath: filePath,
      sourceName: path.basename(filePath),
    }
  }

  let lastError = 'MarkItDown 转换失败'

  for (const candidate of commands) {
    try {
      const markdown = await convertWithCommand(candidate, filePath)
      return {
        success: true,
        markdown,
        command: candidate.label,
        sourcePath: filePath,
        sourceName: path.basename(filePath),
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
  }

  return {
    success: false,
    error: `MarkItDown 转换失败：\n${formatMarkitdownError(lastError)}`,
    sourcePath: filePath,
    sourceName: path.basename(filePath),
  }
}



function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f0f23',
    show: false,
  })

  // 窗口准备好后再显示
  win.once('ready-to-show', () => {
    win.show()
  })

  win.on('close', () => {
    if (process.platform === 'darwin') return
    if (isAppQuitting) return

    isAppQuitting = true
    closeAuxiliaryWindows()
  })

  // 开发环境加载 Vite 开发服务器
  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    // 生产环境加载打包后的文件
    win.loadFile(path.join(app.getAppPath(), 'dist/index.html'))
  }
}

// IPC 处理程序：选择目录
ipcMain.handle('select-directory', async (_, defaultPath: string) => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    defaultPath,
  })
  return result.canceled ? null : result.filePaths[0]
})

// IPC 处理程序：选择可转换文档
ipcMain.handle('select-markitdown-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'MarkItDown 支持的文件', extensions: MARKITDOWN_EXTENSIONS },
      { name: '所有文件', extensions: ['*'] },
    ],
  })

  if (result.canceled || !result.filePaths[0]) return null

  const filePath = result.filePaths[0]
  const stats = fs.statSync(filePath)

  return {
    path: filePath,
    name: path.basename(filePath),
    size: stats.size,
    extension: path.extname(filePath).slice(1).toUpperCase() || 'FILE',
  }
})

// IPC 处理程序：使用 MarkItDown 转换文件
ipcMain.handle('convert-file-to-markdown', async (_, filePath: string) => {
  if (!filePath || !fs.existsSync(filePath)) {
    return {
      success: false,
      error: '文件不存在或路径无效',
    }
  }

  return convertFileToMarkdown(filePath)
})

// IPC 处理程序：转换 HEIC / HEIF
ipcMain.handle('convert-heic-image', async (_, options: {
  filePath: string
  targetFormat: 'png' | 'jpg'
}) => {
  const { filePath, targetFormat } = options
  if (!filePath || !fs.existsSync(filePath)) {
    return {
      success: false,
      error: '文件不存在或路径无效',
    }
  }

  if (!['png', 'jpg'].includes(targetFormat)) {
    return {
      success: false,
      error: 'HEIC 当前支持转换为 PNG 或 JPG',
    }
  }

  try {
    const result = await convertHeicImage(filePath, targetFormat)
    return {
      success: true,
      ...result,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'HEIC 转换失败',
    }
  }
})

// IPC 处理程序：检查屏幕录制权限（macOS）
ipcMain.handle('check-screen-permission', async () => {
  if (process.platform === 'darwin') {
    const status = systemPreferences.getMediaAccessStatus('screen')
    return status
  }
  return 'granted'
})

// IPC 处理程序：获取屏幕源
ipcMain.handle('get-desktop-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 },
    })

    // 转换为可序列化的格式
    return sources.map(source => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL(),
      appIcon: source.appIcon?.toDataURL() || null,
    }))
  } catch (e) {
    console.error('获取屏幕源失败:', e)
    return []
  }
})

// IPC 处理程序：创建悬浮窗口
ipcMain.handle('create-floating-window', async (_, options: {
  id: string
  dataUrl: string
  width: number
  height: number
}) => {
  const { id, dataUrl, width, height } = options

  // 如果已存在相同 ID 的窗口，关闭它
  if (floatingWindows.has(id)) {
    floatingWindows.get(id)?.close()
  }

  // 获取屏幕信息，将窗口放在右下角
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize
  const x = screenWidth - width - 50
  const y = screenHeight - height - 50

  // 创建悬浮窗口
  const floatWin = new BrowserWindow({
    width: Math.max(width, 100),
    height: Math.max(height, 100),
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  })

  // 加载悬浮窗口 HTML
  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: transparent;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .container {
      position: relative;
      width: 100%;
      height: 100%;
      border: 2px solid rgba(80, 120, 255, 0.5);
      border-radius: 8px;
      overflow: hidden;
      background: #1a1a2e;
    }
    .titlebar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 28px;
      padding: 0 8px;
      background: rgba(30, 30, 50, 0.95);
      cursor: move;
      -webkit-app-region: drag;
    }
    .title {
      font-size: 11px;
      color: rgba(255, 255, 255, 0.6);
    }
    .controls {
      display: flex;
      gap: 6px;
      -webkit-app-region: no-drag;
    }
    .control-btn {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      border: none;
      cursor: pointer;
      opacity: 0.8;
      transition: opacity 0.2s;
    }
    .control-btn:hover { opacity: 1; }
    .close-btn { background: #ff5f56; }
    .pin-btn { background: #27c93f; }
    .pin-btn.active { background: #ffbd2e; }
    img {
      width: 100%;
      height: calc(100% - 28px);
      object-fit: contain;
      background: 
        linear-gradient(45deg, rgba(100, 100, 150, 0.1) 25%, transparent 25%),
        linear-gradient(-45deg, rgba(100, 100, 150, 0.1) 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, rgba(100, 100, 150, 0.1) 75%),
        linear-gradient(-45deg, transparent 75%, rgba(100, 100, 150, 0.1) 75%);
      background-size: 10px 10px;
    }
    .resize-handle {
      position: absolute;
      right: 0;
      bottom: 0;
      width: 16px;
      height: 16px;
      cursor: se-resize;
      -webkit-app-region: no-drag;
    }
    .resize-handle::after {
      content: '';
      position: absolute;
      right: 4px;
      bottom: 4px;
      width: 8px;
      height: 8px;
      border-right: 2px solid rgba(255,255,255,0.3);
      border-bottom: 2px solid rgba(255,255,255,0.3);
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="titlebar">
      <span class="title">悬浮截图</span>
      <div class="controls">
        <button class="control-btn pin-btn active" id="pinBtn" title="取消置顶"></button>
        <button class="control-btn close-btn" id="closeBtn" title="关闭"></button>
      </div>
    </div>
    <img src="${dataUrl}" draggable="false" />
    <div class="resize-handle"></div>
  </div>
  <script>
    const { ipcRenderer } = require('electron');
    let isPinned = true;
    
    document.getElementById('closeBtn').addEventListener('click', () => {
      ipcRenderer.send('close-floating-window', '${id}');
    });
    
    document.getElementById('pinBtn').addEventListener('click', (e) => {
      isPinned = !isPinned;
      ipcRenderer.send('toggle-always-on-top', { id: '${id}', alwaysOnTop: isPinned });
      e.target.classList.toggle('active', isPinned);
      e.target.title = isPinned ? '取消置顶' : '置顶';
    });
  </script>
</body>
</html>
    `

  floatWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  floatingWindows.set(id, floatWin)

  floatWin.on('closed', () => {
    floatingWindows.delete(id)
  })

  return true
})

// IPC 处理程序：关闭悬浮窗口
ipcMain.on('close-floating-window', (_, id: string) => {
  const win = floatingWindows.get(id)
  if (win) {
    win.close()
    floatingWindows.delete(id)
  }
})

// IPC 处理程序：切换置顶状态
ipcMain.on('toggle-always-on-top', (_, options: { id: string; alwaysOnTop: boolean }) => {
  const win = floatingWindows.get(options.id)
  if (win) {
    win.setAlwaysOnTop(options.alwaysOnTop)
  }
})

// IPC 处理程序：开始框选截图
ipcMain.handle('start-capture-selection', async () => {
  // 先截取整个屏幕
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: screen.getPrimaryDisplay().size,
    })

    if (sources.length === 0) {
      return { success: false, error: '无法获取屏幕' }
    }

    const primarySource = sources[0]
    const screenSize = screen.getPrimaryDisplay().bounds

    // 将屏幕截图转为 DataURL
    const screenshotDataUrl = primarySource.thumbnail.toDataURL()

    // 创建全屏透明窗口用于选择区域
    captureWindow = new BrowserWindow({
      x: screenSize.x,
      y: screenSize.y,
      width: screenSize.width,
      height: screenSize.height,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      fullscreen: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    })

    const captureHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      overflow: hidden;
      cursor: crosshair;
      user-select: none;
    }
    .screenshot-bg {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background-image: url('${screenshotDataUrl}');
      background-size: cover;
      filter: brightness(0.5);
    }
    .selection {
      position: fixed;
      border: 2px solid #5078ff;
      background: transparent;
      box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);
      display: none;
    }
    .selection.active {
      display: block;
    }
    .selection-preview {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-image: url('${screenshotDataUrl}');
      background-size: ${screenSize.width}px ${screenSize.height}px;
    }
    .size-label {
      position: absolute;
      bottom: -28px;
      left: 50%;
      transform: translateX(-50%);
      padding: 4px 10px;
      background: #5078ff;
      color: white;
      font-size: 12px;
      font-family: monospace;
      border-radius: 4px;
      white-space: nowrap;
    }
    .hint {
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      padding: 10px 20px;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      font-size: 14px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    }
  </style>
</head>
<body>
  <div class="screenshot-bg"></div>
  <div class="selection" id="selection">
    <div class="selection-preview" id="preview"></div>
    <div class="size-label" id="sizeLabel">0 × 0</div>
  </div>
  <div class="hint">拖拽选择截图区域，ESC 取消</div>
  
  <script>
    const { ipcRenderer } = require('electron');
    const selection = document.getElementById('selection');
    const preview = document.getElementById('preview');
    const sizeLabel = document.getElementById('sizeLabel');
    
    let isSelecting = false;
    let startX = 0, startY = 0;
    let currentX = 0, currentY = 0;
    
    document.addEventListener('mousedown', (e) => {
      isSelecting = true;
      startX = e.clientX;
      startY = e.clientY;
      selection.classList.add('active');
      updateSelection();
    });
    
    document.addEventListener('mousemove', (e) => {
      if (!isSelecting) return;
      currentX = e.clientX;
      currentY = e.clientY;
      updateSelection();
    });
    
    document.addEventListener('mouseup', (e) => {
      if (!isSelecting) return;
      isSelecting = false;
      
      const x = Math.min(startX, currentX);
      const y = Math.min(startY, currentY);
      const width = Math.abs(currentX - startX);
      const height = Math.abs(currentY - startY);
      
      if (width > 10 && height > 10) {
        ipcRenderer.send('capture-selection-complete', { x, y, width, height });
      } else {
        ipcRenderer.send('capture-selection-cancel');
      }
    });
    
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        ipcRenderer.send('capture-selection-cancel');
      }
    });
    
    function updateSelection() {
      const x = Math.min(startX, currentX);
      const y = Math.min(startY, currentY);
      const width = Math.abs(currentX - startX);
      const height = Math.abs(currentY - startY);
      
      selection.style.left = x + 'px';
      selection.style.top = y + 'px';
      selection.style.width = width + 'px';
      selection.style.height = height + 'px';
      
      preview.style.backgroundPosition = -x + 'px ' + -y + 'px';
      sizeLabel.textContent = width + ' × ' + height;
    }
  </script>
</body>
</html>
    `

    captureWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(captureHtml)}`)

    return { success: true, screenshotDataUrl }
  } catch (e: any) {
    console.error('框选截图失败:', e)
    return { success: false, error: e.message }
  }
})

// IPC 处理程序：框选完成
ipcMain.on('capture-selection-complete', async (event, rect: { x: number; y: number; width: number; height: number }) => {
  if (captureWindow) {
    captureWindow.close()
    captureWindow = null
  }

  // 截取选中区域
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: screen.getPrimaryDisplay().size,
    })

    if (sources.length > 0) {
      const fullScreenshot = sources[0].thumbnail
      const croppedImage = fullScreenshot.crop(rect)
      const dataUrl = croppedImage.toDataURL()

      // 发送裁剪后的截图到渲染进程
      const allWindows = BrowserWindow.getAllWindows()
      const mainWindow = allWindows.find(w => !floatingWindows.has(w.id.toString()))
      if (mainWindow) {
        mainWindow.webContents.send('capture-result', {
          success: true,
          dataUrl,
          width: rect.width,
          height: rect.height,
        })
      }
    }
  } catch (e: any) {
    console.error('裁剪截图失败:', e)
  }
})

// IPC 处理程序：取消框选
ipcMain.on('capture-selection-cancel', () => {
  if (captureWindow) {
    captureWindow.close()
    captureWindow = null
  }
})

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('before-quit', () => {
  isAppQuitting = true
  closeAuxiliaryWindows()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
