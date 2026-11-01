' forge: starts the ai-memory server of {{W}}/{{P}} at logon, hidden. Delete this file to stop it.
CreateObject("WScript.Shell").Run """{{BIN}}"" --data-dir ""{{DATADIR}}"" serve --transport http --bind 127.0.0.1:{{PORT}} --workspace {{W}} --project {{P}}", 0, False
