require('dotenv').config({ quiet: true });

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');

if (typeof fetch !== 'function') {
  throw new Error('This bot requires Node.js 18 or newer because it uses the built-in fetch API.');
}

const ids = {
  ch: {
    buyPing: '1510723329542324224',
    tickets: '1510722809511547000',
    autoDeleteA: '1498037391892545557',
    setup: '1492211341274910911',
    keyAll: '1510722835356582049',
    keyAff: '1510722848417910826',
    keyBas: '1510722861038567434',
    keyPro: '1510722873214373898',
    keyPrm: '1510723223036366909',
    relList: '1496407953949982790',
    issues: '1510723300928524409',
    errorLogs: '1510723315021643877'
  },
  role: {
    aff: '1493707110020546731',
    bas: '1493707149069647932',
    pro: '1493707169655292105',
    prm: '1493707187091144875'
  },
  user: {
    bot: '1492213061354786969',
    owner: '1486781207814475836'
  }
};

const cid = {
  keyBtn: 'klk',
  keyModal: 'kmd',
  setupBtn: 'sub',
  setupPage: 'sup',
  infoMenu: 'spx_info_menu',
  infoBtn: 'spx_info',
  issueStat: 'spx_status',
  issueOpen: 'spx_ticket',
  issueDelete: 'idl',
  errorCodeSelect: 'ecs'
};

const legacyCid = {
  infoMenu: 'ivm',
  infoBtn: 'ivi',
  issueStat: 'ist',
  issueOpen: 'iop'
};

const cfg = {
  purgeAgeMs: 14 * 24 * 60 * 60 * 1000,
  purgeRetryMs: 1000,
  httpTimeoutMs: 8000,
  systemProbeTimeoutMs: 2500,
  cpuSampleMs: 750,
  statusCacheMs: 60 * 60 * 1000,
  issueDeleteDelayMs: 1500,
  issueLifetimeMs: 24 * 60 * 60 * 1000,
  issueWarnBeforeDeleteMs: 60 * 60 * 1000,
  issuePrefix: 'issues',
  issueTopicPrefix: 'issue-owner:',
  defaultBotServiceName: 'bot.service'
};

const versionInfoUrl = process.env.SPARXSOLVER_VERSION_URL ||
  'https://raw.githubusercontent.com/SparxSolver/SparxSolver/refs/heads/main/version.json';

function getLocalVersionFilePaths() {
  return [process.env.SPARXSOLVER_VERSION_FILE].filter(Boolean);
}

function getBotVersionSource() {
  const source = String(process.env.SPARXSOLVER_VERSION_SOURCE || 'local').trim().toLowerCase();
  return source === 'github' ? 'github' : 'local';
}

function getVersionText(value) {
  const text = String(value || '').trim();
  return /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(text) ? text : '';
}

function getBotVersionFromJson(data) {
  return (
    getVersionText(data?.bot?.version) ||
    getVersionText(data?.Bot?.version) ||
    getVersionText(data?.BOT?.version) ||
    getVersionText(data?.versions?.bot) ||
    getVersionText(data?.versions?.Bot) ||
    getVersionText(data?.botVersion)
  );
}

function readLocalBotVersion() {
  for (const filePath of getLocalVersionFilePaths()) {
    try {
      if (!fs.existsSync(filePath)) {
        continue;
      }

      const version = getBotVersionFromJson(JSON.parse(fs.readFileSync(filePath, 'utf8')));
      if (version) {
        return version;
      }
    } catch (err) {
      console.warn(`Could not read bot version from ${filePath}: ${err.message}`);
    }
  }

  try {
    return getVersionText(require(path.join(__dirname, 'package.json'))?.version) || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

async function readRemoteBotVersion() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.httpTimeoutMs);

  try {
    const response = await fetch(versionInfoUrl, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json'
      },
      signal: ctrl.signal
    });

    if (!response.ok) {
      throw new Error(`GitHub version.json returned ${response.status}.`);
    }

    const version = getBotVersionFromJson(await response.json());
    if (!version) {
      throw new Error('GitHub version.json does not contain a valid bot version.');
    }

    return version;
  } finally {
    clearTimeout(timer);
  }
}

async function refreshBotVersion() {
  const versionSource = getBotVersionSource();

  if (versionSource !== 'github') {
    ver = `SparxSolver ${readLocalBotVersion()}`;
    console.log(`Bot version loaded from local source: ${ver}`);
    return ver;
  }

  try {
    const version = await readRemoteBotVersion();
    ver = `SparxSolver ${version}`;
    console.log(`Bot version loaded from GitHub ${versionInfoUrl}: ${ver}`);
  } catch (err) {
    logShortErr(`Failed to load remote bot version from ${versionInfoUrl}`, err);
    ver = `SparxSolver ${readLocalBotVersion()}`;
    console.log(`Using local fallback bot version: ${ver}`);
  }

  return ver;
}

let ver = `SparxSolver ${readLocalBotVersion()}`;
const ephFlags = 1 << 6;
const issueStatusCache = {
  text: '',
  checkedAtMs: 0,
  inFlight: null
};
const issueTimers = new Map();
const autoDelChIds = new Set([
  ids.ch.autoDeleteA,
  ids.ch.tickets,
  ids.ch.issues
]);
const okMsgAuthorIds = new Set([
  ids.user.bot,
  ids.user.owner
]);

const urls = {
  patreon: 'https://www.patreon.com/cw/SparxxSolver/membership',
  invite: 'https://discord.gg/CmZJ4Fy6Wh',
  ticket: 'https://discord.com/channels/1486793780391575693/1510722809511547000',
  issueGuide: 'https://discord.com/channels/1486793780391575693/1510723300928524409'
};

const tierRl = {
  affordable: ids.role.aff,
  basic: ids.role.bas,
  pro: ids.role.pro,
  premium: ids.role.prm
};

const tierNames = {
  affordable: `Affordable`,
  basic: `Basic`,
  pro: `Pro`,
  premium: `Premium`
};

const universalLookupTierKeys = ['premium', 'pro', 'basic', 'affordable'];

function mkNoKeyMsg(keyDef) {
  const tierName = keyDef.lookupTierKeys ? tierNames.affordable : keyDef.tierName;
  return `No ${tierName} key was found for that email. Buy SparxSolver ${tierName} to get a license key. If you already have and it's still not showing, open a ticket [here](${urls.ticket}).`;
}

const privacyRightsText = `You have the right to access, correct, or delete your data.`;
const privacyContactText = `Use Data & Privacy if you need help with privacy or account data.`;
const infoEmbedColors = {
  menu: 0x3b82f6,
  overview: 0x06b6d4,
  privacy: 0x8b5cf6,
  howToUse: 0xf59e0b,
  costs: 0x22c55e
};
const legacySupportTicketCodes = new Set(['bug', 'setup', 'license', 'billing', 'data']);

const invInfo = [
  {
    code: 'ik',
    label: `Why SparxSolver?`,
    style: ButtonStyle.Secondary,
    embed: {
      title: `SparxSolver - Why use us?`,
      description: [
`SparxSolver is the fastest, most accurate, and most secure way to solve your homework as fast as possible.

We use the best ChatGPT models and have our servers located in the UK for the best performance and security for our users.

Unlike other homework solvers, we never store your personal data, the only thing we use is a screenshot of the question sent directly to ChatGPT and your Patreon email address which is linked to your license key for security purposes.

We make consistent improvements and updates while listening to your suggestions.`
      ].join('\n'),
      color: infoEmbedColors.overview
    }
  },
  {
    code: 'pp',
    label: `Privacy`,
    style: ButtonStyle.Secondary,
    embed: {
      title: `SparxSolver - Privacy`,
      description: [
`SparxSolver stores your license key locally in Chrome using \`chrome.storage.local\`.

When you press Solve or Help, the extension captures the visible tab and sends the screenshot, action, question fingerprint, and license key to the Cloudflare Worker. The Worker sends the screenshot to OpenAI so it can generate the answer or help response.

Screenshots are not stored by the Worker. Generated answer text may be cached briefly for identical-question rate limiting, using hashed keys and a short expiry.

Bot and Worker logging is designed to redact secrets, bearer tokens, license-key-shaped values, and screenshot data URLs.

${privacyRightsText} ${privacyContactText}`
      ].join('\n'),
      color: infoEmbedColors.privacy
    }
  },
  {
    code: 'kl',
    label: `How to use?`,
    style: ButtonStyle.Secondary,
    embed: {
      title: `SparxSolver - How to use?`,
      description: [
`Once you have bought a SparxSolver plan on Patreon (${urls.patreon}) and have your SparxSolver key (<#1510722835356582049>), download the extension from GitHub (https://github.com/SparxSolver/SparxSolver/releases/latest) and extract the zip file.

Then go to your browser, type \`chrome://extensions\` in the address bar, turn on Developer Mode, and load the unpacked extension.

Then go to https://maths.sparx-learning.com/ and go to a homework question. Put your key in the SparxSolver card and press Solve to get the answer to the question.

If you need further help with this please open a ticket: (<#1510722809511547000>).`
      ].join('\n'),
      color: infoEmbedColors.howToUse
    }
  },
  {
    code: 'cf',
    label: `Costs`,
    style: ButtonStyle.Secondary,
    embed: {
      title: `SparxSolver - Costs`,
      description: [`
**__Profit__** (if user buys £10):
- [[Web]](https://support.patreon.com/hc/en-gb/articles/27991664769677-How-iOS-in-app-purchases-work-on-Patreon) +£8.61 (-£0.80 patreon platform fee, -£0.59 payment processing fee).
- [[iOS]](https://support.patreon.com/hc/en-gb/articles/27991664769677-How-iOS-in-app-purchases-work-on-Patreon) +£6.20 (-£0.80 patreon platform fee, -£3.00 apples app store fee).
(we encourage you to buy on the web for the best support otherwise it would cost us more and we would have to raise the price for ios users)

**__Loss__** (monthly costs):
- [[API]](https://developers.openai.com/api/docs/pricing) -£10 ChatGPT API costs.
- [[VPS]](https://www.ovhcloud.com/en-gb/) -£5 VPS Hosting for the backend, worker and discord bot.

> We try to be as transparent as possible about where our money goes, your money is safe through patreon and we do not have access to any personal data.
> All money made from SparxSolver goes back into it to cover costs and fund development.`
      ].join('\n'),
      color: infoEmbedColors.costs,
      image: 'https://support.patreon.com/hc/article_attachments/29912946161933'
    }
  }
];

