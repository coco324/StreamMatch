<script setup lang="ts">
import { ref, computed } from 'vue';
import VideoPage from './views/VideoPage.vue';

// --- INTERFACES ---
interface Match {
  id: string;
  titre: string;
  url: string;
  info: string;
}

// --- STATES ---
const matches = ref<Match[]>([]);
const isLoading = ref(false);
const searchQuery = ref("");
const statusMsg = ref("");
const isEquipeOpen = ref(false);
const isBeinOpen = ref(false);
const isLigue1Open = ref(false);
const isEventsVisible = ref(false);

// Répertoire prioritaire des chaînes
const equipeChannels = ref<Match[]>([
  {
    id: 'chaine-lequipe-21',
    titre: "L'Équipe 21",
    url: '',
    info: "Répertoire L'Équipe"
  },
  {
    id: 'chaine-live-foot-1',
    titre: "L'Équipe Live Foot 1",
    url: '',
    info: "Répertoire L'Équipe"
  },
  {
    id: 'chaine-live-foot-2',
    titre: "L'Équipe Live Foot 2",
    url: '',
    info: "Répertoire L'Équipe"
  }
]);

const beinChannels = ref<Match[]>([
  {
    id: 'chaine-bein-sport-1',
    titre: "Bein Sports 1",
    url: '',
    info: "Répertoire beIN"
  },
  {
    id: 'chaine-bein-sport-2',
    titre: "Bein Sports 2",
    url: '',
    info: "Répertoire beIN"
  },
  {
    id: 'chaine-bein-sport-3',
    titre: "Bein Sports 3",
    url: '',
    info: "Répertoire beIN"
  }
]);

const ligue1Channels = ref<Match[]>([
  {
    id: 'chaine-ligue1-plus-1',
    titre: "Ligue 1+",
    url: '',
    info: "Répertoire Ligue 1+"
  },
  {
    id: 'chaine-ligue1-plus-2',
    titre: "Ligue 1+ 2",
    url: '',
    info: "Répertoire Ligue 1+"
  },
  {
    id: 'chaine-ligue1-plus-3',
    titre: "Ligue 1+ 3",
    url: '',
    info: "Répertoire Ligue 1+"
  }
]);

// State pour le lecteur
const url = ref("http://localhost:8300");
const isStreaming = ref(false);
const selectedMatch = ref<Match | null>(null);
const currentStreamUrl = ref("");

// --- LOGIQUE API ---

const loadMatches = async () => {
  isLoading.value = true;
  statusMsg.value = "";
  try {
    const res = await fetch(`${url.value}/api/matches`);
    if (!res.ok) throw new Error();
    matches.value = await res.json();
  } catch (e) {
    statusMsg.value = "🔌 Erreur : Le serveur Python est hors ligne.";
  } finally {
    isLoading.value = false;
  }
};

const toggleEvents = async () => {
  if (isEventsVisible.value) {
    isEventsVisible.value = false;
    return;
  }

  isEventsVisible.value = true;
  if (matches.value.length === 0) {
    await loadMatches();
  }
};

const EQUIPE_PAGE_URL = "https://empire-sport.art/chaine/l-equipe-en-streaming"; 
const BEIN_PAGE_URL = "https://empire-sport.art/chaine/bein-sports-en-streaming"; 
const LIGUE1_PAGE_URL = "https://empire-sport.art/chaine/ligue1-en-streaming";

const startStreaming = async (match: Match) => {
  // 1. Déterminer s'il s'agit d'une chaîne TV ou d'un match direct
  const isTvChannel =
    match.info === "Répertoire L'Équipe" ||
    match.info === "Répertoire beIN" ||
    match.info === "Répertoire Ligue 1+";

  const url = isTvChannel
    ? match.info === "Répertoire L'Équipe"
      ? EQUIPE_PAGE_URL
      : match.info === "Répertoire beIN"
        ? BEIN_PAGE_URL
        : LIGUE1_PAGE_URL
    : match.url;
  
  // Si c'est un match normal et qu'il n'y a pas d'URL, on arrête
  if (!isTvChannel && !match.url) {
    statusMsg.value = `📺 ${match.titre} n'a pas encore de flux disponible.`;
    return;
  }

  statusMsg.value = `⏳ Préparation du flux pour ${match.titre}...`;
  
  try {
    let apiUrl = "";
    
    if (isTvChannel) {
      // Pour la TV, on passe l'URL de la page équipe + le NOM de la chaîne à chercher
      apiUrl = `${url}/api/get-tv-url?url=${encodeURIComponent(url)}&channel_name=${encodeURIComponent(match.titre)}`;
    } else {
      // Pour les matchs classiques
      apiUrl = `${url}/api/get-stream-url?url=${encodeURIComponent(match.url)}`;
    }

    const res = await fetch(apiUrl);
    const data = await res.json();

    if (data.m3u8) {
      selectedMatch.value = match;
      currentStreamUrl.value = data.m3u8;
      isStreaming.value = true;
      statusMsg.value = "";
    } else {
      statusMsg.value = `❌ Flux introuvable pour ${match.titre}.`;
    }
  } catch (e) {
    statusMsg.value = "❌ Erreur de connexion au serveur Python.";
  }
};

