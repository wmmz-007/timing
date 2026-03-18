import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockPush = vi.fn()
const mockReplace = vi.fn()
const mockGetEventByPassword = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}))

vi.mock('@/lib/db', () => ({
  getEventByPassword: (...args: unknown[]) => mockGetEventByPassword(...args),
}))

let storageMock: Record<string, string> = {}

beforeEach(() => {
  storageMock = {}
  mockPush.mockReset()
  mockReplace.mockReset()
  mockGetEventByPassword.mockReset()
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => storageMock[k] ?? null,
    setItem: (k: string, v: string) => { storageMock[k] = v },
    removeItem: (k: string) => { delete storageMock[k] },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// Use vi.resetModules() + dynamic import so the fresh module picks up the mocks
// (consistent with the rest of the test suite that mocks @/lib/db)
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

  it('shows "Incorrect password" when getEventByPassword returns null', async () => {
    mockGetEventByPassword.mockResolvedValue(null)
    await renderPage()
    fireEvent.change(screen.getByLabelText('Event Password'), { target: { value: 'wrongpass' } })
    fireEvent.click(screen.getByRole('button', { name: /enter/i }))
    await waitFor(() => expect(screen.getByText('Incorrect password')).toBeInTheDocument())
  })

  it('sets sessionStorage authed and calls router.push on correct password', async () => {
    mockGetEventByPassword.mockResolvedValue({
      id: 'e1', name: 'Test', timezone: 'Asia/Bangkok',
      overall_lockout: false, created_at: '', password: 'pass1234',
    })
    await renderPage()
    fireEvent.change(screen.getByLabelText('Event Password'), { target: { value: 'pass1234' } })
    fireEvent.click(screen.getByRole('button', { name: /enter/i }))
    await waitFor(() => {
      expect(storageMock['authed']).toBe('1')
      expect(mockPush).toHaveBeenCalledWith('/event/e1')
    })
  })

  it('shows "Enter password" on empty submit', async () => {
    await renderPage()
    fireEvent.click(screen.getByRole('button', { name: /enter/i }))
    expect(screen.getByText('Enter password')).toBeInTheDocument()
    expect(mockGetEventByPassword).not.toHaveBeenCalled()
  })

  it('does not call getEventByPassword when input is whitespace-only', async () => {
    await renderPage()
    fireEvent.change(screen.getByLabelText('Event Password'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: /enter/i }))
    expect(screen.getByText('Enter password')).toBeInTheDocument()
    expect(mockGetEventByPassword).not.toHaveBeenCalled()
  })
})
