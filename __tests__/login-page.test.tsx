import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockPush = vi.fn()
const mockReplace = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}))

let storageMock: Record<string, string> = {}

beforeEach(() => {
  storageMock = {}
  mockPush.mockReset()
  mockReplace.mockReset()
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => storageMock[k] ?? null,
    setItem: (k: string, v: string) => { storageMock[k] = v },
    removeItem: (k: string) => { delete storageMock[k] },
  })
  vi.stubEnv('NEXT_PUBLIC_APP_PIN', '1234')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

async function renderPage() {
  vi.resetModules()
  const { default: Page } = await import('@/app/page')
  render(<Page />)
}

describe('Login Page', () => {
  it('redirects to /events if already authed', async () => {
    storageMock['authed'] = '1'
    await renderPage()
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/events'))
  })

  it('shows Incorrect PIN on wrong PIN', async () => {
    await renderPage()
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '9999' } })
    fireEvent.click(screen.getByRole('button', { name: /enter/i }))
    expect(screen.getByText('Incorrect PIN')).toBeInTheDocument()
  })

  it('sets sessionStorage authed and redirects to /events on correct PIN', async () => {
    await renderPage()
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '1234' } })
    fireEvent.click(screen.getByRole('button', { name: /enter/i }))
    expect(storageMock['authed']).toBe('1')
    expect(mockPush).toHaveBeenCalledWith('/events')
  })

  it('shows Enter PIN on empty submit', async () => {
    await renderPage()
    fireEvent.click(screen.getByRole('button', { name: /enter/i }))
    expect(screen.getByText('Enter PIN')).toBeInTheDocument()
  })

  it('shows Incorrect PIN when NEXT_PUBLIC_APP_PIN is empty', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_PIN', '')
    await renderPage()
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: 'anything' } })
    fireEvent.click(screen.getByRole('button', { name: /enter/i }))
    expect(screen.getByText('Incorrect PIN')).toBeInTheDocument()
  })
})
