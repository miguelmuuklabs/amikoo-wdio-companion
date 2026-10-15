# Amikoo WDIO Companion

**Version:** 0.1.0  
**Status:** Functional Proof of Concept (PoC)  
**Category:** Testing  
**Framework:** WebdriverIO 9 / Appium  
**Platform:** Visual Studio Code

## 1. Overview

Amikoo WDIO Companion is a Visual Studio Code extension designed to integrate WebdriverIO and Appium automated test executions with the Amikoo platform.

The extension provides a centralized interface to configure authentication, execute automated tests, inspect results, and generate HTML reports without leaving VS Code.

## 2. Key Features

- Automatic detection of WebdriverIO projects.
- Detection of the Amikoo WDIO Reporter dependency.
- Secure API Key configuration using VS Code SecretStorage.
- API Key validation against Amikoo.
- Execution of WebdriverIO/Appium tests directly from VS Code.
- Submission of consolidated test results through the Amikoo WDIO Reporter.
- Dashboard displaying total, passed, and failed tests.
- Pass rate calculation and individual test results.
- Error messages and execution duration.
- HTML report generation and viewing.
- Installation through a standalone `.vsix` package.

## 3. Requirements

- Visual Studio Code 1.85.0 or later.
- Node.js and npm.
- A WebdriverIO project with its dependencies installed.
- Amikoo WDIO Reporter configured in the project.
- A valid Amikoo API Key.
- Appium, Android SDK, and an emulator or physical device for Android test execution.

## 4. Installation

### Install using VSIX

1. Open Visual Studio Code.
2. Open the Command Palette (`Ctrl + Shift + P`).
3. Select `Extensions: Install from VSIX...`.
4. Select `amikoo-wdio-companion-0.1.0.vsix`.
5. Complete the installation.

The extension can then be used without launching an Extension Development Host.

### Build from source

```bash
npm install
npm run build
npx @vscode/vsce package
```

The packaging process generates the VSIX installation file.

## 5. Getting Started

1. Open an existing WebdriverIO project in VS Code.
2. Open the Command Palette.
3. Execute `Amikoo WDIO: Open Companion`.
4. Review the detected project, framework, and reporter configuration.
5. Configure the Amikoo API Key using `Connect to Amikoo`.
6. Click `Run Tests` to start the test execution.
7. Review the results in the dashboard.
8. Use `Export HTML Report` to generate a standalone report.

## 6. Available Commands

| Command | Description |
|---|---|
| `Amikoo WDIO: Open Companion` | Opens the extension dashboard |
| `Amikoo WDIO: Connect API Key` | Configures and validates authentication |
| `Amikoo WDIO: Disconnect` | Removes the configured API Key |

Additional operations are available directly from the dashboard.

## 7. Integration Architecture

```text
Visual Studio Code
       |
       v
Amikoo WDIO Companion
       |
       +-- Project detection
       +-- API Key validation
       +-- Test execution
       +-- Results dashboard
       +-- HTML reporting
       |
       v
WebdriverIO 9
       |
       v
Appium / Android
       |
       v
Amikoo WDIO Reporter
       |
       v
Amikoo Platform
```

The Companion launches the project's WebdriverIO test runner, passing the configured Amikoo API Key through the test process environment.

The reporter collects test results and submits them to Amikoo as a consolidated execution.

The dashboard reads the locally generated JSON report to display execution metrics.

## 8. Validated Execution

**Test project:** `virtualshop-mobile-qa`  
**Date:** October 15, 2026  
**Amikoo execution:** #23

| Metric | Result |
|---|---|
| Executed tests | 5 |
| Passed | 4 |
| Failed | 1 |
| Pass rate | 80% |
| Submission to Amikoo | Confirmed |

The failed test was related to a 60-second timeout during registration and logout.

Amikoo independently confirmed that all five test results were registered under execution #23.

**Important:** The execution ID was verified through Amikoo's chat assistant, not retrieved automatically by the Companion.

## 9. Reports

The Companion supports two reporting formats:

**JSON report:** Contains structured test execution results, including test names, status, duration, and error information.

**HTML report:** Provides a standalone visual summary of the execution, including metrics, pass/fail results, and failure details.

The HTML report can be opened in a browser and shared independently of VS Code.

## 10. Known Limitations

- The Companion currently displays results from the latest locally available JSON report.
- The real Amikoo execution ID is not yet returned to the extension.
- Historical executions cannot currently be queried directly from Amikoo.
- The Amikoo API does not have a documented public read endpoint for execution history.
- The reporter's `file_path` mapping requires improvement to associate tests with their complete repository-relative paths.
- Individual test selection is not yet supported by the dashboard.

## 11. Roadmap

### Phase 1 — Functional PoC

- [x] WebdriverIO project detection.
- [x] Amikoo API Key configuration.
- [x] WebdriverIO/Appium execution.
- [x] Consolidated result submission.
- [x] Results dashboard.
- [x] HTML report generation.
- [x] VSIX packaging and installation.

### Phase 2 — Extended Integration

- [ ] Retrieve real Amikoo execution IDs automatically.
- [ ] Query historical executions from Amikoo.
- [ ] Improve reporter file path mapping.
- [ ] Execute individual tests from the dashboard.
- [ ] Enhance execution history and reporting.

## 12. Project Structure

```text
amikoo-wdio-companion/
├── src/
│   └── extension.ts
├── dist/
│   └── extension.js
├── package.json
├── tsconfig.json
├── README.md
└── .vscode/
    └── launch.json
```

## 13. Current Status

Amikoo WDIO Companion v0.1.0 has been successfully packaged and installed as a VS Code extension.

The proof of concept demonstrates a working integration between Visual Studio Code, WebdriverIO, Appium, the Amikoo WDIO Reporter, and the Amikoo platform.

The next integration milestone is enabling bidirectional communication with Amikoo to retrieve execution identifiers and historical results.