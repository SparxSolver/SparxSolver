const path = require('path');
const fs = require('fs');

require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });
require('dotenv').config({ quiet: true });

const {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');

if (typeof fetch !== 'function') {
  throw new Error('This bot requires Node.js 18 or newer because it uses the built-in fetch API.');
}

const CHANNEL_IDS = {
  setup: '1492211341274910911'
};

const PLAN_ROLE_IDS = {
  affordable: '1493707110020546731',
  basic: '1493707149069647932',
  pro: '1493707169655292105',
  premium: '1493707187091144875'
};

const USER_IDS = {
  owner: '1486781207814475836'
};

const CUSTOM_IDS = {
  buy: 'spx_setup_buy',
  key: 'spx_setup_key',
  keyModal: 'spx_setup_key_modal',
  service: 'spx_setup_service',
  ticket: 'spx_setup_ticket',
  ticketDelete: 'spx_ticket_delete'
};

const CONFIG = {
  purgeAgeMs: 14 * 24 * 60 * 60 * 1000,
  purgeRetryMs: 1000,
  httpMs: 8000,
  countCacheMs: 2 * 60 * 1000,
  ticketDeleteDelayMs: 1500,
  ticketLifetimeMs: 24 * 60 * 60 * 1000,
  ticketWarnBeforeDeleteMs: 60 * 60 * 1000,
  ticketPrefix: 'support',
  ticketTopicPrefix: 'issue-owner:'
};

const VERSION_INFO_URL = process.env.SPARXSOLVER_VERSION_URL ||
  'https://raw.githubusercontent.com/SparxSolver/SparxSolver/refs/heads/main/version.json';
const EPHEMERAL_FLAG = 1 << 6;

const URLS = {
  patreon: 'https://www.patreon.com/cw/SparxxSolver/membership',
  release: 'https://github.com/SparxSolver/SparxSolver/releases/latest',
  noKeyImage: String(process.env.NO_KEY_IMAGE_URL || '').trim(),
  buy: {
    affordable: 'https://www.patreon.com/checkout/SparxxSolver?rid=28320508',
    basic: 'https://www.patreon.com/checkout/SparxxSolver?rid=28354798',
    pro: 'https://www.patreon.com/checkout/SparxxSolver?rid=28354808',
    premium: 'https://www.patreon.com/checkout/SparxxSolver?rid=28354812'
  }
};

const PLANS = [
  { key: 'affordable', name: 'Affordable', roleId: PLAN_ROLE_IDS.affordable, color: 0xf1c40f },
  { key: 'basic', name: 'Basic', roleId: PLAN_ROLE_IDS.basic, color: 0xe67e22 },
  { key: 'pro', name: 'Pro', roleId: PLAN_ROLE_IDS.pro, color: 0x1abc9c },
  { key: 'premium', name: 'Premium', roleId: PLAN_ROLE_IDS.premium, color: 0x3498db }
];

const PLAN_BY_KEY = new Map(PLANS.map(plan => [plan.key, plan]));
const PLAN_PRIORITY = ['premium', 'pro', 'basic', 'affordable'];
const PLAN_RANK = new Map(PLAN_PRIORITY.map((planKey, index) => [planKey, index]));

const buyEmbedTemplate = {
  title: 'Buy SparxSolver',
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
      value: `**<:patreon:1506721091270475796> Patreon ([Click to join](${URLS.patreon})):**
-> [[Buy](${URLS.buy.affordable})] <@&${PLAN_ROLE_IDS.affordable}> - £1/month ({affordableMembers})
-> [[Buy](${URLS.buy.basic})] <@&${PLAN_ROLE_IDS.basic}> - £3/month ({basicMembers})
-> [[Buy](${URLS.buy.pro})] <@&${PLAN_ROLE_IDS.pro}> - £5/month ({proMembers})
-> [[Buy](${URLS.buy.premium})] <@&${PLAN_ROLE_IDS.premium}> - £10/month ({premiumMembers})`
    }
  ]
};

const serviceEmbed = {
  title: 'Use SparxSolver',
  color: 0x2ecc71,
  fields: [
    {
      name: 'Download',
      value: `Download the latest version from the SparxSolver release page (${URLS.release}) and extract the zip file.`
    },
    {
      name: 'Use',
      value: `After extracting the zip file, open \`chrome://extensions\`, turn on Developer Mode and then load the extracted folder.
      
      Any issues, open a support ticket`
    }
  ]
};

const setupMessage = {
  code: 'setup',
  channelId: CHANNEL_IDS.setup,
  embed: {
    title: 'SparxSolver',
    color: 0x0075ff,
    description: `How to use:

1. Buy SparxSolver
> Buy any of our 4 plans we have to offer

2. Get your key
> Generate your private key to use the plan you bought

3. Use our Service
> Use any of our many features below`
  },
  buttons: [
    { id: CUSTOM_IDS.buy, label: 'Buy', emoji: '💳', build: buildBuyEmbed },
    { id: CUSTOM_IDS.key, label: 'Key', emoji: '🔑', modal: true },
    { id: CUSTOM_IDS.service, label: 'Service', emoji: '⚙️', embed: serviceEmbed },
    { id: CUSTOM_IDS.ticket, label: 'Ticket', emoji: '📝', ticket: true }
  ]
};

