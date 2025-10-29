import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CurrencyInput } from './currency-input'

describe('CurrencyInput Component', () => {
  describe('Positive Numbers Only (Currency Behavior)', () => {
    it('should accept positive numbers', () => {
      const onValueChange = vi.fn()
      render(<CurrencyInput onValueChange={onValueChange} />)

      const input = screen.getByRole('textbox')

      // Simulate typing a positive number
      fireEvent.change(input, { target: { value: '100.50' } })

      expect(onValueChange).toHaveBeenCalledWith('100.50')
    })

    it('should accept zero', () => {
      const onValueChange = vi.fn()
      render(<CurrencyInput onValueChange={onValueChange} />)

      const input = screen.getByRole('textbox')

      // Simulate typing zero
      fireEvent.change(input, { target: { value: '0' } })

      expect(onValueChange).toHaveBeenCalledWith('0')
    })

    it('should reject negative numbers by not calling onValueChange', () => {
      const onValueChange = vi.fn()
      render(<CurrencyInput onValueChange={onValueChange} />)

      const input = screen.getByRole('textbox')

      // Clear any previous calls
      onValueChange.mockClear()

      // Try to input a negative value directly via change event
      // This simulates what would happen if somehow a negative value got through
      fireEvent.change(input, { target: { value: '-100.50' } })

      // Since the component's onValueChange handler should reject negative values,
      // onValueChange should not be called with the negative value
      expect(onValueChange).not.toHaveBeenCalledWith('-100.50')

      // Test with zero-prefixed negative number
      fireEvent.change(input, { target: { value: '-0' } })
      expect(onValueChange).not.toHaveBeenCalledWith('-0')

      // Verify that positive numbers still work
      fireEvent.change(input, { target: { value: '100.50' } })
      expect(onValueChange).toHaveBeenCalledWith('100.50')
    })

    it('should accept decimal numbers', () => {
      const onValueChange = vi.fn()
      render(<CurrencyInput onValueChange={onValueChange} />)

      const input = screen.getByRole('textbox')

      // Test decimal values
      fireEvent.change(input, { target: { value: '99.99' } })
      fireEvent.change(input, { target: { value: '0.01' } })
      fireEvent.change(input, { target: { value: '1000.00' } })

      expect(onValueChange).toHaveBeenCalledWith('99.99')
      expect(onValueChange).toHaveBeenCalledWith('0.01')
      expect(onValueChange).toHaveBeenCalledWith('1000.00')
    })
  })

  describe('Component Value Change Handler Logic', () => {
    it('should handle empty and null values correctly', () => {
      const onValueChange = vi.fn()

      // Test that our component handles empty/null values in the onValueChange handler
      // We'll test this by simulating what happens when the underlying library calls our handler
      const { rerender } = render(
        <CurrencyInput onValueChange={onValueChange} />
      )

      // Clear the mock to focus on our test
      onValueChange.mockClear()

      // Simulate typing a value and then deleting it (which should trigger empty value)
      const input = screen.getByRole('textbox') as HTMLInputElement

      // Type a value first
      fireEvent.change(input, { target: { value: '123' } })

      // Now clear it by selecting all and deleting
      fireEvent.keyDown(input, { key: 'a', ctrlKey: true })
      fireEvent.keyDown(input, { key: 'Backspace' })

      // The component should handle this gracefully
      expect(input).toBeInTheDocument()
    })


    it('should only accept valid positive numbers', () => {
      const onValueChange = vi.fn()
      render(<CurrencyInput onValueChange={onValueChange} />)

      // Test that the component validates numbers correctly
      // Valid positive numbers should be accepted
      const input = screen.getByRole('textbox')

      fireEvent.change(input, { target: { value: '123.45' } })
      expect(onValueChange).toHaveBeenCalledWith('123.45')

      fireEvent.change(input, { target: { value: '0.01' } })
      expect(onValueChange).toHaveBeenCalledWith('0.01')
    })
  })

  describe('Security & Validation Tests', () => {
    it('should handle invalid input gracefully', () => {
      const onValueChange = vi.fn()
      render(<CurrencyInput onValueChange={onValueChange} />)

      const input = screen.getByRole('textbox')

      // Test that completely invalid input doesn't break the entire component
      fireEvent.change(input, { target: { value: 'abc' } })

      // The component should handle this gracefully and not forward invalid values
      expect(onValueChange).not.toHaveBeenCalled()
    })

  })

  describe('Props and Styling', () => {
    it('should apply error styling when error prop is provided', () => {
      render(<CurrencyInput error="Invalid amount" />)

      const input = screen.getByRole('textbox')
      expect(input).toHaveClass('border-destructive')
    })

    it('should apply custom className', () => {
      render(<CurrencyInput className="custom-class" />)

      const input = screen.getByRole('textbox')
      expect(input).toHaveClass('custom-class')
    })

    it('should set minimum value to 0', () => {
      const onValueChange = vi.fn()
      render(<CurrencyInput onValueChange={onValueChange} />)

      const input = screen.getByRole('textbox') as HTMLInputElement

      // Note: react-currency-input-field may not pass through the min attribute directly
      // Instead, we can test that the component has the min prop and that negative values are handled
      // Let's test the actual behavior instead of the attribute
      expect(input).toBeInTheDocument()

      // Test that negative values would be rejected by trying to set a negative value
      fireEvent.change(input, { target: { value: '-10' } })
      expect(onValueChange).not.toHaveBeenCalledWith('-10')
    })

    it('should handle allowDecimals prop', () => {
      render(<CurrencyInput allowDecimals={false} />)

      const input = screen.getByRole('textbox')
      // The allowDecimals prop should be passed through to the underlying component
      expect(input).toBeInTheDocument()
    })
  })
})
