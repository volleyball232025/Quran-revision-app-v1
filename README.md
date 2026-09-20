# Quran Revision v0.1.52

## Supabase account + cloud sync

This build connects the existing local-first Quran Revision app to Supabase without removing localStorage. It adds Google OAuth, email/password signup and sign-in, email password recovery, Google identity linking, sign-out, automatic per-user cloud sync to `public.quran_revision_state`, a manual Sync now control, and JSON backup import for migrating data from the older `file://` version to `https://quran-revision.pages.dev`.

The browser uses only the Supabase project URL and publishable key. No service-role key, secret key, or database password is included. Row Level Security on `quran_revision_state` is expected to restrict each authenticated user to their own row.

### First hosted migration

If you have important progress in an older local file version, open that version first and use **Profile → Download backup**. Then open the hosted v0.1.52 site, use **Profile → Account & Security → Import backup**, verify the data, and then sign in. For a new account with no cloud row, the current hosted-device state becomes the initial cloud copy.

---

# Quran Revision v0.1.41

This build restores the interactive Home dashboard and simplifies the Exact Mushaf Tajweed experiment to a calm three-color palette (red, green, and gold) while preserving the exact QCF page/line geometry.

## v0.1.34

- Reworked Practice Home into a livelier daily dashboard while keeping existing navigation/features intact.
- Added a real **Today’s momentum** progress ring based on Surahs logged today (goal up to 5).
- Added **Continue listening** from the most recent listened Surah and remembered ayah position.
- Added **Continue revision** using the most recently logged Practice Surah, with a smart weak-Surah suggestion when no prior log exists.
- Added quick Home cards for current red ayahs, Quran vocabulary coverage, and practice streak.
- Added a **Quick meaning win** card using the highest-impact unknown core word with one-tap “I know this”.
- Kept the existing Needs Attention list lower on Home.

## v0.1.30

- Meanings now defaults to a **Core Words** bank instead of showing every surface variation as a separate vocabulary item.
- Related attached/inflected Quranic forms are grouped into one practical family while retaining the full underlying form list and combined occurrence count.
- Each family can be expanded with **Related forms** so no Quran data is hidden or deleted.
- Added a **Core Words / All Forms** switch. All Forms preserves the original detailed bank for users who want every variation.
- Marking a core family Known treats its related forms as understood for Quran-coverage purposes, matching the user's goal of learning the main meaning rather than re-learning small grammatical variations.
- Quran coverage, My Words, highest-impact suggestions, and Test Me now use the concise core-family model by default.
- Existing Known selections automatically carry into their corresponding core family. Learned-on dates remain preserved.
- Grouping is intentionally lemma-style and conservative; it does not claim to be a full classical-Arabic root/morphology parser.

## v0.1.29

- Added a third **History** tab beside Whole Surah and Needs Work on each Practice Surah page.
- Every ayah red/green toggle is now recorded automatically with ayah number, action, date, and time.
- The History tab groups changes by day and shows current red count, total recorded changes, and the latest changed ayah.
- Existing red ayahs are preserved without inventing historical timestamps; automatic tracking starts with this version.
- Renamed the top-right revision **History** button to **Logs** so star/note session logs remain separate from the new automatic red-ayah history.


## v0.1.28

- Fixed duplicate Bismillah in the normal Practice reader. When the standalone Bismillah is shown above a Surah, the same opening phrase is now robustly removed from ayah 1 even when the text provider includes alternate Uthmani marks or diacritics.
# Quran Revision — v0.1.25

## Meanings word bank

Practice mode now replaces the bottom **Practice** tab with **Meanings**. The revision queue is still available from Home → View Queue.

Meanings includes:

- A Quran-wide word bank built at runtime from UmmahAPI word-by-word Arabic, transliteration, and English meanings.
- Repeated normalized Arabic forms are merged into one vocabulary entry while retaining an occurrence count.
- Quick green/gray Known toggles to build a personal meaning-knowledge bank.
- Two progress measurements: unique vocabulary known and occurrence-weighted Quran coverage. The coverage metric rewards common repeated words.
- Search across Arabic, transliteration, and English meanings.
- Sort by most common, Quran order, or Arabic alphabetical order.
- **Highest-impact words to learn** suggests common unknown words that can raise Quran coverage fastest.
- **My Words** shows only the user's known-word bank.
- **Test Me** quizzes known words in Arabic → English and English → Arabic directions, tracks score/streak/best streak, and records per-word correct/wrong history. Previously missed words receive extra quiz weight.
- The full word index is cached separately from revision state so the main Practice/Listen save remains lightweight. The bank can be used while the 114 Surahs finish indexing.

