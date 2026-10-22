; Extra installer steps for Tack.
; Your tasks live in %APPDATA%\Tack\store.json. The installer never deletes or changes them;
; before every install or update it copies them to %APPDATA%\Tack\backups\before-update-<date>.json.
!include "FileFunc.nsh"

!macro customInit
  Push $0
  Push $1
  Push $2
  Push $3
  Push $4
  Push $5
  Push $6
  IfFileExists "$APPDATA\Tack\store.json" 0 tack_no_data
    ${GetTime} "" "L" $0 $1 $2 $3 $4 $5 $6
    CreateDirectory "$APPDATA\Tack\backups"
    CopyFiles /SILENT "$APPDATA\Tack\store.json" "$APPDATA\Tack\backups\before-update-$2-$1-$0_$4-$5-$6.json"
  tack_no_data:
  Pop $6
  Pop $5
  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Pop $0
!macroend
