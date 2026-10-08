# Free IPTV Player

A clean, high-performance, and privacy-respecting IPTV player built natively for Samsung Smart TVs running Tizen OS.

> **CRITICAL LEGAL NOTICE & DISCLAIMER**  
> **Free IPTV Player is strictly a media playback client application.**  
> It does **not** bundle, host, scrape, index, distribute, or provide any streaming playlists, channels, video content, or IPTV services. Users are strictly required to supply their own legally authorized IPTV playlists and streaming provider credentials.

## Building the App (WGT Package)

This project requires the **Tizen CLI** to build the Web application package.

1. Install Tizen Studio and ensure the Tizen CLI (`tizen`) is available in your PATH.
2. Build the project using the Tizen CLI:
   ```bash
   tizen build-web -- .
   ```
3. Package and sign the widget using your certificate profile (e.g., `FreeIPTVPlayerProfile`):
   ```bash
   tizen package --type wgt --sign FreeIPTVPlayerProfile -o Release -- .buildResult
   ```
   *This will generate a `.wgt` file inside the `Release` directory.*

## Deploying to a Samsung TV

We provide a convenient PowerShell script (`deploy-tv.ps1`) to automate building, packaging, installing, and launching the app on your TV over the local network via SDB (Smart Development Bridge).

### Prerequisites
- Enable **Developer Mode** on your Samsung TV and enter your PC's IP address.
- Connect to your TV via SDB:
  ```bash
  sdb connect <YOUR_TV_IP>:26101
  ```

### Automated Deployment
Run the deployment script from a PowerShell terminal:
```powershell
.\deploy-tv.ps1 -Target "<YOUR_TV_IP>:26101" -Profile "FreeIPTVPlayerProfile"
```

**Deployment Options:**
- `-SkipBump`: Prevents the script from automatically incrementing the patch version in `config.xml`.
- `-KeepData`: Updates the app directly without running the uninstaller first, safely preserving your stored playlists, settings, and favorites.

Example for updating the app without losing data or bumping the version:
```powershell
.\deploy-tv.ps1 -Target "192.168.100.9:26101" -SkipBump -KeepData
```

## Running the App Locally (Browser)

The app is entirely vanilla JavaScript and can be run locally in any modern web browser for rapid UI/UX development.

1. Start a local static HTTP server in the root of the project:
   ```bash
   npx serve .
   ```
2. Open the provided `localhost` URL in your browser.
3. Use your keyboard's **Arrow Keys** to navigate, **Enter** to select, and **Backspace/Escape** to return/go back.

*Note: Native Samsung AVPlay video streaming features will not work in a desktop browser and will gracefully degrade with a developer warning notice.*

## Running Automated Tests

The application features a comprehensive, zero-dependency unit testing suite running on Node.js to validate state, storage, parsing, and navigation behavior.

To run the entire validation suite:
```bash
node tests/validate.cjs
```

You can also run specific individual test suites:
```bash
node tests/test-m3u-parser.cjs
node tests/test-playlist-manager.cjs
node tests/test-avplay-engine.cjs
```