The vocabulary index excludes repeated opening Bismillah tokens when the provider includes them before a Surah's first numbered ayah, matching the app's existing Quran display convention.

# Quran Revision — v0.1.19 v0.1.17

## Exact Mushaf revision navigation

The confirmed Madinah/QCF V2 exact-page experiment now works as a practical teacher-style revision view:

- Displays one physical Mushaf page at a time instead of preloading every page of the selected Surah.
- Previous/next page controls navigate through all **604** pages.
- A page-number jump box lets you go directly to a reference such as **page 560**. Press **Go** or Enter.
- Optional **Line refs** show 1–15 as tiny overlays in the page margin. They do not participate in the Quran text layout, so they do not change line wrapping or spacing.
- Tapping a line reference opens a small inspector showing the ayah or ayahs that occupy that physical line.
- Pages are lazy-loaded only when viewed.
- Thin red underlines now follow red ayahs from any memorized Surah visible on the physical page, including when a neighboring Surah shares the page.

The exact Quran text remains grouped by the Quran Foundation/QCF `page_number` and `line_number` fields and uses the page-specific QCF V2 font.

## Previous: v0.1.16

## Exact Mushaf practice experiment

Practice mode now has an **Exact Mushaf** toggle on a Surah page. Unlike the older visual approximation, this mode is built around the standard 604-page Madinah/QCF V2 layout. It fetches the real physical page(s) for the selected Surah, uses Quran.com QCF V2 page glyphs, preserves the API-provided 15-line placement, and shows the real Mushaf page number at the bottom.

The full physical page is rendered, including verses from neighboring Surahs when they share the same page. This is intentional so teacher references such as “page 560, line 3” refer to the same physical location as the printed Madinah Mushaf. Red ayahs from the revision tracker receive only a thin red underline without changing line breaks.

Exact Mushaf page data and page-specific QCF fonts are lazy-loaded only when this experimental mode is turned on.

## Previous: v0.1.14

## Revision organization and Listen annotations

- Stats now includes a **Red Ayahs** explorer with **By Juz** and **By Surah** views.
- Juz filters are multi-select, so red ayahs can be viewed for one Juz or any combination of Juz.
- Listen → Surahs shows the **last listened date/time** for each Surah.
- Ayah `•••` in Listen mode now supports independent **Pink**, **Yellow**, and **Light blue** highlights (plus None). These do not change Practice-mode green/red status.
- The Memorized Surahs manager now uses clean on/off switches instead of Add buttons.
- A **Bulk by Juz** switch grid lets you toggle Surahs whose first ayah begins in a selected Juz. Turning a Surah off keeps its saved ratings, red ayahs, notes, and history.

# Previous: v0.1.13

## Experimental line-by-line ayah flow

The failed Smart Word Follow experiment has been replaced with a second ayah-level follow style.

- **Smooth ayah flow · original** is unchanged.
- **Line-by-line ayah flow · experimental** detects the Arabic text's actual rendered wrap lines and draws one very thin progress line beneath each visual line.
- Playback progress moves through those line tracks in order from the first rendered line to the last.
- The experimental tracks do not use the larger moving dot from the original flow.
- This is still ayah-timestamp based, so it does not claim exact word synchronization.

## Play from any ayah

Every ayah in Listen mode now has a small **▶** button directly below its **•••** menu. Pressing it seeks the same continuous Surah audio file to that ayah and starts playback immediately.

# Quran Revision v0.1.12

## Smart Follow diagnostic fix

v0.1.11 could make **Smart word follow** look exactly like **Smooth ayah flow** because unsupported/error states silently fell back to the smooth ayah progress line. That made the experiment impossible to judge.

v0.1.12 separates them completely:

- **Smart word follow** shows no ayah progress line.
- It highlights an individual Quran word only after browser speech recognition produces Arabic and the sequence-aware matcher accepts the context.
- A small live `Heard:` line shows the Arabic phrase the browser actually recognized, so it is obvious when recognition is running.
- If Chrome cannot feed the playing Surah audio track into `SpeechRecognition`, the screen says Smart Follow is unavailable instead of pretending to work.
- **Smooth ayah flow** remains the separate continuous ayah-level progress-line mode.

