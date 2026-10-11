import { PriceAdjustmentTable } from '../components/PriceAdjustmentTable'

export function CustomerPriceAdjustmentPage() {
  return (
    <PriceAdjustmentTable
      priceType="CUSTOMER"
      title="Customer-Wise Price Adjustment"
      description="Manage the customer-wise special rate tier across your product catalog."
      columnLabel="Customer-Wise Rate (₹)"
      fieldKey="customer_price"
    />
  )
}
