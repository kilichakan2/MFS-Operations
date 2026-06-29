'use client'

import { useState, type ReactNode } from 'react'
import {
  Card,
  CardHead,
  KpiTile,
  SectionLabel,
  PageHeading,
  ListRow,
  Table,
  SegmentedControl,
  Badge,
  StatusPill,
  SyncDot,
} from '@/components/ui'

// ── Small inline demo icons (caller-supplied ReactNode; no icon library) ──────
const BoxIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" /><path d="m3 8 9 5 9-5M12 13v8" />
  </svg>
)
const UsersIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M16 21v-2a4 4 0 0 0-8 0v2" /><circle cx="12" cy="7" r="4" />
  </svg>
)

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

const RANGE_OPTIONS = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
]

/** All Wave-2 display components in every state. Rendered inside each panel. */
export function GalleryDisplay() {
  const [range, setRange] = useState('today')

  return (
    <div>
      <div className="mb-4 mt-2 font-text text-[12px] font-semibold uppercase tracking-[0.2em] text-action-primary">
        Wave 2 · Display
      </div>

      <Group title="PageHeading + SectionLabel">
        <PageHeading eyebrow="Admin · Daily glance">
          <div className="mt-1">
            <SectionLabel>Range</SectionLabel>
          </div>
        </PageHeading>
      </Group>

      <Group title="Card + CardHead">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHead icon={BoxIcon} title="Today's orders" count={12} />
            <p className="text-body-sm text-muted">12 orders placed across 4 customers.</p>
          </Card>
          <Card href={'/orders' as never}>
            <CardHead icon={UsersIcon} title="Prospects" />
            <p className="text-body-sm text-muted">Clickable card — whole surface is a link.</p>
          </Card>
          <Card compact>
            <CardHead title="Compact card" count="3" compact />
            <p className="text-body-sm text-muted">Tighter padding for dense layouts.</p>
          </Card>
        </div>
      </Group>

      <Group title="KpiTile · per accent">
        <div className="grid grid-cols-2 gap-3">
          <KpiTile value={24} label="Orders" accent="success" sub="12 placed / 8 printed" href={'/orders' as never} />
          <KpiTile value={3} label="At risk" accent="warning" sub="needs a visit" href={'/orders' as never} />
          <KpiTile value={1} label="Stuck" accent="danger" href={'/orders' as never} />
          <KpiTile value="£4.2k" label="Pipeline" accent="navy" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <KpiTile value={9} label="Compact" accent="navy" compact sub="dense row" />
          <KpiTile value={5} label="No link" accent="success" />
        </div>
      </Group>

      <Group title="ListRow · accent dots">
        <Card compact>
          <ListRow accent="success" cells={<span className="text-body-sm">The Harbour Kitchen</span>} />
          <ListRow accent="warning" cells={<span className="text-body-sm">Naz Restaurant</span>} />
          <ListRow accent="danger" cells={<span className="text-body-sm">Al Turka Grill</span>} />
          <ListRow last cells={<span className="text-body-sm">No accent · last row</span>} />
        </Card>
      </Group>

      <Group title="Table · semantic compound">
        <Card compact>
          <Table>
            <Table.Head>
              <Table.Row>
                <Table.HeaderCell>Customer</Table.HeaderCell>
                <Table.HeaderCell align="end">Orders</Table.HeaderCell>
                <Table.HeaderCell hideBelow="md">Last visit</Table.HeaderCell>
              </Table.Row>
            </Table.Head>
            <Table.Body>
              <Table.Row>
                <Table.Cell>The Harbour Kitchen</Table.Cell>
                <Table.Cell align="end">12</Table.Cell>
                <Table.Cell hideBelow="md">Mon 27</Table.Cell>
              </Table.Row>
              <Table.Row>
                <Table.Cell>Naz Restaurant</Table.Cell>
                <Table.Cell align="end">4</Table.Cell>
                <Table.Cell hideBelow="md">Tue 28</Table.Cell>
              </Table.Row>
              <Table.Row last>
                <Table.Cell>Al Turka Grill</Table.Cell>
                <Table.Cell align="end">1</Table.Cell>
                <Table.Cell hideBelow="md">Wed 29</Table.Cell>
              </Table.Row>
            </Table.Body>
          </Table>
        </Card>
      </Group>

      <Group title="SegmentedControl · live">
        <SegmentedControl
          value={range}
          onChange={setRange}
          options={RANGE_OPTIONS}
          aria-label="Date range"
        />
      </Group>

      <Group title="Badge · neutral + accent tones">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>7</Badge>
          <Badge tone="success">Live</Badge>
          <Badge tone="warning">Due</Badge>
          <Badge tone="danger">Stuck</Badge>
          <Badge tone="navy">Pipeline</Badge>
        </div>
      </Group>

      <Group title="StatusPill · per accent">
        <div className="flex flex-wrap items-center gap-4">
          <StatusPill accent="success" label="Live" />
          <StatusPill accent="warning" label="At risk" />
          <StatusPill accent="danger" label="Lost" />
          <StatusPill accent="navy" label="Prospect" />
        </div>
      </Group>

      <Group title="SyncDot · all states">
        <div className="flex flex-wrap items-center gap-4">
          <SyncDot state="synced" time="14:05" />
          <SyncDot state="syncing" time="14:06" />
          <SyncDot state="syncing" />
          <SyncDot state="stuck" />
          <span className="text-body-sm text-muted">(clean renders nothing →)</span>
          <SyncDot state="clean" />
        </div>
      </Group>
    </div>
  )
}
