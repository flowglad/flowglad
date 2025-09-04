#!/bin/bash

# Fix import paths systematically
# Strategy: Split imports for files that use both core and cn

echo "=== Phase 1: Fix files that import both core and cn ==="
echo "Processing files with 'core, { cn }' pattern..."

# Files that import both core and cn - split the imports
files_with_both=(
  "platform/flowglad-next/src/components/PaymentForm.tsx"
  "platform/flowglad-next/src/components/FileInput.tsx" 
  "platform/flowglad-next/src/components/CheckoutPage.tsx"
  "platform/flowglad-next/src/app/onboarding/OnboardingStatusTable.tsx"
)

for file in "${files_with_both[@]}"; do
  if [ -f "$file" ]; then
    echo "Processing: $file"
    # Replace 'import core, { cn } from '@/utils/core'' with two separate imports
    sed -i '' 's/import core, { cn } from '\''@\/utils\/core'\''/import { cn } from "@\/lib\/utils"\
import core from "@\/utils\/core"/g' "$file"
  fi
done

echo "=== Phase 1 complete ==="
echo ""
echo "=== Phase 2: Verify changes ==="
grep -n "import.*cn.*from.*@/utils/core" platform/flowglad-next/src/components/PaymentForm.tsx || echo "✅ PaymentForm.tsx imports fixed"
grep -n "import.*cn.*from.*@/lib/utils" platform/flowglad-next/src/components/PaymentForm.tsx || echo "❌ cn import not found"
grep -n "import core from.*@/utils/core" platform/flowglad-next/src/components/PaymentForm.tsx || echo "❌ core import not found"