const managedMessages = [setupMessage];
const setupActionsById = new Map(setupMessage.buttons.map(act => [act.id, act]));
const protectedChannelIds = new Set(managedMessages.map(msg => msg.channelId));
const allowedMsgUsers = new Set([USER_IDS.owner]);
const planCountCache = {
  counts: null,
  at: 0,
  wait: null,
  retryAt: 0
};
const ticketTimers = new Map();

const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages
  ]
});

let botVersionText = `SparxSolver ${readLocalVer()}`;
let ready = false;
let readyTimer = null;

function env(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    throw new Error(`${name} is missing from .env`);
  }
  return value;
}

function getBotVersionSource() {
  const src = String(process.env.SPARXSOLVER_VERSION_SOURCE || 'local').trim().toLowerCase();
  return src === 'github' ? 'github' : 'local';
}

function cleanVer(value) {
  const text = String(value || '').trim();
  return /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(text) ? text : '';
}

function verFromJson(data) {
  return (
    cleanVer(data?.bot?.version) ||
    cleanVer(data?.Bot?.version) ||
    cleanVer(data?.BOT?.version) ||
    cleanVer(data?.versions?.bot) ||
    cleanVer(data?.versions?.Bot) ||
    cleanVer(data?.botVersion) ||
    cleanVer(data?.version)
  );
}

function localVerFiles() {
  return [
    process.env.SPARXSOLVER_VERSION_FILE,
    path.join(__dirname, '..', 'version.json'),
    path.join(__dirname, 'version.json')
  ].filter(Boolean);
}

function readLocalVer() {
  for (const file of localVerFiles()) {
    try {
      if (!fs.existsSync(file)) {
        continue;
      }

      const found = verFromJson(JSON.parse(fs.readFileSync(file, 'utf8')));
      if (found) {
        return found;
      }
    } catch (err) {
      console.warn(`Could not read bot version from ${file}: ${err.message}`);
    }
  }

  try {
    return cleanVer(require('./package.json')?.version) || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

async function readRemoteVer() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CONFIG.httpMs);

  try {
    const res = await fetch(VERSION_INFO_URL, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: ctrl.signal
    });

    if (!res.ok) {
      throw new Error(`GitHub version.json returned ${res.status}.`);
    }

    const found = verFromJson(await res.json());
    if (!found) {
      throw new Error('GitHub version.json does not contain a valid bot version.');
    }

    return found;
  } finally {
    clearTimeout(timer);
  }
}

async function refreshBotVersion() {
  if (getBotVersionSource() !== 'github') {
    botVersionText = `SparxSolver ${readLocalVer()}`;
    console.log(`Bot version loaded from local source: ${botVersionText}`);
    return botVersionText;
  }

  try {
    botVersionText = `SparxSolver ${await readRemoteVer()}`;
    console.log(`Bot version loaded from GitHub ${VERSION_INFO_URL}: ${botVersionText}`);
  } catch (err) {
    logErr(`Failed to load remote bot version from ${VERSION_INFO_URL}`, err);
    botVersionText = `SparxSolver ${readLocalVer()}`;
    console.log(`Using local fallback bot version: ${botVersionText}`);
  }

  return botVersionText;
}

function mkEmb(def) {
  const emb = new EmbedBuilder()
    .setTitle(def.title)
    .setColor(def.color)
    .setFooter({ text: botVersionText });

  const desc = String(def.description || '').trim();
  if (desc) {
    emb.setDescription(desc);
  }

  if (Array.isArray(def.fields) && def.fields.length) {
    emb.addFields(def.fields.map(field => ({
      name: field.name,
      value: field.value,
      inline: Boolean(field.inline)
    })));
  }

  if (def.image) {
    emb.setImage(def.image);
  }

  return emb;
}

function mkButtons(buttons) {
  return new ActionRowBuilder().addComponents(
    ...buttons.slice(0, 5).map(btn =>
      new ButtonBuilder()
        .setCustomId(btn.id)
        .setLabel(btn.label)
        .setEmoji(btn.emoji)
        .setStyle(ButtonStyle.Primary)
    )
  );
}

function mkMsgPayload(msg) {
  const payload = {
    embeds: [mkEmb(msg.embed)]
  };

  if (Array.isArray(msg.buttons) && msg.buttons.length) {
    payload.components = [mkButtons(msg.buttons)];
  }

  return payload;
}

