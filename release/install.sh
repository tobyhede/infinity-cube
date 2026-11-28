#!/bin/sh
# Installs the InfinityCube desktop preview on Apple silicon:
#
#   curl -fsSL https://raw.githubusercontent.com/tobyhede/infinity-cube/main/release/install.sh | sh
#
# Open InfinityCube from ~/Applications when the install finishes.
# Pass --cli (pipe to sh -s -- --cli) for the command-line build.
# Both modes check the download against the release's SHA256SUMS.
#
# Settings, all optional:
#   INFINITY_CUBE_VERSION       the release to install, `v0.1.0-preview.1` or
#                               `0.1.0-preview.1`; the newest published one
#                               when unset
#   INFINITY_CUBE_INSTALL_DIR   where --cli puts the binary; ~/.local/bin when unset
#   INFINITY_CUBE_REPO          the GitHub repository; tobyhede/infinity-cube
#   INFINITY_CUBE_DOWNLOAD_URL  the URL holding the archive and SHA256SUMS,
#                               in place of the release's; it needs
#                               INFINITY_CUBE_VERSION. The release workflow
#                               tests this script with a file:// URL.
#
# Uninstall by removing the installed app or CLI binary.

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

quote() {
	printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"
}

offer_cli() {
	settings=""
	if [ -n "$requested" ]; then
		settings="INFINITY_CUBE_VERSION=$(quote "$requested") "
	fi
	if [ -n "${INFINITY_CUBE_REPO:-}" ]; then
		settings="${settings}INFINITY_CUBE_REPO=$(quote "$repo") "
	fi
	if [ -n "$download_url" ]; then
		settings="${settings}INFINITY_CUBE_DOWNLOAD_URL=$(quote "$download_url") "
	fi
	fail "the desktop preview requires a Mac with Apple silicon. For the CLI, run:
  curl -fsSL https://raw.githubusercontent.com/tobyhede/infinity-cube/main/release/install.sh | ${settings}sh -s -- --cli"
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
	curl --proto '=https,file' --proto-redir '=https' --tlsv1.2 -fsSL "$1" -o "$2"
}

# The tag of the newest published release whose tag is a version. It reads the
# list rather than /releases/latest, which answers "the most recent
# non-prerelease, non-draft release", so a release published as a pre-release
# still installs; a release whose tag is not a version is skipped. GitHub's docs
# state no order for the list; the first entry is taken as the newest. A
# request without a token lists no draft: "Only users with push access will
# receive listings for draft releases"
# (https://docs.github.com/en/rest/releases/releases).
latest_tag() {
	fetch "https://api.github.com/repos/$1/releases?per_page=10" "$2/releases.json" ||
		fail "could not ask GitHub for $1's releases. GitHub allows 60 such requests an hour from one address; set INFINITY_CUBE_VERSION (say v0.1.0-preview.1) to install a release without asking"
	tag="$(grep -o '"tag_name" *: *"v[^"]*"' "$2/releases.json" | head -n 1 | sed 's/.*"\([^"]*\)"$/\1/')"
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

download_checked() {
	fetch "$download_url/$archive" "$work/$archive" ||
		fail "could not download $download_url/$archive; release $tag may have no build for $target"
	fetch "$download_url/SHA256SUMS" "$work/SHA256SUMS" ||
		fail "could not download $download_url/SHA256SUMS"

	expected="$(awk -v file="$archive" '$2 == file || $2 == "*" file { print $1 }' "$work/SHA256SUMS")"
	[ -n "$expected" ] || fail "SHA256SUMS lists no $archive"
	actual="$(sha256_of "$work/$archive")"
	[ "$actual" = "$expected" ] ||
		fail "$archive does not match SHA256SUMS (expected $expected, got $actual); nothing was installed"

}

cleanup() {
	if [ -n "$desktop_stage" ]; then
		if [ -d "$desktop_stage/previous.app" ] && [ ! -e "$destination" ]; then
			mv "$desktop_stage/previous.app" "$destination" || {
				say "Your previous app is at $desktop_stage/previous.app" >&2
				return 1
			}
		fi
		rm -rf "$desktop_stage"
	fi
	[ -z "$staged" ] || rm -f "$staged"
	if [ -n "$mounted" ]; then
		hdiutil detach "$mounted" >/dev/null || return 1
	fi
	rm -rf "$work"
}