const msgTickets = {
  code: 'msg_tickets',
  kind: 'support_panel',
  channelId: ids.ch.tickets,
  openLabel: `Create Ticket`,
  infoLabel: `Information`,
  ticketName: `support`,
  channelPrefix: `support`,
  ticketType: `support`,
  staffRoleIds: [],
  startText: `Hello <@{userId}>. Please describe what you need help with, what you tried, and what happened. This is a private staff ticket, but do not paste full license keys, card details, passwords, or private account data unless staff asks for a safe partial detail.`,
  embed: {
    title: `SparxSolver Support`,
    description: [
`Open a ticket so we can help support you with any issues.

The information button below can also help you with this.

Our invite link is: ${urls.invite}`
    ].join('\n'),
    color: 0x5865f2
  }
};

const msgSet = {
  code: 'msg_set',
  kind: 'setup',
  channelId: ids.ch.setup,
  setupButtonLabel: `Setup SparxSolver`,
  embed: {
    title: `Setup SparxSolver`,
    description: [`
      Use this channel to get SparxSolver ready after buying a plan.

      Open the Setup Guide below to get started.
    `].join('\n'),
    color: 0x0075ff
  }
};

const setupPgs = [
  {
    title: `1. Buy a Plan`,
    description: [`
Buy any one of our plans from our [Patreon](${urls.patreon}):

[[*]](https://discord.com/channels/1486793780391575693/1510723223036366909) **Premium**: [£10 / month](https://www.patreon.com/checkout/SparxxSolver?rid=28354812)
> GPT-5.5 with the highest quality responses, all features, full homework analysis, and full access.

[[*]](https://discord.com/channels/1486793780391575693/1510722873214373898) **Pro**: [£5 / month](https://www.patreon.com/checkout/SparxxSolver?rid=28354808)
> GPT-5.5 with the best performance, discord features, and stronger responses.

[[*]](https://discord.com/channels/1486793780391575693/1510722861038567434) **Basic**: [£3 / month](https://www.patreon.com/checkout/SparxxSolver?rid=28354798)
> GPT-5.4 with better pricing and a sharper accuracy.

[[*]](https://discord.com/channels/1486793780391575693/1510722848417910826) **Affordable**: [£1 / month](https://www.patreon.com/checkout/SparxxSolver?rid=28320508)
> GPT-5.4 mini with the lowest price possible and the fastest responses.
`].join('\n')
  },
  {
  title: `2. Get Your Key`,
  description: [`
    Press the button in the <#${ids.ch.keyAll}> channel and enter the email you used to buy the plan.
    `].join('\n'),
    image: 'https://cdn.discordapp.com/attachments/1491945158009425942/1502759606739275896/image.png?ex=6a00e172&is=69ff8ff2&hm=1b5155f19c8f21876f05c2f6809ad5fa5348633f082552e7aac0e71a6f450776'
  },
  {
    title: `3. Download the Extension`,
    description: [`
1. Download the extension from our GitHub: [[Click here]](https://github.com/SparxSolver/SparxSolver/releases/tag/SparxSolver)
2. Extract the zip file
3. Then go to your browser
4. type \`chrome://extensions\` in the address bar
5. turn on Developer Mode
6. and load the unpacked extension.

Make sure your screen looks identical to the one below:
`].join('\n'),
    image: 'https://cdn.discordapp.com/attachments/1491945158009425942/1502684969275756574/Untitled58_20260509165135.png?ex=6a009bef&is=69ff4a6f&hm=91b22c9ab93973a568fbc065377d438eed63cdeff1d17476aa4fe4f64eae0ba8'
  },
  {
    title: `Setup Complete!`,
    description: [
`Done! Now you can use the SparxSolver extension. If you have any issues with setting SparxSolver up, [open a ticket here](https://discord.com/channels/1486793780391575693/1510722809511547000).

Thanks for using SparxSolver <3`
    ].join('\n')
  }
];

function getTierCp(tierKey) {
  const cpByTier = {
    affordable: [
`SparxSolver Affordable uses ChatGPT's GPT-5.4 mini for responses with the cheapest pricing possible and a fast, reliable experience.

Plan details:
- £1 / month
- GPT-5.4 mini
- High reasoning
- Fast use
- 400K Context window

Buy the plan on [Patreon](${urls.patreon}), then use the button below to get your key.
If you're buying a key for someone else, use their email.`
    ].join('\n'),
    basic: [
`SparxSolver Basic uses ChatGPT's GPT-5.4 for better responses while keeping the pricing cheap and the speed fast.

Plan details:
- £3 / month
- GPT-5.4
- Extra high reasoning
- Super fast use
- 1M Context window

Buy the plan on [Patreon](${urls.patreon}), then use the button below to get your key.
If you're buying a key for someone else, use their email.`
    ].join('\n'),
    pro: [
`SparxSolver Pro uses ChatGPT's GPT-5.5 for stronger responses, super fast performance, and better update access.

Plan details:
- £5 / month
- GPT-5.5
- Extra high reasoning
- Instant use
- 1M Context window

Buy the plan on [Patreon](${urls.patreon}), then use the button below to get your key.
If you're buying a key for someone else, use their email.`
    ].join('\n'),
    premium: [
`SparxSolver Premium uses ChatGPT's Latest model for the highest-quality responses, instant speed, and top-priority treatment.

Plan details:
- £10 / month
- Best available AI model
- The highest reasoning
- Instant use
- Unlimited Context window

Buy the plan on [Patreon](${urls.patreon}), then use the button below to get your key.
If you're buying a key for someone else, use their email.`
    ].join('\n')
  };

  return cpByTier[tierKey] || cpByTier.affordable;
}

function mkKeyMsg({ code, channelId, tierKey, tierName, buttonLabel, color }) {
  const imgByTier = {
    affordable: 'https://cdn.discordapp.com/attachments/1491945158009425942/1503424735130943558/Screenshot_20260511_164405_Chrome.jpg?ex=6a034ce5&is=6a01fb65&hm=9f6bf9026aab3ca6ea1aea3da15a39ea809693ed450cfc6434d9e88d8949b974&',
    basic: 'https://cdn.discordapp.com/attachments/1491945158009425942/1503424734774431754/Screenshot_20260511_164407_Chrome.jpg?ex=6a034ce5&is=6a01fb65&hm=09cd6389c4a9d8f4769f6941ad5df0eb9ad2d8f84c457bb9fe6247903d234399&',
    pro: 'https://cdn.discordapp.com/attachments/1491945158009425942/1503424734438752317/Screenshot_20260511_164411_Chrome.jpg?ex=6a034ce4&is=6a01fb64&hm=a5b0c456d95bcaf0b5fdb22228566387780942df8dc5e5f2822ffe7340665342&',
    premium: 'https://cdn.discordapp.com/attachments/1491945158009425942/1503424734103076964/Screenshot_20260511_164412_Chrome.jpg?ex=6a034ce4&is=6a01fb64&hm=7cbf1d43a5a7d2e3ab5b264cd2d547e25b80fafc956f4203cba1dfc4183029e0&'
  };

  return {
    code,
    kind: 'key',
    channelId,
    tierKey,
    tierName,
    buttonLabel,
    embed: {
      title: `SparxSolver ${tierName}`,
      description: getTierCp(tierKey),
      color,
      image: imgByTier[tierKey]
    }
  };
}

const msgKeys = [
  mkKeyMsg({
    code: 'key_aff',
    channelId: ids.ch.keyAff,
    tierKey: 'affordable',
    tierName: `Affordable`,
    buttonLabel: `Show Affordable Key`,
    color: 0xf1c40f
  }),
  mkKeyMsg({
    code: 'key_bas',
    channelId: ids.ch.keyBas,
    tierKey: 'basic',
    tierName: `Basic`,
    buttonLabel: `Show Basic Key`,
    color: 0xe67e22
  }),
  mkKeyMsg({
    code: 'key_pro',
    channelId: ids.ch.keyPro,
    tierKey: 'pro',
    tierName: `Pro`,
    buttonLabel: `Show Pro Key`,
    color: 0x1abc9c
  }),
  mkKeyMsg({
    code: 'key_prm',
    channelId: ids.ch.keyPrm,
    tierKey: 'premium',
    tierName: `Premium`,
    buttonLabel: `Show Premium Key`,
    color: 0x3498db
  })
];

const msgKeyAll = {
  code: 'key_all',
  kind: 'key',
  channelId: ids.ch.keyAll,
  tierName: `Key Lookup`,
  buttonLabel: `Show My Key`,
  lookupTierKeys: universalLookupTierKeys,
  embed: {
    title: `Key Lookup`,
    description: [
`Use this button to get your SparxSolver license key from any plan.

Enter the email you used on Patreon. This lookup checks Premium, Pro, Basic, and Affordable automatically.`
    ].join('\n'),
    color: 0x5865f2
  }
};

const msgIss = {
  code: 'iss_panel',
  kind: 'issue_panel',
  channelId: ids.ch.issues,
  hideOpenButton: true,
  openLabel: `Report an Issue`,
  staffRoleIds: [],
  startText: `Hello <@{userId}>, please use <#${ids.ch.tickets}> to create a support ticket.`,
  embed: {
    title: `SparxSolver - Service Status`,
    description: [
`Use <#${ids.ch.tickets}> for support tickets.

Use **Check All Status** here for a private live status report.`
    ].join('\n'),
    color: 0xe91e63
  },
  actions: [
    {
      code: 'sts',
      label: `Check All Status`,
      style: ButtonStyle.Secondary,
      seed: `Initializing Status Checks...`
    }
  ]
};

