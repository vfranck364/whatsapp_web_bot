# Mises à jour du Bot WhatsApp - LiverProtect 🚀

## 🎯 Changements majeurs (v2.1.0)

### 1️⃣ **Chargement Google Service Account Automatique**
- **Avant** : Erreur si GOOGLE_SERVICE_ACCOUNT vide
- **Après** : Charge automatiquement `credentials.json` s'il existe
  - Si `credentials.json` présent → utilise ce fichier
  - Sinon si `.env` GOOGLE_SERVICE_ACCOUNT rempli → utilise .env
  - Sinon → erreur explicite avec instructions

```javascript
// Recherche automatique
const credPath = path.join(__dirname, 'credentials.json');
if (fs.existsSync(credPath)) {
    GOOGLE_SERVICE_ACCOUNT = JSON.parse(fs.readFileSync(credPath, 'utf8'));
    console.log('🔐 Service Account chargé depuis credentials.json');
}
```

### 2️⃣ **Support DD/MM/YYYY dans Google Sheets**
- **Nouvelle fonction** : `parseSheetDateToISO()`
- Accepte deux formats :
  - `DD/MM/YYYY` (ex: `25/12/2024`) ← **Recommandé pour Google Sheets**
  - `YYYY-MM-DD` (ex: `2024-12-25`) ← Format ISO standard

```javascript
// Exemple
parseSheetDateToISO('25/12/2024') // → '2024-12-25'
parseSheetDateToISO('2024-12-25')  // → '2024-12-25'
```

### 3️⃣ **Planification Avancée : Cron 10:00 AM**
- **Mode PRODUCTION** (défaut) : Exécute à 10:00 AM tous les jours
- **Mode TEST** : Vérification toutes les minutes

**Activation Mode TEST** :
```bash
# Option 1 : Variable d'environnement
TEST_MODE=true node app.js

# Option 2 : Argument CLI
node app.js --test
```

### 4️⃣ **Vérification Taille Fichiers (WhatsApp Limit)**
- Limite WhatsApp : **15 MB par fichier**
- Validation avant envoi :
  - Si fichier > 15 MB → ⚠️ Avertissement + fichier ignoré
  - Affiche la taille réelle téléchargée

```
⬇️  Téléchargement...
✅ Téléchargé (8.45 MB)  ← OK

⬇️  Téléchargement...
⚠️  Fichier trop lourd (18.90 MB > 15 MB). Ignoré.
```

### 5️⃣ **Logs Améliorés et Détaillés**
Chaque étape est maintenant explicitement loggée :

```
🔐 Service Account chargé depuis credentials.json
✅ Bot WhatsApp Connecté !
📋 Lecture du Google Sheet...
✅ 3 campagnes chargées (format: DD/MM/YYYY ou ISO)
   Prochaines dates: 2024-12-25, 2025-01-15, 2025-02-20

⏰ MODE PRODUCTION : Exécution à 10:00 chaque jour

[10:00] 🕐 Vérification campagne pour 2024-12-25...
🚀 ✅ CAMPAGNE TROUVÉE - Démarrage...

📦 291 contacts trouvés
📤 Ahmed Benissa
   ✅ Message envoyé
   ⬇️  Téléchargement...
   ✅ Téléchargé (5.32 MB)
   ✅ Image envoyée
   ⏳ Pause 65.5s
```

---

## 🔧 Comment Configurer

### Étape 1 : Placer `credentials.json`
Copie le fichier `credentials.json` depuis Google Cloud Console à la racine du projet :
```
whatsapp_web_bot/
├── app.js
├── contacts.json
├── credentials.json  ← À placer ici !
├── package.json
└── .env
```

**OU** si tu préfères la variable d'environnement `.env` :
```env
SPREADSHEET_ID=1Fv-tLLa2rp_9sHXK5iroinTUtgjLFxtwdrKIaEWhVgU
GOOGLE_SERVICE_ACCOUNT={"type":"service_account","project_id":"...","private_key":"..."}
```

