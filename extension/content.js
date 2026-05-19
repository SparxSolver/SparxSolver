let solving = false;
let pendingAction = null;
let activeRequest = null;
let lastUrl = location.href;
let lastBookworkState = null;
let pageRefreshTimer = null;
let versionStatusRequested = false;
let versionStatus = {
    currentVersion: "1.4.1",
    latestVersion: null,
    latestReleaseUrl: "https://github.com/SparxSolver/SparxSolver/releases",
    updateAvailable: false,
    checked: false,
    checking: true,
    error: null,
};

const CARD_ID = "ssSolverCard";
const BUTTON_WRAPPER_ID = "ssButtonWrapper";

const footerMessages = [
    "Screenshots are sent to SparxSolver to generate answer/help responses and are not stored by the Worker. <a href='https://discord.com/channels/1486793780391575693/1489369223711948961' target='_blank' style='color:#3b82f6;text-decoration:none;'>[Privacy Policy]</a>",
    "SparxSolver is an open source project. <a href='https://github.com/sparxsolver/sparxsolver' target='_blank' style='color:#3b82f6;text-decoration:none;'>[Check the GitHub]</a>",
    "SparxSolver is motivated by donations. <a href='https://discord.com/channels/1486793780391575693/1489363061419802775' target='_blank' style='color:#3b82f6;text-decoration:none;'>[Support Us]</a>",
    "Answer wrong? Report it to our Discord so we can improve. <a href='https://discord.com/channels/1486793780391575693/1493699817271070730' target='_blank' style='color:#3b82f6;text-decoration:none;'>[Important Info]</a>",
    "SparxSolver Affordable uses gpt-4o.",
    "SparxSolver Basic uses gpt-5.4-mini.",
    "SparxSolver Pro uses gpt-5.4.",
    "SparxSolver Premium uses gpt-5.5.",
    "You can always <a href='https://discord.com/channels/1486793780391575693/1492211341274910911' target='_blank' style='color:#3b82f6;text-decoration:none;'>[upgrade your plan]</a> in the Patreon.",
];

function getRandomFooter() {
    return footerMessages[Math.floor(Math.random() * footerMessages.length)];
}

function normalizeLicenseKey(value) {
    return String(value || "").trim().toUpperCase();
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
}

function getCard() {
    return document.getElementById(CARD_ID);
}

function getHelpMenu() {
    return `
        <b>Answer and help modes:</b><br>
        - <b>Solve</b> gives a compact answer<br>
        - <b>Help</b> explains the method without the final answer<br><br>
        Drag the card anywhere to move it.
    `;
}

function getVersionStatusHTML() {
    const latestVersion = escapeHtml(versionStatus.latestVersion || versionStatus.currentVersion || "1.4.1");
    const latestReleaseUrl = escapeAttribute(
        versionStatus.latestReleaseUrl || "https://github.com/SparxSolver/SparxSolver/releases"
    );

    if (versionStatus.updateAvailable) {
        return `SparxSolver is out of date. Update <a href="${latestReleaseUrl}" target="_blank" rel="noopener noreferrer" style="color:#93c5fd;text-decoration:none;">here</a> (${latestVersion}).`;
    }

    return "";
}

function renderVersionStatus() {
    const node = getCard()?.querySelector("#ssVersionStatus");
    if (!node) return;

    const html = getVersionStatusHTML();
    node.innerHTML = html;
    node.style.display = html ? "block" : "none";
    node.style.opacity = versionStatus.updateAvailable ? "0.95" : "0.65";
    node.style.color = versionStatus.updateAvailable ? "#bfdbfe" : "inherit";
}

function requestVersionStatus() {
    if (versionStatusRequested) return;
    versionStatusRequested = true;

    try {
        chrome.runtime.sendMessage({ action: "get_version_status" });
    } catch {
        versionStatus = {
            ...versionStatus,
            checking: false,
            error: "Could not request version status.",
        };
        renderVersionStatus();
    }
}

function getKeyForm() {
    return `
        <div style="font-size:12px;margin-bottom:8px;opacity:0.75;">
            Enter your license key to continue:
        </div>
        <input
            id="ssKeyInput"
            type="text"
            placeholder="XXXX-XXXX"
            autocomplete="off"
            spellcheck="false"
            style="
                width:100%;box-sizing:border-box;
                padding:6px 8px;border-radius:6px;
                border:1px solid #444;background:#1a1a1a;
                color:#fff;font-size:12px;margin-bottom:8px;
                outline:none;font-family:monospace;letter-spacing:1px;
            "
        />
        <button id="ssActivateBtn" style="
            width:100%;padding:6px;border-radius:6px;border:none;
            background:#3b82f6;color:#fff;font-size:12px;
            cursor:pointer;font-weight:bold;margin-bottom:8px;
        ">Activate key</button>
        <div style="font-size:11px;opacity:0.6;text-align:center;">
            Don't have a key? Buy one
            <a
                href="https://discord.com/channels/1486793780391575693/1491961435889078413"
                target="_blank"
                style="color:#3b82f6;text-decoration:none;"
            >here</a>
        </div>
        <div id="ssKeyStatus" style="font-size:11px;margin-top:6px;min-height:14px;color:#f87171;"></div>
    `;
}

