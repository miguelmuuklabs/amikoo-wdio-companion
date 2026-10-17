import * as vscode from 'vscode';

import * as fs from 'node:fs';

import * as path from 'node:path';

import { randomBytes } from 'node:crypto';

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { fromIni } from '@aws-sdk/credential-providers';

const SECRET_KEY = 'amikooWdio.apiKey';

const API_URL = 'https://app.amikoo.ai';

async function getVideoUrl(

    bucket: string,

    region: string,

    key: string

): Promise<string> {

    const client = new S3Client({

        region,

        credentials: fromIni({

            profile: 'amikoo-wdio'

        })

    });

    return getSignedUrl(

        client,

        new GetObjectCommand({

            Bucket: bucket,

            Key: key

        }),

        { expiresIn: 900 }

    );

}

interface ProjectInfo {

    name: string;

    webdriverio: string | null;

    reporter: string | null;

}

interface TestResult {

    name: string;

    filePath: string;

    fullTitle: string;

    duration: number;

    executionAt: string;

    result: boolean;

    testRunId?: string;

    error?: {

        message?: string;

        stack?: string;

    };

    evidence?: {

        video?: {

            bucket: string;

            region: string;

            key: string;

            s3Uri: string;

        };

    };

}

interface TestReport {

    framework: string;

    automation: string;

    platform: string;

    tests: TestResult[];

}

function detectProject(): ProjectInfo | null {

    const workspace = vscode.workspace.workspaceFolders?.[0];

    if (!workspace) {

        return null;

    }

    const packagePath = path.join(

        workspace.uri.fsPath,

        'package.json'

    );

    if (!fs.existsSync(packagePath)) {

        return null;

    }

    try {

        const pkg = JSON.parse(

            fs.readFileSync(packagePath, 'utf8')

        );

        const dependencies = {

            ...pkg.dependencies,

            ...pkg.devDependencies

        };

        return {

            name: pkg.name || path.basename(workspace.uri.fsPath),

            webdriverio: dependencies['@wdio/cli'] || null,

            reporter: dependencies['amikoo-wdio-reporter'] || null

        };

    } catch {

        return null;

    }

}

