import { PriceAdjustmentTable } from '../components/PriceAdjustmentTable'

export function RetailPriceAdjustmentPage() {
  return (
    <PriceAdjustmentTable
      priceType="RETAIL"
      title="Retail Price Adjustment"
      description="Manage the retail selling price tier across your product catalog."
      columnLabel="Retail Price (₹)"
      fieldKey="retail_price"
    />
  )
}
