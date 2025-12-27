const express = require('express');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const { google } = require('googleapis');
require('dotenv').config();

// ========== CONFIG ==========
const PORT = process.env.PORT || 8000;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const TEMP_MEDIA_DIR = './temp_media';
const MAX_WHATSAPP_BYTES = 15 * 1024 * 1024; // 15 MB
const CHECK_INTERVAL = 60000; // 60 secondes

// ========== INITIALISATION EXPRESS (MAINTIEN EN VIE) ==========
const app = express();

app.get('/', (req, res) => {
  res.status(200).send('Bot Active ✅');
});

app.get('/health', (req, res) => {
  const health = {
    status: isReady ? 'healthy' : 'unhealthy',
    whatsapp: isReady ? 'connected' : 'disconnected',
    campaigns: campaignData.length,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    timezone: 'Europe/Paris'
  };
  const statusCode = isReady ? 200 : 503;
  res.status(statusCode).json(health);
});

const server = app.listen(PORT, () => {
  console.log(`\n🟢 Serveur maintien en vie lancé sur le port ${PORT}`);
});

// ========== CHARGEMENT GOOGLE SERVICE ACCOUNT ==========
let GOOGLE_SERVICE_ACCOUNT = null;

if (process.env.GOOGLE_JSON_KEY) {
  try {
    GOOGLE_SERVICE_ACCOUNT = JSON.parse(process.env.GOOGLE_JSON_KEY);
    console.log('🔐 Service Account chargé depuis GOOGLE_JSON_KEY (env)');
  } catch (err) {
    console.error('❌ Erreur parsing GOOGLE_JSON_KEY:', err.message);
    process.exit(1);
  }
}
else if (fs.existsSync(path.join(__dirname, 'credentials.json'))) {
  try {
    GOOGLE_SERVICE_ACCOUNT = JSON.parse(fs.readFileSync(path.join(__dirname, 'credentials.json'), 'utf8'));
    console.log('🔐 Service Account chargé depuis credentials.json (local)');
  } catch (err) {
    console.error('❌ Erreur parsing credentials.json:', err.message);
    process.exit(1);
  }
}

if (GOOGLE_SERVICE_ACCOUNT && GOOGLE_SERVICE_ACCOUNT.private_key && GOOGLE_SERVICE_ACCOUNT.private_key.includes('\\n')) {
  GOOGLE_SERVICE_ACCOUNT.private_key = GOOGLE_SERVICE_ACCOUNT.private_key.replace(/\\n/g, '\n');
}

if (!SPREADSHEET_ID) {
  console.error('❌ ERREUR: SPREADSHEET_ID manquant. Configurez votre .env ou Koyeb');
  process.exit(1);
}

if (!GOOGLE_SERVICE_ACCOUNT) {
  console.error('❌ ERREUR: GOOGLE_SERVICE_ACCOUNT manquant.');
  process.exit(1);
}

if (!fs.existsSync(TEMP_MEDIA_DIR)) {
  fs.mkdirSync(TEMP_MEDIA_DIR, { recursive: true });
}

// ========== INITIALISATION WHATSAPP ==========
const puppeteerConfig = {
  headless: 'new',
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu',
    '--disable-extensions'
  ],
  authTimeout: 60000,
};

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: puppeteerConfig,
  webVersionCache: {
    type: 'remote',
    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
  },
});

let isReady = false;
let campaignData = [];
let isExecuting = false;
let launchTime = null;

// Définir l'heure actuelle comme heure de lancement à chaque démarrage
function updateLaunchTime() {
  const now = new Date();
  const parisTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
  launchTime = `${String(parisTime.getHours()).padStart(2, '0')}:${String(parisTime.getMinutes()).padStart(2, '0')}`;
}
updateLaunchTime();
console.log(`⏰ Bot lancé à: ${launchTime} (heure de Paris)`);

