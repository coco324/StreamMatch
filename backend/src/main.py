import uvicorn
import json
import time
import undetected_chromedriver as uc
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

app = FastAPI()

# --- CONFIGURATION CORS (INDISPENSABLE) ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_headless_driver():
    options = uc.ChromeOptions()
    
    # --- MÉTHODE RADICALE ANTI-BLOCAGE ---
    # On désactive le mode "Safe Browsing" qui bloque souvent les popups de stream
    options.add_argument("--disable-popup-blocking")
    options.add_argument("--ignore-certificate-errors")
    options.add_argument("--disable-blink-features=AutomationControlled")
    
    # On force l'autorisation via les arguments de démarrage
    options.add_argument("--disable-notifications")
    options.add_argument("--no-first-run")
    
    # --- LOGGING POUR LE M3U8 ---
    options.set_capability('goog:loggingPrefs', {'performance': 'ALL'})
    
    # debug (cache les fenêtres)
    options.add_argument("--headless") 

    options.add_argument("--mute-audio") # mute le son
    
    driver = uc.Chrome(options=options, version_main=146)
    
    # --- LA RUSE ULTIME : SCRIPT JS ---
    # On injecte un petit script qui "écrase" la fonction de blocage de Chrome
    driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {
        "source": "window.open = (open => (url, name, features) => open(url, name, features))(window.open);"
    })
    
    return driver

# --- ROUTES ---
@app.get("/api/hello")
def hello():
    return {"message": "Hello from FastAPI!"}


@app.get("/api/matches")
def list_matches():
    """Scrape l'accueil pour donner la liste à Vue.js"""
    driver = get_headless_driver()
    matchs = []
    try:
        driver.get("https://empire-sport.art/")
        time.sleep(2)
        elements = driver.find_elements(By.CSS_SELECTOR, "a.card-line")
        for el in elements:
            url = el.get_attribute("href")
            matchs.append({
                "id": url.split("/")[-1],
                "titre": el.find_element(By.CSS_SELECTOR, ".info-teams").text.replace("\n", " vs "),
                "url": url,
                "info": el.find_element(By.CSS_SELECTOR, ".info-txt-event").text
            })
    finally:
        driver.quit()
    return matchs

@app.get("/api/get-stream-url")
def get_stream_url(url: str = Query(...)):
    """La route qui manquait : fait les 7 étapes et renvoie le m3u8"""
    print(f"🚀 Scraping lancé pour : {url}")
    driver = get_headless_driver()
    lien_m3u8 = None

    try:
        driver.get(url)
        
        # 1. Clic sur l'overlay "Regarder Gratuitement"
        try:
            overlay = WebDriverWait(driver, 10).until(
                EC.element_to_be_clickable((By.CSS_SELECTOR, ".overlay-play"))
            )
            driver.execute_script("arguments[0].click();", overlay)
            time.sleep(1)
        except: pass

        # 2. Automatisation des 7 étapes
        for i in range(1, 8):
            try:
                print(f"⏳ [ÉTAPE {i}/7] Recherche du bouton...")
                wait = WebDriverWait(driver, 1)
                bouton = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".btn-pub.fr")))
                
                # Scroll et clic forcé
                driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", bouton)
                # time.sleep(1) 
                driver.execute_script("arguments[0].click();", bouton)
                print(f"⚡ [ÉTAPE {i}/7] Clic effectué. Nettoyage des pubs...")

                # --- NETTOYAGE EXPRESS (Max 1 secondes) ---
                time.sleep(1) # On laisse juste le temps à la popup de "naître"
                if len(driver.window_handles) > 1:
                    main_handle = driver.window_handles[0]
                    # On boucle sur toutes les fenêtres sauf la première
                    for handle in driver.window_handles[1:]:
                        driver.switch_to.window(handle)
                        driver.close()
                        print("🚫 Pub fermée.")
                    # On revient immédiatement au match
                    driver.switch_to.window(main_handle)
                
                # Attente de la validation Empire (le compteur doit tourner)
                # On attend le reste du temps ici (6s car on a déjà attendu 2s)
                print(f"⏳ Attente validation étape {i}...")
                # time.sleep(1) 

            except Exception as e:
                print(f"❌ Erreur à l'étape {i}")
                break

        # 3. Récupération du lien m3u8 dans les logs
        print("🔎 [DEBUG] Analyse des logs réseau...")
        logs = driver.get_log('performance')
        time.sleep(2) # Laisser le temps au lecteur de lancer le flux
        
        for entry in logs:
            msg = json.loads(entry['message'])['message']
            if msg['method'] == 'Network.requestWillBeSent':
                url_req = msg['params']['request']['url']
                
                # On cherche tout ce qui ressemble à un flux vidéo direct
                # On exclut les "chunks" (.ts) qui ne sont que des morceaux de 2 secondes
                if (".m3u8" in url_req or "playlist" in url_req or "empire-cdn" in url_req) and "chunk" not in url_req:
                    # On vérifie que ce n'est pas une pub (souvent des noms bizarres)
                    if "googlesyndication" not in url_req and "doubleclick" not in url_req:
                        lien_m3u8 = url_req
                        print(f"🎯 [SUCCÈS] Flux détecté : {url_req[:80]}...")
                        break
                    
    finally:
        driver.quit()
    
    if lien_m3u8:
        print(f"✅ Flux trouvé : {lien_m3u8[:50]}...")
        return {"m3u8": lien_m3u8}
    
    return {"error": "Lien non trouvé après les 7 étapes."}