const errorCodeDefs = [
  {
    code: '1',
    label: `! PLEASE READ ! rare empty answer`,
    summary: `OpenAI returned no visible answer after the Worker retry attempts, so SparxSolver showed its readable fallback message.`,
    detail: `Check Worker logs for "OpenAI returned empty answer text", the recovery attempt model, finish_reason, token usage, and whether every retry returned no text. Ask for a screenshot only if the fallback says the question was unreadable.`
  },
  {
    code: '2',
    label: `Invalid action`,
    summary: `The extension sent an action the Worker does not support.`,
    detail: `Update the extension, then check the request action value. Supported solve actions are the ones accepted by the Worker.`
  },
  {
    code: '3',
    label: `Invalid screenshot`,
    summary: `The screenshot payload was missing, malformed, or too large.`,
    detail: `Ask the user to refresh Sparx and try again. If repeated, check the extension capture output and MAX_SCREENSHOT_CHARS in the Worker.`
  },
  {
    code: '4',
    label: `Bookwork help blocked`,
    summary: `The user tried to use Help on a bookwork check, which the Worker blocks.`,
    detail: `Tell the user to use the answer-only bookwork flow instead of Help.`
  },
  {
    code: '5',
    label: `Invalid license`,
    summary: `The license key was not found or is not a valid stored license.`,
    detail: `Ask the user to copy the key again. If it still fails, check the license:<key> KV record.`
  },
  {
    code: '6',
    label: `Expired license`,
    summary: `The license exists but its expires timestamp is in the past.`,
    detail: `Confirm the Patreon membership or manually inspect the license record expiration.`
  },
  {
    code: '7',
    label: `AI not configured`,
    summary: `The Worker does not have an OpenAI API key configured.`,
    detail: `Check the Worker dashboard secrets and make sure OPENAI_API_KEY is set on the deployed Worker.`
  },
  {
    code: '8',
    label: `Same question/local rate limit`,
    summary: `The extension blocked a repeated or too-frequent solve request before it reached the Worker.`,
    detail: `Ask the user to wait about a minute, then try again. If they were clicking Solve or Help repeatedly, ask them to wait for the current request to finish before sending another one.`
  },
  {
    code: '9',
    label: `AI unreachable`,
    summary: `The Worker could not reach OpenAI.`,
    detail: `Check Cloudflare Worker egress, OpenAI status, DNS, and request timeout logs.`
  },
  {
    code: '10',
    label: `AI model unavailable`,
    summary: `The selected plan model is not available to the OpenAI key right now.`,
    detail: `Check model access for the configured OpenAI project and whether the model name in the Worker is still valid.`
  },
  {
    code: '11',
    label: `AI rate limited`,
    summary: `OpenAI returned a rate-limit response for the current request.`,
    detail: `Check OpenAI project limits, usage, and retry timing before asking the user to try again.`
  },
  {
    code: '12',
    label: `AI auth failed`,
    summary: `OpenAI rejected the configured API key.`,
    detail: `Check that OPENAI_API_KEY is valid, active, and belongs to the intended OpenAI project.`
  },
  {
    code: '13',
    label: `AI provider error`,
    summary: `OpenAI returned an upstream error that did not match a more specific code.`,
    detail: `Check the Worker log message for the upstream status and provider error text.`
  },
  {
    code: '14',
    label: `Browser capture quota`,
    summary: `Chrome blocked the extension because too many visible-tab captures were requested too quickly.`,
    detail: `Ask the user to wait a few seconds and try again. If this repeats, check whether they are clicking Solve or Help repeatedly before the previous request finishes.`
  },
  {
    code: '15',
    label: `No license key`,
    summary: `The extension could not find a saved local license key before sending the request.`,
    detail: `Ask the user to enter their SparxSolver key again. If the key was removed after an auth failure, validate it from the setup/key flow.`
  },
  {
    code: '16',
    label: `Server error`,
    summary: `The Worker returned an unexpected server-side failure or a response the extension could not treat as successful.`,
    detail: `Check Worker logs around the request time, then verify license lookup, OpenAI access, and route compatibility.`
  },
  {
    code: '17',
    label: `Extension runtime error`,
    summary: `The Chrome extension failed before or during the request for a reason that is not covered by a more specific extension code.`,
    detail: `Ask the user to refresh the Sparx page and retry. If repeated, inspect the extension service-worker console and content-script console.`
  },
  {
    code: '18',
    label: `Invalid key format`,
    summary: `The entered key did not match the expected SparxSolver key format.`,
    detail: `Ask the user to copy the key again from Discord key lookup. Keys should use the short grouped format shown by the bot.`
  },
  {
    code: '19',
    label: `Validation network error`,
    summary: `The extension could not reach the Worker while validating a key.`,
    detail: `Ask the user to check their connection and retry. If multiple users report it, check Worker availability and Cloudflare status.`
  }
];

const errorCodeByCode = new Map(errorCodeDefs.map(def => [def.code, def]));

function getExtensionBackgroundPath() {
  return path.resolve(__dirname, '..', 'SparxSolver 1.3.2', 'background.js');
}

function readExtensionErrorCodes(filePath = getExtensionBackgroundPath()) {
  if (!fs.existsSync(filePath)) {
    return {
      filePath,
      codes: [],
      skipped: true,
      reason: 'extension background.js was not found'
    };
  }

  const source = fs.readFileSync(filePath, 'utf8');
  const match = source.match(/const\s+EXTENSION_ERROR_CODES\s*=\s*\{([\s\S]*?)\};/);
  if (!match) {
    return {
      filePath,
      codes: [],
      skipped: true,
      reason: 'EXTENSION_ERROR_CODES was not found'
    };
  }

  const codes = [...match[1].matchAll(/\b([A-Z0-9_]+)\s*:\s*(\d+)\s*,?/g)]
    .map(result => ({
      name: result[1],
      code: result[2]
    }));

  return {
    filePath,
    codes,
    skipped: false,
    reason: ''
  };
}

function verifyErrorCodeDropdownCoverage() {
  const extensionCodes = readExtensionErrorCodes();
  const dropdownCodes = new Set(errorCodeDefs.map(def => def.code));
  const missing = extensionCodes.codes.filter(def => !dropdownCodes.has(def.code));

  if (extensionCodes.skipped) {
    console.warn(`Extension error-code coverage skipped: ${extensionCodes.reason} (${extensionCodes.filePath}).`);
  } else if (missing.length > 0) {
    console.warn(`Extension error codes missing from dropdown: ${missing.map(def => `${def.name}=${def.code}`).join(', ')}.`);
  } else {
    console.log(`Error dropdown covers extension error codes: ${extensionCodes.codes.map(def => def.code).join(', ')}.`);
  }

  return {
    ...extensionCodes,
    missing
  };
}

const msgErr = {
  code: 'error_logs',
  kind: 'error_log_panel',
  channelId: ids.ch.errorLogs,
  embed: {
    title: `SparxSolver - Error Logs`,
    description: [
`Use this channel for backend, bot, extension, and license-worker error logs.

Available error codes:
${errorCodeDefs.map(def => `- \`${def.code}\` ${def.label}`).join('\n')}

Select an error code below to see what it means and what to check first.`
    ].join('\n'),
    color: 0xef4444
  }
};

// Managed message refresh order. Keep this in the same channel order as the server layout.
const msgAll = [
  msgTickets,
  msgSet,
  msgKeyAll,
  msgKeys[0],
  msgKeys[1],
  msgKeys[2],
  msgKeys[3],
  msgIss,
  msgErr
];

const keyByCh = new Map([...msgKeys, msgKeyAll].map(def => [def.channelId, def]));
const invInfoByCd = new Map(invInfo.map(def => [def.code, def]));
const issByCh = new Map([
  [msgTickets.channelId, msgTickets],
  [msgIss.channelId, msgIss]
]);
const issActByCd = new Map(msgIss.actions.map(def => [def.code, def]));

const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages
  ]
});

function requireEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    throw new Error(`${name} is missing from .env`);
  }
  return value;
}

function mkEmb(embDef, extraBottom = '') {
  const desc = extraBottom
    ? `${embDef.description}\n\n${extraBottom}`
    : embDef.description;

  const emb = new EmbedBuilder()
    .setTitle(embDef.title)
    .setDescription(desc)
    .setColor(embDef.color)
    .setFooter({ text: ver });

  if (embDef.image) {
    emb.setImage(embDef.image);
  }

  return emb;
}

function mkSetupEmb(pgIdx) {
  const safeIdx = Math.max(0, Math.min(pgIdx, setupPgs.length - 1));
  const pg = setupPgs[safeIdx];

  const emb = new EmbedBuilder()
    .setTitle(pg.title)
    .setDescription(pg.description)
    .setColor(0x0075ff)
    .setFooter({ text: ver });

  if (pg.image) {
    emb.setImage(pg.image);
  }

  return emb;
}

function mkSetupRow(pgIdx) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${cid.setupPage}:${pgIdx - 1}`)
      .setLabel(`<`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pgIdx <= 0),
    new ButtonBuilder()
      .setCustomId(`${cid.setupPage}:${pgIdx + 1}`)
      .setLabel(`>`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pgIdx >= setupPgs.length - 1)
  );
}

function mkSetupPayload(pgIdx) {
  const safeIdx = Math.max(0, Math.min(pgIdx, setupPgs.length - 1));

  return {
    embeds: [mkSetupEmb(safeIdx)],
    components: [mkSetupRow(safeIdx)]
  };
}

function mkInfoRow(infoDefs) {
  return new ActionRowBuilder().addComponents(
    ...infoDefs.slice(0, 5).map(def =>
      new ButtonBuilder()
        .setCustomId(`${cid.infoBtn}:${def.code}`)
        .setLabel(def.label)
        .setStyle(def.style || ButtonStyle.Secondary)
    )
  );
}

function mkInfoMenuPayload() {
  return {
    embeds: [mkEmb({
      title: `SparxSolver Information`,
      description: `Choose what you want to read. This reply is private.`,
      color: infoEmbedColors.menu
    })],
    components: [mkInfoRow(invInfo)]
  };
}

