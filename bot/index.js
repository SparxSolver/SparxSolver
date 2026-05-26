const path = require('path');
const fs = require('fs');

require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });
require('dotenv').config({ quiet: true });

const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  ModalBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

if (typeof fetch !== 'function') {
  throw new Error('This bot requires Node.js 18 or newer because it uses the built-in fetch API.');
}

const DASHBOARD_CHANNEL_ID = String(process.env.DASHBOARD_CHANNEL_ID || '1492211341274910911').trim();
const SUPPORT_CHANNEL_ID = String(process.env.SUPPORT_CHANNEL_ID || '1495957637865541662').trim();
const STATE_FILE = path.join(__dirname, 'managed-message-state.json');
const STATE_MESSAGE_KEY = 'user_dashboard_panel';
const PANEL_CONFIG_KEY = 'user_dashboard_panel';
const DASHBOARD_BUTTON_ID = 'spx_user_dashboard';
const DASHBOARD_LINK_PREFIX = 'spx_dashboard_link';
const DASHBOARD_LINK_MODAL_PREFIX = 'spx_dashboard_link_modal';
const DASHBOARD_SELECT_PREFIX = 'spx_dashboard_select';
const DASHBOARD_PREF_PREFIX = 'spx_dashboard_pref';
const DASHBOARD_PREF_RESET_PREFIX = 'spx_dashboard_pref_reset';
const DASHBOARD_REFRESH_PREFIX = 'spx_dashboard_refresh';
const DASHBOARD_SIGN_OUT_PREFIX = 'spx_dashboard_signout';
const ONBOARDING_NAV_PREFIX = 'spx_onboarding_nav';
const SUPPORT_ERROR_CODES_PREFIX = 'spx_support_error_codes';
const SUPPORT_INFO_PREFIX = 'spx_support_info';
const SUPPORT_TICKET_PREFIX = 'spx_support_ticket';
const SUPPORT_TICKET_DELETE_PREFIX = 'spx_support_ticket_delete';
const EPHEMERAL_FLAG = 1 << 6;
const PURGE_BATCH_SIZE = 100;
const WORKER_TIMEOUT_MS = 8000;
const TICKET_PREFIX = 'support';
const TICKET_TOPIC_PREFIX = 'issue-owner:';
const TICKET_LIFETIME_MS = 24 * 60 * 60 * 1000;
const TICKET_USER_DELETE_DELAY_MS = 60 * 60 * 1000;
const TICKET_TIME_ZONE = process.env.TICKET_TIME_ZONE || 'Europe/Stockholm';
const DASHBOARD_RATE_LIMIT_MAX_KEYS = 2500;
const DASHBOARD_RATE_LIMIT_DEFAULT = { limit: 8, windowMs: 10000 };
const DASHBOARD_RATE_LIMITS = {
  open: { limit: 2, windowMs: 8000 },
  select: { limit: 6, windowMs: 10000 },
  settings: { limit: 8, windowMs: 10000 },
  modal: { limit: 3, windowMs: 30000 },
  ticket: { limit: 1, windowMs: 30000 },
  deleteTicket: { limit: 2, windowMs: 10000 }
};
const DASHBOARD_GLOBAL_RATE_LIMITS = {
  open: { limit: 40, windowMs: 10000 },
  modal: { limit: 30, windowMs: 30000 },
  ticket: { limit: 8, windowMs: 60000 }
};

const DEFAULT_PANEL = {
  title: 'SparxSolver Dashboard',
  content: `SparxSolver is the best AI-powered assistant that helps solve your Sparx Maths, Reader and Science with ease.`,
  color: 0x0075ff,
  footer: 'https://discord.gg/CmZJ4Fy6Wh'
};

const URLS = {
  patreon: 'https://www.patreon.com/cw/SparxxSolver/membership',
  release: 'https://github.com/SparxSolver/SparxSolver/releases/latest',
  buy: {
    affordable: 'https://www.patreon.com/checkout/SparxxSolver?rid=28320508',
    basic: 'https://www.patreon.com/checkout/SparxxSolver?rid=28354798',
    pro: 'https://www.patreon.com/checkout/SparxxSolver?rid=28354808',
    premium: 'https://www.patreon.com/checkout/SparxxSolver?rid=28354812'
  }
};

const PLAN_ROLE_IDS = {
  affordable: '1493707110020546731',
  basic: '1493707149069647932',
  pro: '1493707169655292105',
  premium: '1493707187091144875'
};

const PLAN_CAPS = {
  affordable: 50000,
  basic: 100000,
  pro: 33000,
  premium: 250000
};

const PLANS = [
  { key: 'affordable', name: 'Affordable', price: '£1/month', roleId: PLAN_ROLE_IDS.affordable, color: 0xf1c40f },
  { key: 'basic', name: 'Basic', price: '£3/month', roleId: PLAN_ROLE_IDS.basic, color: 0xe67e22 },
  { key: 'pro', name: 'Pro', price: '£5/month', roleId: PLAN_ROLE_IDS.pro, color: 0x1abc9c },
  { key: 'premium', name: 'Premium', price: '£10/month', roleId: PLAN_ROLE_IDS.premium, color: 0x3498db }
];

const PLAN_BY_KEY = new Map(PLANS.map(plan => [plan.key, plan]));
const PLAN_PRIORITY = ['premium', 'pro', 'basic', 'affordable'];
const ONBOARDING_LAST_PAGE = 4;
const DASHBOARD_PAGES = {
  home: 'home',
  keys: 'keys_usage',
  upgrade: 'plans_upgrade',
  settings: 'settings',
  support: 'help_support'
};

const DASHBOARD_THEMES = {
  emerald: { label: 'Emerald', color: 0x2ecc71, hex: '#2ecc71', dark: '#10251d', mid: '#164232', soft: '#d8f8e8' },
  blue: { label: 'Blue', color: 0x3498db, hex: '#3498db', dark: '#0e2234', mid: '#163f61', soft: '#d8ecfb' },
  gold: { label: 'Gold', color: 0xf1c40f, hex: '#f1c40f', dark: '#2b2205', mid: '#5a4708', soft: '#fff3bd' },
  rose: { label: 'Rose', color: 0xe74c3c, hex: '#e74c3c', dark: '#33110e', mid: '#641f18', soft: '#fbe0dc' }
};

const DEFAULT_DASHBOARD_PREFERENCES = {
  accentColor: 'blue',
  layout: 'detailed',
  usageDisplay: 'tokens_percent'
};

const ERROR_CODES = [
  [1, 'AI returned an empty response'],
  [2, 'Invalid action'],
  [3, 'Invalid screenshot payload'],
  [4, 'Help disabled for bookwork checks'],
  [5, 'Invalid license'],
  [6, 'Expired license'],
  [7, 'AI service not configured'],
  [8, 'Same question rate limited'],
  [9, 'AI unreachable'],
  [10, 'AI model unavailable'],
  [11, 'AI provider rate limited'],
  [12, 'AI auth failed'],
  [13, 'AI provider error'],
  [14, 'Weekly token limit reached']
];

const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers
  ]
});

let ready = false;
let readyTimer = null;
const ticketTimers = new Map();
const dashboardRateLimits = new Map();

function env(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    throw new Error(`${name} is missing from .env`);
  }

  return value;
}

function clip(value, max) {
  const text = String(value || '').trim();
  if (text.length <= max) {
    return text;
  }

  return `${text.slice(0, Math.max(0, max - 3))}...`;
}

function readState() {
  try {
    if (!fs.existsSync(STATE_FILE)) {
      return {};
    }

    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (err) {
    console.warn(`Could not read ${STATE_FILE}: ${err.message}`);
    return {};
  }
}

function writeState(state) {
  fs.writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
}

function parseColor(value, fallback) {
  if (Number.isInteger(value) && value >= 0 && value <= 0xffffff) {
    return value;
  }

  const text = String(value || '').trim().replace(/^#/, '').replace(/^0x/i, '');
  if (/^[0-9a-f]{6}$/i.test(text)) {
    return Number.parseInt(text, 16);
  }

  return fallback;
}

function getPanelConfig(state = readState()) {
  const custom = state?.customPanels?.[PANEL_CONFIG_KEY] || {};

  return {
    title: clip(process.env.DASHBOARD_PANEL_TITLE || custom.title || DEFAULT_PANEL.title, 256),
    content: clip(
      process.env.DASHBOARD_PANEL_CONTENT ||
        custom.content ||
        custom.description ||
        DEFAULT_PANEL.content,
      4096
    ),
    color: parseColor(process.env.DASHBOARD_PANEL_COLOR || custom.color, DEFAULT_PANEL.color),
    footer: clip(process.env.DASHBOARD_PANEL_FOOTER || custom.footer || DEFAULT_PANEL.footer, 2048)
  };
}

function mkEmbed({ title, description, color, fields = [], footer }) {
  const embed = new EmbedBuilder()
    .setColor(color ?? 0x0075ff);

  if (title) {
    embed.setTitle(clip(title, 256));
  }
  if (description) {
    embed.setDescription(clip(description, 4096));
  }
  if (fields.length) {
    embed.addFields(fields.slice(0, 25).map(field => ({
      name: clip(field.name, 256),
      value: clip(field.value || 'Unavailable', 1024),
      inline: Boolean(field.inline)
    })));
  }
  if (footer) {
    embed.setFooter({ text: clip(footer, 2048) });
  }

  return embed;
}

function dashboardPanelPayload(state = readState()) {
  const panel = getPanelConfig(state);
  const button = new ButtonBuilder()
    .setCustomId(DASHBOARD_BUTTON_ID)
    .setLabel('Dashboard')
    .setStyle(ButtonStyle.Primary);

  return {
    embeds: [
      mkEmbed({
        title: panel.title,
        description: panel.content,
        color: panel.color,
        footer: panel.footer
      })
    ],
    components: [new ActionRowBuilder().addComponents(button)]
  };
}

function getDisplayName(interaction) {
  return (
    interaction.member?.displayName ||
    interaction.user.globalName ||
    interaction.user.username
  );
}

function formatUnixTimestamp(value, style = 'R') {
  if (value === null) {
    return 'Never';
  }

  const unix = Number(value);
  return Number.isFinite(unix) && unix > 0
    ? `<t:${Math.floor(unix)}:${style}>`
    : 'Unavailable';
}

function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)).toLocaleString('en-GB') : '0';
}

function normalizeTier(value) {
  const tier = String(value || '').trim().toLowerCase();
  return PLAN_BY_KEY.has(tier) ? tier : 'affordable';
}

function planName(tier) {
  return PLAN_BY_KEY.get(normalizeTier(tier))?.name || 'Affordable';
}

function planCap(tier) {
  return PLAN_CAPS[normalizeTier(tier)] || PLAN_CAPS.affordable;
}

