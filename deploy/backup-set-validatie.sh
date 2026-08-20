#!/bin/bash
# Gedeelde fail-closed controle voor een gebouwde of te herstellen back-upset.
# Alleen gewone bestanden en directories zijn toegestaan. Symlinks, sockets,
# fifos en devices kunnen buiten de immutable set wijzen of onverwacht gedrag
# veroorzaken en worden daarom geweigerd.

valideer_reguliere_backupinhoud() {
  local wortel="$1"
  local lijst item ongeldig=0

  [ -d "$wortel" ] || return 1
  [ ! -L "$wortel" ] || return 1

  lijst=$(mktemp)
  if ! find -P "$wortel" -mindepth 1 -print0 > "$lijst"; then
    rm -f "$lijst"
    return 1
  fi

  while IFS= read -r -d '' item; do
    if [ -L "$item" ] || { [ ! -f "$item" ] && [ ! -d "$item" ]; }; then
      ongeldig=1
      break
    fi
  done < "$lijst"
  rm -f "$lijst"

  [ "$ongeldig" -eq 0 ]
}