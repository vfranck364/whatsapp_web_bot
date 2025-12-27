# Utiliser une image légère avec Node et Chrome déjà installés
FROM ghcr.io/puppeteer/puppeteer:latest

# Passer en utilisateur root pour installer d'éventuels packages supplémentaires
USER root
RUN apt-get update && apt-get install -y ffmpeg --no-install-recommends && rm -rf /var/lib/apt/lists/*

# Créer le répertoire de l'application
WORKDIR /usr/src/app

# Copier les fichiers de dépendances
COPY --chown=pptruser:pptruser package*.json ./

# Installer les dépendances (Puppeteer ne téléchargera pas Chrome car il est déjà présent)
RUN npm install --production

# Copier le reste du code avec les bons droits
COPY --chown=pptruser:pptruser . .

# Définir les variables pour Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable \
    NODE_ENV=production

# Exposer le port pour le health check
EXPOSE 8000

# Lancer avec l'utilisateur sécurisé de l'image
USER pptruser

CMD ["node", "app.js"]
