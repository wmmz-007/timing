import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPush = vi.fn()
const mockReplace = vi.fn()
const mockRouter = { push: mockPush, replace: mockReplace }

vi.mock('@/lib/db', () => ({
  getEvent: vi.fn(),
  getDistancesForEvent: vi.fn(),
  getAthletesForEvent: vi.fn(),
  getSubgroupOverrides: vi.fn(),
  updateEventPassword: vi.fn(),
  updateDistance: vi.fn(),
  deleteDistanceAndAthletes: vi.fn(),
  addDistance: vi.fn().mockResolvedValue({
    id: 'dist-2', event_id: 'evt-1', name: '21 km',
    start_time: '2026-01-01T08:00:00Z', overall_top_n: 3, default_top_n: 3,
  }),
}))

vi.mock('@/lib/storage', () => ({
  saveEvent: vi.fn(),
  saveDistances: vi.fn(),
  saveAthletes: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'evt-1' }),
  useRouter: () => mockRouter,
}))

vi.mock('@/components/DistanceList', () => ({
  default: vi.fn((props: { rows: Array<{ name: string }> }) => (
    <div
      data-testid="mock-distance-list"
      data-row-name={props.rows[0]?.name ?? ''}
    />
  )),
  rowToStartTime: vi.fn((date: string, time: string) => `${date}T${time}:00Z`),
}))

vi.mock('@/components/AthleteImport', () => ({
  default: () => <div data-testid="athlete-import" />,
}))

vi.mock('@/components/PrizeConfig', () => ({
  default: () => <div data-testid="prize-config" />,
}))

import * as db from '@/lib/db'
import SettingsPage from '@/app/event/[id]/settings/page'

const mockEvent = {
  id: 'evt-1',
  name: 'Test Marathon',
  timezone: 'Asia/Bangkok',
  overall_lockout: false,
  created_at: '2026-01-01T00:00:00Z',
  password: 'secret123',
}

const mockDistance = {
  id: 'dist-1',
  event_id: 'evt-1',
  name: '10 km',
  start_time: '2026-04-01T07:00:00.000Z',
  overall_top_n: 3,
  default_top_n: 3,
}

beforeEach(() => {
  vi.mocked(db.getEvent).mockReset()
  vi.mocked(db.getDistancesForEvent).mockReset()
  vi.mocked(db.getAthletesForEvent).mockReset()
  vi.mocked(db.getSubgroupOverrides).mockReset()
  vi.mocked(db.updateEventPassword).mockReset()
  vi.mocked(db.addDistance).mockReset()
  mockPush.mockReset()

  vi.mocked(db.getEvent).mockResolvedValue(mockEvent)
  vi.mocked(db.getDistancesForEvent).mockResolvedValue([mockDistance])
  vi.mocked(db.getAthletesForEvent).mockResolvedValue([])
  vi.mocked(db.getSubgroupOverrides).mockResolvedValue([])
  vi.mocked(db.updateEventPassword).mockResolvedValue(undefined)
  vi.mocked(db.addDistance).mockResolvedValue({
    id: 'dist-2', event_id: 'evt-1', name: '21 km',
    start_time: '2026-01-01T08:00:00Z', overall_top_n: 3, default_top_n: 3,
  })

  Object.defineProperty(navigator, 'onLine', {
    value: true, writable: true, configurable: true,
  })
})

async function renderPage() {
  render(<SettingsPage />)
  // Wait for the event to load (loading state resolves)
  await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument())
}

describe('Settings Page — Access Password', () => {
  it('displays current event password', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('secret123')).toBeInTheDocument())
  })

  it('"Change" button shows inline edit field pre-filled with current password', async () => {
    renderPage()
    await waitFor(() => screen.getByRole('button', { name: /change/i }))
    fireEvent.click(screen.getByRole('button', { name: /change/i }))
    expect(screen.getByDisplayValue('secret123')).toBeInTheDocument()
  })

  it('"Save" calls updateEventPassword with trimmed new value', async () => {
    renderPage()
    await waitFor(() => screen.getByRole('button', { name: /change/i }))
    fireEvent.click(screen.getByRole('button', { name: /change/i }))
    fireEvent.change(screen.getByDisplayValue('secret123'), { target: { value: '  newpass  ' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() =>
      expect(vi.mocked(db.updateEventPassword)).toHaveBeenCalledWith('evt-1', 'newpass')
    )
  })

  it('shows "Password cannot be empty" for blank input', async () => {
    renderPage()
    await waitFor(() => screen.getByRole('button', { name: /change/i }))
    fireEvent.click(screen.getByRole('button', { name: /change/i }))
    fireEvent.change(screen.getByDisplayValue('secret123'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(screen.getByText('Password cannot be empty')).toBeInTheDocument()
    expect(vi.mocked(db.updateEventPassword)).not.toHaveBeenCalled()
  })

  it('shows "Password must be at least 4 characters" for short password', async () => {
    renderPage()
    await waitFor(() => screen.getByRole('button', { name: /change/i }))
    fireEvent.click(screen.getByRole('button', { name: /change/i }))
    fireEvent.change(screen.getByDisplayValue('secret123'), { target: { value: 'ab' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(screen.getByText('Password must be at least 4 characters')).toBeInTheDocument()
    expect(vi.mocked(db.updateEventPassword)).not.toHaveBeenCalled()
  })

  it('"Cancel" dismisses edit without calling updateEventPassword', async () => {
    renderPage()
    await waitFor(() => screen.getByRole('button', { name: /change/i }))
    fireEvent.click(screen.getByRole('button', { name: /change/i }))
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(vi.mocked(db.updateEventPassword)).not.toHaveBeenCalled()
    expect(screen.queryByDisplayValue('secret123')).not.toBeInTheDocument()
  })

  it('strips " km" suffix when displaying loaded distance names', async () => {
    await renderPage()
    const distList = await screen.findByTestId('mock-distance-list')
    expect(distList).toHaveAttribute('data-row-name', '10')
  })

  it('shows athlete count in Athletes section header', async () => {
    await renderPage()
    expect(await screen.findByText(/athletes \(0\)/i)).toBeInTheDocument()
  })

  it('"Add Distance" button opens the inline add form', async () => {
    await renderPage()
    // The Distances section is open by default (openSection === 1)
    fireEvent.click(screen.getByRole('button', { name: /add distance/i }))
    expect(screen.getByPlaceholderText('e.g. 10')).toBeInTheDocument()
  })

  it('submitting add-distance form calls addDistance with "{n} km"', async () => {
    await renderPage()
    fireEvent.click(screen.getByRole('button', { name: /add distance/i }))
    fireEvent.change(screen.getByPlaceholderText('e.g. 10'), { target: { value: '21' } })
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }))
    await waitFor(() => {
      expect(vi.mocked(db.addDistance)).toHaveBeenCalledWith('evt-1', '21 km', expect.any(String))
    })
  })

  it('empty distance name shows "Enter a valid distance" error', async () => {
    await renderPage()
    fireEvent.click(screen.getByRole('button', { name: /add distance/i }))
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }))
    expect(screen.getByText('Enter a valid distance')).toBeInTheDocument()
    expect(vi.mocked(db.addDistance)).not.toHaveBeenCalled()
  })
})
