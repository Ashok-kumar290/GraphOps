# Publish the project repository

The repository to publish is **`C:\Users\Harsha\Hackathon\event`**. The
surrounding `Hackathon/` directory also contains earlier
preparation work and local credentials; use the event repository below.

## 1. Create the destination

On GitHub, create a **public** repository named `graphops` under the team's
chosen account or organization. Leave README, `.gitignore`, and license creation
unchecked: this checkout already has source, documentation and Git history.
Choose a license separately with the team if desired.

## 2. Push the committed project

In PowerShell, from the event directory:

```powershell
Set-Location C:\Users\Harsha\Hackathon\event
git status --short
git log -1 --oneline
```

Review any uncommitted changes before continuing. Copy the new repository's
HTTPS clone URL from GitHub, then run:

```powershell
$repositoryUrl = Read-Host 'Paste the new GitHub HTTPS clone URL'
git remote add origin $repositoryUrl
git push -u origin HEAD
```

Authenticate through Git's normal GitHub sign-in if prompted. Do not put an
access token in the URL or commit a credential file. If an `origin` already
exists, inspect `git remote -v` and use that intended destination instead of
adding another one. The current local branch is `master`; renaming it is optional.

## 3. Verify what judges can access

Open the repository in a signed-out browser. Confirm it is public and that its
default branch shows:

- [Setup instructions](../README.md), including Windows and Docker routes.
- [Graph model and essential Cypher](../QUERIES.md).
- [Architecture](../ARCHITECTURE.md) and [six modules](../MODULES.md).
- [AI assistance and preparation reuse](../PROVENANCE.md).
- [Measured results and limitations](../RESULTS.md).

The prepared [GitHub Actions workflow](../.github/workflows/checks.yml) runs
infrastructure checks on pushes. Inspect its first actual run on GitHub; a local
pass does not establish that remote CI passed. Those checks do not make live
model calls. Actual model evaluation remains a separate local or configured
hosted-provider task.

For a fresh setup check, clone to a different directory and follow README.md.
Use a separate database/workspace and unoccupied ports, or stop the running local
app first. Preserve the existing demo's persistent data.

## 4. Fill in the submission links

Set `links.public_repository` in [entry.json](entry.json) to the public repository
page URL. Update the repository link in [FORM_DRAFT.md](FORM_DRAFT.md). Add the
video URL after recording and upload. Check both URLs while signed out.

Keep `status` as `draft` until the actual submission is completed. A Git push,
source ZIP, or successful CI run does not submit the project to the hackathon.
Member contributions, participant review, browser review and the working demo
video still need their own completion records.

## Local source archive

After committing the final source and metadata, run:

```powershell
..\.venv\Scripts\python.exe scripts/package_source.py
```

For an independent checkout with its own environment, use
`.\.venv\Scripts\python.exe` instead. The archive and checksum manifest are
written to ignored `.runtime/releases/`; this command does not upload anything.
