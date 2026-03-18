import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import EventHubPage from '@/app/event/[id]/page'

describe('EventHubPage', () => {
  it('renders back link to /events', async () => {
    const jsx = await EventHubPage({ params: Promise.resolve({ id: 'e1' }) })
    render(jsx)
    const links = screen.getAllByRole('link')
    const backLink = links.find(l => l.getAttribute('href') === '/events')
    expect(backLink).toBeTruthy()
  })
})