install_desktop() {
	archive="InfinityCube-$version-$target.dmg"
	say "Installing InfinityCube $version for Apple silicon"
	download_checked

	volume="$work/volume"
	hdiutil attach -nobrowse -readonly -mountpoint "$volume" "$work/$archive" >/dev/null ||
		fail "could not open $archive"
	mounted="$volume"
	install_dir="${HOME:?HOME is not set}/Applications"
	mkdir -p "$install_dir"
	destination="$install_dir/InfinityCube.app"
	stage_dir="$install_dir/.infinity-cube-install"
	if ! mkdir "$stage_dir"; then
		if [ -d "$stage_dir" ]; then
			if [ -d "$stage_dir/previous.app" ]; then
				fail "another install may be using $stage_dir. Once no other install is running, if $destination is missing, move $stage_dir/previous.app to $destination. Then move the remaining staging folder aside and retry"
			fi
			fail "another install may be using $stage_dir. Once no other install is running, move the folder aside if it remains, then retry"
		fi
		fail "could not reserve $stage_dir for this install"
	fi
	desktop_stage="$stage_dir"
	new_app="$desktop_stage/InfinityCube.app"
	ditto "$volume/InfinityCube.app" "$new_app" || fail "could not copy InfinityCube from $archive"
	hdiutil detach "$mounted" >/dev/null || fail "could not eject $archive"
	mounted=""
	codesign --verify --deep --strict "$new_app" || fail "could not verify InfinityCube's code signature"
	if [ -L "$destination" ]; then
		fail "$destination is a symbolic link. Move it aside first"
	fi
	if [ -e "$destination" ]; then
		identifier="$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$destination/Contents/Info.plist" 2>/dev/null)" ||
			fail "$destination already exists. Move it aside first"
		[ "$identifier" = dev.infinitycube.desktop ] ||
			fail "$destination belongs to another app. Move it aside first"
		mv "$destination" "$desktop_stage/previous.app"
	fi
	mv "$new_app" "$destination"
	say "Installed InfinityCube $version to $destination"
	say "Open InfinityCube from ~/Applications."
}

install_cli() {
	name="infinity-cube-$version-$target"
	archive="$name.tar.gz"
	say "Installing infinity-cube $version for $target"
	download_checked
	install_dir="${INFINITY_CUBE_INSTALL_DIR:-${HOME:?HOME is not set}/.local/bin}"

	tar -xzf "$work/$archive" -C "$work"
	[ -f "$work/$name/infinity-cube" ] || fail "$archive holds no $name/infinity-cube"

	mkdir -p "$install_dir"
	# Absolute, so the folder named below and in the PATH line is the same
	# from any directory.
	install_dir="$(CDPATH="" cd -- "$install_dir" && pwd)"
	destination="$install_dir/infinity-cube"
	# mv would put the binary inside a directory of that name, not replace it.
	[ ! -d "$destination" ] ||
		fail "$destination is a directory; move it aside or set INFINITY_CUBE_INSTALL_DIR to another folder. Nothing was installed"
	previous=""
	if [ -x "$destination" ]; then
		previous="$("$destination" --version 2>/dev/null || true)"
	fi

	# Copied beside the destination, run, and only then renamed over it, so a
	# running copy is never written into, and a failed or interrupted install,
	# or a binary that does not run here, leaves the old one.
	staged="$install_dir/.infinity-cube.$$"
	cp "$work/$name/infinity-cube" "$staged"
	chmod 755 "$staged"
	if [ "$(uname -s)" = Darwin ]; then
		xattr -d com.apple.quarantine "$staged" 2>/dev/null || true
	fi
	installed="$("$staged" --version)" ||
		fail "the downloaded $name/infinity-cube does not run on this machine; nothing was installed"
	mv -f "$staged" "$destination"
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

main() {
	case "$#:${1-}" in
	0:) mode=desktop ;;
	1:--cli) mode=cli ;;
	*) fail "usage: install.sh [--cli]" ;;
	esac

	need curl
	need uname
	need mktemp
	target="$(detect_target)"
	repo="${INFINITY_CUBE_REPO:-tobyhede/infinity-cube}"
	download_url="${INFINITY_CUBE_DOWNLOAD_URL:-}"
	requested="${INFINITY_CUBE_VERSION:-}"
	if [ "$mode" = desktop ]; then
		[ "$target" = aarch64-apple-darwin ] || offer_cli
		need hdiutil
		need ditto
		need codesign
	else
		need tar
	fi

	work="$(mktemp -d "${TMPDIR:-/tmp}/infinity-cube-install.XXXXXX")"
	staged=""
	desktop_stage=""
	mounted=""
	trap cleanup EXIT
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

	if [ "$mode" = desktop ]; then
		install_desktop
	else
		install_cli
	fi
}

main "$@"
