import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import ManualBibInput from '@/components/ManualBibInput'

describe('ManualBibInput v2', () => {
  it('opens numpad when กรอกบิบเอง tapped', () => {
    render(<ManualBibInput onSubmit={() => {}} />)
    fireEvent.click(screen.getByText('กรอกบิบเอง'))
    expect(screen.getByText('บันทึก')).toBeInTheDocument()
  })

  it('stays open after submit', () => {
    const onSubmit = vi.fn()
    render(<ManualBibInput onSubmit={onSubmit} />)
    fireEvent.click(screen.getByText('กรอกบิบเอง'))
    fireEvent.click(screen.getByText('2'))
    fireEvent.click(screen.getByText('3'))
    fireEvent.click(screen.getByText('5'))
    fireEvent.click(screen.getByText('บันทึก'))
    expect(onSubmit).toHaveBeenCalledOnce()
    // Numpad still visible
    expect(screen.getByText('บันทึก')).toBeInTheDocument()
  })

  it('clears input after submit', () => {
    render(<ManualBibInput onSubmit={() => {}} />)
    fireEvent.click(screen.getByText('กรอกบิบเอง'))
    fireEvent.click(screen.getByText('2'))
    // Verify bib shows "2" before submit
    expect(screen.getByText('2', { selector: 'span.font-mono' })).toBeInTheDocument()
    fireEvent.click(screen.getByText('บันทึก'))
    // After submit, input should show placeholder dash
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('closes when X button tapped', () => {
    render(<ManualBibInput onSubmit={() => {}} />)
    fireEvent.click(screen.getByText('กรอกบิบเอง'))
    fireEvent.click(screen.getByRole('button', { name: 'close' })) // X button with aria-label="close"
    expect(screen.getByText('กรอกบิบเอง')).toBeInTheDocument()
    expect(screen.queryByText('บันทึก')).not.toBeInTheDocument()
  })
})
