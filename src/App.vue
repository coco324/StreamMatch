<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import VideoPage from './views/VideoPage.vue';

// --- INTERFACES ---
interface Match {
  id: string;
  titre: string;
  url: string;
  info: string;
}

// --- CONFIGURATION ---
const backendUrl = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:8302'; // URL du backend Node.js

// URLs des pages "Répertoires" d'Empire
const EQUIPE_PAGE_URL = "https://empire-sport.art/chaine/l-equipe-en-streaming"; 
const BEIN_PAGE_URL = "https://empire-sport.art/chaine/bein-sports-en-streaming"; 
const LIGUE1_PAGE_URL = "https://empire-sport.art/chaine/ligue1-en-streaming";

// --- ÉTATS (STATES) ---
const matches = ref<Match[]>([]);
const isLoading = ref(false);
const searchQuery = ref("");
const statusMsg = ref("");

// Visibilité des catégories
const isEquipeOpen = ref(false);
const isBeinOpen = ref(false);
const isLigue1Open = ref(false);
const isEventsVisible = ref(false);

// État du lecteur vidéo
const isStreaming = ref(false);
const selectedMatch = ref<Match | null>(null);
const currentStreamUrl = ref("");

// --- DONNÉES STATIQUES (CHAÎNES TV) ---
const equipeChannels = ref<Match[]>([
  { id: 'ch-lequipe-21', titre: "L'Équipe 21", url: EQUIPE_PAGE_URL, info: "Répertoire L'Équipe" },
  { id: 'ch-live-foot-1', titre: "L'Équipe Live Foot 1", url: EQUIPE_PAGE_URL, info: "Répertoire L'Équipe" },
  { id: 'ch-live-foot-2', titre: "L'Équipe Live Foot 2", url: EQUIPE_PAGE_URL, info: "Répertoire L'Équipe" }
]);

const beinChannels = ref<Match[]>([
  { id: 'ch-bein-1', titre: "Bein Sports 1", url: BEIN_PAGE_URL, info: "Répertoire beIN" },
  { id: 'ch-bein-2', titre: "Bein Sports 2", url: BEIN_PAGE_URL, info: "Répertoire beIN" },
  { id: 'ch-bein-3', titre: "Bein Sports 3", url: BEIN_PAGE_URL, info: "Répertoire beIN" }
]);

const ligue1Channels = ref<Match[]>([
  { id: 'ch-l1-1', titre: "Ligue 1+", url: LIGUE1_PAGE_URL, info: "Répertoire Ligue 1+" },
  { id: 'ch-l1-2', titre: "Ligue 1+ 2", url: LIGUE1_PAGE_URL, info: "Répertoire Ligue 1+" },
  { id: 'ch-l1-3', titre: "Ligue 1+ 3", url: LIGUE1_PAGE_URL, info: "Répertoire Ligue 1+" }
]);

// --- LOGIQUE API ---

// Charger les matchs en direct depuis le scraper Node.js
const loadMatches = async () => {
  isLoading.value = true;
  statusMsg.value = "";
  try {
    const res = await fetch(`${backendUrl}/api/matches`);
    if (!res.ok) throw new Error();
    matches.value = await res.json();
  } catch (e) {
    statusMsg.value = "🔌 Erreur : Le serveur Node.js est hors ligne.";
  } finally {
    isLoading.value = false;
  }
};

const toggleEvents = async () => {
  isEventsVisible.value = !isEventsVisible.value;
  if (isEventsVisible.value && matches.value.length === 0) {
    await loadMatches();
  }
};

// Lancer le flux (Appel au bypass WebSocket du backend)
const startStreaming = async (match: Match) => {
  if (!match.url) {
    statusMsg.value = `📺 Flux non disponible pour ${match.titre}.`;
    return;
  }

  statusMsg.value = `⏳ Bypass des protections en cours pour ${match.titre}...`;
  
  try {
    const isTvChannel = match.info.includes("Répertoire");
    
    // Construction de la requête pour Node.js
    const params = new URLSearchParams({ url: match.url });
    if (isTvChannel) {
        params.append('channel_name', match.titre);
    }

    const res = await fetch(`${backendUrl}/api/get-stream-url?${params.toString()}`);
    const data = await res.json();

    if (data.m3u8) {
      selectedMatch.value = match;
      currentStreamUrl.value = data.m3u8;
      isStreaming.value = true;
      statusMsg.value = "";
    } else {
      statusMsg.value = `❌ Impossible de générer le flux pour ${match.titre}.`;
    }
  } catch (e) {
    statusMsg.value = "❌ Erreur de communication avec le backend.";
  }
};

