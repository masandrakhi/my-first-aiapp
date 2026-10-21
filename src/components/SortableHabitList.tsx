import type { ReactNode } from 'react'
import {
  closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent, type KeyboardSensorOptions, type Modifier, type PointerSensorOptions,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers'
import type { HabitId } from '../types'

interface SortableHabitListProps {
  label: string
  /** Item ids in display order; each child calls `useSortableWiring(id)` for its own id. */
  ids: HabitId[]
  onReorder: (activeId: HabitId, overId: HabitId) => void
  children: ReactNode
}

// Module-level constants: dnd-kit memoizes on identity, and fresh objects each render would make
// every sortable item re-render whenever the list's parent does.
const MODIFIERS: Modifier[] = [restrictToVerticalAxis, restrictToParentElement]
// The handle has touch-action: none, so a small distance is enough on touch screens too.
const POINTER_OPTIONS: PointerSensorOptions = { activationConstraint: { distance: 4 } }
const KEYBOARD_OPTIONS: KeyboardSensorOptions = { coordinateGetter: sortableKeyboardCoordinates }

/** A vertical list whose items are reordered by dragging their grip handle (mouse, touch, or keyboard). */
export function SortableHabitList({ label, ids, onReorder, children }: SortableHabitListProps) {
  const sensors = useSensors(useSensor(PointerSensor, POINTER_OPTIONS), useSensor(KeyboardSensor, KEYBOARD_OPTIONS))

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) onReorder(String(active.id), String(over.id))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={MODIFIERS} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className="space-y-3" aria-label={label}>
          {children}
        </ul>
      </SortableContext>
    </DndContext>
  )
}
