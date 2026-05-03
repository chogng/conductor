!macro customUnInstallSection
  Section /o "Delete Conductor Studio local data" SEC_DELETE_CONDUCTOR_LOCAL_DATA
    # Remove the files and folders Conductor Studio creates under app.getPath("home")\.device.
    Delete "$PROFILE\.device\config.json"
    Delete "$PROFILE\.device\template.json"
    Delete "$PROFILE\.device\store-path.json"
    Delete "$PROFILE\.device\*.settings.json"
    RMDir /r "$PROFILE\.device\cache"
    RMDir /r "$PROFILE\.device\demo"
    RMDir /r "$PROFILE\.device\origin"
    RMDir /r "$PROFILE\.device\rust-xls-jobs"
    RMDir "$PROFILE\.device"

    # Electron/Chromium user data and transient analysis temp files.
    RMDir /r "$APPDATA\${APP_FILENAME}"
    !ifdef APP_PRODUCT_FILENAME
      RMDir /r "$APPDATA\${APP_PRODUCT_FILENAME}"
    !endif
    !ifdef APP_PACKAGE_NAME
      RMDir /r "$APPDATA\${APP_PACKAGE_NAME}"
    !endif
    RMDir /r "$TEMP\conductor-device-analysis"
  SectionEnd
!macroend
