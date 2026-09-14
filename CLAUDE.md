# CLAUDE.md — ENDRA

Bu dosya, Claude Code'un bu repo'da nasıl çalışacağını tanımlar. Her yeni
session'da önce bu dosya okunmalıdır.

## 1. ENDRA nedir

> Ender = fiziksel kullanıcı
> ENDRA = Ender'in dijital alter ego'su / ikinci beyni

ENDRA basit bir chatbot değildir. Amaç, zaman içinde ENDRA'yı şu seviyeye
taşımaktır:

```text
Chatbot → Assistant → Agent → Personal Knowledge System → Digital Alter Ego
```

ENDRA:

- Ender'in geçmişini, tercihlerini ve kararlarını hatırlar.
- Araştırma yapabilir, tool kullanabilir, görev takip edebilir.
- Riskli işlemlerde onay ister; sessizce fail olmaz.
- Proaktif olarak önemli gelişmeleri bildirebilir.
- Telegram'dan başlayıp zamanla web/PWA, voice ve desktop companion'a
  genişler — ama hiçbir kritik mantık tek bir arayüze bağımlı olmaz.

Karakter: "Ender Bey'in sekreteri" değil, "Ender'in bilgisayarda yaşayan
ikinci versiyonu". Türkçe konuşur, doğal ve rahat, gereksiz kurumsal dil
kullanmaz, gerektiğinde fikre karşı çıkabilir, gereksiz uzun cevap vermez.
Persona konfigürasyonu koda gömülü değildir — bkz. `config/persona/`.

## 2. Mimari — hızlı bakış

```text
Telegram / Web / Voice / Desktop → ENDRA Gateway → ENDRA Core
                                                       │
                                        ┌──────────────┼──────────────┐
                                        ▼              ▼              ▼
                                     Memory           LLM         Tool Router
                                   (Supabase)                    (n8n / APIs)
```

Ayrıntılı mimari, komponent sorumlulukları ve repository layout için:
**`docs/ARCHITECTURE.md`**.

Kalıcı mimari kararlar (neden n8n, neden Supabase, neden Telegram önce,
neden Core ayrı bir servis) için: **`docs/decisions/`** (ADR-001..005).
Kabul edilmiş (Accepted) bir ADR sebepsiz değiştirilmez — değişiklik
gerekiyorsa yeni bir ADR açılır, eskisi silinmez.

## 3. Teknoloji tercihleri

- **Dil:** TypeScript (strict mode), Node.js >= 20.
- **Monorepo:** npm workspaces (`apps/*`, `packages/*`).
- **Test:** Vitest.
- **Lint/format:** ESLint (flat config) + Prettier.
- **Backend/Core:** bağımsız TypeScript servisi (`apps/core`), framework
  seçimi henüz yapılmadı (Phase 1'de karar verilecek — bkz. `docs/NEXT_ACTION.md`).
- **Orkestrasyon:** n8n (RepoCloud üzerinde, mevcut).
- **Veritabanı / uzun süreli hafıza:** Supabase (Postgres + pgvector).
- **LLM:** OpenAI ve/veya Anthropic, `LLMProvider` interface'i arkasında
  soyutlanmış — tek sağlayıcıya kilitlenilmez.
- **İlk kullanıcı arayüzü:** Telegram.

## 4. Repository yapısı

```text
endra/
├── apps/
│   ├── core/                 ENDRA Core (channel-agnostic API)
│   ├── telegram-adapter/     Telegram kanal adaptörü (geçici, bkz. ADR-005)
│   └── web/                  reserved — Phase 8'den önce içi doldurulmaz
├── packages/
│   ├── shared/                paylaşılan tipler/yardımcılar
│   ├── agent-contracts/       LLMProvider, EndraTool, mesaj şemaları
│   └── tool-sdk/              EndraTool implementasyonları için yardımcılar
├── n8n/                        workflow export'ları (source of truth burada)
├── supabase/                   migrations + seed
├── config/persona/             ENDRA persona config
├── docs/                       proje yönetimi (bkz. aşağıda)
└── scripts/                    status / next / doctor
```

## 5. Kodlama standartları

- Strict TypeScript, gereksiz `any` yok.
- Basitlik önce: istenmeyen özellik, spekülatif abstraction,
  "ileride lazım olur" kodu yazma. Bkz. kişisel `~/.claude/CLAUDE.md`
  (Simplicity First / Surgical Changes) — bu proje için de geçerlidir.
- Var olan kodu "iyileştirmek" için dokunma; sadece istenen değişikliği yap.
- Yorum yazma gereksiz yere; sadece WHY açık olmadığında kısa not düş.
- Her değişen satır, yapılan görevle doğrudan ilişkili olmalı.

## 6. Güvenlik kuralları

- Secret değerler koda veya log'a yazılmaz. `.env` asla commit edilmez
  (`.env.example` şablon olarak tutulur).
- Tool'lar risk seviyesine göre sınıflandırılır: `read` (otomatik
  çalışabilir), `write` (tercihe göre onay), `critical` (her zaman
  kullanıcı onayı gerekir — email gönderme, dosya silme, finansal işlem,
  hesap güvenliği değişikliği).
- Riskli işlemler için sistem seviyesinde confirmation state kullanılır
  (`pending_action`, `approval_id`, `tool`, `arguments`, `expires_at`).
  LLM onay sonrası farklı parametrelerle ikinci kez çalıştırılamaz.
- Telegram bot herkese açık değildir; yalnızca
  `ENDRA_ALLOWED_TELEGRAM_USERS` içindeki kullanıcı ID'leri kabul edilir.