function getManagedMessageParts(msg) {
  return [msg];
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function clearChannel(ch) {
  while (true) {
    const batch = await ch.messages.fetch({ limit: 100 });
    if (!batch.size) {
      return;
    }

    const del = batch.filter(msg => msg.deletable);
    if (!del.size) {
      throw new Error(`Channel ${ch.id} still has ${batch.size} message(s), but none are deletable by the bot.`);
    }

    const fresh = del.filter(msg => Date.now() - msg.createdTimestamp < CONFIG.purgeAgeMs);
    const stale = del.filter(msg => Date.now() - msg.createdTimestamp >= CONFIG.purgeAgeMs);
    let removed = 0;

    if (fresh.size && typeof ch.bulkDelete === 'function') {
      const gone = await ch.bulkDelete(fresh, true).catch(() => null);
      removed += gone?.size ?? 0;
    }

    for (const msg of stale.values()) {
      if (await msg.delete().then(() => true).catch(() => false)) {
        removed += 1;
      }
    }

    if (!removed) {
      throw new Error(`Channel ${ch.id} could not be cleared. Remaining fetched messages: ${batch.size}.`);
    }

    await sleep(CONFIG.purgeRetryMs);
  }
}

async function refreshMsg(msg) {
  const ch = await bot.channels.fetch(msg.channelId);
  if (!ch || !ch.isTextBased() || typeof ch.send !== 'function') {
    throw new Error(`Channel ${msg.channelId} is missing or is not a text channel.`);
  }

  await clearChannel(ch);
  await ch.send(mkMsgPayload(msg));
}

async function refreshMsgs() {
  let ok = 0;
  const failed = [];

  for (const msg of managedMessages) {
    try {
      await refreshMsg(msg);
      ok += 1;
    } catch (err) {
      failed.push(`${msg.channelId}: ${fmtErr(err, 90)}`);
    }
  }

  console.log(`Managed messages: ${ok}/${managedMessages.length} refreshed${failed.length ? `, ${failed.length} failed` : ''}.`);
  if (failed.length) {
    console.warn(`Managed message failures: ${clip(failed.join('; '), 240)}`);
  }
}

function fmtCount(value) {
  return Number.isFinite(value)
    ? `${value} ${value === 1 ? 'Member' : 'Members'}`
    : 'Members unavailable';
}

function cloneCounts(counts) {
  return new Map(PLANS.map(plan => [
    plan.key,
    Number.isFinite(counts?.get(plan.key)) ? counts.get(plan.key) : null
  ]));
}

function countSnapshot(counts) {
  return { counts: cloneCounts(counts) };
}

function emptyCounts() {
  return countSnapshot(new Map(PLANS.map(plan => [plan.key, null])));
}

function roleCacheCounts(guild) {
  if (!guild) {
    return emptyCounts();
  }

  return countSnapshot(new Map(PLANS.map(plan => {
    const count = Number(guild.roles.cache.get(plan.roleId)?.members?.size);
    return [plan.key, Number.isFinite(count) ? count : null];
  })));
}

function retryMs(err) {
  const direct = Number(err?.retryAfter ?? err?.retry_after);
  if (Number.isFinite(direct) && direct > 0) {
    return Math.ceil(direct * 1000);
  }

  const match = String(err?.message || err || '').match(/retry after\s+([\d.]+)\s+seconds/i);
  const parsed = Number(match?.[1]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed * 1000) : 60 * 1000;
}

async function fetchCounts(guild) {
  if (!guild) {
    return emptyCounts();
  }

  await guild.roles.fetch().catch(err => logErr('Failed to refresh plan roles before counting members', err));
  const members = await guild.members.fetch();

  return countSnapshot(new Map(PLANS.map(plan => [
    plan.key,
    members.filter(member => member.roles.cache.has(plan.roleId)).size
  ])));
}

async function getCounts(guild) {
  const now = Date.now();

  if (planCountCache.counts && now - planCountCache.at < CONFIG.countCacheMs) {
    return countSnapshot(planCountCache.counts);
  }

  if (planCountCache.wait) {
    return countSnapshot((await planCountCache.wait).counts);
  }

  if (now < planCountCache.retryAt) {
    return planCountCache.counts ? countSnapshot(planCountCache.counts) : roleCacheCounts(guild);
  }

  planCountCache.wait = fetchCounts(guild)
    .then(snapshot => {
      planCountCache.counts = cloneCounts(snapshot.counts);
      planCountCache.at = Date.now();
      planCountCache.retryAt = 0;
      return countSnapshot(planCountCache.counts);
    })
    .catch(err => {
      const waitMs = retryMs(err);
      planCountCache.retryAt = Date.now() + waitMs + 1000;
      logErr(`Failed to fetch Discord role member counts; using cached counts for ${Math.ceil(waitMs / 1000)}s`, err);
      return planCountCache.counts ? countSnapshot(planCountCache.counts) : roleCacheCounts(guild);
    })
    .finally(() => {
      planCountCache.wait = null;
    });

  return countSnapshot((await planCountCache.wait).counts);
}

function memberPlans(member) {
  if (!member?.roles?.cache) {
    return new Set();
  }

  return new Set(PLANS.filter(plan => member.roles.cache.has(plan.roleId)).map(plan => plan.key));
}

function bumpCount(planKey, delta) {
  if (!planCountCache.counts || !Number.isFinite(planCountCache.counts.get(planKey))) {
    return;
  }

  planCountCache.counts.set(planKey, Math.max(0, planCountCache.counts.get(planKey) + delta));
  planCountCache.at = Date.now();
}

function updateCountCache(oldMember, newMember) {
  const oldPlans = memberPlans(oldMember);
  const newPlans = memberPlans(newMember);

  for (const plan of PLANS) {
    if (oldPlans.has(plan.key) && !newPlans.has(plan.key)) {
      bumpCount(plan.key, -1);
    } else if (!oldPlans.has(plan.key) && newPlans.has(plan.key)) {
      bumpCount(plan.key, 1);
    }
  }
}

async function buildBuyEmbed(interaction) {
  const snapshot = await getCounts(interaction.guild);
  const fields = buyEmbedTemplate.fields.map(field => {
    let value = field.value;

    for (const plan of PLANS) {
      value = value.replaceAll(`{${plan.key}Members}`, fmtCount(snapshot.counts.get(plan.key)));
    }

    return { ...field, value };
  });

  return { title: buyEmbedTemplate.title, color: buyEmbedTemplate.color, fields };
}

function normEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function keyModal() {
  const modal = new ModalBuilder()
    .setCustomId(CUSTOM_IDS.keyModal)
    .setTitle('SparxSolver Key');

  const email = new TextInputBuilder()
    .setCustomId('email')
    .setLabel('Email address used to buy the plan on Patreon')
    .setPlaceholder('example@gmail.com')
    .setStyle(TextInputStyle.Short)
    .setMinLength(5)
    .setMaxLength(254)
    .setRequired(true);

  return modal.addComponents(new ActionRowBuilder().addComponents(email));
}

async function workerPost(route, body) {
  const workerUrl = process.env.LICENSE_WORKER_URL;
  const secret = process.env.LICENSE_WORKER_SECRET;

  if (!workerUrl || !secret) {
    throw new Error('LICENSE_WORKER_URL and LICENSE_WORKER_SECRET must be set in .env.');
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CONFIG.httpMs);

  try {
    const res = await fetch(`${workerUrl.replace(/\/+$/, '')}${route}`, {
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

async function reqKey(email, userId) {
  return workerPost('/lookup', {
    email,
    tier: 'all',
    discordUserId: userId
  });
}

async function runStartupMaintenance() {
  if (String(process.env.DISABLE_STARTUP_MAINTENANCE || '1').trim() !== '0') {
    console.log('Startup maintenance skipped.');
    return;
  }

  try {
    const payload = await workerPost('/maintenance/startup', {});
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
    logErr('Startup maintenance failed', err);
  }
}

function noKeyEmb(email) {
  return {
    title: 'Email Not Found',
    color: 0xe74c3c,
    description: `${email} is not registered on SparxSolver.

**Open a ticket** if you believe this is a mistake

Check the same email address you use in your **Patreon account settings**: https://www.patreon.com/settings/basics.`,
    image: URLS.noKeyImage
  };
}

function expiredKeyEmb(result) {
  const plan = PLAN_BY_KEY.get(result.tier);
  const when = Number(result.expires);
  const expiredText = Number.isFinite(when)
    ? `Expired: <t:${Math.floor(when)}:F> (<t:${Math.floor(when)}:R>)\n\n`
    : '';

  return {
    title: 'Key Expired',
    color: 0xe67e22,
    description: `A SparxSolver ${plan?.name || 'plan'} key was found, but it is expired.
${expiredText}Renew your plan on [Patreon](${URLS.patreon}), then try the key button again.`
  };
}

function lookupKeys(result) {
  const keys = Array.isArray(result.keys) && result.keys.length
    ? result.keys
    : [{
        licenseKey: result.licenseKey,
        tier: result.tier,
        expires: result.expires,
        discordRegistrationAdded: result.discordRegistrationAdded,
        firstDiscordRegistration: result.firstDiscordRegistration
      }];

  return keys
    .filter(key => key?.licenseKey)
    .sort((left, right) =>
      String(right.licenseKey).localeCompare(String(left.licenseKey))
    );
}

function keyExpiryText(expires) {
  if (expires === null) {
    return 'Never';
  }

  const unix = Number(expires);
  return Number.isFinite(unix) && unix > 0 ? `<t:${Math.floor(unix)}:R>` : 'Unavailable';
}

function keyExpired(key) {
  if (typeof key.expired === 'boolean') {
    return key.expired;
  }

  if (key.expires === null) {
    return false;
  }

  const unix = Number(key.expires);
  return Number.isFinite(unix) && unix > 0 && unix <= Math.floor(Date.now() / 1000);
}

function keyLine(key) {
  const plan = PLAN_BY_KEY.get(key.tier);
  const expiryLabel = keyExpired(key) ? 'Expired' : 'Expires';
  return `**${key.licenseKey}** - ${plan?.name || 'Unknown'} (${expiryLabel}: ${keyExpiryText(key.expires)})`;
}

function keySection(title, keys) {
  return [
    `__${title} (${keys.length}):__`,
    keys.map(keyLine).join('\n')
  ].filter(Boolean).join('\n');
}

function foundKeysEmb(email, result) {
  const keys = lookupKeys(result);
  const activeKeys = keys.filter(key => !keyExpired(key));
  const expiredKeys = keys.filter(keyExpired);

  return {
    title: `Your Keys:`,
    color: 0x2ecc71,
    description: `${keySection('Active Keys', activeKeys)}

${keySection('Expired Keys', expiredKeys)}`
  };
}

function bestActivePlanKey(keys) {
  let bestKey = null;
  let bestRank = Number.POSITIVE_INFINITY;

  for (const key of keys) {
    const planKey = key?.tier;
    const rank = PLAN_RANK.get(planKey);
    if (keyExpired(key) || !Number.isFinite(rank)) {
      continue;
    }

    if (rank < bestRank) {
      bestKey = planKey;
      bestRank = rank;
    }
  }

  return bestKey;
}

async function syncPlanRoles(interaction, keys) {
  if (!interaction.guild) {
    return;
  }

  const wantedPlanKey = bestActivePlanKey(keys);
  const wantedRoleId = wantedPlanKey ? PLAN_BY_KEY.get(wantedPlanKey)?.roleId : null;
  const planRoleIds = new Set(PLANS.map(plan => plan.roleId));

  try {
    const member = await interaction.guild.members.fetch({
      user: interaction.user.id,
      force: true
    });

    let added = 0;
    let removed = 0;

    if (wantedRoleId && !member.roles.cache.has(wantedRoleId)) {
      await member.roles.add(wantedRoleId, 'SparxSolver key lookup role sync');
      bumpCount(wantedPlanKey, 1);
      added += 1;
    }

    for (const roleId of planRoleIds) {
      if (roleId === wantedRoleId || !member.roles.cache.has(roleId)) {
        continue;
      }

      await member.roles.remove(roleId, 'SparxSolver key lookup role sync');
      const stalePlan = PLANS.find(plan => plan.roleId === roleId);
      if (stalePlan) {
        bumpCount(stalePlan.key, -1);
      }
      removed += 1;
    }

    if (added || removed) {
      console.log(
        `Key lookup role sync for ${interaction.user.id}: wanted ${wantedPlanKey || 'none'}, added ${added}, removed ${removed}.`
      );
    }
  } catch (err) {
    logErr(`Failed to sync plan roles for ${interaction.user.id}`, err);
  }
}

function clip(value, max = 120) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function redact(value) {
  let text = String(value || '');
  const secrets = [
    process.env.TOKEN,
    process.env.LICENSE_WORKER_SECRET,
    process.env.OPENAI_API_KEY,
    process.env.PATREON_CREATOR_ACCESS_TOKEN,
    process.env.PATREON_CREATOR_REFRESH_TOKEN,
    process.env.PATREON_CLIENT_SECRET
  ].map(secret => String(secret || '').trim()).filter(secret => secret.length >= 8);

  for (const secret of secrets) {
    text = text.split(secret).join('[redacted-secret]');
  }

  return text
    .replace(/\b[A-Z0-9]{4}-[A-Z0-9]{4}\b/g, '[redacted-license]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]');
}

function fmtErr(err, max = 160) {
  return clip(redact(err?.message || err), max);
}

function logErr(label, err, max = 160) {
  console.error(`${label}: ${fmtErr(err, max)}`);
}

function staleInteraction(err) {
  const text = fmtErr(err, 220);
  return err?.code === 10062 ||
    err?.code === 40060 ||
    /Unknown interaction|already been acknowledged/i.test(text);
}

async function safeCall(label, fn) {
  try {
    return await fn();
  } catch (err) {
    if (staleInteraction(err)) {
      console.warn(`${label}: stale Discord interaction ignored (${fmtErr(err, 120)}).`);
      return null;
    }

    throw err;
  }
}

async function safeReply(interaction, payload, label = 'Reply failed') {
  if (interaction.deferred || interaction.replied) {
    return safeEdit(interaction, payload, label);
  }

  return safeCall(label, () => interaction.reply(payload));
}

async function safeDefer(interaction, label = 'Defer failed') {
  if (interaction.deferred || interaction.replied) {
    return true;
  }

  return (await safeCall(label, () => interaction.deferReply({ flags: EPHEMERAL_FLAG }))) !== null;
}

async function safeEdit(interaction, payload, label = 'Edit failed') {
  return safeCall(label, () => interaction.editReply(payload));
}

function cleanTicketSlug(value, fallback = CONFIG.ticketPrefix) {
  const clean = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);

  return clean || fallback;
}

function ticketTopic(userId, deleteAt, warned = false, type = CONFIG.ticketPrefix) {
  return `${CONFIG.ticketTopicPrefix}${userId};type:${cleanTicketSlug(type)};delete-at:${Math.floor(deleteAt)};warned:${warned ? 1 : 0}`;
}

function parseTicketTopic(topic) {
  const text = String(topic || '').trim();
  if (!text.startsWith(CONFIG.ticketTopicPrefix)) {
    return null;
  }

  const [userId, ...parts] = text.slice(CONFIG.ticketTopicPrefix.length).split(';');
  const meta = {
    userId: String(userId || '').trim(),
    type: CONFIG.ticketPrefix,
    deleteAt: null,
    warned: false
  };

  if (!meta.userId) {
    return null;
  }

  for (const part of parts) {
    const idx = part.indexOf(':');
    if (idx <= 0) {
      continue;
    }

    const key = part.slice(0, idx);
    const value = part.slice(idx + 1);

    if (key === 'type') {
      meta.type = cleanTicketSlug(value);
    } else if (key === 'delete-at') {
      const unix = Number(value);
      meta.deleteAt = Number.isFinite(unix) ? Math.floor(unix) : null;
    } else if (key === 'warned') {
      meta.warned = value === '1' || value === 'true';
    }
  }

  return meta;
}

function ticketExpiryText(deleteAt) {
  return `<t:${deleteAt}:R> at <t:${deleteAt}:F>`;
}

function clearTicketTimers(channelId) {
  const timers = ticketTimers.get(channelId);
  if (!timers) {
    return;
  }

  for (const timer of Object.values(timers)) {
    clearTimeout(timer);
  }

  ticketTimers.delete(channelId);
}

function setTicketTimer(fn, delayMs) {
  const timer = setTimeout(fn, Math.max(0, delayMs));
  timer.unref?.();
  return timer;
}

function scheduleTicket(channel, userId, deleteAt, warned = false) {
  if (!channel?.id || !Number.isFinite(deleteAt)) {
    return;
  }

  clearTicketTimers(channel.id);
  const deleteDelayMs = (deleteAt * 1000) - Date.now();
  const timers = {};

  if (deleteDelayMs > 0 && !warned) {
    timers.warn = setTicketTimer(
      () => warnTicket(channel.id, userId, deleteAt),
      deleteDelayMs - CONFIG.ticketWarnBeforeDeleteMs
    );
  }

  timers.delete = setTicketTimer(
    () => autoDeleteTicket(channel.id),
    deleteDelayMs
  );

  ticketTimers.set(channel.id, timers);
}

async function updateTicketTopic(channel, userId, deleteAt, warned) {
  if (!channel || typeof channel.setTopic !== 'function') {
    return;
  }

  const meta = parseTicketTopic(channel.topic);
  await channel.setTopic(
    ticketTopic(userId, deleteAt, warned, meta?.type || CONFIG.ticketPrefix),
    'Update ticket self-destruct timer'
  ).catch(err => logErr(`Failed to update ticket topic ${channel.id}`, err));
}

async function warnTicket(channelId, userId, deleteAt) {
  try {
    const channel = await bot.channels.fetch(channelId);
    if (!channel?.isTextBased() || typeof channel.send !== 'function') {
      return;
    }

    await updateTicketTopic(channel, userId, deleteAt, true);
    await channel.send(`<@${userId}> this ticket will self destruct ${ticketExpiryText(deleteAt)}.`);
  } catch (err) {
    logErr(`Failed to send ticket expiry warning ${channelId}`, err);
  }
}

async function autoDeleteTicket(channelId) {
  try {
    const channel = await bot.channels.fetch(channelId).catch(() => null);
    if (channel && typeof channel.delete === 'function') {
      await channel.delete('Ticket self-destructed after 24 hours');
    }
  } catch (err) {
    logErr(`Failed to auto-delete ticket ${channelId}`, err);
  } finally {
    clearTicketTimers(channelId);
  }
}

async function ensureTicketExpiry(channel, userId) {
  const meta = parseTicketTopic(channel.topic);
  if (Number.isFinite(meta?.deleteAt)) {
    scheduleTicket(channel, userId, meta.deleteAt, meta.warned);
    return meta.deleteAt;
  }

  const deleteAt = Math.floor((Date.now() + CONFIG.ticketLifetimeMs) / 1000);
  await updateTicketTopic(channel, userId, deleteAt, false);
  scheduleTicket(channel, userId, deleteAt, false);
  return deleteAt;
}

async function findOpenTicket(guild, userId) {
  const channels = await guild.channels.fetch();

  return channels.find(channel => {
    if (!channel || channel.type !== ChannelType.GuildText) {
      return false;
    }

    const meta = parseTicketTopic(channel.topic);
    return meta?.userId === userId && meta.type === CONFIG.ticketPrefix;
  }) || null;
}

function ticketDeleteRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.ticketDelete)
      .setLabel('Delete Ticket')
      .setStyle(ButtonStyle.Danger)
  );
}

function ticketStartText(userId, deleteAt) {
  return `Hello <@${userId}>, this is a private ticket, what is your issue?

(This ticket will self destruct ${ticketExpiryText(deleteAt)})`;
}

async function createTicket(interaction) {
  if (!interaction.guild) {
    throw new Error('Tickets can only be created inside a server.');
  }

  const existing = await findOpenTicket(interaction.guild, interaction.user.id);
  if (existing) {
    const deleteAt = await ensureTicketExpiry(existing, interaction.user.id);
    return { channel: existing, created: false, deleteAt };
  }

  const deleteAt = Math.floor((Date.now() + CONFIG.ticketLifetimeMs) / 1000);
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
    name: `${CONFIG.ticketPrefix}-${interaction.user.id}`,
    type: ChannelType.GuildText,
    ...(interaction.channel?.parentId ? { parent: interaction.channel.parentId } : {}),
    topic: ticketTopic(interaction.user.id, deleteAt, false, CONFIG.ticketPrefix),
    permissionOverwrites: overwrites
  });

  await channel.send({
    content: ticketStartText(interaction.user.id, deleteAt),
    components: [ticketDeleteRow()]
  });

  scheduleTicket(channel, interaction.user.id, deleteAt, false);
  return { channel, created: true, deleteAt };
}