function buildAnswerHTML(answer, label, options = {}) {
    const displayAnswer = options.bookwork ? answerOnlyForBookwork(answer) : answer;
    const safeAnswer = escapeHtml(displayAnswer).replace(/\n/g, "<br>");
    const safeLabel = escapeHtml(label);

    return `
        <div style="line-height:1.5;">${safeAnswer}</div>
        <div style="font-size:11px;opacity:0.55;display:flex;align-items:center;gap:6px;">
            <span>- ${safeLabel}</span>
            <span
                id="ssChangeKey"
                style="
                    cursor:pointer;
                    color:#3b82f6;
                    font-size:10px;
                    opacity:0.8;
                    user-select:none;
                "
            >[Change]</span>
        </div>
    `;
}

function buildErrorHTML(message, errorCode) {
    const display = errorCode ? `Error code: ${errorCode}` : String(message || "Error code: unknown");
    const safeMessage = escapeHtml(display).replace(/\n/g, "<br>");

    return `
        <div style="line-height:1.45;">${safeMessage}</div>
    `;
}

function isValidPage() {
    return location.href.includes("/student/package/");
}

function getPageTextWithoutSolver() {
    let text = document.body?.innerText || "";
    const cardText = getCard()?.innerText;
    const buttonText = document.getElementById(BUTTON_WRAPPER_ID)?.innerText;
    if (cardText) text = text.replace(cardText, "");
    if (buttonText) text = text.replace(buttonText, "");
    return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function getQuestionFingerprint() {
    return getPageTextWithoutSolver()
        .replace(/\b\d{1,3}(?:,\d{3})*\s*xp\b/g, "")
        .replace(/\bprevious\b|\bwatch video\b|\bmenu\b/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 12000);
}

function isBookworkCheck() {
    const url = location.href.toLowerCase();
    const text = getPageTextWithoutSolver()
        .replace(/\bbook\s*work\s*code\s*:\s*[a-z0-9-]+/g, "")
        .replace(/\bbookwork\s*code\s*:\s*[a-z0-9-]+/g, "");

    return url.includes("bookwork") ||
        /\bbook\s*work\s*check\b/.test(text) ||
        /\bbookwork\s*check\b/.test(text) ||
        text.includes("use your bookwork") ||
        text.includes("from your bookwork") ||
        text.includes("copy your answer from your bookwork");
}

function answerOnlyForBookwork(answer) {
    const text = String(answer || "").trim();
    const labelledAnswer = text.match(/(?:^|\n)\s*(?:final\s+)?answer\s*(?:is)?\s*[:=-]\s*(.+)$/i);
    if (labelledAnswer) return labelledAnswer[1].trim();

    const lines = text
        .split(/\r?\n/)
        .map((line) => line.replace(/^[\s>*-]+/, "").trim())
        .filter(Boolean);

    return lines.length > 1 ? lines[lines.length - 1] : text;
}

function createCard(text, options = {}) {
    if (!isValidPage() || isBookworkCheck()) {
        getCard()?.remove();
        return;
    }

    let card = getCard();
    const showingDefault = text === undefined;
    const state = options.state || (showingDefault ? "default" : "message");
    lastBookworkState = isBookworkCheck();

    if (!card) {
        card = document.createElement("div");
        card.id = CARD_ID;
        card.className = "Card";
        card.style.cssText = `
            position:fixed;
            top:20px;
            right:20px;
            z-index:2147483647;
            background:rgba(17,17,17,0.96);
            color:#fff;
            padding:15px;
            border-radius:10px;
            max-width:300px;
            min-width:220px;
            box-shadow:0 4px 20px rgba(0,0,0,0.5);
            font-family:sans-serif;
        `;

        card.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                <div style="font-weight:bold;font-size:14px;">SparxSolver</div>
                <div id="ssDragHandle" style="
                    cursor:grab;display:flex;flex-direction:column;gap:3px;
                    padding:4px;opacity:0.6;flex-shrink:0;
                ">
                    <div style="width:16px;height:2px;background:#ccc;border-radius:1px;"></div>
                    <div style="width:16px;height:2px;background:#ccc;border-radius:1px;"></div>
                    <div style="width:16px;height:2px;background:#ccc;border-radius:1px;"></div>
                </div>
            </div>
            <div id="ssCardContent"></div>
            <div id="ssVersionStatus" style="font-size:11px;margin-top:10px;line-height:1.4;"></div>
            <div id="ssFooter" style="font-size:10px;opacity:0.55;margin-top:10px;text-align:right;line-height:1.4;"></div>
        `;

        document.body.appendChild(card);

        let dragging = false;
        let startMouseX;
        let startMouseY;
        let startCardX;
        let startCardY;

        card.addEventListener("mousedown", (event) => {
            if (["INPUT", "BUTTON", "A", "TEXTAREA"].includes(event.target.tagName)) return;
            const rect = card.getBoundingClientRect();
            dragging = true;
            startMouseX = event.clientX;
            startMouseY = event.clientY;
            startCardX = rect.left;
            startCardY = rect.top;
            card.style.right = "auto";
            card.style.left = `${rect.left}px`;
            card.style.top = `${rect.top}px`;
            event.preventDefault();
        });

        document.addEventListener("mousemove", (event) => {
            if (!dragging) return;
            const newX = startCardX + (event.clientX - startMouseX);
            const newY = startCardY + (event.clientY - startMouseY);
            card.style.left = `${Math.max(0, Math.min(newX, window.innerWidth - card.offsetWidth))}px`;
            card.style.top = `${Math.max(0, Math.min(newY, window.innerHeight - card.offsetHeight))}px`;
        });

        document.addEventListener("mouseup", () => {
            dragging = false;
        });
    }

    card.dataset.ssState = state;
    card.querySelector("#ssCardContent").innerHTML = showingDefault ? getHelpMenu() : text;
    renderVersionStatus();
    requestVersionStatus();

    const changeBtn = card.querySelector("#ssChangeKey");
    if (changeBtn) {
        changeBtn.addEventListener("click", () => {
            pendingAction = null;
            showKeyForm();
        });
    }

    const footer = card.querySelector("#ssFooter");
    if (showingDefault) {
        footer.innerHTML = `SparxSolver can make mistakes. <a href="https://discord.com/channels/1486793780391575693/1489361351309791262" target="_blank" style="color:inherit;text-decoration:none;">Check important info</a>`;
    } else {
        footer.innerHTML = getRandomFooter();
    }
}

function showKeyForm() {
    createCard(getKeyForm(), { state: "key" });

    const card = getCard();
    const input = card.querySelector("#ssKeyInput");
    const btn = card.querySelector("#ssActivateBtn");
    const status = card.querySelector("#ssKeyStatus");

    function tryActivate() {
        const key = normalizeLicenseKey(input.value);
        if (!key) {
            status.textContent = "Please enter your key.";
            return;
        }
        input.value = key;
        status.textContent = "Validating...";
        status.style.color = "#aaa";
        btn.disabled = true;
        input.disabled = true;
        chrome.runtime.sendMessage({ action: "validate_key", key });
    }

    btn.addEventListener("click", tryActivate);
    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") tryActivate();
    });
    setTimeout(() => input.focus(), 50);
}

async function fireAction(action) {
    if (solving) return;
    const request = {
        action,
        bookwork: isBookworkCheck(),
        questionFingerprint: getQuestionFingerprint(),
    };

    if (request.bookwork) {
        return;
    }

    const { licenseKey } = await chrome.storage.local.get("licenseKey");
    if (!licenseKey) {
        pendingAction = request;
        showKeyForm();
        return;
    }

    startRequest(request, licenseKey);
}

function startRequest(request, licenseKey) {
    solving = true;
    activeRequest = request;
    createCard(request.action === "capture_and_help" ? "Preparing help..." : "Preparing answer...", { state: "loading" });
    chrome.runtime.sendMessage({
        action: request.action,
        licenseKey,
        bookwork: request.bookwork,
        questionFingerprint: request.questionFingerprint,
    });
}

chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "version_status") {
        if (msg.data && typeof msg.data === "object") {
            versionStatus = {
                ...versionStatus,
                ...msg.data,
            };
        }
        renderVersionStatus();
        return;
    }

    if (msg.action === "validate_result") {
        const card = getCard();
        const status = card?.querySelector("#ssKeyStatus");
        const btn = card?.querySelector("#ssActivateBtn");
        const input = card?.querySelector("#ssKeyInput");

        if (msg.valid) {
            chrome.storage.local.set({ licenseKey: msg.key }, () => {
                if (pendingAction) {
                    const request = pendingAction;
                    pendingAction = null;
                    if (request.bookwork) {
                        return;
                    }
                    startRequest(request, msg.key);
                } else {
                    createCard();
                }
            });
        } else {
            if (status) {
                status.textContent = msg.reason || "Invalid key. Please check and try again.";
                status.style.color = "#f87171";
            }
            if (btn) btn.disabled = false;
            if (input) input.disabled = false;
        }
        return;
    }

    if (msg.action === "answer") {
        solving = false;
        const request = activeRequest;
        activeRequest = null;
        if (msg.data && typeof msg.data === "object" && msg.data.answer) {
            createCard(buildAnswerHTML(msg.data.answer, msg.data.label, {
                ...msg.data,
                bookwork: Boolean(msg.data.bookwork || request?.bookwork),
            }), { state: "answer" });
        } else {
            createCard(String(msg.data), { state: "answer" });
        }
    }

    if (msg.action === "error") {
        solving = false;
        activeRequest = null;
        if (msg.authError) {
            chrome.storage.local.remove("licenseKey");
            pendingAction = null;
        }
        createCard(buildErrorHTML(msg.data, msg.errorCode), { state: "error" });
    }
});

function styleLikeSparx(btn, baseBtn) {
    btn.className = baseBtn.className;
    if (!btn.className.includes("_Content_1cjl7_354")) btn.classList.add("_Content_1cjl7_354");
    for (const attr of baseBtn.attributes) {
        if (attr.name !== "id") btn.setAttribute(attr.name, attr.value);
    }
}

function getButtonText(btn) {
    return (btn.innerText || btn.textContent || "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}

function findAnswerButton() {
    for (const btn of document.querySelectorAll("button")) {
        if (btn.id === "helpBtn" || btn.id === "solveBtn") continue;
        if (getButtonText(btn) === "answer") return btn;
    }
    return null;
}

function removeInjectedButtons() {
    const wrapper = document.getElementById(BUTTON_WRAPPER_ID);
    if (!wrapper) return;

    const answerBtn = Array.from(wrapper.querySelectorAll("button"))
        .find((btn) => btn.id !== "helpBtn" && btn.id !== "solveBtn");

    if (answerBtn && wrapper.parentElement) {
        wrapper.parentElement.insertBefore(answerBtn, wrapper);
    }

    wrapper.remove();
}

function injectButton() {
    if (!isValidPage() || isBookworkCheck()) {
        removeInjectedButtons();
        return;
    }

    const answerBtn = findAnswerButton();
    const existingWrapper = document.getElementById(BUTTON_WRAPPER_ID);

    if (!answerBtn) {
        removeInjectedButtons();
        return;
    }

    if (existingWrapper) {
        if (existingWrapper.contains(answerBtn) && document.querySelector("#solveBtn")) return;
        removeInjectedButtons();
    }

    const wrapper = document.createElement("div");
    wrapper.id = BUTTON_WRAPPER_ID;
    wrapper.style.cssText = "display:flex;align-items:center;gap:8px;";

    const helpBtn = document.createElement("button");
    helpBtn.id = "helpBtn";
    helpBtn.textContent = "Help";
    styleLikeSparx(helpBtn, answerBtn);
    helpBtn.onclick = (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        fireAction("capture_and_help");
    };

    const solveBtn = document.createElement("button");
    solveBtn.id = "solveBtn";
    solveBtn.textContent = "Solve";
    styleLikeSparx(solveBtn, answerBtn);
    solveBtn.onclick = (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        fireAction("capture_and_solve");
    };

    answerBtn.parentElement.insertBefore(wrapper, answerBtn);
    wrapper.appendChild(helpBtn);
    wrapper.appendChild(solveBtn);
    wrapper.appendChild(answerBtn);
}

function clearBookworkUi() {
    removeInjectedButtons();
    getCard()?.remove();
}

function watchUrlChange() {
    setInterval(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            if (isValidPage() && !isBookworkCheck()) {
                createCard();
                injectButton();
            } else {
                clearBookworkUi();
            }
        }
    }, 500);
}

function refreshUiForPageChange() {
    if (!isValidPage()) return;

    const bookwork = isBookworkCheck();
    if (bookwork) {
        clearBookworkUi();
        lastBookworkState = true;
        return;
    }

    if (!getCard()) {
        createCard();
    }
    injectButton();
    lastBookworkState = false;
}

function scheduleUiRefresh() {
    if (pageRefreshTimer) return;
    pageRefreshTimer = setTimeout(() => {
        pageRefreshTimer = null;
        refreshUiForPageChange();
    }, 250);
}

function startUi() {
    if (isValidPage() && !isBookworkCheck()) {
        createCard();
        injectButton();
    } else {
        clearBookworkUi();
    }

    watchUrlChange();
    const observer = new MutationObserver(scheduleUiRefresh);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    setInterval(scheduleUiRefresh, 1500);
}

if (document.body) {
    startUi();
} else {
    document.addEventListener("DOMContentLoaded", startUi, { once: true });
}
