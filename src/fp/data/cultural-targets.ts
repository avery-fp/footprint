/**
 * CULTURAL TARGETS — the 50-account hit list.
 *
 * Sorted by tier:
 *   Tier 1 = mega (10M+ combined audience) — post FIRST
 *   Tier 2 = culture core (1M-10M) — the aesthetic heartbeat
 *   Tier 3 = niche heat (under 1M, high conversion potential)
 *
 * Each target gets a room minted, screenshotted, and tagged.
 */

export interface CulturalTarget {
  noun: string
  twitter: string
  instagram: string
  tier: 1 | 2 | 3
  category: string
}

export const TARGETS: CulturalTarget[] = [
  // ─── TIER 1 — MEGA (10M+ combined audience) — post these FIRST ───

  { noun: "mr beast", twitter: "@MrBeast", instagram: "@mrbeast", tier: 1, category: "creator" },
  { noun: "kai cenat", twitter: "@KaiCenat", instagram: "@kaicenat", tier: 1, category: "creator" },
  { noun: "kanye yeezy", twitter: "@kanyewest", instagram: "@ye", tier: 1, category: "music" },
  { noun: "travis scott cactus jack", twitter: "@trabornnvisscott", instagram: "@travisscott", tier: 1, category: "music" },
  { noun: "bad bunny", twitter: "@sanbenito", instagram: "@badbunnypr", tier: 1, category: "music" },
  { noun: "frank ocean blonded", twitter: "@frankocean", instagram: "@blonded", tier: 1, category: "music" },
  { noun: "playboi carti opium", twitter: "@playboicarti", instagram: "@playboicarti", tier: 1, category: "music" },
  { noun: "a24 films", twitter: "@A24", instagram: "@a24", tier: 1, category: "film" },
  { noun: "charli xcx brat", twitter: "@charli_xcx", instagram: "@charli_xcx", tier: 1, category: "music" },
  { noun: "tyler the creator golf wang", twitter: "@tylerthecreator", instagram: "@feliciathegoat", tier: 1, category: "music" },
  { noun: "supreme", twitter: "@supreme", instagram: "@supremenewyork", tier: 1, category: "fashion" },
  { noun: "off white virgil abloh", twitter: "@OffWhite", instagram: "@off____white", tier: 1, category: "fashion" },
  { noun: "adult swim", twitter: "@adultswim", instagram: "@adultswim", tier: 1, category: "culture" },
  { noun: "hypebeast", twitter: "@HYPEBEAST", instagram: "@hypebeast", tier: 1, category: "fashion" },
  { noun: "chappell roan", twitter: "@ChappellRoan", instagram: "@chappellroan", tier: 1, category: "music" },

  // ─── TIER 2 — CULTURE (1M-10M) — the aesthetic core ──────────────

  { noun: "bladee drain gang", twitter: "@bladee", instagram: "@bladee", tier: 2, category: "music" },
  { noun: "kaws companion", twitter: "@kabornnws", instagram: "@kaws", tier: 2, category: "art" },
  { noun: "chrome hearts", twitter: "@ChromeHearts", instagram: "@chromeheartsofficial", tier: 2, category: "fashion" },
  { noun: "mschf", twitter: "@mschf", instagram: "@mschf", tier: 2, category: "culture" },
  { noun: "fka twigs", twitter: "@FKAtwigs", instagram: "@fkatwigs", tier: 2, category: "music" },
  { noun: "comme des garcons", twitter: "@commedesgarcons_", instagram: "@commedesgarcons", tier: 2, category: "fashion" },
  { noun: "grimes", twitter: "@Grimezsz", instagram: "@grimes", tier: 2, category: "music" },
  { noun: "gentle monster", twitter: "@gentlemonster", instagram: "@gentlemonster", tier: 2, category: "fashion" },
  { noun: "daniel arsham future relic", twitter: "@DanielArsham", instagram: "@danielarsham", tier: 2, category: "art" },
  { noun: "lyrical lemonade", twitter: "@LyricalLemonade", instagram: "@lyricallemonade", tier: 2, category: "music" },
  { noun: "beeple everydays", twitter: "@beeple", instagram: "@beeple_crap", tier: 2, category: "art" },
  { noun: "kerwin frost", twitter: "@KerwinFrost", instagram: "@kerwinfrost", tier: 2, category: "culture" },
  { noun: "yung lean sadboys", twitter: "@yunglean2001", instagram: "@yunglean", tier: 2, category: "music" },
  { noun: "destroy lonely opium", twitter: "@DestroyLonely", instagram: "@destroylonely", tier: 2, category: "music" },
  { noun: "ken carson", twitter: "@KenCarson", instagram: "@teenxken", tier: 2, category: "music" },
  { noun: "rico nasty", twitter: "@Rico_nastyy", instagram: "@riconasty", tier: 2, category: "music" },
  { noun: "don toliver", twitter: "@DonToliver", instagram: "@dontoliver", tier: 2, category: "music" },
  { noun: "kith ronnie fieg", twitter: "@KithSet", instagram: "@kith", tier: 2, category: "fashion" },
  { noun: "faze clan gaming", twitter: "@FaZeClan", instagram: "@fazeclan", tier: 2, category: "gaming" },
  { noun: "100 thieves", twitter: "@100Thieves", instagram: "@100thieves", tier: 2, category: "gaming" },
  { noun: "central cee", twitter: "@CentralCee", instagram: "@centralcee", tier: 2, category: "music" },
  { noun: "palm angels", twitter: "@palmangels", instagram: "@palmangels", tier: 2, category: "fashion" },
  { noun: "anti social social club", twitter: "@antisocialsocialclub", instagram: "@antisocialsocialclub", tier: 2, category: "fashion" },

  // ─── TIER 3 — NICHE HEAT (under 1M but high conversion potential) ─

  { noun: "benny safdie uncut gems", twitter: "@BennySafdie", instagram: "@safdie", tier: 3, category: "film" },
  { noun: "refik anadol", twitter: "@refabornnikanadol", instagram: "@refikanadol", tier: 3, category: "art" },
  { noun: "george condo paintings", twitter: "@georgecondo", instagram: "@georgecondo", tier: 3, category: "art" },
  { noun: "david shrigley", twitter: "@davidshrigley", instagram: "@davidshrigley", tier: 3, category: "art" },
  { noun: "online ceramics", twitter: "@onlineceramics", instagram: "@onlineceramics", tier: 3, category: "fashion" },
  { noun: "032c magazine berlin", twitter: "@032c", instagram: "@032c", tier: 3, category: "fashion" },
  { noun: "duncan trussell midnight gospel", twitter: "@DuncanTrussell", instagram: "@duncantrussell", tier: 3, category: "culture" },
  { noun: "eyedress", twitter: "@Eyedress", instagram: "@eyedress", tier: 3, category: "music" },
  { noun: "drew house bieber", twitter: "@drewhouse", instagram: "@drewhouse", tier: 3, category: "fashion" },
  { noun: "fewocious", twitter: "@fewocious", instagram: "@fewocious", tier: 3, category: "art" },
  { noun: "demna balenciaga", twitter: "@demna", instagram: "@demna", tier: 3, category: "fashion" },
  { noun: "francis bacon paintings", twitter: "", instagram: "", tier: 3, category: "art" },
]
