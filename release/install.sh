#!/bin/sh
# Installs the `infinity-cube` preview build (ADR 0166) for this machine:
#
#   curl -fsSL https://raw.githubusercontent.com/tobyhede/infinity-cube/main/release/install.sh | sh
#
# It picks the archive for this platform from a published GitHub release,
# checks it against the release's SHA256SUMS, and puts the binary in
# ~/.local/bin, replacing any copy already there. It needs no sudo and edits
# no shell configuration.
#
# Settings, all optional:
#   INFINITY_CUBE_VERSION       the release to install, `v0.1.0-preview.1` or
#                               `0.1.0-preview.1`; the newest published one
#                               when unset
#   INFINITY_CUBE_INSTALL_DIR   where the binary goes; ~/.local/bin when unset
#   INFINITY_CUBE_REPO          the GitHub repository; tobyhede/infinity-cube
#   INFINITY_CUBE_DOWNLOAD_URL  the URL holding the archive and SHA256SUMS,
#                               in place of the release's; it needs
#                               INFINITY_CUBE_VERSION. The release workflow
#                               tests this script with a file:// URL.
#
# Uninstall by deleting the binary: rm ~/.local/bin/infinity-cube

# Everything runs from main, called on the last line, so a download cut off
# part-way through runs nothing.

set -eu

say() {
	printf '%s\n' "$*"
}

fail() {
	printf 'infinity-cube install: %s\n' "$*" >&2
	exit 1
}

need() {
	command -v "$1" >/dev/null 2>&1 || fail "this script needs $1, which is not on PATH"
}

# The Rust target an archive is named for.
detect_target() {
	os="$(uname -s)"
	arch="$(uname -m)"
	case "$os" in
	Linux)
		case "$arch" in
		x86_64 | amd64) say x86_64-unknown-linux-musl ;;
		aarch64 | arm64) say aarch64-unknown-linux-musl ;;
		*) fail "there is no preview build for Linux on $arch" ;;
		esac
		;;
	Darwin)
		# A shell running under Rosetta reports x86_64 on Apple silicon; the
		# arm64 build is the one to install there.
		if [ "$arch" = x86_64 ] && [ "$(sysctl -n hw.optional.arm64 2>/dev/null || true)" = 1 ]; then
			arch=arm64
		fi
		case "$arch" in
		arm64 | aarch64) say aarch64-apple-darwin ;;
		x86_64) say x86_64-apple-darwin ;;
		*) fail "there is no preview build for macOS on $arch" ;;
		esac
		;;
	MINGW* | MSYS* | CYGWIN* | Windows_NT)
		fail "there is no preview build for Windows yet"
		;;
	*)
		fail "there is no preview build for $os"
		;;
	esac
}

# fetch <url> <file>
fetch() {
	if command -v curl >/dev/null 2>&1; then
		curl --proto '=https,file' --tlsv1.2 -fsSL "$1" -o "$2"
	elif command -v wget >/dev/null 2>&1; then
		wget -q -O "$2" "$1"
	else
		fail "this script needs curl or wget, and neither is on PATH"
	fi
}

# The tag of the newest published release. GitHub's /releases/latest skips
# pre-releases, and every preview build is one, so this reads the list, which
# is newest first and holds no draft for a request without a token.
latest_tag() {
	fetch "https://api.github.com/repos/$1/releases?per_page=1" "$2/releases.json" ||
		fail "could not ask GitHub for $1's releases"
	tag="$(sed -n 's/^ *"tag_name": *"\([^"]*\)".*/\1/p' "$2/releases.json" | head -n 1)"
	[ -n "$tag" ] || fail "$1 has no published release yet"
	say "$tag"
}

sha256_of() {
	if command -v sha256sum >/dev/null 2>&1; then
		sha256sum "$1" | cut -d ' ' -f 1
	elif command -v shasum >/dev/null 2>&1; then
		shasum -a 256 "$1" | cut -d ' ' -f 1
	else
		fail "this script needs sha256sum or shasum to check the download"
	fi
}

main() {
	need uname
	need tar
	need mktemp

	repo="${INFINITY_CUBE_REPO:-tobyhede/infinity-cube}"
	install_dir="${INFINITY_CUBE_INSTALL_DIR:-${HOME:?HOME is not set}/.local/bin}"
	download_url="${INFINITY_CUBE_DOWNLOAD_URL:-}"
	requested="${INFINITY_CUBE_VERSION:-}"

	target="$(detect_target)"

	work="$(mktemp -d "${TMPDIR:-/tmp}/infinity-cube-install.XXXXXX")"
	trap 'rm -rf "$work"' EXIT
	trap 'exit 1' HUP INT TERM

	if [ -n "$requested" ]; then
		tag="v${requested#v}"
	elif [ -n "$download_url" ]; then
		fail "INFINITY_CUBE_DOWNLOAD_URL needs INFINITY_CUBE_VERSION"
	else
		tag="$(latest_tag "$repo" "$work")"
	fi
	version="${tag#v}"
	[ -n "$download_url" ] || download_url="https://github.com/$repo/releases/download/$tag"

	name="infinity-cube-$version-$target"
	archive="$name.tar.gz"

	say "Installing infinity-cube $version for $target"
	fetch "$download_url/$archive" "$work/$archive" ||
		fail "could not download $download_url/$archive"
	fetch "$download_url/SHA256SUMS" "$work/SHA256SUMS" ||
		fail "could not download $download_url/SHA256SUMS"

	expected="$(awk -v file="$archive" '$2 == file || $2 == "*" file { print $1 }' "$work/SHA256SUMS")"
	[ -n "$expected" ] || fail "SHA256SUMS lists no $archive"
	actual="$(sha256_of "$work/$archive")"
	[ "$actual" = "$expected" ] ||
		fail "$archive does not match SHA256SUMS (expected $expected, got $actual); nothing was installed"

	tar -xzf "$work/$archive" -C "$work"
	[ -f "$work/$name/infinity-cube" ] || fail "$archive holds no $name/infinity-cube"

	destination="$install_dir/infinity-cube"
	previous=""
	if [ -x "$destination" ]; then
		previous="$("$destination" --version 2>/dev/null || true)"
	fi

	mkdir -p "$install_dir"
	# Copied beside the destination and renamed over it, so a running copy is
	# never written into and an interrupted install leaves the old one.
	staged="$install_dir/.infinity-cube.$$"
	cp "$work/$name/infinity-cube" "$staged"
	chmod 755 "$staged"
	if [ "$(uname -s)" = Darwin ]; then
		xattr -d com.apple.quarantine "$staged" 2>/dev/null || true
	fi
	mv -f "$staged" "$destination"

	installed="$("$destination" --version)" || fail "the installed $destination does not run"
	say "Installed $installed to $destination"

	if [ -n "$previous" ] && [ "$previous" != "$installed" ]; then
		say ""
		say "This replaced $previous. A preview build makes no compatibility promise,"
		say "so it may refuse a directory the previous build wrote: read that directory"
		say "with the build that wrote it, or recover it from git. To go back, run this"
		say "script again with INFINITY_CUBE_VERSION set to that build's version."
	fi

	case ":${PATH:-}:" in
	*":$install_dir:"*) ;;
	*)
		say ""
		say "$install_dir is not on your PATH. Add it by putting this line in your"
		say "shell's startup file (~/.zshrc, ~/.bashrc or ~/.profile), then open a new terminal:"
		say ""
		say "  export PATH=\"$install_dir:\$PATH\""
		;;
	esac

	say ""
	say "Start with: infinity-cube init my-space && infinity-cube run my-space"
}

main "$@"