function userHasKeys(profile) {
  return profileKeys(profile).length > 0;
}

function planPurchaseLine(plan) {
  return `**${plan.name}** (${plan.price}) - ${formatNumber(PLAN_CAPS[plan.key])} weekly tokens - [Buy](${URLS.buy[plan.key]})`;
}

function planPurchaseLines() {
  return PLANS.map(planPurchaseLine).join('\n');
}

function gettingStartedText() {
  return `
Steps:
1. Buy a plan from [Patreon](${URLS.patreon}).
2. Link the same Patreon email here to show your keys.
3. Download the extension from [GitHub Releases](${URLS.release}) and extract the zip file.
4. Open \`chrome://extensions\`, turn on Developer Mode, then load the extracted folder.
5. Paste your key into the SparxSolver card in the extension and start using our service.
`.trim();
}

function formatMemberCount(value) {
  const count = Number(value);
  if (!Number.isFinite(count)) {
    return '0 Members';
  }

  const safeCount = Math.max(0, Math.floor(count));
  return `${safeCount} ${safeCount === 1 ? 'Member' : 'Members'}`;
}

function getPlanMemberCounts(guild) {
  const fallback = {
    affordable: 7,
    basic: 1,
    pro: 0,
    premium: 1
  };

  const counts = {};
  for (const plan of PLANS) {
    const cachedCount = Number(guild?.roles?.cache?.get(plan.roleId)?.members?.size);
    counts[plan.key] = Number.isFinite(cachedCount) && cachedCount > 0
      ? cachedCount
      : fallback[plan.key];
  }

  return counts;
}

function onboardingCustomId(userId, page) {
  return `${ONBOARDING_NAV_PREFIX}:${userId}:${Math.max(0, Math.min(ONBOARDING_LAST_PAGE, Number(page) || 0))}`;
}

function parseOnboardingCustomId(customId) {
  const parts = String(customId || '').split(':');
  if (parts.length !== 3 || parts[0] !== ONBOARDING_NAV_PREFIX) {
    return null;
  }

  const page = Number.parseInt(parts[2], 10);
  return {
    userId: parts[1],
    page: Number.isFinite(page) ? Math.max(0, Math.min(ONBOARDING_LAST_PAGE, page)) : 0
  };
}

function onboardingActionButton(interaction, page) {
  if (page === 2) {
    return linkEmailButton(interaction, 'Link Email');
  }

  if (page === 4) {
    return linkEmailButton(interaction, 'Enter Email');
  }

  if (page === 3) {
    return new ButtonBuilder()
      .setLabel('Download Extension')
      .setStyle(ButtonStyle.Link)
      .setURL(URLS.release);
  }

  return new ButtonBuilder()
    .setLabel('Buy Plan')
    .setStyle(ButtonStyle.Link)
    .setURL(URLS.patreon);
}

function onboardingRows(interaction, page) {
  const actionButton = onboardingActionButton(interaction, page);
  const buttons = [
    new ButtonBuilder()
      .setCustomId(onboardingCustomId(interaction.user.id, page - 1))
      .setLabel('Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    actionButton
  ];

  if (page !== 2 && page !== 4) {
    buttons.push(linkEmailButton(interaction, 'Enter Email'));
  }

  buttons.push(
    new ButtonBuilder()
      .setCustomId(onboardingCustomId(interaction.user.id, page + 1))
      .setLabel('Next')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= ONBOARDING_LAST_PAGE)
  );

  return [
    new ActionRowBuilder().addComponents(...buttons)
  ];
}

function onboardingPlansPayload(interaction) {
  const counts = getPlanMemberCounts(interaction.guild);
  return {
    title: 'Plans',
    color: 0x2ecc71,
    fields: [
      {
        name: 'Plans',
        value: `╭─<@&${PLAN_ROLE_IDS.affordable}>
╰GPT-4o (1000 tokens)

╭─<@&${PLAN_ROLE_IDS.basic}>
│ GPT-5.4-mini (2222 tokens)
╰Perfect for most users

╭─<@&${PLAN_ROLE_IDS.pro}>
│ GPT-5.4 (666 tokens)
│ High accuracy
╰Fast responses

╭─<@&${PLAN_ROLE_IDS.premium}>
│ GPT-5.5 (333 tokens)
│ Perfect accuracy
╰Instant responses`
      },
      {
        name: 'Payment Methods',
        value: `**<:patreon:1507108195221635113> Patreon ([Click to join](${URLS.patreon})):**
-> [[Buy](${URLS.buy.affordable})] <@&${PLAN_ROLE_IDS.affordable}> - £1/month (${formatMemberCount(counts.affordable)})
-> [[Buy](${URLS.buy.basic})] <@&${PLAN_ROLE_IDS.basic}> - £3/month (${formatMemberCount(counts.basic)})
-> [[Buy](${URLS.buy.pro})] <@&${PLAN_ROLE_IDS.pro}> - £5/month (${formatMemberCount(counts.pro)})
-> [[Buy](${URLS.buy.premium})] <@&${PLAN_ROLE_IDS.premium}> - £10/month (${formatMemberCount(counts.premium)})`
      }
    ]
  };
}

function onboardingPagePayload(interaction, profile = {}, page = 0, message = '') {
  const safePage = Math.max(0, Math.min(ONBOARDING_LAST_PAGE, Number(page) || 0));
  let embedData;

  if (safePage === 1) {
    embedData = onboardingPlansPayload(interaction);
  } else if (safePage === 2) {
    embedData = {
      title: 'Link Patreon Email',
      color: 0xe67e22,
      description: [
        message,
        'Link the same Patreon email here to show your SparxSolver keys, expiry dates and weekly token usage.',
        'Use the middle button below to enter your Patreon email.'
      ].filter(Boolean).join('\n\n')
    };
  } else if (safePage === 3) {
    embedData = {
      title: 'Install The Extension',
      color: 0x3498db,
      description: [
        `Download the extension from [GitHub Releases](${URLS.release}) and extract the zip file.`,
        'Open `chrome://extensions`, turn on Developer Mode, then load the extracted folder.'
      ].join('\n')
    };
  } else if (safePage === 4) {
    embedData = {
      title: 'Link And Use Your Key',
      color: 0x2ecc71,
      description: [
        message,
        'Paste your key into the SparxSolver card in the extension and start using our service.',
        'If your dashboard still does not show your account, use Enter Email below to link the same Patreon email here.'
      ].filter(Boolean).join('\n\n')
    };
  } else {
    embedData = {
      title: `${getDisplayName(interaction)} Dashboard`,
      color: 0x2ecc71,
      description: [message, gettingStartedText()].filter(Boolean).join('\n\n'),
      footer: 'Use Previous and Next to go through the setup steps.'
    };
  }

  return {
    embeds: [mkEmbed(embedData)],
    components: onboardingRows(interaction, safePage)
  };
}

function keyExpired(key) {
  if (typeof key?.expired === 'boolean') {
    return key.expired;
  }
  if (key?.expires === null) {
    return false;
  }

  const unix = Number(key?.expires);
  return Number.isFinite(unix) && unix > 0 && unix <= Math.floor(Date.now() / 1000);
}

function usageBar(used, cap) {
  const safeCap = Math.max(1, Number(cap) || 1);
  const usedTokens = Math.max(0, Number(used) || 0);
  const leftRatio = Math.max(0, Math.min(1, (safeCap - usedTokens) / safeCap));
  const leftPercent = Math.max(0, Math.round(leftRatio * 100));
  const leftBlocks = Math.max(0, Math.min(20, Math.round(leftPercent / 5)));
  const usedBlocks = 20 - leftBlocks;

  return `${'█'.repeat(leftBlocks)}${'░'.repeat(usedBlocks)}\n${leftPercent}% left`;
}

function usageLeftPercent(used, cap) {
  const safeCap = Math.max(1, Number(cap) || 1);
  const usedTokens = Math.max(0, Number(used) || 0);
  return Math.max(0, Math.round(((safeCap - usedTokens) / safeCap) * 100));
}

function usageBarOnly(used, cap) {
  return usageBar(used, cap).split('\n')[0];
}

function dashboardCustomId(prefix, userId) {
  return `${prefix}:${userId}`;
}

function parseScopedCustomId(customId, prefix) {
  const expected = `${prefix}:`;
  const text = String(customId || '');
  return text.startsWith(expected) ? text.slice(expected.length) : '';
}

function isScopedToUser(interaction, prefix) {
  return parseScopedCustomId(interaction.customId, prefix) === interaction.user.id;
}

function profileKeys(profile) {
  return Array.isArray(profile?.keys) ? profile.keys : [];
}

function activeKeys(profile) {
  return profileKeys(profile).filter(key => !keyExpired(key));
}

function expiredKeys(profile) {
  return profileKeys(profile).filter(keyExpired);
}

function bestActivePlan(profile) {
  const tiers = new Set(activeKeys(profile).map(key => normalizeTier(key.tier)));
  return PLAN_PRIORITY.find(tier => tiers.has(tier)) || null;
}

function nextExpiry(profile) {
  const expiries = activeKeys(profile)
    .map(key => Number(key.expires))
    .filter(value => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);

  return expiries[0] || null;
}

function linkedEmail(profile) {
  return String(profile?.email || profileKeys(profile).find(key => key.email)?.email || '').trim();
}

async function syncDashboardRoles(interaction, profile) {
  if (!interaction.guild) {
    return;
  }

  const desiredRoleIds = new Set(
    activeKeys(profile)
      .map(key => PLAN_ROLE_IDS[normalizeTier(key.tier)])
      .filter(Boolean)
  );
  const managedRoleIds = Object.values(PLAN_ROLE_IDS);
  let member;

  try {
    member = await interaction.guild.members.fetch(interaction.user.id);
  } catch (err) {
    console.warn(`Could not fetch dashboard member ${interaction.user.id}: ${err.message || err}`);
    return;
  }

  for (const roleId of managedRoleIds) {
    if (!desiredRoleIds.has(roleId) && member.roles.cache.has(roleId)) {
      await member.roles.remove(roleId, 'SparxSolver dashboard role sync').catch(err => {
        console.warn(`Could not remove dashboard role ${roleId} from ${interaction.user.id}: ${err.message || err}`);
      });
    }
  }

  for (const roleId of desiredRoleIds) {
    if (!member.roles.cache.has(roleId)) {
      await member.roles.add(roleId, 'SparxSolver dashboard role sync').catch(err => {
        console.warn(`Could not add dashboard role ${roleId} to ${interaction.user.id}: ${err.message || err}`);
      });
    }
  }
}

