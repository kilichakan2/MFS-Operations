'use client'

import { useState, type ReactNode } from 'react'
import {
  Button,
  IconButton,
  TextField,
  Textarea,
  Select,
  Checkbox,
  Radio,
  Toggle,
  FormField,
  PinKeypad,
  Picker,
  type CheckedState,
  type PickerItem,
} from '@/components/ui'

// ── Small inline demo icons (caller-supplied ReactNode; no icon library) ──────
const PlusIcon = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
)
const ArrowIcon = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
)
const DotsIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" />
  </svg>
)
const SearchIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
  </svg>
)
const TrashIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
  </svg>
)

const SELECT_OPTIONS = [
  { value: 'meat', label: 'Meat' },
  { value: 'poultry', label: 'Poultry' },
  { value: 'frozen', label: 'Frozen' },
  { value: 'chilled', label: 'Chilled' },
]

const RADIO_OPTIONS = [
  { value: 'case', label: 'Case' },
  { value: 'kg', label: 'Kg' },
  { value: 'unit', label: 'Unit', disabled: true },
]

const PICKER_ITEMS: PickerItem[] = [
  { id: '1', label: 'The Harbour Kitchen', sublabel: 'Sheffield' },
  { id: '2', label: 'Naz Restaurant', sublabel: 'Leeds' },
  { id: '3', label: 'The Corner Cafe', sublabel: 'York' },
  { id: '4', label: 'Al Turka Grill', sublabel: 'Manchester' },
]

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-6">
      <div className="mb-3 font-text text-[10.5px] font-semibold uppercase tracking-[0.13em] text-subtle">
        {title}
      </div>
      {children}
    </div>
  )
}

/** All Wave-1 components in every state. Rendered inside each theme×density panel. */
export function GalleryForms() {
  const [check1, setCheck1] = useState<CheckedState>(true)
  const [check2, setCheck2] = useState<CheckedState>(false)
  const [radioVal, setRadioVal] = useState('case')
  const [toggle1, setToggle1] = useState(true)
  const [toggle2, setToggle2] = useState(false)
  const [selectVal, setSelectVal] = useState<string | undefined>(undefined)
  const [pinError, setPinError] = useState<string | undefined>(undefined)
  const [pinReset, setPinReset] = useState(0)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [picked, setPicked] = useState<string | undefined>(undefined)

  const handlePin = (pin: string) => {
    if (pin === '1234') {
      setPinError(undefined)
      window.setTimeout(() => setPinReset((n) => n + 1), 400)
    } else {
      setPinError('Wrong PIN — try 1234')
    }
  }

  return (
    <div>
      <Group title="Button · variants">
        <div className="flex flex-wrap items-end gap-3">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="primary" disabled>Disabled</Button>
        </div>
      </Group>

      <Group title="Button · sizes, icons, loading, full-width">
        <div className="flex flex-wrap items-end gap-3">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
          <Button leadingIcon={PlusIcon}>New order</Button>
          <Button variant="ghost" trailingIcon={ArrowIcon}>Continue</Button>
          <Button loading>Saving</Button>
        </div>
        <div className="mt-3">
          <Button fullWidth>Full-width · place order</Button>
        </div>
      </Group>

      <Group title="IconButton">
        <div className="flex flex-wrap items-center gap-3">
          <IconButton aria-label="More" icon={DotsIcon} variant="ghost" />
          <IconButton aria-label="Add" icon={PlusIcon} variant="primary" />
          <IconButton aria-label="Search" icon={SearchIcon} variant="neutral" />
          <IconButton aria-label="Delete" icon={TrashIcon} variant="danger" />
          <IconButton aria-label="More small" icon={DotsIcon} variant="ghost" size="sm" />
        </div>
      </Group>

      <Group title="TextField · FormField states">
        <div className="flex flex-col gap-4">
          <FormField label="Business name" hint="As it appears on invoices">
            <TextField defaultValue="The Harbour Kitchen" />
          </FormField>
          <FormField label="Delivery postcode" error="Enter a full UK postcode">
            <TextField error defaultValue="S3 8" />
          </FormField>
          <FormField label="Account ref" hint="Assigned by MFS">
            <TextField disabled defaultValue="MFS-00417" />
          </FormField>
          <FormField label="Unit price">
            <TextField prefix="£" suffix="/ kg" defaultValue="24.50" />
          </FormField>
          <FormField label="Division">
            <Select
              options={SELECT_OPTIONS}
              value={selectVal}
              onValueChange={setSelectVal}
              placeholder="Choose a division"
            />
          </FormField>
        </div>
      </Group>

      <Group title="Textarea">
        <FormField label="Notes">
          <Textarea
            showCount
            maxLength={280}
            defaultValue="Deliver to rear loading bay before 06:00. Driver to call on arrival."
          />
        </FormField>
      </Group>

      <Group title="Checkbox">
        <div className="flex flex-col gap-3">
          <Checkbox label="Print label on pick" checked={check1} onCheckedChange={setCheck1} />
          <Checkbox label="Email confirmation" checked={check2} onCheckedChange={setCheck2} />
          <Checkbox label="Select all · indeterminate" checked="indeterminate" />
          <Checkbox label="Disabled" disabled />
        </div>
      </Group>

      <Group title="Radio · order unit">
        <Radio
          options={RADIO_OPTIONS}
          value={radioVal}
          onValueChange={setRadioVal}
          name="order-unit"
          aria-label="Order unit"
        />
      </Group>

      <Group title="Toggle / Switch">
        <div className="flex flex-col gap-3">
          <Toggle label="Offline mode" checked={toggle1} onCheckedChange={setToggle1} />
          <Toggle label="Silent printing" checked={toggle2} onCheckedChange={setToggle2} />
          <Toggle label="Disabled" disabled />
        </div>
      </Group>

      <Group title="PinKeypad · try 1234">
        <PinKeypad
          onComplete={handlePin}
          title="Welcome back"
          status="Enter your PIN"
          error={pinError}
          resetSignal={pinReset}
          onReset={() => setPinReset((n) => n + 1)}
        />
      </Group>

      <Group title="Picker · bottom-sheet">
        <Button onClick={() => setPickerOpen(true)}>
          {picked ?? 'Select customer'}
        </Button>
        <Picker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          items={PICKER_ITEMS}
          selectedId={PICKER_ITEMS.find((i) => i.label === picked)?.id}
          onSelect={(item) => setPicked(item.label)}
          title="Select customer"
          footerAction={{ label: 'New prospect', onPress: () => setPicked('New prospect') }}
        />
      </Group>
    </div>
  )
}
