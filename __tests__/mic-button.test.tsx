import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MicButton from '@/components/MicButton'

describe('MicButton', () => {
  it('renders idle label when listening=false', () => {
    render(<MicButton listening={false} onToggle={() => {}} />)
    expect(screen.getByRole('button')).toHaveTextContent('กดเปิดไมค์')
  })

  it('renders listening label when listening=true', () => {
    render(<MicButton listening={true} onToggle={() => {}} />)
    expect(screen.getByRole('button')).toHaveTextContent('กดปิดไมค์')
  })

  it('calls onToggle on click when not listening', () => {
    const onToggle = vi.fn()
    render(<MicButton listening={false} onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('calls onToggle on click when listening (toggle off)', () => {
    const onToggle = vi.fn()
    render(<MicButton listening={true} onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('does not call onToggle when disabled', () => {
    const onToggle = vi.fn()
    render(<MicButton listening={false} onToggle={onToggle} disabled />)
    fireEvent.click(screen.getByRole('button'))
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('applies listening styles when listening=true', () => {
    render(<MicButton listening={true} onToggle={() => {}} />)
    const btn = screen.getByRole('button')
    expect(btn.className).toContain('bg-red-500')
    expect(btn.className).toContain('animate-pulse')
  })

  it('applies idle styles when listening=false', () => {
    render(<MicButton listening={false} onToggle={() => {}} />)
    expect(screen.getByRole('button').className).toContain('bg-black')
  })
})
