#!/usr/bin/env bash
set -euo pipefail

BASIS="${1:-https://connect.fps-one.nl/app/}"
BASIS="${BASIS%/}/"
USER_AGENT="Mozilla/5.0 (Linux; Android 15; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36"
TIJDELIJK="$(mktemp -d)"
SCRIPT_MAP="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST_BRON="${SCRIPT_MAP}/../artifacts/monteur-app/public/manifest.webmanifest"
trap 'rm -rf "${TIJDELIJK}"' EXIT

ophalen() {
  local pad="$1"
  local doel="$2"
  local koppen="${doel}.headers"
  curl --fail --silent --show-error --location --compressed \
    --retry 3 --retry-delay 2 --retry-all-errors --max-time 20 \
    --user-agent "${USER_AGENT}" --dump-header "${koppen}" \
    --output "${doel}" "${BASIS}${pad}"
  test -s "${doel}" || {
    echo "FOUT: ${BASIS}${pad} gaf een leeg bestand terug." >&2
    return 1
  }
}

controleer_png() {
  local bestand="$1"
  local verwachte_breedte="$2"
  local verwachte_hoogte="$3"
  local koppen="${bestand}.headers"
  grep -Eiq '^content-type:[[:space:]]*image/png([[:space:]]*;.*)?[[:space:]]*$' "${koppen}" || {
    echo "FOUT: $(basename "${bestand}") wordt niet als image/png geserveerd." >&2
    return 1
  }
  local handtekening
  handtekening="$(od -An -t x1 -N8 "${bestand}" | tr -d ' \n')"
  test "${handtekening}" = "89504e470d0a1a0a" || {
    echo "FOUT: $(basename "${bestand}") is geen geldig PNG-bestand." >&2
    return 1
  }
  local ihdr
  ihdr="$(od -An -t x1 -j8 -N8 "${bestand}" | tr -d ' \n')"
  test "${ihdr}" = "0000000d49484452" || {
    echo "FOUT: $(basename "${bestand}") mist de verplichte PNG-IHDR-chunk." >&2
    return 1
  }
  local b1 b2 b3 b4 h1 h2 h3 h4 breedte hoogte
  read -r b1 b2 b3 b4 h1 h2 h3 h4 < <(od -An -t u1 -j16 -N8 "${bestand}")
  breedte=$((b1 * 16777216 + b2 * 65536 + b3 * 256 + b4))
  hoogte=$((h1 * 16777216 + h2 * 65536 + h3 * 256 + h4))
  if [ "${breedte}" -ne "${verwachte_breedte}" ] || [ "${hoogte}" -ne "${verwachte_hoogte}" ]; then
    echo "FOUT: $(basename "${bestand}") is ${breedte}x${hoogte}, verwacht ${verwachte_breedte}x${verwachte_hoogte}." >&2
    return 1
  fi
}

ophalen "" "${TIJDELIJK}/index.html"
grep -Fq '<link rel="manifest" href="/app/manifest.webmanifest" />' "${TIJDELIJK}/index.html" || {
  echo "FOUT: /app/ HTML mist de manifest-koppeling." >&2
  exit 1
}
grep -Fq '<link rel="apple-touch-icon" href="/app/icons/apple-touch-icon.png" />' "${TIJDELIJK}/index.html" || {
  echo "FOUT: /app/ HTML mist de apple-touch-icon." >&2
  exit 1
}
grep -Fq "navigator.serviceWorker.register('/app/sw.js',{scope:'/app/'" "${TIJDELIJK}/index.html" || {
  echo "FOUT: /app/ registreert de service worker niet met scope /app/." >&2
  exit 1
}

ophalen "manifest.webmanifest" "${TIJDELIJK}/manifest.webmanifest"
ophalen "icons/pwa-192.png" "${TIJDELIJK}/pwa-192.png"
ophalen "icons/pwa-512.png" "${TIJDELIJK}/pwa-512.png"
ophalen "icons/apple-touch-icon.png" "${TIJDELIJK}/apple-touch-icon.png"
ophalen "sw.js" "${TIJDELIJK}/sw.js"

test -f "${MANIFEST_BRON}" || {
  echo "FOUT: canoniek bronmanifest ontbreekt op ${MANIFEST_BRON}." >&2
  exit 1
}
cmp --silent "${MANIFEST_BRON}" "${TIJDELIJK}/manifest.webmanifest" || {
  echo "FOUT: het publieke manifest wijkt af van het canonieke manifest uit deze release." >&2
  exit 1
}

grep -Fq '"src": "/app/icons/pwa-192.png"' "${TIJDELIJK}/manifest.webmanifest" || {
  echo "FOUT: manifest verwijst niet naar het 192x192-icoon." >&2
  exit 1
}
grep -Fq '"sizes": "192x192"' "${TIJDELIJK}/manifest.webmanifest" || {
  echo "FOUT: manifest mist de maat 192x192." >&2
  exit 1
}
grep -Fq '"src": "/app/icons/pwa-512.png"' "${TIJDELIJK}/manifest.webmanifest" || {
  echo "FOUT: manifest verwijst niet naar het 512x512/maskable-icoon." >&2
  exit 1
}
grep -Fq '"sizes": "512x512"' "${TIJDELIJK}/manifest.webmanifest" || {
  echo "FOUT: manifest mist de maat 512x512." >&2
  exit 1
}
grep -Fq '"type": "image/png"' "${TIJDELIJK}/manifest.webmanifest" || {
  echo "FOUT: manifest declareert de iconen niet als image/png." >&2
  exit 1
}
grep -Fq '"scope": "/app/"' "${TIJDELIJK}/manifest.webmanifest" || {
  echo "FOUT: manifest-scope is niet /app/." >&2
  exit 1
}
grep -Fq '"start_url": "/app/"' "${TIJDELIJK}/manifest.webmanifest" || {
  echo "FOUT: manifest-start_url is niet /app/." >&2
  exit 1
}
grep -Fq '"purpose": "maskable"' "${TIJDELIJK}/manifest.webmanifest" || {
  echo "FOUT: manifest mist een maskable icoon." >&2
  exit 1
}
grep -Fq 'self.addEventListener("fetch"' "${TIJDELIJK}/sw.js" || {
  echo "FOUT: service worker mist de voor Chrome vereiste fetch-handler." >&2
  exit 1
}
if grep -Fq "__VERSIE__" "${TIJDELIJK}/sw.js"; then
  echo "FOUT: service worker bevat nog de onvervangen buildversie." >&2
  exit 1
fi

controleer_png "${TIJDELIJK}/pwa-192.png" 192 192
controleer_png "${TIJDELIJK}/pwa-512.png" 512 512
controleer_png "${TIJDELIJK}/apple-touch-icon.png" 180 180

echo "Monteur-PWA productiecontrole geslaagd: HTML, manifest, service worker en drie iconen zijn installeerbaar bereikbaar."