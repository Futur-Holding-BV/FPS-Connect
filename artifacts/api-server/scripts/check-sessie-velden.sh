#!/usr/bin/env bash
# CI-check: verbiedt directe sessiepaden die altijd null/undefined opleveren.
#
# Het sessieveld heet `userId`. Elke referentie naar `gebruikerId` DIRECT op
# de sessie (session.gebruikerId, sess?.["gebruikerId"], enz.) compileert maar
# levert altijd undefined op → stille autorisatie-breuk.
# Eveneens verboden: session.naam / session.gebruikerNaam / session["naam"] enz.
# — die velden worden nooit beschreven.
#
# Gecertificeerde vervangers uit middlewares/auth.ts:
#   getSessionUserId(req)          → number | null
#   getSessionGebruikerNaam(req)   → Promise<string | null>  (DB-opzoek)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/src"
FOUTEN=0

echo "🔍 Controle sessieveld-antipatronen in $SRC …"

# ── Helpfunctie: sluit commentaarregels, testbestanden en node_modules uit ────
ts_grep() {
  grep -rn --include="*.ts" -P "$1" "$SRC" 2>/dev/null \
    | grep -v "node_modules" \
    | grep -v "\.test\.ts" \
    | grep -vP "^\S+:\s*(//|\*)" \
    || true
}

# ── 1. gebruikerId DIRECT op de sessie ────────────────────────────────────────
# Matcht:
#   req.session.gebruikerId
#   req.session?.gebruikerId
#   req.session["gebruikerId"]
#   req.session?.["gebruikerId"]
#   sessie.gebruikerId / sessie?.gebruikerId
#   sessie["gebruikerId"] / sessie?.["gebruikerId"]
#   sess.gebruikerId / sess?.gebruikerId
#   sess["gebruikerId"] / sess?.["gebruikerId"]
#   (req as any).session?.gebruikerId
# Sluit uit: medewerkersTable.gebruikerId (DB-kolom), lokale const gebruikerId
PATROON1='\b(session|sessie|sess)\b\??\.(gebruikerId)\b|\b(session|sessie|sess)\b\??\.?\[[\x27"]gebruikerId[\x27"]\]'
RESULTAAT=$(ts_grep "$PATROON1" \
  | grep -vP "(medewerkersTable|gebruikersTable|Table)\." \
  | grep -vP "(sessie|sess)\.monteurId" \
  || true)

if [ -n "$RESULTAAT" ]; then
  echo "$RESULTAAT"
  echo ""
  echo "❌ Verboden: sessie.gebruikerId / sessie?.gebruikerId / sessie[\"gebruikerId\"]"
  echo "   Het sessieveld heet 'userId'. Gebruik req.session.userId of getSessionUserId(req)."
  FOUTEN=$((FOUTEN + 1))
fi

# ── 2. naam / gebruikerNaam DIRECT op de sessie ────────────────────────────────
# Matcht: session.naam, session?.naam, session["naam"], session?.["naam"],
#         session.gebruikerNaam, session?.gebruikerNaam, session["gebruikerNaam"]
# Sluit uit: tabel-kolommen, vrije variabelenamen (uploaderNaam, promptNaam, enz.)
PATROON2='\b(session|sessie|sess)\b\??\.(gebruikerNaam|naam)\b|\b(session|sessie|sess)\b\??\.?\[[\x27"](gebruiker)?naam[\x27"]\]'
RESULTAAT2=$(ts_grep "$PATROON2" \
  | grep -vP "medewerkersTable|gebruikersTable|werkgeversTable|Table\." \
  | grep -vP "getSessionGebruikerNaam|sessieGebruikerNaam\b" \
  || true)

if [ -n "$RESULTAAT2" ]; then
  echo "$RESULTAAT2"
  echo ""
  echo "❌ Verboden: sessie.naam / sessie?.naam / sessie[\"gebruikerNaam\"] enz."
  echo "   Die velden bestaan niet in SessionData. Gebruik getSessionGebruikerNaam(req)."
  FOUTEN=$((FOUTEN + 1))
fi

# ── 3. Onnodige unsafe session-casts ─────────────────────────────────────────
PATROON3='req\.session\s+as\s+unknown\s+as\s+Record'
RESULTAAT3=$(ts_grep "$PATROON3" \
  | grep -vP "^\S+:\s*(//|\*)" \
  || true)

if [ -n "$RESULTAAT3" ]; then
  echo "$RESULTAAT3"
  echo ""
  echo "❌ Verboden: req.session as unknown as Record<string, unknown>"
  echo "   req.session is al getypeerd via SessionData — unsafe cast omzeilt de typebeveiliging."
  echo "   Gebruik req.session.userId, req.session.rol of getSessionGebruikerNaam(req)."
  FOUTEN=$((FOUTEN + 1))
fi

if [ "$FOUTEN" -eq 0 ]; then
  echo "✅ Geen sessieveld-antipatronen gevonden."
  exit 0
else
  echo ""
  echo "Gevonden: $FOUTEN antipatroon-categorie(ën). Zie bovenstaande regels."
  exit 1
fi
