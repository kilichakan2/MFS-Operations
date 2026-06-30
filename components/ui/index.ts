/**
 * components/ui — Phase 0b Wave 1 (Forms) barrel.
 *
 * One import surface for every Wave-1 form primitive and its public prop types.
 * Screens import from here (e.g. `import { Button } from '@/components/ui'`)
 * rather than reaching into individual files.
 */
export { Button } from './Button'
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button'

export { IconButton } from './IconButton'
export type {
  IconButtonProps,
  IconButtonVariant,
  IconButtonSize,
} from './IconButton'

export { TextField } from './TextField'
export type { TextFieldProps } from './TextField'

export { Textarea } from './Textarea'
export type { TextareaProps } from './Textarea'

export { Select } from './Select'
export type { SelectProps, SelectOption } from './Select'

export { Checkbox } from './Checkbox'
export type { CheckboxProps, CheckedState } from './Checkbox'

export { Radio } from './Radio'
export type { RadioProps, RadioOption } from './Radio'

export { Toggle } from './Toggle'
export type { ToggleProps } from './Toggle'

export { FormField } from './FormField'
export type { FormFieldProps } from './FormField'

export { PinKeypad } from './PinKeypad'
export type { PinKeypadProps, PinKeypadLabels } from './PinKeypad'

export { Picker } from './Picker'
export type { PickerProps, PickerItem, PickerLabels } from './Picker'

// ── Phase 0b Wave 2 (Display) ──────────────────────────────────────────────
export type { Accent } from './accent'

export { Card } from './Card'
export type { CardProps } from './Card'

export { CardHead } from './CardHead'
export type { CardHeadProps } from './CardHead'

export { KpiTile } from './KpiTile'
export type { KpiTileProps } from './KpiTile'

export { StatusTile } from './StatusTile'
export type { StatusTileProps, TileState, StatusTileSize } from './StatusTile'

export { ProgressRing } from './ProgressRing'
export type { ProgressRingProps, ProgressRingSize } from './ProgressRing'

export { SectionLabel } from './SectionLabel'
export type { SectionLabelProps } from './SectionLabel'

export { PageHeading } from './PageHeading'
export type { PageHeadingProps } from './PageHeading'

export { ListRow } from './ListRow'
export type { ListRowProps } from './ListRow'

export { Table } from './Table'
export type {
  TableProps,
  TableRowProps,
  TableCellProps,
  TableHeaderCellProps,
} from './Table'

export { SegmentedControl } from './SegmentedControl'
export type { SegmentedControlProps } from './SegmentedControl'

export { Badge } from './Badge'
export type { BadgeProps } from './Badge'

export { StatusPill } from './StatusPill'
export type { StatusPillProps } from './StatusPill'

export { SyncDot } from './SyncDot'
export type { SyncDotProps, SyncState } from './SyncDot'

// ── Phase 0b Wave 3 (Overlays + Nav) ───────────────────────────────────────
export { Modal } from './Modal'
export type { ModalProps } from './Modal'

export { Banner } from './Banner'
export type { BannerProps } from './Banner'

export { Spinner } from './Spinner'
export type { SpinnerProps } from './Spinner'

export { EmptyState } from './EmptyState'
export type { EmptyStateProps } from './EmptyState'

export { Popover } from './Popover'
export type { PopoverProps } from './Popover'

export { DropdownMenu } from './DropdownMenu'
export type { DropdownMenuProps, DropdownMenuItem } from './DropdownMenu'

export { AppHeader } from './AppHeader'
export type { AppHeaderProps } from './AppHeader'

export { BottomNav } from './BottomNav'
export type { BottomNavProps } from './BottomNav'

export { MoreDrawer } from './MoreDrawer'
export type { MoreDrawerProps } from './MoreDrawer'

export { DesktopSidebar } from './DesktopSidebar'
export type { DesktopSidebarProps } from './DesktopSidebar'

export { NavItem } from './NavItem'
export type { NavItemProps } from './NavItem'

// ── Brand assets ───────────────────────────────────────────────────────────
export { default as MfsLogo } from './MfsLogo'
export { default as MfsIcon } from './MfsIcon'