async function canDeleteTicket(interaction) {
  if (!interaction.guild) {
    return false;
  }

  try {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    return member.permissions.has(PermissionFlagsBits.Administrator);
  } catch {
    return false;
  }
}

async function deleteTicket(interaction) {
  if (!interaction.channel || !interaction.guild) {
    throw new Error('This ticket cannot be deleted here.');
  }

  if (!await canDeleteTicket(interaction)) {
    await safeReply(interaction, {
      content: 'Only admins or the bot can delete this ticket.',
      flags: EPHEMERAL_FLAG
    }, 'Ticket delete permission reply failed');
    return;
  }

  await safeReply(interaction, {
    content: 'Deleting this ticket...',
    flags: EPHEMERAL_FLAG
  }, 'Ticket delete reply failed');

  await sleep(CONFIG.ticketDeleteDelayMs);
  clearTicketTimers(interaction.channel.id);
  await interaction.channel.delete('Ticket closed');
}

async function scheduleOpenTickets() {
  let scheduled = 0;

  for (const guild of bot.guilds.cache.values()) {
    const channels = await guild.channels.fetch();

    for (const channel of channels.values()) {
      if (!channel || channel.type !== ChannelType.GuildText) {
        continue;
      }

      const meta = parseTicketTopic(channel.topic);
      if (!meta?.userId) {
        continue;
      }

      await ensureTicketExpiry(channel, meta.userId);
      scheduled += 1;
    }
  }

  console.log(`Ticket self-destruct timers scheduled: ${scheduled}.`);
}