function mkSupportPanelRow(issueDef) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${cid.issueOpen}:${issueDef.channelId}`)
      .setLabel(issueDef.openLabel || `Create Ticket`)
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(cid.infoMenu)
      .setLabel(issueDef.infoLabel || `Information`)
      .setStyle(ButtonStyle.Secondary)
  );
}

function getCustomIdSegments(customId, ...prefixes) {
  const parts = String(customId || '').split(':');
  return prefixes.includes(parts[0]) ? parts.slice(1) : null;
}

function isExactCustomId(customId, ...idsToMatch) {
  const id = String(customId || '');
  return idsToMatch.includes(id);
}

function getCustomIdCode(customId, ...prefixes) {
  const segments = getCustomIdSegments(customId, ...prefixes);
  return segments ? String(segments[0] || '').trim() : null;
}

function getIssueOpenCustomId(ticketDef) {
  return ticketDef.code
    ? `${cid.issueOpen}:${ticketDef.channelId}:${ticketDef.code}`
    : `${cid.issueOpen}:${ticketDef.channelId}`;
}

function parseIssueOpenCustomId(customId) {
  const segments = getCustomIdSegments(customId, cid.issueOpen, legacyCid.issueOpen);
  if (!segments) {
    return { issueChannelId: '', ticketCode: '' };
  }

  const cleanSegments = segments
    .map(part => String(part || '').trim())
    .filter(Boolean);
  const ticketCodes = new Set(getAllTicketButtonDefs().map(def => def.code).filter(Boolean));
  const ticketCode = cleanSegments.find(segment => ticketCodes.has(segment)) || '';
  const knownIssueChannelId = cleanSegments.find(segment => issByCh.has(segment)) || '';

  return {
    issueChannelId: knownIssueChannelId ||
      cleanSegments.find(segment => !ticketCodes.has(segment) && !legacySupportTicketCodes.has(segment)) ||
      '',
    ticketCode
  };
}

function mkIssOpenButton(ticketDef) {
  return new ButtonBuilder()
    .setCustomId(getIssueOpenCustomId(ticketDef))
    .setLabel(ticketDef.label || `Create a Ticket`)
    .setStyle(ticketDef.style || ButtonStyle.Primary);
}

function mkIssPanelRow(issueDef) {
  const buttons = [];

  if (!issueDef.hideOpenButton) {
    if (Array.isArray(issueDef.ticketButtons) && issueDef.ticketButtons.length > 0) {
      buttons.push(...issueDef.ticketButtons.slice(0, 5).map(mkIssOpenButton));
    } else {
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`${cid.issueOpen}:${issueDef.channelId}`)
          .setLabel(issueDef.openLabel)
          .setStyle(ButtonStyle.Primary)
      );
    }
  }

  for (const actionDef of issueDef.actions.slice(0, 4)) {
    if (buttons.length >= 5) {
      break;
    }

    buttons.push(
      new ButtonBuilder()
        .setCustomId(`${cid.issueStat}:${issueDef.channelId}:${actionDef.code}`)
        .setLabel(actionDef.label)
        .setStyle(actionDef.style || ButtonStyle.Secondary)
    );
  }

  return new ActionRowBuilder().addComponents(...buttons);
}

function mkIssOpenRows(ticketDefs) {
  const rows = [];
  const safeDefs = ticketDefs.slice(0, 25);

  for (let idx = 0; idx < safeDefs.length; idx += 5) {
    rows.push(
      new ActionRowBuilder().addComponents(
        ...safeDefs.slice(idx, idx + 5).map(mkIssOpenButton)
      )
    );
  }

  return rows;
}

function mkIssOpenRow(ticketDef) {
  return mkIssOpenRows([ticketDef])[0];
}

function mkIssDelRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(cid.issueDelete)
      .setLabel(`Delete Ticket`)
      .setStyle(ButtonStyle.Danger)
  );
}

function mkErrCodeRow() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(cid.errorCodeSelect)
      .setPlaceholder(`Select an error code`)
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(errorCodeDefs.map(def => ({
        label: `Code ${def.code}: ${def.label}`.slice(0, 100),
        description: def.summary.slice(0, 100),
        value: def.code
      })))
  );
}

function mkErrCodeEmbed(def) {
  return mkEmb({
    title: `Error code ${def.code}: ${def.label}`,
    description: [
`Error code: \`${def.code}\`

Meaning:
${def.summary}

What to check:
${def.detail}`
    ].join('\n'),
    color: 0xef4444
  });
}

function mkMsgPayload(msgDef, extraBottom = '') {
  const rows = [];
  const embDefs = Array.isArray(msgDef.embeds) && msgDef.embeds.length > 0
    ? msgDef.embeds
    : [msgDef.embed].filter(Boolean);

  if (msgDef.kind === 'setup') {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(cid.setupBtn)
          .setLabel(msgDef.setupButtonLabel)
          .setStyle(ButtonStyle.Primary)
      )
    );
  }

  if (msgDef.kind === 'key') {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(cid.keyBtn)
          .setLabel(msgDef.buttonLabel)
          .setStyle(ButtonStyle.Primary)
      )
    );
  }

  if (msgDef.kind === 'issue_panel') {
    rows.push(mkIssPanelRow(msgDef));
  }

  if (msgDef.kind === 'error_log_panel') {
    rows.push(mkErrCodeRow());
  }

  if (msgDef.kind === 'support_panel') {
    rows.push(mkSupportPanelRow(msgDef));
  }

  if (msgDef.ticketButton) {
    rows.push(mkIssOpenRow(msgDef.ticketButton));
  }

  if (Array.isArray(msgDef.ticketButtons) && msgDef.ticketButtons.length > 0) {
    rows.push(...mkIssOpenRows(msgDef.ticketButtons));
  }

  if (Array.isArray(msgDef.infoButtons) && msgDef.infoButtons.length > 0) {
    rows.push(mkInfoRow(msgDef.infoButtons));
  }

  return {
    embeds: embDefs.map((embDef, idx) =>
      mkEmb(embDef, idx === embDefs.length - 1 ? extraBottom : '')
    ),
    ...(rows.length > 0 ? { components: rows } : {})
  };
}

function getManagedMessageParts(msgDef) {
  if (!Array.isArray(msgDef.messages) || msgDef.messages.length === 0) {
    return [msgDef];
  }

  return msgDef.messages.map((partDef, idx) => ({
    ...partDef,
    code: partDef.code || `${msgDef.code}_${idx + 1}`,
    kind: partDef.kind || msgDef.kind,
    channelId: partDef.channelId || msgDef.channelId
  }));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function clrMsgCh(channel) {
  while (true) {
    const batch = await channel.messages.fetch({ limit: 100 });

    if (batch.size === 0) {
      return;
    }

    const del = batch.filter(msg => msg.deletable);

    if (del.size === 0) {
      throw new Error(`Channel ${channel.id} still has ${batch.size} message(s), but none are deletable by the bot.`);
    }

    const fresh = del.filter(msg => Date.now() - msg.createdTimestamp < cfg.purgeAgeMs);
    const stale = del.filter(msg => Date.now() - msg.createdTimestamp >= cfg.purgeAgeMs);

    let rm = 0;

    if (fresh.size > 0 && typeof channel.bulkDelete === 'function') {
      const deletedBatch = await channel.bulkDelete(fresh, true).catch(() => null);
      rm += deletedBatch?.size ?? 0;
    }

    for (const msg of stale.values()) {
      const ok = await msg.delete().then(() => true).catch(() => false);

      if (ok) {
        rm += 1;
      }
    }

    if (rm === 0) {
      throw new Error(`Channel ${channel.id} could not be cleared. Remaining fetched messages: ${batch.size}.`);
    }

    await sleep(cfg.purgeRetryMs);
  }
}

async function refMsg(msgDef) {
  const channel = await bot.channels.fetch(msgDef.channelId);

  if (!channel || !channel.isTextBased() || typeof channel.send !== 'function') {
    throw new Error(`Channel ${msgDef.channelId} is missing or is not a text channel.`);
  }

  await clrMsgCh(channel);

  for (const partDef of getManagedMessageParts(msgDef)) {
    await channel.send(mkMsgPayload(partDef));
  }
}

async function refAllMsgs() {
  let refreshed = 0;
  const failures = [];

  for (const msgDef of msgAll) {
    try {
      await refMsg(msgDef);
      refreshed += 1;
    } catch (err) {
      failures.push(`${msgDef.channelId}: ${formatErr(err, 90)}`);
    }
  }

  console.log(`Managed messages: ${refreshed}/${msgAll.length} refreshed${failures.length ? `, ${failures.length} failed` : ''}.`);

  if (failures.length > 0) {
    console.warn(`Managed message failures: ${compactText(failures.join('; '), 240)}`);
  }
}

async function runHttpProbe(url, label) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.httpTimeoutMs);
  const startedAt = Date.now();

  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: ctrl.signal
    });

    const preview = await readResponsePreview(res, 120);

    return {
      label,
      ok: res.ok,
      status: res.status,
      ms: Date.now() - startedAt,
      preview
    };
  } catch (err) {
    return {
      label,
      ok: false,
      status: 'ERR',
      ms: Date.now() - startedAt,
      preview: err instanceof Error ? err.message : 'Unknown error'
    };
  } finally {
    clearTimeout(timer);
  }
}

async function readResponsePreview(response, maxChars = 500) {
  try {
    if (!response.body || typeof response.body.getReader !== 'function') {
      return compactText(await response.text(), maxChars);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = '';

    while (text.length < maxChars) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      text += decoder.decode(value, { stream: true });
    }

    text += decoder.decode();
    if (text.length >= maxChars) {
      await reader.cancel().catch(() => {});
    }

    return compactText(text, maxChars);
  } catch {
    return '';
  }
}

async function runCloudflareStatusProbe(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.httpTimeoutMs);
  const startedAt = Date.now();

  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: ctrl.signal
    });
    const data = await res.json().catch(() => null);
    const indicator = String(data?.status?.indicator || '').trim();
    const description = String(data?.status?.description || '').trim();

    return {
      url,
      ok: res.ok && indicator === 'none',
      status: res.status,
      ms: Date.now() - startedAt,
      indicator: indicator || 'unknown',
      description: description || `No status description returned`
    };
  } catch (err) {
    return {
      url,
      ok: false,
      status: 'ERR',
      ms: Date.now() - startedAt,
      indicator: 'unknown',
      description: err instanceof Error ? err.message : `Unknown error`
    };
  } finally {
    clearTimeout(timer);
  }
}

