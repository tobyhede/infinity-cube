#!/bin/sh
# Its single-quoted backticks are Markdown, not command substitution.
# shellcheck disable=SC2016
# Builds a preview build of the `infinity-cube` CLI (ADR 0166) from a clean
# checkout: the browser application, the release binary embedding it, a smoke
# test of that binary, and the archive the release attaches, with a
# `SHA256SUMS` beside it. Each build job of .github/workflows/release.yml runs
# this script, so a build made here is made the same way as CI's.
#
#   pnpm release:build                  # this machine's platform
#   pnpm release:build --target <triple>
#   pnpm release:build --desktop        # the desktop application, on macOS
#   sh release/build.sh [--desktop] [--target <triple>] [--out <dir>]
#
# The target defaults to the one release/install.sh installs on this machine:
# `<arch>-unknown-linux-musl` on Linux (which needs `musl-gcc`, from Debian's
# and Ubuntu's `musl-tools`) and `<arch>-apple-darwin` on macOS. The archive
# lands in `target/preview-build/`, or `--out`, and installs with
#
#   INFINITY_CUBE_DOWNLOAD_URL=file://<out> INFINITY_CUBE_VERSION=v<version> sh release/install.sh
#
# `--desktop` builds the desktop application (rust-host issue 06) instead,
# on macOS only: an ad-hoc signed `InfinityCube-<version>-<target>.dmg`, opened
# once on this machine with a Space, and, when `TAURI_SIGNING_PRIVATE_KEY`
# (and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`) hold the updater's key, the signed
# `InfinityCube-<version>-<target>.app.tar.gz` the updater installs and the
# `latest.json` that offers it. `INFINITY_CUBE_SCREENSHOT` names a PNG file
# the screen is captured to while that Space is open.
#
# It needs Node (the version `.node-version` names), pnpm, and rustup, which
# installs the toolchain `rust-toolchain.toml` pins on first use.
# `INFINITY_CUBE_COMMIT` names the commit `--version` reports (default: the
# checkout's HEAD), and `GITHUB_REPOSITORY` the repository the packed README
# installs from (default: tobyhede/infinity-cube).

set -eu
# A set CDPATH makes `cd` print the directory it moves to, which the
# command substitutions below would capture.
unset CDPATH

say() { printf '%s\n' "$*"; }
step() { printf '\n==> %s\n' "$*"; }
fail() {
	printf 'release/build.sh: %s\n' "$*" >&2
	exit 1
}
need() { command -v "$1" >/dev/null 2>&1 || fail "$1 is not on PATH; $2"; }

default_target() {
	arch="$(uname -m)"
	case "$(uname -s)" in
	Linux)
		case "$arch" in
		x86_64 | amd64) say x86_64-unknown-linux-musl ;;
		aarch64 | arm64) say aarch64-unknown-linux-musl ;;
		*) fail "there is no preview build for Linux on $arch; pass --target" ;;
		esac
		;;
	Darwin)
		# As release/install.sh does: a shell running under Rosetta reports
		# x86_64 on Apple silicon, where the arm64 build is the one installed.
		if [ "$arch" = x86_64 ] && [ "$(sysctl -n hw.optional.arm64 2>/dev/null || true)" = 1 ]; then
			arch=arm64
		fi
		case "$arch" in
		arm64 | aarch64) say aarch64-apple-darwin ;;
		x86_64) say x86_64-apple-darwin ;;
		*) fail "there is no preview build for macOS on $arch; pass --target" ;;
		esac
		;;
	*) fail "there is no preview build for $(uname -s); pass --target" ;;
	esac
}

sha256() {
	if command -v sha256sum >/dev/null 2>&1; then
		sha256sum "$1"
	else
		shasum -a 256 "$1"
	fi
}

script="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
root="$(dirname "$(dirname "$script")")"

