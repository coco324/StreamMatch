import express from 'express';
import axios from 'axios';
import { io } from "socket.io-client";
import cors from 'cors';
import * as cheerio from 'cheerio';

const app = express();
const PORT = process.env.PORT || 8302;
const HOST = process.env.PORT ? '185.31.41.79' : 'localhost';

app.use(cors());

const backendRouter = express.Router();

const BASE_URL = "https://empire-sport.art";
const WS_URL = "wss://ws-sport.empire-socket-streaming.online:3056/_empSpo";


async function getEmpireToken(targetUrl, channelSearchName = null) {
    return new Promise(async (resolve, reject) => {
        try {
            console.log(`📡 Démarrage bypass pour : ${targetUrl}`);
            const response = await axios.get(targetUrl, {
                headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
            });
            
            const html = response.data;
            const dataRegex = /events:\s*(\[[\s\S]*?\]),\s*banners:/;
            const matchData = html.match(dataRegex);
            if (!matchData) return reject("Impossible d'extraire les datas du HTML");

            const events = JSON.parse(matchData[1]);
            const event = events[0]; 
            
            const socket = io(WS_URL, {
                transports: ["websocket"],
                query: { page: "player", token: "null" },
                extraHeaders: {
                    "Origin": BASE_URL,
                    "Referer": BASE_URL + "/",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                }
            });

            let technicalFolder = null;

            socket.on("sport_info", (data) => {
                if (data && data.tcds) {
                    // RECHERCHE ULTRA-SOUPLE : On nettoie le nom (pas d'accents, pas d'espaces)
                    const cleanName = (str) => str.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, "");
                    const target = cleanName(channelSearchName || event.chaine.name);
                    
                    const found = Object.values(data.tcds).find(item => {
                        const current = cleanName(item.name);
                        return current.includes(target) || target.includes(current);
                    });

                    if (found) {
                        technicalFolder = found.folder;
                        console.log(`✅ Dossier trouvé : ${technicalFolder}`);
                    }
                }
            });

            socket.on("connect", () => {
                console.log("🔗 Socket connecté...");
                socket.emit("watching_sport", {
                    payloadUrl: targetUrl,
                    payloadChaine: event.chaine.name,
                    payloadMatch: event.title,
                    streamId: event.chaine.tcps[0]
                });

                // On attend 3 secondes pour être sûr de recevoir sport_info
                setTimeout(() => {
                    socket.emit("userClickOpenEmpireSport", null, (resOpen) => {
                        if (!resOpen?.success) {
                            socket.disconnect();
                            return reject("Le serveur a refusé l'ouverture du player");
                        }

                        let clickCount = 0;
                        const clickInterval = setInterval(() => {
                            clickCount++;
                            console.log(`👆 Simulation clic ${clickCount}/15...`);
                            
                            socket.emit("userClickEmpireSport", null, (res) => {
                                if (res?.token) {
                                    clearInterval(clickInterval);
                                    if (!technicalFolder) {
                                        socket.disconnect();
                                        return reject("Token reçu mais dossier technique introuvable");
                                    }

                                    socket.emit("lb_server_sport", { key: technicalFolder }, (lbRes) => {
                                        if (!lbRes || !lbRes.url) {
                                            socket.disconnect();
                                            return reject("Échec du Load Balancer");
                                        }
                                        const finalUrl = `${lbRes.url}/playlist/${technicalFolder}?token=${res.token}&id=${lbRes.id}`;
                                        console.log("🎯 URL Générée avec succès !");
                                        socket.disconnect();
                                        resolve(finalUrl);
                                    });
                                }
                            });

                            if (clickCount >= 15) {
                                clearInterval(clickInterval);
                                socket.disconnect();
                                reject("Le serveur n'a jamais validé les clics (Timeout)");
                            }
                        }, 2000); // 2 secondes entre les clics pour plus de sécurité
                    });
                }, 3000);
            });

            socket.on("connect_error", (err) => reject("Erreur connexion Socket: " + err.message));

        } catch (e) {
            reject("Erreur globale : " + e.message);
        }
    });
}

// --- ROUTES API ---

app.get('/api/matches', async (req, res) => {
    try {
        console.log("🔍 Scraping de l'accueil...");
        const { data } = await axios.get(BASE_URL, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
            }
        });

        // --- LA MAGIE : On extrait le JSON caché dans le script window.empiresport ---
        const regex = /events:\s*(\[[\s\S]*?\]),\s*banners:/;
        const match = data.match(regex);

        if (match && match[1]) {
            const rawEvents = JSON.parse(match[1]);
            
            // On transforme les données pour ton frontend Vue.js
            const formattedMatches = rawEvents.map(event => ({
                id: event.slug,
                titre: event.title,
                // On reconstruit l'URL selon le type d'event
                url: `${BASE_URL}/event/${event.slug}`, 
                info: event.chaine ? event.chaine.name : "Sport"
            }));

            console.log(`✅ ${formattedMatches.length} matchs trouvés !`);
            res.json(formattedMatches);
        } else {
            console.log("⚠️ Aucun JSON trouvé dans le HTML. Tentative via sélecteurs classiques...");
            
            // Secours : Si le JSON n'est pas là, on tente le HTML (Cheerio)
            const $ = cheerio.load(data);
            const matches = [];
            $("a.card-line").each((i, el) => {
                const url = $(el).attr("href");
                matches.push({
                    id: url.split("/").pop(),
                    titre: $(el).find(".info-teams").text().trim().replace(/\n/g, " vs "),
                    url: url.startsWith('http') ? url : BASE_URL + url,
                    info: $(el).find(".info-txt-event").text().trim()
                });
            });
            res.json(matches);
        }
    } catch (e) {
        console.error("❌ Erreur scraping accueil :", e.message);
        res.status(500).json({ error: "Impossible de récupérer les matchs" });
    }
});

app.get('/api/get-stream-url', async (req, res) => {
    const { url, channel_name } = req.query;
    console.log(`📥 Requête reçue pour : ${url}`);

    try {
        const m3u8 = await getEmpireToken(url, channel_name);
        res.json({ m3u8 });
    } catch (error) {
        console.error("❌ Erreur Route :", error);
        res.status(500).json({ 
            success: false, 
            message: typeof error === 'string' ? error : "Erreur interne du serveur" 
        });
    }
});

// Route de maintien de session (Keep-Alive)
app.get('/api/keep-alive', (req, res) => {
  const streamUrl = req.query.url;
  console.log(`📡 Session maintenue pour : ${streamUrl}`);
  
  // Ici, on renvoie juste un OK pour dire au serveur de ne pas fermer
  res.status(200).json({ status: "alive" });
});

app.get('/api/test', (req, res) => {
    res.json({ message: "API fonctionne parfaitement !" });
});

app.use('/backend', backendRouter);

app.listen(PORT, HOST, () => {
    console.log(`🚀 Serveur démarré !`);
    console.log(`🌍 Adresse : http://${HOST}:${PORT}`);
});