// --- FILTRAGE ---
const normalizedQuery = computed(() => searchQuery.value.toLowerCase());

const filteredEquipeChannels = computed(() => {
  return equipeChannels.value.filter(m => 
    m.titre.toLowerCase().includes(normalizedQuery.value)
  );
});

const filteredBeinChannels = computed(() => {
  return beinChannels.value.filter(m => 
    m.titre.toLowerCase().includes(normalizedQuery.value)
  );
});

const filteredLigue1Channels = computed(() => {
  return ligue1Channels.value.filter(m =>
    m.titre.toLowerCase().includes(normalizedQuery.value)
  );
});

const filteredMatches = computed(() => {
  return matches.value.filter(m => 
    m.titre.toLowerCase().includes(normalizedQuery.value)
  );
});

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
              placeholder="Chercher une équipe..." 
              class="w-full bg-slate-900/50 border border-slate-800 py-4 pl-12 pr-4 rounded-2xl focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none transition-all placeholder:text-slate-700 font-medium"
            />
          </div>
          <button
            @click="loadMatches"
            :disabled="!isEventsVisible"
            class="p-4 bg-slate-900 border border-slate-800 rounded-2xl transition-all duration-300 active:scale-90 group disabled:cursor-not-allowed disabled:opacity-40 hover:bg-orange-600 hover:border-orange-500"
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
        <section class="self-start rounded-3xl border border-white/10 bg-slate-900/70 p-3 sm:p-4 shadow-2xl">
          <button
            @click="isEquipeOpen = !isEquipeOpen"
            class="relative w-full overflow-hidden rounded-3xl border border-white/10 bg-linear-to-b from-slate-800 via-slate-900 to-black p-4 text-left sm:p-5"
          >
            <div class="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-black to-transparent"></div>

            <div class="relative z-10 flex min-h-40 flex-col justify-between">
              <div class="flex justify-center pt-1">
                <img
                  src="/lequipe-logo.svg"
                  alt="Logo L'Equipe"
                  class="h-14 w-auto rounded-sm border border-slate-300/20 bg-white px-4 py-1 shadow-[0_10px_26px_rgba(0,0,0,0.45)]"
                />
              </div>

              <div class="flex items-end gap-3 text-white">
                <div class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/30 bg-black/30">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M8 6.6a9 9 0 0 1 8 0M6 9.8a13 13 0 0 1 12 0M4 13a17 17 0 0 1 16 0M12 20h.01"/>
                  </svg>
                </div>
                <div>
                  <p class="text-xl font-black leading-none">L'Équipe</p>
                  <p class="text-base font-semibold leading-tight text-slate-200">{{ filteredEquipeChannels.length }} chaînes</p>
                </div>
                <div class="ml-auto text-sm font-bold text-slate-200">
                  {{ isEquipeOpen ? 'Masquer' : 'Ouvrir' }}
                </div>
              </div>
            </div>
          </button>

          <div v-if="isEquipeOpen" class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              v-for="channel in filteredEquipeChannels"
              :key="channel.id"
              @click="startStreaming(channel)"
              class="rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-left text-sm font-bold text-slate-100 transition-colors hover:border-red-400/70 hover:bg-slate-900"
            >
              {{ channel.titre }}
            </button>
          </div>
        </section>


        <section class="self-start rounded-3xl border border-white/10 bg-slate-900/70 p-3 sm:p-4 shadow-2xl">
          <button
            @click="isBeinOpen = !isBeinOpen"
            class="relative w-full overflow-hidden rounded-3xl border border-white/10 bg-linear-to-b from-slate-800 via-slate-900 to-black p-4 text-left sm:p-5"
          >
            <div class="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-black to-transparent"></div>

            <div class="relative z-10 flex min-h-40 flex-col justify-between">
              <div class="flex justify-center pt-1">
                <div
                  class="flex h-14 w-44 items-center justify-center rounded-sm border border-slate-300/20 bg-white px-4 py-1 text-center font-black text-[#2E1A66] shadow-[0_10px_26px_rgba(0,0,0,0.45)]"
                >
                  beIN SPORTS
                </div>
              </div>

              <div class="flex items-end gap-3 text-white">
                <div class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/30 bg-black/30">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M8 6.6a9 9 0 0 1 8 0M6 9.8a13 13 0 0 1 12 0M4 13a17 17 0 0 1 16 0M12 20h.01"/>
                  </svg>
                </div>
                <div>
                  <p class="text-xl font-black leading-none">beIN</p>
                  <p class="text-base font-semibold leading-tight text-slate-200">{{ filteredBeinChannels.length }} chaînes</p>
                </div>
                <div class="ml-auto text-sm font-bold text-slate-200">
                  {{ isBeinOpen ? 'Masquer' : 'Ouvrir' }}
                </div>
              </div>
            </div>
          </button>

          <div v-if="isBeinOpen" class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              v-for="channel in filteredBeinChannels"
              :key="channel.id"
              @click="startStreaming(channel)"
              class="rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-left text-sm font-bold text-slate-100 transition-colors hover:border-red-400/70 hover:bg-slate-900"
            >
              {{ channel.titre }}
            </button>
          </div>
        </section>

        <section class="self-start rounded-3xl border border-white/10 bg-slate-900/70 p-3 sm:p-4 shadow-2xl">
          <button
            @click="isLigue1Open = !isLigue1Open"
            class="relative w-full overflow-hidden rounded-3xl border border-white/10 bg-linear-to-b from-slate-800 via-slate-900 to-black p-4 text-left sm:p-5"
          >
            <div class="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-black to-transparent"></div>

            <div class="relative z-10 flex min-h-40 flex-col justify-between">
              <div class="flex justify-center pt-1">
                <div
                  class="flex h-14 w-44 items-center justify-center rounded-sm border border-slate-300/20 bg-white px-4 py-1 text-center font-black text-[#064E3B] shadow-[0_10px_26px_rgba(0,0,0,0.45)]"
                >
                  LIGUE 1+
                </div>
              </div>

              <div class="flex items-end gap-3 text-white">
                <div class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/30 bg-black/30">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M8 6.6a9 9 0 0 1 8 0M6 9.8a13 13 0 0 1 12 0M4 13a17 17 0 0 1 16 0M12 20h.01"/>
                  </svg>
                </div>
                <div>
                  <p class="text-xl font-black leading-none">Ligue 1+</p>
                  <p class="text-base font-semibold leading-tight text-slate-200">{{ filteredLigue1Channels.length }} chaînes</p>
                </div>
                <div class="ml-auto text-sm font-bold text-slate-200">
                  {{ isLigue1Open ? 'Masquer' : 'Ouvrir' }}
                </div>
              </div>
            </div>
          </button>

          <div v-if="isLigue1Open" class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              v-for="channel in filteredLigue1Channels"
              :key="channel.id"
              @click="startStreaming(channel)"
              class="rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-left text-sm font-bold text-slate-100 transition-colors hover:border-red-400/70 hover:bg-slate-900"
            >
              {{ channel.titre }}
            </button>
          </div>
        </section>
        </div>

        <div class="mb-10 flex justify-center">
          <button
            @click="toggleEvents"
            class="rounded-2xl border border-orange-500/40 bg-orange-500/10 px-6 py-3 text-sm font-black uppercase tracking-wide text-orange-400 transition-colors hover:bg-orange-500 hover:text-white"
          >
            {{ isEventsVisible ? 'Masquer les événements' : 'Charger les événements' }}
          </button>
        </div>

        <div v-if="isEventsVisible && isLoading" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          <div v-for="i in 8" :key="i" class="h-64 bg-slate-900/50 rounded-[2.5rem] animate-pulse border border-slate-800"></div>
        </div>

        <div v-if="isEventsVisible && !isLoading" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          <div v-for="match in filteredMatches" :key="match.id" 
               class="group relative bg-slate-900/40 border border-slate-800 rounded-[2.5rem] p-8 hover:bg-slate-900 hover:border-orange-500/40 transition-all duration-500 flex flex-col justify-between overflow-hidden shadow-2xl">
            
            <div class="absolute -top-24 -right-24 w-48 h-48 bg-orange-600/5 blur-[80px] group-hover:bg-orange-600/10 transition-all duration-700"></div>
            
            <div class="relative z-10">
              <div class="flex justify-between items-center mb-8">
                <div class="flex items-center gap-2">
                  <span class="w-2 h-2 bg-red-600 rounded-full animate-ping"></span>
                  <span class="text-[10px] font-black uppercase tracking-tighter text-red-500">Live</span>
                </div>
                <span class="text-[10px] text-slate-500 font-black uppercase tracking-widest bg-slate-800/50 px-3 py-1 rounded-full border border-slate-700/50">{{ match.info }}</span>
              </div>
              
              <h3 class="text-2xl font-black leading-tight mb-10 group-hover:translate-x-1 transition-transform duration-300">
                {{ match.titre }}
              </h3>
            </div>

            <button @click="startStreaming(match)" 
                  class="relative z-10 w-full py-5 bg-slate-100 text-slate-950 font-black rounded-3xl hover:bg-orange-500 hover:text-white transition-all duration-300 transform active:scale-95 flex items-center justify-center gap-3 shadow-xl">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd" />
              </svg>
              {{ match.url ? 'VOIR LE MATCH' : 'BIENTÔT DISPONIBLE' }}
            </button>
          </div>
        </div>

        <div v-if="isEventsVisible && !isLoading && filteredMatches.length === 0 && filteredEquipeChannels.length === 0 && filteredBeinChannels.length === 0 && filteredLigue1Channels.length === 0" class="text-center py-40 border-2 border-dashed border-slate-900 rounded-[3rem]">
          <p class="text-slate-700 text-3xl font-black italic uppercase tracking-tighter opacity-50">Aucun match trouvé</p>
        </div>
      </main>

    </div>
  </div>
</template>