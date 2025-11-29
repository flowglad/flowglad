#!/usr/bin/env bash
#
# Copyright 2024 The Fuchsia Authors
#
# Licensed under a BSD-style license <LICENSE-BSD>, Apache License, Version 2.0
# <LICENSE-APACHE or https://www.apache.org/licenses/LICENSE-2.0>, or the MIT
# license <LICENSE-MIT or https://opensource.org/licenses/MIT>, at your option.
# This file may not be copied, modified, or distributed except according to
# those terms.

set -euo pipefail
which yq > /dev/null
jobs=$(for i in $(find .github -iname '*.yaml' -or -iname '*.yml')
  do
    # Select jobs that are triggered by pull request.
    if yq -e '.on | has("pull_request")' "$i" 2>/dev/null >/dev/null
    then
      # Skip reusable workflows (those with workflow_call) as their jobs
      # don't need to be direct dependencies of all-jobs-succeed
      if yq -e '.on | has("workflow_call")' "$i" 2>/dev/null >/dev/null
      then
        continue
      fi
      
      # Skip workflows that only run on PR closed/merged (post-merge workflows)
      # These are not part of the PR review process and shouldn't be dependencies
      # Check if types only contains "closed" and no other PR event types
      if grep -qE 'types:\s*\[.*closed.*\]' "$i" 2>/dev/null
      then
        # Check if it also has other PR event types - if so, don't skip
        if ! grep -qE 'types:\s*\[.*(opened|synchronize|labeled|unlabeled|edited|ready_for_review|locked|unlocked|reopened|assigned|unassigned|review_requested|review_request_removed|auto_merge_enabled|auto_merge_disabled|converted_to_draft)' "$i" 2>/dev/null
        then
          # Only has "closed" type, skip this workflow
          continue
        fi
      fi
      
      # This gets the list of jobs that all-jobs-succeed does not depend on.
      comm -23 \
        <(yq -r '.jobs | keys | .[]' "$i" | sort | uniq) \
        <(yq -r '.jobs.all-jobs-succeed.needs[]' "$i" | sort | uniq)
    fi

  # The grep call here excludes all-jobs-succeed from the list of jobs that
  # all-jobs-succeed does not depend on.  If all-jobs-succeed does
  # not depend on itself, we do not care about it.
  done | sort | uniq | (grep -v '^all-jobs-succeed$' || true)
)

if [ -n "$jobs" ]
then
  missing_jobs="$(echo "$jobs" | tr ' ' '\n')"
  echo "all-jobs-succeed missing dependencies on some jobs: $missing_jobs" | tee -a $GITHUB_STEP_SUMMARY >&2
  exit 1
fi