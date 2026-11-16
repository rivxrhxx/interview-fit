# macOS Setup

## Prerequisites

1. Install Xcode Command Line Tools:

```bash
xcode-select --install
```

2. Install Node.js 22.18 LTS or later with Homebrew (the backend runs TypeScript through Node's built-in type stripping):

```bash
brew install node
```

3. Install Rust:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
```

4. Install Kiro or Kiro CLI and sign in with the same account used for the Kiroween registration.

## Run Interview Fit

```bash
git clone https://github.com/rivxrhxx/interview-fit.git
cd interview-fit
npm ci
npm run verify:fast
npm run proxy            # terminal 1: backend with the deterministic simulator
npm run tauri dev        # terminal 2: desktop app
```

The first `tauri dev` or `tauri build` compiles the Rust dependencies and takes several minutes.

Choosing **Use camera** triggers the macOS camera permission prompt. The usage text comes from `src-tauri/Info.plist`. If access is denied, the app keeps file selection available. To reset the decision, run `tccutil reset Camera com.interviewfit.desktop`.

`npm run tauri build` writes the installable bundle to `src-tauri/target/release/bundle/` (`macos/Interview Fit.app` and `dmg/`). The bundle is unsigned. For distribution outside your own machine, sign and notarize it with an Apple Developer ID, and add the camera entitlement when enabling the hardened runtime.

## Start with Kiro

Open the `Interview-Fit` directory in Kiro and ask:

```text
Read all files under .kiro/steering and .kiro/specs/interview-fit-mvp. Review the MVP requirements and design, then implement only task 2.1 from tasks.md. Run the stated verification before updating the checkbox.
```

Do not add YouCam credentials to the desktop project. Provider credentials belong only in a separate backend secret store.
