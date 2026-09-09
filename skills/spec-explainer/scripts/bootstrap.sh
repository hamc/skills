#!/usr/bin/env bash
# Idempotent setup for the narration step. Safe to run every time.
#
# Prints the python to use on stdout and nothing else, so a caller can do:
#     PY=$(./bootstrap.sh)
# Diagnostics go to stderr.
#
# The virtualenv lives in the user's cache directory, not beside this file: this
# skill installs into somebody's project, and a 30 MB virtualenv is not something
# to leave in their working tree.
#
# Debian and Ubuntu ship python3 without ensurepip, so `python3 -m venv` prints a
# failure, leaves a venv with no pip behind, and still exits 0. Every check below
# is therefore on the artefact, never on the exit status.
set -euo pipefail

venv="${XDG_CACHE_HOME:-$HOME/.cache}/spec-explainer/venv"

# Both the interpreter's name and its directory vary by platform: a POSIX venv
# puts python3 in bin/, a Windows one puts python.exe in Scripts/. Git Bash and
# MSYS run this script and create the Windows layout, so look for either.
venv_python() {
  for candidate in "$venv/bin/python3" "$venv/bin/python" "$venv/Scripts/python.exe"; do
    if [ -x "$candidate" ]; then echo "$candidate"; return 0; fi
  done
  return 1
}

# Likewise the python that creates it. Windows ships python.exe and the py
# launcher and no python3 at all, so take the first one that is really 3.9+
# rather than trusting the name.
base_python() {
  for candidate in python3 python py; do
    command -v "$candidate" >/dev/null 2>&1 || continue
    if "$candidate" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)' \
        >/dev/null 2>&1; then
      echo "$candidate"; return 0
    fi
  done
  return 1
}

py="$(venv_python || true)"

if [ -z "$py" ]; then
  base="$(base_python || true)"
  if [ -z "$base" ]; then
    echo "bootstrap: no python 3.9 or newer on PATH" >&2
    exit 1
  fi
  mkdir -p "$(dirname "$venv")"
  "$base" -m venv "$venv" >/dev/null 2>&1 || true
  py="$(venv_python || true)"
fi

if [ -z "$py" ]; then
  echo "bootstrap: could not create a venv at $venv" >&2
  echo "bootstrap: on Debian and Ubuntu, install the venv module first — sudo apt install python3-venv" >&2
  exit 1
fi

# Getting pip without a package manager. ensurepip first: it is offline, ships
# with CPython, and needs no download at all. Only when the distribution stripped
# it does anything come off the network, and then the URL and the hash of what
# arrived are printed before it runs — piping an unread remote script into an
# interpreter is the one line in this skill an infosec reviewer will stop on.
if ! "$py" -m pip --version >/dev/null 2>&1; then
  echo "bootstrap: no pip in the venv — trying ensurepip (offline)" >&2
  "$py" -m ensurepip --upgrade >/dev/null 2>&1 || true
fi

if ! "$py" -m pip --version >/dev/null 2>&1; then
  url="https://bootstrap.pypa.io/get-pip.py"
  tmp="$(mktemp)"
  trap 'rm -f "$tmp"' EXIT
  echo "bootstrap: ensurepip is not available in this python" >&2
  echo "bootstrap: downloading $url" >&2
  curl -sSf "$url" -o "$tmp"
  if command -v sha256sum >/dev/null 2>&1; then
    echo "bootstrap: sha256 $(sha256sum "$tmp" | cut -d' ' -f1)" >&2
  fi
  "$py" "$tmp" -q >&2
fi

if ! "$py" -m pip --version >/dev/null 2>&1; then
  echo "bootstrap: could not obtain pip — install python3-venv or python3-pip" >&2
  exit 1
fi

if ! "$py" -c 'import edge_tts' >/dev/null 2>&1; then
  echo "bootstrap: installing edge-tts" >&2
  "$py" -m pip install -q edge-tts >&2
fi

echo "$py"
