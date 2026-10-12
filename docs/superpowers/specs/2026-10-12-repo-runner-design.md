# Repo Runner - Sistem Tasarım Dokümanı (Design Spec)

**Tarih:** 2026-10-12  
**Proje Türü:** Bitirme Projesi (Graduation Project)  
**Çalışma Alanı:** LLM Ajanları, Otonom DevOps, Yazılım Dağıtımı ve İzolasyonu  

---

## 1. Genel Bakış ve Amaç

**Repo Runner**, kullanıcıların herhangi bir Git repo linkini veya yerel proje dizinini vererek, projenin tüm gereksinimlerini otomatik olarak tespit edip yükleyen, gerekli sanal ortam veya Docker konteynerini ayağa kaldıran ve projeyi belirlenen porttan çalıştırarak web önizlemesini sunan masaüstü tabanlı otonom bir geliştirici aracıdır.

Projenin temel amacı:
- Açık kaynak kodlu veya harici projeleri çalıştırma sırasındaki "it works on my machine" sorununu çözmek,
- Deterministik kural algoritmaları ile LLM otonomisini birleştirerek insan gözetimli (HITL - Human-in-the-Loop) güvenilir bir çalıştırma pipeline'ı sunmak.

---

## 2. Sistem Mimarisi

Sistem 3 ana katmandan oluşur:

```
+--------------------------------------------------------------+
|                     Kullanıcı Arayüzü                        |
|   Tauri Masaüstü Penceresi (React + Tailwind + Lucide Icons)  |
|   - URL Girişi / Yerel Klasör Seçici                         |
|   - Canlı Terminal & Log Akışı (xterm.js / stream log)       |
|   - HITL Onay Kartları (Docker vs Venv, AI Modu Uyarısı)     |
|   - Önizleme / Port Kartı (Gömülü Webview / iframe)          |
|   - Ayarlar (Ollama/API Key, Port Yapılandırması)             |
+------------------------------▲-------------------------------+
                               │ (REST API & Canlı WebSocket)
+------------------------------▼-------------------------------+
|               Python Arka Plan Motoru (FastAPI)               |
|                                                              |
|  1. Repo Manager: Git klonlama, yerel dizin hazırlama        |
|  2. Detector & Classifier: Standart stack vs AI Derin Mod   |
|  3. Decision Engine & HITL: Venv mi Docker mı kararı         |
|  4. Executor / Runner:                                       |
|     - Venv Yöneticisi (python -m venv, npm install)          |
|     - Docker Yöneticisi (Dockerfile, container run)          |
|  5. AI Agent Core: Ollama / OpenAI / Gemini entegrasyonu     |
|  6. Process & Port Enjektörü: Belirlenen portlarla başlatma  |
+--------------------------------------------------------------+
```

### 2.1. Bileşen Sorumlulukları
1. **Tauri Katmanı:** Hafif masaüstü kabuğu, yerel dosya ve klasör seçici dialogları, arayüz bileşenleri.
2. **FastAPI Sidecar (Python):** REST ve WebSocket uç noktaları ile Tauri'ye hizmet verir. Tüm ajan mantığı, dosya işlemleri, subprocess ve Docker yönetimi %100 Python ile yürütülür.
3. **İletişim Kanalı:**
   - **REST API:** Yapılandırma okuma/yazma, çalıştırma başlatma (`POST /api/run`), süreç durdurma (`POST /api/stop`).
   - **WebSocket (`/ws/logs/{run_id}`):** Gerçek zamanlı terminal çıktıları, durum güncellemeleri ve HITL soru/cevap etkileşimi.

---

## 3. Çalıştırma Pipeline'ı ve Karar Matrisi

Pipeline, her repoyu deterministik analizden geçirir ve iki farklı moddan birine yönlendirir:

### 3.1. Standart Kural Tabanlı Mod (Fast & Deterministic)
- **Kapsam:** Python (`requirements.txt`, `pyproject.toml`, `Pipfile`) ve JavaScript/TypeScript (`package.json`, `npm`, `yarn`, `pnpm`).
- **Framework Tespiti:** FastAPI, Flask, Django, React, Next.js, Vite, Express, Vue.
- **Çalıştırma:** Belirlenen şablonlara göre test edilmiş kurulum ve çalıştırma komutları üretilir.

### 3.2. AI Derin Mod (Deep Agentic Mode)
- **Tetiklenme Koşulu:** Standart kural setine uymayan (Go, Rust, monorepo, egzotik bağımlılıklar vb.) projeler.
- **Kullanıcı Bildirimi (HITL):** Arayüzde modal uyarısı çıkar:  
  *"Bu proje standart kurallarımızın dışındadır. AI Derin Modu devreye alınacak. Deneysel bir süreçtir, %100 çalışma garantisi verilmez."*
