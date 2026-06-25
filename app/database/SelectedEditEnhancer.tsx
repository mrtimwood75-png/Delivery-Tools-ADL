'use client'

import { useEffect } from 'react'

type Customer = {
  name: string
  delivery_notes: string | null
}

type Order = {
  id: string
  order_number: string
  customers: Customer | Customer[] | null
}

function customerOf(order: Order): Customer | null {
  return Array.isArray(order.customers) ? order.customers[0] || null : order.customers
}

function selectedMainRows() {
  const tables = Array.from(document.querySelectorAll('table'))
  const mainTable = tables.find((table) => table.textContent?.includes('Customer Status') && table.textContent?.includes('Stripe Link'))
  if (!mainTable) return [] as HTMLTableRowElement[]

  return Array.from(mainTable.querySelectorAll('tbody > tr')).filter((row) => {
    const firstCell = row.querySelector('td:first-child')
    const checkbox = firstCell?.querySelector('input[type="checkbox"]') as HTMLInputElement | null
    return Boolean(checkbox?.checked)
  }) as HTMLTableRowElement[]
}

async function patchOrder(id: string, update: Record<string, string>) {
  await fetch('/api/orders', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...update })
  })
}

function field(label: string, value: string, onSave: (value: string) => void) {
  const wrapper = document.createElement('label')
  wrapper.style.display = 'grid'
  wrapper.style.gap = '5px'
  wrapper.style.fontSize = '13px'
  wrapper.style.fontWeight = '700'
  wrapper.textContent = label

  const input = document.createElement(label === 'Delivery notes' ? 'textarea' : 'input') as HTMLInputElement | HTMLTextAreaElement
  input.value = value
  input.style.width = '100%'
  input.style.padding = '8px 10px'
  input.style.border = '1px solid #d6c8b8'
  input.style.borderRadius = '8px'
  input.style.fontSize = '14px'
  if (input instanceof HTMLTextAreaElement) input.rows = 3
  input.addEventListener('blur', () => onSave(input.value))

  wrapper.appendChild(input)
  return wrapper
}

function addCustomerEditor(row: HTMLTableRowElement, order: Order) {
  const c = customerOf(order)
  const nextRow = row.nextElementSibling as HTMLTableRowElement | null
  if (!nextRow || nextRow.querySelector('[data-selected-edit-panel="true"]')) return

  const container = nextRow.querySelector('td[colspan] > div') as HTMLDivElement | null
  if (!container) return

  const panel = document.createElement('div')
  panel.dataset.selectedEditPanel = 'true'
  panel.style.display = 'grid'
  panel.style.gridTemplateColumns = 'minmax(220px, 1fr) minmax(320px, 2fr)'
  panel.style.gap = '12px'
  panel.style.padding = '12px'
  panel.style.border = '1px solid #ddd4c8'
  panel.style.borderRadius = '12px'
  panel.style.background = '#fffdf9'

  panel.appendChild(field('Customer name', c?.name || '', async (value) => patchOrder(order.id, { name: value })))
  panel.appendChild(field('Delivery notes', c?.delivery_notes || '', async (value) => patchOrder(order.id, { delivery_notes: value })))

  container.prepend(panel)
}

async function runEdit() {
  const rows = selectedMainRows()
  if (!rows.length) return

  const ordersResponse = await fetch('/api/orders', { cache: 'no-store' })
  const ordersJson = await ordersResponse.json()
  const orders = (ordersJson.orders || []) as Order[]
  const ordersByNumber = new Map(orders.map((order) => [order.order_number, order]))

  rows.forEach((row) => {
    const viewButton = Array.from(row.querySelectorAll('button')).find((button) => button.textContent?.startsWith('View')) as HTMLButtonElement | undefined
    if (viewButton) viewButton.click()
  })

  window.setTimeout(() => {
    selectedMainRows().forEach((row) => {
      const orderNumber = row.children[3]?.textContent?.trim() || ''
      const order = ordersByNumber.get(orderNumber)
      if (order) addCustomerEditor(row, order)
    })
  }, 150)
}

function ensureEditButton() {
  const selectedBars = Array.from(document.querySelectorAll('div')).filter((element) => element.textContent?.includes('Selected:'))
  const bar = selectedBars.find((element) => Array.from(element.querySelectorAll('button')).some((button) => button.textContent === 'Mark Ready')) as HTMLDivElement | undefined
  if (!bar || bar.querySelector('[data-selected-edit-button="true"]')) return

  const editButton = document.createElement('button')
  editButton.type = 'button'
  editButton.textContent = 'Edit'
  editButton.dataset.selectedEditButton = 'true'
  editButton.title = 'Edit selected customer and product details'
  editButton.addEventListener('click', runEdit)

  const firstButton = bar.querySelector('button')
  bar.insertBefore(editButton, firstButton)
}

export default function SelectedEditEnhancer() {
  useEffect(() => {
    ensureEditButton()
    const observer = new MutationObserver(ensureEditButton)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  return null
}
