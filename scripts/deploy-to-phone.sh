#!/usr/bin/env bash
# Installs a release APK of a pushed branch on the connected phone. The APK is
# built in GitHub Actions (.github/workflows/android-apk.yml), never on this
# machine; an existing build of the same commit and ABI is reused.
#
# Usage: scripts/deploy-to-phone.sh [branch]   (default: the current branch)
# With several devices connected, set ANDROID_SERIAL to choose one.
set -euo pipefail

WORKFLOW=android-apk.yml
ABIS="arm64-v8a armeabi-v7a x86_64 x86"

die() { echo "error: $*" >&2; exit 1; }
for tool in adb gh git; do command -v "$tool" >/dev/null || die "$tool is not installed"; done
cd "$(git rev-parse --show-toplevel)"
gh auth status >/dev/null 2>&1 || die "gh is not logged in (run: gh auth login)"

# ---- The phone ---------------------------------------------------------------
# Physical devices only (USB or wireless debugging); emulators are never used.
mapfile -t devices < <(adb devices | awk 'NR > 1 && $2 == "device" && $1 !~ /^emulator-/ { print $1 }')
if [ -n "${ANDROID_SERIAL:-}" ]; then
  printf '%s\n' "${devices[@]}" | grep -qxF "$ANDROID_SERIAL" ||
    die "ANDROID_SERIAL=$ANDROID_SERIAL is not a connected device (adb devices -l)"
  serial=$ANDROID_SERIAL
elif [ "${#devices[@]}" -eq 0 ]; then
  die "no phone connected. Connect it by USB, allow USB debugging, and check: adb devices -l"
elif [ "${#devices[@]}" -gt 1 ]; then
  die "several devices connected (${devices[*]}); choose one with ANDROID_SERIAL=<serial>"
else
  serial=${devices[0]}
fi
abi=$(adb -s "$serial" shell getprop ro.product.cpu.abi | tr -d '\r[:space:]')
[[ " $ABIS " == *" $abi "* ]] || die "unsupported ABI '$abi' on $serial"
echo "phone:   $serial ($abi)"

# ---- The commit --------------------------------------------------------------
branch=${1:-$(git branch --show-current)}
[ -n "$branch" ] || die "no branch given and HEAD is detached"
sha=$(git ls-remote --exit-code origin "refs/heads/$branch" 2>/dev/null | cut -f1) ||
  die "branch '$branch' is not on origin; push it first (git push -u origin $branch)"
[ -n "$sha" ] || die "could not read the commit of origin/$branch"
if [ "$branch" = "$(git branch --show-current)" ] && [ "$(git rev-parse HEAD)" != "$sha" ]; then
  echo "note:    local $branch differs from origin; building the pushed commit"
fi
artifact="app-$abi-$sha"
echo "commit:  $branch @ ${sha:0:12}"

# ---- Find or make the build ---------------------------------------------------
run_id=$(gh api -X GET "repos/{owner}/{repo}/actions/artifacts" -f name="$artifact" -f per_page=20 \
  --jq '[.artifacts[] | select(.expired | not)] | first | .workflow_run.id // empty')

if [ -n "$run_id" ]; then
  echo "build:   reusing run $run_id (artifact $artifact)"
else
  # A build of this commit and ABI may already be running; wait for it instead.
  find_run() {
    gh run list --workflow "$WORKFLOW" --branch "$branch" --event workflow_dispatch --limit 30 \
      --json databaseId,headSha,displayTitle,status,createdAt \
      --jq "[.[] | select(.headSha == \"$sha\" and (.displayTitle | startswith(\"APK $abi @\")) $1)] | first | .databaseId // empty"
  }
  run_id=$(find_run 'and (.status != "completed")')
  if [ -n "$run_id" ]; then
    echo "build:   run $run_id is already building this commit"
  else
    since=$(date -u -d "-1 min" +%Y-%m-%dT%H:%M:%SZ)  # margin for clock skew
    gh workflow run "$WORKFLOW" --ref "$branch" -f abi="$abi" >/dev/null
    echo -n "build:   started; waiting for the run to appear"
    for _ in $(seq 30); do
      run_id=$(find_run "and (.createdAt >= \"$since\")")
      [ -n "$run_id" ] && break
      echo -n "."
      sleep 4
    done
    echo
    [ -n "$run_id" ] || die "the run did not appear; check: gh run list --workflow $WORKFLOW --branch $branch"
    echo "build:   run $run_id ($(gh run view "$run_id" --json url --jq .url))"
  fi
  if ! gh run watch "$run_id" --exit-status --interval 30; then
    echo "error: build failed. See the failing steps with:" >&2
    echo "  gh run view $run_id --log-failed" >&2
    exit 1
  fi
fi

# ---- Install -------------------------------------------------------------------
dir=$(mktemp -d)
trap 'rm -rf "$dir"' EXIT
gh run download "$run_id" --name "$artifact" --dir "$dir"
apk=$(find "$dir" -name '*.apk' | head -n 1)
[ -n "$apk" ] || die "the artifact $artifact contains no APK"
echo "install: $(basename "$apk") ($(du -h "$apk" | cut -f1)) → $serial"
adb -s "$serial" install -r "$apk"