async function onButton(interaction) {
  if (interaction.customId === CUSTOM_IDS.ticketDelete) {
    await deleteTicket(interaction);
    return;
  }

  const act = setupActionsById.get(interaction.customId);
  if (!act) {
    return;
  }

  if (act.modal) {
    await safeCall('Key modal failed', () => interaction.showModal(keyModal()));
    return;
  }

  if (act.build) {
    if (!await safeDefer(interaction, 'Setup action defer failed')) {
      return;
    }

    try {
      await safeEdit(interaction, {
        embeds: [mkEmb(await act.build(interaction))]
      }, 'Setup action edit failed');
    } catch (err) {
      logErr('Failed to build setup action reply', err);
      await safeEdit(interaction, {
        content: 'I could not load that setup information right now. Try again in a minute.'
      }, 'Setup action failure edit failed');
    }

    return;
  }

  if (act.ticket) {
    if (!await safeDefer(interaction, 'Ticket defer failed')) {
      return;
    }

    try {
      const { channel, created, deleteAt } = await createTicket(interaction);
      await safeEdit(interaction,
        created
          ? { content: `Your support ticket has been created: ${channel}\nIt will self destruct ${ticketExpiryText(deleteAt)}.` }
          : { content: `You already have an open support ticket: ${channel}\nIt will self destruct ${ticketExpiryText(deleteAt)}.` },
        'Ticket result reply failed'
      );
    } catch (err) {
      logErr('Failed to create support ticket', err);
      await safeEdit(interaction, {
        content: 'I could not create a ticket right now. Try again in a minute.'
      }, 'Ticket failure reply failed');
    }

    return;
  }

  if (act.embed) {
    await safeReply(interaction, {
      embeds: [mkEmb(act.embed)],
      flags: EPHEMERAL_FLAG
    }, 'Setup action reply failed');
  }
}

