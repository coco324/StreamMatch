<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';

// Définition des props (ce que le parent envoie)
const props = defineProps<{
  matchTitle: string;
  streamUrl: string; // Le lien m3u8 final envoyé par le backend
}>();

// Définition des événements (ce qu'on renvoie au parent)
const emit = defineEmits(['close']);

const videoPlayer = ref<HTMLVideoElement | null>(null);
const player = ref<any>(null);

onMounted(() => {
  if (videoPlayer.value) {
    // Initialisation de Video.js avec optimisation du cache (Buffer)
    player.value = videojs(videoPlayer.value, {
      autoplay: true,
      controls: true,
      responsive: true,
      fluid: true,
      playbackRates: [0.5, 1, 1.5, 2],
      userActions: {
        hotkeys: true // Barre d'espace, flèches, etc.
      },
      html5: {
        vhs: {
          overrideNative: true, // Force Video.js à gérer le HLS même sur Safari/Mobile
          maxBufferLength: 60,  // Stocke 60s de vidéo en avance
          maxMaxBufferLength: 120, // Peut monter jusqu'à 2 min de cache
          enableLowInitialPlaylist: true, // Charge plus vite au début
          limitRenditionByPlayerDimensions: false, // Garde la meilleure qualité possible
        }
      },
      sources: [{
        src: props.streamUrl,
        type: 'application/x-mpegURL'
      }]
    });
  }
});

// Nettoyage de la mémoire quand on ferme la page
onBeforeUnmount(() => {
  if (player.value) {
    player.value.dispose();
  }
});
</script>

<template>
  <div class="fixed inset-0 z-50 bg-slate-950 flex flex-col">
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

    <div class="flex-grow flex items-center justify-center bg-black">
      <div class="w-full max-w-6xl shadow-2xl shadow-orange-900/20">
        <div data-vjs-player>
          <video ref="videoPlayer" class="video-js vjs-theme-city vjs-big-play-centered"></video>
        </div>
      </div>
    </div>

    <div class="p-6 bg-slate-900 text-slate-400 text-sm text-center">
      ⚠️ Si la vidéo coupe, revenez en arrière et relancez le flux. Session de 20 min active.
    </div>
  </div>
</template>

<style>
/* Personnalisation du lecteur pour qu'il soit plus moderne */
.video-js {
  font-family: 'Inter', sans-serif;
}
.vjs-big-play-button {
  background-color: rgba(249, 115, 22, 0.8) !important; /* Orange-500 */
  border: none !important;
  border-radius: 50% !important;
  width: 80px !important;
  height: 80px !important;
  line-height: 80px !important;
}
</style>