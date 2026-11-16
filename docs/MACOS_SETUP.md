# macOS Setup

## Prerequisites

1. Install Xcode Command Line Tools:

```bash
xcode-select --install
```

2. Install Node.js 22 LTS or later with Homebrew:

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
tar -xzf Interview-Fit-harness.tar.gz
cd Interview-Fit
npm install
npm run verify:harness
npm run build
npm run tauri dev
```

## Start with Kiro

Open the `Interview-Fit` directory in Kiro and ask:

```text
Read all files under .kiro/steering and .kiro/specs/interview-fit-mvp. Review the MVP requirements and design, then implement only task 2.1 from tasks.md. Run the stated verification before updating the checkbox.
```

Do not add YouCam credentials to the desktop project. Provider credentials belong only in a separate backend secret store.
