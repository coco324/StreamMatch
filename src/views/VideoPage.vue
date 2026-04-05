<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';

const props = defineProps<{
  matchTitle: string;
  streamUrl: string; 
}>();

const emit = defineEmits(['close']);

const videoPlayer = ref<HTMLVideoElement | null>(null);
const player = ref<any>(null);
const isFullscreen = ref(false);
const keepAliveInterval = ref<any>(null);

// Configuration URL Backend pour le ping
const backendUrl = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:8302';

const toggleFullscreen = () => {
  if (!player.value) return;
  if (player.value.isFullscreen()) {
    player.value.exitFullscreen();
  } else {
    player.value.requestFullscreen();
  }
};

// --- LA SEULE AJOUT : LE TIMER ---
const startKeepAlive = () => {
  const FIFTEEN_MINUTES = 900000;
  keepAliveInterval.value = setInterval(async () => {
    try {
      // On envoie une requête discrète pour garder la session active
      await fetch(`${backendUrl}/api/keep-alive?url=${encodeURIComponent(props.streamUrl)}`);
      console.log("🔄 Session rafraîchie (15 min)");
    } catch (e) {
      console.log("⚠️ Erreur refresh session");
    }
  }, FIFTEEN_MINUTES);
};

onMounted(() => {
  if (videoPlayer.value) {
    player.value = videojs(videoPlayer.value, {
      autoplay: true,
      controls: true,
      responsive: true,
      fluid: true,
      playbackRates: [0.5, 1, 1.5, 2],
      userActions: { hotkeys: true },
      html5: {
        vhs: {
          overrideNative: true,
          // --- ON REMET TES RÉGLAGES PERF EXACTS ---
          maxBufferLength: 60,
          maxMaxBufferLength: 120,
          enableLowInitialPlaylist: true,
          limitRenditionByPlayerDimensions: false,
          smoothQualityChange: true,
          fastQualityChange: true,
          useNetworkInformationApi: false,
        }
      },
      sources: [{
        src: props.streamUrl,
        type: 'application/x-mpegURL'
      }]
    });

    player.value.on('fullscreenchange', () => {
      isFullscreen.value = !!player.value.isFullscreen();
    });

    // Lancement du timer de 15 minutes
    startKeepAlive();
  }
});

onBeforeUnmount(() => {
  // On nettoie le timer quand on quitte
  if (keepAliveInterval.value) clearInterval(keepAliveInterval.value);
  
  if (player.value) {
    player.value.dispose();
  }
});
</script>

<template>
  <div class="fixed inset-0 z-50 bg-slate-950 flex flex-col">
    <button
      @click="toggleFullscreen"
      class="fixed top-4 right-4 z-[200] px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-400 text-slate-950 text-sm font-bold shadow-lg transition-colors"
    >
      {{ isFullscreen ? 'Quitter plein écran' : 'Plein écran' }}
    </button>

    <div class="p-4 flex justify-between items-center bg-slate-900 border-b border-slate-800">
      <div class="flex items-center gap-4">
        <button @click="emit('close')" class="p-2 hover:bg-slate-800 rounded-full transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <h2 class="text-xl font-bold text-orange-500 tracking-tight">{{ matchTitle }}</h2>
      </div>
      <span class="px-3 py-1 bg-red-600 animate-pulse rounded text-xs font-bold uppercase">En Direct</span>
    </div>

    <div class="grow flex items-center justify-center bg-black">
      <div class="w-full max-w-6xl shadow-2xl shadow-orange-900/20">
        <div data-vjs-player>
          <video 
            ref="videoPlayer" 
            class="video-js vjs-theme-city [image-rendering:auto] shadow-[0_0_50px_rgba(0,0,0,0.5)]"
          ></video>
        </div>
      </div>
    </div>

    <div class="p-6 bg-slate-900 text-slate-400 text-sm text-center italic border-t border-slate-800">
      Maintien de session automatique toutes les 15 minutes.
    </div>
  </div>
</template>

<style>
.video-js {
  font-family: 'Inter', sans-serif;
}
.vjs-big-play-button {
  background-color: rgba(249, 115, 22, 0.8) !important;
  border: none !important;
  border-radius: 50% !important;
  width: 80px !important;
  height: 80px !important;
  line-height: 80px !important;
}
</style>