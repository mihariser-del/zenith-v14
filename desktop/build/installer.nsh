; Zelpophai AI custom installer (electron-builder picks up build/installer.nsh).
;
; Quick by default: the welcome page has one big "Install" button. It installs
; for the current user, adds a desktop shortcut and opens Zelpophai when done -
; no other pages. "Customize installation" on the same page opens the full
; wizard: choose the folder, pick extras (desktop shortcut, start with Windows)
; and a finish page with "Open Zelpophai AI now".
;
; Auto-updates (silent, --updated) skip every page and keep existing choices.

; Installer-only variables (declared here, before the pages that use them).
!ifndef BUILD_UNINSTALLER
  !include StrContains.nsh
  Var zpCustom
  Var zpDesktop
  Var zpAutostart
  Var zpCbDesktop
  Var zpCbAutostart
!endif

!macro customHeader
  !include nsDialogs.nsh
  BrandingText "Zelpophai AI"
  ShowInstDetails nevershow
  ShowUninstDetails nevershow
!macroend

!macro customInit
  StrCpy $zpCustom "0"
  StrCpy $zpDesktop "1"
  StrCpy $zpAutostart "0"
!macroend

; Always "just for me" (no admin prompt), so the who-should-use-it page is skipped.
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

; ───────────────────────────────────────────── welcome ──
!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Welcome to Zelpophai AI"
  !define MUI_WELCOMEPAGE_TITLE_3LINES
  !define MUI_WELCOMEPAGE_TEXT "Chat, make images, videos and documents, and build code with one AI — now right on your PC.$\r$\n$\r$\nClick Install and Zelpophai will be ready in a few seconds. It opens by itself when it's done.$\r$\n$\r$\nBy installing you agree to the Terms of Service and the Privacy Policy."
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW zpWelcomeShow
  !insertmacro MUI_PAGE_WELCOME

  Function zpWelcomeShow
    StrCpy $zpCustom "0"
    GetDlgItem $0 $HWNDPARENT 1
    SendMessage $0 ${WM_SETTEXT} 0 "STR:&Install"

    ${NSD_CreateLink} 120u 150u 160u 12u "Customize installation  ›"
    Pop $0
    SetCtlColors $0 2563EB FFFFFF
    ${NSD_OnClick} $0 zpCustomize
    System::Call "user32::SetWindowPos(p $0, p 0, i 0, i 0, i 0, i 0, i 0x13)"   ; draw above the welcome text

    ${NSD_CreateLink} 120u 172u 70u 10u "Terms of Service"
    Pop $0
    SetCtlColors $0 6B7280 FFFFFF
    ${NSD_OnClick} $0 zpOpenTerms
    System::Call "user32::SetWindowPos(p $0, p 0, i 0, i 0, i 0, i 0, i 0x13)"   ; draw above the welcome text

    ${NSD_CreateLink} 195u 172u 70u 10u "Privacy Policy"
    Pop $0
    SetCtlColors $0 6B7280 FFFFFF
    ${NSD_OnClick} $0 zpOpenPrivacy
    System::Call "user32::SetWindowPos(p $0, p 0, i 0, i 0, i 0, i 0, i 0x13)"   ; draw above the welcome text
  FunctionEnd

  Function zpCustomize
    Pop $0
    StrCpy $zpCustom "1"
    SendMessage $HWNDPARENT 0x408 1 0   ; go to the next page
  FunctionEnd

  Function zpOpenTerms
    Pop $0
    ExecShell "open" "https://zelpophai.up.railway.app/terms"
  FunctionEnd

  Function zpOpenPrivacy
    Pop $0
    ExecShell "open" "https://zelpophai.up.railway.app/privacy"
  FunctionEnd
!macroend