target=""
out=""
desktop=0
while [ $# -gt 0 ]; do
	case "$1" in
	--target)
		[ $# -ge 2 ] || fail "--target needs a target triple"
		target="$2"
		shift 2
		;;
	--desktop)
		desktop=1
		shift
		;;
	--out)
		[ $# -ge 2 ] || fail "--out needs a directory"
		out="$2"
		shift 2
		;;
	-h | --help)
		sed -n '4,/^$/s/^# \{0,1\}//p' "$script"
		exit 0
		;;
	*) fail "unknown argument $1 (try --help)" ;;
	esac
done

# An explicit --target builds on a machine with no preview build of its own,
# with no smoke test; without one, such a machine is refused.
if [ -n "$target" ]; then
	native="$(default_target 2>/dev/null)" || native=""
else
	target="$(default_target)"
	native="$target"
fi
case "$desktop:$target" in
1:*-apple-darwin | 0:*) ;;
*) fail "the desktop application is built for macOS only, not $target; Linux and Windows are rust-host issues 23 and 22" ;;
esac
# A relative --out is relative to where the script was run from.
[ -n "$out" ] || out="$root/target/preview-build"
mkdir -p "$out"
out="$(cd "$out" && pwd)"
cd "$root"

wanted_node="$(cat .node-version)"
need node "install the Node version .node-version names ($wanted_node)"
need pnpm "install pnpm 9 (corepack enable, or npm install -g pnpm@9)"
need cargo "install rustup from https://rustup.rs"
case "$target" in
*-linux-musl)
	need musl-gcc "install musl-tools (apt-get install musl-tools), or pass another --target"
	;;
esac

running_node="$(node --version)"
if [ "${running_node#v}" != "$wanted_node" ]; then
	say "release/build.sh: Node is $running_node; .node-version names $wanted_node, which CI uses" >&2
fi

version="$(sed -n '/^\[workspace.package\]/,/^\[/s/^version = "\(.*\)"$/\1/p' Cargo.toml)"
[ -n "$version" ] || fail "no version in Cargo.toml's [workspace.package]"
commit="${INFINITY_CUBE_COMMIT:-$(git rev-parse HEAD 2>/dev/null || say unknown)}"
repository="${GITHUB_REPOSITORY:-tobyhede/infinity-cube}"
if [ "$desktop" = 1 ]; then
	name="InfinityCube-$version-$target"
else
	name="infinity-cube-$version-$target"
fi
say "Building $name (commit $commit) into $out"

step "Installing JavaScript dependencies"
pnpm install --frozen-lockfile

step "Building the browser application the binary embeds"
pnpm --filter @project/app exec vite build
if [ "$desktop" = 1 ]; then
	step "Building the desktop shell's own pages (the Start window, the close question)"
	pnpm --filter @project/app desktop-shell:build
fi

if command -v rustup >/dev/null 2>&1; then
	rustup toolchain install
	rustup target add "$target"
fi
# Named explicitly so what is packed is what was just built, wherever
# CARGO_TARGET_DIR points.
target_dir="${CARGO_TARGET_DIR:-$root/target}"

smoke=""
stage=""
trap 'rm -rf "$smoke" "$stage"' EXIT
trap 'exit 1' HUP INT TERM

# Every archive and bundle in the folder, so one built earlier for another
# target or version still installs from it.
write_sums() {
	(
		cd "$out"
		for packed in infinity-cube-*.tar.gz InfinityCube-*.dmg InfinityCube-*.app.tar.gz; do
			if [ -e "$packed" ]; then
				sha256 "$packed"
			fi
		done >SHA256SUMS
	)
}

