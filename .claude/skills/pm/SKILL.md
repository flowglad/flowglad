---
name: pm
description: Create incident postmortems by reading Slack incident channels and creating structured postmortem documents in Notion. Use when conducting postmortem reviews or documenting incident responses.
---

# Incident Postmortem Generator

Create comprehensive incident postmortem documents by reading Slack incident channels and storing structured postmortems in Notion.

## When to Use

- After resolving a production incident
- When conducting postmortem reviews
- When documenting incident responses for team learning
- To generate action items from incident discussions

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

Use the Slack MCP to fetch the channel's message history:

```
mcp__slack__slack_list_channels
```

Find the channel ID, then fetch history:

```
mcp__slack__slack_get_channel_history with channel_id
```

For threaded discussions, also fetch thread replies:

```
mcp__slack__slack_get_thread_replies with channel_id and thread_ts
```

Get user information to resolve mentions:

```
mcp__slack__slack_get_users
```

### 3. Analyze the Incident

From the Slack messages, extract:

1. **Timeline**: Key events in chronological order
   - When was the incident first detected?
   - When was it acknowledged?
   - What investigation steps were taken?
   - When was it mitigated/resolved?

2. **Root Cause**: The underlying technical issue
   - What broke?
   - Why did it break?
   - What dependencies were involved?

3. **Impact**: The effect on users/systems
   - What services were affected?
   - How many users impacted?
   - What was the duration?

4. **Open Questions**: Unresolved items from discussion
   - Unclear technical details
   - Areas needing further investigation
   - Decisions that need to be made

5. **Action Items**: Follow-up tasks with assignees
   - Preventive measures
   - Monitoring improvements
   - Documentation updates
   - Process changes

### 4. Generate Postmortem Document

Create a markdown document following this structure:

```markdown
# Incident Postmortem: [Brief Title]

**Date:** [Incident Date]
**Severity:** [P0/P1/P2/P3]
**Duration:** [Total incident duration]
**Author:** [Person creating postmortem]

## Summary

[2-3 sentence summary of what happened and the impact]

## Timeline

| Time (UTC) | Event |
|------------|-------|
| HH:MM | Incident detected via [source] |
| HH:MM | Team alerted |
| HH:MM | Investigation began |
| HH:MM | Root cause identified |
| HH:MM | Mitigation deployed |
| HH:MM | Incident resolved |

## Impact

- **Services Affected:** [List of affected services]
- **Users Impacted:** [Number or percentage]
- **Duration:** [How long users were affected]
- **Data Loss:** [Yes/No, details if applicable]

## Root Cause Analysis

### What Happened

[Detailed technical explanation of the failure]

### Why It Happened

[Contributing factors, systemic issues]

### Detection

[How was the incident discovered? Could we have detected it sooner?]

## Telemetry & Monitoring

[If Betterstack MCP is available, include relevant links]

- **Uptime Dashboard:** [Link]
- **Error Metrics:** [Link]
- **Relevant Alerts:** [Link]

## Open Questions

- [ ] [Unresolved question 1]
- [ ] [Unresolved question 2]

## Action Items

| Action | Assignee | Priority | Status |
|--------|----------|----------|--------|
| [Action description] | @[username] | High/Medium/Low | Open |
| [Action description] | @[username] | High/Medium/Low | Open |

## Lessons Learned

### What Went Well

- [Positive aspects of incident response]

### What Could Be Improved

- [Areas for improvement]

## References

- **Incident Channel:** #[channel-name]
- **Related PRs:** [Links to fix PRs]
- **Related Docs:** [Links to relevant documentation]
```

### 5. Create Notion Page

Use the Notion MCP to create the postmortem in the Notes database:

First, search for the Notes database:

```
mcp__claude_ai_Notion__notion-search with query: "Notes"
```

Or use the Notion skill:

```
Skill: notion-search with "Notes database"
```

Then create the page with the postmortem content:

```
mcp__claude_ai_Notion__notion-create-pages with:
- parent: Notes database ID
- title: "Incident Postmortem: [Brief Title]"
- content: [Generated markdown content]
```

**Important:** Add the required tags to the page:
- `eng`
- `postmortem`

If the Notion MCP supports tags/properties, set them during creation. Otherwise, use the update page tool:

```
mcp__claude_ai_Notion__notion-update-page with:
- page_id: [created page ID]
- properties: { tags: ["eng", "postmortem"] }
```

### 6. Share Results

After creating the postmortem:

1. Provide the Notion page link to the user
2. Optionally post a summary back to the Slack channel:

```
mcp__slack__slack_post_message with:
- channel: [incident channel ID]
- text: "Postmortem document created: [Notion link]"
```

## Tips for Quality Postmortems

### Blameless Culture

- Focus on systems and processes, not individuals
- Use "the system failed to..." rather than "person X failed to..."
- Treat failures as learning opportunities

### Be Specific

- Include exact timestamps when available
- Reference specific commits, PRs, or deployments
- Quantify impact with numbers when possible

### Actionable Items

- Each action item should be specific and achievable
- Assign clear owners
- Set priorities to help with planning

### Capture Context

- Include relevant Slack threads and discussions
- Link to monitoring dashboards and alerts
- Reference any related incidents

## Output

Provide to the user:

1. **Summary** of what was extracted from Slack
2. **Notion link** to the created postmortem
3. **List of action items** for easy reference
4. **Any gaps** that need manual filling (if information was missing from Slack)