@app.get("/api/get-tv-url")
def get_tv_url(url: str = Query(...), channel_name: str = Query(...)):
    print(f"📺 Scraping TV lancé pour : {channel_name}")
    driver = get_headless_driver()
    lien_m3u8 = None

    try:
        driver.get(url)

        #pour forcer le navigateur a croir que la page est toujours visible (et éviter les blocages de pub)
        driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {
        "source": """
        Object.defineProperty(document, 'visibilityState', {get: () => 'visible'});
        Object.defineProperty(document, 'hidden', {get: () => false});
        window.addEventListener('visibilitychange', (e) => e.stopImmediatePropagation(), true);
        """
        })

        # 1. Sélection de la chaîne
       
        try:
            channels = driver.find_elements(By.CSS_SELECTOR, ".card-tv")
            target_channel = None
            for ch in channels:
                if channel_name.lower() in ch.text.lower():
                    target_channel = ch
                    break
            
            if target_channel:
                driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", target_channel)
                time.sleep(1)
                driver.execute_script("arguments[0].click();", target_channel)
                print(f"✅ Chaîne {channel_name} sélectionnée. Attente chargement page flux...")
                time.sleep(1) # Crucial : laisser la page de la chaîne charger
            else:
                print(f"❌ Chaîne {channel_name} non trouvée.")
                return {"error": "Chaîne introuvable"}
        except Exception as e:
            print(f"⚠️ Erreur sélection chaîne : {e}")

        # 2. Les 7 étapes de pubs 
        for i in range(1, 8):
            try:
                # On attend le bouton de pub
                wait = WebDriverWait(driver, 15)
                bouton = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".btn-pub.fr")))
                
                # Clic forcé
                driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", bouton)
                # time.sleep(1)
                driver.execute_script("arguments[0].click();", bouton)
                print(f"⚡ [ÉTAPE {i}/7] Clic réussi.")

                # Nettoyage rapide des popups (1s)
                time.sleep(1)
                if len(driver.window_handles) > 1:
                    main_handle = driver.window_handles[0]
                    for handle in driver.window_handles[1:]:
                        driver.switch_to.window(handle)
                        driver.close()
                    driver.switch_to.window(main_handle)
                
                # time.sleep(1) # Validation Empire
            except Exception as e:
                print(f"❌ Arrêt à l'étape {i} ou bouton non trouvé.")
                break

        # 3. Récupération du flux m3u8
        print("🔎 Analyse des logs pour trouver le m3u8...")
        time.sleep(2) # Laisser le temps au lecteur de lancer le flux
        logs = driver.get_log('performance')
        
        for entry in logs:
            msg = json.loads(entry['message'])['message']
            if msg['method'] == 'Network.requestWillBeSent':
                url_req = msg['params']['request']['url']
                # Filtre pour chopper le bon lien
                if (".m3u8" in url_req or "playlist" in url_req) and "chunk" not in url_req:
                    if "googlesyndication" not in url_req:
                        lien_m3u8 = url_req
                        print(f"🎯 Flux TV trouvé : {url_req[:60]}...")
                        break

    except Exception as global_e:
        print(f"💥 Erreur globale : {global_e}")
    finally:
        driver.quit()
        print("🔌 Navigateur fermé.")
    
    return {"m3u8": lien_m3u8} if lien_m3u8 else {"error": "Lien TV non trouvé"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8300)