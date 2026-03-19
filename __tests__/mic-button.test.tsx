import { render, screen, fireEvent } from '@testing-library/react'
import MicButton from '@/components/MicButton'

describe('MicButton', () => {
  it('renders idle state when listening=false', () => {
    render(<MicButton listening={false} onPressStart={() => {}} onPressEnd={() => {}} />)
    expect(screen.getByRole('button')).toHaveTextContent('Hold to Record Bib')
  })

  it('renders listening state when listening=true', () => {
    render(<MicButton listening={true} onPressStart={() => {}} onPressEnd={() => {}} />)
    expect(screen.getByRole('button')).toHaveTextContent('Listening...')
  })

  it('calls onPressStart on pointerDown', () => {
    const onPressStart = vi.fn()
    render(<MicButton listening={false} onPressStart={onPressStart} onPressEnd={() => {}} />)
    fireEvent.pointerDown(screen.getByRole('button'))
    expect(onPressStart).toHaveBeenCalledOnce()
  })

  it('calls onPressEnd on pointerUp', () => {
    const onPressEnd = vi.fn()
    render(<MicButton listening={true} onPressStart={() => {}} onPressEnd={onPressEnd} />)
    fireEvent.pointerUp(screen.getByRole('button'))
    expect(onPressEnd).toHaveBeenCalledOnce()
  })

  it('calls onPressEnd on pointerLeave', () => {
    const onPressEnd = vi.fn()
    render(<MicButton listening={true} onPressStart={() => {}} onPressEnd={onPressEnd} />)
    fireEvent.pointerLeave(screen.getByRole('button'))
    expect(onPressEnd).toHaveBeenCalledOnce()
  })

  it('calls onPressEnd on pointerCancel', () => {
    const onPressEnd = vi.fn()
    render(<MicButton listening={true} onPressStart={() => {}} onPressEnd={onPressEnd} />)
    fireEvent.pointerCancel(screen.getByRole('button'))
    expect(onPressEnd).toHaveBeenCalledOnce()
  })

  it('does not call onPressStart when disabled', () => {
    const onPressStart = vi.fn()
    render(<MicButton listening={false} onPressStart={onPressStart} onPressEnd={() => {}} disabled />)
    fireEvent.pointerDown(screen.getByRole('button'))
    expect(onPressStart).not.toHaveBeenCalled()
  })

  it('does not call onPressEnd when disabled', () => {
    const onPressEnd = vi.fn()
    render(<MicButton listening={false} onPressStart={() => {}} onPressEnd={onPressEnd} disabled />)
    fireEvent.pointerUp(screen.getByRole('button'))
    expect(onPressEnd).not.toHaveBeenCalled()
  })
})
