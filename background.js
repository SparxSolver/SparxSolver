const WORKER_URL = "https://sparxsolver.qbqtcx.workers.dev";

chrome.runtime.onMessage.addListener(async (msg, sender) => {
    const tabId = sender?.tab?.id;

    if (msg.action === "validate_key") {
        try {
            const res  = await fetch(`${WORKER_URL}/validate`, {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ key: msg.key }),
            });
            const data = await res.json();

            chrome.tabs.sendMessage(tabId, {
                action: "validate_result",
                valid:  data.valid,
                key:    msg.key,
                type:   data.type,
                label:  data.label,
                reason: data.reason,
            });
        } catch (err) {
            chrome.tabs.sendMessage(tabId, {
                action: "validate_result",
                valid:  false,
                reason: "Could not reach server — check your connection.",
            });
        }
        return;
    }

    if (msg.action === "capture_and_solve" || msg.action === "capture_and_help") {
        try {
            const licenseKey = msg.licenseKey;
            if (!licenseKey) {
                chrome.tabs.sendMessage(tabId, { action: "error", data: "No license key found.", authError: true });
                return;
            }

            const [tab]      = await chrome.tabs.query({ active: true, currentWindow: true });
            const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });

            const res = await fetch(`${WORKER_URL}/solve`, {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ key: licenseKey, screenshot, action: msg.action }),
            });

            const data = await res.json();

            if (res.status === 401) {
                chrome.tabs.sendMessage(tab.id, {
                    action:    "error",
                    data:      data.error || "License expired.",
                    authError: true,
                });
                return;
            }

            if (!res.ok || data.error) {
                chrome.tabs.sendMessage(tab.id, {
                    action: "error",
                    data:   data.error || "Server error.",
                });
                return;
            }

            chrome.tabs.sendMessage(tab.id, {
                action: "answer",
                data:   { answer: data.answer, label: data.label },
            });

        } catch (err) {
            if (tabId) chrome.tabs.sendMessage(tabId, { action: "error", data: err.message });
        }
    }
});
