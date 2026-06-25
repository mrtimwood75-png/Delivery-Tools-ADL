import { parseIriseItems, IriseItemRow } from './iriseItems'

export type PackingListRow = IriseItemRow

export function parsePackingList(fileText: string): PackingListRow[] {
  return parseIriseItems(fileText)
}
