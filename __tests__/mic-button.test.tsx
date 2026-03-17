import { render, screen, fireEvent } from '@testing-library/react'
import MicButton from '@/components/MicButton'

describe('MicButton', () => {
  it('renders idle state when listening=false', () => {
    render(<MicButton listening={false} onToggle={() => {}} />)
    expect(screen.getByRole('button')).toHaveTextContent('กดพูดเลขบิบ')
  })

  it('renders listening state when listening=true', () => {
    render(<MicButton listening={true} onToggle={() => {}} />)
    expect(screen.getByRole('button')).toHaveTextContent('กำลังฟัง...')
  })

  it('calls onToggle when pressed', () => {
    const onToggle = vi.fn()
    render(<MicButton listening={false} onToggle={onToggle} />)
    fireEvent.pointerDown(screen.getByRole('button'))
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('does not call onToggle when disabled', () => {
    const onToggle = vi.fn()
    render(<MicButton listening={false} onToggle={onToggle} disabled />)
    fireEvent.pointerDown(screen.getByRole('button'))
    expect(onToggle).not.toHaveBeenCalled()
  })
})
