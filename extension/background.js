const WORKER_URL = "https://sparxsolver.qbqtcx.workers.dev";
const REQUEST_TIMEOUT_MS = 30000;
const EXTENSION_ERROR_CODES = {
    NO_LICENSE_KEY: 15,
    SERVER_ERROR: 16,
    EXTENSION_RUNTIME_ERROR: 17,
    INVALID_KEY_FORMAT: 18,
    VALIDATION_NETWORK_ERROR: 19,
};
const VERSION_INFO_URL = "https://raw.githubusercontent.com/SparxSolver/SparxSolver/main/version.json";
const DEFAULT_VERSION_INFO = {
    extensionVersion: "1.3.0",
    botVersion: null,
    releasesUrl: "https://github.com/SparxSolver/SparxSolver/releases",
    latestReleaseUrl: "https://github.com/SparxSolver/SparxSolver/releases",
};

let versionCheckPromise = null;
let versionStatus = {
    currentVersion: DEFAULT_VERSION_INFO.extensionVersion,
    latestVersion: null,
    botVersion: DEFAULT_VERSION_INFO.botVersion,
    releasesUrl: DEFAULT_VERSION_INFO.releasesUrl,
    latestReleaseUrl: DEFAULT_VERSION_INFO.latestReleaseUrl,
    updateAvailable: false,
    checked: false,
    checking: false,
    error: null,
};

function normalizeLicenseKey(value) {
    return String(value || "").trim().toUpperCase();
}

function isValidLicenseKey(value) {
    return /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(normalizeLicenseKey(value));
}

function formatErrorMessage(message, errorCode) {
    const text = String(message || "Server error.").trim();
    if (!errorCode || /error\s*code\s*:/i.test(text)) return text;
    return `${text}\n\nError code: ${errorCode}`;
}

function normalizeVersion(value) {
    const match = String(value || "").trim().match(/^v?(\d+\.\d+\.\d+)(?:$|[-+\s])/i);
    return match ? match[1] : "";
}

function compareVersions(left, right) {
    const leftParts = normalizeVersion(left).split(".").map((part) => Number(part) || 0);
    const rightParts = normalizeVersion(right).split(".").map((part) => Number(part) || 0);
    const length = Math.max(leftParts.length, rightParts.length, 3);

    for (let index = 0; index < length; index += 1) {
        const diff = (leftParts[index] || 0) - (rightParts[index] || 0);
        if (diff !== 0) return diff > 0 ? 1 : -1;
    }

    return 0;
}

function normalizeRemoteVersionInfo(data = {}) {
    const extensionVersion = normalizeVersion(
        data.extensionVersion ||
        data.extension?.version ||
        data.versions?.extension ||
        data.version
    );
    const botVersion = normalizeVersion(
        data.botVersion ||
        data.bot?.version ||
        data.versions?.bot
    );

    return {
        ...DEFAULT_VERSION_INFO,
        extensionVersion: extensionVersion || DEFAULT_VERSION_INFO.extensionVersion,
        botVersion: botVersion || DEFAULT_VERSION_INFO.botVersion,
        releasesUrl: String(data.releasesUrl || DEFAULT_VERSION_INFO.releasesUrl),
        latestReleaseUrl: String(data.latestReleaseUrl || data.releasesUrl || DEFAULT_VERSION_INFO.latestReleaseUrl),
    };
}

async function readVersionInfo() {
    const fallbackVersion = chrome.runtime.getManifest().version || DEFAULT_VERSION_INFO.extensionVersion;

    try {
        const res = await fetch(VERSION_INFO_URL, { cache: "no-store" });
        if (!res.ok) throw new Error(`GitHub version.json returned ${res.status}`);
        return normalizeRemoteVersionInfo(await res.json());
    } catch (error) {
        return {
            ...DEFAULT_VERSION_INFO,
            extensionVersion: fallbackVersion,
            error: error?.message || "Could not check for updates.",
        };
    }
}

async function checkVersion() {
    if (versionCheckPromise) return await versionCheckPromise;

    versionStatus = {
        ...versionStatus,
        checking: true,
        error: null,
    };

    versionCheckPromise = (async () => {
        const info = await readVersionInfo();
        const currentVersion = normalizeVersion(chrome.runtime.getManifest().version) || DEFAULT_VERSION_INFO.extensionVersion;
        const latestVersion = normalizeVersion(info.extensionVersion) || "";
        const releasesUrl = info.releasesUrl || DEFAULT_VERSION_INFO.releasesUrl;
        const latestReleaseUrl = info.latestReleaseUrl || releasesUrl;

        versionStatus = {
            currentVersion,
            latestVersion,
            botVersion: info.botVersion || null,
            releasesUrl,
            latestReleaseUrl,
            updateAvailable: Boolean(latestVersion && compareVersions(currentVersion, latestVersion) < 0),
            checked: true,
            checking: false,
            error: info.error || null,
        };

        versionCheckPromise = null;

        return versionStatus;
    })();

    return await versionCheckPromise;
}

