# 🚀 SETUP COMPLET - WhatsApp Bot + Google Sheets + Drive

## ÉTAPE 1 : Installer les dépendances

```bash
cd /Users/franckvictorien/Documents/whatsapp_web_bot
npm install
```

## ÉTAPE 2 : Configurer Google Cloud

### 2a. Créer un projet Google Cloud
1. Aller à https://console.cloud.google.com
2. Créer un nouveau projet (ex: "LiverProtect Bot")
3. Activer les APIs :
   - Google Sheets API
   - Google Drive API

### 2b. Créer un Service Account
1. Aller à : **IAM & Admin > Service Accounts**
2. Créer un nouveau compte de service
3. Noter l'email du compte (ex: `bot@liverprotect.iam.gserviceaccount.com`)
4. Créer une clé JSON :
   - Cliquer sur le compte > **Clés > Ajouter une clé > JSON**
   - Télécharger le fichier `service-account-key.json`

### 2c. Partager le Google Sheet avec le Service Account
1. Ouvrir votre Google Sheet
2. Cliquer sur **Partager**
3. Coller l'email du Service Account (ex: `bot@liverprotect.iam.gserviceaccount.com`)
4. Accorder l'accès en édition

### 2d. Récupérer l'ID du Sheet
L'ID se trouve dans l'URL :
```
https://docs.google.com/spreadsheets/d/[ID_ICI]/edit
```

## ÉTAPE 3 : Créer le fichier `.env`

Copier `.env.example` et le renommer en `.env` :
```bash
cp .env.example .env
```

Éditer `.env` avec :
```env
SPREADSHEET_ID=votre_id_sheet_ici

GOOGLE_SERVICE_ACCOUNT={"type":"service_account","project_id":"votre-project","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"bot@liverprotect.iam.gserviceaccount.com","client_id":"...","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs"}
```

**Important :** Copier le contenu COMPLET du JSON `service-account-key.json` entre les guillemets.

## ÉTAPE 4 : Créer la structure Google Sheet

Créer ces colonnes :
| Date | Message_Principal | ID_Drive_Image | Legende_Image | ID_Drive_Video | Notes |
|------|------------------|----------------|---------------|----------------|-------|
| 2025-12-24 | Votre message... | FILE_ID_IMAGE | Légende | FILE_ID_VIDEO | Test |

### Comment récupérer l'ID d'un fichier Drive ?

1. Ouvrir le fichier sur Drive
2. Copier depuis l'URL :
```
https://drive.google.com/file/d/[ID_ICI]/view
```

## ÉTAPE 5 : Remplir `contacts.json`

Le fichier est déjà rempli avec 291 contacts uniques. Format :
```json
[
  {"nom": "Nom Contact", "numero": "237123456789"},
  {"nom": "Autre Contact", "numero": "237987654321"}
]
```

## ÉTAPE 6 : Tester le bot

### Test 1 : Vérifier la connexion Google
```bash
node app.js
```

Vous devriez voir :
- `✅ Bot WhatsApp Connecté !`
- `📋 Synchronisation Google Sheets activée...`
- `📊 X campagnes chargées depuis Google Sheets`

### Test 2 : Scanner le QR Code
- Un QR Code s'affiche
- Scannez-le avec WhatsApp Web
- Le bot se connecte

### Test 3 : Vérifier une campagne

Ajouter une ligne dans le Sheet avec la date d'aujourd'hui (YYYY-MM-DD).

Le bot vérifie chaque minute et lance l'envoi automatiquement.

## STRUCTURE DES FICHIERS

```
whatsapp_web_bot/
├── app.js                    # Fichier principal (Google Sheets + Drive + WhatsApp)
├── campaign.js               # (optionnel) Logique campagne locale
├── contacts.json             # 291 contacts nettoyés
├── .env                      # ⚠️ SECRETS (ne pas commiter)
├── .env.example              # Modèle
├── .gitignore                # Ignore les secrets
├── package.json              # Dépendances
├── .wwebjs_auth/             # Session WhatsApp (auto-créé)
├── .wwebjs_cache/            # Cache (auto-créé)
└── temp_media/               # Fichiers Drive temporaires (auto-créé)
```

## ARBORESCENCE LOGIQUE

1. **App démarre**
   - Se connecte à WhatsApp Web
   - Charge les campagnes depuis Google Sheets

2. **Chaque minute**
   - Vérifie si la date d'aujourd'hui existe dans le Sheet
   - Si oui : télécharge les médias Drive et envoie à tous les contacts

3. **Chaque heure**
   - Recharge les données du Sheet (pour les modifications)

## DÉPANNAGE

### ❌ "GOOGLE_SERVICE_ACCOUNT non configuré"
→ Vérifier que `.env` contient bien `GOOGLE_SERVICE_ACCOUNT`

### ❌ "Impossible de lire le Sheet"
→ Vérifier que le Service Account a accès au Sheet (partage)

### ❌ "Erreur Drive : fileNotFound"
→ Vérifier que l'ID du fichier Drive est correct

### ❌ "WhatsApp QR ne s'affiche pas"
→ Chrome peut ne pas être au chemin `/Applications/Google Chrome.app/...`
→ Vérifier le chemin dans `app.js`

## COMMANDES

```bash
# Lancer le bot
npm start

# Mode développement (redémarre auto)
npm run dev
```

## SÉCURITÉ

⚠️ **IMPORTANT** :
- Ne JAMAIS commiter `.env` (ajouter à `.gitignore`)
- Les credentials Google restent privées
- Les sessions WhatsApp sont chiffrées localement

## Support

Pour des questions sur :
- Google Sheets API → https://developers.google.com/sheets
- Google Drive API → https://developers.google.com/drive
- WhatsApp Web.js → https://github.com/pedroslopez/whatsapp-web.js
