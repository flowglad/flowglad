#!/bin/bash

echo "=== Fixing Component Import Paths ==="
echo "Strategy: Component files should import cn from @/lib/utils"

component_files=$(find platform/flowglad-next/src/components -name "*.tsx" -exec grep -l "@/utils/core" {} \;)

for file in $component_files; do
    echo "Processing: $file"
    
    # Check if file uses cn function
    if grep -q "\bcn(" "$file"; then
        echo "  → File uses cn function, needs @/lib/utils import"
        
        # Check if it imports only core default
        if grep -q "^import core from ['\"]@/utils/core['\"]" "$file"; then
            echo "  → Adding cn import alongside core"
            # Add cn import before the core import
            sed -i '' '/^import core from/i\
import { cn } from "@/lib/utils"
' "$file"
        fi
        
        # Check if it has other patterns and might need different handling
        if grep -q "import.*{.*}.*from ['\"]@/utils/core['\"]" "$file"; then
            echo "  → Complex import pattern, manual review needed: $file"
        fi
    else
        echo "  → File doesn't use cn function, keeping @/utils/core"
    fi
    
    echo ""
done

echo "=== Component import fix complete ==="
