// __tests__/capture-toast.test.tsx
import { render, screen, fireEvent, act } from '@testing-library/react'
import CaptureToast from '@/components/CaptureToast'

const TZ = 'Asia/Bangkok'
const successToast = {
  toastId: 'tid-1',
  type: 'saved' as const,
  bib: '235',
  finishTime: '2026-03-17T03:42:05.000Z',
  localId: 'lid-1',
}
const dupToast = {
  toastId: 'tid-2',
  type: 'duplicate' as const,
  bib: '235',
  newTime: '2026-03-17T03:42:10.000Z',
  existingTime: '2026-03-17T03:42:05.000Z',
}

describe('CaptureToast', () => {
  it('renders success toast with bib number', () => {
    render(<CaptureToast toasts={[successToast]} timezone={TZ} onUndo={() => {}} onOverwrite={() => {}} onSkip={() => {}} onDismiss={() => {}} />)
    expect(screen.getByText(/บิบ 235/)).toBeInTheDocument()
    expect(screen.getByText('ย้อนกลับ')).toBeInTheDocument()
  })

  it('calls onUndo with localId when undo tapped', () => {
    const onUndo = vi.fn()
    render(<CaptureToast toasts={[successToast]} timezone={TZ} onUndo={onUndo} onOverwrite={() => {}} onSkip={() => {}} onDismiss={() => {}} />)
    fireEvent.click(screen.getByText('ย้อนกลับ'))
    expect(onUndo).toHaveBeenCalledWith('lid-1')
  })

  it('calls onDismiss with toastId after 2 seconds', () => {
    vi.useFakeTimers()
    const onDismiss = vi.fn()
    render(<CaptureToast toasts={[successToast]} timezone={TZ} onUndo={() => {}} onOverwrite={() => {}} onSkip={() => {}} onDismiss={onDismiss} />)
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onDismiss).toHaveBeenCalledWith('tid-1')
    vi.useRealTimers()
  })

  it('renders duplicate toast with อ่านใหม่ and ข้าม buttons', () => {
    render(<CaptureToast toasts={[dupToast]} timezone={TZ} onUndo={() => {}} onOverwrite={() => {}} onSkip={() => {}} onDismiss={() => {}} />)
    expect(screen.getByText(/235 ซ้ำ/)).toBeInTheDocument()
    expect(screen.getByText('อ่านใหม่')).toBeInTheDocument()
    expect(screen.getByText('ข้าม')).toBeInTheDocument()
  })

  it('calls onOverwrite with bib when อ่านใหม่ tapped', () => {
    const onOverwrite = vi.fn()
    render(<CaptureToast toasts={[dupToast]} timezone={TZ} onUndo={() => {}} onOverwrite={onOverwrite} onSkip={() => {}} onDismiss={() => {}} />)
    fireEvent.click(screen.getByText('อ่านใหม่'))
    expect(onOverwrite).toHaveBeenCalledWith('235')
  })

  it('calls onSkip when ข้าม tapped', () => {
    const onSkip = vi.fn()
    render(<CaptureToast toasts={[dupToast]} timezone={TZ} onUndo={() => {}} onOverwrite={() => {}} onSkip={onSkip} onDismiss={() => {}} />)
    fireEvent.click(screen.getByText('ข้าม'))
    expect(onSkip).toHaveBeenCalledOnce()
  })

  it('renders nothing when toasts array is empty', () => {
    const { container } = render(<CaptureToast toasts={[]} timezone={TZ} onUndo={() => {}} onOverwrite={() => {}} onSkip={() => {}} onDismiss={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('success toast auto-dismiss does not interfere with a duplicate toast in the queue', () => {
    vi.useFakeTimers()
    const onDismiss = vi.fn()
    const onSkip = vi.fn()
    render(
      <CaptureToast
        toasts={[successToast, dupToast]}
        timezone={TZ}
        onUndo={() => {}} onOverwrite={() => {}} onSkip={onSkip} onDismiss={onDismiss}
      />
    )
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onDismiss).toHaveBeenCalledWith('tid-1')
    expect(onSkip).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})
