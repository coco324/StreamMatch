import express from 'express';
import axios from 'axios';
import { io } from "socket.io-client";
import cors from 'cors';
import * as cheerio from 'cheerio';

const app = express();
const PORT = process.env.PORT || 8302;
const HOST = process.env.PORT ? '185.31.41.79' : 'localhost';

// Needed behind reverse proxies (Alwaysdata) to infer external protocol/host.
app.set('trust proxy', true);

app.use(cors());

const backendRouter = express.Router();

const BASE_URL = "https://empire-sport.sbs";
const WS_URL = "wss://ws-sport.empire-socket-streaming.online:3056/_empSpo";

function logTest(step, details = {}) {
    const timestamp = new Date().toISOString();
    console.log(`[TEST][${timestamp}][${step}]`, details);
}

function extractM3u8FromHtml(html) {
    if (!html || typeof html !== 'string') return null;

    const normalized = html
        .replace(/\\u0026/g, '&')
        .replace(/\\\//g, '/')
        .replace(/&amp;/g, '&');

    const m3u8Regex = /https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/gi;
    const matches = normalized.match(m3u8Regex);

    if (!matches || matches.length === 0) return null;
    return matches[0];
}

function buildProxyUrl(req, targetUrl, referer, origin) {
    const params = new URLSearchParams({ url: targetUrl });
    if (referer) params.append('referer', referer);
    if (origin) params.append('origin', origin);
    // Keep URLs relative to current /api endpoint to avoid host/path mismatch in shared hosting.
    return `proxy-hls?${params.toString()}`;
}

function toAbsoluteUrl(candidate, sourceUrl) {
    try {
        return new URL(candidate, sourceUrl).href;
    } catch {
        return null;
    }
}

async function fetchWithPlayerHeaders(targetUrl, referer, origin, responseType = 'text') {
    const headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "*/*"
    };

    if (referer) headers["Referer"] = referer;
    if (origin) headers["Origin"] = origin;

    return axios.get(targetUrl, {
        headers,
        responseType,
        timeout: 15000
    });
}

function rewriteM3u8Content(content, sourceUrl, req, referer, origin) {
    const lines = content.split(/\r?\n/);
    let rewrittenCount = 0;

    const rewriteUriAttributes = (line) => {
        if (!line.includes('URI="')) return line;

        return line.replace(/URI="([^"]+)"/g, (_, rawUri) => {
            const absolute = toAbsoluteUrl(rawUri, sourceUrl);
            if (!absolute) return `URI="${rawUri}"`;
            rewrittenCount += 1;
            return `URI="${buildProxyUrl(req, absolute, referer, origin)}"`;
        });
    };

    const rewritten = lines.map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return line;

        // Rewrite URI attributes used by keys/maps/media declarations.
        if (trimmed.startsWith('#')) {
            return rewriteUriAttributes(line);
        }

        const absoluteUrl = toAbsoluteUrl(trimmed, sourceUrl);
        if (!absoluteUrl) {
            return line;
        }

        rewrittenCount += 1;
        return buildProxyUrl(req, absoluteUrl, referer, origin);
    });

    return {
        content: rewritten.join('\n'),
        rewrittenCount,
        totalLines: lines.length
    };
}


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

app.get('/api/extract-m3u8', async (req, res) => {
    const { url } = req.query;
    logTest('extract-request', { url });

    if (!url || typeof url !== 'string') {
        logTest('extract-invalid-url', { urlType: typeof url });
        return res.status(400).json({
            success: false,
            message: "Paramètre 'url' manquant ou invalide"
        });
    }

    try {
        console.log(`📥 Extraction M3U8 depuis : ${url}`);
        const response = await axios.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
        });

        logTest('extract-upstream-response', {
            status: response.status,
            contentType: response.headers?.['content-type'] || 'unknown',
            htmlLength: typeof response.data === 'string' ? response.data.length : -1
        });

        const m3u8 = extractM3u8FromHtml(response.data);
        if (!m3u8) {
            logTest('extract-not-found', { url });
            return res.status(404).json({
                success: false,
                message: "Aucun lien M3U8 trouvé sur la page cible"
            });
        }

        logTest('extract-success', { m3u8 });
        res.json({ m3u8 });
    } catch (error) {
        console.error("❌ Erreur extraction M3U8 :", error.message);
        logTest('extract-error', { message: error.message });
        res.status(500).json({
            success: false,
            message: "Impossible d'extraire le lien M3U8"
        });
    }
});

app.get('/api/proxy-hls', async (req, res) => {
    const { url, referer, origin } = req.query;
    logTest('proxy-request', {
        url,
        referer,
        origin,
        ip: req.ip,
        userAgent: req.get('user-agent') || 'unknown'
    });

    if (!url || typeof url !== 'string') {
        logTest('proxy-invalid-url', { urlType: typeof url });
        return res.status(400).json({
            success: false,
            message: "Paramètre 'url' manquant ou invalide"
        });
    }

    try {
        const targetUrl = url;
        const safeReferer = typeof referer === 'string' ? referer : undefined;
        const safeOrigin = typeof origin === 'string' ? origin : undefined;

        const isM3u8 = targetUrl.toLowerCase().includes('.m3u8');
        logTest('proxy-upstream-start', { targetUrl, isM3u8, safeReferer, safeOrigin });
        const upstream = await fetchWithPlayerHeaders(
            targetUrl,
            safeReferer,
            safeOrigin,
            isM3u8 ? 'text' : 'arraybuffer'
        );

        const contentType = upstream.headers['content-type'] || '';
        const looksLikePlaylist = isM3u8 || contentType.includes('mpegurl');
        const payloadSize = typeof upstream.data === 'string'
            ? upstream.data.length
            : (upstream.data?.byteLength || 0);

        logTest('proxy-upstream-response', {
            status: upstream.status,
            contentType,
            looksLikePlaylist,
            payloadSize
        });

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'no-store');

        if (looksLikePlaylist) {
            const playlistText = typeof upstream.data === 'string'
                ? upstream.data
                : Buffer.from(upstream.data).toString('utf-8');

            const rewriteResult = rewriteM3u8Content(playlistText, targetUrl, req, safeReferer, safeOrigin);
            logTest('proxy-playlist-rewritten', {
                targetUrl,
                rewrittenCount: rewriteResult.rewrittenCount,
                totalLines: rewriteResult.totalLines
            });
            logTest('proxy-playlist-sample', {
                lines: rewriteResult.content.split('\n').slice(0, 6)
            });

            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            return res.status(200).send(rewriteResult.content);
        }

        logTest('proxy-binary-forward', { targetUrl, contentType, payloadSize });
        res.setHeader('Content-Type', contentType || 'application/octet-stream');
        return res.status(200).send(Buffer.from(upstream.data));
    } catch (error) {
        const status = error?.response?.status;
        const statusText = error?.response?.statusText;
        const upstreamContentType = error?.response?.headers?.['content-type'];
        console.error('❌ Erreur proxy HLS :', error.message);
        logTest('proxy-error', { message: error.message, status, statusText, upstreamContentType });
        return res.status(500).json({
            success: false,
            message: "Impossible de charger le flux via proxy"
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