function keyUsageBlock(key) {
  const tier = normalizeTier(key.tier);
  const cap = planCap(tier);
  const used = Math.max(0, Number(key.weeklyTokens) || 0);
  const status = keyExpired(key) ? 'Expired' : 'Active';

  return [
    `**${key.licenseKey}**`,
    `${planName(tier)} - ${status}`,
    `Expires: ${formatUnixTimestamp(key.expires)}`,
    `Weekly tokens: ${formatNumber(used)} / ${formatNumber(cap)}`,
    usageBar(used, cap)
  ].join('\n');
}

function dashboardSelectRow(userId, selectedPage = DASHBOARD_PAGES.home) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(dashboardCustomId(DASHBOARD_SELECT_PREFIX, userId))
    .setPlaceholder('Dashboard page')
    .addOptions([
      {
        label: 'Home',
        value: DASHBOARD_PAGES.home,
        description: 'Return to your SparxSolver dashboard home',
        default: selectedPage === DASHBOARD_PAGES.home
      },
      {
        label: 'Plans & Details',
        value: DASHBOARD_PAGES.keys,
        description: 'Plan details, keys, expiry dates and weekly usage',
        default: selectedPage === DASHBOARD_PAGES.keys
      },
      {
        label: 'Support',
        value: DASHBOARD_PAGES.support,
        description: 'Open a private support ticket',
        default: selectedPage === DASHBOARD_PAGES.support
      },
      {
        label: 'Settings',
        value: DASHBOARD_PAGES.settings,
        description: 'Dashboard preferences and sign out',
        default: selectedPage === DASHBOARD_PAGES.settings
      }
    ]);

  return new ActionRowBuilder().addComponents(menu);
}

function linkEmailButton(interaction, label = 'Link Email') {
  return new ButtonBuilder()
    .setCustomId(dashboardCustomId(DASHBOARD_LINK_PREFIX, interaction.user.id))
    .setLabel(label)
    .setStyle(ButtonStyle.Primary);
}

function emailLookupRows(interaction) {
  return [
    new ActionRowBuilder().addComponents(
      linkEmailButton(interaction, 'Sign In')
    )
  ];
}

function linkEmailRow(interaction, label = 'Link Email') {
  return new ActionRowBuilder().addComponents(linkEmailButton(interaction, label));
}

function serviceActionRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Buy SparxSolver')
        .setStyle(ButtonStyle.Link)
        .setURL(URLS.patreon),
      new ButtonBuilder()
        .setLabel('Download Extension')
        .setStyle(ButtonStyle.Link)
        .setURL(URLS.release)
    )
  ];
}

function dashboardComponents(interaction, profile, selectedPage, extraRows = []) {
  const rows = [dashboardSelectRow(interaction.user.id, selectedPage)];

  rows.push(...extraRows);

  return rows.slice(0, 5);
}

function clearMessagePayload(payload) {
  return {
    content: null,
    attachments: [],
    ...payload
  };
}

function loggingInPayload(message = 'Logging in...') {
  return {
    content: message,
    embeds: [],
    components: [],
    attachments: []
  };
}

function isUnknownInteractionError(err) {
  return err?.code === 10062 || /Unknown interaction/i.test(String(err?.message || ''));
}

function noteExpiredInteraction(stage) {
  void stage;
}

async function safeDeferReply(interaction, options) {
  try {
    await interaction.deferReply(options);
    return true;
  } catch (err) {
    if (isUnknownInteractionError(err)) {
      noteExpiredInteraction('before deferReply');
      return false;
    }
    throw err;
  }
}

async function safeDeferUpdate(interaction) {
  try {
    await interaction.deferUpdate();
    return true;
  } catch (err) {
    if (isUnknownInteractionError(err)) {
      noteExpiredInteraction('before deferUpdate');
      return false;
    }
    throw err;
  }
}

async function safeUpdate(interaction, payload) {
  try {
    await interaction.update(payload);
    return true;
  } catch (err) {
    if (isUnknownInteractionError(err)) {
      noteExpiredInteraction('before update');
      return false;
    }
    throw err;
  }
}

function pruneDashboardRateLimits(now = Date.now()) {
  for (const [key, bucket] of dashboardRateLimits) {
    if (bucket.resetAt <= now) {
      dashboardRateLimits.delete(key);
    }
  }

  if (dashboardRateLimits.size <= DASHBOARD_RATE_LIMIT_MAX_KEYS) {
    return;
  }

  const entries = [...dashboardRateLimits.entries()]
    .sort((left, right) => left[1].resetAt - right[1].resetAt);
  const targetSize = Math.floor(DASHBOARD_RATE_LIMIT_MAX_KEYS * 0.8);
  for (const [key] of entries) {
    if (dashboardRateLimits.size <= targetSize) {
      break;
    }
    dashboardRateLimits.delete(key);
  }
}

function dashboardRateLimitBucket(interaction) {
  const customId = String(interaction.customId || '');

  if (customId === DASHBOARD_BUTTON_ID) {
    return 'open';
  }
  if (customId === SUPPORT_TICKET_DELETE_PREFIX) {
    return 'deleteTicket';
  }
  if (customId.startsWith(`${DASHBOARD_SELECT_PREFIX}:`)) {
    const page = interaction.values?.[0];
    return page === DASHBOARD_PAGES.upgrade || page === DASHBOARD_PAGES.support ? 'ticket' : 'select';
  }
  if (
    customId.startsWith(`${DASHBOARD_PREF_PREFIX}:`) ||
    customId.startsWith(`${DASHBOARD_PREF_RESET_PREFIX}:`) ||
    customId.startsWith(`${DASHBOARD_SIGN_OUT_PREFIX}:`)
  ) {
    return 'settings';
  }
  if (
    customId.startsWith(`${DASHBOARD_LINK_PREFIX}:`) ||
    customId.startsWith(`${DASHBOARD_LINK_MODAL_PREFIX}:`)
  ) {
    return 'modal';
  }
  if (customId.startsWith(`${SUPPORT_TICKET_PREFIX}:`)) {
    return 'ticket';
  }

  return null;
}

function consumeDashboardRateLimit(key, settings, now) {
  const current = dashboardRateLimits.get(key);
  if (!current || current.resetAt <= now) {
    dashboardRateLimits.set(key, {
      count: 1,
      resetAt: now + settings.windowMs
    });
    return { limited: false };
  }

  current.count += 1;
  if (current.count <= settings.limit) {
    return { limited: false };
  }

  return {
    limited: true,
    retryAfterMs: Math.max(0, current.resetAt - now)
  };
}

function checkDashboardRateLimit(interaction) {
  const bucketName = dashboardRateLimitBucket(interaction);
  if (!bucketName) {
    return { limited: false };
  }

  const now = Date.now();
  pruneDashboardRateLimits(now);

  const settings = DASHBOARD_RATE_LIMITS[bucketName] || DASHBOARD_RATE_LIMIT_DEFAULT;
  const userKey = `${interaction.user?.id || 'unknown'}:${bucketName}`;
  const userResult = consumeDashboardRateLimit(userKey, settings, now);
  if (userResult.limited) {
    return { ...userResult, bucket: bucketName };
  }

  const globalSettings = DASHBOARD_GLOBAL_RATE_LIMITS[bucketName];
  if (!globalSettings) {
    return { limited: false };
  }

  const globalResult = consumeDashboardRateLimit(`global:${bucketName}`, globalSettings, now);
  return globalResult.limited
    ? { ...globalResult, bucket: `global ${bucketName}` }
    : { limited: false };
}

async function acknowledgeRateLimitedInteraction(interaction, result) {
  console.warn(
    `Rate limited dashboard ${result.bucket || 'action'} for user ${interaction.user?.id || 'unknown'}; retry after ${Math.ceil((result.retryAfterMs || 0) / 1000)}s.`
  );

  if (interaction.isButton?.() || interaction.isStringSelectMenu?.()) {
    await safeDeferUpdate(interaction);
    return;
  }

  if (interaction.isModalSubmit?.()) {
    await safeUpdate(interaction, emailLookupPayload(interaction, 'Please wait a few seconds before trying again.'));
  }
}

function paymentMethodsText(interaction) {
  const counts = getPlanMemberCounts(interaction.guild);

  return `<:patreon:1506721091270475796> Patreon ([Click to join](${URLS.patreon})):
-> [[Buy](${URLS.buy.affordable})] <@&${PLAN_ROLE_IDS.affordable}> - £1/month (${formatMemberCount(counts.affordable)})
-> [[Buy](${URLS.buy.basic})] <@&${PLAN_ROLE_IDS.basic}> - £3/month (${formatMemberCount(counts.basic)})
-> [[Buy](${URLS.buy.pro})] <@&${PLAN_ROLE_IDS.pro}> - £5/month (${formatMemberCount(counts.pro)})
-> [[Buy](${URLS.buy.premium})] <@&${PLAN_ROLE_IDS.premium}> - £10/month (${formatMemberCount(counts.premium)})`;
}

function emailLookupPayload(interaction, message = '') {
  return {
    content: null,
    embeds: [
      mkEmbed({
        title: 'You are not signed in',
        description: [
          message,
          `To sign in, buy a plan from [Patreon](${URLS.patreon}).`,
          'When you are done, click Sign In and enter the email address you used on Patreon.'
        ].filter(Boolean).join('\n\n'),
        color: DASHBOARD_THEMES.blue.color
      })
    ],
    components: emailLookupRows(interaction)
  };
}

function linkAccountPayload(interaction, message = '') {
  return emailLookupPayload(interaction, message);
}

function dashboardHomePayload(interaction, profile) {
  const keys = profileKeys(profile);
  const weeklyPeriod = keys.find(key => key.weeklyPeriod)?.weeklyPeriod || 'Current week';
  const hasKeys = userHasKeys(profile);
  const header = [
    `User: ${interaction.user}`,
    `Linked email: ${linkedEmail(profile) || 'Unavailable'}`,
    `Weekly period: ${weeklyPeriod}`
  ].join('\n');
  const mainContent = hasKeys
    ? keys.map(keyUsageBlock).join('\n\n')
    : [
        'You are not registered with a SparxSolver key on this dashboard yet.',
        'Buy SparxSolver from Patreon to get access, then link your Patreon email here.',
        '',
        gettingStartedText(),
        '',
        '__Plans__',
        planPurchaseLines()
      ].join('\n');

  return {
    embeds: [
      mkEmbed({
        title: `${getDisplayName(interaction)} Dashboard`,
        description: `${header}\n\n${mainContent}`,
        color: 0x2ecc71,
        footer: hasKeys
          ? 'Use the dropdown to manage your SparxSolver account and service.'
          : 'This dashboard covers the whole SparxSolver service: buying, installing, linking and key usage.'
      })
    ],
    components: dashboardComponents(
      interaction,
      profile,
      DASHBOARD_PAGES.home,
      hasKeys ? [] : serviceActionRows()
    )
  };
}

