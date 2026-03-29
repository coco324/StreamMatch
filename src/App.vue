<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
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
const isLoading = ref(true);
const searchQuery = ref("");
const statusMsg = ref("");

// State pour le lecteur
const isStreaming = ref(false);
const selectedMatch = ref<Match | null>(null);
const currentStreamUrl = ref("");

// --- LOGIQUE API ---

const loadMatches = async () => {
  isLoading.value = true;
  statusMsg.value = "";
  try {
    const res = await fetch('http://localhost:8000/api/matches');
    if (!res.ok) throw new Error();
    matches.value = await res.json();
  } catch (e) {
    statusMsg.value = "🔌 Erreur : Le serveur Python est hors ligne.";
  } finally {
    isLoading.value = false;
  }
};

const startStreaming = async (match: Match) => {
  statusMsg.value = `⏳ Préparation du flux pour ${match.titre}... (7 étapes en cours)`;
  
  try {
    const res = await fetch(`http://localhost:8000/api/get-stream-url?url=${encodeURIComponent(match.url)}`);
    const data = await res.json();

    if (data.m3u8) {
      selectedMatch.value = match;
      currentStreamUrl.value = data.m3u8;
      isStreaming.value = true;
      statusMsg.value = "";
    } else {
      statusMsg.value = "❌ Impossible de récupérer le flux direct.";
    }
  } catch (e) {
    statusMsg.value = "❌ Erreur de connexion au scraper.";
  }
};

// --- FILTRAGE ---
const filteredMatches = computed(() => {
  return matches.value.filter(m => 
    m.titre.toLowerCase().includes(searchQuery.value.toLowerCase())
  );
});

onMounted(loadMatches);
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
              Empire <span class="text-orange-500 underline decoration-orange-500/30 underline-offset-8">Hub</span>
            </h1>
            <p class="text-slate-500 text-xs font-bold tracking-[0.3em] mt-3 uppercase opacity-70">Privé & Familial</p>
          </div>
        </div>

        <div class="flex items-center gap-4 w-full lg:w-auto">
          <div class="relative flex-grow lg:w-96">
            <span class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">🔎</span>
            <input 
              v-model="searchQuery"
              type="text" 
              placeholder="Chercher une équipe..." 
              class="w-full bg-slate-900/50 border border-slate-800 py-4 pl-12 pr-4 rounded-2xl focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none transition-all placeholder:text-slate-700 font-medium"
            />
          </div>
          <button @click="loadMatches" class="p-4 bg-slate-900 border border-slate-800 rounded-2xl hover:bg-orange-600 hover:border-orange-500 transition-all duration-300 active:scale-90 group">
            <div :class="{'animate-spin': isLoading}">🔄</div>
          </button>
        </div>
      </header>

      <div v-if="statusMsg" class="mb-10 p-5 bg-orange-600/10 border border-orange-500/20 text-orange-500 text-center rounded-2xl font-bold text-sm tracking-wide animate-pulse">
        {{ statusMsg }}
      </div>

      <main>
        <div v-if="isLoading" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          <div v-for="i in 8" :key="i" class="h-64 bg-slate-900/50 rounded-[2.5rem] animate-pulse border border-slate-800"></div>
        </div>

        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
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
                    class="relative z-10 w-full py-5 bg-slate-100 text-slate-950 font-black rounded-[1.5rem] hover:bg-orange-500 hover:text-white transition-all duration-300 transform active:scale-95 flex items-center justify-center gap-3 shadow-xl">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd" />
              </svg>
              VOIR LE MATCH
            </button>
          </div>
        </div>

        <div v-if="!isLoading && filteredMatches.length === 0" class="text-center py-40 border-2 border-dashed border-slate-900 rounded-[3rem]">
          <p class="text-slate-700 text-3xl font-black italic uppercase tracking-tighter opacity-50">Aucun match trouvé</p>
        </div>
      </main>

    </div>
  </div>
</template>