This is still an experiment because direct audio-track `SpeechRecognition` and `HTMLMediaElement.captureStream()` have limited browser availability. For production-quality exact word highlighting, use verified word-level timing segments tied to the exact chapter recording (for example Quran Foundation chapter audio `segments`) once the backend Content API integration is added.

# Quran Revision v0.1.11

## Experimental Smart Word Follow

Listen mode now includes a **Smart word follow · experimental** option in Audio Settings. When the browser supports direct audio-track speech recognition, the app captures the currently playing Surah audio track and recognizes Arabic phrases from that track itself — it does not need to listen through the room microphone.

The matcher is sequence-aware:

- Recognized Arabic is normalized before matching.
- The last several recognized words are matched against possible positions in the current ayah.
- Surrounding words, current audio position, and the previously confirmed word are used together.
- Repeated words are therefore resolved by context/order rather than simply highlighting the first identical word.
- Low-confidence matches are ignored instead of forcing a wrong highlight.
- If direct audio-track recognition is unavailable in the browser, the app automatically falls back to the smooth ayah-level flow cue.

This uses browser SpeechRecognition and `HTMLMediaElement.captureStream()` when available. Browser support is still limited, so this is intentionally an experiment rather than the only follow-along method.

## Open the app

1. Unzip the folder.
2. Double-click `index.html`.
3. Open **Listen** mode and choose a Surah.
4. Open **••• Audio Settings → Follow along → Smart word follow · experimental**.


## v0.1.10 listening cue update

- Removed the approximate word-by-word active highlight/wave.
- The current ayah now has one continuous, smooth flow line driven directly by that ayah’s real start/end timing.
- Arabic words and English word meanings remain visible, but they are no longer visually claimed to be synchronized word-by-word.
- This avoids distracting early/late word highlighting while keeping a clear sense of playback position through the ayah.

# Quran Revision v0.1.10

## Open the app

1. Unzip the folder.
2. Double-click `index.html`.
3. Open **Listen** mode and choose a Surah.

The build is bundled into `app.bundle.js`, so it is intended to open directly from a local `file://` URL without a development server.

## v0.1.10 Listen-mode performance


### Lazy Surah content loading

The Surah list now loads only lightweight Surah metadata. Full Arabic ayahs and word meanings are requested **only after that specific Surah is opened** in Listen mode.

- Only the selected Surah's ayahs are fetched.
- Only the selected Surah's word meanings are fetched.
- Quran text and word meanings load in parallel.
- Full-Surah audio can start independently while text/meanings are still arriving.
- Switching Surahs cancels the previous unfinished content request.
- Reopening a Surah during the same app session reuses the in-memory cache.
- The reciter/timing catalog is lazy-loaded only when Listen mode is entered.

### Bismillah handling

Bismillah is displayed as a separate opening line for Surahs that begin with it, but it is **not numbered or counted as an ayah**. During the opening audio, the player label says “Bismillah”; normal ayah numbering begins with Ayah 1.

### Smoother word-follow cue

The old solid word box has been removed. The active word now uses a subtle animated five-bar sound-wave cue underneath the Arabic word, with a soft fade toward the neighboring word.

The visual cue updates with `requestAnimationFrame` while audio is playing instead of relying only on the browser's lower-frequency `timeupdate` event. Estimated timing also uses a softened word-length model so long written words do not hold the cue disproportionately long. Exact provider word timestamps can replace this interpolation layer later without changing the reader UI.

### Reciters live inside Now Playing settings

The separate **Reciters** bottom tab has been removed. Listen mode now has three tabs:

- Surahs
- Now Playing
- Recent

Reciter choice is inside the small **••• Audio settings** control at the bottom of the Now Playing page, together with repeats, playback speed, auto-scroll, and end-of-Surah behavior.

The compatible reciter list prioritizes:

- Mishary Rashid Alafasy
- Ahmad Al Nufais
- Yasser Al-Dosari

The exact displayed spelling follows the MP3Quran provider metadata.

### Favorite qaris

Every reciter in Audio Settings has a star control:

- `☆` = not favorited
- `★` = favorite

Favorites are saved locally and automatically sort to the top of the reciter list.

### End-of-Surah behavior

Audio Settings now lets you choose:

- **Stop** when the current Surah finishes, or
- **Keep going** automatically to the next Surah.

When Keep going is selected, you can choose:

- **No limit** — continue until you manually stop playback, or
- A specific final Surah — playback stops after that Surah completes.

Each Surah remains a separate full-Surah audio file. Automatic continuation simply loads the next complete Surah track when the current one ends.

### Player layout

The visible player stays intentionally minimal:

- Previous ayah
- Pause / Resume
- Next ayah

Advanced audio controls are not placed near the top player. The small **•••** Audio Settings control appears below the ayah reader, near the bottom of the Now Playing page.

### Existing v0.1.4 behavior retained

- One continuous audio file per Surah
- Current ayah highlighting
- Estimated word-follow highlighting
- English word meanings below Arabic words when available
- Separate Bismillah line
- Repeat current ayah
- Loop an ayah range
- Finite repeat counts or infinite repeat
- Green/red revision status mirrored in Listen mode
- Ayah `•••` access to revision notes
- Passive listening never changes revision stats automatically

## Data providers in this prototype

- Quran text: AlQuran Cloud runtime API.
- Full-Surah audio + ayah timing: MP3Quran runtime API.
- Word-by-word Arabic/transliteration/English glosses: UmmahAPI runtime API.

The app streams/fetches these resources at runtime; recordings and word datasets are not bundled into this download.

## Persistence

Revision state, favorite reciters, and Listen settings save locally using `localStorage`. Login and cross-device sync are still reserved for the Supabase backend step.


## v0.1.7

- Added **Whole Surah continuously** to Audio Settings. It loops the same full-Surah MP3 indefinitely and temporarily overrides the normal end-of-Surah stop/continue setting until the repeat mode is turned off.

## v0.1.10 ayah-flow experiment

The smooth Listen-mode progress cue now sizes itself to the rendered Arabic wording of each ayah. Short ayahs get a shorter right-aligned cue; long or wrapped ayahs clamp to the reader width. The width calculation intentionally ignores English word meanings so gloss length does not distort the Quran progress indicator.


### v0.1.19
- Exact Mushaf mode received a traditional decorative skin inspired by printed Madinah Mushaf pages: green/gold geometric frame, top page band, side ornaments, cartouche-style Surah headings, parchment treatment, and a decorative footer.
- The underlying 604-page / 15-line QCF placement and red-ayah underlining are unchanged.

## v0.1.22
- Added **Match Practice Surah** in Listen > Audio Settings.
- When enabled, switching from an open Practice Surah to Listen opens that same Surah directly in Now Playing.
- The matched Surah opens at the beginning but does not autoplay; playback still requires the user's Play action.
- Setting is enabled by default and can be turned off.

## v0.1.23
- Added a Listen-reader refresh button beside the Ayahs heading.
- Refresh re-fetches only the currently selected Surah's ayah text and word-by-word meanings.
- Audio source, current playback position, reciter, repeat settings, highlights, and Practice/revision records are preserved.
- The refresh button shows a busy/spinning state while the content is being reloaded.

## v0.1.24 — Practice ayah notes
- Added persistent notes for individual ayahs in Practice mode.
- Normal Practice reader: each ayah has a small note/edit control; saved notes are visually indicated without changing the Quran text.
- Exact Mushaf reader: an `Ayah notes` control lists the ayahs on the current physical page so notes can be edited without disturbing QCF page geometry.
- Exact Mushaf line-reference sheets also link directly to the corresponding ayah note.
- Ayah notes are stored separately from daily revision logs and persist in the existing local-storage state.

## v0.1.26 — Meanings usability
- Fixed the Meanings search field losing focus after every character. Live filtering now restores focus and the cursor so full words can be typed normally.
- Added a floating back-to-top arrow that appears after scrolling down the Meanings page and returns to the top with a fast ~320 ms scroll.
- Added a persistent first-learned timestamp for vocabulary words. Newly marked Known words display `Learned on <date>` in the word bank / My Words view.
- Existing known words from earlier versions are left without an invented historical date until newly added words are learned going forward.

## v0.1.27
- Increased contrast and size of the Meanings coverage percentage.
- Improved legibility of both Meanings summary cards.


