require('dotenv').config({ quiet: true });

const os = require('os');
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
    buyPing: '1497022873846546512',
    invite: '1495957637865541662',
    autoDeleteA: '1498037391892545557',
    setup: '1492211341274910911',
    keyAll: '1502685548739952880',
    keyAff: '1495934808184852500',
    keyBas: '1495934834672013484',
    keyPro: '1495934849209602078',
    keyPrm: '1495934866729209967',
    relList: '1496407953949982790',
    issues: '1498049762182565908',
    errorLogs: '1503919573102231632'
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
  infoBtn: 'ivi',
  issueStat: 'ist',
  issueOpen: 'iop',
  issueDelete: 'idl',
  errorCodeSelect: 'ecs'
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

const ver = `SparxSolver 1.3.1`;
const ephFlags = 1 << 6;
const issueStatusCache = {
  text: '',
  checkedAtMs: 0,
  inFlight: null
};
const issueTimers = new Map();
const autoDelChIds = new Set([
  ids.ch.autoDeleteA,
  ids.ch.issues
]);
const okMsgAuthorIds = new Set([
  ids.user.bot,
  ids.user.owner
]);

const urls = {
  patreon: 'https://www.patreon.com/cw/SparxxSolver/membership',
  patreonJoin: 'https://www.patreon.com/sparxxsolver/join',
  invite: 'https://discord.gg/CmZJ4Fy6Wh',
  ticket: 'https://discord.com/channels/1486793780391575693/1495957637865541662',
  issueGuide: 'https://discord.com/channels/1486793780391575693/1498049762182565908'
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

const invInfo = [
  {
    code: 'pp',
    label: `Privacy Policy`,
    style: ButtonStyle.Secondary,
    embed: {
      title: `SparxSolver - Privacy Policy`,
      description: [
`SparxSolver is an Open Source project (https://github.com/SparxSolver/SparxSolver).

Keys are stored in both a CloudFlare encrypted secret KV namespace and a posgresql database listed on our secure VPS.

We only have access to the info you or Patreon gives us, we dont have access to any other info.
We use your Patreon email to verify paid keys.

We only collect data temporarily and do not share it or even view it at all, most of the process is automated and when we do use your data, we use it for financial reasons such as the paywall on the extension. If we didn't have this, anyone could use the extension and we wouldn't be able to profit from it.`
      ].join('\n'),
      color: 0x5865f2,
      image: 'https://cdn.discordapp.com/attachments/1491945158009425942/1498033415130185769/image.png?ex=69efafd6&is=69ee5e56&hm=c4ab39cc159571c50eba205f98f101347dbac168f37ec70122a36ede0aece337'
    }
  },
  {
    code: 'cf',
    label: `Cash Flow`,
    style: ButtonStyle.Secondary,
    embed: {
      title: `SparxSolver - Cash Flow`,
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
      color: 0x2ecc71,
      image: 'https://support.patreon.com/hc/article_attachments/29912946161933'
    }
  }
];

const msgInv = {
  code: 'msg_inv',
  kind: 'info',
  channelId: ids.ch.invite,
  ticketButton: {
    channelId: ids.ch.issues,
    label: `Create Ticket`,
    startText: `Hello <@{userId}>, thanks for joining from the invite channel. Please tell us what you need help with and an admin will reply here.`
  },
  embed: {
    title: `Invite your friends!`,
    description: `Share this invite link with your friends:\n\n${urls.invite}`,
    color: 0x0075ff
  },
  infoButtons: invInfo
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

[[*]](https://discord.com/channels/1486793780391575693/1495934866729209967) **Premium**: [£10 / month](https://www.patreon.com/checkout/SparxxSolver?rid=28354812)
> gpt-5.5 with the highest quality responses, all features, full homework analysis, and full access.

[[*]](https://discord.com/channels/1486793780391575693/1495934849209602078) **Pro**: [£5 / month](https://www.patreon.com/checkout/SparxxSolver?rid=28354808)
> gpt-5.4 with the best performance, discord features, and stronger responses.

[[*]](https://discord.com/channels/1486793780391575693/1495934834672013484) **Basic**: [£3 / month](https://www.patreon.com/checkout/SparxxSolver?rid=28354798)
> gpt-5.4-mini with better pricing and a sharper accuracy.

[[*]](https://discord.com/channels/1486793780391575693/1495934808184852500) **Affordable**: [£1 / month](https://www.patreon.com/checkout/SparxxSolver?rid=28320508)
> gpt-4o with the lowest price possible and the fastest responses.
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
`Done! Now you can use the SparxSolver extension. If you have any issues with setting SparxSolver up, [open a ticket here](https://discord.com/channels/1486793780391575693/1495957637865541662).

Thanks for using SparxSolver <3`
    ].join('\n')
  }
];

function getTierCp(tierKey) {
  const cpByTier = {
    affordable: [
`SparxSolver Affordable uses ChatGPT's gpt-4o for responses with the cheapest pricing possible and a fast, reliable experience.

Plan details:
- £1 / month
- Cheap pricing
- gpt-4o responses
- 1000 tokens per request
- Permanent role on Discord

Grading:
- Year 7 maths (perfect)
- Year 8 maths (perfect)
- Year 9 maths (great)
- Year 10 maths (good)
- Year 11 maths (bad)

Buy the plan on [Patreon](${urls.patreonJoin}), then use the button below to get your key.
If you're buying a key for someone else, use their email.`
    ].join('\n'),
    basic: [
`SparxSolver Basic uses ChatGPT's gpt-5.4-mini for better responses while keeping the pricing cheap and the speed fast.

Plan details:
- £3 / month
- Cheap pricing
- gpt-5.4-mini responses
- 2222 tokens per request
- Faster responses
- Permanent role on Discord

Grading:
- Year 7 maths (perfect)
- Year 8 maths (perfect)
- Year 9 maths (perfect)
- Year 10 maths (great)
- Year 11 maths (good)

Buy the plan on [Patreon](${urls.patreonJoin}), then use the button below to get your key.
If you're buying a key for someone else, use their email.`
    ].join('\n'),
    pro: [
`SparxSolver Pro uses ChatGPT's gpt-5.4 for stronger responses, super fast performance, and better update access.

Plan details:
- £5 / month
- Giveaways and special roles
- gpt-5.4 responses
- 666 tokens per request
- Super fast responses
- Early access to updates
- Permanent role on Discord

Grading:
- Year 7 maths (perfect)
- Year 8 maths (perfect)
- Year 9 maths (perfect)
- Year 10 maths (perfect)
- Year 11 maths (great)

Buy the plan on [Patreon](${urls.patreonJoin}), then use the button below to get your key.
If you're buying a key for someone else, use their email.`
    ].join('\n'),
    premium: [
`SparxSolver Premium uses ChatGPT's gpt-5.5 for the highest-quality responses, instant speed, and top-priority treatment.

Plan details:
- £10 / month
- Giveaways and special roles
- gpt-5.5 responses (highest quality)
- 333 tokens per request
- Instant responses
- Early access to early versions and updates
- Test developing versions
- Requests and top priority treatment

Grading:
- Year 7 maths (perfect)
- Year 8 maths (perfect)
- Year 9 maths (perfect)
- Year 10 maths (perfect)
- Year 11 maths (perfect)

Buy the plan on [Patreon](${urls.patreonJoin}), then use the button below to get your key.
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
  openLabel: `Report an Issue`,
  staffRoleIds: [],
  startText: `Hello <@{userId}>, please read the list of issues we are aware of in ${urls.issueGuide} and describe the issue you are having below.`,
  embed: {
    title: `SparxSolver - Issues`,
    description: [
`## Servers & Backend
Use **Check All Status** for a private live status report.`
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
    label: `Rare answer failure`,
    summary: `The Worker got no usable answer text back from the AI response.`,
    detail: `This is the "! PLEASE READ !" rare error. Ask the user for a screenshot of the question and the error message, then check Worker logs and the OpenAI response body for an empty choices/message payload. Do not ask them to spam Solve again because it can rate-limit their key.`
  },
  {
    code: 'E001',
    label: `Missing configuration`,
    summary: `Required env vars or secrets are missing.`,
    detail: `Check the bot .env and Worker dashboard secrets. Common missing values are TOKEN, LICENSE_WORKER_URL, LICENSE_WORKER_SECRET, OPENAI_API_KEY, and DISCORD_BOT_TOKEN.`
  },
  {
    code: 'E002',
    label: `Worker unavailable`,
    summary: `The license Worker could not be reached.`,
    detail: `Check Cloudflare Worker status, deployment health, worker URL, DNS, and whether the request timed out.`
  },
  {
    code: 'E003',
    label: `Invalid license key`,
    summary: `The key format or stored license record is invalid.`,
    detail: `Ask the user to copy the key again. If it still fails, check the license:<key> KV record.`
  },
  {
    code: 'E004',
    label: `Expired license`,
    summary: `The license exists but its expires timestamp is in the past.`,
    detail: `Confirm the Patreon membership or manually inspect the license record expiration.`
  },
  {
    code: 'E005',
    label: `Key lookup failed`,
    summary: `The user email did not return an active matching key.`,
    detail: `Check the exact Patreon email, the tier selected, and whether the Worker has synced the latest Patreon membership.`
  },
  {
    code: 'E006',
    label: `AI unavailable`,
    summary: `OpenAI returned an error or timed out.`,
    detail: `Check the Worker logs for upstream status, model availability, API key validity, and rate-limit messages.`
  },
  {
    code: 'E007',
    label: `Discord role sync`,
    summary: `A Discord tier role could not be added or removed.`,
    detail: `Check bot role hierarchy, Manage Roles permission, guild ID, and whether the member is still in the server.`
  },
  {
    code: 'E008',
    label: `Patreon sync failed`,
    summary: `Patreon membership refresh failed.`,
    detail: `Check Patreon API tokens, refresh-token state, campaign ID, and the Worker maintenance logs.`
  },
  {
    code: 'E009',
    label: `Screenshot rejected`,
    summary: `The extension sent an invalid or too-large screenshot payload.`,
    detail: `Ask the user to refresh Sparx and retry. If repeated, check extension capture output and MAX_SCREENSHOT_CHARS in the Worker.`
  },
  {
    code: 'E010',
    label: `Ticket cleanup failed`,
    summary: `The bot could not delete an issue ticket or guarded message.`,
    detail: `Check channel permissions, message age, channel topic metadata, and whether the channel still exists.`
  }
];

const errorCodeByCode = new Map(errorCodeDefs.map(def => [def.code, def]));

const msgErr = {
  code: 'error_logs',
  kind: 'error_log_panel',
  channelId: ids.ch.errorLogs,
  embed: {
    title: `SparxSolver - Error Logs`,
    description: [
`Use this channel for backend, bot, extension, and license-worker error logs.

Select an error code below to see what it means and what to check first.`
    ].join('\n'),
    color: 0xef4444
  }
};

// Managed message refresh order. Keep this in the same channel order as the server layout.
const msgAll = [
  msgInv,    // 1495957637865541662
  msgSet,    // 1492211341274910911
  msgKeyAll, // 1502685548739952880
  msgKeys[0], // 1495934808184852500
  msgKeys[1], // 1495934834672013484
  msgKeys[2], // 1495934849209602078
  msgKeys[3], // 1495934866729209967
  msgIss,    // 1498049762182565908
  msgErr     // 1503919573102231632
];

const keyByCh = new Map([...msgKeys, msgKeyAll].map(def => [def.channelId, def]));
const invInfoByCd = new Map(invInfo.map(def => [def.code, def]));
const issByCh = new Map([[msgIss.channelId, msgIss]]);
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

function mkIssPanelRow(issueDef) {
  const buttons = [
    new ButtonBuilder()
      .setCustomId(`${cid.issueOpen}:${issueDef.channelId}`)
      .setLabel(issueDef.openLabel)
      .setStyle(ButtonStyle.Primary)
  ];

  for (const actionDef of issueDef.actions.slice(0, 4)) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`${cid.issueStat}:${issueDef.channelId}:${actionDef.code}`)
        .setLabel(actionDef.label)
        .setStyle(actionDef.style || ButtonStyle.Secondary)
    );
  }

  return new ActionRowBuilder().addComponents(...buttons);
}

function mkIssOpenRow(ticketDef) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${cid.issueOpen}:${ticketDef.channelId}`)
      .setLabel(ticketDef.label || `Create a Ticket`)
      .setStyle(ButtonStyle.Primary)
  );
}

function mkIssDelRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(cid.issueDelete)
      .setLabel(`Admin Delete Ticket`)
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
        label: `${def.code} - ${def.label}`,
        description: def.summary,
        value: def.code
      })))
  );
}

