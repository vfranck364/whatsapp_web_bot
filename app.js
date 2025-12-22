const express = require('express');
const app = express();
const port = process.env.PORT || 8080;

app.get('/', (req, res) => {
  res.send('Le Bot LiverProtect est en ligne ! 🛡️');
});

app.listen(port, () => {
  console.log(`Serveur de maintien en vie lancé sur le port ${port}`);
});

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const { google } = require('googleapis');
const cron = require('node-cron');
require('dotenv').config();

// ========== CONFIG ==========
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '';
const TEST_MODE = process.env.TEST_MODE === 'true' || process.argv.includes('--test');
const TEMP_MEDIA_DIR = './temp_media';
const MAX_WHATSAPP_BYTES = 15 * 1024 * 1024; // 15 MB

// Charger Google Service Account depuis credentials.json ou .env
let GOOGLE_SERVICE_ACCOUNT = null;
const credPath = path.join(__dirname, 'credentials.json');
if (fs.existsSync(credPath)) {
    GOOGLE_SERVICE_ACCOUNT = JSON.parse(fs.readFileSync(credPath, 'utf8'));
    console.log('🔐 Service Account chargé depuis credentials.json');
} else if (process.env.GOOGLE_SERVICE_ACCOUNT) {
    try {
        GOOGLE_SERVICE_ACCOUNT = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
        console.log('🔐 Service Account chargé depuis .env');
    } catch (err) {
        console.error('❌ Erreur parsing GOOGLE_SERVICE_ACCOUNT:', err.message);
    }
}

// Vérifier les configs requises
if (!SPREADSHEET_ID) {
    console.error('❌ SPREADSHEET_ID manquant. Vérifiez votre .env');
    process.exit(1);
}
if (!GOOGLE_SERVICE_ACCOUNT) {
    console.error('❌ GOOGLE_SERVICE_ACCOUNT manquant. Placez credentials.json ou configurez .env');
    process.exit(1);
}

// Créer dossier temporaire
if (!fs.existsSync(TEMP_MEDIA_DIR)) {
    fs.mkdirSync(TEMP_MEDIA_DIR, { recursive: true });
}

// ========== INITIALISATION WHATSAPP ==========
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('🛡️ SCANNE LE QR CODE POUR LANCER LIVERPROTECT !');
});

let isReady = false;
let campaignData = [];
let campaignTimes = {}; // { 'campaign_id': 'HH:MM' }
let sentMessages = {}; // { 'campaign_id': ['contact_num1', 'contact_num2'] }
let isExecuting = false; // Flag pour éviter les exécutions concurrentes
let executedToday = {}; // { 'campaign_id_date': true } pour tracker les exécutions du jour

// Charger les heures d'exécution précédentes
const CAMPAIGN_TIMES_FILE = './campaign_times.json';
if (fs.existsSync(CAMPAIGN_TIMES_FILE)) {
    try {
        campaignTimes = JSON.parse(fs.readFileSync(CAMPAIGN_TIMES_FILE, 'utf8'));
        console.log('📅 Heures d\'exécution précédentes chargées');
    } catch (err) {
        console.warn('⚠️  Impossible de charger les heures d\'exécution');
    }
}

// Charger les messages déjà envoyés
const SENT_MESSAGES_FILE = './sent_messages.json';
if (fs.existsSync(SENT_MESSAGES_FILE)) {
    try {
        sentMessages = JSON.parse(fs.readFileSync(SENT_MESSAGES_FILE, 'utf8'));
        console.log('📨 Messages précédents chargés');
    } catch (err) {
        console.warn('⚠️  Impossible de charger les messages envoyés');
    }
}

client.on('ready', () => {
    isReady = true;
    console.log('✅ Bot WhatsApp Connecté !');
    console.log('📋 Synchronisation Google Sheets activée...\n');
    
    // Charger les données initiales
    loadCampaignData();
});

client.on('authenticated', () => {
    console.log('🔐 Session persistée (LocalAuth)');
});

