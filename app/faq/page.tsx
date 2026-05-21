'use client'

import { useState } from 'react'

interface FAQItem {
  q: string
  a: React.ReactNode
}

const SECTIONS: { title: string; items: FAQItem[] }[] = [
  {
    title: 'Overview',
    items: [
      {
        q: 'What is the Revenue Plan app?',
        a: 'A monthly income statement tool for Algorithma. It shows revenue and costs per pod across the current fiscal year (August–July), giving a live view of profitability, margin, and pipeline status.',
      },
      {
        q: 'What are the two main areas of the app?',
        a: (
          <span>
            <strong className="text-[#0F0F0F]">Work List</strong> — items pushed from Sales Weekly that need to be allocated to months and moved into the P&amp;L.
            <br /><br />
            <strong className="text-[#0F0F0F]">P&amp;L Plan</strong> — the full income statement grid organised by pod, showing revenue rows, cost rows, CB1%, and a summary with trend chart and AI analysis.
          </span>
        ),
      },
      {
        q: 'What fiscal year does the app use?',
        a: 'August 1 through July 31. FY 25/26 runs Aug 2025 – Jul 2026. You can navigate between fiscal years using the arrow buttons at the top right of the P&L Plan page.',
      },
      {
        q: 'What does kSEK mean?',
        a: 'All amounts are displayed in thousands of SEK (kSEK). A cell showing 500 means 500 000 kr.',
      },
    ],
  },
  {
    title: 'Work List',
    items: [
      {
        q: 'How do items appear on the Work List?',
        a: 'Items are pushed automatically from Sales Weekly when a forecast or booking is created or updated. The Work List is the staging area before revenue is allocated to specific months in the P&L.',
      },
      {
        q: 'What does it mean to allocate an item?',
        a: 'Click any Work List item to open the allocation modal. You choose which pod it belongs to, then enter the kSEK amount per month. Once you press "Push to P&L", a revenue row is created in the P&L Plan and the item is marked as processed.',
      },
      {
        q: 'What is the green checkmark button?',
        a: 'It marks an item as processed without opening the modal — useful when the item is already in the P&L Plan from a previous push and you just want to clear it from the Work List.',
      },
      {
        q: 'What happens when I remove an item?',
        a: 'Removing an item deletes it from the Work List and also removes it from Sales Weekly. Use this only if the deal is dead or entered in error.',
      },
      {
        q: 'Does the Work List update automatically?',
        a: 'Yes. The page subscribes to real-time changes, so new items pushed from Sales Weekly appear without a page reload. There is also a manual refresh button in the top-right corner.',
      },
    ],
  },
  {
    title: 'P&L Plan',
    items: [
      {
        q: 'What are pods?',
        a: 'Pods are the internal delivery units (e.g. Pod A, Pod B, Algorithma Technologies). Each pod has its own revenue and cost rows. "Other NoPod" captures revenue and costs not assigned to a specific pod.',
      },
      {
        q: 'What do the A / B / F status badges mean?',
        a: (
          <span>
            <strong className="text-[#0F0F0F]">A — Actual</strong>: revenue or cost has been confirmed / invoiced.<br />
            <strong className="text-[#0F0F0F]">B — Booking</strong>: signed contract, not yet invoiced.<br />
            <strong className="text-[#0F0F0F]">F — Forecast</strong>: pipeline — likely but not signed.<br /><br />
            Click any badge to cycle between statuses. Only A and B cells are included in revenue totals and CB1% calculations. F cells are shown separately as pipeline.
          </span>
        ),
      },
      {
        q: 'How do I add a revenue row manually?',
        a: 'Click "+ Add revenue item" at the bottom of the Revenue section in any pod. Enter the client name, an optional project description, and amounts per month.',
      },
      {
        q: 'Can I edit or delete a revenue row?',
        a: 'Yes — click the client name in any revenue row to open the edit modal. You can update the client name, comment, pod assignment, monthly amounts, and notes. Existing A/B/F statuses are preserved when you save. The delete button in the modal removes the row entirely.',
      },
      {
        q: 'What is the Notes field in the edit modal?',
        a: 'A free-text field for any context you want to store against a revenue item — deal background, stakeholder names, caveats, etc. Notes are saved to the database and pre-filled the next time you open the modal.',
      },
      {
        q: 'What happens when I add a new month row in the edit modal?',
        a: 'The month field is pre-filled with the calendar month immediately after the last existing row, so you can tab straight to the amount without manually setting the date. You can still change it if needed.',
      },
      {
        q: 'How do I add a cost item?',
        a: 'Click "+ Add cost item" in the Costs section of any pod. Enter the category, an optional comment, and monthly amounts.',
      },
      {
        q: 'What is CB1%?',
        a: 'Contribution margin percentage: (Total A+B revenue − Total costs) ÷ Total A+B revenue. It shows how much of booked revenue remains after direct costs. A healthy CB1% is generally above 20%. CB1% is not shown for the Other NoPod sections.',
      },
      {
        q: 'What does the trend chart show?',
        a: 'A bar chart across all 12 months of the fiscal year with bars for Revenue (A+B), Costs, and Profit on the left axis (kSEK), plus a dashed line for YTD accumulated Margin % on the right axis. A teal vertical line marks the current month. The chart is open by default and can be collapsed.',
      },
      {
        q: 'What is the Revenue Mix chart?',
        a: 'A donut chart to the right of the AI summary showing the share of YTD A+B revenue by customer. The top 5 customers are named individually; all others are grouped as "Others". The centre shows the total kSEK. Each customer also has a RAG trend arrow (see below) and a share percentage in the legend.',
      },
      {
        q: 'What do the RAG trend arrows mean on revenue rows and in the Revenue Mix?',
        a: (
          <span>
            Each customer shows a small coloured circle with an arrow reflecting how their revenue is trending — calculated by comparing the average A+B revenue in the <em>last three months</em> against the average of the earlier YTD months:
            <br /><br />
            <strong className="text-[#16A34A]">Green ↑</strong>: last-3-month average is more than 10% above the earlier average.<br />
            <strong className="text-[#D97706]">Amber →</strong>: within ±10% (stable).<br />
            <strong className="text-[#DC2626]">Red ↓</strong>: last-3-month average is more than 10% below the earlier average.<br /><br />
            The trend is aggregated across all rows for the same client (e.g. a customer with five project rows is evaluated as one). No arrow is shown if there are fewer than four YTD months of data.
          </span>
        ),
      },
      {
        q: 'What is the "aging" highlight on cells?',
        a: 'A cell is flagged as aging when its month is in the past but the status is still F or B (not yet confirmed as A). This is a prompt to update the status to reflect what actually happened.',
      },
      {
        q: 'Can I view a future fiscal year?',
        a: 'Yes — use the year navigation arrows at the top right of P&L Plan. When viewing a future year, only revenue rows that have at least one B or F cell are shown, to keep the view focused on active pipeline.',
      },
      {
        q: 'Can I collapse sections to save space?',
        a: 'Yes — each pod has collapsible Revenue and Costs sub-sections. The totals row remains visible even when a section is collapsed. Collapse state is saved per browser session.',
      },
    ],
  },
  {
    title: 'AI Summary',
    items: [
      {
        q: 'What does the AI summary show?',
        a: 'A short weekly analysis of firm profitability — covering current-month revenue vs costs, margin health, top client mix, the quarter outlook, and a read toward fiscal year end. It sits below the trend chart alongside the Revenue Mix donut, acting as a narrative voice-over to the numbers.',
      },
      {
        q: 'How often does it refresh?',
        a: 'Once per week. The summary is generated fresh on the first visit of each Monday and then cached locally in your browser for the rest of the week. Click the refresh icon next to the summary header to force a new generation at any time.',
      },
      {
        q: 'What is the status pill (On track / Watch / Below target)?',
        a: (
          <span>
            Derived from the current month&apos;s margin percentage (A+B revenue vs costs):
            <br /><br />
            <strong className="text-[#16A34A]">On track</strong>: margin ≥ 20%<br />
            <strong className="text-[#B45309]">Watch</strong>: margin 0–20%<br />
            <strong className="text-[#DC2626]">Below target</strong>: margin negative
          </span>
        ),
      },
    ],
  },
  {
    title: 'Access & Admin',
    items: [
      {
        q: 'How is access controlled?',
        a: 'Sign-in uses Google OAuth. Only email addresses listed in the allowed emails table can sign in. Access is managed from the "Manage access" option in the user menu (top right).',
      },
      {
        q: 'Will removing someone from Revenue Plan affect their Sales Weekly access?',
        a: 'No. The two apps have independent access control. Removing an email here only prevents sign-in to the Revenue Plan.',
      },
      {
        q: 'Who can be granted access?',
        a: 'Only @algorithma.ai email addresses can be added. Attempting to add an outside email address will be rejected.',
      },
    ],
  },
]

