#!/bin/bash
# Gedeelde Microsoft Graph-mailhelper voor de externe back-upstaffel.
#
# De Azure-gegevens worden bewust niet uit .env.production in de hostshell
# geladen. De draaiende api-container heeft die omgeving al en doet de twee
# Graph-aanroepen rechtstreeks. Daardoor verschijnen client-secrets niet in
# procesargumenten, tijdelijke bestanden, status.json of logs.

stuur_backup_graph_mail() {
  local onderwerp="${1:?onderwerp ontbreekt}"
  local bericht="${2:?bericht ontbreekt}"
  local deploy_dir="${BACKUP_DEPLOY_DIR:-/opt/fps-one/deploy}"
  local compose_bestand="${BACKUP_COMPOSE_BESTAND:-$deploy_dir/docker-compose.production.yml}"
  local env_bestand="${BACKUP_ENV_BESTAND:-$deploy_dir/.env.production}"
  local graph_exit docker_uitvoer sentinel regel
  local sentinel_aantal=0
  BACKUP_GRAPH_UITKOMST="onzeker"

  # Alleen voor de geïsoleerde regressieproef. Het opgegeven programma ontvangt
  # onderwerp en bericht als argument en mag nooit productiegeheimen verwachten.
  # In productie wordt deze haak expliciet geweigerd.
  if [ -n "${BACKUP_ALERT_COMMAND:-}" ]; then
    if [ "${BACKUP_TEST_MODE:-0}" != "1" ]; then
      echo "WAARSCHUWING: BACKUP_ALERT_COMMAND is alleen toegestaan met BACKUP_TEST_MODE=1." >&2
      return 1
    fi
    if "$BACKUP_ALERT_COMMAND" "$onderwerp" "$bericht"; then
      BACKUP_GRAPH_UITKOMST="geslaagd"
      return 0
    else
      local test_exit=$?
      BACKUP_GRAPH_UITKOMST="${BACKUP_TEST_ALERT_FAILURE_MODE:-mislukt}"
      case "$BACKUP_GRAPH_UITKOMST" in
        mislukt|onzeker) ;;
        *)
          echo "WAARSCHUWING: ongeldige BACKUP_TEST_ALERT_FAILURE_MODE." >&2
          BACKUP_GRAPH_UITKOMST="onzeker"
          ;;
      esac
      return "$test_exit"
    fi
  fi

  command -v docker >/dev/null 2>&1 || {
    BACKUP_GRAPH_UITKOMST="mislukt"
    echo "WAARSCHUWING: Graph-back-upmelding niet verzonden: docker ontbreekt." >&2
    return 1
  }
  [ -f "$compose_bestand" ] || {
    BACKUP_GRAPH_UITKOMST="mislukt"
    echo "WAARSCHUWING: Graph-back-upmelding niet verzonden: compose-bestand ontbreekt." >&2
    return 1
  }
  [ -f "$env_bestand" ] || {
    BACKUP_GRAPH_UITKOMST="mislukt"
    echo "WAARSCHUWING: Graph-back-upmelding niet verzonden: productie-envbestand ontbreekt." >&2
    return 1
  }

  if docker_uitvoer=$(docker compose -f "$compose_bestand" --env-file "$env_bestand" exec -T \
    -e BACKUP_ALERT_SUBJECT="$onderwerp" \
    -e BACKUP_ALERT_BODY="$bericht" \
    api node <<'NODE'
async function verstuur() {
  const vereist = [
    "AZURE_TENANT_ID",
    "AZURE_CLIENT_ID",
    "AZURE_CLIENT_SECRET",
    "RENE_ALERT_EMAIL",
  ];
  const ontbrekend = vereist.filter((naam) => !process.env[naam]);
  if (ontbrekend.length > 0) {
    console.error(`Graph-back-upmelding niet verzonden: ontbrekende configuratie (${ontbrekend.join(", ")}).`);
    return { uitkomst: "mislukt", code: 2 };
  }

  const tenant = process.env.AZURE_TENANT_ID;
  const mailbox = process.env.MAIL_MAILBOX || "app@fpsbrandpreventie.nl";
  const tokenBody = new URLSearchParams({
    client_id: process.env.AZURE_CLIENT_ID,
    client_secret: process.env.AZURE_CLIENT_SECRET,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  let fase = "token";
  try {
    const tokenResponse = await fetch(
      `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: tokenBody,
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!tokenResponse.ok) {
      console.error(`Graph-back-upmelding niet verzonden: token HTTP ${tokenResponse.status}.`);
      return { uitkomst: "mislukt", code: 3 };
    }
    const tokenJson = await tokenResponse.json();
    if (typeof tokenJson.access_token !== "string" || tokenJson.access_token.length === 0) {
      console.error("Graph-back-upmelding niet verzonden: tokenantwoord bevat geen toegangstoken.");
      return { uitkomst: "mislukt", code: 4 };
    }

    fase = "sendmail";
    const mailResponse = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/sendMail`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenJson.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            subject: process.env.BACKUP_ALERT_SUBJECT || "FPS Connect: externe back-upstaffel mislukt",
            body: {
              contentType: "Text",
              content: process.env.BACKUP_ALERT_BODY || "De externe back-upstaffel is mislukt.",
            },
            toRecipients: [
              { emailAddress: { address: process.env.RENE_ALERT_EMAIL } },
            ],
          },
          saveToSentItems: false,
        }),
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!mailResponse.ok) {
      console.error(`Graph-back-upmelding niet verzonden: sendMail HTTP ${mailResponse.status}.`);
      return { uitkomst: "mislukt", code: 5 };
    }
    console.log("Graph-back-upmelding verzonden.");
    return { uitkomst: "geslaagd", code: 0 };
  } catch (error) {
    const naam = error instanceof Error ? error.name : "onbekende fout";
    console.error(`Graph-back-upmelding niet verzonden: ${naam}.`);
    return fase === "sendmail"
      ? { uitkomst: "onzeker", code: 7 }
      : { uitkomst: "mislukt", code: 6 };
  }
}

