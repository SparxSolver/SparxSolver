const WORKER_URL = "https://sparxsolver.qbqtcx.workers.dev";
const REQUEST_TIMEOUT_MS = 30000;
const DEFAULT_VERSION_INFO = {
    version: "1.1.0",
    releasesUrl: "https://github.com/SparxSolver/SparxSolver/releases",
    releasesApiUrl: "https://api.github.com/repos/SparxSolver/SparxSolver/releases",
    latestReleaseApiUrl: "https://api.github.com/repos/SparxSolver/SparxSolver/releases/latest",
};

let versionCheckPromise = null;
let versionStatus = {
    currentVersion: DEFAULT_VERSION_INFO.version,
    latestVersion: null,
    releasesUrl: DEFAULT_VERSION_INFO.releasesUrl,
    latestReleaseUrl: DEFAULT_VERSION_INFO.releasesUrl,
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

async function readVersionInfo() {
    try {
        const res = await fetch(chrome.runtime.getURL("version.json"), { cache: "no-store" });
        if (!res.ok) return DEFAULT_VERSION_INFO;
        const data = await res.json();
        return {
            ...DEFAULT_VERSION_INFO,
            ...data,
            version: data.version || chrome.runtime.getManifest().version || DEFAULT_VERSION_INFO.version,
        };
    } catch {
        return {
            ...DEFAULT_VERSION_INFO,
            version: chrome.runtime.getManifest().version || DEFAULT_VERSION_INFO.version,
        };
    }
}

function pickLatestVersionedRelease(data) {
    const releases = Array.isArray(data) ? data : [data];

    return releases
        .map((release) => ({
            release,
            version: normalizeVersion(release?.tag_name || release?.name),
        }))
        .filter((item) => item.version)
        .sort((left, right) => compareVersions(right.version, left.version))[0] || null;
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
        const currentVersion = normalizeVersion(info.version) || DEFAULT_VERSION_INFO.version;
        const releasesUrl = info.releasesUrl || DEFAULT_VERSION_INFO.releasesUrl;

        try {
            const res = await fetch(
                info.releasesApiUrl || info.latestReleaseApiUrl || DEFAULT_VERSION_INFO.releasesApiUrl,
                {
                    cache: "no-store",
                    headers: { Accept: "application/vnd.github+json" },
                }
            );
            if (!res.ok) throw new Error(`GitHub returned ${res.status}`);

            const data = await res.json();
            const latest = pickLatestVersionedRelease(data);
            const latestVersion = latest?.version || "";
            const latestReleaseUrl = latest?.release?.html_url || releasesUrl;

            versionStatus = {
                currentVersion,
                latestVersion,
                releasesUrl,
                latestReleaseUrl,
                updateAvailable: Boolean(latestVersion && compareVersions(currentVersion, latestVersion) < 0),
                checked: true,
                checking: false,
                error: null,
            };
        } catch (err) {
            try {
                const fallbackRes = await fetch(info.latestReleaseApiUrl || DEFAULT_VERSION_INFO.latestReleaseApiUrl, {
                    cache: "no-store",
                    headers: { Accept: "application/vnd.github+json" },
                });
                if (!fallbackRes.ok) throw new Error(`GitHub returned ${fallbackRes.status}`);

                const latest = pickLatestVersionedRelease(await fallbackRes.json());
                const latestVersion = latest?.version || "";
                const latestReleaseUrl = latest?.release?.html_url || releasesUrl;

                versionStatus = {
                    currentVersion,
                    latestVersion,
                    releasesUrl,
                    latestReleaseUrl,
                    updateAvailable: Boolean(latestVersion && compareVersions(currentVersion, latestVersion) < 0),
                    checked: true,
                    checking: false,
                    error: null,
                };
            } catch (fallbackErr) {
                versionStatus = {
                    currentVersion,
                    latestVersion: null,
                    releasesUrl,
                    latestReleaseUrl: releasesUrl,
                    updateAvailable: false,
                    checked: true,
                    checking: false,
                    error: fallbackErr?.message || err?.message || "Could not check for updates.",
                };
            }
        } finally {
            versionCheckPromise = null;
        }

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
                    reason: "Invalid key format.",
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
                    reason: data.reason,
                });
            } catch {
                await sendToTab(tabId, {
                    action: "validate_result",
                    valid: false,
                    reason: "Could not reach server - check your connection.",
                });
            }
            return;
        }

        if (msg.action === "capture_and_solve" || msg.action === "capture_and_help") {
            try {
                const licenseKey = normalizeLicenseKey(msg.licenseKey);
                if (!isValidLicenseKey(licenseKey)) {
                    await sendToTab(tabId, { action: "error", data: "No license key found.", authError: true });
                    return;
                }

                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });

                const { res, data } = await postWorkerJsonWithFallback("/ask-gpt", "/solve", {
                    key: licenseKey,
                    screenshot,
                    action: msg.action,
                    bookwork: Boolean(msg.bookwork),
                });

                if (res.status === 401) {
                    await sendToTab(tab.id, {
                        action: "error",
                        data: data.error || "License expired.",
                        authError: true,
                    });
                    return;
                }

                if (!res.ok || data.error) {
                    await sendToTab(tab.id, {
                        action: "error",
                        data: data.error || "Server error.",
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
                await sendToTab(tabId, { action: "error", data: err.message });
            }
        }
    })();

    return true;
});