function accountStatusPayload(interaction, profile) {
  const bestPlan = bestActivePlan(profile);
  const next = nextExpiry(profile);
  const hasKeys = userHasKeys(profile);

  return {
    embeds: [
      mkEmbed({
        title: 'Account Status',
        description: hasKeys
          ? `SparxSolver account profile for ${interaction.user}.`
          : [
              'No SparxSolver account is linked yet.',
              gettingStartedText()
            ].join('\n\n'),
        color: bestPlan ? PLAN_BY_KEY.get(bestPlan).color : 0xe67e22,
        fields: [
          { name: 'Linked Email', value: linkedEmail(profile) || 'Unavailable', inline: false },
          { name: 'Active Keys', value: String(activeKeys(profile).length), inline: true },
          { name: 'Expired Keys', value: String(expiredKeys(profile).length), inline: true },
          { name: 'Best Active Plan', value: bestPlan ? planName(bestPlan) : 'None', inline: true },
          { name: 'Next Expiry', value: next ? formatUnixTimestamp(next, 'F') : 'No active expiry', inline: false },
          { name: 'Discord Profile', value: `${interaction.user}\nID: \`${interaction.user.id}\``, inline: false }
        ]
      })
    ],
    components: dashboardComponents(
      interaction,
      profile,
      DASHBOARD_PAGES.account,
      hasKeys ? [] : serviceActionRows()
    )
  };
}

function plansUsagePayload(interaction, profile) {
  const keys = profileKeys(profile);
  const hasKeys = userHasKeys(profile);
  const planLines = PLANS
    .map(planPurchaseLine)
    .join('\n');
  const keyLines = keys.length
    ? keys.map(key => {
        const cap = planCap(key.tier);
        const used = Math.max(0, Number(key.weeklyTokens) || 0);
        return `**${key.licenseKey}** - ${planName(key.tier)}\n${formatNumber(used)} / ${formatNumber(cap)}\n${usageBar(used, cap)}`;
      }).join('\n\n')
    : 'No linked keys.';

  return {
    embeds: [
      mkEmbed({
        title: 'Plans & Usage',
        description: [
          '__Plan Limits__',
          planLines,
          '',
          '__Your Keys__',
          keyLines,
          '',
          hasKeys ? '' : gettingStartedText()
        ].filter(Boolean).join('\n'),
        color: 0x3498db
      })
    ],
    components: dashboardComponents(
      interaction,
      profile,
      DASHBOARD_PAGES.usage,
      hasKeys ? [] : serviceActionRows()
    )
  };
}

function supportActionRows(interaction) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(dashboardCustomId(SUPPORT_TICKET_PREFIX, interaction.user.id))
        .setLabel('Open Ticket')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(dashboardCustomId(SUPPORT_ERROR_CODES_PREFIX, interaction.user.id))
        .setLabel('Error Codes')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(dashboardCustomId(SUPPORT_INFO_PREFIX, interaction.user.id))
        .setLabel('Important Info')
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

function helpSupportPayload(interaction, profile = null) {
  const hasKeys = userHasKeys(profile);
  return {
    embeds: [
      mkEmbed({
        title: 'Support',
        description: [
          hasKeys
            ? 'Use this page if your dashboard is missing keys, showing the wrong plan, or your weekly usage looks wrong.'
            : 'Use this page if you need help buying SparxSolver, installing the extension, linking your email, or using your key.',
          hasKeys ? '' : gettingStartedText(),
          '',
          'Press Open Ticket to create a private support channel.',
          `Include your Discord user ID if staff asks for it: \`${interaction.user.id}\`.`,
          'You can also view error codes and important service information from the buttons below.',
          'Do not post full license keys in public channels.'
        ].join('\n'),
        color: 0x5865f2
      })
    ],
    components: dashboardComponents(
      interaction,
      profile,
      DASHBOARD_PAGES.support,
      [
        ...supportActionRows(interaction),
        ...(hasKeys ? [] : serviceActionRows())
      ]
    )
  };
}

function supportErrorCodesPayload(interaction, profile = null) {
  return {
    content: null,
    embeds: [
      mkEmbed({
        title: 'Error Codes',
        description: ERROR_CODES
          .map(([code, label]) => `**${code}** - ${label}`)
          .join('\n'),
        color: 0xe67e22,
        footer: 'Error code 14 means the weekly token limit for that key is fully used.'
      })
    ],
    components: dashboardComponents(
      interaction,
      profile || { keys: [] },
      DASHBOARD_PAGES.support,
      supportActionRows(interaction)
    )
  };
}

function supportImportantInfoPayload(interaction, profile = null) {
  return {
    content: null,
    embeds: [
      mkEmbed({
        title: 'Important Information',
        description: [
          '__Privacy__',
          'SparxSolver uses your license key, Patreon email and Discord ID only to verify account access and show your dashboard.',
          'Question screenshots are sent to the solving service to generate answers and are not shown in public Discord channels.',
          '',
          '__Terms__',
          'Use SparxSolver only on your own account and do not share license keys.',
          'Weekly token limits apply per key and reset each ISO week using London time.',
          '',
          '__Support__',
          'Support tickets are private to you and staff. Do not paste passwords, payment details or full private account data unless staff specifically asks for safe details.',
          '',
          '__Service Notes__',
          'Weekly token limits reset by ISO week using London time.',
          'A key cannot be used once its weekly tokens are at or above its plan limit.',
          'Changing your email relinks this Discord dashboard to keys found under the new Patreon email.',
          '',
          '__Install__',
          gettingStartedText()
        ].join('\n'),
        color: 0x0075ff
      })
    ],
    components: dashboardComponents(
      interaction,
      profile || { keys: [] },
      DASHBOARD_PAGES.support,
      supportActionRows(interaction)
    )
  };
}

function settingsPayload(interaction, profile) {
  return {
    embeds: [
      mkEmbed({
        title: 'Settings',
        description: [
          `Discord profile: ${interaction.user}`,
          `Current linked email: ${linkedEmail(profile) || 'Not linked'}`,
          '',
          'Use the button below to link or change the Patreon email used for this dashboard.',
          '',
          userHasKeys(profile) ? '' : gettingStartedText()
        ].join('\n'),
        color: 0x95a5a6
      })
    ],
    components: dashboardComponents(interaction, profile, DASHBOARD_PAGES.settings)
  };
}

async function dashboardPagePayload(interaction, profile, page) {
  if (!userHasKeys(profile)) {
    return emailLookupPayload(interaction);
  }

  switch (page) {
    case DASHBOARD_PAGES.keys:
      return renderedKeysUsagePayload(interaction, profile);
    case DASHBOARD_PAGES.upgrade:
    case DASHBOARD_PAGES.support:
      return renderedHelpSupportPayload(interaction, profile);
    case DASHBOARD_PAGES.settings:
      return renderedSettingsPayload(interaction, profile);
    case DASHBOARD_PAGES.home:
    default:
      return renderedDashboardHomePayload(interaction, profile);
  }
}

function linkAccountModal(userId) {
  const modal = new ModalBuilder()
    .setCustomId(dashboardCustomId(DASHBOARD_LINK_MODAL_PREFIX, userId))
    .setTitle('Sign In');

  const email = new TextInputBuilder()
    .setCustomId('email')
    .setLabel('Email address used on Patreon')
    .setPlaceholder('example@gmail.com')
    .setStyle(TextInputStyle.Short)
    .setMinLength(5)
    .setMaxLength(254)
    .setRequired(true);

  return modal.addComponents(new ActionRowBuilder().addComponents(email));
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function workerPost(route, body) {
  const workerUrl = env('LICENSE_WORKER_URL').replace(/\/+$/, '');
  const secret = env('LICENSE_WORKER_SECRET');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), WORKER_TIMEOUT_MS);

  try {
    const res = await fetch(`${workerUrl}${route}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`
      },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.error || `Worker request failed with status ${res.status}.`);
    }

    return json;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchDashboardProfile(userId, email) {
  const normalizedEmail = normalizeEmail(email);
  return workerPost('/dashboard/profile', {
    discordUserId: userId,
    ...(normalizedEmail ? { email: normalizedEmail, replaceEmail: true } : {})
  });
}

async function updateDashboardPreferences(userId, preferences = {}, reset = false) {
  return workerPost('/dashboard/preferences', {
    discordUserId: userId,
    ...(reset ? { reset: true } : { preferences })
  });
}

async function signOutDashboard(userId) {
  return workerPost('/dashboard/signout', {
    discordUserId: userId
  });
}

function normalizeDashboardPreferences(value = {}) {
  const raw = value && typeof value === 'object' ? value : {};
  const accentColor = String(raw.accentColor || DEFAULT_DASHBOARD_PREFERENCES.accentColor).trim().toLowerCase();
  const layout = String(raw.layout || DEFAULT_DASHBOARD_PREFERENCES.layout).trim().toLowerCase();
  const usageDisplay = String(raw.usageDisplay || DEFAULT_DASHBOARD_PREFERENCES.usageDisplay).trim().toLowerCase();

  return {
    accentColor: Object.prototype.hasOwnProperty.call(DASHBOARD_THEMES, accentColor) ? accentColor : DEFAULT_DASHBOARD_PREFERENCES.accentColor,
    layout: ['compact', 'detailed'].includes(layout) ? layout : DEFAULT_DASHBOARD_PREFERENCES.layout,
    usageDisplay: ['tokens_percent', 'tokens', 'percent'].includes(usageDisplay) ? usageDisplay : DEFAULT_DASHBOARD_PREFERENCES.usageDisplay
  };
}

function dashboardPreferences(profile) {
  return normalizeDashboardPreferences(profile?.preferences);
}

function dashboardTheme(profile) {
  return DASHBOARD_THEMES.blue;
}

function countKeysByPlan(keys = []) {
  const counts = Object.fromEntries(PLANS.map(plan => [plan.key, 0]));
  for (const key of keys) {
    counts[normalizeTier(key.tier)] += 1;
  }
  return counts;
}

function planCountLines(profile) {
  const activeCounts = countKeysByPlan(activeKeys(profile));
  const expiredCounts = countKeysByPlan(expiredKeys(profile));

  return PLANS
    .map(plan => `**${plan.name}**: ${activeCounts[plan.key]} active / ${expiredCounts[plan.key]} expired`)
    .join('\n');
}

function usageSummary(profile) {
  const keys = activeKeys(profile);
  const used = keys.reduce((sum, key) => sum + Math.max(0, Number(key.weeklyTokens) || 0), 0);
  const cap = keys.reduce((sum, key) => sum + planCap(key.tier), 0);
  const remaining = Math.max(0, cap - used);
  const leftPercent = cap > 0 ? Math.max(0, Math.round((remaining / cap) * 100)) : 0;
  return { used, cap, remaining, leftPercent };
}

