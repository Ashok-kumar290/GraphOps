# Sample company-tool data

Synthetic data in each tool's real format, for the sample company. Load it with
`.\graphops.ps1 connect slack --sample` and `.\graphops.ps1 connect jira --sample`,
or from the Company knowledge page.

- `slack-export/` follows Slack's workspace export layout: `users.json`,
  `channels.json`, and one folder per channel with a JSON file per day.
- `jira-search.json` is a Jira Cloud `/rest/api/3/search` response, with
  descriptions in Atlassian Document Format.

All people, messages and tickets are invented. Live connectors use the same
parsers on real API responses; see CONNECTORS.md.