verstuur()
  .then(({ uitkomst, code }) => {
    process.stdout.write(`FPS_BACKUP_GRAPH_RESULT=${uitkomst}|${code}\n`);
  })
  .catch((error) => {
    const naam = error instanceof Error ? error.name : "onbekende fout";
    console.error(`Graph-back-upmelding niet verzonden: onverwachte ${naam}.`);
    process.stdout.write("FPS_BACKUP_GRAPH_RESULT=onzeker|8\n");
  });
NODE
)
  then
    while IFS= read -r regel; do
      case "$regel" in
        FPS_BACKUP_GRAPH_RESULT=*)
          sentinel_aantal=$((sentinel_aantal + 1))
          sentinel="${regel#FPS_BACKUP_GRAPH_RESULT=}"
          ;;
        *)
          [ -z "$regel" ] || printf '%s\n' "$regel"
          ;;
      esac
    done <<< "$docker_uitvoer"
    if [ "$sentinel_aantal" -ne 1 ]; then
      BACKUP_GRAPH_UITKOMST="onzeker"
      echo "WAARSCHUWING: Graph-helper gaf geen eenduidige uitkomst." >&2
      return 70
    fi
    case "$sentinel" in
      "geslaagd|0")
        BACKUP_GRAPH_UITKOMST="geslaagd"
        return 0
        ;;
      "mislukt|2"|"mislukt|3"|"mislukt|4"|"mislukt|5"|"mislukt|6")
        BACKUP_GRAPH_UITKOMST="mislukt"
        graph_exit="${sentinel#*|}"
        return "$graph_exit"
        ;;
      "onzeker|7"|"onzeker|8")
        BACKUP_GRAPH_UITKOMST="onzeker"
        graph_exit="${sentinel#*|}"
        return "$graph_exit"
        ;;
      *)
        BACKUP_GRAPH_UITKOMST="onzeker"
        echo "WAARSCHUWING: Graph-helper gaf een ongeldige uitkomst." >&2
        return 70
        ;;
    esac
  else
    graph_exit=$?
    [ -z "$docker_uitvoer" ] || printf '%s\n' "$docker_uitvoer"
    BACKUP_GRAPH_UITKOMST="onzeker"
    return "$graph_exit"
  fi
}