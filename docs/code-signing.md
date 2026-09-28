# Code signing the angar desktop app

The desktop app (`desktop/`) is built by `.github/workflows/desktop.yml` and published to the
`desktop-latest` GitHub release. The web app downloads it from there and names it after each
company's join code (`angar-<code>.exe`, `angar-<code>.app`, `angar-<code>`).

Signing is optional. Each platform is signed only when its repository secrets exist. Without
them the workflow publishes the unsigned build as before and adds a warning to the run.

| Platform | Without secrets | With secrets |
|---|---|---|
| Windows | Unsigned `.exe`. SmartScreen shows "Unknown publisher", and Intune/WDAC/AppLocker publisher rules can't match it. | Authenticode-signed with an RFC 3161 timestamp. |
| macOS | Ad-hoc signed `.app`. Gatekeeper blocks it: the user has to right-click and choose Open, or go to System Settings, Privacy & Security, Open Anyway. | Developer ID signed, hardened runtime, notarised and stapled. It opens normally, including offline. |
| Linux | Binary plus `SHA256SUMS`. | Same. |

## Why the per-company name doesn't break signatures

- **Windows and Linux.** The server returns exactly the bytes of the release asset and only
  changes the file name (`Content-Disposition`). The Authenticode signature covers the PE
  contents (the hash skips only the checksum field and the certificate table), not the file
  name. A renamed copy verifies exactly like the original, and CI checks this with
  `signtool verify /pa` on a renamed copy. Every company downloads the same file, with the
  same hash, so SmartScreen reputation builds up for one file instead of one per company.
- **macOS.** CI publishes the finished bundle as `angar-macos.app.zip` (containing
  `angar.app/`). The server rewrites only the zip entry names from `angar.app/…` to
  `angar-<code>.app/…`. It copies the compressed data and the Unix permissions byte for byte
  (`renameAppInZip` in `src/lib/desktop.ts`). The name of a bundle's folder isn't part of its
  code signature or its notarisation ticket. CI checks this by renaming the bundle and running
  `codesign --verify --deep --strict` on it. The app reads the join code from the bundle name:
  `join_code_from_file_name` walks up from `Contents/MacOS/angar` to `angar-<code>.app`.
- **Backward compatibility.** If the release doesn't have `angar-macos.app.zip` yet (a build
  from before this change), the server falls back to the old path: it wraps the bare
  `angar-macos-universal` binary in a `.app` on the fly. That bundle is never Developer ID
  signed. CI keeps publishing `angar-macos-universal`, so older server versions keep working.

## What to buy

### Windows (pick one)

1. **Azure Artifact Signing** (formerly Trusted Signing). **Recommended.**
   - About US$9.99 a month on the Basic tier, with 5,000 signatures included. There is no
     hardware token, and Microsoft manages the keys.
   - Public Trust is available to organisations in the EU. Microsoft verifies the company
     (VAT ID, registration documents, domain email). The preview required 3 years of company
     history. The GA documentation says there's no minimum age, but some young companies
     have been declined, so check the current prerequisites before you buy anything else.
   - The certificates are short-lived (a few days) and rotate automatically. The timestamp
     keeps the signatures valid after they expire.
2. **Classic OV or EV code-signing certificate** from a CA such as Sectigo, DigiCert,
   Certum, SSL.com or GlobalSign. Roughly €200–600 a year for OV and more for EV.
   - **Important:** since June 2023, the CA/Browser Forum requires the private key of every
     new OV and EV code-signing certificate to live in a hardware security module (a USB
     token or a cloud HSM). You can't export it as a `.pfx`. The `WINDOWS_CERT_PFX_BASE64`
     path therefore only works with:
     - an older certificate issued as a PFX that is still valid, or
     - a CA or HSM that gives you an exportable key for CI, which is rare.
   - For a new certificate, use the CA's cloud-HSM signing service instead (SSL.com eSigner,
     DigiCert KeyLocker, Certum SimplySign and so on). Each needs its own CI step. Azure
     Artifact Signing is simpler.
   - EV no longer bypasses SmartScreen reputation (Microsoft removed that in 2024), so OV is
     enough.

### macOS

