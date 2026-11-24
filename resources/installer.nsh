; Traktiva NSIS additions (electron-builder "nsis.include").
; Keep a copy of this installer in the app's data folder: the in-app updater (electron/updater.js) builds the next
; version from it and downloads only the blocks that changed (differential update with the .blockmap files).
!macro customInstall
  StrCpy $0 "$APPDATA\Traktiva\updates"
  StrCpy $1 "$0\Traktiva-Setup-${VERSION}.exe"
  ; a silent update already runs from that folder: nothing to copy then
  StrCmp "$EXEPATH" "$1" traktiva_cache_done
  CreateDirectory "$0"
  CopyFiles /SILENT "$EXEPATH" "$1"
  traktiva_cache_done:
!macroend