function escapeHtml(value: unknown): string {

    return String(value ?? '').replace(

        /[&<>"']/g,

        character => {

            const entities: Record<string, string> = {

                '&': '&amp;',

                '<': '&lt;',

                '>': '&gt;',

                '"': '&quot;',

                "'": '&#39;'

            };

            return entities[character];

        }

    );

}

function loadReport(): TestReport | null {

    const workspace = vscode.workspace.workspaceFolders?.[0];

    if (!workspace) {

        return null;

    }

    const reportsDirectory = path.join(

        workspace.uri.fsPath,

        'reports'

    );

    const candidates = [

        'amikoo-consolidated.json',

        'amikoo-results.json'

    ];

    for (const filename of candidates) {

        const reportPath = path.join(reportsDirectory, filename);

        if (!fs.existsSync(reportPath)) {

            continue;

        }

        try {

            const report = JSON.parse(

                fs.readFileSync(reportPath, 'utf8')

            );

            if (Array.isArray(report.tests)) {

                return report as TestReport;

            }

        } catch (error) {

            console.warn(

                `[Amikoo] Unable to load ${filename}:`,

                error

            );

        }

    }

    return null;

}

async function validateApiKey(

    apiKey: string

): Promise<boolean> {

    const response = await fetch(

        `${API_URL}/validate_key`,

        {

            method: 'POST',

            headers: {

                'Content-Type': 'application/json'

            },

            body: JSON.stringify({

                key: apiKey

            }),

            signal: AbortSignal.timeout(15000)

        }

    );

    if (!response.ok) {

        return false;

    }

    const result = await response.json() as {

        data?: {

            access_token?: string;

        };

    };

    return Boolean(result.data?.access_token);

}

function formatDuration(seconds: number): string {

    if (!Number.isFinite(seconds)) {

        return 'N/A';

    }

    if (seconds >= 60) {

        return `${(seconds / 60).toFixed(2)} min`;

    }

    return `${seconds.toFixed(2)} s`;

}

function buildHtmlReport(report: TestReport): string {

    const tests = report.tests;

    const total = tests.length;

    const passed = tests.filter(test => test.result === true).length;

    const failed = tests.filter(test => test.result === false).length;

    const passRate = total

        ? Math.round((passed / total) * 100)

        : 0;

    const totalDuration = tests.reduce(

        (sum, test) => sum + (Number(test.duration) || 0),

        0

    );

    const generatedAt = new Date().toLocaleString();

    const rows = tests.map(test => {

        const status = test.result ? 'PASS' : 'FAIL';

        const colorClass = test.result ? 'pass' : 'fail';

        const error = !test.result && test.error?.message

            ? `

                <div class="error">

                    <strong>Error:</strong>

                    ${escapeHtml(test.error.message)}

                    ${test.error.stack

                        ? `<details>

                            <summary>Stack trace</summary>

                            <pre>${escapeHtml(test.error.stack)}</pre>

                           </details>`

                        : ''}

                </div>

            `

            : '';

        return `

            <article class="test">

                <div class="test-top">

                    <strong>${escapeHtml(test.name)}</strong>

                    <span class="${colorClass}">${status}</span>

                </div>

                <div class="muted">

                    ${escapeHtml(test.filePath)}

                    · ${Number(test.duration || 0).toFixed(2)} s

                </div>

                ${error}

            </article>

        `;

    }).join('');

    return `<!DOCTYPE html>

<html lang="en">

<head>

    <meta charset="UTF-8">

    <meta name="viewport"

          content="width=device-width, initial-scale=1">

    <title>Amikoo WDIO Test Report</title>

    <style>

        * { box-sizing: border-box; }

        body {

            margin: 0;

            background: #101217;

            color: #e8eaf0;

            font-family: Arial, sans-serif;

            line-height: 1.5;

        }

        main {

            max-width: 1100px;

            margin: auto;

            padding: 36px 24px;

        }

        h1 { margin-bottom: 4px; }

        h2 { margin-top: 36px; }

        .muted {

            color: #9ca3af;

            font-size: 13px;

        }

        .grid {

            display: grid;

            grid-template-columns: repeat(4, 1fr);

            gap: 14px;

            margin-top: 28px;

        }

        .card, .test {

            background: #1b1e25;

            border: 1px solid #30343d;

            border-radius: 10px;

            padding: 20px;

        }

        .card .number {

            font-size: 32px;

            font-weight: bold;

            margin-top: 10px;

        }

        .pass { color: #55c990; }

        .fail { color: #ff7777; }

        .progress {

            display: flex;

            height: 12px;

            background: #30343d;

            border-radius: 8px;

            overflow: hidden;

            margin: 24px 0 12px;

        }

        .progress-pass {

            width: ${passRate}%;

            background: #55c990;

        }

        .progress-fail {

            width: ${total ? (failed / total) * 100 : 0}%;

            background: #ff7777;

        }

        .test { margin-bottom: 12px; }

        .test-top {

            display: flex;

            justify-content: space-between;

            gap: 16px;

            margin-bottom: 8px;

        }

        .error {

            margin-top: 14px;

            background: #2b2228;

            border-left: 3px solid #ff7777;

            padding: 14px;

            font-size: 13px;

            overflow-wrap: anywhere;

        }

        pre {

            white-space: pre-wrap;

            overflow-wrap: anywhere;

            font-size: 12px;

        }

        details { margin-top: 12px; }

        summary { cursor: pointer; }

        footer {

            margin-top: 36px;

            border-top: 1px solid #30343d;

            padding-top: 18px;

            color: #9ca3af;

            font-size: 12px;

        }

        @media (max-width: 700px) {

            .grid {

                grid-template-columns: repeat(2, 1fr);

            }

        }

        @media print {

            body {

                background: white;

                color: black;

            }

            .card, .test {

                background: white;

                border-color: #ccc;

                break-inside: avoid;

            }

        }

    </style>

</head>

<body>

<main>

    <h1>Amikoo WDIO Test Report</h1>

    <div class="muted">

        ${escapeHtml(report.framework)}

        · ${escapeHtml(report.automation)}

        · ${escapeHtml(report.platform)}

    </div>

    <p class="muted">Generated: ${escapeHtml(generatedAt)}</p>

    <p class="muted">

        Amikoo execution ID: Not available in local report

    </p>

    <div class="grid">

        <div class="card">

            <div class="muted">TOTAL TESTS</div>

            <div class="number">${total}</div>

        </div>

        <div class="card">

            <div class="muted">PASSED</div>

            <div class="number pass">${passed}</div>

        </div>

        <div class="card">

            <div class="muted">FAILED</div>

            <div class="number fail">${failed}</div>

        </div>

        <div class="card">

            <div class="muted">PASS RATE</div>

            <div class="number">${passRate}%</div>

        </div>

    </div>

    <div class="progress">

        <div class="progress-pass"></div>

        <div class="progress-fail"></div>

    </div>

    <div class="muted">

        Sum of test durations:

        ${totalDuration.toFixed(2)} seconds

    </div>

    <h2>Test Results</h2>

    ${rows || '<p>No test results available.</p>'}

    <footer>

        Generated by Amikoo WDIO Companion

    </footer>

</main>

</body>

</html>`;

}

export function activate(context: vscode.ExtensionContext) {

    let panel: vscode.WebviewPanel | undefined;

    let isRunning = false;

    let lastRunStatus = 'Not started';

    async function renderPanel(): Promise<void> {

        if (!panel) {

            return;

        }

        const currentPanel = panel;

        const project = detectProject();

        const apiKey = await context.secrets.get(SECRET_KEY);

        const report = loadReport();

        if (panel !== currentPanel) {

            return;

        }

        const tests = report?.tests ?? [];

        const total = tests.length;

        const passed = tests.filter(test => test.result === true).length;

        const failed = tests.filter(test => test.result === false).length;

        const passRate = total > 0

            ? Math.round((passed / total) * 100)

            : 0;

        const failedRate = total > 0

            ? (failed / total) * 100

            : 0;

        const totalDuration = tests.reduce(

            (sum, test) => sum + (Number(test.duration) || 0),

            0

        );

        const latestExecutionAt = tests

            .map(test => test.executionAt)

            .filter(Boolean)

            .sort()

            .at(-1);

        const nonce = randomBytes(16).toString('base64');

        const testRows = tests.map(test => {

            const status = test.result ? 'PASS' : 'FAIL';

            const statusClass = test.result ? 'passed' : 'failed';

            const videoUri = test.evidence?.video?.s3Uri;

            const videoHtml = videoUri

    ? `

                    <div class="video-evidence">

                        <div class="video-heading">

                            <span class="passed">● Recording available</span>

                            <span class="test-meta">MP4 · Private S3</span>

                        </div>

                        <button

                            class="watch-video"

                            data-video="${escapeHtml(videoUri)}"

                            data-test-id="${escapeHtml(test.testRunId || '')}"

                        >

                            ▶ Watch Recording

                        </button>

                        <div

                            class="video-container"

                            id="video-${escapeHtml(test.testRunId || '')}"

                            hidden

                        >

                            <div class="video-loading">

                                Loading recording...

                            </div>

                        </div>

                    </div>

                `

                : `

                    <div class="test-meta">

                        Recording unavailable

                    </div>

                `;

            const errorHtml = !test.result && test.error?.message

                ? `

                    <div class="error-box">

                        <strong>Error:</strong>

                        ${escapeHtml(test.error.message)}

                    </div>

                `

                : '';

            return `

                <div class="test-row">

                    <div class="test-header">

                        <span class="test-name">

                            ${escapeHtml(test.name)}

                        </span>

                        <span class="status ${statusClass}">

                            ${status}

                        </span>

                    </div>

                    <div class="test-meta">

                        ${escapeHtml(test.filePath)}

                        · ${formatDuration(Number(test.duration))}

                    </div>

                    ${errorHtml}

                    ${videoHtml}

                </div>

            `;

        }).join('');

        currentPanel.webview.html = `

<!DOCTYPE html>

<html lang="en">

<head>

    <meta charset="UTF-8">

    <meta

        name="viewport"

        content="width=device-width, initial-scale=1.0"

    >

    <meta

        http-equiv="Content-Security-Policy"

        content="

            default-src 'none';

            style-src 'nonce-${nonce}';

            script-src 'nonce-${nonce}';

            media-src https://*.amazonaws.com;

        "

    >

    <title>Amikoo WDIO Companion</title>

    <style nonce="${nonce}">

        * {

            box-sizing: border-box;

        }

        .video-evidence {

            margin-top: 14px;

            padding: 12px;

            border: 1px solid var(--vscode-panel-border);

            border-radius: 6px;

        }

        .video-evidence button {

            margin-top: 10px;

        }

        body {

            font-family: var(--vscode-font-family);

            color: var(--vscode-foreground);

            padding: 28px;

            margin: 0;

        }

        h1 {

            margin: 0 0 6px;

            font-size: 26px;

        }

        .subtitle {

            opacity: 0.7;

            margin-bottom: 28px;

        }

        .section-title {

            font-size: 16px;

            font-weight: 600;

            margin: 28px 0 16px;

        }

        .grid {

            display: grid;

            grid-template-columns:

                repeat(auto-fit, minmax(180px, 1fr));

            gap: 14px;

        }

        .card {

            background: var(--vscode-editorWidget-background);

            border: 1px solid var(--vscode-panel-border);

            border-radius: 8px;

            padding: 18px;

        }

        .label {

            opacity: 0.7;

            font-size: 12px;

            font-weight: 600;

            letter-spacing: 0.5px;

        }

        .value {

            font-size: 14px;

            font-weight: 600;

            margin-top: 12px;

            overflow-wrap: anywhere;

        }

        .metric-value {

            font-size: 32px;

            font-weight: 700;

            margin-top: 10px;

        }

        .connected, .passed {

            color: var(--vscode-testing-iconPassed);

        }

        .disconnected, .failed {

            color: var(--vscode-testing-iconFailed);

        }

        .actions {

            display: flex;

            gap: 10px;

            flex-wrap: wrap;

            margin-top: 26px;

        }

        button {

            padding: 10px 16px;

            border: none;

            border-radius: 5px;

            cursor: pointer;

            font-family: inherit;

            font-weight: 600;

            background: var(--vscode-button-background);

            color: var(--vscode-button-foreground);

        }

        button.secondary {

            background: var(--vscode-button-secondaryBackground);

            color: var(--vscode-button-secondaryForeground);

        }

        button:disabled {

            opacity: 0.5;

            cursor: not-allowed;

        }

        .run-status {

            margin-top: 18px;

            opacity: 0.85;

        }

        .execution-header {

            display: flex;

            justify-content: space-between;

            gap: 12px;

            align-items: center;

            flex-wrap: wrap;

            margin-bottom: 16px;

        }

        .execution-id {

            font-size: 21px;

            font-weight: 700;

        }

        .execution-note {

            font-size: 12px;

            opacity: 0.65;

            margin-top: 5px;

        }

        .progress {

            display: flex;

            width: 100%;

            height: 12px;

            border-radius: 8px;

            overflow: hidden;

            background: var(--vscode-progressBar-background);

            margin-top: 20px;

        }

        .progress-pass {

            background: var(--vscode-testing-iconPassed);

        }

        .progress-fail {

            background: var(--vscode-testing-iconFailed);

        }

        .test-row {

            padding: 16px;

            border: 1px solid var(--vscode-panel-border);

            border-radius: 8px;

            margin-bottom: 10px;

        }

        .test-header {

            display: flex;

            justify-content: space-between;

            align-items: center;

            gap: 14px;

        }

        .test-name {

            font-weight: 600;

        }

        .test-meta {

            opacity: 0.7;

            font-size: 12px;

            margin-top: 8px;

        }

        .status {

            font-weight: 700;

            font-size: 12px;

            white-space: nowrap;

        }

        .error-box {

            margin-top: 12px;

            padding: 12px;

            border-left: 3px solid var(--vscode-testing-iconFailed);

            background: var(--vscode-textBlockQuote-background);

            font-size: 12px;

            line-height: 1.6;

            overflow-wrap: anywhere;

        }

        .empty {

            padding: 24px;

            border: 1px dashed var(--vscode-panel-border);

            border-radius: 8px;

            opacity: 0.7;

        }

        .footer {

            margin-top: 30px;

            padding-top: 16px;

            border-top: 1px solid var(--vscode-panel-border);

            opacity: 0.65;

            font-size: 12px;

        }

        .video-evidence {

            margin-top: 14px;

            padding: 14px;

            border: 1px solid var(--vscode-panel-border);

            border-radius: 8px;

            background: var(--vscode-editorWidget-background);

        }

        .video-heading {

            display: flex;

            justify-content: space-between;

            align-items: center;

            gap: 12px;

            margin-bottom: 12px;

            font-size: 12px;

        }

        .watch-video {

            background: var(--vscode-button-background);

            color: var(--vscode-button-foreground);

            border-radius: 6px;

            padding: 9px 16px;

            font-size: 12px;

            font-weight: 600;

        }

        .watch-video:hover {

            background: var(--vscode-button-hoverBackground);

        }

        .video-container {

            margin-top: 14px;

            background: #090b10;

            border-radius: 8px;

            overflow: hidden;

        }

        .video-container[hidden] {

            display: none;

        }

        .video-container video {

            display: block;

            width: 100%;

            max-height: 480px;

            background: #000;

            object-fit: contain;

        }

        .video-loading {

            padding: 32px;

            text-align: center;

            color: #a1a1aa;

            font-size: 13px;

        }

    </style>

</head>

<body>

    <h1>Amikoo WDIO Companion</h1>

    <p class="subtitle">WebdriverIO integration dashboard</p>

    <h2 class="section-title">Project Status</h2>

    <div class="grid">

        <div class="card">

            <div class="label">PROJECT</div>

            <div class="value">

                ${escapeHtml(project?.name || 'Not detected')}

            </div>

        </div>

        <div class="card">

            <div class="label">WEBDRIVERIO</div>

            <div class="value">

                ${escapeHtml(project?.webdriverio || 'Not detected')}

            </div>

        </div>

        <div class="card">

            <div class="label">AMIKOO REPORTER</div>

            <div class="value">

                ${escapeHtml(project?.reporter || 'Not installed')}

            </div>

        </div>

        <div class="card">

            <div class="label">API CONNECTION</div>

            <div class="value ${apiKey ? 'connected' : 'disconnected'}">

                ${apiKey ? 'API key configured' : 'Not configured'}

            </div>

        </div>

    </div>

    <div class="actions">

        <button id="connect" ${apiKey ? 'disabled' : ''}>

            Connect to Amikoo

        </button>

        <button id="disconnect" class="secondary"

            ${!apiKey ? 'disabled' : ''}>

            Disconnect

        </button>

        <button id="refresh" class="secondary">

            Refresh

        </button>

        <button id="runTests"

            ${isRunning || !project?.webdriverio ? 'disabled' : ''}>

            ${isRunning ? 'Running...' : 'Run Tests'}

        </button>

        <button id="exportReport" class="secondary"

            ${!report || isRunning ? 'disabled' : ''}>

            Export HTML Report

        </button>

        <button id="openReport" class="secondary"

            ${!report ? 'disabled' : ''}>

            Open Report

        </button>

    </div>

    <p class="run-status">

        Test execution:

        ${escapeHtml(isRunning ? 'Running' : lastRunStatus)}

    </p>

    <h2 class="section-title">Latest Execution</h2>

    ${

        report

            ? `

                <div class="execution-header">

                    <div>

                        <div class="execution-id">

                            Execution #—

                        </div>

                        <div class="execution-note">

                            Awaiting execution ID from Amikoo API

                        </div>

                    </div>

                    <div class="execution-note">

                        ${escapeHtml(report.platform)}

                        · ${escapeHtml(report.automation)}

                    </div>

                </div>

                <div class="grid">

                    <div class="card">

                        <div class="label">TOTAL TESTS</div>

                        <div class="metric-value">${total}</div>

                    </div>

                    <div class="card">

                        <div class="label">PASSED</div>

                        <div class="metric-value passed">${passed}</div>

                    </div>

                    <div class="card">

                        <div class="label">FAILED</div>

                        <div class="metric-value failed">${failed}</div>

                    </div>

                    <div class="card">

                        <div class="label">PASS RATE</div>

                        <div class="metric-value">${passRate}%</div>

                    </div>

                </div>

                <div class="progress">

                    <div

                        class="progress-pass"

                        style="width: ${passRate}%"

                    ></div>

                    <div

                        class="progress-fail"

                        style="width: ${failedRate}%"

                    ></div>

                </div>

                <p class="execution-note">

                    Sum of test durations:

                    ${formatDuration(totalDuration)}

                    ${latestExecutionAt

                        ? ` · Latest result: ${escapeHtml(latestExecutionAt)}`

                        : ''}

                </p>

                <h2 class="section-title">Test Results</h2>

                ${testRows || '<div class="empty">No tests found.</div>'}

            `

            : `

                <div class="empty">

                    No execution report found.

                    Run the WebdriverIO suite to generate results.

                </div>

            `

    }

    <div class="footer">

        Amikoo WDIO Companion · PoC v0.2.0

    </div>

        <script nonce="${nonce}">

            const vscode = acquireVsCodeApi();

            for (const command of [

                'connect',

                'disconnect',

                'refresh',

                'runTests',

                'exportReport',

                'openReport'

            ]) {

                document

                    .getElementById(command)

                    .addEventListener('click', () => {

                        vscode.postMessage({ command });

                    });

            }

            document.querySelectorAll('.watch-video').forEach(button => {

                button.addEventListener('click', () => {

                    const testId = button.getAttribute('data-test-id');

                    const container = document.getElementById('video-' + testId);

                    if (!container) return;

                    if (!container.hidden) {

                        const video = container.querySelector('video');

                        if (video) {

                            video.pause();

                            video.removeAttribute('src');

                            video.load();

                        }

                        container.hidden = true;

                        button.textContent = '▶ Watch Recording';

                        return;

                    }

                    container.hidden = false;

                    container.textContent = '';

                    const loading = document.createElement('div');

                    loading.className = 'video-loading';

                    loading.textContent = 'Loading recording...';

                    container.appendChild(loading);

                    button.textContent = 'Close Recording';

                    vscode.postMessage({

                        command: 'playVideo',

                        video: button.getAttribute('data-video'),

                        testId

                    });

                });

            });

            window.addEventListener('message', event => {

                const message = event.data;

                if (message.command !== 'videoReady' &&

                    message.command !== 'videoError') {

                    return;

                }

                const container = document.getElementById(

                    'video-' + message.testId

                );

                if (!container || container.hidden) return;

                container.textContent = '';

                if (message.command === 'videoError') {

                    const error = document.createElement('div');

                    error.className = 'video-loading';

                    error.textContent = message.error || 'Unable to load video.';

                    container.appendChild(error);

                    return;

                }

                const video = document.createElement('video');

                video.controls = true;

                video.playsInline = true;

                video.preload = 'metadata';

                video.src = message.url;

                video.addEventListener('error', () => {

                    const error = document.createElement('div');

                    error.className = 'video-loading';

                    error.textContent = 'Video playback failed.';

                    container.replaceChildren(error);

                });

                container.appendChild(video);

            });

        </script>

</body>

</html>

        `;

    }

    async function runTests(): Promise<void> {

        if (isRunning) {

            vscode.window.showWarningMessage(

                'A WebdriverIO run is already in progress.'

            );

            return;

        }

        const workspace = vscode.workspace.workspaceFolders?.[0];

        const project = detectProject();

        if (!workspace || !project?.webdriverio) {

            vscode.window.showErrorMessage(

                'Open a project with WebdriverIO installed.'

            );

            return;

        }

        const projectPath = workspace.uri.fsPath;

        const configPath = path.join(

            projectPath,

            'wdio.conf.ts'

        );

        if (!fs.existsSync(configPath)) {

            vscode.window.showErrorMessage(

                'wdio.conf.ts was not found.'

            );

            return;

        }

        const wdioCli = path.join(

            projectPath,

            'node_modules',

            '@wdio',

            'cli',

            'bin',

            'wdio.js'

        );

        if (!fs.existsSync(wdioCli)) {

            vscode.window.showErrorMessage(

                'WebdriverIO CLI executable was not found.'

            );

            return;

        }

        const apiKey = await context.secrets.get(SECRET_KEY);

        if (!apiKey?.trim()) {

            vscode.window.showErrorMessage(

                'Connect to Amikoo before running tests.'

            );

            return;

        }

        const selection = await vscode.window.showWarningMessage(

            'Run the full WebdriverIO suite and submit results to Amikoo?',

            { modal: true },

            'Run Tests'

        );

        if (selection !== 'Run Tests') {

            return;

        }

        isRunning = true;

        lastRunStatus = 'Preparing execution';

        await renderPanel();

        let endListener: vscode.Disposable | undefined;

        try {

            const resultsPath = path.join(

                projectPath,

                '.amikoo-wdio-results'

            );

            if (fs.existsSync(resultsPath)) {

                const archiveRoot = path.join(

                    projectPath,

                    '.amikoo-wdio-archive'

                );

                fs.mkdirSync(archiveRoot, {

                    recursive: true

                });

                const archivePath = path.join(

                    archiveRoot,

                    `results-${Date.now()}-${randomBytes(4).toString('hex')}`

                );

                fs.renameSync(resultsPath, archivePath);

            }

            // Remove the previous displayed report so that

            // a failed startup cannot show stale results.

            const reportPath = path.join(

                projectPath,

                'reports',

                'amikoo-results.json'

            );

            if (fs.existsSync(reportPath)) {

                const archiveRoot = path.join(

                    projectPath,

                    '.amikoo-wdio-archive'

                );

                fs.mkdirSync(archiveRoot, {

                    recursive: true

                });

                fs.renameSync(

                    reportPath,

                    path.join(

                        archiveRoot,

                        `report-${Date.now()}-${randomBytes(4).toString('hex')}.json`

                    )

                );

            }

            lastRunStatus = 'Running';

            await renderPanel();

            const task = new vscode.Task(

                {

                    type: 'amikoo-wdio',

                    task: 'run'

                },

                workspace,

                'Amikoo WDIO Tests',

                'Amikoo WDIO Companion',

                new vscode.ProcessExecution(

                    'node',

                    [

                        wdioCli,

                        'run',

                        './wdio.conf.ts'

                    ],

                    {

                        cwd: projectPath,

                        env: {

                            ...process.env,

                            AMIKOO_KEY: apiKey

                        }

                    }

                )

            );

            task.presentationOptions = {

                reveal: vscode.TaskRevealKind.Always,

                panel: vscode.TaskPanelKind.Dedicated

            };

            endListener = vscode.tasks.onDidEndTaskProcess(

                async event => {

                    if (event.execution.task !== task) {

                        return;

                    }

                    endListener?.dispose();

                    isRunning = false;

                    lastRunStatus = event.exitCode === 0

                        ? 'Completed (exit code 0)'

                        : `Failed (exit code ${

                            event.exitCode ?? 'unknown'

                        })`;

                    await renderPanel();

                }

            );

            await vscode.tasks.executeTask(task);

        } catch (error) {

            endListener?.dispose();

            isRunning = false;

            lastRunStatus = 'Failed to start';

            await renderPanel();

            vscode.window.showErrorMessage(

                `Could not start WebdriverIO: ${

                    error instanceof Error

                        ? error.message

                        : String(error)

                }`

            );

        }

    }

    let latestExportedReport: vscode.Uri | undefined;

        async function exportHtmlReport(

            openAfterExport = false

        ): Promise<void> {

            const workspace = vscode.workspace.workspaceFolders?.[0];

            const report = loadReport();

            if (!workspace || !report) {

                vscode.window.showErrorMessage(

                    'No Amikoo report found. Run tests first.'

                );

                return;

            }

            try {

                const exportDirectory = path.join(

                    workspace.uri.fsPath,

                    'reports',

                    'html'

                );

                fs.mkdirSync(exportDirectory, {

                    recursive: true

                });

                const timestamp = new Date()

                    .toISOString()

                    .replace(/[:.]/g, '-');

                const filename = `amikoo-report-${timestamp}.html`;

                const outputPath = path.join(

                    exportDirectory,

                    filename

                );

                fs.writeFileSync(

                    outputPath,

                    buildHtmlReport(report),

                    'utf8'

                );

                latestExportedReport = vscode.Uri.file(outputPath);

                if (openAfterExport) {

                    await vscode.env.openExternal(latestExportedReport);

                }

                vscode.window.showInformationMessage(

                    `HTML report generated: ${filename}`,

                    'Open Report'

                ).then(selection => {

                    if (selection === 'Open Report' && latestExportedReport) {

                        void vscode.env.openExternal(latestExportedReport);

                    }

                });

            } catch (error) {

                vscode.window.showErrorMessage(

                    `HTML export failed: ${

                        error instanceof Error

                            ? error.message

                            : String(error)

                    }`

                );

            }

        }

        async function openHtmlReport(): Promise<void> {

            if (

                latestExportedReport &&

                fs.existsSync(latestExportedReport.fsPath)

            ) {

                await vscode.env.openExternal(latestExportedReport);

                return;

            }

            await exportHtmlReport(true);

        }

    const openCommand = vscode.commands.registerCommand(

        'amikooWdio.openCompanion',

        async () => {

            if (panel) {

                panel.reveal();

            } else {

                const newPanel = vscode.window.createWebviewPanel(

                    'amikooWdioCompanion',

                    'Amikoo WDIO Companion',

                    vscode.ViewColumn.One,

                    {

                        enableScripts: true

                    }

                );

                panel = newPanel;

                newPanel.webview.onDidReceiveMessage(

                    async (message: { command?: string; video?: string; testId?: string; }) => {

                        switch (message.command) {

                            case 'connect':

                                await vscode.commands.executeCommand(

                                    'amikooWdio.connect'

                                );

                                break;

                            case 'disconnect':

                                await vscode.commands.executeCommand(

                                    'amikooWdio.disconnect'

                                );

                                break;

                            case 'refresh':

                                await renderPanel();

                                break;

                            case 'runTests':

                                await runTests();

                                break;

                            case 'exportReport':

                                await exportHtmlReport();

                                break;

                            case 'openReport':

                                await openHtmlReport();

                                break;

                            case 'copyVideo':

                                if (

                                    message.video?.startsWith('s3://') &&

                                    /^s3:\/\/[^/]+\/videos\/[^/]+\.mp4$/.test(message.video)

                                ) {

                                    await vscode.env.clipboard.writeText(message.video);

                                    vscode.window.showInformationMessage(

                                        'S3 video reference copied.'

                                    );

                                }

                                break;

                            case 'playVideo': {

                                const report = loadReport();

                                const matchingTest = report?.tests.find(

                                    test =>

                                        test.testRunId === message.testId &&

                                        test.evidence?.video?.s3Uri === message.video

                                );

                                const matchingVideo = matchingTest?.evidence?.video;

                                if (!matchingVideo) {

                                    await newPanel.webview.postMessage({

                                        command: 'videoError',

                                        testId: message.testId,

                                        error: 'Video evidence not found.'

                                    });

                                    break;

                                }

                                try {

                                    const url = await getVideoUrl(

                                        matchingVideo.bucket,

                                        matchingVideo.region,

                                        matchingVideo.key

                                    );

                                    await newPanel.webview.postMessage({

                                        command: 'videoReady',

                                        testId: message.testId,

                                        url

                                    });

                                } catch (error) {

                                    await newPanel.webview.postMessage({

                                        command: 'videoError',

                                        testId: message.testId,

                                        error: error instanceof Error

                                            ? error.message

                                            : String(error)

                                    });

                                }

                                break;

                            }

                        }

                    },

                    undefined,

                    context.subscriptions

                );

                newPanel.onDidDispose(() => {

                    if (panel === newPanel) {

                        panel = undefined;

                    }

                });

            }

            await renderPanel();

        }

    );

    const connectCommand = vscode.commands.registerCommand(

        'amikooWdio.connect',

        async () => {

            const apiKey = await vscode.window.showInputBox({

                title: 'Connect to Amikoo',

                prompt: 'Enter your Amikoo API key',

                password: true,

                ignoreFocusOut: true

            });

            if (!apiKey?.trim()) {

                return;

            }

            try {

                const valid = await validateApiKey(apiKey.trim());

                if (!valid) {

                    vscode.window.showErrorMessage(

                        'Amikoo API key validation failed.'

                    );

                    return;

                }

                await context.secrets.store(

                    SECRET_KEY,

                    apiKey.trim()

                );

                vscode.window.showInformationMessage(

                    'Amikoo API key validated and stored securely.'

                );

                await renderPanel();

            } catch (error) {

                const message = error instanceof Error

                    ? error.message

                    : String(error);

                vscode.window.showErrorMessage(

                    `Amikoo connection failed: ${message}`

                );

            }

        }

    );

    const disconnectCommand = vscode.commands.registerCommand(

        'amikooWdio.disconnect',

        async () => {

            await context.secrets.delete(SECRET_KEY);

            vscode.window.showInformationMessage(

                'Amikoo API key removed from secure storage.'

            );

            await renderPanel();

        }

    );

    context.subscriptions.push(

        openCommand,

        connectCommand,

        disconnectCommand

    );

}

export function deactivate(): void {}
