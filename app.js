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

const server = app.listen(PORT, () => {
  console.log(`\n🟢 Serveur maintien en vie lancé sur le port ${PORT}`);
});

// ========== CHARGEMENT GOOGLE SERVICE ACCOUNT ==========
let GOOGLE_SERVICE_ACCOUNT = null;

// 1. Essayer de charger depuis la variable d'environnement GOOGLE_JSON_KEY (Koyeb)
if (process.env.GOOGLE_JSON_KEY) {
  try {
    GOOGLE_SERVICE_ACCOUNT = JSON.parse(process.env.GOOGLE_JSON_KEY);
    console.log('🔐 Service Account chargé depuis GOOGLE_JSON_KEY (env)');
  } catch (err) {
    console.error('❌ Erreur parsing GOOGLE_JSON_KEY:', err.message);
    process.exit(1);
  }
}
// 2. Sinon, charger depuis credentials.json (développement local)
else if (fs.existsSync(path.join(__dirname, 'credentials.json'))) {
  try {
    GOOGLE_SERVICE_ACCOUNT = JSON.parse(fs.readFileSync(path.join(__dirname, 'credentials.json'), 'utf8'));
    console.log('🔐 Service Account chargé depuis credentials.json (local)');
  } catch (err) {
    console.error('❌ Erreur parsing credentials.json:', err.message);
    process.exit(1);
  }
}

// Normaliser les retours à la ligne dans la clé privée si fournie via ENV ("\n")
if (GOOGLE_SERVICE_ACCOUNT && GOOGLE_SERVICE_ACCOUNT.private_key && GOOGLE_SERVICE_ACCOUNT.private_key.includes('\\n')) {
  GOOGLE_SERVICE_ACCOUNT.private_key = GOOGLE_SERVICE_ACCOUNT.private_key.replace(/\\n/g, '\n');
}

// ========== VÉRIFICATIONS PRÉ-LANCEMENT ==========
if (!SPREADSHEET_ID) {
  console.error('❌ ERREUR: SPREADSHEET_ID manquant. Configurez votre .env ou Koyeb');
  process.exit(1);
}

if (!GOOGLE_SERVICE_ACCOUNT) {
  console.error('❌ ERREUR: GOOGLE_SERVICE_ACCOUNT manquant.');
  console.error('   Koyeb: Passez la variable GOOGLE_JSON_KEY');
  console.error('   Local: Placez credentials.json dans le répertoire racine');
  process.exit(1);
}

// Créer dossier temporaire
if (!fs.existsSync(TEMP_MEDIA_DIR)) {
  fs.mkdirSync(TEMP_MEDIA_DIR, { recursive: true });
}

// ========== INITIALISATION WHATSAPP ==========
const puppeteerConfig = {
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-gpu', // Économiser RAM sur instance gratuite
    '--disable-dev-shm-usage' // Éviter les problèmes mémoire
  ]
};

// Sur macOS (développement), spécifier Chrome explicitement
if (process.platform === 'darwin') {
  puppeteerConfig.executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
}
// Sur Linux (Koyeb), utiliser Chromium auto-détecté

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: puppeteerConfig
});

// Variables de state
let isReady = false;
let campaignData = [];
let sentMessages = {}; // Track messages envoyés par row pour éviter les doublons
let isExecuting = false; // Flag pour éviter les exécutions concurrentes
const SENT_MESSAGES_FILE = './sent_messages.json';

// Charger les messages déjà envoyés
if (fs.existsSync(SENT_MESSAGES_FILE)) {
  try {
    sentMessages = JSON.parse(fs.readFileSync(SENT_MESSAGES_FILE, 'utf8'));
    console.log('📨 Messages précédents chargés');
  } catch (err) {
    console.warn('⚠️  Impossible de charger les messages envoyés');
  }
}

// ========== UTILITAIRES ==========
function parseSheetDate(dateStr) {
  if (!dateStr) return null;
  
  // Format ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  
  // Format DD/MM/YYYY
  const match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const [, dd, mm, yyyy] = match;
    return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  }
  
  return null;
}