function compactText(value, maxLen = 120) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLen ? `${text.slice(0, maxLen - 3)}...` : text;
}

function redactSensitiveText(value) {
  let text = String(value || '');
  const knownSecrets = [
    process.env.TOKEN,
    process.env.LICENSE_WORKER_SECRET,
    process.env.WORKER_ADMIN_SECRET,
    process.env.OPENAI_API_KEY,
    process.env.PATREON_CREATOR_ACCESS_TOKEN,
    process.env.PATREON_CREATOR_REFRESH_TOKEN,
    process.env.PATREON_CLIENT_SECRET
  ]
    .map(secret => String(secret || '').trim())
    .filter(secret => secret.length >= 8);

  for (const secret of knownSecrets) {
    text = text.split(secret).join('[redacted-secret]');
  }

  return text
    .replace(/\b[A-Z0-9]{4}-[A-Z0-9]{4}\b/g, '[redacted-license]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/\b(?:token|secret|api[_-]?key|access[_-]?token|refresh[_-]?token)\b\s*[:=]\s*["']?[^"',\s}]+/gi, match => {
      const separator = match.includes(':') ? ':' : '=';
      const name = match.split(separator)[0].trim();
      return `${name}${separator} [redacted]`;
    });
}

function formatErr(err, maxLen = 160) {
  return compactText(redactSensitiveText(err?.message || err), maxLen);
}

function logShortErr(label, err, maxLen = 160) {
  console.error(`${label}: ${formatErr(err, maxLen)}`);
}

function isStaleInteractionErr(err) {
  const text = formatErr(err, 220);
  return err?.code === 10062 ||
    err?.code === 40060 ||
    /Unknown interaction|already been acknowledged/i.test(text);
}

async function safeInteractionCall(label, fn) {
  try {
    return await fn();
  } catch (err) {
    if (isStaleInteractionErr(err)) {
      console.warn(`${label}: stale Discord interaction ignored (${formatErr(err, 120)}).`);
      return null;
    }

    throw err;
  }
}

async function safeReply(interaction, payload, label = 'Reply failed') {
  if (interaction.deferred || interaction.replied) {
    return safeEditReply(interaction, payload, label);
  }

  return safeInteractionCall(label, () => interaction.reply(payload));
}

async function safeDeferReply(interaction, payload, label = 'Defer reply failed') {
  if (interaction.deferred || interaction.replied) {
    return true;
  }

  const result = await safeInteractionCall(label, () => interaction.deferReply(payload));
  return result !== null;
}

async function safeEditReply(interaction, payload, label = 'Edit reply failed') {
  return safeInteractionCall(label, () => interaction.editReply(payload));
}

async function safeUpdate(interaction, payload, label = 'Update failed') {
  return safeInteractionCall(label, () => interaction.update(payload));
}

function formatPercent(value) {
  const pct = Number(value);
  return Number.isFinite(pct) ? `${pct.toFixed(pct >= 10 ? 0 : 1)}%` : `unavailable`;
}

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const parts = [];

  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (!parts.length) parts.push(`${secs}s`);

  return parts.slice(0, 3).join(' ');
}

function formatDiscordTimestamp(ms) {
  const unix = Math.floor(ms / 1000);
  return `<t:${unix}:F> (<t:${unix}:R>)`;
}

function formatIssueExpiry(delAtUnix) {
  return `<t:${delAtUnix}:F> (<t:${delAtUnix}:R>). Unix: \`${delAtUnix}\``;
}

function normalizeTicketSlug(value, fallback = cfg.issuePrefix) {
  const clean = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);

  if (clean) {
    return clean;
  }

  return String(fallback || cfg.issuePrefix)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || cfg.issuePrefix;
}

function getTicketContext(issueDef, ticketDef = null) {
  const fallbackPrefix = issueDef?.channelPrefix || issueDef?.ticketPrefix || cfg.issuePrefix;
  const channelPrefix = normalizeTicketSlug(
    ticketDef?.channelPrefix || ticketDef?.ticketPrefix || ticketDef?.code || fallbackPrefix,
    fallbackPrefix
  );
  const ticketType = normalizeTicketSlug(
    ticketDef?.ticketType || ticketDef?.code || channelPrefix,
    channelPrefix
  );

  return { channelPrefix, ticketType };
}

function buildIssueTopic(ownId, delAtUnix, warned = false, ticketType = cfg.issuePrefix) {
  const type = normalizeTicketSlug(ticketType);
  return `${cfg.issueTopicPrefix}${ownId};type:${type};delete-at:${Math.floor(delAtUnix)};warned:${warned ? 1 : 0}`;
}

function parseIssueTopic(topic) {
  const text = String(topic || '').trim();

  if (!text.startsWith(cfg.issueTopicPrefix)) {
    return null;
  }

  const [ownId, ...parts] = text.slice(cfg.issueTopicPrefix.length).split(';');
  const meta = {
    ownId: String(ownId || '').trim(),
    type: '',
    delAtUnix: null,
    warned: false
  };

  if (!meta.ownId) {
    return null;
  }

  for (const part of parts) {
    const idx = part.indexOf(':');

    if (idx <= 0) {
      continue;
    }

    const key = part.slice(0, idx);
    const value = part.slice(idx + 1);

    if (key === 'delete-at') {
      const unix = Number(value);
      meta.delAtUnix = Number.isFinite(unix) ? Math.floor(unix) : null;
    }

    if (key === 'type') {
      meta.type = normalizeTicketSlug(value);
    }

    if (key === 'warned') {
      meta.warned = value === '1' || value === 'true';
    }
  }

  return meta;
}

function clearIssueTimers(channelId) {
  const timers = issueTimers.get(channelId);

  if (!timers) {
    return;
  }

  for (const timer of Object.values(timers)) {
    clearTimeout(timer);
  }

  issueTimers.delete(channelId);
}

function clearAllIssueTimers() {
  for (const channelId of [...issueTimers.keys()]) {
    clearIssueTimers(channelId);
  }
}

function setIssueTimer(handler, delayMs) {
  const timer = setTimeout(handler, Math.max(0, delayMs));
  timer.unref?.();
  return timer;
}

function scheduleIssueChannel(channel, ownId, delAtUnix, warned = false) {
  if (!channel?.id || !Number.isFinite(delAtUnix)) {
    return;
  }

  clearIssueTimers(channel.id);

  const delDelayMs = (delAtUnix * 1000) - Date.now();
  const timers = {};

  if (delDelayMs > 0 && !warned) {
    timers.warn = setIssueTimer(
      () => warnIssueChannel(channel.id, ownId, delAtUnix),
      delDelayMs - cfg.issueWarnBeforeDeleteMs
    );
  }

  timers.delete = setIssueTimer(
    () => autoDeleteIssueChannel(channel.id),
    delDelayMs
  );

  issueTimers.set(channel.id, timers);
}

async function setIssueTopic(channel, ownId, delAtUnix, warned) {
  if (!channel || typeof channel.setTopic !== 'function') {
    return;
  }

  const meta = parseIssueTopic(channel.topic);

  await channel.setTopic(
    buildIssueTopic(ownId, delAtUnix, warned, meta?.type || cfg.issuePrefix),
    `Update issue ticket self-destruct timer`
  ).catch(err => {
    logShortErr(`Failed to update issue ticket topic ${channel.id}`, err);
  });
}

async function warnIssueChannel(channelId, ownId, delAtUnix) {
  try {
    const channel = await bot.channels.fetch(channelId);

    if (!channel || !channel.isTextBased() || typeof channel.send !== 'function') {
      return;
    }

    await setIssueTopic(channel, ownId, delAtUnix, true);
    await channel.send(`<@${ownId}> this ticket will self destruct in 1 hour at ${formatIssueExpiry(delAtUnix)}.`);
  } catch (err) {
    logShortErr(`Failed to send issue ticket expiry warning ${channelId}`, err);
  }
}

async function autoDeleteIssueChannel(channelId) {
  try {
    const channel = await bot.channels.fetch(channelId).catch(() => null);

    if (!channel || typeof channel.delete !== 'function') {
      return;
    }

    await channel.delete('Issue ticket self-destructed after 24 hours');
  } catch (err) {
    logShortErr(`Failed to auto-delete issue ticket ${channelId}`, err);
  } finally {
    clearIssueTimers(channelId);
  }
}

async function ensureIssueExpiry(channel, ownId) {
  const meta = parseIssueTopic(channel.topic);
  const oldDelAtUnix = meta?.delAtUnix;

  if (Number.isFinite(oldDelAtUnix)) {
    scheduleIssueChannel(channel, ownId, oldDelAtUnix, meta.warned);
    return oldDelAtUnix;
  }

  const delAtUnix = Math.floor((Date.now() + cfg.issueLifetimeMs) / 1000);
  await setIssueTopic(channel, ownId, delAtUnix, false);
  scheduleIssueChannel(channel, ownId, delAtUnix, false);
  return delAtUnix;
}

async function runSystemCommand(file, args) {
  try {
    const { stdout, stderr } = await execFileAsync(file, args, {
      timeout: cfg.systemProbeTimeoutMs,
      windowsHide: true,
      maxBuffer: 128 * 1024
    });

    return {
      ok: true,
      stdout: String(stdout || ''),
      stderr: String(stderr || '')
    };
  } catch (err) {
    return {
      ok: false,
      stdout: String(err?.stdout || ''),
      stderr: compactText(err?.stderr || err?.message || 'Command failed')
    };
  }
}

function parseKeyValueOutput(output) {
  const data = {};

  for (const line of String(output || '').split(/\r?\n/)) {
    const idx = line.indexOf('=');

    if (idx > 0) {
      data[line.slice(0, idx)] = line.slice(idx + 1);
    }
  }

  return data;
}

