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
        q: 'What is aSAP?',
        a: 'aSAP (Algorithma SAP) is the internal revenue management system for Algorithma. It covers P&L planning, invoice scheduling, and agreement tracking — giving a live view of profitability, pipeline status, and the full invoice flow from plan to payment.',
      },
      {
        q: 'What are the main areas of the app?',
        a: (
          <span>
            <strong className="text-[#0F0F0F]">P&amp;L Workbench</strong> — items pushed from Sales Weekly that need to be allocated to months and moved into the P&amp;L.
            <br /><br />
            <strong className="text-[#0F0F0F]">P&amp;L Overview</strong> — the full income statement grid organised by pod, with trend chart and AI analysis.
            <br /><br />
            <strong className="text-[#0F0F0F]">Invoice Overview</strong> — the Finance view: all invoices in chronological order with aggregate cash flow, alert flags for overdue or unissued invoices, and full edit capability.
            <br /><br />
            <strong className="text-[#0F0F0F]">Invoice Planning</strong> — configuration of the invoice plan per client: upload SOWs, set agreement terms, and manage the invoice schedule.
          </span>
        ),
      },
      {
        q: 'What fiscal year does the app use?',
        a: 'August 1 through July 31. FY 25/26 runs Aug 2025 – Jul 2026. You can navigate between fiscal years using the arrow buttons at the top right of the P&L Overview page.',
      },
      {
        q: 'What does kSEK mean?',
        a: 'All amounts are displayed in thousands of SEK (kSEK). A cell showing 500 means 500 000 kr.',
      },
    ],
  },
  {
    title: 'P&L Workbench',
    items: [
      {
        q: 'How do items appear on the P&L Workbench?',
        a: 'Items are pushed automatically from Sales Weekly when a forecast or booking is created or updated. The Workbench is the staging area before revenue is allocated to specific months in the P&L.',
      },
      {
        q: 'What does it mean to allocate an item?',
        a: 'Click any item to open the allocation modal. You choose which pod it belongs to, then enter the kSEK amount per month. Once you press "Push to P&L", a revenue row is created in the P&L Overview and the item is marked as processed.',
      },
      {
        q: 'What is the green checkmark button?',
        a: 'It marks an item as processed without opening the modal — useful when the item is already in the P&L Overview from a previous push and you just want to clear it from the Workbench.',
      },
      {
        q: 'What happens when I remove an item?',
        a: 'Removing an item deletes it from the Workbench and also removes it from Sales Weekly. Use this only if the deal is dead or entered in error.',
      },
      {
        q: 'Does the Workbench update automatically?',
        a: 'Yes. The page subscribes to real-time changes, so new items pushed from Sales Weekly appear without a page reload. There is also a manual refresh button in the top-right corner.',
      },
    ],
  },
  {
    title: 'P&L Overview',
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
        a: 'Yes — use the year navigation arrows at the top right of P&L Overview. When viewing a future year, only revenue rows that have at least one B or F cell are shown, to keep the view focused on active pipeline.',
      },
      {
        q: 'Can I collapse sections to save space?',
        a: 'Yes — each pod has collapsible Revenue and Costs sub-sections. The totals row remains visible even when a section is collapsed. Collapse state is saved per browser session.',
      },
    ],
  },
  {
    title: 'Invoice Overview',
    items: [
      {
        q: 'Who is Invoice Overview for?',
        a: 'The Finance team. It shows every invoice across all clients in chronological order, with a cash flow chart at the top and a searchable table below. From here you can edit any invoice, update its status, and send Google Chat notifications.',
      },
      {
        q: 'What do the four summary tiles at the top show?',
        a: (
          <span>
            <strong className="text-[#0F0F0F]">Total planned</strong>: sum of all invoices regardless of status.<br />
            <strong className="text-[#0F0F0F]">Paid</strong>: invoices with status Paid.<br />
            <strong className="text-[#0F0F0F]">Sent / outstanding</strong>: invoices that have been sent but not yet paid.<br />
            <strong className="text-[#0F0F0F]">Needs attention</strong>: count of invoices with a red alert flag (see below).
          </span>
        ),
      },
      {
        q: 'What does the red alert dot on an invoice row mean?',
        a: (
          <span>
            A red dot appears when an invoice needs action:
            <br /><br />
            • A <strong>Draft</strong> invoice whose issue date has already passed — it should have been sent by now.<br />
            • A <strong>Draft or Sent</strong> invoice whose due date has already passed — payment is overdue.<br /><br />
            The dot disappears automatically once the invoice is edited and saved with an updated status or date.
          </span>
        ),
      },
      {
        q: 'How do I edit an invoice from Invoice Overview?',
        a: 'Hover any row and click the pencil icon (or the row itself) to open the edit modal. All fields are editable: invoice number, amount, issue date, due date, milestone label, payment trigger, status (Draft / Sent / Paid), and notes. Save to update immediately.',
      },
      {
        q: 'What is the chat icon on invoice rows?',
        a: 'It opens a Google Chat notification modal pre-filled with the invoice details. You can review and send the message to the configured webhook — useful for notifying Finance or a client contact about an invoice.',
      },
      {
        q: 'How does the search work?',
        a: 'The search box filters the invoice list in real time across client name, project, invoice number, milestone label, and notes.',
      },
      {
        q: 'Does the list re-sort automatically?',
        a: 'Yes. Whenever you save an edit that changes the issue date, the list re-sorts chronologically so the order always reflects the updated dates.',
      },
    ],
  },
  {
    title: 'Invoice Planning',
    items: [
      {
        q: 'What is Invoice Planning for?',
        a: 'Setting up and maintaining the invoice plan per client. You upload SOW/agreement documents, configure the agreement terms, and manage the invoice schedule. It is the configuration layer that feeds what Finance sees in Invoice Overview.',
      },
      {
        q: 'How is the client list organised?',
        a: 'The left sidebar shows one row per client (top-level name only), sorted alphabetically. Clicking a client opens their invoice editor on the right. A teal dot indicates the client has at least one SOW on file; a number shows how many invoices are planned.',
      },
      {
        q: 'How do I upload an SOW?',
        a: 'Select a client, then expand "Document history" and click "Upload new document". Choose the document type (Original, Amendment, or Change Request). The app will parse the PDF and extract contract terms automatically.',
      },
      {
        q: 'How do I edit or set agreement terms?',
        a: (
          <span>
            The client header card shows the active terms as chips (date range, payment terms, invoicing model, rate, FTE, etc.).
            <br /><br />
            • If no SOW is on file, a <strong>"+ Set terms"</strong> button appears — click it to enter terms manually.<br />
            • If there is an SOW, a pencil icon appears at the end of the chips row — click it to edit the parsed terms.<br />
            • If the client has multiple agreements with conflicting terms, the chips area shows <strong>"Multiple agreements"</strong> in amber. Click the Edit button to choose which agreement to update.
          </span>
        ),
      },
      {
        q: 'What invoicing models are supported?',
        a: (
          <span>
            <strong className="text-[#0F0F0F]">Milestone</strong>: invoiced on delivery of defined milestones.<br />
            <strong className="text-[#0F0F0F]">Time &amp; Materials</strong>: hourly rate × hours logged; requires hourly rate and FTE count.<br />
            <strong className="text-[#0F0F0F]">Capacity / Retainer</strong>: recurring monthly fee; requires hourly rate, FTE count, and monthly fee.<br />
            <strong className="text-[#0F0F0F]">Fixed fee</strong>: one or more fixed-price invoices; requires monthly fee.
          </span>
        ),
      },
      {
        q: 'How are invoices generated from an SOW?',
        a: 'Once a document is parsed, click "Review" in Document history (or "Generate from SOW" if no invoices exist yet). The review modal shows a suggested invoice schedule based on the parsed terms. You can adjust and confirm before the invoices are created.',
      },
      {
        q: 'What happens when a new amendment is uploaded?',
        a: 'After parsing, the app compares the amendment terms with the existing invoice plan and presents a list of suggested changes (add / modify / remove). You choose which suggestions to accept before anything is committed.',
      },
      {
        q: 'Can I add or edit invoices manually?',
        a: 'Yes. The Invoice schedule table within a client lets you add rows manually, change amounts, dates, statuses, and milestone labels, then save with the Save button.',
      },
      {
        q: 'What is the per-client cash flow chart?',
        a: 'Below the invoice schedule, a chart compares the planned P&L revenue (from the Workbench allocation) against the actual invoice schedule, across a rolling 25-month window centred on today. This shows whether invoicing is aligned with the revenue plan.',
      },
    ],
  },
  {
    title: 'Allie',
    items: [
      {
        q: 'Who is Allie?',
        a: 'Allie is aSAP\'s AI — a concise CFO assistant that gives a weekly point of view on firm profitability. She covers current-month revenue vs costs, margin health, top client mix, the quarter outlook, and a read toward fiscal year end. Her take sits in the P&L Overview below the trend chart.',
      },
      {
        q: 'How often does Allie refresh?',
        a: 'Once per week. Allie generates a fresh take on the first visit of each Monday and it is then cached locally in your browser for the rest of the week. Click the refresh icon next to the header to force a new take at any time.',
      },
      {
        q: 'What is the status pill Allie shows (On track / Watch / Below target)?',
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