function usageText(used, cap, preferences = DEFAULT_DASHBOARD_PREFERENCES) {
  const pct = cap > 0 ? Math.max(0, Math.min(100, Math.round(((cap - used) / cap) * 100))) : 0;
  if (preferences.usageDisplay === 'tokens') {
    return `${formatNumber(used)} / ${formatNumber(cap)} tokens`;
  }
  if (preferences.usageDisplay === 'percent') {
    return `${pct}% left`;
  }
  return `${formatNumber(used)} / ${formatNumber(cap)} tokens (${pct}% left)`;
}

function nextUpgradePlan(profile) {
  const current = bestActivePlan(profile);
  const order = ['affordable', 'basic', 'pro', 'premium'];
  if (!current) {
    return PLAN_BY_KEY.get('affordable');
  }

  const index = order.indexOf(current);
  return index >= 0 && index < order.length - 1 ? PLAN_BY_KEY.get(order[index + 1]) : null;
}

function upgradeRecommendation(profile) {
  const next = nextUpgradePlan(profile);
  if (!next) {
    return 'You already have Premium active. Keep an eye on weekly usage and expiry dates.';
  }

  const current = bestActivePlan(profile);
  return current
    ? `Recommended upgrade: **${next.name}** (${next.price}) for ${formatNumber(PLAN_CAPS[next.key])} weekly tokens.`
    : `Recommended start: **${next.name}** (${next.price}) for ${formatNumber(PLAN_CAPS[next.key])} weekly tokens.`;
}

function keyUsageLines(profile) {
  const keys = profileKeys(profile);
  if (!keys.length) {
    return 'No linked keys.';
  }

  return keys.map(key => {
    const tier = normalizeTier(key.tier);
    const used = Math.max(0, Number(key.weeklyTokens) || 0);
    const cap = planCap(tier);
    const status = keyExpired(key) ? 'Expired' : 'Active';
    const leftPercent = usageLeftPercent(used, cap);
    return [
      `${key.licenseKey} - ${planName(tier)} (${status})`,
      usageBarOnly(used, cap),
      `Weekly tokens: ${formatNumber(used)} / ${formatNumber(cap)} (${leftPercent}% left)`,
      `Expires: ${formatUnixTimestamp(key.expires)}`
    ].join('\n');
  }).join('\n\n');
}

function dashboardRows(interaction, selectedPage, extraRows = []) {
  return [dashboardSelectRow(interaction.user.id, selectedPage), ...extraRows].slice(0, 5);
}

function dashboardRefreshRow(interaction) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(dashboardCustomId(DASHBOARD_REFRESH_PREFIX, interaction.user.id))
      .setLabel('Refresh Dashboard')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setLabel('Download Extension')
      .setStyle(ButtonStyle.Link)
      .setURL(URLS.release),
    new ButtonBuilder()
      .setLabel('Buy / Upgrade')
      .setStyle(ButtonStyle.Link)
      .setURL(URLS.patreon)
  );
}

function upgradeButtonRow() {
  return new ActionRowBuilder().addComponents(
    ...PLANS.map(plan => new ButtonBuilder()
      .setLabel(plan.name)
      .setStyle(ButtonStyle.Link)
      .setURL(URLS.buy[plan.key]))
  );
}

function preferenceCustomId(userId, key) {
  return `${DASHBOARD_PREF_PREFIX}:${userId}:${key}`;
}

function parsePreferenceCustomId(customId) {
  const parts = String(customId || '').split(':');
  if (parts.length !== 3 || parts[0] !== DASHBOARD_PREF_PREFIX) {
    return null;
  }
  return { userId: parts[1], key: parts[2] };
}

function preferenceSelectRow(interaction, profile, key, placeholder, options) {
  const preferences = dashboardPreferences(profile);
  const menu = new StringSelectMenuBuilder()
    .setCustomId(preferenceCustomId(interaction.user.id, key))
    .setPlaceholder(placeholder)
    .addOptions(options.map(option => ({
      label: option.label,
      value: option.value,
      description: option.description,
      default: preferences[key] === option.value
    })));

  return new ActionRowBuilder().addComponents(menu);
}

