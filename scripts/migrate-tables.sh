#!/bin/bash

# Migrate all Table components from Ion to shadcn

echo "Starting Table migration from Ion to shadcn..."

# List of files that use Ion Table components
FILES=(
  "platform/flowglad-next/src/components/InvoicesTable.tsx"
  "platform/flowglad-next/src/app/store/usage-meters/UsageMetersTable.tsx"
  "platform/flowglad-next/src/app/store/purchases/PurchasesTable.tsx"
  "platform/flowglad-next/src/app/store/products/[id]/PricesTable.tsx"
  "platform/flowglad-next/src/app/store/products/ProductsTable.tsx"
  "platform/flowglad-next/src/app/store/pricing-models/PricingModelsTable.tsx"
  "platform/flowglad-next/src/app/store/discounts/DiscountsTable.tsx"
  "platform/flowglad-next/src/app/settings/webhooks/WebhooksTable.tsx"
  "platform/flowglad-next/src/app/settings/teammates/OrganizationMembersTable.tsx"
  "platform/flowglad-next/src/app/settings/api-keys/ApiKeysTable.tsx"
  "platform/flowglad-next/src/app/finance/subscriptions/[id]/SubscriptionItemsTable.tsx"
  "platform/flowglad-next/src/app/finance/subscriptions/SubscriptionsTable.tsx"
  "platform/flowglad-next/src/app/finance/payments/PaymentsTable.tsx"
  "platform/flowglad-next/src/app/features/FeaturesTable.tsx"
  "platform/flowglad-next/src/app/customers/[id]/PurchasesTable.tsx"
  "platform/flowglad-next/src/app/customers/CustomersTable.tsx"
)

for FILE in "${FILES[@]}"; do
  if [ -f "$FILE" ]; then
    echo "Migrating $FILE..."
    
    # Replace Ion Table import with shadcn DataTable
    sed -i '' "s|import Table from '@/components/ion/Table'|import { DataTable } from '@/components/ui/data-table'|g" "$FILE"
    
    # Remove ColumnHeaderCell import
    sed -i '' "/import ColumnHeaderCell from '@\/components\/ion\/ColumnHeaderCell'/d" "$FILE"
    
    # Replace <Table with <DataTable
    sed -i '' 's|<Table|<DataTable|g' "$FILE"
    sed -i '' 's|</Table>|</DataTable>|g' "$FILE"
    
    # Replace ColumnHeaderCell usage with simple strings
    # This is a more complex replacement that needs to handle multi-line patterns
    perl -i -0pe 's/header:\s*\(\{\s*column\s*\}\)\s*=>\s*\(\s*<ColumnHeaderCell\s+title="([^"]+)"\s+column=\{column\}\s*\/>\s*\)/header: "$1"/gs' "$FILE"
    
    echo "  ✓ Migrated $FILE"
  else
    echo "  ✗ File not found: $FILE"
  fi
done

echo ""
echo "Table migration complete!"
echo "Please review the changes and test the application."