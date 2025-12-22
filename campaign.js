const fs = require('fs');
const path = require('path');
const { MessageMedia } = require('whatsapp-web.js');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Trouver le fichier image (jpg, png, jpeg, etc)
// Trouver jusqu'à deux fichiers image : 'image' et 'image2' (ou 'image 2')
function findImageFiles() {
    const exts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    const names = ['image', 'image2', 'image 2'];
    const found = [];
    for (const name of names) {
        for (const ext of exts) {
            const candidate = path.join(__dirname, 'medias', `${name}.${ext}`);
            if (fs.existsSync(candidate)) {
                found.push(candidate);
                break;
            }
        }
        if (found.length >= 2) break;
    }
    return found; // tableau de 0..2 chemins
}

// Trouver le fichier vidéo (mp4, mov, etc)
function findVideoFile() {
    const exts = ['mp4', 'mov', 'avi', 'mkv'];
    for (const ext of exts) {
        const p = path.join(__dirname, 'medias', `video.${ext}`);
        if (fs.existsSync(p)) {
            return p;
        }
    }
    return null;
}

module.exports = async function diffuserCampagne(client, options = {}) {
    try {
        const contacts = JSON.parse(fs.readFileSync('./contacts.json', 'utf8'));

        for (const contact of contacts) {
            const chatId = contact.numero.includes('@') ? contact.numero : `${contact.numero}@c.us`;
            console.log(`📦 Envoi en cours pour : ${contact.nom}`);

            try {
                // A. ENVOI DU TEXTE (message principal personnalisé)
                console.log(`   📝 Envoi du message principal...`);
                const recipientName = contact.nom && contact.nom.trim() ? contact.nom : 'Partenaire RACS';
                const fullMessage = `Cher(e) Partenaire ${recipientName} de RACS,

🔥 ALERTE OPPORTUNITE - Les Fêtes sont LÀ 🔥

Nous lançons la CAMPAGNE LA PLUS AGRESSIVE de notre histoire sur LiverProtect.

🎯 OBJECTIF : 15.000 boîtes en 2 mois Fêtes et CAN.
💰 PROMO MASSIVE : Pack 5 boîtes à 19.000F (au lieu de 40.000F)
🎁 PROMO PARTENAIRE : Pack 5 boîtes à 14.000F (au lieu de 20.000F)

🚀 CE QUE NOUS AVONS PRÉPARÉ POUR VOUS :

✅ Scripts WhatsApp prêts à envoyer (copier-coller)
✅ Visuels professionnels pour vos réseaux sociaux
✅ Vidéos avec "Franco Le Mignon"
✅ Arguments de vente TUEURS
✅ Témoignages clients percutants

📱 VOTRE MISSION (si vous l'acceptez) :

1. PARTAGER les contenus qu'on vous envoie
2. RELAYER dans vos groupes WhatsApp/Facebook
3. ACTIVER votre réseau (amis, famille, patients, clients)
4. COMMANDER pour vous d'abord (montrez l'exemple!)

💎 POURQUOI C'EST LE MOMENT PARFAIT :

• Timing : Fêtes = alcool + repas lourds = BESOIN MASSIF
• Promo : 50% de réduction = argument imparable
• Urgence : "Jusqu'au 24 Déc" = pression d'achat
• Preuve sociale : Des années de témoignages

💰 VOS AVANTAGES :

• Commissions directes : 5000 minimum par Pack.
• Bonus spécial si vous dépassez 50 Packs en Décembre
• Visibilité sur nos pages (meilleurs vendeurs mis en avant)
• Stock prioritaire garanti

⏰ C'EST MAINTENANT OU JAMAIS

Les fêtes ne reviendront pas avant 1 an.
Cette promo ne durera que 14 jours.

🔥 DANS 2H, vous recevrez le PACK COMPLET :
• Tous les visuels
• Tous les scripts
• Tous les arguments

PRÉPAREZ-VOUS À VENDRE COMME JAMAIS.

Ensemble, on va EXPLOSER ces objectifs.

Comptez sur nous. On compte sur vous.

Let's GO ! 💪🏾💚

Direction RACS Corporation`;

                await client.sendMessage(chatId, fullMessage);
                await sleep(800);

                // B. ENVOI DES IMAGES : recherche jusqu'à deux fichiers dans ./medias
                const imagePaths = findImageFiles();
                if (imagePaths.length === 0) {
                    console.log(`   ⚠️  Pas d'image trouvée dans ./medias/`);
                } else {
                    // première image - légende principale
                    const image1Path = imagePaths[0];
                    console.log(`   🖼️  Envoi de l'image (${path.basename(image1Path)})...`);
                    const image1 = MessageMedia.fromFilePath(image1Path);
                    const imageCaption = `🚨 ALERTE FIN D'ANNÉE 🚨

⚠️ Les fêtes ne tuent pas…
❌ C’est ce qu’on mange et boit pendant les fêtes qui tue silencieusement.

Foie – Reins – Cœur

Cette année, j’ai choisi de me protéger : LiverProtect

PS : LiverProtect est une Boisson alimentaire certifiée "Qualité Satisfaisante" par le Centre Pasteur Cameroun.`;
                    await client.sendMessage(chatId, image1, { caption: imageCaption });
                    await sleep(1200);

                    // seconde image (si présente)
                    if (imagePaths[1]) {
                        const image2Path = imagePaths[1];
                        console.log(`   🖼️  Envoi de la deuxième image (${path.basename(image2Path)})...`);
                        const image2 = MessageMedia.fromFilePath(image2Path);
                        const image2Caption = `📢 ILS L'ONT TESTÉ, ÉCOUTEZ-LES :

💬 Dr. Sarah M. : "Mes patients me demandent mon secret pour tenir les gardes de fêtes. Je leur dis LiverProtect."

💬 Jean-Paul T. : "J'ai bu comme jamais au mariage de mon frère. Lendemain ? ZÉRO gueule de bois. Ma femme n'y croyait pas 😅"

💬 Maman Grâce : "Avec toute la famille à la maison, je cuisine lourd. LiverProtect me permet de goûter à tout sans ballonnements!"

💬 Patrick O. : "Je l'ai glissé dans mon whisky. Le goût est devenu INCROYABLE et le lendemain j'étais au top 💪🏽"

✨ DES CENTAINES de témoignages comme ça depuis 2021.

🎁 PACK FÊTES SAMARITAIN
19.000F les 5 boîtes (au lieu de 40.000F)

🎯 Plus que 5 JOURS pour commander avant Noël
📞 Répondez maintenant - Livraison rapide.

Ne passez pas à côté.
Vos fêtes méritent mieux.

LIVERPROTECT - Fêtez sans regrets 💚`;
                        await client.sendMessage(chatId, image2, { caption: image2Caption });
                        await sleep(800);

              
                    }
                }



                // C. ENVOI DE LA VIDÉO (cherche mp4, mov, avi, mkv)
                const videoPath = findVideoFile();
                if (videoPath) {
                    console.log(`   🎬 Envoi de la vidéo (${path.basename(videoPath)})...`);
                    const video = MessageMedia.fromFilePath(videoPath);
                    await client.sendMessage(chatId, video);
                    await sleep(1500);
                } else {
                    console.log(`   ⚠️  Pas de vidéo trouvée dans ./medias/`);
                }
            } catch (errContact) {
                console.error(`❌ Erreur lors de l'envoi pour ${contact.nom}:`, errContact);
            }

            // D. INTERVALLE VARIABLE (Physique du flux : entre 45 et 90 secondes)
            const randomWait = Math.floor(Math.random() * (90000 - 45000 + 1)) + 45000;
            console.log(`⏳ Attente de ${randomWait / 1000}s avant le prochain contact...`);
            await sleep(randomWait);
        }
        console.log('✅ Campagne LiverProtect terminée !');
    } catch (err) {
        console.error('❌ Erreur dans diffuserCampagne:', err);
    }
};
