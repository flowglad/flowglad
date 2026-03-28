---
name: pm
description: "Create incident postmortems by reading Slack incident channels and creating structured postmortem documents in Notion. Use when conducting a post-mortem, postmortem, RCA, root cause analysis, incident report, retrospective, incident review, or documenting incident responses."
---

# Incident Postmortem Generator

Create comprehensive incident postmortem documents by reading Slack incident channels and storing structured postmortems in Notion.

## When to Use

- After resolving a production incident that needs a post-mortem or RCA
- When conducting retrospectives or incident reviews
- When documenting incident responses for team learning
- To generate root cause analysis and action items from incident discussions

## Prerequisites

This skill requires the following MCP servers to be configured:
- **Slack MCP** - For reading incident channel history
- **Notion MCP** - For creating postmortem documents in the Notes database

Optional:
- **Betterstack MCP** - For including telemetry and uptime links

## Process

### 1. Identify the Incident Channel

Ask the user for the Slack channel name or ID. The channel should be the dedicated incident channel (typically named like `#incident-<name>` or `#inc-<date>-<description>`).

### 2. Read Slack Channel History

List channels to find the incident channel:

```json
mcp__slack__slack_list_channels({
  "limit": 200
})
```

**Validation:** Confirm the channel exists in the response before proceeding. If not found, ask the user to verify the channel name.

Fetch the channel message history:

```json
mcp__slack__slack_get_channel_history({
  "channel_id": "C0123INCIDENT",
  "limit": 500
})
```

**Validation:** Confirm messages were returned. If the channel is empty, inform the user.

For threaded discussions, fetch thread replies:

```json
mcp__slack__slack_get_thread_replies({
  "channel_id": "C0123INCIDENT",
  "thread_ts": "1678901234.567890"
})
```

Resolve user mentions to real names:

```json
mcp__slack__slack_get_users({})
```

### 3. Analyze the Incident

From the Slack messages, extract:

1. **Timeline**: Key events in chronological order (detection, acknowledgement, investigation steps, mitigation, resolution)
2. **Root Cause**: What broke, why it broke, and what dependencies were involved
3. **Impact**: Affected services, user count, and duration
4. **Open Questions**: Unresolved items needing further investigation
5. **Action Items**: Follow-up tasks with assignees, priorities, and preventive measures

### 4. Generate Postmortem Document

Use the template in [`TEMPLATE.md`](./TEMPLATE.md) to create the postmortem document. Fill in all sections with data extracted from the Slack channel analysis. Use blameless language throughout (focus on systems and processes, not individuals).

### 5. Create Notion Page

Search for the Notes database:

```json
mcp__claude_ai_Notion__notion-search({
  "query": "Notes",
  "filter": { "property": "object", "value": "database" }
})
```

**Validation:** Confirm the database was found and extract its ID. If multiple databases match, ask the user which one to use.

Create the page with the postmortem content:

```json
mcp__claude_ai_Notion__notion-create-pages({
  "parent": { "database_id": "abc123-notes-db-id" },
  "properties": {
    "title": [{ "text": { "content": "Incident Postmortem: Brief Title" } }],
    "Tags": { "multi_select": [{ "name": "eng" }, { "name": "postmortem" }] }
  },
  "children": "<<generated markdown blocks>>"
})
```

**Validation:** Confirm the page was created successfully and capture the returned page ID and URL. If creation fails, report the error to the user.

If tags could not be set during creation, update the page:

```json
mcp__claude_ai_Notion__notion-update-page({
  "page_id": "created-page-id-here",
  "properties": {
    "Tags": { "multi_select": [{ "name": "eng" }, { "name": "postmortem" }] }
  }
})
```

### 6. Share Results

Post a summary back to the Slack incident channel:

```json
mcp__slack__slack_post_message({
  "channel_id": "C0123INCIDENT",
  "text": "Postmortem document created: https://notion.so/page-link"
})
```

**Validation:** Confirm the message was posted. If posting fails (e.g., bot not in channel), provide the Notion link directly to the user instead.

## Output

Provide to the user:

1. **Summary** of what was extracted from Slack
2. **Notion link** to the created postmortem
3. **List of action items** for easy reference
4. **Any gaps** that need manual filling (if information was missing from Slack)
