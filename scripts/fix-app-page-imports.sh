#!/bin/bash

echo "=== Fixing App Page Import Paths ==="
echo "Strategy: App pages (UI) should import cn from @/lib/utils"

app_files=$(find platform/flowglad-next/src/app -name "*.tsx" -exec grep -l "@/utils/core" {} \;)

for file in $app_files; do
    echo "Processing: $file"
    
    # Check if file uses cn function
    if grep -q "\bcn(" "$file"; then
        echo "  → File uses cn function, needs @/lib/utils import"
        
        # Check current import pattern and add cn import if needed
        if grep -q "^import core from ['\"]@/utils/core['\"]" "$file"; then
            echo "  → Adding cn import alongside core"
            sed -i '' '/^import core from/i\
import { cn } from "@/lib/utils"
' "$file"
        elif grep -q "^import.*core.*from ['\"]@/utils/core['\"]" "$file"; then
            echo "  → Complex import, needs manual review: $file"
        fi
    else
        echo "  → File doesn't use cn function, keeping @/utils/core"
    fi
    
    echo ""
done

echo "=== App page import fix complete ==="