function mkErrCodeEmbed(def) {
  return mkEmb({
    title: `${def.code} - ${def.label}`,
    description: [
`Meaning:
${def.summary}

What to check:
${def.detail}`
    ].join('\n'),
    color: 0xef4444
  });
}

function mkMsgPayload(msgDef, extraBottom = '') {
  const rows = [];

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

  if (msgDef.ticketButton) {
    rows.push(mkIssOpenRow(msgDef.ticketButton));
  }

  if (Array.isArray(msgDef.infoButtons) && msgDef.infoButtons.length > 0) {
    rows.push(mkInfoRow(msgDef.infoButtons));
  }

  return {
    embeds: [mkEmb(msgDef.embed, extraBottom)],
    ...(rows.length > 0 ? { components: rows } : {})
  };
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
  await channel.send(mkMsgPayload(msgDef));
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

    let preview = '';

    try {
      preview = (await res.text()).slice(0, 120);
    } catch {
      preview = '';
    }

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

function formatErr(err, maxLen = 160) {
  return compactText(err?.message || err, maxLen);
}

function logShortErr(label, err, maxLen = 160) {
  console.error(`${label}: ${formatErr(err, maxLen)}`);
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

function buildIssueTopic(ownId, delAtUnix, warned = false) {
  return `${cfg.issueTopicPrefix}${ownId};delete-at:${Math.floor(delAtUnix)};warned:${warned ? 1 : 0}`;
}

function parseIssueTopic(topic) {
  const text = String(topic || '').trim();

  if (!text.startsWith(cfg.issueTopicPrefix)) {
    return null;
  }

  const [ownId, ...parts] = text.slice(cfg.issueTopicPrefix.length).split(';');
  const meta = {
    ownId: String(ownId || '').trim(),
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

  await channel.setTopic(
    buildIssueTopic(ownId, delAtUnix, warned),
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
  try {
    await interaction.reply({
      content: `Checking SparxSolver status...`,
      flags: ephFlags
    });
    return true;
  } catch (err) {
    if (err?.code === 10062 || err?.code === 40060) {
      return false;
    }

    throw err;
  }
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

async function findOpenIssueChannel(guild, userId) {
  const channels = await guild.channels.fetch();

  return channels.find(channel => {
    const meta = parseIssueTopic(channel?.topic);

    return channel &&
      channel.type === ChannelType.GuildText &&
      meta?.ownId === userId;
  }) || null;
}

function getIssueStartText(issueDef, srcChId) {
  if (srcChId === ids.ch.invite && msgInv.ticketButton?.startText) {
    return msgInv.ticketButton.startText;
  }

  return issueDef.startText;
}

function buildIssueStartText(issueDef, srcChId, userId, delAtUnix) {
  const startText = String(getIssueStartText(issueDef, srcChId) || '').replaceAll('{userId}', userId);

  return [
    startText,
    '',
    `This ticket will self destruct after 24 hours at ${formatIssueExpiry(delAtUnix)}.`,
    `Only admins or the bot can delete this ticket.`
  ].join('\n');
}

async function createIssueChannel(interaction, issueDef) {
  if (!interaction.guild) {
    throw new Error('Tickets can only be created inside a server.');
  }

  const existing = await findOpenIssueChannel(interaction.guild, interaction.user.id);

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
    name: `${cfg.issuePrefix}-${interaction.user.id}`,
    type: ChannelType.GuildText,
    ...(parentId ? { parent: parentId } : {}),
    topic: buildIssueTopic(interaction.user.id, delAtUnix, false),
    permissionOverwrites: overwrites
  });

  await issueChannel.send({
    content: buildIssueStartText(issueDef, interaction.channelId, interaction.user.id, delAtUnix),
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
    await interaction.reply({
      content: `Only admins or the bot can delete this ticket.`,
      flags: ephFlags
    });
    return;
  }

  await interaction.reply({
    content: `Deleting this ticket...`,
    flags: ephFlags
  });

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
      return;
    }

    await channel.send(`<@${interaction.user.id}> has bought SparxSolver ${tierName} (thank you <3)`);
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
  try {
    await refAllMsgs();
    await scheduleOpenIssueTickets();
    await runStartupMaintenance();
  } catch (err) {
    logShortErr('Startup task failed', err);
  }
}

bot.once('clientReady', onReady);
bot.once('ready', onReady);

bot.on('warn', warning => {
  console.warn(`Discord warning: ${compactText(warning, 240)}`);
});

bot.on('error', err => {
  logShortErr('Discord client error', err);
});

process.on('unhandledRejection', err => {
  logShortErr('Unhandled rejection', err);
});

process.on('uncaughtException', err => {
  logShortErr('Uncaught exception', err);
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
      await interaction.reply({
        content: `That error code is not available anymore.`,
        flags: ephFlags
      });
      return;
    }

    await interaction.reply({
      embeds: [mkErrCodeEmbed(errorDef)],
      flags: ephFlags
    });
    return;
  }

  if (interaction.isButton()) {
    if (interaction.customId === cid.setupBtn) {
      await interaction.reply({
        ...mkSetupPayload(0),
        flags: ephFlags
      });
      return;
    }

    if (interaction.customId.startsWith(`${cid.setupPage}:`)) {
      const pgIdx = Number.parseInt(interaction.customId.split(':')[1], 10);
      await interaction.update(mkSetupPayload(Number.isFinite(pgIdx) ? pgIdx : 0));
      return;
    }

    if (interaction.customId.startsWith(`${cid.infoBtn}:`)) {
      const infoCode = interaction.customId.split(':')[1];
      const infoDef = invInfoByCd.get(infoCode);

      if (!infoDef) {
        await interaction.reply({
          content: `That info panel is not available anymore.`,
          flags: ephFlags
        });
        return;
      }

      await interaction.reply({
        embeds: [mkEmb(infoDef.embed)],
        flags: ephFlags
      });
      return;
    }

    if (interaction.customId.startsWith(`${cid.issueStat}:`)) {
      const [, issChId, actCode] = interaction.customId.split(':');
      const issueDef = issByCh.get(issChId);
      const actionDef = issActByCd.get(actCode);

      if (!issueDef || !actionDef) {
        await interaction.reply({
          content: `That status panel is not available anymore.`,
          flags: ephFlags
        });
        return;
      }

      const acknowledged = await replyStatusLoading(interaction);

      if (!acknowledged) {
        return;
      }

      try {
        const statusText = await getIssueStatusText(issueDef, actionDef);

        await interaction.editReply({
          embeds: [mkEmb({
            title: `SparxSolver - Live Status`,
            description: `Private live status report for SparxSolver services.`,
            color: issueDef.embed.color
          }, statusText)]
        });
      } catch (err) {
        logShortErr('Failed to update issue status panel', err);
        await interaction.editReply({
          content: `I could not run the status check right now. Try again in a minute.`
        }).catch(() => {});
      }

      return;
    }

    if (interaction.customId.startsWith(`${cid.issueOpen}:`)) {
      const issChId = interaction.customId.split(':')[1];
      const issueDef = issByCh.get(issChId);

      if (!issueDef) {
        await interaction.reply({
          content: `This ticket panel is not available anymore.`,
          flags: ephFlags
        });
        return;
      }

      await interaction.deferReply({ flags: ephFlags });

      try {
        const { channel, created, delAtUnix } = await createIssueChannel(interaction, issueDef);
        const expText = formatIssueExpiry(delAtUnix);
        await interaction.editReply(
          created
            ? `Your ticket has been created: ${channel}\nIt will self destruct at ${expText}.`
            : `You already have an open ticket: ${channel}\nIt will self destruct at ${expText}.`
        );
      } catch (err) {
        logShortErr('Failed to create issue ticket', err);
        await interaction.editReply(`I could not create a ticket right now. Try again in a minute.`);
      }

      return;
    }

    if (interaction.customId === cid.issueDelete || interaction.customId.startsWith(`${cid.issueDelete}:`)) {
      try {
        await delIssueCh(interaction);
      } catch (err) {
        logShortErr('Failed to delete issue ticket', err);

        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: `I could not delete this ticket right now.`,
            flags: ephFlags
          });
        }
      }

      return;
    }

    if (interaction.customId !== cid.keyBtn) {
      return;
    }

    const keyDef = keyByCh.get(interaction.channelId);

    if (!keyDef) {
      await interaction.reply({
        content: `This key lookup button is not enabled in this channel.`,
        flags: ephFlags
      });
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

    await interaction.showModal(modal);
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
    await interaction.reply({
      content: `This email form is not enabled in this channel.`,
      flags: ephFlags
    });
    return;
  }

  const email = normEmail(interaction.fields.getTextInputValue('email'));

  if (!isValidEmail(email)) {
    await interaction.reply({
      content: `Enter a valid email address.`,
      flags: ephFlags
    });
    return;
  }

  await interaction.deferReply({ flags: ephFlags });

  try {
    const result = await reqKey(email, getLookupTierKey(keyDef), interaction.user.id);

    if (!result.found || !result.licenseKey) {
      if (result.reason === 'expired') {
        const expiredAt = Number(result.expires);
        const foundTierKey = result.tier || keyDef.tierKey;
        const foundTierName = tierNames[foundTierKey] || keyDef.tierName || 'SparxSolver';
        const expiredText = Number.isFinite(expiredAt) ? ` It expired <t:${Math.floor(expiredAt)}:R>.` : '';
        await interaction.editReply(`A SparxSolver ${foundTierName} key was found for that email, but it has expired.${expiredText}`);
        return;
      }

      await interaction.editReply(mkNoKeyMsg(keyDef));
      return;
    }

    const foundTierKey = result.tier || keyDef.tierKey;
    const foundTierName = tierNames[foundTierKey] || keyDef.tierName;

    await appendTierRl(interaction, foundTierKey);

    if (result.firstDiscordRegistration) {
      await sendBuyPing(interaction, foundTierName);
    }

    await interaction.editReply(`Your SparxSolver ${foundTierName} key is \`${result.licenseKey}\``);
  } catch (err) {
    logShortErr('Failed to look up license key', err);
    await interaction.editReply(`The key lookup service is unavailable right now. Try again in a minute.`);
  }
});

const token = requireEnv('TOKEN');
console.log(`Starting SparxSolver Discord bot (${ver})...`);
console.log(`TOKEN present: ${token.length} characters. Waiting for Discord ready event...`);

readyTimer = setTimeout(() => {
  if (!readyHandled) {
    console.warn(
      `Discord ready event has not fired after 30s. Check the bot token, network access to Discord, and enabled gateway intents in the Discord Developer Portal.`
    );
  }
}, 30000);

bot.login(token)
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
