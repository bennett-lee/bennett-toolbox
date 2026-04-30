import { describe, expect, test } from 'vitest'
import {
    buildGifFileName,
    buildVideoFramePlan,
    clampGifOptions,
    formatVideoDuration,
    formatVideoSize,
} from './utils'

describe('video to gif utils', () => {
    test('clamps GIF options to practical browser-side limits', () => {
        expect(clampGifOptions({
            startTime: -4,
            duration: 99,
            fps: 60,
            width: 4096,
            quality: 500,
        }, 8)).toEqual({
            startTime: 0,
            duration: 8,
            fps: 15,
            width: 960,
            quality: 256,
        })
    })

    test('keeps the selected segment inside the source duration', () => {
        expect(clampGifOptions({
            startTime: 9,
            duration: 5,
            fps: 8,
            width: 640,
            quality: 128,
        }, 10)).toMatchObject({
            startTime: 9,
            duration: 1,
        })
    })

    test('builds an evenly spaced frame plan from the selected segment', () => {
        expect(buildVideoFramePlan({
            startTime: 1,
            duration: 2,
            fps: 4,
            width: 480,
            quality: 128,
        })).toEqual({
            delay: 250,
            frameCount: 8,
            times: [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75],
        })
    })

    test('uses a safe GIF filename based on the video name', () => {
        expect(buildGifFileName('demo video.mp4')).toBe('demo video.gif')
        expect(buildGifFileName('recording')).toBe('recording.gif')
    })

    test('formats duration and size for the summary panel', () => {
        expect(formatVideoDuration(8.3)).toBe('8.3 秒')
        expect(formatVideoDuration(125)).toBe('2 分 5 秒')
        expect(formatVideoSize(512)).toBe('512 B')
        expect(formatVideoSize(1536)).toBe('1.5 KB')
        expect(formatVideoSize(2 * 1024 * 1024)).toBe('2.00 MB')
    })
})