### Étape 2 : Formater les Dates dans Google Sheet
Dans ta colonne "Date", utilise le format **DD/MM/YYYY** :
```
Date
25/12/2024
15/01/2025
20/02/2025
```

### Étape 3 : Lancer le Bot

**Production** (exécution 10:00 AM) :
```bash
node app.js
```

**Test** (vérification chaque minute) :
```bash
TEST_MODE=true node app.js
# ou
node app.js --test
```

---

## 📊 Structure du Google Sheet

| Column | Format | Exemple |
|--------|--------|---------|
| **Date** | DD/MM/YYYY | 25/12/2024 |
| **Message_Principal** | Texte libre | "Bonjour Ahmed..." |
| **ID_Drive_Image** | Google Drive File ID | 1aB2cD3eF4gH5iJ6kL7mN8oP9qR0sT |
| **Legende_Image** | Texte (optionnel) | "Voici le produit LiverProtect" |
| **ID_Drive_Video** | Google Drive File ID | 9tU8vW7xY6zA5bC4dE3fG2hI1jK |
| **Notes** | Texte libre (optionnel) | "Campagne prioritaire" |

---

## 🧪 Tester Rapidement

Pour valider que tout fonctionne :

```bash
# Mode test (exécution chaque minute)
TEST_MODE=true node app.js

# Scanne le QR code
# Attends 1-2 minutes
# Cherche le log : "🕐 [HH:MM] Vérification campagne pour YYYY-MM-DD..."
```

Si le log apparaît = ✅ Bot fonctionne

---

## ⚠️ Erreurs Couantes et Solutions

### ❌ "SPREADSHEET_ID manquant"
**Solution** : Vérifiez `.env`
```env
SPREADSHEET_ID=1Fv-tLLa2rp_9sHXK5iroinTUtgjLFxtwdrKIaEWhVgU
```

### ❌ "GOOGLE_SERVICE_ACCOUNT manquant"
**Solutions** :
1. Placez `credentials.json` à la racine
2. OU remplissez `.env` GOOGLE_SERVICE_ACCOUNT
3. OU créez une nouvelle clé dans Google Cloud Console

### ❌ "Fichier trop lourd"
**Solution** : Compressez votre image/vidéo
- Images : max 15 MB (compressez avec TinyPNG)
- Vidéos : max 15 MB (réduisez la résolution avec FFmpeg)

### ❌ Dates ne correspondent pas
**Solution** : Vérifiez le format dans Google Sheet
- ✅ Bon : `25/12/2024` (DD/MM/YYYY)
- ❌ Mauvais : `12/25/2024` (MM/DD/YYYY)
- ❌ Mauvais : `2024-12-25` (YYYY-MM-DD dans le sheet)

---

## 📝 Fichier `.env` Complet

```env
# Google Sheets
SPREADSHEET_ID=1Fv-tLLa2rp_9sHXK5iroinTUtgjLFxtwdrKIaEWhVgU

# Google Service Account (optionnel si credentials.json existe)
# GOOGLE_SERVICE_ACCOUNT={"type":"service_account",...}

# Mode Test (optionnel, défaut: false = production 10:00 AM)
# TEST_MODE=true
```

---

## 🎯 Prochaines Étapes

1. ✅ Placer `credentials.json` (ou mettre .env GOOGLE_SERVICE_ACCOUNT)
2. ✅ Tester en mode test : `TEST_MODE=true node app.js`
3. ✅ Vérifier que le bot charge les campagnes
4. ✅ Vérifier que le bot envoie aux contacts
5. ✅ Lancer en production : `node app.js` (exécution 10:00 AM)

---

## 📞 Support

Si tu as besoin d'aide :
1. Vérifiez les logs (cherchez 🔐, ✅, ❌)
2. Vérifiez que `contacts.json` existe et n'est pas vide
3. Vérifiez que le Google Sheet est bien partagé avec le Service Account
4. Vérifiez que les IDs Drive des fichiers sont corrects

---

**Dernière mise à jour** : 22 Décembre 2024
**Version** : 2.1.0
**État** : Production-Ready ✅
