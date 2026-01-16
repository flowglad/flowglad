# GitHub Actions Workflows

## test-stainless-sdk.yml

Tests a pre-release version of `@flowglad/node` from Stainless before publishing to npm.

### Manual Trigger

You can test a specific Stainless commit via the GitHub Actions UI:

1. Go to Actions > "Test Stainless SDK"
2. Click "Run workflow"
3. Enter the Stainless commit hash
4. Click "Run workflow"

### External Trigger (repository_dispatch)

The workflow can be triggered from the `flowglad/flowglad-node` repository using a `repository_dispatch` event:

```yaml
- name: Trigger monorepo SDK tests
  uses: peter-evans/repository-dispatch@v2
  with:
    token: ${{ secrets.MONOREPO_DISPATCH_TOKEN }}
    repository: flowglad/flowglad
    event-type: test-stainless-sdk
    client-payload: '{"commit_hash": "<stainless-commit-sha>"}'
```

**Requirements:**
- A PAT (Personal Access Token) with `repo` scope stored as `MONOREPO_DISPATCH_TOKEN` in the flowglad-node repository secrets

### What it does

1. Replaces `@flowglad/node` in all SDK packages with the Stainless tarball URL
2. Installs dependencies
3. Builds all packages
4. Runs the test suite

### Tarball URL format

```
https://pkg.stainless.com/s/flowglad-typescript/<commit-hash>/dist.tar.gz
```
