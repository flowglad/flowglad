#!/bin/bash

# Migrate TableTitle from Ion to shadcn TableHeader

echo "Starting TableTitle migration to shadcn TableHeader..."

# List of files that use TableTitle
FILES=(
  "platform/flowglad-next/src/app/customers/[id]/PurchasesTable.tsx"
  "platform/flowglad-next/src/app/settings/teammates/OrganizationMembersTable.tsx"
  "platform/flowglad-next/src/app/store/products/[id]/PricesTable.tsx"
  "platform/flowglad-next/src/app/store/usage-meters/UsageMetersTable.tsx"
  "platform/flowglad-next/src/app/customers/[id]/CustomerDetailsBillingTab.tsx"
  "platform/flowglad-next/src/app/store/products/[id]/InternalProductDetailsPage.tsx"
  "platform/flowglad-next/src/app/store/pricing-models/[id]/InnerPricingModelDetailsPage.tsx"
  "platform/flowglad-next/src/app/settings/OrganizationSettingsTab.tsx"
  "platform/flowglad-next/src/app/finance/subscriptions/[id]/InnerSubscriptionPage.tsx"
  "platform/flowglad-next/src/app/purchase/access/[purchaseId]/AccessResourcesView.tsx"
  "platform/flowglad-next/src/app/settings/ApiSettingsTab.tsx"
)

for FILE in "${FILES[@]}"; do
  if [ -f "$FILE" ]; then
    echo "Migrating $FILE..."
    
    # Replace TableTitle import with TableHeader
    sed -i '' "s|import TableTitle from '@/components/ion/TableTitle'|import { TableHeader } from '@/components/ui/table-header'|g" "$FILE"
    
    # Replace <TableTitle with <TableHeader
    sed -i '' 's|<TableTitle|<TableHeader|g' "$FILE"
    sed -i '' 's|</TableTitle>|</TableHeader>|g' "$FILE"
    
    echo "  ✓ Migrated $FILE"
  else
    echo "  ✗ File not found: $FILE"
  fi
done

echo ""
echo "TableTitle migration complete!"