if [ "$desktop" = 1 ]; then
	step "Building the desktop application for $target"
	# The updater's files are made only where the key that signs them is set:
	# a build without it installs and runs, and offers no update.
	set -- --target "$target" --bundles app,dmg
	if [ -n "${TAURI_SIGNING_PRIVATE_KEY:-}" ]; then
		set -- "$@" --config '{"bundle":{"createUpdaterArtifacts":true}}'
	else
		say "TAURI_SIGNING_PRIVATE_KEY is not set, so no signed update is made"
	fi
	# About names the commit, as the binary's `--version` does.
	CARGO_TARGET_DIR="$target_dir" INFINITY_CUBE_COMMIT="$commit" \
		pnpm --filter @project/desktop exec tauri build "$@"
	bundle="$target_dir/$target/release/bundle"
	app="$bundle/macos/InfinityCube.app"
	[ -d "$app" ] || fail "tauri build made no $app"
	dmg="$(find "$bundle/dmg" -name "InfinityCube_${version}_*.dmg" | head -n 1)"
	[ -n "$dmg" ] || fail "tauri build made no InfinityCube_${version}_*.dmg in $bundle/dmg"
	shown="$(/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' "$app/Contents/Info.plist")"
	[ "$shown" = "$version" ] || fail "the application names version $shown, not $version"

	# The disk image that ships, installed and opened once with a Space: its run takes the
	# directory's lock before it Imports (Storage ST-124), so the lock file
	# appearing shows the bundled host started on this Space.
	if [ "$target" = "$native" ]; then
		step "Opening a Space with the desktop application"
		# Resolved through symlinks: macOS's temporary directory is under /var, a
		# symlink to /private/var, and Tauri refuses to find its resources, or
		# check for an update, from an executable whose path holds a symlink.
		smoke="$(mktemp -d "${TMPDIR:-/tmp}/infinity-cube-smoke.XXXXXX")"
		smoke="$(cd "$smoke" && pwd -P)"
		# Installed as a person installs it: copied out of the disk image.
		hdiutil attach -nobrowse -readonly -mountpoint "$smoke/volume" "$dmg" >/dev/null
		cp -R "$smoke/volume/InfinityCube.app" "$smoke/InfinityCube.app"
		hdiutil detach "$smoke/volume" >/dev/null
		codesign --verify --deep --strict "$smoke/InfinityCube.app"
		executable="$(find "$smoke/InfinityCube.app/Contents/MacOS" -type f -perm -u+x | head -n 1)"
		cp -R conformance/init/expected "$smoke/space"
		"$executable" "$smoke/space" >"$smoke/log" 2>&1 &
		pid=$!
		waited=0
		until [ -e "$smoke/space/.infinity-cube.lock" ]; do
			if ! kill -0 "$pid" 2>/dev/null; then
				cat "$smoke/log" >&2
				fail "the desktop application exited before opening the Space"
			fi
			if [ "$waited" -ge 60 ]; then
				if [ -n "${INFINITY_CUBE_SCREENSHOT:-}" ]; then
					screencapture -x "$INFINITY_CUBE_SCREENSHOT" || true
				fi
				kill "$pid"
				cat "$smoke/log" >&2
				find "$smoke/InfinityCube.app/Contents/Resources" | head -n 40 >&2
				fail "the desktop application did not open the Space within 60 seconds"
			fi
			sleep 1
			waited=$((waited + 1))
		done
		say "It opened the Space after ${waited}s"
		if [ -n "${INFINITY_CUBE_SCREENSHOT:-}" ]; then
			sleep 5
			screencapture -x "$INFINITY_CUBE_SCREENSHOT"
		fi
		kill -0 "$pid" 2>/dev/null || fail "the desktop application exited after opening the Space"
		kill "$pid"
		wait "$pid" 2>/dev/null || true
	else
		say "$target is not this machine's target (${native:-none}), so the application is not opened"
	fi

	step "Packing $name"
	cp "$dmg" "$out/$name.dmg"
	if [ -e "$bundle/macos/InfinityCube.app.tar.gz.sig" ]; then
		cp "$bundle/macos/InfinityCube.app.tar.gz" "$out/$name.app.tar.gz"
		cp "$bundle/macos/InfinityCube.app.tar.gz.sig" "$out/$name.app.tar.gz.sig"
		case "$target" in
		aarch64-*) platform=darwin-aarch64 ;;
		*) platform=darwin-x86_64 ;;
		esac
		# The updater's static manifest (rust-host issue 06): the release
		# attaches it, and publishing the release makes it the one the
		# endpoint in tauri.conf.json serves.
		cat >"$out/latest.json" <<EOF
{
  "version": "$version",
  "notes": "InfinityCube $version (preview)",
  "pub_date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "platforms": {
    "$platform": {
      "signature": "$(cat "$out/$name.app.tar.gz.sig")",
      "url": "https://github.com/$repository/releases/download/v$version/$name.app.tar.gz"
    }
  }
}
EOF
	fi
	write_sums
	step "Built $out/$name.dmg"
	cat "$out/SHA256SUMS"
	exit 0