- **Apple Developer Program, organisation membership**: US$99 (€99) a year. You need a
  D-U-N-S number for the company (free from Dun & Bradstreet, takes a few days). The Account
  Holder can then create a **Developer ID Application** certificate. Notarisation is included.

## Secrets

Set them in GitHub under Settings, Secrets and variables, Actions, or with `gh secret set NAME`.
The workflow picks the methods in this order:

- **Windows:** Azure, if all 6 Azure secrets are set; otherwise the PFX, if
  `WINDOWS_CERT_PFX_BASE64` is set; otherwise unsigned.
- **macOS:** the App Store Connect API key, if all 3 `APPLE_API_*` secrets are set; otherwise
  the Apple ID. A certificate without notarisation credentials gets signed but not
  notarised, and the run shows a warning.

### Windows: Azure Artifact Signing

| Secret | Value |
|---|---|
| `AZURE_TENANT_ID` | Directory (tenant) ID of your Entra ID tenant |
| `AZURE_CLIENT_ID` | Application (client) ID of the app registration used by CI |
| `AZURE_CLIENT_SECRET` | A client secret of that app registration |
| `TRUSTED_SIGNING_ACCOUNT` | Name of the Artifact Signing account |
| `TRUSTED_SIGNING_PROFILE` | Name of the certificate profile |
| `TRUSTED_SIGNING_ENDPOINT` | Regional endpoint of the account, e.g. `https://weu.codesigning.azure.net/` (West Europe) or `https://neu.codesigning.azure.net/` (North Europe) |

Steps:

1. In the Azure portal, register the resource provider `Microsoft.CodeSigning` on your
   subscription.
2. Create an **Artifact Signing account** in an EU region on the Basic tier. Its overview page
   shows the account URI, which is `TRUSTED_SIGNING_ENDPOINT`.
3. Open the account, go to **Identity validations**, and create a new one with **Public**
   trust and **Organization** type. Enter the legal name, VAT or registration number and
   address exactly as in the company register. Wait for approval, which can take hours or
   days.
4. Go to **Certificate profiles** and create a new **Public Trust** profile linked to that
   validation. Its name is `TRUSTED_SIGNING_PROFILE`.
5. In Entra ID, go to **App registrations** and create a new one, for example
   `angar-ci-signing`. Copy the tenant ID and the client ID. Under Certificates & secrets,
   create a new client secret and copy its value (`AZURE_CLIENT_SECRET`). Set a reminder: the
   secret expires.
6. In the signing account, go to **Access control (IAM)** and add a role assignment. Choose
   **Artifact Signing Certificate Profile Signer** (formerly *Trusted Signing Certificate
   Profile Signer*) and assign it to the app registration.
7. Set the 6 secrets and run the workflow (Actions, Desktop app, Run workflow).

### Windows: OV/EV certificate as PFX

| Secret | Value |
|---|---|
| `WINDOWS_CERT_PFX_BASE64` | `base64 -w0 cert.pfx` (Linux) or `base64 -i cert.pfx` (macOS) |
| `WINDOWS_CERT_PASSWORD` | The PFX password |

The workflow signs with `signtool sign /fd sha256 /tr <RFC 3161 server> /td sha256`. It tries
DigiCert, then Sectigo, then Certum as the timestamp server.

### macOS: Developer ID + notarisation

