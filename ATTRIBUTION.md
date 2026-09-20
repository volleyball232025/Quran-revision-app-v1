# Quran Revision v0.1.6 — Data and attribution notes

This prototype intentionally keeps Quran content and recitation providers separate from the user's revision data.

## Quran text

Runtime provider: **AlQuran Cloud** (`api.alquran.cloud`).

The app requests Quran text at runtime rather than bundling a Quran text dataset. For Surahs other than Al-Fatihah and At-Tawbah, the UI separates a leading Bismillah from the first displayed ayah when the provider returns it as a prefix.

Before a public production release, verify the provider's current terms, attribution requirements, text edition, and redistribution rules and retain any required notices.

## Meanings vocabulary bank

v0.1.25 reuses the runtime UmmahAPI word-by-word endpoint to build a local Quran vocabulary index. The app does not redistribute or bundle the provider dataset. It groups repeated normalized Arabic surface forms locally, counts occurrences, and stores only the generated local index/cache plus the user’s known-word selections and quiz statistics.

## Word-by-word meanings

Runtime provider: **UmmahAPI** (`ummahapi.com/api/quran/words/{surah}`).

Its documentation describes per-word Arabic, transliteration, and English meaning data for a verse or complete Surah. The app fetches these data at runtime and does not bundle the dataset.

The current v0.1.6 prototype estimates word-follow timing inside each ayah and renders it as a smooth sound-wave cue. The English glosses themselves come from the word-data provider; the app does not invent translations when the endpoint is unavailable.

Before public production use, verify the provider's current terms and any attribution requirements.

## Full-Surah audio and ayah timings

Runtime provider: **MP3Quran** (`mp3quran.net`).

The app requests compatible complete-Hafs reciter metadata, full-Surah MP3 URLs, and ayah timing metadata at runtime. Audio recordings are streamed from the provider and are not redistributed in this project.

The v0.1.6 reciter picker prioritizes Mishary Rashid Alafasy, Ahmad Al Nufais, and Yasser Al-Dosari when those recitations are returned as compatible with the full-Surah + timing workflow. MP3Quran currently publishes Ahmad Al Nufais and Yasser Al-Dosari Quran collections and identifies their Surah recitations as Hafs ‘an Asim.

Licensing/redistribution rights can vary by recording. Do not bundle recordings unless the relevant rights clearly permit redistribution.

## Planned exact word timing

Quran Foundation's current chapter-recitation API documents optional `segments=true` timing data containing per-word `[word_index, start_ms, end_ms]` segments within one chapter-level audio file. That is a good production path for exact word synchronization once backend/API credentials are configured.

No Quran Foundation private credentials or proprietary data are included in this prototype.

## Exact Mushaf practice view (v0.1.16)

The experimental exact Mushaf reader uses runtime page data from the Quran.com/Quran Foundation v4 page endpoint and page-specific QCF V2 web fonts from QuranCDN. The app does not bundle or redistribute the QCF font files; they are requested at runtime for the viewed page. The renderer uses the returned physical page/line metadata so the layout can correspond to the standard 604-page Madinah/QCF Mushaf.

- Page data endpoint pattern: `https://api.quran.com/api/v4/verses/by_page/{page}?words=true&word_fields=code_v2,text_uthmani,page_number,line_number,char_type_name&per_page=all`
- Runtime QCF V2 font pattern: `https://static.qurancdn.com/fonts/quran/hafs/v2/woff2/p{page}.woff2`