fi

step "Building the release binary for $target"
INFINITY_CUBE_BUILT_APPLICATION=packages/app/dist \
	INFINITY_CUBE_COMMIT="$commit" \
	cargo build --release --locked -p infinity-cube --target "$target" --target-dir "$target_dir"
binary="$target_dir/$target/release/infinity-cube"

# The binary that ships, run once: it names its version, writes a new Space,
# and checks it. A binary built for another machine's target is not run.
if [ "$target" = "$native" ]; then
	step "Smoke-testing the release binary"
	shown="$("$binary" --version)"
	say "$shown"
	case "$shown" in
	"infinity-cube $version ("*) ;;
	*) fail "--version printed '$shown'" ;;
	esac
	smoke="$(mktemp -d "${TMPDIR:-/tmp}/infinity-cube-smoke.XXXXXX")"
	"$binary" init "$smoke/space"
	"$binary" check "$smoke/space"
else
	say "$target is not this machine's target (${native:-none}), so the binary is not smoke-tested"
fi

# The packed README installs this build, not the newest one, so a tester
# following it gets the build that wrote their directory (ADR 0166);
# release/README.md, read on GitHub, installs the newest.
step "Packing $name.tar.gz"
stage="$(mktemp -d "${TMPDIR:-/tmp}/infinity-cube-stage.XXXXXX")"
mkdir "$stage/$name"
cp "$binary" LICENSE-MIT LICENSE-APACHE "$stage/$name/"
sed \
	-e "s#from the newest published preview build#from this preview build, v$version#" \
	-e "s#https://raw.githubusercontent.com/tobyhede/infinity-cube/main/release/install.sh | sh#https://github.com/$repository/releases/download/v$version/install.sh | INFINITY_CUBE_VERSION=v$version sh#" \
	-e 's#^Set `INFINITY_CUBE_VERSION` (say `v0.1.0-preview.1`) on `sh` to install a particular build, and#Change `INFINITY_CUBE_VERSION` to install another build (leave it out for the newest), and set#' \
	release/README.md >"$stage/$name/README.md"
for expected in "from this preview build, v$version" "INFINITY_CUBE_VERSION=v$version sh" 'Change `INFINITY_CUBE_VERSION` to install another build'; do
	grep -qF "$expected" "$stage/$name/README.md" ||
		fail "the packed README does not say '$expected'; release/README.md no longer holds the text this script rewrites"
done
archive="$out/$name.tar.gz"
tar -C "$stage" -czf "$archive" "$name"
write_sums

step "Built $archive"
cat "$out/SHA256SUMS"
say "Install it here with:"
# curl reads a file URL, with globbing on, so every byte of the folder's path
# but a letter, digit, `/`, `-`, `.`, `_` or `~` is percent-encoded, and both
# values are quoted for the shell, a single quote in either included.
quote() { printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"; }
url_path() {
	printf '%s' "$1" | LC_ALL=C awk '
		BEGIN { for (i = 1; i < 256; i++) code[sprintf("%c", i)] = i }
		{
			if (NR > 1) printf "%%0A"
			for (i = 1; i <= length($0); i++) {
				c = substr($0, i, 1)
				if (c ~ /[A-Za-z0-9\/._~-]/) printf "%s", c
				else printf "%%%02X", code[c]
			}
		}'
}
url="file://$(url_path "$out")"
say "  INFINITY_CUBE_DOWNLOAD_URL=$(quote "$url") INFINITY_CUBE_VERSION=v$version sh $(quote "$root/release/install.sh")"
