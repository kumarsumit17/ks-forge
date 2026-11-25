; Installer hooks for the NSIS installer (bundle.windows.nsis.installerHooks in
; desktop/windows/tauri.conf.json). Per user (HKCU), no admin rights: File Explorer's
; "Open in KS Forge" on folders, folder backgrounds and drives, removed on uninstall.

!macro KSF_OPEN_HERE ROOT
  WriteRegStr HKCU "Software\Classes\${ROOT}\shell\KSForge" "" "Open in KS Forge"
  WriteRegStr HKCU "Software\Classes\${ROOT}\shell\KSForge" "Icon" '"$INSTDIR\ks-forge.exe",0'
  WriteRegStr HKCU "Software\Classes\${ROOT}\shell\KSForge\command" "" '"$INSTDIR\ks-forge.exe" -d "%V"'
!macroend

!macro NSIS_HOOK_POSTINSTALL
  !insertmacro KSF_OPEN_HERE "Directory"
  !insertmacro KSF_OPEN_HERE "Directory\Background"
  !insertmacro KSF_OPEN_HERE "Drive"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DeleteRegKey HKCU "Software\Classes\Directory\shell\KSForge"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\KSForge"
  DeleteRegKey HKCU "Software\Classes\Drive\shell\KSForge"
!macroend