// ========== UTILITAIRES ==========
function parseSheetDateToISO(sheetDate) {
    if (!sheetDate) return null;
    // Accepter format ISO (YYYY-MM-DD)
    if (/^\d{4}-\d{2}-\d{2}$/.test(sheetDate)) return sheetDate;
    // Parser format DD/MM/YYYY
    const match = sheetDate.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!match) return null;
    const [, dd, mm, yyyy] = match;
    const iso = `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    return iso;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ========== GOOGLE SHEETS API ==========
async function loadCampaignData() {
    try {
        console.log('📋 Lecture du Google Sheet...');
        const auth = new JWT({
            email: GOOGLE_SERVICE_ACCOUNT.client_email,
            key: GOOGLE_SERVICE_ACCOUNT.private_key,
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
        
        const doc = new GoogleSpreadsheet(SPREADSHEET_ID, auth);
        await doc.loadInfo();
        
        const sheet = doc.sheetsByIndex[0];
        const rows = await sheet.getRows();
        
        campaignData = rows.map(row => ({
            date: parseSheetDateToISO(row.get('Date')),
            messagePrincipal: row.get('Message_Principal'),
            idDriveImage: row.get('ID_Drive_Image'),
            legendeImage: row.get('Legende_Image'),
            idDriveVideo: row.get('ID_Drive_Video'),
            notes: row.get('Notes')
        })).filter(c => c.date !== null);
        
        console.log(`✅ ${campaignData.length} campagnes chargées (format: DD/MM/YYYY ou ISO)`);
        if (campaignData.length > 0) {
            console.log(`   Prochaines dates: ${campaignData.map(c => c.date).join(', ')}`);
        }
    } catch (err) {
        console.error('❌ Erreur Google Sheets :', err.message);
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

        console.log(`      ⬇️  Téléchargement...`);
        
        await new Promise((resolve, reject) => {
            drive.files.get(
                { fileId, alt: 'media' },
                { responseType: 'stream' }
            ).then(res => {
                res.data
                    .on('end', () => resolve(filePath))
                    .on('error', reject)
                    .pipe(dest);
            }).catch(reject);
        });

        const stat = fs.statSync(filePath);
        if (stat.size > MAX_WHATSAPP_BYTES) {
            console.warn(`      ⚠️  Fichier trop lourd (${(stat.size / 1e6).toFixed(2)} MB > 15 MB). Ignoré.`);
            fs.unlinkSync(filePath);
            return null;
        }

        console.log(`      ✅ Téléchargé (${(stat.size / 1e6).toFixed(2)} MB)`);
        return filePath;
    } catch (err) {
        console.error(`      ❌ Erreur Drive :`, err.message);
        return null;
    }
}

// ========== VÉRIFICATION ET EXÉCUTION ==========
async function checkAndExecuteCampaign() {
    if (!isReady || campaignData.length === 0) return;

    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    // Réinitialiser executedToday à minuit
    const lastResetKey = 'lastReset';
    if (!executedToday[lastResetKey] || executedToday[lastResetKey] !== today) {
        executedToday = {};
        executedToday[lastResetKey] = today;
    }
    
    // Toujours vérifier les campagnes du jour
    const campaigns = campaignData.filter(c => c.date === today);
    
    if (isExecuting) {
        console.log(`⏳ Exécution en cours... [Vérif: ${campaigns.length} campagnes du jour trouvées]`);
        return;
    }

    console.log(`🕐 [${timeStr}] Vérification campagne pour ${today}...`);
    
    if (campaigns.length > 0) {
        isExecuting = true; // Empêcher les exécutions concurrentes
        console.log(`🚀 ✅ ${campaigns.length} CAMPAGNE(S) DU JOUR TROUVÉE(S) - Démarrage...\n`);
        for (const campaign of campaigns) {
            // Vérifier si la campagne a déjà été exécutée aujourd'hui
            const campaignId = `campaign_${campaign.messagePrincipal?.substring(0, 20)}_${today}`;
            if (!executedToday[campaignId]) {
                await executeCampaign(campaign, today);
                executedToday[campaignId] = true; // Marquer comme exécutée
            } else {
                console.log(`⏭️  Campagne déjà exécutée aujourd'hui, skippée`);
            }
        }
        // NE PAS supprimer les campagnes - elles se relanceront demain !
        isExecuting = false; // Fin de l'exécution
    } else {
        console.log(`✅ Aucune campagne pour ${today}`);
    }
}
async function executeCampaign(campaign, campaignDate) {
    try {
        const contacts = JSON.parse(fs.readFileSync('./contacts.json', 'utf8'));
        console.log(`📦 ${contacts.length} contacts trouvés\n`);
        console.log(`📝 Campagne: ${campaign.messagePrincipal ? campaign.messagePrincipal.substring(0, 50) + '...' : 'Sans message'}\n`);

        let successCount = 0;
        let errorCount = 0;
        let skippedCount = 0;
        
        // Enregistrer l'heure d'exécution si c'est la première fois
        const campaignId = `campaign_${campaignDate}_${campaign.messagePrincipal?.substring(0, 20)}`;
        if (!campaignTimes[campaignId]) {
            const now = new Date();
            const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            campaignTimes[campaignId] = timeStr;
            fs.writeFileSync(CAMPAIGN_TIMES_FILE, JSON.stringify(campaignTimes, null, 2));
            console.log(`⏰ Heure d'exécution enregistrée: ${timeStr}`);
            console.log(`📅 Les jours suivants, cette campagne sera envoyée à ${timeStr}\n`);
        }

        // Initialiser la liste des contacts envoyés pour cette campagne
        if (!sentMessages[campaignId]) {
            sentMessages[campaignId] = [];
        }

        for (const contact of contacts) {
            const chatId = contact.numero.includes('@') ? contact.numero : `${contact.numero}@c.us`;
            
            console.log(`📤 ${contact.nom}`);

            try {
                // Message principal avec remplacement de ${recipientName}
                if (campaign.messagePrincipal && campaign.messagePrincipal.trim()) {
                    const recipientName = contact.nom && contact.nom.trim() ? contact.nom : 'Partenaire';
                    const personalizedMessage = campaign.messagePrincipal.replace(/\$\{recipientName\}/g, recipientName);
                    await client.sendMessage(chatId, personalizedMessage);
                    console.log(`   ✅ Message envoyé`);
                    await sleep(1000);
                }

                // Image depuis Drive
                if (campaign.idDriveImage && campaign.idDriveImage.trim()) {
                    const imagePath = await downloadFileFromDrive(
                        campaign.idDriveImage,
                        `img_${Date.now()}.jpg`
                    );
                    if (imagePath && fs.existsSync(imagePath)) {
                        const image = MessageMedia.fromFilePath(imagePath);
                        const recipientName = contact.nom && contact.nom.trim() ? contact.nom : 'Partenaire';
                        const personalizedCaption = (campaign.legendeImage || '').replace(/\$\{recipientName\}/g, recipientName);
                        await client.sendMessage(chatId, image, { caption: personalizedCaption });
                        console.log(`   ✅ Image envoyée`);
                        await sleep(1200);
                        fs.unlinkSync(imagePath);
                    }
                }

                // Vidéo depuis Drive
                if (campaign.idDriveVideo && campaign.idDriveVideo.trim()) {
                    const videoPath = await downloadFileFromDrive(
                        campaign.idDriveVideo,
                        `vid_${Date.now()}.mp4`
                    );
                    if (videoPath && fs.existsSync(videoPath)) {
                        const video = MessageMedia.fromFilePath(videoPath);
                        await client.sendMessage(chatId, video);
                        console.log(`   ✅ Vidéo envoyée`);
                        await sleep(2000);
                        fs.unlinkSync(videoPath);
                    }
                }

                successCount++;
                
                const randomWait = Math.floor(Math.random() * 45000) + 45000;
                console.log(`   ⏳ Pause ${(randomWait / 1000).toFixed(0)}s\n`);
                await sleep(randomWait);

            } catch (err) {
                errorCount++;
                console.error(`   ❌ ${err.message}\n`);
            }
        }
        const timestamp = new Date().toLocaleTimeString('fr-FR');
        console.log(`✅ Campagne terminée [${timestamp}] - ${successCount}/${contacts.length} réussis`);
    } catch (err) {
        console.error('❌ Erreur campagne :', err.message);
    }
}

// ========== PLANIFICATION ==========
if (TEST_MODE) {
    console.log('\n🧪 MODE TEST : Vérification TOUTES LES MINUTES');
    setInterval(checkAndExecuteCampaign, 60000);
} else {
    console.log('\n⏰ MODE PRODUCTION : Vérification toutes les minutes');
    console.log('   Les campagnes s\'exécutent à l\'heure enregistrée du premier envoi');
    setInterval(checkAndExecuteCampaign, 60000);
}

// Recharger les données chaque MINUTE pour prendre en compte les modifications
setInterval(() => {
    console.log('🔄 Rechargement Google Sheets...');
    loadCampaignData();
}, 60000);

// Nettoyage à la fermeture
process.on('SIGINT', () => {
    console.log('\n🛑 Arrêt...');
    if (fs.existsSync(TEMP_MEDIA_DIR)) {
        fs.rmSync(TEMP_MEDIA_DIR, { recursive: true });
    }
    process.exit(0);
});

client.initialize();


