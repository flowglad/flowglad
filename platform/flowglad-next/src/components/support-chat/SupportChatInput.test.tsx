import { describe, expect, it } from 'bun:test'
import { fireEvent, render, screen } from '@testing-library/react'
import { SupportChatInput } from './SupportChatInput'

// React component tests - no beforeEach needed, each test renders fresh

describe('SupportChatInput', () => {
  describe('handleSubmit', () => {
    it('calls onSend with trimmed message and clears input after submit', () => {
      const calls: string[] = []
      const onSend = (message: string) => {
        calls.push(message)
      }
      render(<SupportChatInput onSend={onSend} />)

      const input = screen.getByPlaceholderText('Ask a question...')
      const button = screen.getByRole('button', {
        name: 'Send message',
      })

      // Type message with leading/trailing whitespace
      fireEvent.change(input, {
        target: { value: '  hello world  ' },
      })
      fireEvent.click(button)

      // onSend should be called with trimmed message
      expect(calls).toHaveLength(1)
      expect(calls[0]).toBe('hello world')

      // Input should be cleared after submit
      expect(input).toHaveValue('')
    })

    it('does not call onSend when input contains only whitespace', () => {
      const calls: string[] = []
      const onSend = (message: string) => {
        calls.push(message)
      }
      render(<SupportChatInput onSend={onSend} />)

      const input = screen.getByPlaceholderText('Ask a question...')
      const button = screen.getByRole('button', {
        name: 'Send message',
      })

      // Type only whitespace
      fireEvent.change(input, { target: { value: '   ' } })
      fireEvent.click(button)

      // onSend should NOT be called
      expect(calls).toHaveLength(0)

      // Input value should remain unchanged
      expect(input).toHaveValue('   ')
    })

    it('does not call onSend when input is empty', () => {
      const calls: string[] = []
      const onSend = (message: string) => {
        calls.push(message)
      }
      render(<SupportChatInput onSend={onSend} />)

      const button = screen.getByRole('button', {
        name: 'Send message',
      })

      // Click without typing anything
      fireEvent.click(button)

      // onSend should NOT be called
      expect(calls).toHaveLength(0)
    })
  })

  describe('keyboard handling', () => {
    it('triggers submit when Enter key is pressed', () => {
      const calls: string[] = []
      const onSend = (message: string) => {
        calls.push(message)
      }
      render(<SupportChatInput onSend={onSend} />)

      const input = screen.getByPlaceholderText('Ask a question...')

      // Type message and press Enter
      fireEvent.change(input, { target: { value: 'test message' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      // onSend should be called with the message
      expect(calls).toHaveLength(1)
      expect(calls[0]).toBe('test message')

      // Input should be cleared after submit
      expect(input).toHaveValue('')
    })

    it('does not trigger submit when Shift+Enter is pressed', () => {
      const calls: string[] = []
      const onSend = (message: string) => {
        calls.push(message)
      }
      render(<SupportChatInput onSend={onSend} />)

      const input = screen.getByPlaceholderText('Ask a question...')

      // Type message and press Shift+Enter
      fireEvent.change(input, { target: { value: 'test message' } })
      fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })

      // onSend should NOT be called (Shift+Enter should not submit)
      expect(calls).toHaveLength(0)

      // Input value should remain
      expect(input).toHaveValue('test message')
    })

    it('does not trigger submit for other keys', () => {
      const calls: string[] = []
      const onSend = (message: string) => {
        calls.push(message)
      }
      render(<SupportChatInput onSend={onSend} />)

      const input = screen.getByPlaceholderText('Ask a question...')

      // Type and press a non-Enter key
      fireEvent.change(input, { target: { value: 'test' } })
      fireEvent.keyDown(input, { key: 'a' })

      // onSend should NOT be called
      expect(calls).toHaveLength(0)
    })
  })

  describe('disabled state', () => {
    it('disables both input and button when disabled prop is true', () => {
      const onSend = () => {}
      render(<SupportChatInput onSend={onSend} disabled={true} />)

      const input = screen.getByPlaceholderText('Ask a question...')
      const button = screen.getByRole('button', {
        name: 'Send message',
      })

      // Both should be disabled
      expect(input).toBeDisabled()
      expect(button).toBeDisabled()
    })

    it('disables only button when input is empty but disabled prop is false', () => {
      const onSend = () => {}
      render(<SupportChatInput onSend={onSend} disabled={false} />)

      const input = screen.getByPlaceholderText('Ask a question...')
      const button = screen.getByRole('button', {
        name: 'Send message',
      })

      // Input should NOT be disabled
      expect(input).not.toBeDisabled()

      // Button should be disabled because input is empty
      expect(button).toBeDisabled()
    })

    it('enables button when input has non-whitespace content and disabled is false', () => {
      const onSend = () => {}
      render(<SupportChatInput onSend={onSend} disabled={false} />)

      const input = screen.getByPlaceholderText('Ask a question...')
      const button = screen.getByRole('button', {
        name: 'Send message',
      })

      // Type some content
      fireEvent.change(input, { target: { value: 'hello' } })

      // Input should NOT be disabled
      expect(input).not.toBeDisabled()

      // Button should now be enabled
      expect(button).not.toBeDisabled()
    })
  })
})
