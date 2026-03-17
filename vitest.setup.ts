import '@testing-library/jest-dom'

// Mock localStorage for tests (jsdom's implementation may be incomplete)
const store: Record<string, string> = {}
global.localStorage = {
  getItem: (key: string) => store[key] || null,
  setItem: (key: string, value: string) => {
    store[key] = value.toString()
  },
  removeItem: (key: string) => {
    delete store[key]
  },
  clear: () => {
    for (const key in store) {
      delete store[key]
    }
  },
  get length(): number {
    return Object.keys(store).length
  },
  key: (index: number) => {
    const keys = Object.keys(store)
    return keys[index] || null
  },
} as Storage