async function onKeySubmit(interaction) {
  if (interaction.customId !== CUSTOM_IDS.keyModal) {
    return;
  }

  const email = normEmail(interaction.fields.getTextInputValue('email'));
  if (!validEmail(email)) {
    await safeReply(interaction, {
      content: 'Enter a valid email address.',
      flags: EPHEMERAL_FLAG
    }, 'Invalid email reply failed');
    return;
  }

  if (!await safeDefer(interaction, 'Key lookup defer failed')) {
    return;
  }

  try {
    const result = await reqKey(email, interaction.user.id);
    const keys = lookupKeys(result);

    if (!result.found || !keys.length) {
      await safeEdit(interaction, {
        embeds: [mkEmb(result.reason === 'expired' ? expiredKeyEmb(result) : noKeyEmb(email))]
      }, 'No key reply failed');
      return;
    }

    await syncPlanRoles(interaction, keys);

    await safeEdit(interaction, {
      embeds: [mkEmb(foundKeysEmb(email, result))]
    }, 'Key lookup result reply failed');
  } catch (err) {
    logErr('Failed to look up license key', err);
    await safeEdit(interaction, {
      content: 'The key lookup service is unavailable right now. Try again in a minute.'
    }, 'Key lookup failure reply failed');
  }
}

function isAllowedMsgUser(userId) {
  const id = String(userId || '');
  return allowedMsgUsers.has(id) || id === bot.user?.id;
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
  console.log(`Runtime file: ${__filename}`);
  console.log(`Runtime cwd: ${process.cwd()}`);
  console.log(`Runtime version source: ${getBotVersionSource()}.`);

  try {
    await refreshBotVersion();
    await refreshMsgs();
    await scheduleOpenTickets();
    await runStartupMaintenance();
  } catch (err) {
    logErr('Startup task failed', err);
  }
}

