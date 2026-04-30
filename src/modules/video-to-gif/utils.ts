export interface GifOptions {
    startTime: number
    duration: number
    fps: number
    width: number
    quality: number
}

export interface VideoFramePlan {
    delay: number
    frameCount: number
    times: number[]
}

const MIN_DURATION = 0.5
const MAX_DURATION = 12
const MIN_FPS = 1
const MAX_FPS = 15
const MIN_WIDTH = 120
const MAX_WIDTH = 960
const MIN_QUALITY = 16
const MAX_QUALITY = 256

const clamp = (value: number, min: number, max: number) => {
    if (Number.isNaN(value)) return min
    return Math.min(max, Math.max(min, value))
}

export const clampGifOptions = (options: GifOptions, videoDuration: number): GifOptions => {
    const sourceDuration = Math.max(0, videoDuration)
    const startTime = clamp(options.startTime, 0, sourceDuration)
    const remainingDuration = Math.max(0, sourceDuration - startTime)
    const maxDuration = Math.min(MAX_DURATION, remainingDuration || MAX_DURATION)

    return {
        startTime,
        duration: clamp(options.duration, Math.min(MIN_DURATION, maxDuration), maxDuration),
        fps: Math.round(clamp(options.fps, MIN_FPS, MAX_FPS)),
        width: Math.round(clamp(options.width, MIN_WIDTH, MAX_WIDTH)),
        quality: Math.round(clamp(options.quality, MIN_QUALITY, MAX_QUALITY)),
    }
}

export const buildVideoFramePlan = (options: GifOptions): VideoFramePlan => {
    const frameCount = Math.max(1, Math.round(options.duration * options.fps))
    const delay = Math.round(1000 / options.fps)
    const times = Array.from({ length: frameCount }, (_, index) => {
        return Number((options.startTime + index / options.fps).toFixed(3))
    })

    return {
        delay,
        frameCount,
        times,
    }
}

export const buildGifFileName = (sourceName: string) => {
    const baseName = sourceName.replace(/\.[^.]+$/, '') || 'converted-video'
    return `${baseName}.gif`
}

export const formatVideoDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds.toFixed(1)} 秒`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = Math.round(seconds % 60)
    return `${minutes} 分 ${remainingSeconds} 秒`
}

export const formatVideoSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}