function readCpuTimes() {
  let idle = 0;
  let total = 0;

  for (const cpu of os.cpus()) {
    idle += cpu.times.idle;
    total += Object.values(cpu.times).reduce((sum, time) => sum + time, 0);
  }

  return { idle, total };
}

async function getCpuUsagePercent() {
  const first = readCpuTimes();
  await sleep(cfg.cpuSampleMs);
  const second = readCpuTimes();
  const idleDelta = second.idle - first.idle;
  const totalDelta = second.total - first.total;

  if (totalDelta <= 0) {
    return null;
  }

  return Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100));
}

async function getDiskUsage(targetPath) {
  if (process.platform === 'win32') {
    return { path: targetPath, available: false, reason: 'not available on Windows' };
  }

  const result = await runSystemCommand('df', ['-kP', targetPath]);

  if (!result.ok) {
    return { path: targetPath, available: false, reason: result.stderr || 'df failed' };
  }

  const lines = result.stdout.trim().split(/\r?\n/);
  const parts = (lines[1] || '').trim().split(/\s+/);

  if (parts.length < 6) {
    return { path: targetPath, available: false, reason: 'unexpected df output' };
  }

  const total = Number(parts[1]) * 1024;
  const used = Number(parts[2]) * 1024;
  const free = Number(parts[3]) * 1024;
  const usedPct = Number(String(parts[4]).replace('%', ''));

  return {
    path: targetPath,
    mount: parts[5],
    available: true,
    total,
    used,
    free,
    usedPct
  };
}

async function getSystemdServiceStatus() {
  if (process.platform === 'win32') {
    return { available: false, reason: 'systemd is not available on Windows' };
  }

  const serviceName = getEnvValue('STATUS_BOT_SERVICE_NAME', getEnvValue('BOT_SERVICE_NAME', cfg.defaultBotServiceName));
  const result = await runSystemCommand('systemctl', [
    'show',
    serviceName,
    '--no-page',
    '--property=ActiveState,SubState,NRestarts'
  ]);

  if (!result.ok) {
    return { available: false, serviceName, reason: result.stderr || 'systemctl failed' };
  }

  return {
    available: true,
    serviceName,
    props: parseKeyValueOutput(result.stdout)
  };
}

function getEnvValue(name, fallback = '') {
  const value = String(process.env[name] || '').trim();
  return value || fallback;
}

function getStatusConfig() {
  return {
    botLabel: getEnvValue('STATUS_BOT_LABEL', `Discord Bot`),
    discordLabel: getEnvValue('STATUS_DISCORD_API_LABEL', `Discord API`),
    vpsLabel: getEnvValue('STATUS_VPS_LABEL', `VPS`),
    processLabel: getEnvValue('STATUS_PROCESS_LABEL', `Process Manager`),
    workerLabel: getEnvValue('STATUS_WORKER_LABEL', `License Worker`),
    cloudflareLabel: getEnvValue('STATUS_CLOUDFLARE_LABEL', `Cloudflare`),
    discordApiUrl: getEnvValue('STATUS_DISCORD_API_URL'),
    workerUrl: getEnvValue('STATUS_WORKER_URL') || getEnvValue('LICENSE_WORKER_URL'),
    cloudflareStatusUrl: getEnvValue('STATUS_CLOUDFLARE_STATUS_URL'),
    botServiceName: getEnvValue('STATUS_BOT_SERVICE_NAME', cfg.defaultBotServiceName)
  };
}

function statusWord(ok) {
  return ok ? `Operational` : `Down`;
}

function addServiceStatus(lines, services, name, ok, detail = '') {
  services.push({ name, ok });
  lines.push(`- ${name}: ${statusWord(ok)}${detail ? ` (${detail})` : ''}`);
}

function getOperationalSummary(services) {
  const total = services.length;
  const operational = services.filter(service => service.ok).length;

  if (operational === total) {
    return `All Services Operational`;
  }

  if (operational === 0) {
    return `No Services Operational`;
  }

  return `Most Services Operational`;
}

async function replyStatusLoading(interaction) {
  return safeReply(interaction, {
    content: `Checking SparxSolver status...`,
    flags: ephFlags
  }, 'Status loading reply failed').then(result => result !== null);
}

function addStatusCacheFooter(text, checkedAtMs, fromCache) {
  const nextLiveMs = checkedAtMs + cfg.statusCacheMs;

  return [
    text,
    '',
    `**Status Rate Limit**`,
    `- Source: ${fromCache ? `cached result` : `fresh live check`}`,
    `- Live checks run at most once per hour and reset when the bot restarts.`,
    `- Next live refresh: ${formatDiscordTimestamp(nextLiveMs)}`
  ].join('\n');
}

async function getIssueStatusText(issueDef, actionDef) {
  const now = Date.now();

  if (issueStatusCache.text && now - issueStatusCache.checkedAtMs < cfg.statusCacheMs) {
    return addStatusCacheFooter(issueStatusCache.text, issueStatusCache.checkedAtMs, true);
  }

  if (!issueStatusCache.inFlight) {
    issueStatusCache.inFlight = buildIssueStatusText(issueDef, actionDef)
      .then(text => {
        issueStatusCache.text = text;
        issueStatusCache.checkedAtMs = Date.now();
        return text;
      })
      .finally(() => {
        issueStatusCache.inFlight = null;
      });
  }

  const text = await issueStatusCache.inFlight;
  return addStatusCacheFooter(text, issueStatusCache.checkedAtMs, false);
}

async function buildIssueStatusText(issueDef, actionDef) {
  const nowUnix = Math.floor(Date.now() / 1000);
  const statusCfg = getStatusConfig();
  const memoryTotal = os.totalmem();
  const memoryFree = os.freemem();
  const memoryUsed = memoryTotal - memoryFree;

  const [
    workerProbe,
    cloudflareStatusProbe,
    discordApiProbe,
    cpuUsage,
    rootDisk,
    serviceStatus
  ] = await Promise.all([
    statusCfg.workerUrl ? runHttpProbe(statusCfg.workerUrl, statusCfg.workerLabel) : Promise.resolve(null),
    statusCfg.cloudflareStatusUrl ? runCloudflareStatusProbe(statusCfg.cloudflareStatusUrl) : Promise.resolve(null),
    statusCfg.discordApiUrl ? runHttpProbe(statusCfg.discordApiUrl, statusCfg.discordLabel) : Promise.resolve(null),
    getCpuUsagePercent(),
    getDiskUsage('/'),
    getSystemdServiceStatus()
  ]);

  const lines = [
    actionDef.seed,
    '',
    `Checked: <t:${nowUnix}:F>`,
    ''
  ];
  const services = [];
  const botDetails = [
    Number.isFinite(bot.ws.ping) ? `ping ${Math.round(bot.ws.ping)}ms` : '',
    `uptime ${formatDuration(process.uptime())}`
  ].filter(Boolean).join(', ');
  const discordDetails = discordApiProbe
    ? `${discordApiProbe.ms}ms`
    : `not configured`;
  const workerDetails = workerProbe
    ? `${workerProbe.ms}ms`
    : `not configured`;
  const cfDetails = cloudflareStatusProbe
    ? compactText(cloudflareStatusProbe.description, 70)
    : `not configured`;
  const storagePct = rootDisk?.available ? formatPercent(rootDisk.usedPct) : `unavailable`;
  const ramPct = memoryTotal ? formatPercent((memoryUsed / memoryTotal) * 100) : `unavailable`;
  const cpuPct = cpuUsage == null ? `unavailable` : formatPercent(cpuUsage);
  const vpsDown = (rootDisk?.available && rootDisk.usedPct >= 95) || (memoryTotal && memoryUsed / memoryTotal >= 0.95);
  const serviceOk = serviceStatus?.available
    ? serviceStatus.props.ActiveState === 'active'
    : process.platform !== 'linux';
  const restartText = serviceStatus?.available && serviceStatus.props.NRestarts
    ? `, restarts ${serviceStatus.props.NRestarts}`
    : '';

  lines.push(`**Services**`);
  addServiceStatus(lines, services, statusCfg.botLabel, bot.isReady(), botDetails);
  addServiceStatus(lines, services, statusCfg.discordLabel, Boolean(discordApiProbe?.ok), discordDetails);
  addServiceStatus(lines, services, statusCfg.vpsLabel, !vpsDown, `uptime ${formatDuration(os.uptime())}, CPU ${cpuPct}, RAM ${ramPct}, storage ${storagePct}`);
  addServiceStatus(lines, services, statusCfg.processLabel, serviceOk, serviceStatus?.available ? `running${restartText}` : `local process`);
  addServiceStatus(lines, services, statusCfg.workerLabel, Boolean(workerProbe?.ok), workerDetails);
  addServiceStatus(lines, services, statusCfg.cloudflareLabel, Boolean(cloudflareStatusProbe?.ok), cfDetails);

  lines.push('');
  lines.push(`**${getOperationalSummary(services)}**`);

  return lines.join('\n');
}

async function findOpenIssueChannel(guild, userId, ticketType = '') {
  const channels = await guild.channels.fetch();
  const desiredType = ticketType ? normalizeTicketSlug(ticketType) : '';

  return channels.find(channel => {
    const meta = parseIssueTopic(channel?.topic);
    const metaType = normalizeTicketSlug(meta?.type || cfg.issuePrefix);

    return channel &&
      channel.type === ChannelType.GuildText &&
      meta?.ownId === userId &&
      (!desiredType || metaType === desiredType);
  }) || null;
}

function getAllTicketButtonDefs() {
  const defs = [];

  for (const msgDef of msgAll) {
    const parts = [
      msgDef,
      ...(Array.isArray(msgDef.messages) ? msgDef.messages : [])
    ];

    for (const part of parts) {
      if (part?.ticketButton) {
        defs.push(part.ticketButton);
      }

      if (Array.isArray(part?.ticketButtons)) {
        defs.push(...part.ticketButtons);
      }
    }
  }

  return defs;
}