; ──────────────────────────────── folder + extras (Customize only) ──
!macro customPageAfterChangeDir
  !define MUI_PAGE_CUSTOMFUNCTION_PRE zpDirPre
  !define MUI_PAGE_CUSTOMFUNCTION_LEAVE zpDirLeave
  !define MUI_PAGE_HEADER_TEXT "Choose where to install"
  !define MUI_PAGE_HEADER_SUBTEXT "Zelpophai AI will be installed in this folder."
  !define MUI_DIRECTORYPAGE_TEXT_TOP "Zelpophai AI will be installed in the folder below. To use a different folder, click Browse."
  !insertmacro MUI_PAGE_DIRECTORY

  Page custom zpOptionsCreate zpOptionsLeave

  Function zpDirPre
    ${If} $zpCustom != "1"
      Abort
    ${EndIf}
    ${If} ${isUpdated}
      Abort
    ${EndIf}
  FunctionEnd

  Function zpDirLeave
    ; make sure the folder ends with the app's own sub-folder
    ${StrContains} $0 "${APP_FILENAME}" $INSTDIR
    ${If} $0 == ""
      StrCpy $INSTDIR "$INSTDIR\${APP_FILENAME}"
    ${EndIf}
  FunctionEnd

  Function zpOptionsCreate
    ${If} $zpCustom != "1"
      Abort
    ${EndIf}
    ${If} ${isUpdated}
      Abort
    ${EndIf}
    !insertmacro MUI_HEADER_TEXT "Extras" "Choose how Zelpophai AI fits into Windows."
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}

    ${NSD_CreateCheckbox} 0 6u 100% 12u "Add a shortcut to my &desktop"
    Pop $zpCbDesktop
    ${If} $zpDesktop == "1"
      ${NSD_Check} $zpCbDesktop
    ${EndIf}

    ${NSD_CreateCheckbox} 0 26u 100% 12u "&Start Zelpophai AI when Windows starts (it waits quietly in the tray)"
    Pop $zpCbAutostart
    ${If} $zpAutostart == "1"
      ${NSD_Check} $zpCbAutostart
    ${EndIf}

    ${NSD_CreateLabel} 0 56u 100% 40u "Tips: press Ctrl+Shift+Space anywhere for a quick chat, and Ctrl+Shift+Z to ask Zelpophai Mini about your screen. You can change these options later from the tray icon."
    Pop $0

    GetDlgItem $0 $HWNDPARENT 1
    SendMessage $0 ${WM_SETTEXT} 0 "STR:&Install"
    nsDialogs::Show
  FunctionEnd

  Function zpOptionsLeave
    ${NSD_GetState} $zpCbDesktop $0
    ${If} $0 == ${BST_CHECKED}
      StrCpy $zpDesktop "1"
    ${Else}
      StrCpy $zpDesktop "0"
    ${EndIf}
    ${NSD_GetState} $zpCbAutostart $0
    ${If} $0 == ${BST_CHECKED}
      StrCpy $zpAutostart "1"
    ${Else}
      StrCpy $zpAutostart "0"
    ${EndIf}
  FunctionEnd
!macroend

; ──────────────────────────────────────────── install ──
!macro customInstall
  ${IfNot} ${isUpdated}
    ${If} $zpDesktop == "1"
      CreateShortCut "$DESKTOP\${SHORTCUT_NAME}.lnk" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
      WinShell::SetLnkAUMI "$DESKTOP\${SHORTCUT_NAME}.lnk" "${APP_ID}"
    ${EndIf}
    ; the app applies these once on first start (see main.js applyInstallerOptions)
    CreateDirectory "$APPDATA\${PRODUCT_NAME}"
    FileOpen $0 "$APPDATA\${PRODUCT_NAME}\installer-options.json" w
    ${If} $zpAutostart == "1"
      FileWrite $0 '{"startWithWindows": true}'
    ${Else}
      FileWrite $0 '{"startWithWindows": false}'
    ${EndIf}
    FileClose $0
  ${EndIf}
!macroend

!macro customUnInstall
  ${IfNot} ${isUpdated}
    Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
  ${EndIf}
!macroend

; ───────────────────────────────────────────── finish ──
!macro customFinishPage
  Function zpStartApp
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" ""
  FunctionEnd

  Function zpFinishPre
    ; quick install: just open Zelpophai and close the installer
    ${If} $zpCustom != "1"
      Call zpStartApp
      Abort
    ${EndIf}
  FunctionEnd

  !define MUI_FINISHPAGE_TITLE "Zelpophai AI is ready"
  !define MUI_FINISHPAGE_TEXT "Everything's set up. Find Zelpophai AI in the Start menu$\r$\nand in the tray at the bottom-right of your screen."
  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_TEXT "Open Zelpophai AI now"
  !define MUI_FINISHPAGE_RUN_FUNCTION zpStartApp
  !define MUI_PAGE_CUSTOMFUNCTION_PRE zpFinishPre
  !insertmacro MUI_PAGE_FINISH
!macroend
