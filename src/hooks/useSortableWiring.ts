import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { SortableWiring } from '../components/HabitCard'
import type { HabitId } from '../types'

/** Drag-and-drop wiring for one item inside a <SortableHabitList>, shaped for HabitCard's `sortable` prop. */
export function useSortableWiring(id: HabitId): SortableWiring {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return {
    ref: setNodeRef,
    style: { transform: CSS.Translate.toString(transform), transition, position: 'relative' },
    dragging: isDragging,
    handleProps: { ...attributes, ...listeners },
  }
}