- **İşleyiş:** LLM (Ollama veya OpenAI/Gemini), proje yapısını ve `README.md` dosyasını inceler; özel bir kurulum planı veya Dockerfile sentezler.

### 3.3. HITL Ortam Seçimi (Docker vs Sanal Ortam)
- Projede `Dockerfile` varsa sistem öncelikli olarak Docker önerir.
- Yoksa sistem kullanıcıya sorar:  
  *"Bu proje için Docker konteyneri mi oluşturalım, yoksa yerel sanal ortamda (.venv / node_modules) mı kuralım?"*
- Kullanıcının tek tıkla verdiği karara göre izolasyon ortamı oluşturulur.

---

## 4. Port Yönetimi ve Önizleme (Preview)

İşi şansa bırakmamak adına dinamik port tahmini yerine deterministik konfigürasyon kullanılır:

### 4.1. Port Yapılandırması (Ayarlar Ekranı)
- **Varsayılan Frontend Portu:** `3000`
- **Varsayılan Backend Portu:** `8000`
- **Alternatif / Yedek Portlar:** `8001`, `8002`

### 4.2. Port Enjeksiyonu
- Başlatma komutlarına port doğrudan enjekte edilir:
  - Python / FastAPI / Uvicorn: `--port 8000`
  - Flask: `flask run --port 8000`
  - Node.js / Vite: `--port 3000` veya ortama `PORT=3000` değişkeni atanarak.
  - Docker: `-p 8000:8000` veya `-p 3000:3000` port mapping ile.

### 4.3. Sağlık Kontrolü ve Canlı Önizleme
- Uygulama başlatıldıktan sonra hedef porta periyodik HTTP GET isteği gönderilir (healthcheck).
- Başarılı yanıt (200/300/400 serisi) alındığında:
  - Arayüzde **"Çalışıyor"** göstergesi yeşile döner.
  - Port bağlantı adresi (`http://localhost:3000`) gösterilir.
  - Dahili Webview / iframe içerisinde canlı önizleme açılır.
  - Kullanıcıya **"Tarayıcıda Aç"**, **"Durdur"** ve **"Yeniden Başlat"** seçenekleri sunulur.

---

## 5. Self-Healing (Hata Ayıklama ve Kendi Kendini Düzeltme)

Kurulum veya çalıştırma aşamasında hata alındığında LLM destekli iyileştirme döngüsü devreye girer:

1. **Hata Yakalama:** Çıkış kodu `exit code != 0` veya terminalde traceback algılandığında son 50 satırlık hata çıktısı yakalanır.
2. **LLM Tespiti:** Hata analizi yapılarak düzeltme aksiyonu belirlenir:
   - Eksik paket (`ModuleNotFoundError` -> `pip install <paket>`)
   - Eksik ortam değişkeni (`.env` yoksa `.env.example` kopyalanır)
   - Port çakışması (Alternatif porta geçiş yapılır)
3. **Güvenlik Sınırları (Guardrails):**
   - **Tavan Deneme:** Maksimum 3 deneme hakkı.
   - **HITL Escalation:** 3 denemeden sonra hata devam ederse, ajan durumu özetleyip kullanıcıya açıklar ve terminal müdahale önerileri sunar.

---

## 6. Model Yönetimi (Hibrit LLM Mimarisi)

- **Varsayılan Model:** Yerel **Ollama** (örn: `llama3`, `qwen2.5-coder` veya `mistral`). Kullanıcının bilgisayarında ücretsiz ve çevrimdışı çalışabilir.
- **Bulut Model Desteği:** Kullanıcı ayarlar ekranından **OpenAI API Key** veya **Gemini API Key** girerse, daha karmaşık projeler ve AI Derin Mod için bulut modelleri tercih edilebilir.

---

## 7. Geliştirme Aşamaları (Milestones)

- **Aşama 1 (MVP):**
  - Python FastAPI arka plan servisi kurulumu.
  - Git clone & yerel dizin tarayıcı modülü.
  - Standart mod: Python (venv + pip) projelerini çalıştırma ve port enjeksiyonu.
  - Tauri masaüstü arayüzü iskeleti ve WebSocket log akışı.
- **Aşama 2 (Genişletilmiş Stack & Docker):**
  - Node.js / TypeScript (npm, vite) desteği.
  - Docker izolasyonu ve Dockerfile üretimi.
  - HITL seçim diyalogları.
- **Aşama 3 (AI Derin Mod & Self-Healing):**
  - Ollama ve Gemini/OpenAI hata teşhis döngüsü.
  - 3 denemeli self-healing mekanizması.
  - Gömülü web önizleme penceresi.
