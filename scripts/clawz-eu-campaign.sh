#!/bin/bash
#
# CLAWZ European October Tour outreach campaign — 50 personalized emails
# via Microsoft Outlook desktop (AppleScript). One send per contact,
# 45 seconds between sends. HTML-formatted bodies for proper line breaks.
#
# Run:
#   bash ~/corson-command-center/scripts/clawz-eu-campaign.sh
#
# Prereq: Outlook desktop signed in as dho@corsonagency.com.
set -u

SUBJECT="CLAWZ — October Europe Availability"
SLEEP_SECS=45

# ── CONTACTS ──────────────────────────────────────────────────────────────
# Format: TIER|GREETING|EMAIL   (W = warm past buyer, C = cold)
CONTACTS=(
  "C|Hi Team Club Hard|info@clubhard.be"
  "C|Hi Brice|brice@fuse.be"
  "C|Hi Team Hardwave|contacthardwave@gmail.com"
  "C|Hi Ruben|ruben@kompassklub.com"
  "C|Hi Kenneth|kenneth@clubvaag.be"
  "C|Hi Team Fuse|david@fuse.be"
  "W|Hi Gilles|gilles@modul-air.com"
  "W|Hi Sebastien|sebastien@so-whappy.com"
  "W|Hi Ran|algemeen@deomgekeerdewereldgent.be"
  "C|Hi Alexis|alexis@nexusclub.fr"
  "C|Hi Team Wonderland Clichy|contacter.organik@gmail.com"
  "C|Hi Team Rex Club|infos@rexclub.com"
  "W|Hi Benjamin|contactpisica@gmail.com"
  "C|Hi Eule|eule@kulturkosmos.de"
  "C|Hi Team Get Well|getwelleventsnl@gmail.com"
  "C|Hi Team TBA Management|tom@tba-management.com"
  "C|Hi Team RSO|contact@clubost.de"
  "C|Hi Team Tresor|paul@tresorberlin.com"
  "C|Hi Team Kapitel|management@kapitelberlin.com"
  "C|Hi Andreas|booking@gotec-club.de"
  "C|Hi Team Hive Festival|T_booking@hive-festival.com"
  "W|Hi Dominic|dl@haus33.club"
  "W|Hi Falk|booking@nolimitfrbg.be"
  "C|Hi D9|darknine.contact@gmail.com"
  "C|Hi Ronan|ronan@subjectevents.com"
  "C|Hi Mark|mark@movement.it"
  "W|Hi Alessio|alancariani@gmail.com"
  "C|Hi Madson|booking@riktusparty.com"
  "C|Hi Team Complex Maastricht|luc@complexmaastricht.nl"
  "C|Hi Mino|mino@awakenings.nl"
  "C|Hi Joost|bookings@vaultedmusic.nl"
  "C|Hi Team Unwind|milan.bothof@unwindevents.nl"
  "C|Hi Team Klautenbach|danieklautenbach@gmail.com"
  "C|Hi Koen|koen@honoursevents.nl"
  "C|Hi Team NK Hagen|bookings@nkhagen.com"
  "C|Hi Team Relativz|Kevinvanvliet@relativz.nl"
  "C|Hi Wiktoria|wiktoria@smolna38.com"
  "C|Hi Hubert|hubert.mohamed.kred@gmail.com"
  "C|Hi Edu|edu@inputbcn.com"
  "W|Hi Bea|beagomez@fabrikmadrid.com"
  "C|Hi Isabella|isabella@thebassementclub.com"
  "C|Hi Team Unlocked|unlockedbcn@gmail.com"
  "C|Hi Team Matadero Club|contact@mataderoclub.com"
  "W|Hi Yohan|nick@stageone.se"
  "C|Hi Jorge|jorge@fabriclondon.com"
  "C|Hi Nathaan|nathan@mechano.uk"
  "C|Hi Gabriele|gabriele@e1ldn.co"
  "C|Hi Team Code X|highbookingsuk@gmail.com"
  "C|Hi Team Link|tesseramento@link.bo.it"
  "C|Hi Team Krach Club|krach.technoclub@gmail.com"
)

build_cold_body() {
  local greeting="$1"
  cat <<HTML
<html><body style='font-family: Arial, sans-serif; font-size: 14px; line-height: 1.5;'>
<p>${greeting},</p>
<p>Dropping a hello! Wanted to let you know CLAWZ will be touring Europe all of October and is available for bookings. She'd love to play for you — great timing with ADE season.</p>
<p>She's been on a run this year with new music out and will be playing EDC Las Vegas next month.</p>
<p>Let me know if there is interest!</p>
<p>Best,<br>Danny</p>
</body></html>
HTML
}

build_warm_body() {
  local greeting="$1"
  cat <<HTML
<html><body style='font-family: Arial, sans-serif; font-size: 14px; line-height: 1.5;'>
<p>${greeting},</p>
<p>Hope all is well! Dropping a note — CLAWZ is touring Europe all October and is available for bookings. She'd love to come back and play for you again.</p>
<p>She's been on a run this year with new music out and will be playing EDC Las Vegas next month.</p>
<p>Let me know if there is interest!</p>
<p>Best,<br>Danny</p>
</body></html>
HTML
}

send_one() {
  local tier="$1"
  local greeting="$2"
  local email="$3"
  local body
  if [[ "$tier" == "W" ]]; then
    body="$(build_warm_body "$greeting")"
  else
    body="$(build_cold_body "$greeting")"
  fi

  # Write body + subject + recipient to a temp AppleScript file so newlines and
  # special chars survive cleanly (no shell -e / heredoc escape issues).
  local tmp
  tmp="$(mktemp /tmp/clawz_send_XXXXXX.applescript)"
  cat > "$tmp" <<APPLESCRIPT
set msgBody to "$(printf '%s' "$body" | sed 's/\\/\\\\/g; s/"/\\"/g' | tr '\n' '\r' | tr '\r' ' ' | sed 's/  */ /g')"
tell application "Microsoft Outlook"
  set newMessage to make new outgoing message with properties {subject:"$SUBJECT", content:msgBody}
  make new recipient at newMessage with properties {email address:{address:"$email"}}
  send newMessage
end tell
APPLESCRIPT
  osascript "$tmp"
  local rc=$?
  rm -f "$tmp"
  return $rc
}

total=${#CONTACTS[@]}
i=1
failed=0
for contact in "${CONTACTS[@]}"; do
  IFS='|' read -r tier greeting email <<< "$contact"
  echo "Sending ${i}/${total}: ${greeting} — ${email}"
  if ! send_one "$tier" "$greeting" "$email"; then
    echo "  ✗ send failed for ${email}"
    failed=$((failed+1))
  fi
  if [[ $i -lt $total ]]; then
    sleep "$SLEEP_SECS"
  fi
  i=$((i+1))
done

echo ""
echo "Campaign complete. Sent: $((total - failed))/${total}. Failed: ${failed}."