bot.once('clientReady', onReady);

bot.on('warn', warning => {
  console.warn(`Discord warning: ${clip(warning, 240)}`);
});

bot.on('error', err => {
  if (staleInteraction(err)) {
    console.warn(`Discord stale interaction ignored: ${fmtErr(err, 120)}.`);
    return;
  }

  logErr('Discord client error', err);
});

process.on('unhandledRejection', err => {
  logErr('Unhandled rejection', err);
});

process.on('uncaughtException', err => {
  logErr('Uncaught exception', err);
});

bot.on('messageCreate', async message => {
  if (!message.guild || !protectedChannelIds.has(message.channelId) || isAllowedMsgUser(message.author?.id)) {
    return;
  }

  try {
    await message.delete();
  } catch (err) {
    logErr(`Failed to delete guarded message ${message.id} in ${message.channelId}`, err);
  }
});

bot.on('guildMemberAdd', member => updateCountCache(null, member));
bot.on('guildMemberRemove', member => updateCountCache(member, null));
bot.on('guildMemberUpdate', (oldMember, newMember) => updateCountCache(oldMember, newMember));

bot.on('interactionCreate', async interaction => {
  try {
    if (interaction.isButton()) {
      await onButton(interaction);
      return;
    }

    if (interaction.isModalSubmit()) {
      await onKeySubmit(interaction);
    }
  } catch (err) {
    logErr('Interaction handler failed', err);

    if (!interaction.replied && !interaction.deferred) {
      await safeReply(interaction, {
        content: 'That action failed. Try again in a minute.',
        flags: EPHEMERAL_FLAG
      }, 'Interaction failure reply failed').catch(() => null);
    }
  }
});

