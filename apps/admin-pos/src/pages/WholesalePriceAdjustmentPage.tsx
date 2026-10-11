import { PriceAdjustmentTable } from '../components/PriceAdjustmentTable'

export function WholesalePriceAdjustmentPage() {
  return (
    <PriceAdjustmentTable
      priceType="WHOLESALE"
      title="Wholesale Price Adjustment"
      description="Manage the wholesale selling price tier across your product catalog."
      columnLabel="Wholesale Price (₹)"
      fieldKey="wholesale_price"
    />
  )
}
