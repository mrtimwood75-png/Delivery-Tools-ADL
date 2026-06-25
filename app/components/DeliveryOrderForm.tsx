'use client'

import { FormEvent, useState } from 'react'
import { supabase } from '@/lib/supabase'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export default function DeliveryOrderForm() {
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [message, setMessage] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaveState('saving')
    setMessage('')

    const form = new FormData(event.currentTarget)
    const orderNumber = String(form.get('order_number') || '').trim()
    const name = String(form.get('name') || '').trim()
    const phone = String(form.get('phone') || '').trim()
    const address = String(form.get('address') || '').trim()
    const rawItems = String(form.get('items') || '').trim()
    const paymentStatus = String(form.get('payment_status') || 'Pending')
    const orderStatus = String(form.get('order_status') || 'Open')
    const goodsReadyDate = String(form.get('goods_ready_date') || '')
    const stripeLink = String(form.get('stripe_link') || '').trim()
    const paymentDue = Number(form.get('payment_due') || 0)

    if (!orderNumber || !name) {
      setSaveState('error')
      setMessage('Order and customer name are required.')
      return
    }

    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .insert({ name, phone, address })
      .select('id')
      .single()

    if (customerError || !customer) {
      setSaveState('error')
      setMessage(customerError?.message || 'Could not save customer.')
      return
    }

    const { data: order, error: orderError } = await supabase
      .from('delivery_orders')
      .insert({
        order_number: orderNumber,
        customer_id: customer.id,
        payment_status: paymentStatus,
        order_status: orderStatus,
        goods_ready_date: goodsReadyDate || null,
        stripe_link: stripeLink || null,
        payment_due: Number.isFinite(paymentDue) ? paymentDue : 0
      })
      .select('id')
      .single()

    if (orderError || !order) {
      setSaveState('error')
      setMessage(orderError?.message || 'Could not save order.')
      return
    }

    const items = rawItems
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((product_name) => ({
        order_id: order.id,
        product_name,
        quantity: 1
      }))

    if (items.length > 0) {
      const { error: itemsError } = await supabase
        .from('delivery_order_items')
        .insert(items)

      if (itemsError) {
        setSaveState('error')
        setMessage(itemsError.message)
        return
      }
    }

    event.currentTarget.reset()
    setSaveState('saved')
    setMessage('Delivery order saved.')
  }

  return (
    <form className="grid" onSubmit={handleSubmit}>
      <div className="grid grid-2">
        <label>
          Order
          <input name="order_number" placeholder="Order number" required />
        </label>
        <label>
          Name
          <input name="name" placeholder="Customer name" required />
        </label>
        <label>
          Phone
          <input name="phone" placeholder="Phone" />
        </label>
        <label>
          Goods Ready Date
          <input name="goods_ready_date" type="date" />
        </label>
      </div>

      <label>
        Address
        <textarea name="address" placeholder="Delivery address" />
      </label>

      <label>
        Items
        <textarea name="items" placeholder="One product per line" />
      </label>

      <div className="grid grid-2">
        <label>
          Payment Status
          <select name="payment_status" defaultValue="Pending">
            <option>Pending</option>
            <option>Part Paid</option>
            <option>Paid</option>
            <option>Overdue</option>
          </select>
        </label>
        <label>
          Order Status
          <select name="order_status" defaultValue="Open">
            <option>Open</option>
            <option>Awaiting Goods</option>
            <option>Goods Ready</option>
            <option>Delivery Booked</option>
            <option>Delivered</option>
            <option>Cancelled</option>
          </select>
        </label>
        <label>
          Stripe Link
          <input name="stripe_link" placeholder="https://..." />
        </label>
        <label>
          Payment Due
          <input name="payment_due" type="number" min="0" step="0.01" placeholder="0.00" />
        </label>
      </div>

      <button type="submit" disabled={saveState === 'saving'}>
        {saveState === 'saving' ? 'Saving...' : 'Save delivery order'}
      </button>

      {message ? <p className="muted">{message}</p> : null}
    </form>
  )
}
