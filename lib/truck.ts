import { supabase } from '@/lib/supabase'

// What the signed-in technician carries on their truck (loaded by the
// inventory staff). Used on the Materials tab and when finishing a job.

export type TruckItem = {
  item_id: string
  name: string
  unit: string | null
  quantity: number
  min_quantity: number
  low: boolean
}

export async function fetchTruckStock(): Promise<TruckItem[]> {
  try {
    const { data, error } = await supabase.rpc('my_truck_stock')
    if (error || !Array.isArray(data)) return []
    return (data as TruckItem[]).map((row) => ({
      ...row,
      quantity: Number(row.quantity),
      min_quantity: Number(row.min_quantity),
    }))
  } catch {
    return []
  }
}
