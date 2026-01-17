/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, mock } from 'bun:test'
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { trpc } from '@/app/_trpc/client'
import DeleteApiKeyModal from '@/components/forms/DeleteApiKeyModal'
import { asMock } from '@/test-utils/mockHelpers'

// Mock tRPC
mock.module('@/app/_trpc/client', () => ({
  trpc: {
    apiKeys: {
      delete: {
        useMutation: mock(() => undefined),
      },
    },
  },
}))

// Mock FormModal to provide a simpler test interface
mock.module('@/components/forms/FormModal', async () => {
  // biome-ignore lint/plugin: dynamic import required for vi.mock factory
  const React = await import('react')
  function FormModalMock({
    children,
    onSubmit,
    isOpen,
    setIsOpen,
    title,
  }: {
    children: React.ReactNode
    onSubmit: () => Promise<void>
    isOpen: boolean
    setIsOpen: (open: boolean) => void
    title: string
  }) {
    if (!isOpen) return null
    return (
      <div data-testid="delete-modal">
        <h2 data-testid="modal-title">{title}</h2>
        {children}
        <button
          data-testid="confirm-delete-button"
          onClick={async () => {
            await onSubmit()
            setIsOpen(false)
          }}
        >
          Confirm Delete
        </button>
        <button
          data-testid="cancel-button"
          onClick={() => setIsOpen(false)}
        >
          Cancel
        </button>
      </div>
    )
  }
  return {
    default: FormModalMock,
    NestedFormModal: FormModalMock,
  }
})

describe('DeleteApiKeyModal', () => {
  const mockMutateAsync = mock(async () => undefined)
  const mockSetIsOpen = mock(() => undefined)

  beforeEach(() => {
    mockMutateAsync.mockClear()
    mockSetIsOpen.mockClear()
    asMock(trpc.apiKeys.delete.useMutation).mockReturnValue({
      mutateAsync: mockMutateAsync,
    } as unknown as ReturnType<
      typeof trpc.apiKeys.delete.useMutation
    >)
  })

  it('should render delete confirmation message when open', () => {
    render(
      <DeleteApiKeyModal
        isOpen={true}
        setIsOpen={mockSetIsOpen}
        id="apikey_test123"
      />
    )

    expect(screen.getByTestId('delete-modal')).toBeInTheDocument()
    expect(screen.getByTestId('modal-title')).toHaveTextContent(
      'Delete Api key'
    )
    expect(
      screen.getByText(
        /Are you sure you want to delete this API Key/i
      )
    ).toBeInTheDocument()
    expect(
      screen.getByText(/This action cannot be undone/i)
    ).toBeInTheDocument()
  })

  it('should not render when isOpen is false', () => {
    render(
      <DeleteApiKeyModal
        isOpen={false}
        setIsOpen={mockSetIsOpen}
        id="apikey_test123"
      />
    )

    expect(
      screen.queryByTestId('delete-modal')
    ).not.toBeInTheDocument()
  })

  it('should call delete mutation with correct id on confirm', async () => {
    mockMutateAsync.mockResolvedValue(undefined)

    render(
      <DeleteApiKeyModal
        isOpen={true}
        setIsOpen={mockSetIsOpen}
        id="apikey_test123"
      />
    )

    const confirmButton = screen.getByTestId('confirm-delete-button')
    fireEvent.click(confirmButton)

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        id: 'apikey_test123',
      })
    })
  })

  it('should close modal after successful deletion', async () => {
    mockMutateAsync.mockResolvedValue(undefined)

    render(
      <DeleteApiKeyModal
        isOpen={true}
        setIsOpen={mockSetIsOpen}
        id="apikey_test123"
      />
    )

    const confirmButton = screen.getByTestId('confirm-delete-button')
    fireEvent.click(confirmButton)

    await waitFor(() => {
      expect(mockSetIsOpen).toHaveBeenCalledWith(false)
    })
  })

  it('should close modal when cancel is clicked', () => {
    render(
      <DeleteApiKeyModal
        isOpen={true}
        setIsOpen={mockSetIsOpen}
        id="apikey_test123"
      />
    )

    const cancelButton = screen.getByTestId('cancel-button')
    fireEvent.click(cancelButton)

    expect(mockSetIsOpen).toHaveBeenCalledWith(false)
  })
})