function FAQEntry({ item }: { item: FAQItem }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-[#F3F4F6] last:border-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-start justify-between gap-4 px-5 py-4 text-left hover:bg-[#F9F9F8] transition-colors"
      >
        <span className="text-sm font-medium text-[#0F0F0F]">{item.q}</span>
        <svg
          viewBox="0 0 16 16" fill="currentColor"
          className={`w-3.5 h-3.5 text-[#9CA3AF] flex-shrink-0 mt-0.5 transition-transform duration-200 ${open ? 'rotate-0' : '-rotate-90'}`}
        >
          <path fillRule="evenodd" d="M1.646 4.646a.5.5 0 01.708 0L8 10.293l5.646-5.647a.5.5 0 01.708.708l-6 6a.5.5 0 01-.708 0l-6-6a.5.5 0 010-.708z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <div className="px-5 pb-4 text-sm text-[#374151] leading-relaxed">
          {item.a}
        </div>
      )}
    </div>
  )
}

export default function FAQPage() {
  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#0F0F0F] tracking-tight">FAQ</h1>
        <p className="text-sm text-[#6B7280] mt-1">How the Revenue Plan works.</p>
      </div>

      <div className="space-y-6">
        {SECTIONS.map(section => (
          <div key={section.title}>
            <h2 className="text-[11px] font-bold text-[#9CA3AF] uppercase tracking-widest mb-2 px-1">
              {section.title}
            </h2>
            <div className="bg-white rounded-2xl border border-[#EBEBEB] overflow-hidden shadow-sm">
              {section.items.map((item, i) => (
                <FAQEntry key={i} item={item} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
