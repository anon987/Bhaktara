## Development workflow
This machine is an orchestrator. Heavy work runs in cloud sessions and
GitHub Actions.
Hard rules:
- NEVER run Gradle locally (gradlew, run-android, assemble*), NEVER run
  gradlew clean, NEVER start an emulator. The only device is the USB phone.
- No parallel local subagents for builds/tests. Local tests: only related
  tests, --maxWorkers=2.
- Never merge to main or force-push without asking.
Development: send coding tasks to cloud sessions with
claude --remote "<task>". Each task must be self-contained (what, why,
files, acceptance criteria, "run only related tests", "push a new branch
and open a PR, don't merge"). Max 3 parallel tasks, split so they don't
touch the same files. Track with gh pr list / gh pr view and summarise
PRs for me. Tiny fixes found while debugging can be done locally.
Build decision: check git diff --name-only main...origin/<branch>.
- Native change (android/, native deps in package.json, app.json,
  google-services.json, babel/metro config, icons, permissions, build-time
  env) → run scripts/deploy-to-phone.sh <branch>.
- JS-only change → no build. Check out the branch, run Metro
  (npx react-native start is allowed), and reload on the phone.
Debugging: adb logcat -v time ReactNativeJS:V AndroidRuntime:E *:S
(crashes: adb logcat -b crash). Report the exact log lines, then propose a fix.
Budget: prefer cloud sessions for heavy coding. Never rebuild a commit
that already has a build. Never build for JS-only changes.

Cloud session connected and made this change.