| Secret | Value |
|---|---|
| `MACOS_CERT_P12_BASE64` | The Developer ID Application certificate and private key as .p12, base64 |
| `MACOS_CERT_PASSWORD` | The .p12 password |
| `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, `APPLE_API_KEY_P8_BASE64` | App Store Connect API key (preferred) |
| `APPLE_ID`, `APPLE_TEAM_ID`, `APPLE_APP_PASSWORD` | Or an Apple ID with an app-specific password |

Steps:

1. **Certificate.** On a Mac, open Keychain Access and go to Certificate Assistant, Request a
   Certificate From a Certificate Authority, then save it to disk. At
   developer.apple.com, go to Certificates, click +, and choose **Developer ID Application**
   (only the Account Holder can do this). Upload the request and download the `.cer`.
   Double-click it to add it to the keychain.
2. **Export.** In Keychain Access, open My Certificates, right-click
   "Developer ID Application: <Company> (TEAMID)", choose Export, and save it as `.p12` with
   a strong password. Then run `base64 -i angar-devid.p12 | pbcopy` and paste the result
   into `MACOS_CERT_P12_BASE64`.
3. **Notarisation credentials** (pick one):
   - **API key (recommended).** In App Store Connect, go to Users and Access, Integrations,
     Team Keys, and generate a key with the Developer role. Copy the Key ID
     (`APPLE_API_KEY_ID`) and the Issuer ID (`APPLE_API_ISSUER`). Download
     `AuthKey_XXXX.p8`, which you can only download once, run `base64 -i AuthKey_XXXX.p8`,
     and store the result in `APPLE_API_KEY_P8_BASE64`.
   - **Apple ID.** At appleid.apple.com, go to Sign-In and Security, App-Specific Passwords,
     and generate one (`APPLE_APP_PASSWORD`). `APPLE_ID` is the account email.
     `APPLE_TEAM_ID` is the 10-character Team ID shown under Membership.

What CI does:

1. Imports the .p12 into a temporary keychain, which is deleted at the end of the job.
2. Builds `angar.app` from `desktop/assets/Info.plist` (with the version from `Cargo.toml`)
   and `desktop/assets/angar.png` (converted to `.icns`).
3. Signs it with `codesign --options runtime --timestamp`. No entitlements are needed: the
   app is a plain network client with no JIT and no plug-ins, and it isn't sandboxed.
4. Notarises it with `xcrun notarytool submit --wait`, then runs `xcrun stapler staple` and
   `spctl -a -vv`.
5. Zips it with `ditto` as `angar-macos.app.zip`.

## Verify a download

Windows (PowerShell or a Developer Command Prompt):

```powershell
signtool verify /pa /v angar-<code>.exe     # "Successfully verified", signer = your company
Get-AuthenticodeSignature .\angar-<code>.exe | Format-List   # Status: Valid
```

macOS (after unzipping):

```sh
codesign -dv --verbose=4 angar-<code>.app    # Authority=Developer ID Application: <Company> (TEAMID), flags=0x10000(runtime), Timestamp=…
codesign --verify --deep --strict --verbose=2 angar-<code>.app
spctl -a -vv -t exec angar-<code>.app        # accepted  source=Notarized Developer ID
xcrun stapler validate angar-<code>.app      # The validate action worked!
```

Checksums: `SHA256SUMS` in the `desktop-latest` release lists the canonical asset names. A
renamed Windows or Linux download has the same hash as its asset:

```sh
sha256sum angar-<code>.exe    # compare with the angar-windows-x64.exe line
```

The macOS zip is rebuilt per company, so its hash differs from the release asset. Check it
with `codesign` and `spctl` instead.

The angar Edge release (`edge-latest`) also publishes `SHA256SUMS`, and `edge/install.sh`
checks the downloaded binary against it. If the file is missing (an older release or a
mirror), the installer prints a warning and skips the check. If the hash doesn't match, it
stops.

## MDM notes

- **Intune / WDAC / AppLocker:** with a signed `.exe` you can use publisher rules. Azure
  Artifact Signing rotates its leaf certificate every few days, so match on the publisher
  (subject CN/O), not on a certificate thumbprint. For WDAC, follow Microsoft's guidance for
  Artifact Signing, which uses the EKU-based signer rule.
- **Jamf:** a notarised Developer ID app doesn't need a Gatekeeper exception. For PPPC or
  Login Items profiles, use the bundle ID `ai.angar.setup` and the Team ID.

## Known limits

- On macOS the app installs itself by copying its executable out of the bundle into the
  user's data folder and starting it with a LaunchAgent (`desktop/src/install.rs`). The copy
  keeps its embedded Developer ID signature: Login Items shows the developer, and the kernel
  checks the page hashes. However, `codesign --verify` on the lone copy reports the bundle's
  sealed resources as missing, because they stayed in the `.app`. Copying the whole `.app`
  into `~/Library/Application Support/angar/` would remove this, but that is a change to
  `install.rs`.
- The signed Windows `.exe` gets SmartScreen reputation over time, not instantly, even with
  a valid signature. Azure Artifact Signing builds reputation on the validated identity.
