# DOCUMENTARY_EXTRACTION.md

Raw extraction for team brainstorm. Source watched end-to-end via `/watch`.

**Coverage note (read first):** I watched at **`--detail token-burner`** — the mode
you requested was accepted, no fallback. Evidence base: native English captions
(YouTube auto-captions, full 45:56) + **830 scene-aware frames** extracted, of which
I visually read **70 sampled across the whole runtime** (~1 every 40 s, plus scene
cuts). Auto-captions mean some words are ASR-approximate; anywhere the wording
looked garbled I marked it `[uncertain]` or reconstructed conservatively and flagged
it. Proper-noun spellings from audio are marked `[uncertain spelling]`. I did **not**
use Whisper (no API key configured); captions were complete so this did not create gaps.

---

## 1. VIDEO METADATA

- **Title:** *"I Can't Read, So I Must Be Useless": Life With Dyslexia In Singapore | I'm Not Stupid, I'm Dyslexic*
- **Channel / publisher:** CNA Insider (Channel NewsAsia)
- **Upload date:** 2026-02-24 (per yt-dlp metadata)
- **Runtime observed:** **45:56** (2756 seconds)
- **Format:** Single-presenter documentary. Host **Inch Chua** (singer-songwriter, dyslexic, diagnosed in her 20s) meets other dyslexic Singaporeans across careers and school ages.

**Who's featured:**
| Person | Role | Key facts stated |
|---|---|---|
| **Inch Chua** | Host / subject (adult, singer-songwriter) | Diagnosed at ~23 while pursuing music in the US; reads by word-shape + context; left primary school 26 years ago |
| **Sharon Chong** [uncertain spelling] | Subject (adult, ex-interior-designer → entrepreneur) | Formally diagnosed at **37**; words appear to *move* for her; now award-winning entrepreneur running two businesses |
| **Dr. Githa Shantatha Ram** [uncertain spelling] | Expert (dyslexia researcher) | 2+ decades of dyslexia research; explains the neuroscience |
| **Shazriel** [uncertain spelling] | Subject (Primary 4 student) | Diagnosed with dyslexia 2 years ago; attends SDR remediation class |
| **He-Man Tan** [uncertain spelling] | Subject (adult chef / ceramic artist / author) | ~40 years a chef; author of 7 books; writes only in capital letters; diagnosed at 40+ via his son; son (19) also dyslexic |
| **Bryan Tan** [uncertain spelling] (captions vary "Bryan"/"Brian") | Subject (young adult) | National champion, two-handed yo-yo; left secondary school 8 years ago; bullied in school; escapes into Pokémon |
| **3 parents at a dinner** | Subjects (parents of dyslexic kids) | One is an ex-gang-member/ex-drug-user who dropped out; one's son is now "an IT security guy"; **Jamie** [uncertain] homeschools her son |
| Various teachers | The class teacher, the **SDR** remediation teacher(s) | Shown teaching Shazriel's classes |

**Settings shown:** crowded Singapore street (Dyslexia-Association context shot), a bar/restaurant, a public-speaking contest venue, Inch's car (driving segment), Inch's mother's home, a primary school (classroom + SDR remediation room + library), He-Man's home + a commercial kitchen, a dinner gathering against a concrete/brick wall, a yo-yo showcase hall, an awards stage, Inch's home music studio.

---

## 2. TIMELINE OF KEY MOMENTS