function settingsRows(interaction, profile) {
  return [
    new ActionRowBuilder().addComponents(
      linkEmailButton(interaction, 'Change Email'),
      new ButtonBuilder()
        .setCustomId(dashboardCustomId(DASHBOARD_SIGN_OUT_PREFIX, interaction.user.id))
        .setLabel('Sign Out')
        .setStyle(ButtonStyle.Danger)
    )
  ];
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function fillRoundedRect(ctx, x, y, width, height, radius, color) {
  ctx.fillStyle = color;
  roundedRect(ctx, x, y, width, height, radius);
  ctx.fill();
}

function drawProgress(ctx, x, y, width, height, used, cap, theme) {
  const ratio = cap > 0 ? Math.max(0, Math.min(1, used / cap)) : 0;
  fillRoundedRect(ctx, x, y, width, height, height / 2, '#24313d');
  if (ratio > 0) {
    fillRoundedRect(ctx, x, y, Math.max(height, width * ratio), height, height / 2, theme.hex);
  }
}

function setFont(ctx, weight, size) {
  ctx.font = `${weight} ${size}px Arial`;
}

function truncateText(ctx, text, maxWidth) {
  const value = String(text || '');
  if (ctx.measureText(value).width <= maxWidth) {
    return value;
  }

  let next = value;
  while (next.length > 1 && ctx.measureText(`${next}...`).width > maxWidth) {
    next = next.slice(0, -1);
  }
  return `${next}...`;
}

function drawText(ctx, text, x, y, maxWidth, color = '#ffffff') {
  ctx.fillStyle = color;
  ctx.fillText(truncateText(ctx, text, maxWidth), x, y);
}

function drawFittedText(ctx, text, x, y, maxWidth, weight, maxSize, minSize, color = '#ffffff') {
  for (let size = maxSize; size >= minSize; size -= 1) {
    setFont(ctx, weight, size);
    if (ctx.measureText(String(text || '')).width <= maxWidth) {
      ctx.fillStyle = color;
      ctx.fillText(String(text || ''), x, y);
      return size;
    }
  }

  setFont(ctx, weight, minSize);
  drawText(ctx, text, x, y, maxWidth, color);
  return minSize;
}

function dashboardImageFileName(interaction) {
  return 'SparxSolver-Dashboard.png';
}

async function loadUserAvatar(interaction) {
  try {
    const url = interaction.user.displayAvatarURL({ extension: 'png', size: 256 });
    const res = await fetch(url);
    if (!res.ok) {
      return null;
    }
    return await loadImage(Buffer.from(await res.arrayBuffer()));
  } catch {
    return null;
  }
}

async function renderDashboardImage(interaction, profile, selectedPage = DASHBOARD_PAGES.home) {
  const width = 1200;
  const height = 675;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const theme = dashboardTheme(profile);
  const summary = usageSummary(profile);
  const best = bestActivePlan(profile);
  const next = nextUpgradePlan(profile);
  const activeCounts = countKeysByPlan(activeKeys(profile));
  const expiredCounts = countKeysByPlan(expiredKeys(profile));
  const avatar = await loadUserAvatar(interaction);
  const username = interaction.user.username || interaction.user.id;
  const nextExpiryValue = nextExpiry(profile);

  ctx.fillStyle = '#061019';
  ctx.fillRect(0, 0, width, height);
  fillRoundedRect(ctx, 36, 36, width - 72, height - 72, 28, '#0b1420');
  fillRoundedRect(ctx, 60, 60, width - 120, 118, 24, '#10273b');

  ctx.fillStyle = '#ffffff';
  setFont(ctx, '700', 36);
  drawText(ctx, 'SparxSolver Dashboard', 204, 106, 620);
  setFont(ctx, '500', 21);
  drawText(ctx, `@${username}`, 204, 142, 420, '#b7c8d7');

  ctx.save();
  ctx.beginPath();
  ctx.arc(125, 119, 48, 0, Math.PI * 2);
  ctx.clip();
  if (avatar) {
    ctx.drawImage(avatar, 77, 71, 96, 96);
  } else {
    ctx.fillStyle = theme.hex;
    ctx.fillRect(77, 71, 96, 96);
    ctx.fillStyle = '#ffffff';
    setFont(ctx, '700', 36);
    ctx.textAlign = 'center';
    ctx.fillText(String(username || '?').slice(0, 1).toUpperCase(), 125, 132);
    ctx.textAlign = 'left';
  }
  ctx.restore();
  ctx.lineWidth = 4;
  ctx.strokeStyle = theme.hex;
  ctx.beginPath();
  ctx.arc(125, 119, 50, 0, Math.PI * 2);
  ctx.stroke();

  const cardY = 214;
  const cardH = 142;
  const cardW = 330;
  const gap = 45;
  const cardX1 = 60;
  const cardX2 = cardX1 + cardW + gap;
  const cardX3 = cardX2 + cardW + gap;
  for (const x of [cardX1, cardX2, cardX3]) {
    fillRoundedRect(ctx, x, cardY, cardW, cardH, 20, '#111f2b');
  }

  setFont(ctx, '700', 18);
  drawText(ctx, 'Best Plan', cardX1 + 28, cardY + 40, cardW - 56, theme.soft);
  drawText(ctx, 'Weekly Tokens', cardX2 + 28, cardY + 40, cardW - 56, theme.soft);
  drawText(ctx, 'Upgrade', cardX3 + 28, cardY + 40, cardW - 56, theme.soft);

  drawFittedText(ctx, best ? planName(best) : 'No Plan', cardX1 + 28, cardY + 86, cardW - 56, '700', 32, 22);
  setFont(ctx, '500', 17);
  drawText(ctx, `Next expiry: ${nextExpiryValue ? new Date(nextExpiryValue * 1000).toLocaleDateString('en-GB') : 'None'}`, cardX1 + 28, cardY + 118, cardW - 56, '#aebdca');

  const tokenMain = summary.cap > 0 ? `${formatNumber(summary.used)} / ${formatNumber(summary.cap)} tokens` : 'No quota';
  const tokenSub = summary.cap > 0 ? `${summary.leftPercent}% left` : 'No linked token quota';
  drawFittedText(ctx, tokenMain, cardX2 + 28, cardY + 84, cardW - 56, '700', 28, 18);
  drawProgress(ctx, cardX2 + 28, cardY + 98, cardW - 56, 14, summary.used, summary.cap, theme);
  setFont(ctx, '500', 16);
  drawText(ctx, tokenSub, cardX2 + 28, cardY + 126, cardW - 56, '#aebdca');

  drawFittedText(ctx, next ? next.name : 'Premium', cardX3 + 28, cardY + 86, cardW - 56, '700', 32, 22);
  setFont(ctx, '500', 16);
  drawText(ctx, next ? `${next.price} - ${formatNumber(PLAN_CAPS[next.key])} weekly tokens` : 'Top plan active', cardX3 + 28, cardY + 118, cardW - 56, '#aebdca');

  const bottomY = 398;
  fillRoundedRect(ctx, 60, bottomY, 510, 210, 20, '#0f1b25');
  fillRoundedRect(ctx, 610, bottomY, 530, 210, 20, '#0f1b25');

  setFont(ctx, '700', 20);
  drawText(ctx, 'Owned Plans', 88, bottomY + 44, 430, theme.soft);
  drawText(ctx, 'Key Usage', 638, bottomY + 44, 450, theme.soft);

  let y = bottomY + 82;
  setFont(ctx, '500', 19);
  for (const plan of PLANS) {
    ctx.fillStyle = '#ffffff';
    drawText(ctx, `${plan.name}: ${activeCounts[plan.key]} active`, 88, y, 210);
    ctx.fillStyle = '#7f8e9a';
    drawText(ctx, `${expiredCounts[plan.key]} expired`, 330, y, 160, '#7f8e9a');
    y += 32;
  }

  y = bottomY + 82;
  const shownKeys = [...activeKeys(profile), ...expiredKeys(profile)].slice(0, 4);
  if (!shownKeys.length) {
    ctx.fillStyle = '#ffffff';
    setFont(ctx, '500', 22);
    drawText(ctx, 'No keys linked yet.', 638, y, 430);
  } else {
    setFont(ctx, '500', 17);
    for (const key of shownKeys) {
      const used = Math.max(0, Number(key.weeklyTokens) || 0);
      const cap = planCap(key.tier);
      const leftPct = cap > 0 ? Math.max(0, Math.round(((cap - used) / cap) * 100)) : 0;
      const label = keyExpired(key)
        ? `${key.licenseKey} - ${planName(key.tier)} expired`
        : `${key.licenseKey} - ${planName(key.tier)}`;
      ctx.fillStyle = '#ffffff';
      drawText(ctx, label, 638, y, 270);
      ctx.fillStyle = '#aebdca';
      drawText(ctx, `${formatNumber(used)} / ${formatNumber(cap)}`, 920, y, 150, '#aebdca');
      drawText(ctx, `${leftPct}%`, 1078, y, 50, '#aebdca');
      drawProgress(ctx, 638, y + 11, 430, 10, used, cap, theme);
      y += 40;
    }
    if (profileKeys(profile).length > shownKeys.length) {
      drawText(ctx, `+${profileKeys(profile).length - shownKeys.length} more keys`, 638, y, 430, '#aebdca');
    }
  }

  return canvas.toBuffer('image/png');
}

async function renderedDashboardPayload(interaction, profile, selectedPage, embedData, extraRows = []) {
  const theme = dashboardTheme(profile);
  const components = dashboardRows(interaction, selectedPage, extraRows);
  const embed = mkEmbed({ color: theme.color, ...embedData });

  if (selectedPage !== DASHBOARD_PAGES.home) {
    return { content: null, embeds: [embed], components, files: [], attachments: [] };
  }

  try {
    const image = await renderDashboardImage(interaction, profile, selectedPage);
    const fileName = dashboardImageFileName(interaction);
    const attachment = new AttachmentBuilder(image, { name: fileName });
    embed.setImage(`attachment://${fileName}`);
    return { content: null, embeds: [embed], components, files: [attachment], attachments: [] };
  } catch (err) {
    console.warn(`Dashboard image render failed: ${err.stack || err.message || err}`);
    return { content: null, embeds: [embed], components, attachments: [] };
  }
}

async function renderedDashboardHomePayload(interaction, profile) {
  return renderedDashboardPayload(interaction, profile, DASHBOARD_PAGES.home, {
    title: 'Home'
  });
}

async function renderedKeysUsagePayload(interaction, profile) {
  return renderedDashboardPayload(interaction, profile, DASHBOARD_PAGES.keys, {
    title: 'Plans & Details',
    description: keyUsageLines(profile),
    footer: 'Weekly limits reset each ISO week using London time.'
  });
}

async function renderedPlansUpgradePayload(interaction, profile) {
  const next = nextUpgradePlan(profile);

  return renderedDashboardPayload(interaction, profile, DASHBOARD_PAGES.upgrade, {
    title: 'Support',
    description: upgradeRecommendation(profile),
    fields: [
      { name: 'Your Plan Counts', value: planCountLines(profile), inline: false },
      { name: 'Payment Methods', value: paymentMethodsText(interaction), inline: false },
      {
        name: 'Recommended Action',
        value: next
          ? `[Upgrade to ${next.name}](${URLS.buy[next.key]}) and press Refresh Dashboard after Patreon updates your account.`
          : 'You are already on Premium. Press Refresh Dashboard after renewing or changing keys.',
        inline: false
      }
    ]
  });
}

async function renderedSettingsPayload(interaction, profile) {
  const theme = dashboardTheme(profile);

  return renderedDashboardPayload(interaction, profile, DASHBOARD_PAGES.settings, {
    title: 'Settings',
    description: 'Manage the Patreon email linked to this Discord account.',
    color: theme.color,
    fields: [
      { name: 'Linked Email', value: linkedEmail(profile) || 'Not linked', inline: false }
    ]
  }, settingsRows(interaction, profile));
}

async function renderedHelpSupportPayload(interaction, profile) {
  return renderedDashboardPayload(interaction, profile, DASHBOARD_PAGES.support, {
    title: 'Support',
    description: [
      'Open a private ticket if your keys, plan, payment sync or weekly token usage look wrong.',
      `Discord user ID: \`${interaction.user.id}\``,
      'You can also view error codes and important service information from the buttons below.',
      'Do not post full license keys in public channels.'
    ].join('\n'),
    color: 0x5865f2
  });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function purgeChannelMessages(channel) {
  while (true) {
    const batch = await channel.messages.fetch({ limit: PURGE_BATCH_SIZE });
    if (!batch.size) {
      return;
    }

    const deleted = await channel.bulkDelete(batch, true).catch(() => null);
    const deletedCount = deleted?.size || 0;
    const remaining = batch.filter(message => !deleted?.has(message.id));
    let individuallyDeleted = 0;

    for (const message of remaining.values()) {
      if (await message.delete().then(() => true).catch(() => false)) {
        individuallyDeleted += 1;
      }
    }

    if (deletedCount + individuallyDeleted === 0) {
      throw new Error(`Channel ${channel.id} could not be purged.`);
    }

    await sleep(1000);
  }
}

async function resendDashboardPanel() {
  const channel = await bot.channels.fetch(DASHBOARD_CHANNEL_ID);
  if (!channel?.isTextBased() || typeof channel.send !== 'function') {
    throw new Error(`Channel ${DASHBOARD_CHANNEL_ID} is missing or is not a text channel.`);
  }

  const state = readState();
  const payload = dashboardPanelPayload(state);

  await purgeChannelMessages(channel);

  const message = await channel.send(payload);
  state.messageIds = state.messageIds || {};
  state.messageIds[STATE_MESSAGE_KEY] = message.id;
  writeState(state);
  console.log(`Dashboard panel sent to ${DASHBOARD_CHANNEL_ID}: ${message.id}`);
  return message;
}

function ticketTopic(userId, deleteAt, warned = false) {
  return `${TICKET_TOPIC_PREFIX}${userId};type:${TICKET_PREFIX};delete-at:${Math.floor(deleteAt)};warned:${warned ? 1 : 0}`;
}

function parseTicketTopic(topic) {
  const text = String(topic || '');
  if (!text.startsWith(TICKET_TOPIC_PREFIX)) {
    return null;
  }

  const [userId, ...parts] = text.slice(TICKET_TOPIC_PREFIX.length).split(';');
  const meta = {
    userId: String(userId || '').trim(),
    type: TICKET_PREFIX,
    deleteAt: null,
    warned: false
  };

  for (const part of parts) {
    const idx = part.indexOf(':');
    if (idx <= 0) {
      continue;
    }

    const key = part.slice(0, idx);
    const value = part.slice(idx + 1);
    if (key === 'type') {
      meta.type = String(value || '').trim() || TICKET_PREFIX;
    } else if (key === 'delete-at') {
      const unix = Number(value);
      meta.deleteAt = Number.isFinite(unix) ? Math.floor(unix) : null;
    } else if (key === 'warned') {
      meta.warned = value === '1' || value === 'true';
    }
  }

  return meta.userId ? meta : null;
}

async function findOpenTicket(guild, userId) {
  const channels = await guild.channels.fetch();
  return channels.find(channel => {
    if (channel?.type !== ChannelType.GuildText) {
      return false;
    }

    const meta = parseTicketTopic(channel.topic);
    return meta?.userId === userId && meta.type === TICKET_PREFIX;
  }) || null;
}

function formatTicketDate(unix) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TICKET_TIME_ZONE,
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date(unix * 1000));
  const byType = Object.fromEntries(parts.map(part => [part.type, part.value]));

  return `${byType.weekday}, ${byType.day} ${byType.month} ${byType.year} ${byType.hour}:${byType.minute}`;
}

function discordTimestamp(unix, style = 'F') {
  return `<t:${Math.floor(Number(unix) || 0)}:${style}>`;
}

function ticketExpiryText(deleteAt) {
  return `${discordTimestamp(deleteAt, 'R')} at ${discordTimestamp(deleteAt, 'F')}`;
}

function ticketOwnerDeleteText(deleteAt) {
  return `${discordTimestamp(deleteAt, 'R')} at ${discordTimestamp(deleteAt, 'F')}`;
}

function ticketDeleteRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(SUPPORT_TICKET_DELETE_PREFIX)
      .setLabel('Delete Ticket')
      .setStyle(ButtonStyle.Danger)
  );
}

function supportTicketStartText(userId, deleteAt) {
  return `Hello <@${userId}>, this is a private ticket, what is your issue?

(This ticket will self destruct ${ticketExpiryText(deleteAt)})`;
}

function clearTicketTimers(channelId) {
  const timer = ticketTimers.get(channelId);
  if (timer) {
    clearTimeout(timer);
    ticketTimers.delete(channelId);
  }
}

function scheduleTicketDelete(channel, deleteAt) {
  if (!channel?.id || !Number.isFinite(deleteAt)) {
    return;
  }

  clearTicketTimers(channel.id);
  const timer = setTimeout(() => {
    autoDeleteTicket(channel.id).catch(err => {
      console.error(`Failed to auto-delete support ticket ${channel.id}: ${err.stack || err.message || err}`);
    });
  }, Math.max(0, (deleteAt * 1000) - Date.now()));
  timer.unref?.();
  ticketTimers.set(channel.id, timer);
}

