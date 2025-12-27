# 🚀 Guide de Déploiement Koyeb

Ce guide détaille étape par étape comment déployer votre bot WhatsApp sur Koyeb.

## ⚠️ Avertissement Important

**PROBLÈME MAJEUR:** WhatsApp Web nécessite une authentification par QR code lors de la première connexion. Sur un serveur distant comme Koyeb, vous ne pouvez pas scanner ce QR code directement.

### Solutions Possibles

1. **Solution Temporaire (Non recommandée pour production)**
   - Authentifier le bot en local
   - Copier le dossier `.wwebjs_auth` vers un stockage cloud
   - Restaurer ce dossier sur Koyeb à chaque déploiement
   - ⚠️ La session peut expirer et nécessiter une réauthentification

2. **Solution Professionnelle (Recommandée)**
   - Utiliser l'API officielle **WhatsApp Business Platform**
   - Pas besoin de QR code
   - Plus stable et conforme aux conditions d'utilisation
   - Coût: Gratuit jusqu'à 1000 conversations/mois

## 📋 Prérequis

- [ ] Compte GitHub/GitLab avec votre code
- [ ] Compte Koyeb (gratuit pour commencer)
- [ ] Google Cloud Service Account configuré
- [ ] Google Sheet préparé avec les campagnes
- [ ] Fichier `contacts.json` prêt

## 🔧 Étape 1: Préparer le Repository

### 1.1 Vérifier les fichiers

Assurez-vous que ces fichiers sont présents:
```bash
✅ Dockerfile
✅ .dockerignore
✅ package.json
✅ app.js
✅ .env.example
✅ README.md
```

### 1.2 Vérifier .gitignore

Assurez-vous que ces fichiers sont ignorés:
```
.env
credentials.json
.wwebjs_auth/
.wwebjs_cache/
contacts.json
```

### 1.3 Pusher sur Git

```bash
git add .
git commit -m "Prêt pour déploiement Koyeb"
git push origin main
```

## 🌐 Étape 2: Créer le Service Koyeb

### 2.1 Se connecter à Koyeb