// --- FILTRAGE ---
const normalizedQuery = computed(() => searchQuery.value.toLowerCase());
const filterFn = (m: Match) => m.titre.toLowerCase().includes(normalizedQuery.value);

const filteredEquipe = computed(() => equipeChannels.value.filter(filterFn));
const filteredBein = computed(() => beinChannels.value.filter(filterFn));
const filteredLigue1 = computed(() => ligue1Channels.value.filter(filterFn));
const filteredMatches = computed(() => matches.value.filter(filterFn));

</script>

<template>
  <div class="min-h-screen bg-slate-950 text-slate-100 selection:bg-orange-500/30">
    
    <VideoPage 
      v-if="isStreaming && selectedMatch" 
      :matchTitle="selectedMatch.titre" 
      :streamUrl="currentStreamUrl"
      @close="isStreaming = false" 
    />

    <div v-else class="p-4 md:p-10 max-w-7xl mx-auto">
      
      <header class="flex flex-col lg:flex-row justify-between items-center gap-8 mb-16">
        <div class="flex items-center gap-5">
          <div class="p-4 bg-orange-600 rounded-2xl shadow-[0_0_30px_rgba(234,88,12,0.3)] transform -rotate-3">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h1 class="text-4xl font-black tracking-tighter uppercase italic leading-none">
              Stream <span class="text-orange-500 underline decoration-orange-500/30 underline-offset-8">Match</span>
            </h1>
          </div>
        </div>

        <div class="flex items-center gap-4 w-full lg:w-auto">
          <div class="relative grow lg:w-96">
            <span class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">🔎</span>
            <input 
              v-model="searchQuery"
              type="text" 
              placeholder="Chercher une équipe ou une chaîne..." 
              class="w-full bg-slate-900/50 border border-slate-800 py-4 pl-12 pr-4 rounded-2xl focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none transition-all placeholder:text-slate-700 font-medium"
            />
          </div>
          <button
            @click="loadMatches"
            class="p-4 bg-slate-900 border border-slate-800 rounded-2xl transition-all duration-300 active:scale-90 hover:bg-orange-600"
          >
            <div :class="{'animate-spin': isLoading}">🔄</div>
          </button>
        </div>
      </header>

      <div v-if="statusMsg" class="mb-10 p-5 bg-orange-600/10 border border-orange-500/20 text-orange-500 text-center rounded-2xl font-bold text-sm tracking-wide animate-pulse">
        {{ statusMsg }}
      </div>

      <main>
        <div class="mb-10 grid grid-cols-1 items-start gap-6 lg:grid-cols-2 xl:grid-cols-3">
          
          <section class="self-start rounded-3xl border border-white/10 bg-slate-900/70 p-4 shadow-2xl">
            <button @click="isEquipeOpen = !isEquipeOpen" class="w-full text-left group">
              <div class="flex items-center justify-between bg-slate-800 p-4 rounded-2xl border border-slate-700 group-hover:border-red-500 transition-colors">
                <span class="font-black uppercase tracking-widest text-red-500">L'Équipe TV</span>
                <span class="text-xs font-bold text-slate-400">{{ isEquipeOpen ? 'FERMER' : 'OUVRIR' }}</span>
              </div>
            </button>
            <div v-if="isEquipeOpen" class="mt-4 grid grid-cols-1 gap-2">
              <button v-for="ch in filteredEquipe" :key="ch.id" @click="startStreaming(ch)" class="p-3 bg-slate-950 border border-slate-800 rounded-xl text-left hover:bg-slate-800 transition-colors font-bold text-sm">
                {{ ch.titre }}
              </button>
            </div>
          </section>

          <section class="self-start rounded-3xl border border-white/10 bg-slate-900/70 p-4 shadow-2xl">
            <button @click="isBeinOpen = !isBeinOpen" class="w-full text-left group">
              <div class="flex items-center justify-between bg-slate-800 p-4 rounded-2xl border border-slate-700 group-hover:border-purple-500 transition-colors">
                <span class="font-black uppercase tracking-widest text-purple-400">beIN Sports</span>
                <span class="text-xs font-bold text-slate-400">{{ isBeinOpen ? 'FERMER' : 'OUVRIR' }}</span>
              </div>
            </button>
            <div v-if="isBeinOpen" class="mt-4 grid grid-cols-1 gap-2">
              <button v-for="ch in filteredBein" :key="ch.id" @click="startStreaming(ch)" class="p-3 bg-slate-950 border border-slate-800 rounded-xl text-left hover:bg-slate-800 transition-colors font-bold text-sm">
                {{ ch.titre }}
              </button>
            </div>
          </section>

          <section class="self-start rounded-3xl border border-white/10 bg-slate-900/70 p-4 shadow-2xl">
            <button @click="isLigue1Open = !isLigue1Open" class="w-full text-left group">
              <div class="flex items-center justify-between bg-slate-800 p-4 rounded-2xl border border-slate-700 group-hover:border-green-500 transition-colors">
                <span class="font-black uppercase tracking-widest text-green-400">Ligue 1+</span>
                <span class="text-xs font-bold text-slate-400">{{ isLigue1Open ? 'FERMER' : 'OUVRIR' }}</span>
              </div>
            </button>
            <div v-if="isLigue1Open" class="mt-4 grid grid-cols-1 gap-2">
              <button v-for="ch in filteredLigue1" :key="ch.id" @click="startStreaming(ch)" class="p-3 bg-slate-950 border border-slate-800 rounded-xl text-left hover:bg-slate-800 transition-colors font-bold text-sm">
                {{ ch.titre }}
              </button>
            </div>
          </section>
        </div>

        <div class="mb-10 flex justify-center">
          <button
            @click="toggleEvents"
            class="rounded-2xl border border-orange-500/40 bg-orange-500/10 px-8 py-4 text-sm font-black uppercase tracking-widest text-orange-400 transition-all hover:bg-orange-500 hover:text-white"
          >
            {{ isEventsVisible ? 'Masquer les Directs' : 'Charger les Directs' }}
          </button>
        </div>

        <div v-if="isEventsVisible">
            <div v-if="isLoading" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                <div v-for="i in 8" :key="i" class="h-64 bg-slate-900/50 rounded-[2.5rem] animate-pulse border border-slate-800"></div>
            </div>

            <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                <div v-for="match in filteredMatches" :key="match.id" 
                    class="group relative bg-slate-900/40 border border-slate-800 rounded-[2.5rem] p-8 hover:bg-slate-900 hover:border-orange-500/40 transition-all duration-500 flex flex-col justify-between overflow-hidden shadow-2xl">
                    
                    <div class="relative z-10">
                        <div class="flex justify-between items-center mb-6">
                            <span class="flex items-center gap-2">
                                <span class="w-2 h-2 bg-red-600 rounded-full animate-ping"></span>
                                <span class="text-[10px] font-black uppercase text-red-500">Live</span>
                            </span>
                            <span class="text-[10px] text-slate-500 font-bold uppercase tracking-widest bg-slate-800 px-3 py-1 rounded-full">{{ match.info }}</span>
                        </div>
                        <h3 class="text-xl font-black leading-tight mb-8 group-hover:text-orange-500 transition-colors">
                            {{ match.titre }}
                        </h3>
                    </div>

                    <button @click="startStreaming(match)" 
                            class="relative z-10 w-full py-4 bg-slate-100 text-slate-950 font-black rounded-2xl hover:bg-orange-500 hover:text-white transition-all transform active:scale-95 shadow-xl">
                        VOIR LE MATCH
                    </button>
                </div>
            </div>

            <div v-if="!isLoading && filteredMatches.length === 0" class="text-center py-20 border-2 border-dashed border-slate-900 rounded-[3rem]">
                <p class="text-slate-700 text-xl font-black uppercase opacity-50">Aucun événement en direct trouvé</p>
            </div>
        </div>
      </main>

    </div>
  </div>
</template>

