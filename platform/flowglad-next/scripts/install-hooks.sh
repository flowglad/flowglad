#!/bin/bash

# Script to install git hooks for registry validation

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$( cd "$SCRIPT_DIR/.." && pwd )"
# Use git rev-parse to reliably find the .git directory
GIT_DIR="$(git -C "$PROJECT_DIR" rev-parse --git-dir 2>/dev/null)"
if [ -z "$GIT_DIR" ]; then
    echo "Error: Not in a git repository"
    exit 1
fi
# Convert to absolute path if it's relative
if [[ "$GIT_DIR" != /* ]]; then
    GIT_DIR="$PROJECT_DIR/$GIT_DIR"
fi
HOOKS_DIR="$GIT_DIR/hooks"

# Create hooks directory if it doesn't exist
mkdir -p "$HOOKS_DIR"

echo "Installing git hooks for shadcn registry validation..."

# Create pre-commit hook
cat > "$HOOKS_DIR/pre-commit" << 'EOF'
#!/bin/bash

# Pre-commit hook for shadcn registry validation

# Change to the flowglad-next directory
cd platform/flowglad-next 2>/dev/null || cd flowglad-next 2>/dev/null || true

# Check if we're in the right directory
if [ -f "registry.json" ]; then
    echo "Running shadcn registry validation..."
    
    # Check if tsx is available
    if command -v pnpm &> /dev/null; then
        pnpm validate:registry
        VALIDATION_EXIT_CODE=$?
    elif command -v npx &> /dev/null; then
        npx tsx src/scripts/validate-registry.ts
        VALIDATION_EXIT_CODE=$?
    else
        echo "Warning: Could not run registry validation (pnpm/npx not found)"
        VALIDATION_EXIT_CODE=0
    fi
    
    if [ $VALIDATION_EXIT_CODE -ne 0 ]; then
        echo ""
        echo "❌ Registry validation failed. Please fix the errors before committing."
        echo "Run 'pnpm validate:registry' to see detailed errors."
        exit 1
    fi
    
    echo "✅ Registry validation passed"
fi

# Continue with commit
exit 0
EOF

# Make the hook executable
chmod +x "$HOOKS_DIR/pre-commit"

echo "✅ Git hooks installed successfully!"
echo ""
echo "The pre-commit hook will now validate registry.json before each commit."
echo "To bypass the hook (not recommended), use: git commit --no-verify"