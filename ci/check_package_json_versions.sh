#!/usr/bin/env bash
#
# Check that package.json files do not contain caret (^) version prefixes
# in dependencies or devDependencies. All dependencies should use explicit
# versions for deterministic installs.
#
# Note: This check ignores peerDependencies as version ranges are expected there.

set -euo pipefail

# Find all package.json files, excluding node_modules
PACKAGE_FILES=$(find . -name "package.json" -not -path "*/node_modules/*" -not -path "*/.git/*" | sort)

if [ -z "$PACKAGE_FILES" ]; then
  echo "Error: No package.json files found" >&2
  exit 1
fi

HAS_ERRORS=false
ALL_MATCHES=""

for PACKAGE_JSON in $PACKAGE_FILES; do
  # Use node to extract only dependencies and devDependencies, then check for carets
  # This avoids false positives from peerDependencies
  CARET_MATCHES=$(node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('$PACKAGE_JSON', 'utf8'));
    const results = [];

    // Check dependencies
    if (pkg.dependencies) {
      for (const [name, version] of Object.entries(pkg.dependencies)) {
        if (typeof version === 'string' && version.startsWith('^')) {
          results.push('  dependencies: \"' + name + '\": \"' + version + '\"');
        }
      }
    }

    // Check devDependencies
    if (pkg.devDependencies) {
      for (const [name, version] of Object.entries(pkg.devDependencies)) {
        if (typeof version === 'string' && version.startsWith('^')) {
          results.push('  devDependencies: \"' + name + '\": \"' + version + '\"');
        }
      }
    }

    if (results.length > 0) {
      console.log(results.join('\n'));
    }
  " 2>/dev/null || true)

  if [ -n "$CARET_MATCHES" ]; then
    HAS_ERRORS=true
    ALL_MATCHES="${ALL_MATCHES}
${PACKAGE_JSON}:
${CARET_MATCHES}
"
  fi
done

if [ "$HAS_ERRORS" = true ]; then
  echo "Error: package.json files contain caret (^) version prefixes in dependencies/devDependencies." | tee -a "$GITHUB_STEP_SUMMARY" >&2
  echo "Use explicit versions instead." | tee -a "$GITHUB_STEP_SUMMARY" >&2
  echo "" | tee -a "$GITHUB_STEP_SUMMARY" >&2
  echo "Found caret versions:" | tee -a "$GITHUB_STEP_SUMMARY" >&2
  echo "$ALL_MATCHES" | tee -a "$GITHUB_STEP_SUMMARY" >&2
  echo "" | tee -a "$GITHUB_STEP_SUMMARY" >&2
  echo 'Example fix: Change "^1.2.3" to "1.2.3"' | tee -a "$GITHUB_STEP_SUMMARY" >&2
  exit 1
fi

echo "All package.json files use explicit versions (no caret prefixes in dependencies/devDependencies)"