function parseSheetTime(timeStr) {
  if (!timeStr) return null;
  
  // Format HH:mm ou H:mm
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    const [, hh, mm] = match;
    return `${String(hh).padStart(2, '0')}:${mm}`;
  }
  
  return null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getCurrentTimeStr() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function getTodayISO() {
  return new Date().toISOString().split('T')[0];
}

// ========== GOOGLE SHEETS API ==========
async function loadCampaignData() {
  try {
    console.log('📋 Lecture du Google Sheet...');
    
    // Utiliser la méthode recommandée par google-spreadsheet :
    // créer l'objet puis appeler useServiceAccountAuth avec les credentials
    const doc = new GoogleSpreadsheet(SPREADSHEET_ID);
    await doc.useServiceAccountAuth({
      client_email: GOOGLE_SERVICE_ACCOUNT.client_email,
      private_key: GOOGLE_SERVICE_ACCOUNT.private_key
    });
    await doc.loadInfo();

    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();
    
    campaignData = rows
      .map((row, index) => ({
        rowIndex: index,
        date: parseSheetDate(row.get('Date')),
        heure: parseSheetTime(row.get('Heure')),
        message: row.get('Message') || '',
        mediaId: row.get('Media_ID') || '',
        legende: row.get('Legende') || '',
        statut: row.get('Statut') || '',
        googleRow: row
      }))
      .filter(c => c.date !== null && c.heure !== null);
    
    console.log(`✅ ${campaignData.length} campagne(s) chargée(s)`);
    if (campaignData.length > 0) {
      console.log(`   Dates/Heures: ${campaignData.map(c => `${c.date} ${c.heure}`).join(', ')}`);
    }
  } catch (err) {
    console.error('❌ Erreur Google Sheets:', err.message);
  }
}

