import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import TranslateNaming from './index'

test('shows chinese-to-english copy by default', () => {
    render(<TranslateNaming />)

    expect(screen.getByPlaceholderText(/输入中文/i)).toBeInTheDocument()
})

test('switches ui copy when direction changes to english-to-chinese', async () => {
    const user = userEvent.setup()

    render(<TranslateNaming />)

    await user.click(screen.getByRole('button', { name: /英 -> 中/i }))

    expect(screen.getByPlaceholderText(/请输入英文/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /翻译并生成/i })).toBeInTheDocument()
})

test('renders translated english text and naming results for chinese input', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        json: async () => ({
            responseStatus: 200,
            responseData: { translatedText: 'user status' },
        }),
    }))

    render(<TranslateNaming />)

    await user.type(screen.getByRole('textbox'), '用户状态')
    await user.click(screen.getByRole('button', { name: /翻译并生成/i }))

    expect(await screen.findByText('翻译结果')).toBeInTheDocument()
    expect(screen.getByText('英文翻译:')).toBeInTheDocument()
    expect(screen.getAllByText(/user status/i)).toHaveLength(2)
    expect(screen.getByText('userStatus')).toBeInTheDocument()
})

test('renders chinese translation and naming results from english input', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        json: async () => ({
            responseStatus: 200,
            responseData: { translatedText: '用户状态' },
        }),
    }))

    render(<TranslateNaming />)

    await user.click(screen.getByRole('button', { name: /英 -> 中/i }))
    await user.type(screen.getByRole('textbox'), 'user-status')
    await user.click(screen.getByRole('button', { name: /翻译并生成/i }))

    expect(await screen.findByText('翻译结果')).toBeInTheDocument()
    expect(screen.getByText('中文翻译:')).toBeInTheDocument()
    expect(screen.getByText('用户状态')).toBeInTheDocument()
    expect(screen.getByText('命名拆词:')).toBeInTheDocument()
    expect(screen.getByText('user status')).toBeInTheDocument()
    expect(screen.getByText('userStatus')).toBeInTheDocument()
})

test('shows an online translation error and clears results on failure', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')))

    render(<TranslateNaming />)

    await user.type(screen.getByRole('textbox'), '用户状态')
    await user.click(screen.getByRole('button', { name: /翻译并生成/i }))

    expect(await screen.findByText(/在线翻译失败/i)).toBeInTheDocument()
    expect(screen.queryByText('翻译结果')).not.toBeInTheDocument()
    expect(screen.queryByText('userStatus')).not.toBeInTheDocument()
})

test('renders results inside a dedicated scroll container', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        json: async () => ({
            responseStatus: 200,
            responseData: { translatedText: 'user status' },
        }),
    }))

    render(<TranslateNaming />)

    await user.type(screen.getByRole('textbox'), '用户状态')
    await user.click(screen.getByRole('button', { name: /翻译并生成/i }))

    const scrollContainer = screen.getByTestId('translate-naming-scroll')
    const resultsSection = screen.getByTestId('naming-results-section')
    const resultsScroller = screen.getByTestId('naming-results-scroll')

    expect(scrollContainer).toBeInTheDocument()
    expect(resultsSection).toBeInTheDocument()
    expect(resultsScroller).toBeInTheDocument()
})

test('keeps the module header outside the scroll container', async () => {
    render(<TranslateNaming />)

    const moduleScrollRoot = screen.getByTestId('translate-naming-root-scroll')
    const header = screen.getByRole('heading', { name: '变量命名' })
    const scrollContainer = screen.getByTestId('translate-naming-scroll')

    expect(moduleScrollRoot).toBeInTheDocument()
    expect(moduleScrollRoot.contains(header)).toBe(true)
    expect(scrollContainer.contains(header)).toBe(false)
})