1. Aller sur [app.koyeb.com](https://app.koyeb.com)
2. Se connecter ou créer un compte
3. Cliquer sur "Create Service"

### 2.2 Configurer la Source

1. **Deployment method:** Git
2. **Repository:** Sélectionner votre repository
3. **Branch:** main (ou master)
4. **Builder:** Docker

### 2.3 Configurer l'Instance

- **Service name:** `whatsapp-bot` (ou votre choix)
- **Region:** Paris (Europe)
- **Instance type:** Nano (512 MB RAM) - suffisant pour commencer

### 2.4 Configurer les Ports

- **Port:** 8000
- **Protocol:** HTTP

## 🔐 Étape 3: Variables d'Environnement

Cliquer sur "Environment variables" et ajouter:

### Variables Requises

#### SPREADSHEET_ID
```
Nom: SPREADSHEET_ID
Valeur: 1Fv-tLLa2rp_9sHXK5iroinTUtgjLFxtwdrKIaEWhVgU
```
> Copier depuis l'URL de votre Google Sheet

#### GOOGLE_JSON_KEY
```
Nom: GOOGLE_JSON_KEY
Valeur: {"type":"service_account","project_id":"...","private_key":"..."}
```

**⚠️ IMPORTANT:** 
1. Ouvrir votre fichier `credentials.json`
2. Copier **TOUT** le contenu
3. Le mettre sur **UNE SEULE LIGNE** (supprimer tous les retours à la ligne)
4. Coller dans Koyeb

**Exemple de conversion:**
```json
// Avant (multi-lignes)
{
  "type": "service_account",
  "project_id": "mon-projet",
  "private_key": "-----BEGIN PRIVATE KEY-----\nABC...\n-----END PRIVATE KEY-----\n"
}

// Après (une ligne)
{"type":"service_account","project_id":"mon-projet","private_key":"-----BEGIN PRIVATE KEY-----\\nABC...\\n-----END PRIVATE KEY-----\\n"}
```

> **Astuce:** Utilisez un outil en ligne comme [jsonformatter.org](https://jsonformatter.org) pour minifier le JSON

#### PORT
```
Nom: PORT
Valeur: 8000
```

#### NODE_ENV
```
Nom: NODE_ENV
Valeur: production
```

#### LOG_LEVEL (optionnel)
```
Nom: LOG_LEVEL
Valeur: INFO
```
> Utilisez DEBUG pour plus de détails

## 🏥 Étape 4: Health Check

Dans "Advanced" > "Health checks":

```
Path: /health
Port: 8000
Protocol: HTTP
Initial delay: 60 seconds
Period: 30 seconds
Timeout: 10 seconds
Success threshold: 1
Failure threshold: 3
```

## 🚀 Étape 5: Déployer

1. Cliquer sur "Deploy"
2. Attendre la construction de l'image Docker (3-5 minutes)
3. Vérifier les logs en temps réel

### Vérifier le Déploiement

Une fois déployé, accéder à:
```
https://votre-app-koyeb.app/
```

Vous devriez voir: `Bot Active ✅`

Vérifier le health check:
```
https://votre-app-koyeb.app/health
```

Réponse attendue:
```json
{
  "status": "unhealthy",
  "whatsapp": "disconnected",
  "campaigns": 0,
  "uptime": 45,
  "timestamp": "2025-12-23T21:00:00.000Z",
  "timezone": "Europe/Paris"
}
```

> **Note:** `status: "unhealthy"` est normal car WhatsApp n'est pas encore connecté (problème du QR code)

## 📱 Étape 6: Authentification WhatsApp (Problématique)

### Le Problème

Le bot affichera un QR code dans les logs Koyeb, mais vous ne pouvez pas le scanner depuis votre téléphone car:
- Le QR code est en ASCII dans les logs
- Il expire après 20 secondes
- Impossible de le scanner depuis un terminal distant

### Solutions de Contournement

#### Option A: Authentification Locale + Upload

1. **Lancer le bot en local:**
```bash
npm install
npm start
```

2. **Scanner le QR code** avec WhatsApp

3. **Copier le dossier de session:**
```bash
# Le dossier .wwebjs_auth contient la session
tar -czf session.tar.gz .wwebjs_auth
```

4. **Problème:** Koyeb n'a pas de stockage persistant
   - La session sera perdue à chaque redéploiement
   - Nécessite un volume persistant (non disponible sur le plan gratuit)

#### Option B: Utiliser un Service de Stockage

1. Uploader `.wwebjs_auth` vers AWS S3 / Google Cloud Storage
2. Modifier `app.js` pour télécharger la session au démarrage
3. Complexe et non fiable

#### Option C: WhatsApp Business API (RECOMMANDÉ)

**C'est la seule solution viable pour production.**

1. S'inscrire sur [Meta for Developers](https://developers.facebook.com)
2. Créer une application WhatsApp Business
3. Obtenir un numéro de téléphone dédié
4. Utiliser l'API officielle (pas de QR code nécessaire)
5. Remplacer `whatsapp-web.js` par le SDK officiel

**Avantages:**
- ✅ Pas de QR code
- ✅ Stable et supporté officiellement
- ✅ Conforme aux conditions d'utilisation
- ✅ Gratuit jusqu'à 1000 conversations/mois

## 📊 Étape 7: Monitoring

### Logs en Temps Réel

Dans Koyeb:
1. Aller dans votre service
2. Cliquer sur "Logs"
3. Voir les logs en temps réel

### Endpoints de Monitoring

```bash
# Status basique
curl https://votre-app.koyeb.app/

# Health check détaillé
curl https://votre-app.koyeb.app/health

# Métriques
curl https://votre-app.koyeb.app/metrics
```

### Alertes

Configurer des alertes dans Koyeb:
1. Settings > Notifications
2. Ajouter webhook Discord/Slack
3. Recevoir des alertes en cas de crash

## 🔄 Étape 8: Mises à Jour

### Déploiement Automatique

Koyeb redéploie automatiquement à chaque push sur la branche configurée:

```bash
git add .
git commit -m "Mise à jour du bot"
git push origin main
```

### Déploiement Manuel

Dans Koyeb:
1. Aller dans le service
2. Cliquer sur "Redeploy"
3. Choisir "Latest commit"

## 🐛 Troubleshooting

### Le service ne démarre pas

**Vérifier les logs:**
```
Error: SPREADSHEET_ID manquant
```
→ Ajouter la variable d'environnement

```
Error: GOOGLE_SERVICE_ACCOUNT manquant
```
→ Vérifier que `GOOGLE_JSON_KEY` est bien configuré

### Le service crash après démarrage

**Vérifier:**
1. Format du `GOOGLE_JSON_KEY` (doit être sur une ligne)
2. Les `\n` dans la private_key doivent être `\\n`
3. Le Service Account a accès au Google Sheet

### Health check échoue

**Vérifier:**
1. Le port 8000 est bien exposé
2. Le path `/health` est correct
3. Augmenter le "Initial delay" à 90 secondes

### Mémoire insuffisante

**Solutions:**
1. Passer à l'instance "Small" (1 GB RAM)
2. Optimiser le code (réduire les campagnes simultanées)
3. Nettoyer les fichiers temporaires plus fréquemment

## 💰 Coûts Koyeb

### Plan Gratuit (Hobby)
- 1 service
- Instance Nano (512 MB RAM)
- Suffisant pour tester
- ⚠️ Pas de stockage persistant

### Plan Starter ($5.50/mois)
- Instances Small (1 GB RAM)
- Meilleure performance
- ⚠️ Toujours pas de stockage persistant

### Recommandation

Pour un bot WhatsApp en production:
1. Utiliser WhatsApp Business API (pas whatsapp-web.js)
2. Déployer sur une plateforme avec stockage persistant (Render, Railway, DigitalOcean)
3. Ou utiliser un VPS dédié

## 📞 Support

En cas de problème:

1. **Vérifier les logs Koyeb**
2. **Tester en local** pour isoler le problème
3. **Vérifier les variables d'environnement**
4. **Consulter la documentation:**
   - [Koyeb Docs](https://www.koyeb.com/docs)
   - [WhatsApp Web.js](https://wwebjs.dev)

## ✅ Checklist Finale

Avant de déployer:

- [ ] Code pushé sur Git
- [ ] Dockerfile présent
- [ ] Variables d'environnement configurées dans Koyeb
- [ ] Google Sheet partagé avec le Service Account
- [ ] Health check configuré
- [ ] Comprendre la limitation du QR code
- [ ] Plan de migration vers WhatsApp Business API

---

**🎉 Félicitations!** Votre bot est déployé sur Koyeb. 

**⚠️ Rappel:** Pour une utilisation en production, migrez vers WhatsApp Business API pour éviter les problèmes d'authentification.