function startBot() {
  const token = env('TOKEN');
  console.log(`Starting SparxSolver Discord bot (${botVersionText})...`);
  console.log(`Runtime file: ${__filename}`);
  console.log(`Runtime cwd: ${process.cwd()}`);
  console.log(`Version source: ${getBotVersionSource()}.`);
  console.log(`Managed setup channel: ${CHANNEL_IDS.setup}.`);
  console.log(`TOKEN present: ${token.length} characters. Waiting for Discord ready event...`);

  readyTimer = setTimeout(() => {
    if (!ready) {
      console.warn('Discord ready event has not fired after 30s. Check the bot token, network access to Discord, and enabled gateway intents in the Discord Developer Portal.');
    }
  }, 30000);

  return bot.login(token)
    .then(() => {
      console.log('Discord login accepted; waiting for gateway ready.');
    })
    .catch(err => {
      if (readyTimer) {
        clearTimeout(readyTimer);
        readyTimer = null;
      }

      logErr('Discord login failed', err, 400);
      process.exitCode = 1;
    });
}

module.exports = {
  cid: CUSTOM_IDS,
  ids: {
    ch: CHANNEL_IDS,
    role: {
      aff: PLAN_ROLE_IDS.affordable,
      bas: PLAN_ROLE_IDS.basic,
      pro: PLAN_ROLE_IDS.pro,
      prm: PLAN_ROLE_IDS.premium
    },
    user: USER_IDS
  },
  getBotVersionSource,
  getManagedMessageParts,
  mkMsgPayload,
  readLocalBotVersion: readLocalVer,
  refreshBotVersion,
  startBot
};

if (require.main === module) {
  startBot();
}