async function autoDeleteTicket(channelId) {
  try {
    const channel = await bot.channels.fetch(channelId).catch(() => null);
    if (channel && typeof channel.delete === 'function') {
      await channel.delete('Support ticket scheduled deletion');
    }
  } finally {
    clearTicketTimers(channelId);
  }
}

async function ensureTicketExpiry(channel, userId) {
  const meta = parseTicketTopic(channel.topic);
  if (Number.isFinite(meta?.deleteAt)) {
    scheduleTicketDelete(channel, meta.deleteAt);
    return meta.deleteAt;
  }

  const deleteAt = Math.floor((Date.now() + TICKET_LIFETIME_MS) / 1000);
  await channel.setTopic(ticketTopic(userId, deleteAt, false), 'Set support ticket expiry');
  scheduleTicketDelete(channel, deleteAt);
  return deleteAt;
}

async function createSupportTicket(interaction) {
  if (!interaction.guild) {
    throw new Error('Tickets can only be created inside a server.');
  }

  const existing = await findOpenTicket(interaction.guild, interaction.user.id);
  if (existing) {
    const deleteAt = await ensureTicketExpiry(existing, interaction.user.id);
    return { channel: existing, created: false, deleteAt };
  }

  const deleteAt = Math.floor((Date.now() + TICKET_LIFETIME_MS) / 1000);
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

  const channel = await interaction.guild.channels.create({
    name: `${TICKET_PREFIX}-${interaction.user.id}`,
    type: ChannelType.GuildText,
    ...(interaction.channel?.parentId ? { parent: interaction.channel.parentId } : {}),
    topic: ticketTopic(interaction.user.id, deleteAt, false),
    permissionOverwrites: overwrites
  });

  await channel.send({
    content: supportTicketStartText(interaction.user.id, deleteAt),
    components: [ticketDeleteRow()]
  });
  scheduleTicketDelete(channel, deleteAt);
  return { channel, created: true, deleteAt };
}

async function canManageTicket(interaction) {
  if (!interaction.guild) {
    return false;
  }

  try {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    return member.permissions.has(PermissionFlagsBits.ManageChannels);
  } catch {
    return false;
  }
}

async function onDeleteTicketButton(interaction) {
  const meta = parseTicketTopic(interaction.channel?.topic);
  if (!interaction.guild || !interaction.channel || !meta?.userId) {
    await interaction.reply({
      content: 'This button can only be used inside a support ticket.',
      flags: EPHEMERAL_FLAG
    });
    return;
  }

  const isManager = await canManageTicket(interaction);
  const isOwner = meta.userId === interaction.user.id;
  if (!isManager && !isOwner) {
    await interaction.reply({
      content: 'Only the ticket owner or staff can delete this ticket.',
      flags: EPHEMERAL_FLAG
    });
    return;
  }

  if (isManager) {
    await interaction.reply({
      content: 'Deleting this ticket...',
      flags: EPHEMERAL_FLAG
    }).catch(() => null);
    clearTicketTimers(interaction.channel.id);
    await interaction.channel.delete('Support ticket closed by staff');
    return;
  }

  const requestedDeleteAt = Math.floor((Date.now() + TICKET_USER_DELETE_DELAY_MS) / 1000);
  const deleteAt = Number.isFinite(meta.deleteAt)
    ? Math.min(meta.deleteAt, requestedDeleteAt)
    : requestedDeleteAt;

  await interaction.channel.setTopic(
    ticketTopic(meta.userId, deleteAt, meta.warned),
    'Support ticket deletion scheduled by owner'
  );
  scheduleTicketDelete(interaction.channel, deleteAt);
  await interaction.reply({
    content: `Your support ticket is scheduled to delete ${ticketOwnerDeleteText(deleteAt)}.`,
    flags: EPHEMERAL_FLAG
  });
}

async function scheduleOpenTickets() {
  let scheduled = 0;

  for (const guild of bot.guilds.cache.values()) {
    const channels = await guild.channels.fetch();
    for (const channel of channels.values()) {
      if (channel?.type !== ChannelType.GuildText) {
        continue;
      }

      const meta = parseTicketTopic(channel.topic);
      if (!meta?.userId || meta.type !== TICKET_PREFIX) {
        continue;
      }

      await ensureTicketExpiry(channel, meta.userId);
      scheduled += 1;
    }
  }

  console.log(`Support ticket self-destruct timers scheduled: ${scheduled}.`);
}

async function onDashboardButton(interaction) {
  if (!await safeDeferReply(interaction, { flags: EPHEMERAL_FLAG })) {
    return;
  }

  try {
    const profile = await fetchDashboardProfile(interaction.user.id);
    await syncDashboardRoles(interaction, profile);
    await interaction.editReply(await dashboardPagePayload(interaction, profile, DASHBOARD_PAGES.home));
  } catch (err) {
    console.error(`Dashboard profile fetch failed: ${err.stack || err.message || err}`);
    await interaction.editReply({
      embeds: [
        mkEmbed({
          title: 'Dashboard Unavailable',
          description: 'I could not load your dashboard right now. Try again in a minute.',
          color: 0xe74c3c
        })
      ],
      components: []
    });
  }
}

async function onLinkButton(interaction) {
  if (!isScopedToUser(interaction, DASHBOARD_LINK_PREFIX)) {
    await interaction.reply({
      content: 'This dashboard belongs to another Discord user.',
      flags: EPHEMERAL_FLAG
    });
    return;
  }

  await interaction.showModal(linkAccountModal(interaction.user.id));
}

async function onDashboardSelect(interaction) {
  if (!isScopedToUser(interaction, DASHBOARD_SELECT_PREFIX)) {
    await interaction.reply({
      content: 'This dashboard belongs to another Discord user.',
      flags: EPHEMERAL_FLAG
    });
    return;
  }

  if (!await safeDeferUpdate(interaction)) {
    return;
  }
  const page = interaction.values?.[0] || DASHBOARD_PAGES.home;

  try {
    if (page === DASHBOARD_PAGES.upgrade || page === DASHBOARD_PAGES.support) {
      await interaction.editReply(loggingInPayload('Creating support ticket...'));
      const { channel, created, deleteAt } = await createSupportTicket(interaction);
      await interaction.editReply({
        content: null,
        embeds: [
          mkEmbed({
            title: 'Support',
            description: created
              ? `Your support ticket has been created: ${channel}\nIt will self destruct ${ticketExpiryText(deleteAt)}.`
              : `You already have an open support ticket: ${channel}\nIt will self destruct ${ticketExpiryText(deleteAt)}.`,
            color: DASHBOARD_THEMES.blue.color
          })
        ],
        components: dashboardRows(interaction, DASHBOARD_PAGES.support),
        files: [],
        attachments: []
      });
      return;
    }

    const profile = await fetchDashboardProfile(interaction.user.id);
    await syncDashboardRoles(interaction, profile);
    await interaction.editReply(await dashboardPagePayload(interaction, profile, page));
  } catch (err) {
    console.error(`Dashboard page update failed: ${err.stack || err.message || err}`);
    await interaction.editReply({
      embeds: [
        mkEmbed({
          title: 'Dashboard Unavailable',
          description: 'I could not refresh this page right now. Try again in a minute.',
          color: 0xe74c3c
        })
      ],
      components: []
    });
  }
}

async function onDashboardRefreshButton(interaction) {
  if (!isScopedToUser(interaction, DASHBOARD_REFRESH_PREFIX)) {
    await interaction.reply({
      content: 'This dashboard belongs to another Discord user.',
      flags: EPHEMERAL_FLAG
    });
    return;
  }

  if (!await safeDeferUpdate(interaction)) {
    return;
  }

  try {
    await interaction.editReply(loggingInPayload('Refreshing dashboard...'));
    const profile = await fetchDashboardProfile(interaction.user.id);
    await syncDashboardRoles(interaction, profile);
    await interaction.editReply(await dashboardPagePayload(interaction, profile, DASHBOARD_PAGES.home));
  } catch (err) {
    console.error(`Dashboard refresh failed: ${err.stack || err.message || err}`);
    await interaction.editReply({
      embeds: [
        mkEmbed({
          title: 'Dashboard Unavailable',
          description: 'I could not refresh your dashboard right now. Try again in a minute.',
          color: 0xe74c3c
        })
      ],
      components: [],
      attachments: []
    });
  }
}

async function onDashboardPreferenceSelect(interaction) {
  const parsed = parsePreferenceCustomId(interaction.customId);
  if (!parsed || parsed.userId !== interaction.user.id) {
    await interaction.reply({
      content: 'This settings panel belongs to another Discord user.',
      flags: EPHEMERAL_FLAG
    });
    return;
  }

  if (!await safeDeferUpdate(interaction)) {
    return;
  }

  try {
    await interaction.editReply(loggingInPayload('Saving settings...'));
    const value = interaction.values?.[0];
    await updateDashboardPreferences(interaction.user.id, { [parsed.key]: value });
    const profile = await fetchDashboardProfile(interaction.user.id);
    await interaction.editReply(await dashboardPagePayload(interaction, profile, DASHBOARD_PAGES.settings));
  } catch (err) {
    console.error(`Dashboard preference update failed: ${err.stack || err.message || err}`);
    await interaction.editReply({
      embeds: [
        mkEmbed({
          title: 'Settings Not Saved',
          description: 'I could not save that dashboard setting right now. Try again in a minute.',
          color: 0xe74c3c
        })
      ],
      components: [],
      attachments: []
    });
  }
}

async function onDashboardPreferenceResetButton(interaction) {
  if (!isScopedToUser(interaction, DASHBOARD_PREF_RESET_PREFIX)) {
    await interaction.reply({
      content: 'This settings panel belongs to another Discord user.',
      flags: EPHEMERAL_FLAG
    });
    return;
  }

  if (!await safeDeferUpdate(interaction)) {
    return;
  }

  try {
    await interaction.editReply(loggingInPayload('Resetting settings...'));
    await updateDashboardPreferences(interaction.user.id, {}, true);
    const profile = await fetchDashboardProfile(interaction.user.id);
    await interaction.editReply(await dashboardPagePayload(interaction, profile, DASHBOARD_PAGES.settings));
  } catch (err) {
    console.error(`Dashboard preference reset failed: ${err.stack || err.message || err}`);
    await interaction.editReply({
      embeds: [
        mkEmbed({
          title: 'Settings Not Reset',
          description: 'I could not reset your dashboard settings right now. Try again in a minute.',
          color: 0xe74c3c
        })
      ],
      components: [],
      attachments: []
    });
  }
}

