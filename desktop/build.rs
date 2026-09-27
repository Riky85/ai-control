// Windows: icon, version details (company, product, description) and an
// "asInvoker" manifest — an .exe without them looks anonymous to SmartScreen
// and antivirus.
fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        let mut res = winresource::WindowsResource::new();
        res.set_icon("assets/angar.ico")
            .set("ProductName", "angar")
            .set("FileDescription", "angar - AI usage for your company")
            .set("CompanyName", "angar")
            .set("LegalCopyright", "angar")
            .set("OriginalFilename", "angar.exe")
            .set("InternalName", "angar")
            .set_manifest(
                r#"<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <assemblyIdentity type="win32" name="ai.angar.agent" version="0.3.0.0"/>
  <description>angar - AI usage for your company</description>
  <trustInfo xmlns="urn:schemas-microsoft-com:asm.v3"><security><requestedPrivileges>
    <requestedExecutionLevel level="asInvoker" uiAccess="false"/>
  </requestedPrivileges></security></trustInfo>
  <compatibility xmlns="urn:schemas-microsoft-com:compatibility.v1"><application>
    <supportedOS Id="{8e0f7a12-bfb3-4fe8-b9a5-48fd50a15a9a}"/>
  </application></compatibility>
  <application xmlns="urn:schemas-microsoft-com:asm.v3"><windowsSettings>
    <dpiAware xmlns="http://schemas.microsoft.com/SMI/2005/WindowsSettings">true</dpiAware>
  </windowsSettings></application>
</assembly>"#,
            );
        if let Err(e) = res.compile() {
            println!("cargo:warning=windows resources not embedded: {e}");
        }
    }
}
