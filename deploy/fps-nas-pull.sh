#!/bin/bash
# FPS Connect — BACKUP_01: ForceCommand-wrapper voor het NAS-leesaccount.
#
# Staat in authorized_keys van de gebruiker `fps-nas` als:
#   command="/usr/local/bin/fps-nas-pull.sh",restrict ssh-ed25519 AAAA... nas
#
# Doet twee dingen:
#   1. logt elke verbinding naar syslog (tag fps-nas-pull) — het NAS-account
#      kan syslog niet wissen, dus de pull-administratie is betrouwbaar;
#   2. dwingt READ-ONLY rsync af op uitsluitend /srv/fps-backup via rrsync -ro.
#
# De VPS heeft géén toegangsgegevens voor de NAS; de NAS haalt op. Dit script
# is de enige deur en die deur kan alleen lezen.
logger -t fps-nas-pull "verbinding van ${SSH_CLIENT%% *} commando: ${SSH_ORIGINAL_COMMAND:-<leeg>}"
# rrsync NIET via exec: de marker mag pas gezet worden als de overdracht
# geslaagd is, anders telt elke mislukte/lege ssh-aanmelding als "pull".
/usr/bin/rrsync -ro /srv/fps-backup
RC=$?
if [ "$RC" -eq 0 ]; then
  # marker voor de bewaking (eigen map van fps-nas, losgekoppeld van de set)
  date -Is > /var/lib/fps-nas/laatste-verbinding 2>/dev/null || true
  logger -t fps-nas-pull "overdracht geslaagd"
else
  logger -t fps-nas-pull "overdracht MISLUKT (exit $RC) — marker niet bijgewerkt"
fi
exit "$RC"