async function onDashboardSignOutButton(interaction) {
  if (!isScopedToUser(interaction, DASHBOARD_SIGN_OUT_PREFIX)) {
    await interaction.reply({
      content: 'This settings panel belongs to another Discord user.',
      flags: EPHEMERAL_FLAG
    });
    return;
  }

  if (!await safeDeferUpdate(interaction)) {
    return;
  }

  try {
    await interaction.editReply(loggingInPayload('Signing out...'));
    await signOutDashboard(interaction.user.id);
    await syncDashboardRoles(interaction, { keys: [] });
    await interaction.editReply(emailLookupPayload(interaction));
  } catch (err) {
    console.error(`Dashboard sign out failed: ${err.stack || err.message || err}`);
    await interaction.editReply({
      embeds: [
        mkEmbed({
          title: 'Sign Out Failed',
          description: 'I could not sign you out right now. Try again in a minute.',
          color: 0xe74c3c
        })
      ],
      components: [],
      files: [],
      attachments: []
    });
  }
}

async function onOnboardingNavButton(interaction) {
  const nav = parseOnboardingCustomId(interaction.customId);
  if (!nav || nav.userId !== interaction.user.id) {
    await interaction.reply({
      content: 'This setup flow belongs to another Discord user.',
      flags: EPHEMERAL_FLAG
    });
    return;
  }

  if (!await safeDeferUpdate(interaction)) {
    return;
  }

  try {
    const profile = await fetchDashboardProfile(interaction.user.id);
    if (userHasKeys(profile)) {
      await interaction.editReply(await dashboardPagePayload(interaction, profile, DASHBOARD_PAGES.home));
      return;
    }

    await interaction.editReply(emailLookupPayload(interaction));
  } catch (err) {
    console.error(`Onboarding page update failed: ${err.stack || err.message || err}`);
    await interaction.editReply({
      embeds: [
        mkEmbed({
          title: 'Setup Unavailable',
          description: 'I could not refresh this setup step right now. Try again in a minute.',
          color: 0xe74c3c
        })
      ],
      components: []
    });
  }
}

async function onSupportTicketButton(interaction) {
  if (!isScopedToUser(interaction, SUPPORT_TICKET_PREFIX)) {
    await interaction.reply({
      content: 'This support panel belongs to another Discord user.',
      flags: EPHEMERAL_FLAG
    });
    return;
  }

  if (!await safeDeferUpdate(interaction)) {
    return;
  }

  try {
    await interaction.editReply(loggingInPayload('Creating support ticket...'));
    const { channel, created, deleteAt } = await createSupportTicket(interaction);
    await interaction.editReply({
      content: null,
      embeds: [
        mkEmbed({
          title: 'Support',
          description: created
            ? `Your support ticket has been created: ${channel}\nIt will self destruct ${ticketExpiryText(deleteAt)}.`
            : `You already have an open support ticket: ${channel}\nIt will self destruct ${ticketExpiryText(deleteAt)}.`,
          color: DASHBOARD_THEMES.blue.color
        })
      ],
      components: dashboardRows(interaction, DASHBOARD_PAGES.support),
      files: [],
      attachments: []
    });
  } catch (err) {
    console.error(`Support ticket creation failed: ${err.stack || err.message || err}`);
    await interaction.editReply({
      content: 'I could not create a support ticket right now. Make sure the bot has Manage Channels permission.',
      embeds: [],
      components: []
    });
  }
}

async function onSupportInfoButton(interaction, kind) {
  const prefix = kind === 'errors' ? SUPPORT_ERROR_CODES_PREFIX : SUPPORT_INFO_PREFIX;
  if (!isScopedToUser(interaction, prefix)) {
    await interaction.reply({
      content: 'This support panel belongs to another Discord user.',
      flags: EPHEMERAL_FLAG
    });
    return;
  }

  if (!await safeDeferUpdate(interaction)) {
    return;
  }

  try {
    const profile = await fetchDashboardProfile(interaction.user.id);
    const payload = kind === 'errors'
      ? supportErrorCodesPayload(interaction, profile)
      : supportImportantInfoPayload(interaction, profile);
    await interaction.editReply(clearMessagePayload(payload));
  } catch (err) {
    console.error(`Support info update failed: ${err.stack || err.message || err}`);
    const payload = kind === 'errors'
      ? supportErrorCodesPayload(interaction, { keys: [] })
      : supportImportantInfoPayload(interaction, { keys: [] });
    await interaction.editReply(clearMessagePayload(payload));
  }
}

async function onLinkModal(interaction) {
  const ownerId = parseScopedCustomId(interaction.customId, DASHBOARD_LINK_MODAL_PREFIX);
  if (ownerId !== interaction.user.id) {
    await interaction.reply({
      content: 'This link form belongs to another Discord user.',
      flags: EPHEMERAL_FLAG
    });
    return;
  }

  const email = normalizeEmail(interaction.fields.getTextInputValue('email'));
  if (!validEmail(email)) {
    if (!await safeUpdate(interaction, emailLookupPayload(
      interaction,
      'Enter the same valid email address you use for Patreon.'
    ))) {
      return;
    }
    return;
  }

  if (!await safeUpdate(interaction, loggingInPayload('Logging in...'))) {
    return;
  }

  try {
    const profile = await fetchDashboardProfile(interaction.user.id, email);
    await syncDashboardRoles(interaction, profile);
    if (!profile?.linked || !profileKeys(profile).length) {
      await interaction.editReply(emailLookupPayload(
        interaction,
        `No SparxSolver keys were found for \`${email}\`.`
      ));
      return;
    }

    await interaction.editReply(await dashboardPagePayload(interaction, profile, DASHBOARD_PAGES.home));
  } catch (err) {
    console.error(`Dashboard link failed: ${err.stack || err.message || err}`);
    await interaction.editReply(emailLookupPayload(
      interaction,
      'I could not link that account right now. Try again in a minute.'
    ));
  }
}

async function onReady() {
  if (ready) {
    return;
  }

  ready = true;
  if (readyTimer) {
    clearTimeout(readyTimer);
    readyTimer = null;
  }

  console.log(`Logged in as ${bot.user.tag}`);
  await resendDashboardPanel();
  await scheduleOpenTickets();
}

bot.once(Events.ClientReady, onReady);

bot.on(Events.InteractionCreate, async interaction => {
  try {
    const rateLimit = checkDashboardRateLimit(interaction);
    if (rateLimit.limited) {
      await acknowledgeRateLimitedInteraction(interaction, rateLimit);
      return;
    }

    if (interaction.isButton()) {
      if (interaction.customId === DASHBOARD_BUTTON_ID) {
        await onDashboardButton(interaction);
        return;
      }
      if (interaction.customId.startsWith(`${ONBOARDING_NAV_PREFIX}:`)) {
        await onOnboardingNavButton(interaction);
        return;
      }
      if (interaction.customId.startsWith(`${DASHBOARD_REFRESH_PREFIX}:`)) {
        await onDashboardRefreshButton(interaction);
        return;
      }
      if (interaction.customId.startsWith(`${DASHBOARD_PREF_RESET_PREFIX}:`)) {
        await onDashboardPreferenceResetButton(interaction);
        return;
      }
      if (interaction.customId.startsWith(`${DASHBOARD_SIGN_OUT_PREFIX}:`)) {
        await onDashboardSignOutButton(interaction);
        return;
      }
      if (interaction.customId.startsWith(`${DASHBOARD_LINK_PREFIX}:`)) {
        await onLinkButton(interaction);
        return;
      }
      if (interaction.customId === SUPPORT_TICKET_DELETE_PREFIX) {
        await onDeleteTicketButton(interaction);
        return;
      }
      if (interaction.customId.startsWith(`${SUPPORT_TICKET_PREFIX}:`)) {
        await onSupportTicketButton(interaction);
        return;
      }
      if (interaction.customId.startsWith(`${SUPPORT_ERROR_CODES_PREFIX}:`)) {
        await onSupportInfoButton(interaction, 'errors');
        return;
      }
      if (interaction.customId.startsWith(`${SUPPORT_INFO_PREFIX}:`)) {
        await onSupportInfoButton(interaction, 'info');
        return;
      }
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith(`${DASHBOARD_PREF_PREFIX}:`)) {
      await onDashboardPreferenceSelect(interaction);
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith(`${DASHBOARD_SELECT_PREFIX}:`)) {
      await onDashboardSelect(interaction);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith(`${DASHBOARD_LINK_MODAL_PREFIX}:`)) {
      await onLinkModal(interaction);
      return;
    }
  } catch (err) {
    if (isUnknownInteractionError(err)) {
      noteExpiredInteraction('during handler');
      return;
    }
    console.error(`Interaction handler failed: ${err.stack || err.message || err}`);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'That dashboard action failed. Try again in a minute.',
        flags: EPHEMERAL_FLAG
      }).catch(() => null);
    }
  }
});

bot.on(Events.Warn, warning => {
  console.warn(`Discord warning: ${clip(warning, 240)}`);
});

bot.on(Events.Error, err => {
  console.error(`Discord client error: ${err.stack || err.message || err}`);
});

process.on('unhandledRejection', err => {
  console.error(`Unhandled rejection: ${err.stack || err.message || err}`);
});

process.on('uncaughtException', err => {
  console.error(`Uncaught exception: ${err.stack || err.message || err}`);
  process.exitCode = 1;
});

function startBot() {
  const token = env('TOKEN');
  console.log(`Starting SparxSolver dashboard bot. Managed channel: ${DASHBOARD_CHANNEL_ID}.`);

  readyTimer = setTimeout(() => {
    if (!ready) {
      console.warn('Discord ready event has not fired after 30s. Check the token, network, and bot gateway settings.');
    }
  }, 30000);

  return bot.login(token).catch(err => {
    if (readyTimer) {
      clearTimeout(readyTimer);
      readyTimer = null;
    }

    console.error(`Discord login failed: ${err.stack || err.message || err}`);
    process.exitCode = 1;
  });
}

module.exports = {
  DASHBOARD_BUTTON_ID,
  DASHBOARD_CHANNEL_ID,
  DASHBOARD_PAGES,
  dashboardHomePayload,
  dashboardPagePayload,
  dashboardPanelPayload,
  dashboardPreferences,
  emailLookupPayload,
  formatUnixTimestamp,
  keyUsageBlock,
  keyUsageLines,
  linkAccountPayload,
  loggingInPayload,
  normalizeDashboardPreferences,
  paymentMethodsText,
  planCountLines,
  plansUsagePayload,
  renderedDashboardHomePayload,
  renderDashboardImage,
  renderUsageBar: usageBar,
  settingsPayload,
  supportErrorCodesPayload,
  supportImportantInfoPayload,
  supportTicketStartText,
  startBot,
  ticketExpiryText,
  ticketTopic,
  usageBar
};

if (require.main === module) {
  startBot();
}