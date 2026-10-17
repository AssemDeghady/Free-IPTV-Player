# Free IPTV Player

A clean, high-performance, and privacy-respecting IPTV player built natively for **Samsung Smart TVs (Tizen OS 3.0+)** and **LG Smart TVs (webOS 3.0 through webOS 24+)** from a single unified codebase.

> **CRITICAL LEGAL NOTICE & DISCLAIMER**  
> **Free IPTV Player is strictly a media playback client application.**  
> It does **not** bundle, host, scrape, index, distribute, or provide any streaming playlists, channels, video content, or IPTV services. Users are strictly required to supply their own legally authorized IPTV playlists and streaming provider credentials.

---

## Supported Smart TV Platforms

| Platform | OS Versions | Package Format | Playback Engine | Remote Control |
| :--- | :--- | :--- | :--- | :--- |
| **LG Smart TV** | webOS 3.0 through webOS 24+ | `.ipk` | HTML5 `<video>` / HLS.js | Magic Remote Pointer, Back (461), CH+/CH- |
| **Samsung Smart TV** | Tizen 3.0 through Tizen 8.0+ | `.wgt` | Hardware Samsung AVPlay | Standard & Smart Remote D-Pad & Media Keys |
| **Modern Browser** | Chrome, Edge, Safari, Firefox | Web App | HTML5 `<video>` / HLS.js | Keyboard Navigation (Arrows, Enter, Esc/Backspace) |

---

## LG Smart TV (webOS)

### Building the webOS App (IPK Package)
This project uses the official LG webOS CLI tools (`@webos-tools/cli` / `ares-*`) to package the application.

1. Ensure the webOS CLI is installed:
   ```bash
   npm install -g @webos-tools/cli
   ```
2. Package the application into an `.ipk` file inside `Release/`:
   ```bash
   ares-package -o Release -e "tests" -e ".git" -e ".buildResult" -e "node_modules" -e "*.ps1" -e "*.md" -e "Release" -e "config.xml" -e ".tproject" -e "docs" .
   ```
   *(Or simply run `.\deploy-webos.ps1 -PackageOnly -SkipBump`)*

### Deploying to an LG Smart TV
We provide an automated PowerShell deployment script (`deploy-webos.ps1`) to bump versions, package, install, and launch the app over the local network.

#### 1. Prepare your LG TV
1. Turn on the LG TV and connect to your local network.
2. Open **Apps / LG Content Store**, install the free **Developer Mode** app, and log in with your LG Developer account.
3. Turn **Dev Mode Status** to **ON**.
4. Turn **Key Server** to **ON**.
5. Note the **Passphrase** (6 alphanumeric characters) displayed on the TV screen.

#### 2. Register Device & Download SSH Key (One-time)
1. Add the TV device to your CLI (replace with your TV's IP address):
   ```bash
   ares-setup-device -a lg-tv -i "username=prisoner" -i "host=<YOUR_TV_IP>" -i "port=9922"
   ```
2. Retrieve the SSH key from the TV:
   ```bash
   ares-novacom --device lg-tv --getkey
   ```
   *Enter the passphrase displayed on the TV screen when prompted.*

#### 3. Automated Deployment
Run the deployment script from PowerShell:
```powershell
.\deploy-webos.ps1 -Device lg-tv
```

**Deployment Options:**
- `-SkipBump`: Deploys without incrementing the patch version in `appinfo.json` and `config.xml`.
- `-ClearData`: Performs a clean reinstall, removing previous data/cache before installing.
- `-PackageOnly`: Builds the `.ipk` package inside `Release/` without deploying to a device.

---

## Samsung Smart TV (Tizen)

### Building the Tizen App (WGT Package)
This project requires the **Tizen CLI** to build the Web application package.

1. Install Tizen Studio and ensure the Tizen CLI (`tizen`) is available in your PATH.
2. Build the project:
   ```bash
   tizen build-web -- .
   ```
3. Package and sign the widget using your certificate profile (e.g., `FreeIPTVPlayerProfile`):
   ```bash
   tizen package --type wgt --sign FreeIPTVPlayerProfile -o Release -- .buildResult
   ```
   *This generates a `.wgt` file inside `Release/`.*

### Deploying to a Samsung TV
We provide an automated PowerShell script (`deploy-tv.ps1`) to deploy to Samsung TVs over SDB (Smart Development Bridge).

1. Enable **Developer Mode** on your Samsung TV and enter your PC's IP address.
2. Connect to your TV via SDB:
   ```bash
   sdb connect <YOUR_TV_IP>:26101
   ```
3. Run the automated deployment script:
   ```powershell
   .\deploy-tv.ps1 -Target "<YOUR_TV_IP>:26101" -Profile "FreeIPTVPlayerProfile"
   ```

**Deployment Options:**
- `-SkipBump`: Prevents auto-incrementing the version in `config.xml`.
- `-KeepData`: In-place update preserving stored playlists, favorites, and settings.
- `-ClearData`: Performs a clean uninstall before reinstalling.

---

## Running Locally (Browser)

The application is written in clean, robust ES5 JavaScript without external runtime dependencies. It can run in any modern web browser for rapid UI/UX development:

1. Start a local static HTTP server in the root of the project:
   ```bash
   npx serve .
   ```
2. Open the URL in your browser.
3. Use **Arrow Keys** to navigate, **Enter** to select, and **Backspace/Escape** to return/go back.

---

## Running Automated Tests

The application features a comprehensive, zero-dependency unit testing suite running on Node.js to validate state machines, storage, parsing, navigation, AVPlay & HTML5 playback engines, and cross-platform compatibility:

```bash
node tests/validate.cjs
```

All 20+ test suites and 219+ checks will run in sequence, including:
- `tests/test-webos-compatibility.cjs` (LG webOS manifest, mandatory ACG compliance, key 461, cursor normalization)
- `tests/test-tizen-5-5-compatibility.cjs` (Samsung Tizen hardware compliance)
- `tests/test-m3u-parser.cjs` & `tests/test-xtream-api.cjs` (Playlist parsers)
- `tests/test-avplay-engine.cjs` & `tests/test-html5-playback.cjs` (Playback engines)
- `tests/test-tv-interaction.cjs` (TV remote control navigation & D-Pad grid routing)
