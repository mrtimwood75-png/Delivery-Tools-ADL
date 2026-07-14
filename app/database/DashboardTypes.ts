export type Customer = {
  name: string
  phone: string | null
  address: string | null
  street_address?: string | null
  suburb?: string | null
  state?: string | null
  postcode?: string | null
  delivery_notes?: string | null
}

export type OrderItem = {
  id: string
  product_name: string
  product_code: string | null
  quantity: number
  cubic_meters: number
  notes: string | null
}

export type Order = {
  id: string
  customer_id?: string
  order_number: string
  payment_status: string
  order_status: string
  ready_status?: string | null
  goods_ready_date: string | null
  goods_in_date: string | null
  delivery_date: string | null
  stripe_link: string | null
  stripe_link_expires_at?: string | null
  payment_due: number
  service_time?: number | null
  sms_status: string | null
  date_sent: string | null
  order_notes?: string | null
  archived_at?: string | null
  exported_at?: string | null
  salesperson?: string | null
  source?: string | null
  delivery_confirmation?: string | null
  has_reply?: boolean
  imported_at?: string
  import_date?: string
  customers: Customer | Customer[] | null
  items?: OrderItem[]
}