// ========== UTILITAIRES ==========
function parseSheetDate(dateStr) {
  if (!dateStr) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const [, dd, mm, yyyy] = match;
    return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  }
  return null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function validatePhoneNumber(numero) {
  if (!numero) return null;
  let cleanNum = String(numero).replace(/[^\d+]/g, '');
  if (cleanNum.startsWith('00')) {
    cleanNum = '+' + cleanNum.substring(2);
  } else if (!cleanNum.startsWith('+')) {
    if (cleanNum.length >= 10) cleanNum = '+' + cleanNum;
  }
  if (/^\+\d{8,15}$/.test(cleanNum)) return cleanNum;
  if (/^0[1-9]\d{8}$/.test(cleanNum)) return '+33' + cleanNum.substring(1);
  return null;
}

function getCurrentTimeStr() {
  const now = new Date();
  const parisTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
  return `${String(parisTime.getHours()).padStart(2, '0')}:${String(parisTime.getMinutes()).padStart(2, '0')}`;
}

function getTodayISO() {
  const now = new Date();
  const parisDate = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
  const year = parisDate.getFullYear();
  const month = String(parisDate.getMonth() + 1).padStart(2, '0');
  const day = String(parisDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ========== GOOGLE API HANDLERS ==========
async function loadCampaignData(retryCount = 0) {
  try {
    const serviceAccountAuth = new JWT({
      email: GOOGLE_SERVICE_ACCOUNT.client_email,
      key: GOOGLE_SERVICE_ACCOUNT.private_key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();

    campaignData = rows.map((row, index) => {
      const date = row.get('Date');
      return {
        rowIndex: index,
        date: parseSheetDate(date),
        heure: launchTime,
        message: row.get('Message') || row.get('Message_Principal') || row.get('message') || '',
        mediaId: row.get('Media_ID') || row.get('ID_Drive_Image') || row.get('ID_Drive_Video') || '',
        legende: row.get('Legende') || row.get('Legende_Image') || row.get('Caption') || '',
        statut: row.get('Statut') || row.get('Status') || '',
        googleRow: row
      };
    }).filter(c => c.date !== null);

    console.log(`✅ ${campaignData.length} campagne(s) chargée(s). Prochain envoi prévu à ${launchTime}`);
  } catch (err) {
    console.error('❌ Erreur Google Sheets:', err.message);
    if (retryCount < 3) {
      await sleep(5000 * (retryCount + 1));
      return loadCampaignData(retryCount + 1);
    }
  }
}

async function downloadFileFromDrive(fileId, fileNameBase) {
  try {
    const auth = new JWT({
      email: GOOGLE_SERVICE_ACCOUNT.client_email,
      key: GOOGLE_SERVICE_ACCOUNT.private_key,
      scopes: ['https://www.googleapis.com/auth/drive']
    });
    const drive = google.drive({ version: 'v3', auth });
    const fileMetadata = await drive.files.get({ fileId, fields: 'name, mimeType' });
    const mimeType = fileMetadata.data.mimeType;
    let extension = '';
    if (mimeType.includes('image/jpeg')) extension = '.jpg';
    else if (mimeType.includes('image/png')) extension = '.png';
    else if (mimeType.includes('video/mp4')) extension = '.mp4';
    else if (mimeType.includes('application/pdf')) extension = '.pdf';
    else extension = path.extname(fileMetadata.data.name) || '';

    const fileName = `${fileNameBase}${extension}`;
    const filePath = path.join(TEMP_MEDIA_DIR, fileName);
    const dest = fs.createWriteStream(filePath);

    const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });

    return new Promise((resolve, reject) => {
      res.data
        .on('end', () => {
          const stat = fs.statSync(filePath);
          if (stat.size > 15 * 1024 * 1024) {
            fs.unlinkSync(filePath);
            resolve(null);
          } else {
            resolve(filePath);
          }
        })
        .on('error', reject)
        .pipe(dest);
    });
  } catch (err) {
    console.error(`      ❌ Erreur Drive: ${err.message}`);
    return null;
  }
}

// ========== SENDING LOGIC ==========
async function sendCampaignToContact(contact, campaign) {
  try {
    const validNumber = validatePhoneNumber(contact.numero);
    if (!validNumber) return false;

    const chatId = validNumber.replace('+', '') + '@c.us';
    const recipientName = contact.nom || 'Partenaire';

    console.log(`\n   📤 [CAMPAIGNE ${campaign.rowIndex + 1}] Vers ${recipientName} (${validNumber})`);

    // Texte
    if (campaign.message.trim()) {
      const personalizedMsg = campaign.message.replace(/\$\{recipientName\}/g, recipientName);
      await client.sendMessage(chatId, personalizedMsg);
      console.log(`      ✅ Message texte envoyé`);
      await sleep(1000);
    }

    // Média
    if (campaign.mediaId.trim()) {
      const mediaPath = await downloadFileFromDrive(campaign.mediaId, `media_${Date.now()}_${Math.random().toString(36).substring(7)}`);
      if (mediaPath && fs.existsSync(mediaPath)) {
        try {
          const media = MessageMedia.fromFilePath(mediaPath);
          const personalizedCaption = campaign.legende.replace(/\$\{recipientName\}/g, recipientName);
          await client.sendMessage(chatId, media, { caption: personalizedCaption });
          console.log(`      ✅ Média envoyé`);
          await sleep(2000);
        } finally {
          if (fs.existsSync(mediaPath)) fs.unlinkSync(mediaPath);
        }
      }
    }
    return true;
  } catch (err) {
    console.error(`      ❌ Erreur: ${err.message}`);
    return false;
  }
}

async function checkAndExecuteCampaign() {
  if (!isReady || campaignData.length === 0 || isExecuting) return;

  const today = getTodayISO();
  const campaignsDue = campaignData.filter(c => c.date === today && c.statut !== 'ENVOYÉ');

  if (campaignsDue.length > 0) {
    isExecuting = true;
    console.log(`\n🚀 [${getCurrentTimeStr()}] ${campaignsDue.length} CAMPAGNE(S) DÉTECTÉE(S) - Démarrage de l'envoi...\n`);

    let contacts = [];
    try {
      if (fs.existsSync('./contacts.json')) {
        let rawData = fs.readFileSync('./contacts.json', 'utf8');
        rawData = rawData.replace(/}\s*[\r\n]+\s*{/g, '},{').replace(/}\s*{/g, '},{');
        contacts = JSON.parse(rawData);
      }
    } catch (err) {
      console.error('❌ Erreur contacts:', err.message);
      isExecuting = false;
      return;
    }

    if (contacts.length > 0) {
      for (const contact of contacts) {
        console.log(`\n👤 Contact: ${contact.nom || 'Sans nom'} (${contact.numero})`);
        for (const campaign of campaignsDue) {
          await sendCampaignToContact(contact, campaign);
        }
        const wait = Math.floor(Math.random() * 45000) + 45000;
        console.log(`   ⏳ Pause ${(wait / 1000).toFixed(0)}s...`);
        await sleep(wait);
      }

      for (const campaign of campaignsDue) {
        try {
          campaign.googleRow.set('Statut', 'ENVOYÉ');
          await campaign.googleRow.save();
        } catch (e) {
          console.warn(`   ⚠️ Erreur status update: ${e.message}`);
        }
      }
    }
    isExecuting = false;
    console.log(`\n✅ Session d'envoi terminée.\n`);
  }
}

// ========== EVENTS ==========
client.on('qr', (qr) => qrcode.generate(qr, { small: true }));
client.on('ready', async () => {
  console.log('✅ WhatsApp prêt!');
  isReady = true;
  await loadCampaignData();
  await checkAndExecuteCampaign();
  setInterval(async () => {
    if (isReady && !isExecuting) {
      await loadCampaignData();
      await checkAndExecuteCampaign();
    }
  }, CHECK_INTERVAL);
});

client.on('disconnected', () => { isReady = false; });

console.log('🚀 Initialisation...');
client.initialize();

process.on('SIGINT', () => {
  if (fs.existsSync(TEMP_MEDIA_DIR)) fs.rmSync(TEMP_MEDIA_DIR, { recursive: true });
  process.exit(0);
});
