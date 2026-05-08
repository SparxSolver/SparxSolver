let solving       = false;
let pendingAction = null;
let lastUrl       = location.href;

const footerMessages = [
    "SparxSolver doesn't share or store any data from you. <a href='https://discord.com/channels/1486793780391575693/1489369223711948961' target='_blank' style='color:#3b82f6;text-decoration:none;'>[Privacy Policy]</a>",
    "SparxSolver is an open source project. <a href='https://github.com/sparxsolver/sparxsolver' target='_blank' style='color:#3b82f6;text-decoration:none;'>[Check the GitHub]</a>",
    "SparxSolver is motivated by donations. <a href='https://discord.com/channels/1486793780391575693/1489363061419802775' target='_blank' style='color:#3b82f6;text-decoration:none;'>[Support Us]</a>",
    "Answer wrong? Report it to our discord so we can improve! <a href='https://discord.com/channels/1486793780391575693/1493699817271070730' target='_blank' style='color:#3b82f6;text-decoration:none;'>[Important Info]</a>",
    "SparxSolver - Affordable uses gpt-4o-mini.",
    "SparxSolver - Basic uses gpt-4o.",
    "SparxSolver - Pro uses gpt-5.4-mini.",
    "SparxSolver - Premium uses gpt-5.4.",
    "You can always <a href='https://discord.com/channels/1486793780391575693/1492211341274910911' target='_blank' style='color:#3b82f6;text-decoration:none;'>[upgrade your plan]</a> in the Patreon.",
];
function getRandomFooter() {
    return footerMessages[Math.floor(Math.random() * footerMessages.length)];
}

function getHelpMenu() {
    return `
        <b>How to use:</b><br>
        • Press <b>Solve</b> to get the answer<br>
        • Press <b>Help</b> for the explanation<br><br>
        Drag the card anywhere to move it.
    `;
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
        ">Activate</button>
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

function buildAnswerHTML(answer, label) {
    const safeAnswer = answer.replace(/\n/g, "<br>");
    return `
        <div style="line-height:1.5;">${safeAnswer}</div>
        <div style="font-size:11px;opacity:0.55;display:flex;align-items:center;gap:6px;">
            <span>— ${label}</span>
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

function isValidPage() {
    return location.href.includes("/student/package/");
}

function createCard(text) {
    if (!isValidPage()) {
        document.querySelector(".Card")?.remove();
        return;
    }

    let card = document.querySelector(".Card");

    if (!card) {
        card = document.createElement("div");
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
            <div id="ssFooter" style="font-size:10px;opacity:0.55;margin-top:10px;text-align:right;line-height:1.4;"></div>
        `;

        document.body.appendChild(card);

        let dragging = false;
        let startMouseX, startMouseY, startCardX, startCardY;

        card.addEventListener("mousedown", (e) => {
            if (["INPUT", "BUTTON", "A", "TEXTAREA"].includes(e.target.tagName)) return;
            const rect  = card.getBoundingClientRect();
            dragging    = true;
            startMouseX = e.clientX;
            startMouseY = e.clientY;
            startCardX  = rect.left;
            startCardY  = rect.top;
            card.style.right = "auto";
            card.style.left  = rect.left + "px";
            card.style.top   = rect.top  + "px";
            e.preventDefault();
        });

        document.addEventListener("mousemove", (e) => {
            if (!dragging) return;
            const newX = startCardX + (e.clientX - startMouseX);
            const newY = startCardY + (e.clientY - startMouseY);
            card.style.left = Math.max(0, Math.min(newX, window.innerWidth  - card.offsetWidth))  + "px";
            card.style.top  = Math.max(0, Math.min(newY, window.innerHeight - card.offsetHeight)) + "px";
        });

        document.addEventListener("mouseup", () => { dragging = false; });
    }

    const content = (text !== undefined) ? text : getHelpMenu();
    card.querySelector("#ssCardContent").innerHTML = content;

    const changeBtn = card.querySelector("#ssChangeKey");
    if (changeBtn) {
        changeBtn.addEventListener("click", () => {
            pendingAction = null;
            showKeyForm();
        });
    }

    const footer = card.querySelector("#ssFooter");
    if (content === getHelpMenu()) {
        footer.innerHTML = `SparxSolver can make mistakes. <a href="https://discord.com/channels/1486793780391575693/1489361351309791262" target="_blank" style="color:inherit;text-decoration:none;">Check important info</a>`;
    } else {
        footer.innerHTML = getRandomFooter();
    }
}

