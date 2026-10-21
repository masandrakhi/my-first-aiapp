import { Modal } from './Modal'

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="mb-6 text-stone-600 dark:text-stone-300">{message}</p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          autoFocus
          className="h-12 flex-1 rounded-2xl bg-stone-100 font-medium hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="h-12 flex-1 rounded-2xl bg-rose-600 font-medium text-white hover:bg-rose-700"
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