## v0.1.31
- Added Profile → Account & Security UI ready for Supabase.
- Planned Google sign-in at signup/login plus Link Google for existing email/password accounts.
- Added Reset password and secure account-transfer settings placeholders.
- Added a working local JSON backup download so users can save their current data before cloud sync is enabled.

## v0.1.33
- Restored Exact Mushaf mode inside Practice > Surah > Whole Surah after it was accidentally dropped in a later merge.
- Exact Mushaf uses the Madinah/QCF V2 604-page, 15-line layout with page navigation, line references, red-ayah underlines, ayah notes, and line fitting.
- Kept all newer Meanings, red-history, account/security, Listen, and friendly visual features intact.

## v0.1.35 preferred name
- Added a preferred display name field under Profile → Account & Security.
- Home now greets the user as “Assalamualaikum, [name]” when a preferred name is saved.
- The future account signup flow is designed to ask “What should we call you?” after Google or email sign-in, and the name remains editable later.

## v0.1.36 — Memorization Progress
- Added Stats → Memorization Progress with an 8-week completion chart, average Surah pace, recent completion count, Juz milestone cards, and editable memorization timeline.
- Added a dedicated memorized-Surah log with start date, completion date, completion confidence, and duration-only support for older Surahs.
- The suggested start date for a new Surah defaults to the most recent logged Surah completion and remains editable.
- Adding an individual Surah through the Surah manager now opens the memorization log instead of silently adding it; bulk Juz collection toggles remain available for collection management.
- Saving a memorization record adds the Surah to the revision collection and uses the completion confidence as its starting confidence rating.

### v0.1.37
- Added an **I don't remember** option when logging past memorized Surahs. It stores the record without inventing dates or a duration.
- Added **Timeline / Calendar** viewing modes to Stats → Memorization Progress.
- Calendar view shows Surah completion chips on the day they were finished, with month navigation.
- Tapping a Surah chip opens a compact memorization summary with confidence, dates, pace, and an Edit button.
- Records with unknown dates stay in the timeline and are intentionally omitted from the calendar.

## v0.1.40
- All Red Ayahs now opens a selected ayah in Practice → Exact Mushaf on its physical page, preserving surrounding context.
- The selected red ayah receives a subtle focus wash while its existing red status underline remains intact.
- Exact Mushaf adds an optional Tajweed Colors toggle using the QCF Tajweed V4 Mushaf when the provider/browser supports it.
- Standard QCF V2 Exact Mushaf remains the default and automatic fallback.


## v0.1.43
- Fixed the **Add Surah** search popup so filtering happens in place without rebuilding the sheet.
- Typing no longer loses focus or jumps the popup/page to the top after each letter.

## v0.1.46 safety & recovery
- Deleting an individual ayah note now requires confirmation.
- Turning off a Bulk-by-Juz group now requires confirmation before removing multiple Surahs from the active revision collection; saved data is still retained.
- Added rolling local recovery snapshots and Profile / Account & Security restore controls for approximately 24 hours ago and 3 days ago.
- Recovery snapshots begin with this version, so older restore points show as unavailable until enough time has passed.
- Restoring first creates an emergency snapshot of the current state, then reloads the chosen historical state.


## v0.1.46 recovery update
- Recovery targets are now About 1 hour ago and About 24 hours ago.
- Automatic local snapshots are captured at most once per hour when app data has changed, with enough rolling history to support the 24-hour restore target.

## v0.1.47 visual clarity update
- Improved the Exact Mushaf Ayah Notes list so Surah/ayah labels and saved note previews are darker, bolder, and easier to scan.
- Bottom navigation now keeps the parent tab shaded on nested Practice screens (Surah detail/log/history -> Surahs; Red Ayahs/queue -> Home).
- No other app behavior changed.

## v0.1.50
- Kept the v0.1.47 bottom-navigation active-tab shading unchanged.
- Changed Exact Mushaf Ayah Notes so saved-note rows are clearly shaded as a whole instead of relying on darker/bolder note text.
- Restored the note-row text to the normal visual treatment; only the saved-note row/card itself receives the stronger distinction.


## v0.1.52
- Replaced the plain blue Google sign-in mark with the familiar multicolor Google G while keeping the existing Supabase auth flow unchanged.