async function postWorkerJson(path, body) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);

    try {
        const res = await fetch(`${WORKER_URL}${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: ctrl.signal,
        });

        let data = {};
        try {
            data = await res.json();
        } catch {
            data = {};
        }

        return { res, data };
    } finally {
        clearTimeout(timer);
    }
}

async function postWorkerJsonWithFallback(path, fallbackPath, body) {
    const result = await postWorkerJson(path, body);
    if (result.res.status === 404 && fallbackPath) {
        return await postWorkerJson(fallbackPath, body);
    }
    return result;
}

async function sendToTab(tabId, payload) {
    if (!tabId) return;
    await chrome.tabs.sendMessage(tabId, payload).catch(() => {});
}

checkVersion();
chrome.runtime.onStartup.addListener(() => {
    checkVersion();
});
chrome.runtime.onInstalled.addListener(() => {
    checkVersion();
});

chrome.runtime.onMessage.addListener((msg, sender) => {
    const tabId = sender?.tab?.id;

    (async () => {
        if (msg.action === "get_version_status") {
            await sendToTab(tabId, {
                action: "version_status",
                data: await checkVersion(),
            });
            return;
        }

        if (msg.action === "validate_key") {
            const licenseKey = normalizeLicenseKey(msg.key);
            if (!isValidLicenseKey(licenseKey)) {
                await sendToTab(tabId, {
                    action: "validate_result",
                    valid: false,
                    reason: formatErrorMessage("Invalid key format.", EXTENSION_ERROR_CODES.INVALID_KEY_FORMAT),
                });
                return;
            }

            try {
                const { data } = await postWorkerJsonWithFallback("/check-access", "/validate", {
                    key: licenseKey,
                });

                await sendToTab(tabId, {
                    action: "validate_result",
                    valid: data.valid,
                    key: data.key || licenseKey,
                    type: data.type,
                    label: data.label,
                    reason: data.reason && !data.valid
                        ? formatErrorMessage(data.reason, data.errorCode || EXTENSION_ERROR_CODES.SERVER_ERROR)
                        : data.reason,
                });
            } catch {
                await sendToTab(tabId, {
                    action: "validate_result",
                    valid: false,
                    reason: formatErrorMessage(
                        "Could not reach server - check your connection.",
                        EXTENSION_ERROR_CODES.VALIDATION_NETWORK_ERROR
                    ),
                });
            }
            return;
        }

        if (msg.action === "capture_and_solve" || msg.action === "capture_and_help") {
            try {
                const licenseKey = normalizeLicenseKey(msg.licenseKey);
                if (!isValidLicenseKey(licenseKey)) {
                    await sendToTab(tabId, {
                        action: "error",
                        data: formatErrorMessage("No license key found.", EXTENSION_ERROR_CODES.NO_LICENSE_KEY),
                        errorCode: EXTENSION_ERROR_CODES.NO_LICENSE_KEY,
                        authError: true,
                    });
                    return;
                }

                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });

                const { res, data } = await postWorkerJsonWithFallback("/ask-gpt", "/solve", {
                    key: licenseKey,
                    screenshot,
                    action: msg.action,
                    bookwork: Boolean(msg.bookwork),
                    questionFingerprint: msg.questionFingerprint,
                });

                if (res.status === 401) {
                    await sendToTab(tab.id, {
                        action: "error",
                        data: formatErrorMessage(data.error || "License expired.", data.errorCode),
                        errorCode: data.errorCode,
                        authError: true,
                    });
                    return;
                }

                if (!res.ok || data.error) {
                    await sendToTab(tab.id, {
                        action: "error",
                        data: formatErrorMessage(
                            data.error || "Server error.",
                            data.errorCode || EXTENSION_ERROR_CODES.SERVER_ERROR
                        ),
                        errorCode: data.errorCode || EXTENSION_ERROR_CODES.SERVER_ERROR,
                    });
                    return;
                }

                await sendToTab(tab.id, {
                    action: "answer",
                    data: {
                        answer: data.answer,
                        label: data.label,
                        bookwork: Boolean(data.bookwork || msg.bookwork),
                    },
                });
            } catch (err) {
                await sendToTab(tabId, {
                    action: "error",
                    data: formatErrorMessage(err.message, EXTENSION_ERROR_CODES.EXTENSION_RUNTIME_ERROR),
                    errorCode: EXTENSION_ERROR_CODES.EXTENSION_RUNTIME_ERROR,
                });
            }
        }
    })();

    return true;
});
