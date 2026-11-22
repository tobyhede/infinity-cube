#!/bin/sh
# Its single-quoted backticks are Markdown, not command substitution.
# shellcheck disable=SC2016
# Builds a preview build of the `infinity-cube` CLI (ADR 0166) from a clean
# checkout: the browser application, the release binary embedding it, a smoke
# test of that binary, and the archive the release attaches, with a
# `SHA256SUMS` beside it. Each build job of .github/workflows/release.yml runs
# this script, so a build made here is the build CI makes.
#
#   pnpm release:build                  # this machine's platform
#   pnpm release:build --target <triple>
#   sh release/build.sh [--target <triple>] [--out <dir>]
#
# The target defaults to the one release/install.sh installs on this machine:
# `<arch>-unknown-linux-musl` on Linux (which needs `musl-gcc`, from Debian's
# and Ubuntu's `musl-tools`) and `<arch>-apple-darwin` on macOS. The archive
# lands in `target/preview-build/`, or `--out`, and installs with
#
#   INFINITY_CUBE_DOWNLOAD_URL=file://<out> INFINITY_CUBE_VERSION=v<version> sh release/install.sh
#
# It needs Node (the version `.node-version` names), pnpm, and rustup, which
# installs the toolchain `rust-toolchain.toml` pins on first use.
# `INFINITY_CUBE_COMMIT` names the commit `--version` reports (default: the
# checkout's HEAD), and `GITHUB_REPOSITORY` the repository the packed README
# installs from (default: tobyhede/infinity-cube).

set -eu

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

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

target=""
out=""
while [ $# -gt 0 ]; do
	case "$1" in
	--target)
		[ $# -ge 2 ] || fail "--target needs a target triple"
		target="$2"
		shift 2
		;;
	--out)
		[ $# -ge 2 ] || fail "--out needs a directory"
		out="$2"
		shift 2
		;;
	-h | --help)
		sed -n '4,/^$/s/^# \{0,1\}//p' "$0"
		exit 0
		;;
	*) fail "unknown argument $1 (try --help)" ;;
	esac
done

native="$(default_target)"
[ -n "$target" ] || target="$native"
[ -n "$out" ] || out="$root/target/preview-build"
mkdir -p "$out"
out="$(cd "$out" && pwd)"

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
name="infinity-cube-$version-$target"
say "Building $name (commit $commit) into $out"

step "Installing JavaScript dependencies"
pnpm install --frozen-lockfile

step "Building the browser application the binary embeds"
pnpm --filter @project/app exec vite build

step "Building the release binary for $target"
if command -v rustup >/dev/null 2>&1; then
	rustup toolchain install
	rustup target add "$target"
fi
INFINITY_CUBE_BUILT_APPLICATION=packages/app/dist \
	INFINITY_CUBE_COMMIT="$commit" \
	cargo build --release --locked -p infinity-cube --target "$target"
binary="target/$target/release/infinity-cube"

smoke=""
stage=""
trap 'rm -rf "$smoke" "$stage"' EXIT

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
	say "$target is not this machine's target ($native), so the binary is not smoke-tested"
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
(cd "$out" && sha256 "$name.tar.gz" >SHA256SUMS)

step "Built $archive"
cat "$out/SHA256SUMS"
say "Install it here with:"
say "  INFINITY_CUBE_DOWNLOAD_URL=file://$out INFINITY_CUBE_VERSION=v$version sh release/install.sh"