function showKeyForm() {
    createCard(getKeyForm());

    const card   = document.querySelector(".Card");
    const input  = card.querySelector("#ssKeyInput");
    const btn    = card.querySelector("#ssActivateBtn");
    const status = card.querySelector("#ssKeyStatus");

    function tryActivate() {
        const key = input.value.trim();
        if (!key) { status.textContent = "Please enter your key."; return; }
        status.textContent = "Validating…";
        status.style.color = "#aaa";
        btn.disabled       = true;
        input.disabled     = true;
        chrome.runtime.sendMessage({ action: "validate_key", key });
    }

    btn.addEventListener("click", tryActivate);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") tryActivate(); });
    setTimeout(() => input.focus(), 50);
}

async function fireAction(action) {
    if (solving) return;
    const { licenseKey } = await chrome.storage.local.get("licenseKey");
    if (!licenseKey) {
        pendingAction = action;
        showKeyForm();
        return;
    }
    solving = true;
    createCard(action === "capture_and_help" ? "Thinking…" : "Solving…");
    chrome.runtime.sendMessage({ action, licenseKey });
}

chrome.runtime.onMessage.addListener((msg) => {

    if (msg.action === "validate_result") {
        const card   = document.querySelector(".Card");
        const status = card?.querySelector("#ssKeyStatus");
        const btn    = card?.querySelector("#ssActivateBtn");
        const input  = card?.querySelector("#ssKeyInput");

        if (msg.valid) {
            chrome.storage.local.set({ licenseKey: msg.key }, () => {
                if (pendingAction) {
                    const action  = pendingAction;
                    pendingAction = null;
                    solving       = true;
                    createCard(action === "capture_and_help" ? "Thinking…" : "Solving…");
                    chrome.runtime.sendMessage({ action, licenseKey: msg.key });
                } else {
                    createCard();
                }
            });
        } else {
            if (status) { status.textContent = msg.reason || "Invalid key — please check and try again."; status.style.color = "#f87171"; }
            if (btn)    btn.disabled   = false;
            if (input)  input.disabled = false;
        }
        return;
    }

    if (msg.action === "answer") {
        solving = false;
        if (msg.data && typeof msg.data === "object" && msg.data.answer) {
            createCard(buildAnswerHTML(msg.data.answer, msg.data.label));
        } else {
            createCard(String(msg.data));
        }
    }

    if (msg.action === "error") {
        solving = false;
        if (msg.authError) {
            chrome.storage.local.remove("licenseKey");
            pendingAction = null;
        }
        createCard("⚠ " + msg.data);
    }
});

function styleLikeSparx(btn, baseBtn) {
    btn.className = baseBtn.className;
    if (!btn.className.includes("_Content_1cjl7_354")) btn.classList.add("_Content_1cjl7_354");
    for (const attr of baseBtn.attributes) {
        if (attr.name !== "id") btn.setAttribute(attr.name, attr.value);
    }
}

function findAnswerButton() {
    for (const btn of document.querySelectorAll("button")) {
        const text = (btn.innerText || "").toLowerCase().trim();
        if (text.includes("answer") || text.includes("submit") || text.includes("check")) return btn;
    }
    return null;
}

function injectButton() {
    if (!isValidPage()) return;
    const answerBtn = findAnswerButton();
    if (!answerBtn || document.querySelector("#solveBtn")) return;

    const wrapper = document.createElement("div");
    wrapper.style.cssText = "display:flex;align-items:center;gap:8px;";

    const helpBtn = document.createElement("button");
    helpBtn.id = "helpBtn"; helpBtn.textContent = "Help";
    styleLikeSparx(helpBtn, answerBtn);
    helpBtn.onclick = (e) => { e.preventDefault(); e.stopImmediatePropagation(); fireAction("capture_and_help"); };

    const solveBtn = document.createElement("button");
    solveBtn.id = "solveBtn"; solveBtn.textContent = "Solve";
    styleLikeSparx(solveBtn, answerBtn);
    solveBtn.onclick = (e) => { e.preventDefault(); e.stopImmediatePropagation(); fireAction("capture_and_solve"); };

    answerBtn.parentElement.insertBefore(wrapper, answerBtn);
    wrapper.appendChild(helpBtn);
    wrapper.appendChild(solveBtn);
    wrapper.appendChild(answerBtn);
}

function watchUrlChange() {
    setInterval(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            if (isValidPage()) createCard();
            else document.querySelector(".Card")?.remove();
        }
    }, 500);
}

if (isValidPage()) createCard();

watchUrlChange();
const observer = new MutationObserver(() => injectButton());
observer.observe(document.body, { childList: true, subtree: true });
setInterval(injectButton, 1500);