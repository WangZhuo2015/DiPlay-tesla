#!/system/bin/sh
# Install public-origin metadata into an existing app's private no-backup directory.
# Run as root on Android. This does not install/start a proxy or alter any routes.
set -eu
[ "$(id -u)" = 0 ] || { echo 'Run this metadata installer as Android root'; exit 1; }
[ "$#" = 2 ] || { echo 'Usage: sh install-entry.sh PACKAGE GENERATED_ENTRY_JSON'; exit 1; }
PACKAGE=$1
SOURCE=$2
case "$PACKAGE" in ''|*[!a-zA-Z0-9_.]*) echo 'Invalid package name'; exit 1;; esac
case "$SOURCE" in /data/*) ;; *) echo 'Use a generated metadata file under /data'; exit 1;; esac
[ -f "$SOURCE" ] && [ "$(stat -c %s "$SOURCE")" -le 2048 ] || { echo 'Metadata missing or too large'; exit 1; }
# Accept only the generator's tiny origin-only JSON, never a certificate/key/config file.
CONTENT=$(tr -d '[:space:]' < "$SOURCE")
printf '%s' "$CONTENT" | grep -Eq '^\{"version":1,"url":"https://[a-z0-9.-]+(:[0-9]+)?"\}$' || { echo 'Not generated HTTPS origin metadata'; exit 1; }
APP_DIR=$(readlink -f "/data/user/0/$PACKAGE")
case "$APP_DIR" in "/data/user/0/$PACKAGE"|"/data/data/$PACKAGE") ;; *) echo 'Unexpected app data directory'; exit 1;; esac
[ -d "$APP_DIR" ] && [ -f "$SOURCE" ] || { echo 'App or generated metadata missing'; exit 1; }
APP_UID=$(stat -c %u "$APP_DIR")
case "$APP_UID" in ''|*[!0-9]*) echo 'Invalid app UID'; exit 1;; esac
[ "$APP_UID" -ge 10000 ] || { echo 'Not an application data directory'; exit 1; }
DEST_DIR="$APP_DIR/no_backup"
if [ -e "$DEST_DIR" ]; then
    [ "$(readlink -f "$DEST_DIR")" = "$DEST_DIR" ] || { echo 'Unexpected no-backup directory'; exit 1; }
else
    mkdir "$DEST_DIR"
    chown "$APP_UID:$APP_UID" "$DEST_DIR"
    chmod 700 "$DEST_DIR"
fi
DEST="$DEST_DIR/tesla-https-entry.json"
[ ! -L "$DEST" ] || { echo 'Refusing a symbolic metadata destination'; exit 1; }
TEMP="$DEST_DIR/tesla-https-entry.json.install"
[ ! -e "$TEMP" ] && [ ! -L "$TEMP" ] || { echo 'An earlier metadata install exists'; exit 1; }
cp "$SOURCE" "$TEMP"
chown "$APP_UID:$APP_UID" "$TEMP"
chmod 600 "$TEMP"
mv "$TEMP" "$DEST"
restorecon "$DEST" 2>/dev/null || true
echo 'Android entry metadata installed; reopen Connection -> Tesla browser'
