# Submission package

**Status: prepared draft; not submitted or published.**

| Item | Location / current state |
|---|---|
| Registered team | TeamDesperateForGTA |
| Copy-ready project explanation | [FORM_DRAFT.md](FORM_DRAFT.md); adapt to the actual form |
| Project/team/link fields | [entry.json](entry.json); missing values are `null` |
| Three-track proof | [TRACK_EVIDENCE.md](TRACK_EVIDENCE.md) |
| Recording plan | [DEMO.md](../DEMO.md); video still needs recording |
| Setup and graph details | [README.md](../README.md), [QUERIES.md](../QUERIES.md) |
| Actual measurements and limitations | [RESULTS.md](../RESULTS.md), [evidence](../evidence/README.md) |
| Participant contribution/review | [PROVENANCE.md](../PROVENANCE.md), [LEARN.md](../LEARN.md); team must complete truthfully |
| Browser review | Pending; connected browser inventory is empty |
| Public source repository | [Ashok-kumar290/GraphOps](https://github.com/Ashok-kumar290/GraphOps); source upload verification pending |
| Publishing instructions | [PUBLISH.md](PUBLISH.md); event repository only |
| Live deployment | Not provisioned; complete local setup is provided |
| Signed-in form | Public panel displays Loading; exact fields/limits unverified |

## Team input required

The registered team name is **TeamDesperateForGTA**. Add member names and actual contributions. Complete
the code/graph walkthrough and record what each person verified. Supply the
public source repository and working video links after publication and upload.
A public live app is preferred by the event page; the rules also permit complete
local setup when deployment is unavailable.

The event window currently ends **October 18, 2026, 11:59 PM IST**. Recheck the
actual form and organizer updates before submitting.
[Official rules](https://www.wemakedevs.org/hackathons/falkordb/rules),
[event FAQ](https://www.wemakedevs.org/hackathons/falkordb).

## Local source archive

After committing the intended source changes, run:

```powershell
python scripts/package_source.py
```

Use the project's Python environment if it is not activated. The helper exports
the committed source into `.runtime/releases/`, verifies required setup files,
rejects local-only paths, and writes a manifest containing the source commit and
SHA-256 checksum. It refuses a dirty checkout and never publishes anything.
This source ZIP is a review/download artifact; the public repository and working
video are still required for submission.

The archive includes source and dependency lock files. Follow README.md after
extracting it; generated assets, installed dependencies, credentials, runtime
records and model weights are not included.