function getTicketButtonDef(srcChId, issChId, ticketCode) {
  const ticketDefs = getAllTicketButtonDefs();
  const normalizedIssueChannelId = String(issChId || '').trim();
  const normalizedTicketCode = String(ticketCode || '').trim();

  if (!ticketCode) {
    if (issByCh.has(normalizedIssueChannelId)) {
      return null;
    }

    return ticketDefs.find(def => def.code === normalizedIssueChannelId) || null;
  }

  const exactMatch = ticketDefs.find(def =>
    def.channelId === normalizedIssueChannelId &&
    def.code === normalizedTicketCode
  );
  if (exactMatch) {
    return exactMatch;
  }

  return ticketDefs.find(def => def.code === normalizedTicketCode) || null;
}

function getIssueOpenTarget(srcChId, issChId, ticketCode) {
  const ticketDef = getTicketButtonDef(srcChId, issChId, ticketCode);
  const issueDef = issByCh.get(issChId) ||
    (ticketDef ? issByCh.get(ticketDef.channelId) : null) ||
    msgTickets;

  return { issueDef, ticketDef };
}

function getIssueStartText(issueDef, srcChId, ticketDef = null) {
  if (ticketDef?.startText) {
    return ticketDef.startText;
  }

  return issueDef.startText;
}

function getTicketReplyName(issueDef, ticketDef = null) {
  return String(ticketDef?.label || issueDef.ticketName || issueDef.openLabel || 'ticket').trim().toLowerCase();
}

function buildIssueStartText(issueDef, srcChId, userId, delAtUnix, ticketDef = null) {
  const startText = String(getIssueStartText(issueDef, srcChId, ticketDef) || '').replaceAll('{userId}', userId);

  return [
    startText,
    '',
    `This ticket will self destruct after 24 hours at ${formatIssueExpiry(delAtUnix)}.`,
    `Only admins or the bot can delete this ticket.`
  ].join('\n');
}

async function createIssueChannel(interaction, issueDef, ticketDef = null) {
  if (!interaction.guild) {
    throw new Error('Tickets can only be created inside a server.');
  }

  const ticketContext = getTicketContext(issueDef, ticketDef);
  const existing = await findOpenIssueChannel(interaction.guild, interaction.user.id, ticketContext.ticketType);

  if (existing) {
    const delAtUnix = await ensureIssueExpiry(existing, interaction.user.id);
    return { channel: existing, created: false, delAtUnix };
  }

  const parentId = interaction.channel?.parentId || null;
  const delAtUnix = Math.floor((Date.now() + cfg.issueLifetimeMs) / 1000);
  const overwrites = [
    {
      id: interaction.guild.id,
      deny: [PermissionFlagsBits.ViewChannel]
    },
    {
      id: interaction.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    },
    {
      id: bot.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels
      ]
    }
  ];

  for (const roleId of issueDef.staffRoleIds || []) {
    overwrites.push({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory
      ]
    });
  }

  const issueChannel = await interaction.guild.channels.create({
    name: `${ticketContext.channelPrefix}-${interaction.user.id}`,
    type: ChannelType.GuildText,
    ...(parentId ? { parent: parentId } : {}),
    topic: buildIssueTopic(interaction.user.id, delAtUnix, false, ticketContext.ticketType),
    permissionOverwrites: overwrites
  });

  await issueChannel.send({
    content: buildIssueStartText(issueDef, interaction.channelId, interaction.user.id, delAtUnix, ticketDef),
    components: [mkIssDelRow()]
  });

  scheduleIssueChannel(issueChannel, interaction.user.id, delAtUnix, false);

  return { channel: issueChannel, created: true, delAtUnix };
}

async function scheduleOpenIssueTickets() {
  let scheduled = 0;

  for (const guild of bot.guilds.cache.values()) {
    const channels = await guild.channels.fetch();

    for (const channel of channels.values()) {
      if (!channel || channel.type !== ChannelType.GuildText) {
        continue;
      }

      const meta = parseIssueTopic(channel.topic);

      if (!meta?.ownId) {
        continue;
      }

      await ensureIssueExpiry(channel, meta.ownId);
      scheduled += 1;
    }
  }

  console.log(`Issue ticket self-destruct timers scheduled: ${scheduled}.`);
}

async function canDelIssueCh(interaction) {
  if (!interaction.guild) {
    return false;
  }

  if (interaction.user.id === bot.user?.id) {
    return true;
  }

  try {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    return member.permissions.has(PermissionFlagsBits.Administrator);
  } catch {
    return false;
  }
}

async function delIssueCh(interaction) {
  if (!interaction.channel || !interaction.guild) {
    throw new Error('This issue channel cannot be deleted here.');
  }

  const allowed = await canDelIssueCh(interaction);

  if (!allowed) {
    await safeReply(interaction, {
      content: `Only admins or the bot can delete this ticket.`,
      flags: ephFlags
    }, 'Ticket delete permission reply failed');
    return;
  }

  await safeReply(interaction, {
    content: `Deleting this ticket...`,
    flags: ephFlags
  }, 'Ticket delete reply failed');

  await sleep(cfg.issueDeleteDelayMs);
  await interaction.channel.delete('Issue ticket closed');
}

function normEmail(rawValue) {
  return String(rawValue || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function postWorkerJson(path, body) {
  const workerUrl = process.env.LICENSE_WORKER_URL;
  const workerSecret = process.env.LICENSE_WORKER_SECRET;

  if (!workerUrl || !workerSecret) {
    throw new Error('LICENSE_WORKER_URL and LICENSE_WORKER_SECRET must be set in .env.');
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.httpTimeoutMs);

  try {
    const response = await fetch(`${workerUrl.replace(/\/+$/, '')}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${workerSecret}`
      },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });

    let payload = {};

    try {
      payload = await response.json();
    } catch {
      payload = {};
    }

    if (!response.ok) {
      throw new Error(payload.error || `Worker request failed with status ${response.status}.`);
    }

    return payload;
  } finally {
    clearTimeout(timer);
  }
}

async function reqKey(email, tierKey, discordUserId) {
  const body = {
    email,
    discordUserId
  };

  if (tierKey) {
    body.tier = tierKey;
  }

  return await postWorkerJson('/lookup', body);
}

async function runStartupMaintenance() {
  if (String(process.env.DISABLE_STARTUP_MAINTENANCE || '1').trim() !== '0') {
    console.log('Startup maintenance skipped.');
    return;
  }

  try {
    const payload = await postWorkerJson('/maintenance/startup', {});
    if (payload?.started) {
      console.log(`Startup maintenance: started for ${payload.londonDate || 'today'}.`);
      return;
    }

    const result = payload?.result || {};
    const patreon = result.patreon || {};
    const roles = result.discordRoles || {};
    const categoryName = patreon.membersCategory?.name || 'not updated';

    console.log(
      `Startup maintenance: ${categoryName}; roles checked ${roles.checked ?? 0}, added ${roles.added ?? 0}, removed ${roles.removed ?? 0}.`
    );
  } catch (err) {
    logShortErr('Startup maintenance failed', err);
  }
}

function getLookupTierKey(keyDef) {
  return keyDef.lookupTierKeys ? 'all' : keyDef.tierKey;
}

async function appendTierRl(interaction, tierKey) {
  const roleId = tierRl[tierKey];

  if (!roleId || !interaction.guild) {
    return;
  }

  try {
    const member = await interaction.guild.members.fetch(interaction.user.id);

    if (!member.roles.cache.has(roleId)) {
      await member.roles.add(roleId);
    }
  } catch (err) {
    logShortErr(`Failed to assign ${tierKey} role to ${interaction.user.id}`, err);
  }
}

async function sendBuyPing(interaction, tierName) {
  try {
    const channel = await bot.channels.fetch(ids.ch.buyPing);

    if (!channel || !channel.isTextBased() || typeof channel.send !== 'function') {
      throw new Error(`Buy ping channel ${ids.ch.buyPing} is missing or is not a sendable text channel.`);
    }

    await channel.send({
      content: `<@${interaction.user.id}> has bought SparxSolver ${tierName} (thank you <3)`,
      allowedMentions: { users: [interaction.user.id] }
    });
  } catch (err) {
    logShortErr(`Failed to announce ${tierName} purchase for ${interaction.user.id}`, err);
  }
}

function isAllowedMessageAuthor(userId) {
  const id = String(userId || '');
  return okMsgAuthorIds.has(id) || id === bot.user?.id;
}

let readyHandled = false;
let readyTimer = null;

async function onReady() {
  if (readyHandled) {
    return;
  }

  readyHandled = true;
  if (readyTimer) {
    clearTimeout(readyTimer);
    readyTimer = null;
  }

  console.log(`Logged in as ${bot.user.tag}`);
  console.log(`Runtime file: ${__filename}`);
  console.log(`Runtime cwd: ${process.cwd()}`);
  console.log(`Runtime version source: ${getBotVersionSource()}.`);
  console.log(`Registered ticket panel channels: ${[...issByCh.keys()].join(', ')}`);
  try {
    await refreshBotVersion();
    verifyErrorCodeDropdownCoverage();
    await refAllMsgs();
    await scheduleOpenIssueTickets();
    await runStartupMaintenance();
  } catch (err) {
    logShortErr('Startup task failed', err);
  }
}

bot.once('clientReady', onReady);

bot.on('warn', warning => {
  console.warn(`Discord warning: ${compactText(warning, 240)}`);
});

bot.on('error', err => {
  if (isStaleInteractionErr(err)) {
    console.warn(`Discord stale interaction ignored: ${formatErr(err, 120)}.`);
    return;
  }

  logShortErr('Discord client error', err);
});

process.on('unhandledRejection', err => {
  logShortErr('Unhandled rejection', err);
});

process.on('uncaughtException', err => {
  logShortErr('Uncaught exception', err);
  process.exitCode = 1;
});

let shuttingDown = false;

async function shutdownBot(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`Received ${signal}; shutting down Discord client...`);
  clearAllIssueTimers();

  try {
    await bot.destroy();
  } catch (err) {
    logShortErr('Discord client shutdown failed', err);
    process.exitCode = 1;
  }
}

process.once('SIGINT', () => {
  void shutdownBot('SIGINT');
});

process.once('SIGTERM', () => {
  void shutdownBot('SIGTERM');
});

