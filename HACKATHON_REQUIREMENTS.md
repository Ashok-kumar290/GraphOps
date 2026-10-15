# Requirements from the supplied Graph Hacks rules

Basis: the participant supplied the full 18 rules from the hackathon page in
this conversation on October 15, 2026. This map uses that supplied text. Review
the final submission portal and organizer updates before submitting.

The public overview and rules were also rechecked October 15, 2026. Their
published requirements match the supplied rules. The signed-in form remains
unverified; its public panel displays Loading. Prepared submission text and
unfilled team/link fields are in [submission/](submission/README.md).
[Official overview](https://www.wemakedevs.org/hackathons/falkordb),
[official rules](https://www.wemakedevs.org/hackathons/falkordb/rules).

## Entry and implementation

| Rule | Requirement | Our implementation / remaining work |
|---|---|---|
| 1 | Solo or team of up to four; one team per participant | Participant confirmed registration as TeamDesperateForGTA. Team roster must be recorded. |
| 2-3 | FalkorDB primary and central; removal must break core product flows | Company retrieval, graph paths, plans, checkpoints, session events and memory depend on FalkorDB. Essential path removal is checked in isolated integration tests. |
| 4 | Docker, self-hosted or cloud; language/platform choice unrestricted | Docker FalkorDB, TypeScript UI/API, Python agent/MCP and Go simulator. |
| 5 | Name every entered track | Intended entry: all three tracks listed below. |
| 6 | Use permitted data | Included company and policies are synthetic. Keep the demo synthetic. |
| 7-9 | Main coding/design after October 15, 12:01 AM IST; deadline October 18, 11:59 PM IST; permitted reuse disclosed | Event repository began October 15. Earlier prototype and generic adapter reuse are disclosed in PROVENANCE.md. |
| 11 | Disclose AI coding assistance | Codex assistance is disclosed in PROVENANCE.md. |
| 12-13 | Participant understanding and meaningful contribution/verification | MODULES.md and LEARN.md support this work. Participant and teammate review/contributions remain to be completed and recorded truthfully. |

## Rule 10: submission package

- [ ] Public source-code repository. Current repository is local; choose/publish the team's public remote.
- [x] README with setup instructions and linked graph schema.
- [x] Essential Cypher queries and the modules that execute them.
- [ ] Demo video showing the working product.
- [x] Complete local setup instructions, with Docker and Windows launcher.
- [ ] Live deployment if available; otherwise submit the complete local setup allowed by rule 10.
- [x] Intended tracks named in README and submission preparation.
- [ ] Actual submission form completed before the stated deadline.

## Track story

| Track | Demonstration |
|---|---|
| Agents That Act on Connected Data | Find the reachable failing service, validate its current procedure, act and measure recovery. Removing an essential path blocks action. |
| Agent Memory and Coordination | Save a graph handoff, resume in a fresh session, retrieve sourced memory and distinguish current evidence from historical records. |
| Company Brain | Import and revise synthetic policy sources, retrieve owners and procedures, answer with known source locations, and block retired procedures. |

Rule 14 awards the best project in each track the listed prize for every member
of the winning team: iPhone 18 Pro, PS5 with GTA VI, and M6 Mac Mini respectively.
Entering all three does not guarantee winning or organizer acceptance.

## Participant responsibilities

Agree actual team ownership/contributions (rule 15), follow the Code of Conduct
and respect others (rules 16-17), and review current organizer notices (rule 18
and the supplied note). Do not present AI-written explanations as proof that a
participant has reviewed the code or performed an exercise.