// ========== GOOGLE DRIVE API ==========
async function downloadFileFromDrive(fileId, fileName) {
  try {
    const auth = new JWT({
      email: GOOGLE_SERVICE_ACCOUNT.client_email,
      key: GOOGLE_SERVICE_ACCOUNT.private_key,
      scopes: ['https://www.googleapis.com/auth/drive']
    });

    const drive = google.drive({ version: 'v3', auth });
    const filePath = path.join(TEMP_MEDIA_DIR, fileName);
    const dest = fs.createWriteStream(filePath);

    console.log(`      ⬇️  Téléchargement de ${fileName}...`);
    
    const res = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    );

    return new Promise((resolve, reject) => {
      res.data
        .on('end', () => {
          try {
            const stat = fs.statSync(filePath);
            if (stat.size > MAX_WHATSAPP_BYTES) {
              console.warn(`      ⚠️  Fichier trop lourd (${(stat.size / 1e6).toFixed(2)} MB > 15 MB). Ignoré.`);
              fs.unlinkSync(filePath);
              resolve(null);
            } else {
              console.log(`      ✅ Téléchargé (${(stat.size / 1e6).toFixed(2)} MB)`);
              resolve(filePath);
            }
          } catch (err) {
            reject(err);
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

// ========== EXÉCUTION CAMPAGNE ==========
async function executeCampaign(campaign) {
  try {
    // Charger les contacts
    let contacts = [];
    if (fs.existsSync('./contacts.json')) {
      contacts = JSON.parse(fs.readFileSync('./contacts.json', 'utf8'));
    } else {
      console.error('❌ Fichier contacts.json manquant');
      return;
    }

    if (contacts.length === 0) {
      console.warn('⚠️  Aucun contact trouvé');
      return;
    }

    console.log(`📦 ${contacts.length} contact(s) trouvé(s)`);
    console.log(`📝 Message: ${campaign.message.substring(0, 50)}...`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const contact of contacts) {
      try {
        const chatId = contact.numero.includes('@') ? contact.numero : `${contact.numero}@c.us`;
        const recipientName = contact.nom || 'Partenaire';
        
        console.log(`\n   📤 ${recipientName}`);

        // Envoyer le message texte
        if (campaign.message.trim()) {
          const personalizedMsg = campaign.message.replace(/\$\{recipientName\}/g, recipientName);
          await client.sendMessage(chatId, personalizedMsg);
          console.log(`      ✅ Message texte envoyé`);
          await sleep(1000);
        }

        // Envoyer le média
        if (campaign.mediaId.trim()) {
          const mediaPath = await downloadFileFromDrive(
            campaign.mediaId,
            `media_${Date.now()}_${Math.random().toString(36).substring(7)}`
          );
          
          if (mediaPath && fs.existsSync(mediaPath)) {
            try {
              const media = MessageMedia.fromFilePath(mediaPath);
              const personalizedCaption = campaign.legende.replace(/\$\{recipientName\}/g, recipientName);
              await client.sendMessage(chatId, media, { caption: personalizedCaption });
              console.log(`      ✅ Média envoyé`);
              await sleep(2000);
            } finally {
              if (fs.existsSync(mediaPath)) {
                fs.unlinkSync(mediaPath);
              }
            }
          }
        }

        successCount++;
        
        // Pause aléatoire entre 45-90 secondes
        const randomWait = Math.floor(Math.random() * 45000) + 45000;
        console.log(`      ⏳ Pause ${(randomWait / 1000).toFixed(0)}s`);
        await sleep(randomWait);

      } catch (err) {
        errorCount++;
        console.error(`      ❌ Erreur: ${err.message}`);
      }
    }

    // Marquer la campagne comme "ENVOYÉ" dans Google Sheets
    try {
      campaign.googleRow.set('Statut', 'ENVOYÉ');
      await campaign.googleRow.save();
      console.log(`\n   ✅ Statut mis à jour dans Google Sheets`);
    } catch (err) {
      console.warn(`   ⚠️  Impossible de mettre à jour le statut: ${err.message}`);
    }

    const timestamp = new Date().toLocaleTimeString('fr-FR');
    console.log(`\n✅ Campagne terminée [${timestamp}] - ${successCount}/${contacts.length} réussis, ${errorCount} erreurs`);
    
  } catch (err) {
    console.error('❌ Erreur exécution campagne:', err.message);
  }
}

// ========== BOUCLE DE VÉRIFICATION ==========
async function checkAndExecuteCampaign() {
  if (!isReady || campaignData.length === 0) {
    return;
  }

  const today = getTodayISO();
  const now = getCurrentTimeStr();

  // Toujours vérifier les campagnes du jour
  const campaignsDue = campaignData.filter(
    c => c.date === today && c.heure === now && c.statut !== 'ENVOYÉ'
  );

  if (isExecuting) {
    console.log(`⏳ Exécution en cours... [${campaignsDue.length} campagne(s) en attente]`);
    return;
  }

  if (campaignsDue.length > 0) {
    isExecuting = true;
    console.log(`\n🚀 [${now}] ${campaignsDue.length} CAMPAGNE(S) À ENVOYER - Démarrage...\n`);
    
    for (const campaign of campaignsDue) {
      await executeCampaign(campaign);
      // Recharger les données pour prendre en compte le nouvel statut
      await loadCampaignData();
    }
    
    isExecuting = false;
  }
}

// ========== PLANIFICATION ==========
console.log('\n⏰ Mode Production: Vérification toutes les 60 secondes');
console.log('   Les campagnes s\'exécutent au moment spécifié dans Google Sheets\n');

setInterval(checkAndExecuteCampaign, CHECK_INTERVAL);

// Recharger les données toutes les minutes
setInterval(() => {
  loadCampaignData();
}, 60000);

// ========== NETTOYAGE À LA FERMETURE ==========
process.on('SIGINT', () => {
  console.log('\n🛑 Arrêt du bot...');
  if (fs.existsSync(TEMP_MEDIA_DIR)) {
    fs.rmSync(TEMP_MEDIA_DIR, { recursive: true });
  }
  server.close(() => {
    console.log('✅ Serveur fermé');
    process.exit(0);
  });
});

// ========== DÉMARRAGE ==========
console.log('🚀 Initialisation WhatsApp...\n');
client.initialize();