bot.on('messageCreate', async message => {
  if (!message.guild || !autoDelChIds.has(message.channelId)) {
    return;
  }

  if (isAllowedMessageAuthor(message.author?.id)) {
    return;
  }

  try {
    await message.delete();
  } catch (err) {
    logShortErr(`Failed to delete guarded message ${message.id} in ${message.channelId}`, err);
  }
});

bot.on('interactionCreate', async interaction => {
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId !== cid.errorCodeSelect) {
      return;
    }

    const errorCode = String(interaction.values?.[0] || '').trim();
    const errorDef = errorCodeByCode.get(errorCode);

    if (!errorDef) {
      await safeReply(interaction, {
        content: `I could not match that error code. Use the refreshed error-code menu and try again.`,
        flags: ephFlags
      }, 'Unknown error-code reply failed');
      return;
    }

    await safeReply(interaction, {
      embeds: [mkErrCodeEmbed(errorDef)],
      flags: ephFlags
    }, 'Error-code reply failed');
    return;
  }

  if (interaction.isButton()) {
    if (interaction.customId === cid.setupBtn) {
      await safeReply(interaction, {
        ...mkSetupPayload(0),
        flags: ephFlags
      }, 'Setup reply failed');
      return;
    }

    if (interaction.customId.startsWith(`${cid.setupPage}:`)) {
      const pgIdx = Number.parseInt(interaction.customId.split(':')[1], 10);
      await safeUpdate(interaction, mkSetupPayload(Number.isFinite(pgIdx) ? pgIdx : 0), 'Setup page update failed');
      return;
    }

    if (isExactCustomId(interaction.customId, cid.infoMenu, legacyCid.infoMenu)) {
      await safeReply(interaction, {
        ...mkInfoMenuPayload(),
        flags: ephFlags
      }, 'Info menu reply failed');
      return;
    }

    const infoCode = getCustomIdCode(interaction.customId, cid.infoBtn, legacyCid.infoBtn);
    if (infoCode !== null) {
      const infoDef = invInfoByCd.get(infoCode);

      if (!infoDef) {
        await safeReply(interaction, {
          ...mkInfoMenuPayload(),
          flags: ephFlags
        }, 'Unknown info-button fallback failed');
        return;
      }

      await safeReply(interaction, {
        embeds: [mkEmb(infoDef.embed)],
        flags: ephFlags
      }, 'Info reply failed');
      return;
    }

    const statusSegments = getCustomIdSegments(interaction.customId, cid.issueStat, legacyCid.issueStat);
    if (statusSegments) {
      const [issChId, actCode] = statusSegments;
      const issueDef = issByCh.get(issChId);
      const actionDef = issActByCd.get(actCode);

      if (!issueDef || !actionDef) {
        await safeReply(interaction, {
          content: `That status action was refreshed. Use the current status panel and try again.`,
          flags: ephFlags
        }, 'Unknown status-action reply failed');
        return;
      }

      const acknowledged = await replyStatusLoading(interaction);

      if (!acknowledged) {
        return;
      }

      try {
        const statusText = await getIssueStatusText(issueDef, actionDef);

        await safeEditReply(interaction, {
          embeds: [mkEmb({
            title: `SparxSolver - Live Status`,
            description: `Private live status report for SparxSolver services.`,
            color: issueDef.embed.color
          }, statusText)]
        }, 'Status edit reply failed');
      } catch (err) {
        logShortErr('Failed to update issue status panel', err);
        await safeEditReply(interaction, {
          content: `I could not run the status check right now. Try again in a minute.`
        }, 'Status failure reply failed');
      }

      return;
    }

    if (getCustomIdSegments(interaction.customId, cid.issueOpen, legacyCid.issueOpen)) {
      const { issueChannelId, ticketCode } = parseIssueOpenCustomId(interaction.customId);
      const { issueDef, ticketDef } = getIssueOpenTarget(interaction.channelId, issueChannelId, ticketCode);

      const acknowledged = await safeDeferReply(interaction, { flags: ephFlags }, 'Ticket defer reply failed');
      if (!acknowledged) {
        return;
      }

      try {
        const { channel, created, delAtUnix } = await createIssueChannel(interaction, issueDef, ticketDef);
        const expText = formatIssueExpiry(delAtUnix);
        const ticketName = getTicketReplyName(issueDef, ticketDef);
        await safeEditReply(interaction,
          created
            ? `Your ${ticketName} ticket has been created: ${channel}\nIt will self destruct at ${expText}.`
            : `You already have an open ${ticketName} ticket: ${channel}\nIt will self destruct at ${expText}.`,
          'Ticket result reply failed'
        );
      } catch (err) {
        logShortErr('Failed to create issue ticket', err);
        await safeEditReply(interaction, `I could not create a ticket right now. Try again in a minute.`, 'Ticket failure reply failed');
      }

      return;
    }

    if (interaction.customId === cid.issueDelete || interaction.customId.startsWith(`${cid.issueDelete}:`)) {
      try {
        await delIssueCh(interaction);
      } catch (err) {
        logShortErr('Failed to delete issue ticket', err);

        if (!interaction.replied && !interaction.deferred) {
          await safeReply(interaction, {
            content: `I could not delete this ticket right now.`,
            flags: ephFlags
          }, 'Ticket delete failure reply failed');
        }
      }

      return;
    }

    if (interaction.customId !== cid.keyBtn) {
      return;
    }

    const keyDef = keyByCh.get(interaction.channelId);

    if (!keyDef) {
      await safeReply(interaction, {
        content: `This key lookup button is not enabled in this channel.`,
        flags: ephFlags
      }, 'Key lookup disabled reply failed');
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`${cid.keyModal}:${interaction.channelId}`)
      .setTitle(`SparxSolver - ${keyDef.tierName}`);

    const emailInput = new TextInputBuilder()
      .setCustomId('email')
      .setLabel(`Email used to buy it`)
      .setPlaceholder(`name@example.com`)
      .setStyle(TextInputStyle.Short)
      .setMinLength(5)
      .setMaxLength(254)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(emailInput)
    );

    await safeInteractionCall('Key lookup modal failed', () => interaction.showModal(modal));
    return;
  }

  if (!interaction.isModalSubmit()) {
    return;
  }

  if (!interaction.customId.startsWith(`${cid.keyModal}:`)) {
    return;
  }

  const srcChId = interaction.customId.split(':')[1] || interaction.channelId;
  const keyDef = keyByCh.get(srcChId);

  if (!keyDef) {
    await safeReply(interaction, {
      content: `This email form is not enabled in this channel.`,
      flags: ephFlags
    }, 'Email form disabled reply failed');
    return;
  }

  const email = normEmail(interaction.fields.getTextInputValue('email'));

  if (!isValidEmail(email)) {
    await safeReply(interaction, {
      content: `Enter a valid email address.`,
      flags: ephFlags
    }, 'Invalid email reply failed');
    return;
  }

  const acknowledged = await safeDeferReply(interaction, { flags: ephFlags }, 'Key lookup defer reply failed');
  if (!acknowledged) {
    return;
  }

  try {
    const result = await reqKey(email, getLookupTierKey(keyDef), interaction.user.id);

    if (!result.found || !result.licenseKey) {
      if (result.reason === 'expired') {
        const expiredAt = Number(result.expires);
        const foundTierKey = result.tier || keyDef.tierKey;
        const foundTierName = tierNames[foundTierKey] || keyDef.tierName || 'SparxSolver';
        const expiredText = Number.isFinite(expiredAt) ? ` It expired <t:${Math.floor(expiredAt)}:R>.` : '';
        await safeEditReply(interaction, `A SparxSolver ${foundTierName} key was found for that email, but it has expired.${expiredText}`, 'Expired key reply failed');
        return;
      }

      await safeEditReply(interaction, mkNoKeyMsg(keyDef), 'No key reply failed');
      return;
    }

    const foundTierKey = result.tier || keyDef.tierKey;
    const foundTierName = tierNames[foundTierKey] || keyDef.tierName;

    await appendTierRl(interaction, foundTierKey);

    if (result.firstDiscordRegistration) {
      await sendBuyPing(interaction, foundTierName);
    }

    await safeEditReply(interaction, `Your SparxSolver ${foundTierName} key is \`${result.licenseKey}\``, 'Key lookup result reply failed');
  } catch (err) {
    logShortErr('Failed to look up license key', err);
    await safeEditReply(interaction, `The key lookup service is unavailable right now. Try again in a minute.`, 'Key lookup failure reply failed');
  }
});

function startBot() {
  const token = requireEnv('TOKEN');
  console.log(`Starting SparxSolver Discord bot (${ver})...`);
  console.log(`Runtime file: ${__filename}`);
  console.log(`Runtime cwd: ${process.cwd()}`);
  console.log(`Version source: ${getBotVersionSource()}.`);
  console.log(`Discord token present. Waiting for Discord ready event...`);

  readyTimer = setTimeout(() => {
    if (!readyHandled) {
      console.warn(
        `Discord ready event has not fired after 30s. Check the bot token, network access to Discord, and enabled gateway intents in the Discord Developer Portal.`
      );
    }
  }, 30000);

  return bot.login(token)
    .then(() => {
      console.log(`Discord login accepted; waiting for gateway ready.`);
    })
    .catch(err => {
      if (readyTimer) {
        clearTimeout(readyTimer);
        readyTimer = null;
      }
      logShortErr('Discord login failed', err, 400);
      process.exitCode = 1;
    });
}

module.exports = {
  cid,
  legacyCid,
  errorCodeDefs,
  ids,
  invInfo,
  msgTickets,
  getAllTicketButtonDefs,
  getBotVersionSource,
  getIssueOpenCustomId,
  getIssueOpenTarget,
  mkInfoMenuPayload,
  mkErrCodeRow,
  getManagedMessageParts,
  getTicketButtonDef,
  mkMsgPayload,
  parseIssueOpenCustomId,
  readExtensionErrorCodes,
  readLocalBotVersion,
  refreshBotVersion,
  shutdownBot,
  startBot,
  verifyErrorCodeDropdownCoverage
};

if (require.main === module) {
  startBot();
}

// minor spelling error, really embarrassing 😭