| Time | What happens |
|---|---|
| 00:08 | Cold open — a dyslexic voice: "Filling form for me is like a pain… the words are moving." |
| 00:23 | He-Man (chef): the word "chicken" as short-form "cn" on a docket is a *new word* he must relearn → "panic." |
| 00:48 | Another subject: writes with "a lot of N," has ideas but can't structure sentences; **draws pictures** to represent thoughts. |
| 01:12 | Inch introduces herself as a singer-songwriter; "this is how I read." |
| 01:31 | Inch: she reads by **word shape + context + instinct**, not by decoding letters. |
| 01:41 | Inch names her dyslexia; diagnosed in her 20s; says she "always knew" she learned differently. |
| 01:59 | Narration: **"One in every 10 people in Singapore are like me."** On-screen source: Dyslexia Association of Singapore. "Hidden disability." |
| 02:25 | Inch goes to a **public speaking contest** — final of a 9-week course; meets contestant Sharon Chong. |
| 02:49 | Sharon: cue cards don't help — "the words jump because the [card] is small"; slides are her "safety blanket," not allowed this round → must memorise. |
| 04:00 | Sharon's on-stage speech: flashback to Primary 5, crying over an unfinished exam, teacher's "Sharon, you again, why are you crying." |
| 04:57 | Sharon's speech: fired from a prestige international design firm after 6 months; boss said "I think you have dyslexia." "I only hear shame." |
| 05:44 | Sharon didn't win; frames it as "a baby learning to crawl." |
| 06:09 | Narration: Sharon formally diagnosed only at **37** (Inch's current age). |
| 06:17 | Inch explains word-retrieval: dyslexics have "a rich universe of thought but you just can't find the words." |
| 06:59 | **"Dyslexia looks different from person to person"** — Sharon sees words *move*; Inch sees letters *jumbled*, decodes word by word. |
| 07:50 | Expert segment: Dr. Githa (whiteboard "DYSLEXIA," magnetic letters). "Language-based learning difference… neurological… NOT about intelligence." |
| 08:15 | "Barking at print" — reading every letter to form the word = decoding without understanding; you forget what you read / lose your place. |
| 08:48 | Spelling taxes memory further; then writing is another task on top. |
| 09:08 | **Karaoke-ball analogy (Inch):** she can read the bouncing-ball karaoke words in time, "but if you ask me what I just read, I will not be able to tell you anything about it." |
| 09:49 | Dr. Githa lists *other* dyslexia difficulties: spatial-temporal, listening (processing spoken language, not hearing), motor control, memory. |
| 10:36 | Brain explainer: non-dyslexic reading path — phonological processing → visual memory (word becomes an image) → say-it-aloud. |
| 11:41 | **Dyslexic brain:** underactivation in phonological processing + visual-memory regions; overactivation in the "say it out loud" region — they rely on that one area to read. |
| 12:22 | Inch: "Will I always be behind… play catch-up?" Dr. Githa: school is more challenging; **the stigma of a learning difference in Singapore continues to exist.** |
| 12:55 | "You might have seen this viral video" → a speed-reading test clip. |
| 14:01 | Inch: she's done speed-reading tests since childhood (parents sent her to speed-reading class; "didn't really yield the results we hoped for"). |
| 14:25 | **Driving segment:** Inch navigates by word outlines, road-sign colours (green = street, blue = highway), and landmarks; drives in silence in new places; admits missing turns. |
| 15:25 | Old photo: Inch at 23 in the US, around her diagnosis; told her mum by phone, "since then we've never really talked about it." |
| 16:15 | Inch reviews her old **primary-school report** with her **mother**; reading/spelling below average; teacher comment "should be encouraged to read." |
| 16:56 | Inch: primary school was rough; "got by by **copying other people's work**"; thinks it made classmates dislike her. |
| 17:25 | Mum recalls Inch giving away character erasers to "buy" friends; "in primary school I was always alone." |
| 17:52 | PSLE results "the most unimpressive… definitely below average"; too embarrassed to show anyone; everyone else in the family went to Express stream. |
| 18:27 | **"I can't read so I must be unimportant… inferior… much more useless than other people."** Mum: "As a parent I feel a bit sad… I didn't know how to handle you." |
| 19:20 | Narration: 26 years since Inch left primary school — "a lot has changed." |
| 19:33 | **System explainer:** P1 English-literacy screening → **Learning Support Programme (LSP)**, 30 min daily, class of 8–10 → P2 re-check for dyslexia → P3–4 smaller after-school class 3×/week. |
| 20:20 | Inch visits **Shazriel** (P4, diagnosed 2 yrs ago); sits in on his mainstream English class. |
| 20:55 | Group task on a picture book ("A Nasty Accident"); Shazriel is **less active than peers**, some disconnect expressing himself. |
| 22:28 | Class reads aloud together; Shazriel: "I'm a little bit stressed. There's a lot of noise." |
| 23:10 | **SDR (School-based Dyslexia Remediation Programme)** class — 4–6 students; breaking words down for reading + spelling. |
| 23:36 | Spelling drill: "relieve/relieved," teaching that "ie" vowels go together, "-ed" endings. |
| 24:44 | Reading aloud in SDR ("The Wasteland Part 2"); teacher says when Shazriel enters SDR "a switch flips," he takes more initiative. |
| 25:05 | Shazriel: what he loves about school is **"coming to this class."** |
| 25:10 | He's told SDR ends at P5; he wants to stay; SDR "helped me with… my anxiety when I get scared when I was supposed to read." |
| 25:58 | Shazriel: with anxiety he goes quiet — "if I say something wrong my friend will be looking at me." |
| 26:19 | Teachers reflect: he's more vocal in the small SDR class; discuss the **support ending** at P4 and the emotional tinge of that. |
| 27:14 | Reassurance: after P4 there's P5 reading remediation; they take **Foundation English** (not Standard) at PSLE; "not a miracle… but skills they keep." |
| 27:55 | Narration: **~20,000 primary + secondary students in Singapore are dyslexic**; dyslexia affects **3–10% of the population.** "Is that too many to be struggling in school?" |
| 28:30 | **Strengths segment:** per "this study," dyslexia linked to high-level reasoning, visual-spatial ability, memory, problem-solving, creativity. |
| 29:09 | **He-Man Tan** — home full of accolades; 7 books, award-winning ceramicist, decorated chef; also dyslexic. |
| 29:43 | He-Man: couldn't attend culinary school ("I can't study"); learned by cooking hands-on. |
| 30:01 | School was cruel — teacher: "80–90% understand, why don't you… are you trying to be funny?"; **he can only write in capital letters.** |
| 30:47 | He-Man: dyslexics "learn very very slow, but… we can always do better than a lot of people." |
| 31:23 | He-Man diagnosed at 40+, confirmed because of his son. |
| 31:41 | He-Man cooks a feast to **bring together parents of dyslexic children.** |
| 32:10 | **Parents' dinner:** guilt ("it's our fault," unreasonable but real); one parent felt relief (explained the letter/number reversals). |
| 32:44 | A father: "Why should my son suffer this?" Family doctor: "Welcome to the famous club" (Edison, Einstein, Jamie Oliver). |
| 33:15 | Parents on helping kids find their calling **outside** books/school — road trips, history, allowing more gaming (one son now in IT security). |
| 34:04 | **Jamie** [uncertain]: has homeschooled since last January; school hours too long; lets her son explore art + gardening. |
| 34:30 | A father's story: **dropped out → drugs → gangs**, because bullying ("teacher condemned me… classmate: this guy is stupid") pushed him to fight back. |
| 35:21 | Claim (father, then Inch): **in the UK, 30%+ of incarcerated people are dyslexic** (on-screen source: Prison Reform Trust, UK). |
| 35:55 | A parent worked in a drug-rehab centre + youth home; only after her son's diagnosis realised those young men "had the same symptoms… loss of hope… dull and dead eyes." |
| 36:38 | Inch, over a childhood photo: **reading aloud in class was her biggest nightmare** — sniggers, "so slow, so stupid"; bullying "part and parcel." |
| 37:02 | Narration: **2023 Dyslexia Association of Singapore survey — 70% of parents with kids at DAS said their child had been bullied.** |
| 37:26 | **Bryan** — plays Pokémon on the same console since 12; an escape; called names by peers. |
| 37:44 | Bryan links being dyslexic to being bullied; couldn't stand up for himself; teachers "never actually dialogue with the students." |
| 38:21 | Chinese tuition teacher: "if you fail this practice paper I'm going to tear it in front of you" → Bryan scored **zero**, teacher tore it; Bryan keeps the photo on his phone; cried, "super demoralized." |
| 39:08 | Bryan: still feels anxiety, "afraid to speak up sometimes," but "now way better… mainly for my hobby." |
| 39:33 | **Yo-yo Showcase Vol. 3** — Bryan (in Pokémon/Ash cosplay) is the national two-handed champion; performs on stage. |
| 41:22 | Friends interviewed: Bryan is "very persistent… keeps it 200%"; yo-yo gave him confidence + friends. |
| 42:26 | Inch moved by Bryan's community — "such great support he's able to dedicate himself to something he loves." |
| 42:58 | Closing montage: subjects "may not have scored well in school, but they've all found their own niche." |
| 43:07 | Sharon → award-winning entrepreneur (two businesses); He-Man → chef + ceramicist prepping **50 pieces for a charity exhibition**; Bryan → national yo-yo champ 8 years in; Inch → awards in music + theatre. |
| 44:10 | Inch in her home studio, remixing her punk-rock song "Wool Suit" into dubstep. |
| 44:42 | **Inch: "my superpower that comes with dyslexia is my ability to link very disparate ideas and connect them."** |
| 44:55 | "A very long 20-year journey… I've been told I was stupid for a very long time." |
| 45:10 | "I definitely wish I was more normal" (when younger) → **"being normal is one of the most terrifying things… I don't want to be normal."** |
| 45:34 | Closing / credits (TEDxWomen footage, CNA Insider credits). |

---

## 3. VERBATIM QUOTES

Attribution notes: captions are ASR; wording below is as transcribed. Obvious ASR
noise trimmed only where it doesn't change meaning; anything doubtful is `[uncertain]`.

**Cold-open / dyslexic experience**
- **[00:08, subject — voice, likely Sharon]** "Filling form for me is like a pain for me. It's almost like the words are moving. I really need to read it for quite a few rounds."
- **[00:18, Inch]** "For me, when I'm reading, I don't see words moving."
- **[00:23, He-Man]** "The doctor is very difficult for me to read because short form… chicken, the short form 'cn'… spaghetti spell as 's p g h.' So in my database 'c h i c k e n' is already drilled in my mind. I need to relearn that short form. To me it's a new word. To me it's panic."
- **[00:48, subject]** "Every year I will set goals for myself. When I write, I use a lot of N. I have the idea in my head, but I don't know how to structure the sentences on the paper. I also draw pictures to represent my [thoughts]. If it's just words, I may not be able to understand at all."

**Inch — self-description**
- **[01:31]** "I look at the shape of the words and make a guess what they are based on context and my instinct."
- **[01:59]** "One in every 10 people in Singapore are like me. You can't tell who they are. It's called a hidden disability."
- **[09:08]** "An example I usually like to give people is… when you're doing karaoke and there's the dancing ball — if you want me to read the words as it is, promptly in time, I could be able to do that. But then if you just ask me what I just read, I will not be able to tell you anything about it. Like I have no idea what I just read."
- **[14:25]** "I now know I'm in the east and I see a sign that starts with the letter T with a long end and I generally assume that I'm in Temp[ines]."
- **[14:45]** "Most street names are green and most highways are in blue. So the colour from the periphery instantly tells me an expressway is nearby. If I'm navigating to a completely new place, I also drive in complete silence to focus on the road."
- **[18:27]** "Like, I can't read, so I must be unimportant, or I must be… I'm just an inferior, or… just much more useless than other people."
- **[19:06]** "No, I still [feel] terrible at everything. That's how I feel most of the time." *(reply to her mother)*
- **[36:38]** "This is me in primary school, and I remember reading out loud in class is probably one of my biggest nightmares. Before I can even begin, I would hear sniggers and laughs, and you would hear comments like 'ugh, again' or 'so slow, so stupid.' Getting bullied was just part and parcel of my primary school life."
- **[44:42]** "I think my superpower that comes with dyslexia is my ability to link very disparate ideas and connecting them together."
- **[45:04]** "I've been told I was stupid for a very long time."
- **[45:10]** "When I was much younger… I definitely wish I was more normal. And now I think being normal is one of the most terrifying things on the planet. I really don't want to be normal. So I'm very happy with where I am today."

**Sharon Chong**
- **[02:49]** "Q card is nothing… for me, Q card is [where] the words jump, because the [card] is small. So it's very difficult for me."
- **[03:01]** "And this round I can't even use slide, and I use that as my safety blanket."
- **[04:00, on stage]** "Let me bring you back when I was just Primary 5. I'm holding half [a paper] soaked with tears, half-unfinished exam paper, and the next thing I hear: 'Sharon, you again, why are you crying? If you had studied harder you don't need to cry.' At the moment I froze… and there's an invisible label on me."
- **[04:57, on stage]** "I landed in one of the prestige international English design firm[s]. But after 6 months down the road I was called into the room by my English boss. 'We had to let you go.' And she add on, 'I think you have dyslexia.' At that point I don't know what it's about. I only hear shame."
- **[05:29]** "I always thought that when I talk in a friend group, sometimes I can't even express myself or articulate well… the words stuck to me. I want to learn to communicate."
- **[05:49]** "With public speaking, it's like a baby learning to crawl. I step out to walk and probably I fall again… So that's part of learning."

**Dr. Githa (expert)**
- **[07:58]** "Dyslexia — it's a language-based learning difference. It's neurological in origin. So that's important, because it's not about intelligence."
- **[08:15]** "If you're literally reading every single letter and putting them together to form the word, what you're doing is really barking at print. You're simply decoding. You're missing the opportunity to understand because you don't have the capacity to recall what you have just read… you will probably forget what you've read earlier, or you might even lose your place in the text."
- **[09:32]** "Because you're spending all of your cognitive resources on just decoding… What you're unable to do is connect those words meaningfully to actually remember what you've just read."
- **[11:41]** "When you look at an individual with dyslexia, immediately you see there's underactivation in certain areas… the general consensus is that it's the phonological processing deficit — the inability to break up the sounds of the language. The other component that's missing is the visual-memory region, so they're not able to recall words… And there's overactivation in the 'say it out loud' region. So they are relying on just this area to read."
- **[12:33]** "Given the circumstances of what an individual with dyslexia needs to deal with in school… certainly it will be more challenging… In Singapore, the stigma of having a learning difference exists. It continues to exist."

**Shazriel (P4 student)**
- **[22:35]** "Just a little bit [stressed]. There's a lot of noise."
- **[25:05]** *(what he loves about school)* "Coming to this class." *(the SDR class)*
- **[25:42]** "[SDR] helped me by reading, doing my spelling right, and also helping me with my anxiety when I get scared when I was supposed to read."
- **[25:58]** "When I get anxiety I would like to be quiet, because if I say something wrong my friend will be like looking at me."
- **[25:36]** "I want to find a reverse pattern so I can reverse everything back here." [uncertain — ASR unclear]

**He-Man Tan**
- **[29:43]** "I went into the kitchen because I need to earn a living. I was not as lucky as a lot of more normal chefs — I can't go to a proper culinary school because I can't study."
- **[30:08]** "That point of time my teacher always say: 'Ah [He-]Man, you are a naughty boy. You know why 80%, 90% of people understand [and] you don't understand? Are you trying to be funny?'"
- **[30:23]** "I can only recognise capital letters. Even until today I can only write in capital letters."
- **[30:47]** "People with this [condition], we have a very different mindset to do things… whatever we learn, we learn it very, very slow. But the power of it is, when we start to get it done, we can always do better than a lot of people."
- **[30:49, on how he memorises recipes]** "How I remember my recipe is — physically I need to cook. Once I cook, I understand more."

**Parents (dinner)**
- **[32:23]** "There's a fair amount of guilt… the guilt is that 'oh, it's our fault.' It's unreasonable guilt, but it's still guilt that we feel."
- **[32:35]** "For me it was in a way a relief, because it explained why he's having some difficulties with the letter reversals, number reversals."
- **[32:44]** "I felt very sad. I keep telling myself, 'No, my son should not suffer this. Why should he suffer this?' And one of my family doctors, he say, 'Welcome to the famous club… did you know all the famous people are dyslexic — people like Edison, people like Einstein, Jamie Oliver.'"
- **[34:30, the ex-gang father]** "Unfortunately, when I drop out, I fall into drug. Why I got into bad company and drugs is because I got bullied. In school, teacher condemns me, scolded me; classmate cannot see eye to eye — 'this guy is stupid guy.' All this bully has been pushing me to a corner that I cannot breathe properly. I only can think… to fight back. Unfortunately I go into the wrong company. So I go into gangs. Then I got a chance to fight back those people that bully me."
- **[35:44, Inch citing the stat]** "In the UK… people who are incarcerated, about more than 30% of them are actually dyslexic."
- **[35:55, the ex-social-worker parent]** "I used to work in social services, in a drug rehab centre and also a children's home, the youth home. I didn't realise it until my son was discovered to be dyslexic that a lot of those young men that I saw in the work… they had the same symptoms, same issues… that loss of hope, or that pain that came from bullying… We get to those kind of eyes that were just very dull and dead."

**Bryan Tan**
- **[37:48]** "[Being dyslexic and being bullied] — I feel that's one of them." Peers said "why are you so short," "how come you got no special talent."
- **[38:00]** "I didn't say anything… I don't have the courage also back then."
- **[38:08]** "[Did teachers understand?] I definitely don't think so, because they only just go through the lessons and then call it a day. They never actually dialogue with the students to see, check in on them."
- **[38:21]** "Even my [Chinese] tuition teacher at one point say, 'You don't tell me that because of your condition you cannot read Chinese — that's just stupid.' This Chinese tuition teacher, he tell me, 'If you fail this practice paper I'm going to tear this paper in front of you.' And eventually — guess what, I failed. Zero marks completely. So he went full-on savage mode… tore the pieces of the paper. I still have the picture in my phone."
- **[39:02]** "I cried after that. I was super demoralised."
- **[39:08]** "I sometimes still feel anxiety every now and then. Even now doing work, I also sometimes [am] afraid to speak up."

**Bryan's friends**
- **[41:37]** "A lot of people, if they don't succeed, they give up. And Bryan doesn't really have that. He's very persistent. He keeps trying. He keeps it 200%. And he's won the national championship now."
- **[42:11]** "I would think that yo-yo gives him confidence to face what he is facing now. He puts in maybe 200% into practice. That's what scares other people."

---

## 4. VISUAL OBSERVATIONS

Things the frames show beyond the words. (Timestamps = frame I read.)

- **[00:36] He-Man's dyslexia-simulation gesture:** He tells the "chicken/C-H-I-C-K-E-N" story with both hands raised, spelling in the air, in a warm red-walled room hung with framed art/photos — visually coding him as an *artist*, before we're told he's a ceramicist. Body language animated, almost performing the panic.
- **[01:06] Sharon at work:** shot from behind at a large curved monitor; the screen shows blocks of coloured text (looks like colour-overlay reading assistance). She wears dungarees — casual creative-professional styling.
- **[02:00–02:04] The "hidden disability" visual metaphor:** two shots of a packed Singapore shopping street where *everyone is motion-blurred except one person standing still and in sharp focus* — literally picturing "you can't tell who they are… one in ten." On-screen caption credits **Dyslexia Association of Singapore**. This is a deliberate, reusable visual idea.
- **[03:43 / 05:14] Public-speaking contest:** Sharon (white knit top, yellow trousers) coached by a woman in black in a yellow chair; then Sharon clapping in a small seated audience (~20 people) in what looks like a co-working / community room with product displays on the walls. Low-stakes, community-scale event, not a grand stage.
- **[07:35] Dyslexia-as-text graphic:** a crumpled-paper background with large words, and the word **"read" is spelled "raed"** and "difference" is cut off — the film *renders* letter-jumbling on screen so a non-dyslexic viewer feels it. Strong, literal device.
- **[07:59 / 09:02] Expert set:** whiteboard with "DYSLEXIA" in red; a scatter of **magnetic alphabet letters** on the right (some upside-down/reversed) and small pictogram cards — a tactile teaching kit. Dr. Githa in a patterned dress, Inch in denim, standing.
- **[08:25 / 08:32] Typographic full-screen:** the words "the" and "-ng-" blown up to fill the frame while Dr. Githa narrates decoding — forcing the viewer to stare at raw letter-shapes.
- **[11:01] Empathy beat:** Dr. Githa pulls a pained, almost tearful expression while explaining that dyslexics can't recall a word "after you've seen it several times" — the expert is visibly emotionally invested, not clinical.
- **[12:12] Brain diagram:** a 3-D brain labelled **"DYSLEXIC"** with call-outs "Phonological processing — breaks words into sounds," "Visual memory — word recognition," "Produces spoken words" (the last region glowing green = overactive). Clean, pitch-ready explainer asset.
- **[14:19–14:44] Driving segment:** extreme close-up of a car wheel, then Inch driving (hand on wheel, looking strained) — visualises reading road signs on the move; underscores that her coping strategy is *spatial/colour*, not textual.
- **[15:23 / 16:07 / 18:11] Mother-and-report scene:** old holiday photo of young Inch + mum at (looks like) Niagara Falls; then Inch, finger to lips, pensive, going through a physical **old school report** with her silver-haired mother at home. Mum gets emotional (close-up of her face behind glasses). Intimate, domestic.
- **[20:23] School exterior:** a bright, modern Singapore primary school — colourful painted basketball/futsal court, HDB-adjacent. Establishes the *current* system vs Inch's past.
- **[20:54 / 22:06 / 22:45] Mainstream classroom:** Shazriel at a desk with a **green dinosaur pencil case**, fidgeting with a pen; a girl raises her hand eagerly while he stays still; later a classmate reads aloud from a picture book. Shazriel is visibly *less engaged / more withdrawn* than peers — matches the "less active than the rest" narration.
- **[23:22] Corridor:** students walking past a wall of framed portraits (looks like a gallery of national figures / past principals) — ordinary Singapore school texture.
- **[23:53 / 24:36] SDR remediation room:** small group at **green-topped tables**; hands writing in a **grid/graph exercise book**; teacher at a smartboard showing "The Wasteland (Part 2)." Physically smaller, calmer, more intimate than the mainstream class. This is the "safe space" the teachers describe.
- **[25:12 / 25:57] Shazriel one-on-one:** close, relaxed body language with the SDR teacher — a marked contrast to his stiffness in the big class. Visually sells "a switch flips" in the small room.
- **[26:41 / 27:46] Library reflection:** teachers interviewed among low bookshelves and kids' reading tables — soft, warm.
- **[29:30 / 30:00] He-Man in a commercial kitchen:** in chef whites, chopping precisely; then with Inch (yellow apron reading **"INCH"**) under a pink/blue neon sign ("Great kitchens… make it happen"). He's authoritative and at ease with his hands — the exact opposite of the classroom-failure story he tells.
- **[31:46 / 32:10] The dinner:** He-Man serves; parents eat family-style around a table with plants — convivial. Then the interview cuts to parents against a raw **concrete-and-brick wall** (styled, moody) — separating the warm meal from the heavier testimony.
- **[34:23 / 35:18] The ex-gang father:** dressed in black, leaning forward, gesturing intently against the concrete wall as he recounts drugs/gangs — the most emotionally raw adult on camera.
- **[36:36 / 38:52 / 39:16] Bryan at home:** soft-lit living room with festive/Chinese-New-Year decorations behind him; he smiles shyly showing his **phone** (the torn-paper photo); wears glasses, understated. Body language guarded but warming.
- **[39:33–40:52] Yo-yo Showcase:** Bryan performs in **full Pokémon "Ash Ketchum" cosplay** (red/white cap, blue vest) on a wooden-floored stage, screen behind him — total transformation from the withdrawn interview kid to a confident performer; the crowd is young and hyped.
- **[41:25 / 42:37] Yo-yo community:** Bryan surrounded by a group of teen/young-adult friends on stage, plus little kids — a visible, tight subculture. This "found family" is the emotional payoff shot.
- **[43:12] Sharon's trophy:** gold trophy, plate reading **"iEntrepreneur100 — Award Winner for the Year 2023,"** with a photo of her receiving it behind. Concrete proof of the "found her niche" arc.
- **[43:50] Inch's award:** on a large stage receiving an **"Artistic Excellence Award"** flanked by men in suits (official-looking ceremony).
- **[44:23 / 44:51] Inch's studio:** child's hand on an RGB gaming mouse (a gaming beat that ties to the parents' "let him game" thread), then Inch in a red **"ROYALE" gaming chair** in a home music studio packed with monitors (a DAW open), synths, a pink electric guitar, MIDI keyboards — visually asserting dyslexia + creative-tech mastery.
- **[45:45] Credits:** TEDxWomen stage footage; CNA Insider branding; editors credited.

---

## 5. PAIN POINTS, CATEGORIZED

### A. Personal / Emotional

| Pain point | Timestamps | Severity / frequency signal |
|---|---|---|
| **Shame / worthlessness** — internalised "I can't read so I'm useless/inferior." | 05:08 ("I only hear shame"), 18:27, 45:04 | Recurring across *every* adult subject; the film's title quote. Highest-weight emotional theme. |
| **Reading aloud in class = dread/anxiety.** | 11:35 ("my nightmare"), 22:35, 25:42, 25:58, 36:38 | Named by Inch, Shazriel, and implied for others — spans a 9-yr-old to adults. Shazriel goes mute to avoid peer judgment. |
| **Persistent anxiety into adulthood / afraid to speak up.** | 39:08 (Bryan), 05:29 (Sharon) | Explicitly "even now doing work." Long-tail effect. |
| **Loneliness / social isolation in school.** | 17:25 ("always alone"), 16:56 (copying work made peers dislike her), 41:55 (Bryan isolated "because he's a bit different") | Multiple subjects, childhood-rooted. |
| **"Always behind / playing catch-up."** | 12:22 | Framed as a lifelong worry Inch puts to the expert. |
| **Parental guilt & grief.** | 18:40 (Inch's mum), 32:23, 32:44 | Parents carry "it's our fault" guilt; mums tear up. |

### B. Educational / Systemic

| Pain point | Timestamps | Severity / frequency signal |
|---|---|---|
| **Decoding ≠ comprehension** — can read words aloud but retain/understand nothing ("barking at print," karaoke ball). | 08:15, 09:08, 09:32 | Stated by the *expert* as the core mechanism. Central. |
| **Late diagnosis.** | 06:09 (Sharon 37), 15:25 (Inch ~23), 31:23 (He-Man 40+) | 3 of 3 adults diagnosed as adults — a systemic miss for their generation. |
| **Support "cliff" — SDR ends at Primary 4.** | 25:10, 26:19, 27:14 | Kids lose the one class they love; teachers work to reframe it. |
| **Writing & spelling output, not just reading.** | 00:48 (can't structure sentences), 30:23 (He-Man capitals only), 08:48 (spelling taxes memory) | Distinct axis from reading; shown repeatedly. |
| **Word retrieval / expressive language / public speaking.** | 05:29, 06:17–06:46 ("can't find the words") | Sharon's whole arc; expert-explained. |
| **Cue cards / small text / dense worksheets are unusable.** | 02:49 ("words jump because the card is small") | Concrete task failure. |
| **Mother-tongue (Chinese) with zero accommodation.** | 38:21 (Bryan, zero marks, teacher tore paper) | A second-language failure layer + abuse. |
| **Academically-driven environment; streaming stigma (Foundation vs Standard, Express).** | 17:52, 27:27, 32:01 ("odds stacked against dyslexic students in the academically driven school environment") | Structural; PSLE/streaming named. |
| **Speed-reading / generic remediation that doesn't work.** | 14:01 ("didn't really yield the results we hoped for") | A failed intervention shown, not just implied. |

### C. Societal / Cultural

| Pain point | Timestamps | Severity / frequency signal |
|---|---|---|
| **Bullying — pervasive.** | 34:36, 36:38, 37:26, 37:44 | **70% of DAS-attending kids bullied** (2023 survey, 37:02). Highest-frequency societal harm in the film. |
| **Teacher stigma / verbal abuse.** | 04:00, 30:08 ("are you trying to be funny"), 38:21 (tearing the paper) | Multiple named incidents; teachers as *sources* of harm, not just bystanders. |
| **"Stupid / naughty / lazy" mislabeling.** | 30:08, 34:54, 36:53, 45:04 | The film's thesis ("I'm Not Stupid, I'm Dyslexic"). |
| **Downstream: dropout → drugs → gangs → incarceration.** | 34:30, 35:21 (UK: 30%+ of prisoners dyslexic), 35:55 | Presented as the extreme cost of unaddressed dyslexia + bullying. |
| **"Hidden disability" — invisibility / low public awareness.** | 02:05, 12:47 ("stigma… continues to exist") | Framed as the film's reason to exist ("but is it enough?"). |
| **Teachers don't check in / no dialogue.** | 38:08 | Bryan generalises it. |

---

## 6. EXISTING SUPPORT SYSTEMS SHOWN

| Support | What it is | How it's shown to help | Limitation / gap shown or implied |
|---|---|---|---|
| **P1 English-literacy screening** | All Primary-1 students screened for literacy skills. | Entry point that routes kids to support. | Only catches those who struggle *early in English*; adults in the film (pre-dates this) all slipped through → diagnosed at 23/37/40+. |
| **Learning Support Programme (LSP)** | 30 min/day after school, small class of 8–10, reading + spelling. | Earlier, lighter-touch tier before a dyslexia check. | Generic literacy support, not dyslexia-specific; a P2 re-check is needed to escalate. |
| **School-based Dyslexia Remediation Programme (SDR)** | P3–4, 3×/week after school, **4–6 students**, Orton-Gillingham-style word breakdown (phonemes, "ie" vowel pairs, "-ed" endings). | Shazriel: "a switch flips," more initiative, more vocal, less anxious; it's his *favourite* part of school ("coming to this class"). The **small class size** itself is the therapeutic ingredient (safe space, less peer-judgment fear). | **Ends at Primary 4** — a hard support cliff (25:10). Only 3×/week, after regular school (fatigue/long hours). Doesn't fix everything ("not a miracle," 27:37). |
| **P5 Reading Remediation Programme** | Follow-on reading support after SDR ends. | Named as continued support so "support [doesn't] end" at P4. | Reading-only; the beloved small-group SDR structure is gone. |
| **Foundation English (vs Standard) at PSLE** | Lower-tier syllabus pitched at a comfortable level. | Lets dyslexic students take exams at their level. | A **streaming** mechanism — carries its own stigma (17:52, 32:01); pitched *down*, not accommodated *up*. |
| **Dyslexia Association of Singapore (DAS)** | The referenced authority; runs classes kids attend; ran the 2023 bullying survey. | Source of prevalence + bullying data; implied service provider. | Not profiled directly; the 70%-bullied stat suggests attending DAS ≠ protection from bullying. |
| **Colour-overlay / coloured-text reading aids** | Sharon's monitor shows coloured text blocks (visual). | Implied reading assistance for "moving words." | Shown, never explained; effectiveness not stated. |
| **Speed-reading classes** (private) | Parents paid for speed-reading lessons for young Inch. | She "picked up a trick or two" to read at a better pace. | **"Didn't really yield the results we all hoped for"** (14:10) — an explicitly *failed* intervention. |
| **Personal coping strategies** | Inch: word-shape guessing, road-sign colours, landmarks, driving in silence; copying classmates' work as a child; He-Man cooking to memorise; He-Man writing only in capitals; the subject who **draws pictures** instead of writing sentences. | Each lets the person function in daily life / their trade. | Fragile workarounds: Inch **misses turns** while driving (15:07); copying work damaged peer relationships (17:20); capitals-only writing drew teacher punishment (30:31). |
| **Family / parent strategies** | Road trips to spark interest (history), allowing more gaming, **homeschooling** (Jamie, since last Jan), letting kids pursue art/gardening. | Kids find strengths outside academics (one son → IT security). | Ad hoc, resource-dependent (a parent who can homeschool / travel); reactive to school not fitting. |
| **Public-speaking course (adult, 9-week)** | Community course Sharon took; props/storytelling to aid memory. | Practice + a supportive coach ("it's good to be nervous"). | Sharon **didn't win**; explicitly a slow, fall-down-repeatedly process. |
| **Hobby / niche communities** | Yo-yo community (Bryan); music/theatre (Inch); ceramics + cheffing (He-Man). | The strongest positive force in the film — **confidence, identity, "found family."** Bryan's peers rally around him. | Entirely **outside** the school system; luck/passion-dependent; not a designed intervention. |

---

## 7. NUMBERS AND CLAIMS

Flagged by who asserts it. Fact-check all before pitch use.

| Claim | Exact wording (approx., from captions) | Time | Source flag |
|---|---|---|---|
| Prevalence (SG) | "One in every 10 people in Singapore are like me." | 01:59 | **Narration (Inch)**; on-screen source card: **Dyslexia Association of Singapore**. |
| Not intelligence | "It's neurological in origin… it's not about intelligence." | 07:58 | **Expert** (Dr. Githa). |
| Prevalence (general) | Dyslexia "affects between **3 to 10%** of the population." | 28:04 | **Narration.** |
| SG student count | "About **20,000** primary and secondary students are dyslexic." | 27:55 | **Narration.** |
| Sharon's diagnosis age | "Formally diagnosed only when she was **37**." | 06:09 | **Narration.** |
| Inch's diagnosis age | "This is me when I was **23**… around the time I was diagnosed." | 15:25 | **Narration (Inch).** |
| Inch left primary school | "It's been **26 years** since I left primary school." | 19:20 | **Narration (Inch).** |
| UK incarceration | "In the UK… people who are incarcerated, **more than 30%** of them are actually dyslexic." | 35:21 / 35:44 | Said by **a parent**, then repeated by **Inch**; on-screen source: **Prison Reform Trust, UK**. |
| Bullying survey | "In a **2023** survey by the **Dyslexia Association of Singapore**, **70%** of parents with kids attending DAS said their child had been bullied before." | 37:02 | **Narration**; attributed to DAS 2023 survey. |
| He-Man's output | "Author of **seven books**, an award-winning ceramic artist, and a well-decorated chef"; "about **40 years**" a chef. | 29:15 / 29:41 | **Narration** + He-Man. |
| He-Man's exhibition | "Preparing **50 pieces** for an upcoming exhibition that will raise funds for charity." | 43:23 | **Narration.** |
| Bryan's rise | "In just **8 years** after picking up the sport, Bryan is now the national champion of two-handed yo-yoing." | 43:33 | **Narration.** |
| Strengths study | Dyslexia "associated with strengths like high-level reasoning and visual-spatial abilities, memory and problem-solving, and… highly creative." | 28:40 | **Narration**, cites "**this study**" (unnamed on-screen). |
| SDR class size | "Classes are intentionally kept small — just **four to six** students." | 23:25 | **Narration.** |
| LSP class size | Smaller class of "**8 to 10** students," "**30 minutes** every day after school." | 19:41 | **Narration.** |
| Famous dyslexics | "Edison… Einstein… Jamie Oliver." | 33:02 | **A parent** relaying a family doctor's remark (anecdotal). |

> ⚠️ Pitch-hygiene flags: "1 in 10" (Inch/DAS) vs "3–10%" (narration) are stated as
> different figures in the same film — reconcile before quoting. The UK-prison 30%
> figure is a *UK* number applied rhetorically to a Singapore story; the "20,000
> students" and "50 pieces / 8 years / 40 years" numbers are narration, not sourced
> on-screen. "This study" (strengths) is uncited.

---

## 8. CROSS-REFERENCE AGAINST OUR PROJECT

Our three features (per ARCHITECTURE.md §1): **Exam-Prep** (point→OCR→TTS verbatim→karaoke
highlight, no LLM), **AI Tutoring** (ask a question→vision model→step-by-step narration
with region highlights), **Stuck-Word Autopsy + Trace-to-Unlock** (tap stuck word→speak
it→grapheme sound-out from static phoneme bank→finger-trace verification).

Each item below is exactly one of **VALIDATES / GAP / CONTRADICTS**.

---

**1. Jumbled/moving letters, decode word-by-word** *(01:31, 06:59, 07:35 "raed" graphic)*
→ **VALIDATES — Exam-Prep + Autopsy.** Point-to-read gives a single OCR word on demand
with a karaoke highlight anchoring the eye to exactly one word (ARCHITECTURE.md §7.5,
§8), directly countering "words move / I lose my place." Autopsy's grapheme sub-boxes
match the SDR word-breakdown method shown at 23:36.

**2. "Reading aloud in class is my nightmare"; goes mute to avoid peer judgment** *(11:35, 22:35, 25:58, 36:38)*
→ **VALIDATES — Autopsy + Exam-Prep.** Both are private, self-paced, one-student
interactions on the student's own worksheet — exactly the "safe space / small class"
quality the SDR teachers credit (24:53, 26:28). The app *is* a class of one.

**3. Decoding ≠ comprehension — "I can read the karaoke words but can't tell you what I just read"** *(08:15, 09:08–09:32, expert-stated)*
→ **CONTRADICTS / complicates a core assumption.** Our Exam-Prep guarantee is that TTS
speaks **"the OCR text VERBATIM — no model may generate, rewrite, or filter it"**
(ARCHITECTURE.md §5.4, §7.3; CLAUDE.md rule 3). The documentary's central expert
mechanism is that reading words aloud *is the thing dyslexics can already do* while
**comprehension is what fails** (09:25: "if you just ask me what I just read, I will not
be able to tell you anything about it"). Our karaoke highlight is *literally the bouncing
ball* Inch names as the thing that produces zero retention (09:15). So Exam-Prep as
specced may faithfully reproduce the read-aloud step **without touching the actual
deficit.** This is not a reason to break the no-LLM rule on the read-aloud path — it's a
flag that comprehension support is a *separate* need the verbatim path structurally can't
serve, and only **AI Tutoring** currently addresses meaning. Worth an explicit brainstorm.

**4. Writing & spelling as *output* — can't structure sentences; draws pictures; capitals-only** *(00:48, 08:48, 30:23)*
→ **GAP.** All three features are **reading-input** tools (OCR text → speech / trace).
None help a student *produce* written or spelled output. Spelling is named by the expert
as a distinct, harder task (08:48) and is central to the SDR class (23:36), yet we have no
spelling-practice or writing-scaffold feature.

**5. Word retrieval / expressive language / public speaking — "rich universe of thought, can't find the words"** *(05:29, 06:17–06:46)*
→ **GAP.** Sharon's entire arc is *expressive* (speaking/articulating), not decoding.
Nothing in Exam-Prep, Tutoring, or Autopsy supports word-finding or spoken output.

**6. Math / number & letter reversals; spatial-temporal difficulty** *(10:02, 32:41)*
→ **GAP.** Dyscalculia-adjacent reversals and spatial-temporal issues are named by both
the expert and a parent. Our features are text/word-centric; there is no numeric or
math-worksheet support (note: this is the "500+800" territory from the team's *previous*
brainstorm — the doc only *mentions* number reversals, it doesn't show a math scene).

**7. Shame, "I'm useless/stupid," lifelong low confidence** *(05:08, 18:27, 45:04)*
→ **GAP.** The film's single loudest theme is emotional/identity harm. None of the three
features do confidence-building, encouragement, or emotional framing. (Adjacent: our
analytics/Telegram copy is constrained to be "indicators, never emotional or clinical
claims" — CLAUDE.md — so even the reporting layer deliberately stays neutral. The
*student-facing* affective gap is unaddressed.)

**8. Bullying, especially around reading aloud + the isolation it causes** *(36:38, 37:02 "70%", 41:55)*
→ **GAP.** We reduce *public* reading exposure (feature 2 above), which indirectly helps,
but nothing addresses the social/bullying dimension. Note this only as an adjacent benefit,
not a feature.

**9. Reading-aloud anxiety specifically at the moment of being *called on*** *(25:42 "helping me with my anxiety when I get scared when I was supposed to read")*
→ **VALIDATES — Autopsy.** Autopsy lets a student privately sound out the exact word
they're stuck on (static phoneme bank, then whole word, then trace) *before* any public
moment — pre-loading the word Shazriel would freeze on.

**10. Mother-tongue (Chinese) failure with zero accommodation** *(38:21)*
→ **GAP (and a scope flag).** Our OCR/TTS/phoneme stack is English-oriented (Azure Speech,
English phoneme bank in `/public/phonemes/`, ARCHITECTURE.md §2). Bryan's worst abuse was
in **Chinese**. Non-English scripts are entirely outside current scope — worth naming as a
deliberate boundary, not an accidental one.

**11. Late diagnosis / screening** *(06:09, 15:25, 31:23)*
→ **GAP (by design).** Screening happens at P1 in-school (19:33); we are an *assistive*
tool for already-identified students, not a screener. Fine as scope — just don't claim to
help detection.

**12. Support cliff — SDR/remediation ends at P4; the beloved small class disappears** *(25:10, 26:19)*
→ **VALIDATES (positioning, not a feature).** An always-available phone app is exactly the
kind of support that *doesn't* expire at P4. This is a pitch angle our product structurally
supports even though no single feature was built "for" it.

**13. Strengths are visual-spatial, hands-on, pattern-linking; kids thrive doing/making** *(28:40, 30:49 "physically I need to cook," 44:42 "link disparate ideas")*
→ **CONTRADICTS / complicates an assumption.** Our whole interaction model is
**text-on-a-worksheet → read it** (ARCHITECTURE.md §8). The documentary's strengths thesis
is that dyslexic learning is *hands-on, visual, and multimodal* — He-Man learns by cooking,
not reading; the subject at 00:48 **draws pictures instead of writing**. Trace-to-Unlock's
physical finger-tracing (§8 Autopsy) is our one nod to kinaesthetic learning and it aligns
well — but Exam-Prep and Tutoring assume the worksheet's *text* is the unit of learning,
which the film pushes against. Flag for brainstorm: are we over-indexed on decoding text
when the evidenced strengths are visual/kinaesthetic?

**14. Generic remediation (speed-reading) that "didn't yield results"** *(14:10)*
→ **VALIDATES (differentiation).** A shown-to-fail one-size intervention supports our
per-word, point-driven, verbatim, phoneme-accurate approach — *if* we can show it's
different. (Caveat this against item 3: "different" must include a comprehension answer.)

---

*End of extraction. No solutions proposed here per brief — brainstorm happens elsewhere.*