- Health endpoint (`GET /health`) hassas sistem bilgisi döndürmez.
- `npm run doctor` yalnızca config'in _var olup olmadığını_ kontrol eder,
  değerleri asla yazdırmaz.

## 7. Hafıza mimarisi (özet)

Hafıza tek bir "conversation history" değildir; katmanlıdır: working
memory, user profile memory, semantic memory, episodic memory, project
memory, decision memory, task memory. Her konuşma otomatik olarak kalıcı
hafızaya dönüşmez — bir promotion pipeline'dan geçer (extraction →
importance evaluation → duplicate/conflict detection → storage). Retrieval
sırasında tüm geçmiş modele gönderilmez; semantic similarity, importance,
recency ve memory type relevance kombinasyonuyla ilgili kayıtlar seçilir.
Ayrıntı ve şema için Phase 2 task'larına (`docs/TASKS.yaml`, `MEMORY-*`) ve
ADR-002'ye bakılır.

## 8. Durum dosyalarının konumu

| Dosya                     | Amaç                                               |
| ------------------------- | -------------------------------------------------- |
| `docs/PROJECT_STATUS.md`  | Genel durum, faz, ilerleme yüzdesi                 |
| `docs/TASKS.yaml`         | Makine-okunabilir roadmap ve task durumları        |
| `docs/NEXT_ACTION.md`     | Tam olarak kaldığı nokta — context sıfırlansa bile |
| `docs/DEVLOG.md`          | Teknik milestone kayıtları                         |
| `docs/decisions/ADR-*.md` | Kalıcı mimari kararlar                             |
| `docs/ARCHITECTURE.md`    | Teknik mimari referansı                            |

## 9. Session başlangıç prosedürü

Her yeni Claude Code session'ı şu sırayla başlar:

1. `CLAUDE.md` (bu dosya)
2. `docs/PROJECT_STATUS.md`
3. `docs/TASKS.yaml`
4. `docs/NEXT_ACTION.md`
5. Son ADR kayıtları (`docs/decisions/`)
6. `git status`
7. Son commit'ler (`git log`)
8. `npm run status` (varsa)

Bunlardan sonra kısa bir durum raporu ver (faz, ilerleme, mevcut/son
task, repo durumu) ve kaldığı yerden devam et — önceki sohbet
context'ine ihtiyaç duyulmamalı.

## 10. Task yönetimi

Tüm roadmap `docs/TASKS.yaml` içinde machine-readable task'lara
bölünmüştür (ID, phase, status, priority, depends_on). Status değerleri
sadece: `pending`, `in_progress`, `blocked`, `done`, `skipped`.

- Bir task'a başlamadan önce `in_progress` yapılır.
- Test edilmeden `done` yapılmaz.
- `npm run status` genel durumu, `npm run next` aktif/önerilen task'ı ve
  `docs/NEXT_ACTION.md` içeriğini gösterir.

### Task döngüsü

```text
Inspect → Select Task → mark in_progress → Implement → Test → Fix
→ Document → mark done → Update PROJECT_STATUS → Update NEXT_ACTION
→ (gerekirse ADR) → commit → npm run status → Continue
```

## 11. Test kuralları

- Kritik modüller (Core API, memory storage/retrieval, tool registry/
  router, permissions, confirmations, Telegram parsing/dedup/auth, config,
  error handling) unit/integration test ile kapsanır.
- `npm test` (Vitest) ana branch'te geçmeden bir faz tamamlanmış sayılmaz.
- Başarısız test varken ilgili task `done` işaretlenmez.

## 12. Git çalışma prensibi

- Küçük, mantıksal commit'ler; bağımsız değişiklikleri tek commit'e
  doldurma.
- Örnek commit formatı: `feat(memory): add persistent memory storage`,
  `fix(telegram): prevent duplicate updates`, `docs(adr): record memory architecture`.
- Faz milestone'larında stabil checkpoint/tag bırakılabilir
  (`v0.1-foundation`, `v0.2-core`, ...).
- Yıkıcı git komutları (force push, reset --hard, vb.) yalnızca açıkça
  istendiğinde kullanılır.

## 13. Session bitiş prosedürü

Session sonunda veya önemli checkpoint'te:

1. `docs/NEXT_ACTION.md` güncel tutulur (kaldığı yer, sonraki adımlar,
   dikkat edilmesi gereken kısıtlar).
2. `docs/PROJECT_STATUS.md` güncellenir.
3. `npm run status` çalıştırılıp sonuç kontrol edilir.
4. `git status` ile repo durumu doğrulanır.

Yeni bir session, önceki sohbeti hiç bilmese bile yalnızca repository
üzerinden devam edebilmelidir.

## 14. Kapsam kontrolü

İlk sürümlerde yapılmayacaklar: native iOS/Android app, karmaşık web
dashboard, full desktop control, wake word / sürekli mikrofon dinleme,
avatar, 3D interface, multi-agent swarm, gereksiz microservice mimarisi,
kendi vector database sistemini yazmak, gereksiz abstraction.

Öncelik sırası: **reliable → simple → observable → testable → extensible → secure**.

Genel ilke: _Build for the next logical step, not every hypothetical future._

## 15. Şu anki durum

Phase 0 (Foundation) tamamlandı. Aktif faz ve sıradaki task için
`docs/PROJECT_STATUS.md` ve `docs/NEXT_ACTION.md` dosyalarına bakılmalı —
bu dosyalar bu CLAUDE.md'den daha sık güncellenir, güncel gerçek onlardır.
