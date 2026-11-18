"""Canonical 114-Surah Quran metadata and deterministic reference validation."""

from __future__ import annotations

import re
from dataclasses import dataclass

TOTAL_SURAHS = 114
TOTAL_AYAHS = 6236

_BISMILLAH_PREFIXES: tuple[str, ...] = (
    "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ",
    "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
    "بسم الله الرحمن الرحيم",
)

# Simple regexes (low cognitive complexity) for reference extraction
_URL_STRIP_RE = re.compile(r"[a-z]+://\S+", re.IGNORECASE)
_REF_OR_RANGE_RE = re.compile(
    r"(?<![\d.:])(\d{1,4})\s*:\s*(\d{1,4})(?!\d)"
    r"(?:\s*[-–]\s*(\d{1,4})(?!\d)(?!\s*:\s*\d)(?!\s*(?:[ap]\.?m\.?|utc|gmt)\b))?"
    r"(?!\s*:\s*\d)"
    r"(?!\s*[-–]\s*\d+\s*:\s*\d)"
    r"(?!\s*(?:[ap]\.?m\.?|utc|gmt)\b)",
    re.IGNORECASE,
)
_WORD_REF_RE = re.compile(
    r"\b(?:surah|sura|chapter)\s+(\d{1,4})\s*,?\s*(?:ayahs?|ayat|verses?)\s+(\d{1,4})(?!\d)"
    r"(?:\s*[-–]\s*(\d{1,4})(?!\d))?",
    re.IGNORECASE,
)
_SURAH_MENTION_RE = re.compile(
    r"\b(?:surah|sura|chapter)\s+(\d{1,4})\b",
    re.IGNORECASE,
)
_PUNCT_RE = re.compile(r"[-'’`\s]+")


@dataclass(frozen=True, slots=True)
class SurahMeta:
    """Canonical metadata for one Surah of the Quran."""

    number: int
    arabic_name: str
    arabic_full_name: str
    english_name: str
    alquran_name: str
    english_translation: str
    revelation_type: str
    revelation_order: int
    ayah_count: int
    juz_start: int
    page_start: int


_RAW_SURAHS: tuple[tuple[int, str, str, str, str, str, str, int, int, int, int], ...] = (
    (1, "الفاتحة", "سُورَةُ ٱلْفَاتِحَةِ", "Al-Fatihah", "Al-Faatiha", "The Opening", "Meccan", 5, 7, 1, 1),
    (2, "البقرة", "سُورَةُ البَقَرَةِ", "Al-Baqarah", "Al-Baqara", "The Cow", "Medinan", 87, 286, 1, 2),
    (3, "آل عمران", "سُورَةُ آلِ عِمۡرَانَ", "Ali 'Imran", "Aal-i-Imraan", "The Family of Imraan", "Medinan", 89, 200, 3, 50),
    (4, "النساء", "سُورَةُ النِّسَاءِ", "An-Nisa", "An-Nisaa", "The Women", "Medinan", 92, 176, 4, 77),
    (5, "المائدة", "سُورَةُ المَائـِدَةِ", "Al-Ma'idah", "Al-Maaida", "The Table", "Medinan", 112, 120, 6, 106),
    (6, "الأنعام", "سُورَةُ الأَنۡعَامِ", "Al-An'am", "Al-An'aam", "The Cattle", "Meccan", 55, 165, 7, 128),
    (7, "الأعراف", "سُورَةُ الأَعۡرَافِ", "Al-A'raf", "Al-A'raaf", "The Heights", "Meccan", 39, 206, 8, 151),
    (8, "الأنفال", "سُورَةُ الأَنفَالِ", "Al-Anfal", "Al-Anfaal", "The Spoils of War", "Medinan", 88, 75, 9, 177),
    (9, "التوبة", "سُورَةُ التَّوۡبَةِ", "At-Tawbah", "At-Tawba", "The Repentance", "Medinan", 113, 129, 10, 187),
    (10, "يونس", "سُورَةُ يُونُسَ", "Yunus", "Yunus", "Jonas", "Meccan", 51, 109, 11, 208),
    (11, "هود", "سُورَةُ هُودٍ", "Hud", "Hud", "Hud", "Meccan", 52, 123, 11, 221),
    (12, "يوسف", "سُورَةُ يُوسُفَ", "Yusuf", "Yusuf", "Joseph", "Meccan", 53, 111, 12, 235),
    (13, "الرعد", "سُورَةُ الرَّعۡدِ", "Ar-Ra'd", "Ar-Ra'd", "The Thunder", "Medinan", 96, 43, 13, 249),
    (14, "ابراهيم", "سُورَةُ إِبۡرَاهِيمَ", "Ibrahim", "Ibrahim", "Abraham", "Meccan", 72, 52, 13, 255),
    (15, "الحجر", "سُورَةُ الحِجۡرِ", "Al-Hijr", "Al-Hijr", "The Rock", "Meccan", 54, 99, 14, 262),
    (16, "النحل", "سُورَةُ النَّحۡلِ", "An-Nahl", "An-Nahl", "The Bee", "Meccan", 70, 128, 14, 267),
    (17, "الإسراء", "سُورَةُ الإِسۡرَاءِ", "Al-Isra", "Al-Israa", "The Night Journey", "Meccan", 50, 111, 15, 282),
    (18, "الكهف", "سُورَةُ الكَهۡفِ", "Al-Kahf", "Al-Kahf", "The Cave", "Meccan", 69, 110, 15, 293),
    (19, "مريم", "سُورَةُ مَرۡيَمَ", "Maryam", "Maryam", "Mary", "Meccan", 44, 98, 16, 305),
    (20, "طه", "سُورَةُ طه", "Taha", "Taa-Haa", "Taa-Haa", "Meccan", 45, 135, 16, 312),
    (21, "الأنبياء", "سُورَةُ الأَنبِيَاءِ", "Al-Anbya", "Al-Anbiyaa", "The Prophets", "Meccan", 73, 112, 17, 322),
    (22, "الحج", "سُورَةُ الحَجِّ", "Al-Hajj", "Al-Hajj", "The Pilgrimage", "Medinan", 103, 78, 17, 332),
    (23, "المؤمنون", "سُورَةُ المُؤۡمِنُونَ", "Al-Mu'minun", "Al-Muminoon", "The Believers", "Meccan", 74, 118, 18, 342),
    (24, "النور", "سُورَةُ النُّورِ", "An-Nur", "An-Noor", "The Light", "Medinan", 102, 64, 18, 350),
    (25, "الفرقان", "سُورَةُ الفُرۡقَانِ", "Al-Furqan", "Al-Furqaan", "The Criterion", "Meccan", 42, 77, 18, 359),
    (26, "الشعراء", "سُورَةُ الشُّعَرَاءِ", "Ash-Shu'ara", "Ash-Shu'araa", "The Poets", "Meccan", 47, 227, 19, 367),
    (27, "النمل", "سُورَةُ النَّمۡلِ", "An-Naml", "An-Naml", "The Ant", "Meccan", 48, 93, 19, 377),
    (28, "القصص", "سُورَةُ القَصَصِ", "Al-Qasas", "Al-Qasas", "The Stories", "Meccan", 49, 88, 20, 385),
    (29, "العنكبوت", "سُورَةُ العَنكَبُوتِ", "Al-'Ankabut", "Al-Ankaboot", "The Spider", "Meccan", 85, 69, 20, 396),
    (30, "الروم", "سُورَةُ الرُّومِ", "Ar-Rum", "Ar-Room", "The Romans", "Meccan", 84, 60, 21, 404),
    (31, "لقمان", "سُورَةُ لُقۡمَانَ", "Luqman", "Luqman", "Luqman", "Meccan", 57, 34, 21, 411),
    (32, "السجدة", "سُورَةُ السَّجۡدَةِ", "As-Sajdah", "As-Sajda", "The Prostration", "Meccan", 75, 30, 21, 415),
    (33, "الأحزاب", "سُورَةُ الأَحۡزَابِ", "Al-Ahzab", "Al-Ahzaab", "The Clans", "Medinan", 90, 73, 21, 418),
    (34, "سبإ", "سُورَةُ سَبَإٍ", "Saba", "Saba", "Sheba", "Meccan", 58, 54, 22, 428),
    (35, "فاطر", "سُورَةُ فَاطِرٍ", "Fatir", "Faatir", "The Originator", "Meccan", 43, 45, 22, 434),
    (36, "يس", "سُورَةُ يسٓ", "Ya-Sin", "Yaseen", "Yaseen", "Meccan", 41, 83, 22, 440),
    (37, "الصافات", "سُورَةُ الصَّافَّاتِ", "As-Saffat", "As-Saaffaat", "Those drawn up in Ranks", "Meccan", 56, 182, 23, 446),
    (38, "ص", "سُورَةُ صٓ", "Sad", "Saad", "The letter Saad", "Meccan", 38, 88, 23, 453),
    (39, "الزمر", "سُورَةُ الزُّمَرِ", "Az-Zumar", "Az-Zumar", "The Groups", "Meccan", 59, 75, 23, 458),
    (40, "غافر", "سُورَةُ غَافِرٍ", "Ghafir", "Ghafir", "The Forgiver", "Meccan", 60, 85, 24, 467),
    (41, "فصلت", "سُورَةُ فُصِّلَتۡ", "Fussilat", "Fussilat", "Explained in detail", "Meccan", 61, 54, 24, 477),
    (42, "الشورى", "سُورَةُ الشُّورَىٰ", "Ash-Shuraa", "Ash-Shura", "Consultation", "Meccan", 62, 53, 25, 483),
    (43, "الزخرف", "سُورَةُ الزُّخۡرُفِ", "Az-Zukhruf", "Az-Zukhruf", "Ornaments of gold", "Meccan", 63, 89, 25, 489),
    (44, "الدخان", "سُورَةُ الدُّخَانِ", "Ad-Dukhan", "Ad-Dukhaan", "The Smoke", "Meccan", 64, 59, 25, 496),
    (45, "الجاثية", "سُورَةُ الجَاثِيَةِ", "Al-Jathiyah", "Al-Jaathiya", "Crouching", "Meccan", 65, 37, 25, 499),
    (46, "الأحقاف", "سُورَةُ الأَحۡقَافِ", "Al-Ahqaf", "Al-Ahqaf", "The Dunes", "Meccan", 66, 35, 26, 502),
    (47, "محمد", "سُورَةُ مُحَمَّدٍ", "Muhammad", "Muhammad", "Muhammad", "Medinan", 95, 38, 26, 507),
    (48, "الفتح", "سُورَةُ الفَتۡحِ", "Al-Fath", "Al-Fath", "The Victory", "Medinan", 111, 29, 26, 511),
    (49, "الحجرات", "سُورَةُ الحُجُرَاتِ", "Al-Hujurat", "Al-Hujuraat", "The Inner Apartments", "Medinan", 106, 18, 26, 515),
    (50, "ق", "سُورَةُ قٓ", "Qaf", "Qaaf", "The letter Qaaf", "Meccan", 34, 45, 26, 518),
    (51, "الذاريات", "سُورَةُ الذَّارِيَاتِ", "Adh-Dhariyat", "Adh-Dhaariyat", "The Winnowing Winds", "Meccan", 67, 60, 26, 520),
    (52, "الطور", "سُورَةُ الطُّورِ", "At-Tur", "At-Tur", "The Mount", "Meccan", 76, 49, 27, 523),
    (53, "النجم", "سُورَةُ النَّجۡمِ", "An-Najm", "An-Najm", "The Star", "Meccan", 23, 62, 27, 526),
    (54, "القمر", "سُورَةُ القَمَرِ", "Al-Qamar", "Al-Qamar", "The Moon", "Meccan", 37, 55, 27, 528),
    (55, "الرحمن", "سُورَةُ الرَّحۡمَٰن", "Ar-Rahman", "Ar-Rahmaan", "The Beneficent", "Medinan", 97, 78, 27, 531),
    (56, "الواقعة", "سُورَةُ الوَاقِعَةِ", "Al-Waqi'ah", "Al-Waaqia", "The Inevitable", "Meccan", 46, 96, 27, 534),
    (57, "الحديد", "سُورَةُ الحَدِيدِ", "Al-Hadid", "Al-Hadid", "The Iron", "Medinan", 94, 29, 27, 537),
    (58, "المجادلة", "سُورَةُ المُجَادلَةِ", "Al-Mujadila", "Al-Mujaadila", "The Pleading Woman", "Medinan", 105, 22, 28, 542),
    (59, "الحشر", "سُورَةُ الحَشۡرِ", "Al-Hashr", "Al-Hashr", "The Exile", "Medinan", 101, 24, 28, 545),
    (60, "الممتحنة", "سُورَةُ المُمۡتَحنَةِ", "Al-Mumtahanah", "Al-Mumtahana", "She that is to be examined", "Medinan", 91, 13, 28, 549),
    (61, "الصف", "سُورَةُ الصَّفِّ", "As-Saf", "As-Saff", "The Ranks", "Medinan", 109, 14, 28, 551),
    (62, "الجمعة", "سُورَةُ الجُمُعَةِ", "Al-Jumu'ah", "Al-Jumu'a", "Friday", "Medinan", 110, 11, 28, 553),
    (63, "المنافقون", "سُورَةُ المُنَافِقُونَ", "Al-Munafiqun", "Al-Munaafiqoon", "The Hypocrites", "Medinan", 104, 11, 28, 554),
    (64, "التغابن", "سُورَةُ التَّغَابُنِ", "At-Taghabun", "At-Taghaabun", "Mutual Disillusion", "Medinan", 108, 18, 28, 556),
    (65, "الطلاق", "سُورَةُ الطَّلَاقِ", "At-Talaq", "At-Talaaq", "Divorce", "Medinan", 99, 12, 28, 558),
    (66, "التحريم", "سُورَةُ التَّحۡرِيمِ", "At-Tahrim", "At-Tahrim", "The Prohibition", "Medinan", 107, 12, 28, 560),
    (67, "الملك", "سُورَةُ المُلۡكِ", "Al-Mulk", "Al-Mulk", "The Sovereignty", "Meccan", 77, 30, 29, 562),
    (68, "القلم", "سُورَةُ القَلَمِ", "Al-Qalam", "Al-Qalam", "The Pen", "Meccan", 2, 52, 29, 564),
    (69, "الحاقة", "سُورَةُ الحَاقَّةِ", "Al-Haqqah", "Al-Haaqqa", "The Reality", "Meccan", 78, 52, 29, 566),
    (70, "المعارج", "سُورَةُ المَعَارِجِ", "Al-Ma'arij", "Al-Ma'aarij", "The Ascending Stairways", "Meccan", 79, 44, 29, 568),
    (71, "نوح", "سُورَةُ نُوحٍ", "Nuh", "Nooh", "Noah", "Meccan", 71, 28, 29, 570),
    (72, "الجن", "سُورَةُ الجِنِّ", "Al-Jinn", "Al-Jinn", "The Jinn", "Meccan", 40, 28, 29, 572),
    (73, "المزمل", "سُورَةُ المُزَّمِّلِ", "Al-Muzzammil", "Al-Muzzammil", "The Enshrouded One", "Meccan", 3, 20, 29, 574),
    (74, "المدثر", "سُورَةُ المُدَّثِّرِ", "Al-Muddaththir", "Al-Muddaththir", "The Cloaked One", "Meccan", 4, 56, 29, 575),
    (75, "القيامة", "سُورَةُ القِيَامَةِ", "Al-Qiyamah", "Al-Qiyaama", "The Resurrection", "Meccan", 31, 40, 29, 577),
    (76, "الانسان", "سُورَةُ الإِنسَانِ", "Al-Insan", "Al-Insaan", "Man", "Medinan", 98, 31, 29, 578),
    (77, "المرسلات", "سُورَةُ المُرۡسَلَاتِ", "Al-Mursalat", "Al-Mursalaat", "The Emissaries", "Meccan", 33, 50, 29, 580),
    (78, "النبإ", "سُورَةُ النَّبَإِ", "An-Naba", "An-Naba", "The Announcement", "Meccan", 80, 40, 30, 582),
    (79, "النازعات", "سُورَةُ النَّازِعَاتِ", "An-Nazi'at", "An-Naazi'aat", "Those who drag forth", "Meccan", 81, 46, 30, 583),
    (80, "عبس", "سُورَةُ عَبَسَ", "'Abasa", "Abasa", "He frowned", "Meccan", 24, 42, 30, 585),
    (81, "التكوير", "سُورَةُ التَّكۡوِيرِ", "At-Takwir", "At-Takwir", "The Overthrowing", "Meccan", 7, 29, 30, 586),
    (82, "الإنفطار", "سُورَةُ الانفِطَارِ", "Al-Infitar", "Al-Infitaar", "The Cleaving", "Meccan", 82, 19, 30, 587),
    (83, "المطففين", "سُورَةُ المُطَفِّفِينَ", "Al-Mutaffifin", "Al-Mutaffifin", "Defrauding", "Meccan", 86, 36, 30, 587),
    (84, "الإنشقاق", "سُورَةُ الانشِقَاقِ", "Al-Inshiqaq", "Al-Inshiqaaq", "The Splitting Open", "Meccan", 83, 25, 30, 589),
    (85, "البروج", "سُورَةُ البُرُوجِ", "Al-Buruj", "Al-Burooj", "The Constellations", "Meccan", 27, 22, 30, 590),
    (86, "الطارق", "سُورَةُ الطَّارِقِ", "At-Tariq", "At-Taariq", "The Morning Star", "Meccan", 36, 17, 30, 591),
    (87, "الأعلى", "سُورَةُ الأَعۡلَىٰ", "Al-A'la", "Al-A'laa", "The Most High", "Meccan", 8, 19, 30, 591),
    (88, "الغاشية", "سُورَةُ الغَاشِيَةِ", "Al-Ghashiyah", "Al-Ghaashiya", "The Overwhelming", "Meccan", 68, 26, 30, 592),
    (89, "الفجر", "سُورَةُ الفَجۡرِ", "Al-Fajr", "Al-Fajr", "The Dawn", "Meccan", 10, 30, 30, 593),
    (90, "البلد", "سُورَةُ البَلَدِ", "Al-Balad", "Al-Balad", "The City", "Meccan", 35, 20, 30, 594),
    (91, "الشمس", "سُورَةُ الشَّمۡسِ", "Ash-Shams", "Ash-Shams", "The Sun", "Meccan", 26, 15, 30, 595),
    (92, "الليل", "سُورَةُ اللَّيۡلِ", "Al-Layl", "Al-Lail", "The Night", "Meccan", 9, 21, 30, 595),
    (93, "الضحى", "سُورَةُ الضُّحَىٰ", "Ad-Duhaa", "Ad-Dhuhaa", "The Morning Hours", "Meccan", 11, 11, 30, 596),
    (94, "الشرح", "سُورَةُ الشَّرۡحِ", "Ash-Sharh", "Ash-Sharh", "The Consolation", "Meccan", 12, 8, 30, 596),
    (95, "التين", "سُورَةُ التِّينِ", "At-Tin", "At-Tin", "The Fig", "Meccan", 28, 8, 30, 597),
    (96, "العلق", "سُورَةُ العَلَقِ", "Al-'Alaq", "Al-Alaq", "The Clot", "Meccan", 1, 19, 30, 597),
    (97, "القدر", "سُورَةُ القَدۡرِ", "Al-Qadr", "Al-Qadr", "The Power, Fate", "Meccan", 25, 5, 30, 598),
    (98, "البينة", "سُورَةُ البَيِّنَةِ", "Al-Bayyinah", "Al-Bayyina", "The Evidence", "Medinan", 100, 8, 30, 598),
    (99, "الزلزلة", "سُورَةُ الزَّلۡزَلَةِ", "Az-Zalzalah", "Az-Zalzala", "The Earthquake", "Medinan", 93, 8, 30, 599),
    (100, "العاديات", "سُورَةُ العَادِيَاتِ", "Al-'Adiyat", "Al-Aadiyaat", "The Chargers", "Meccan", 14, 11, 30, 599),
    (101, "القارعة", "سُورَةُ القَارِعَةِ", "Al-Qari'ah", "Al-Qaari'a", "The Calamity", "Meccan", 30, 11, 30, 600),
    (102, "التكاثر", "سُورَةُ التَّكَاثُرِ", "At-Takathur", "At-Takaathur", "Competition", "Meccan", 16, 8, 30, 600),
    (103, "العصر", "سُورَةُ العَصۡرِ", "Al-'Asr", "Al-Asr", "The Declining Day, Epoch", "Meccan", 13, 3, 30, 601),
    (104, "الهمزة", "سُورَةُ الهُمَزَةِ", "Al-Humazah", "Al-Humaza", "The Traducer", "Meccan", 32, 9, 30, 601),
    (105, "الفيل", "سُورَةُ الفِيلِ", "Al-Fil", "Al-Fil", "The Elephant", "Meccan", 19, 5, 30, 601),
    (106, "قريش", "سُورَةُ قُرَيۡشٍ", "Quraysh", "Quraish", "Quraysh", "Meccan", 29, 4, 30, 602),
    (107, "الماعون", "سُورَةُ المَاعُونِ", "Al-Ma'un", "Al-Maa'un", "Almsgiving", "Meccan", 17, 7, 30, 602),
    (108, "الكوثر", "سُورَةُ الكَوۡثَرِ", "Al-Kawthar", "Al-Kawthar", "Abundance", "Meccan", 15, 3, 30, 602),
    (109, "الكافرون", "سُورَةُ الكَافِرُونَ", "Al-Kafirun", "Al-Kaafiroon", "The Disbelievers", "Meccan", 18, 6, 30, 603),
    (110, "النصر", "سُورَةُ النَّصۡرِ", "An-Nasr", "An-Nasr", "Divine Support", "Medinan", 114, 3, 30, 603),
    (111, "المسد", "سُورَةُ المَسَدِ", "Al-Masad", "Al-Masad", "The Palm Fibre", "Meccan", 6, 5, 30, 603),
    (112, "الإخلاص", "سُورَةُ الإِخۡلَاصِ", "Al-Ikhlas", "Al-Ikhlaas", "Sincerity", "Meccan", 22, 4, 30, 604),
    (113, "الفلق", "سُورَةُ الفَلَقِ", "Al-Falaq", "Al-Falaq", "The Dawn", "Meccan", 20, 5, 30, 604),
    (114, "الناس", "سُورَةُ النَّاسِ", "An-Nas", "An-Naas", "Mankind", "Meccan", 21, 6, 30, 604),
)

SURAHS: tuple[SurahMeta, ...] = tuple(SurahMeta(*row) for row in _RAW_SURAHS)
SURAH_BY_NUMBER: dict[int, SurahMeta] = {s.number: s for s in SURAHS}


def get_surah_meta(surah: int) -> SurahMeta | None:
    """Return canonical SurahMeta for `surah`, or None if out of bounds."""
    return SURAH_BY_NUMBER.get(surah)


def validate_reference(surah: int, ayah: int | None = None) -> tuple[bool, str | None]:
    """Validate `(surah, ayah)` against the canonical 114-surah Quran structure."""
    meta = SURAH_BY_NUMBER.get(surah)
    if meta is None:
        return (
            False,
            f"Invalid Surah number {surah}. The Quran has exactly 114 Surahs (1–114).",
        )
    if ayah is not None and (ayah < 1 or ayah > meta.ayah_count):
        return (
            False,
            f"Invalid Ayah reference {surah}:{ayah}. Surah {meta.english_name} "
            f"(Surah {surah}) has exactly {meta.ayah_count} ayahs (1–{meta.ayah_count}).",
        )
    return True, None


def _append_unique(items: list[tuple[int, int]], seen: set[tuple[int, int]], pair: tuple[int, int]) -> None:
    if pair not in seen:
        seen.add(pair)
        items.append(pair)


def _add_range_refs(
    results: list[tuple[int, int]],
    seen: set[tuple[int, int]],
    surah: int,
    start_ayah: int,
    end_raw: str | None,
) -> None:
    _append_unique(results, seen, (surah, start_ayah))
    if end_raw is None:
        return
    end_ayah = int(end_raw)
    if 0 < end_ayah - start_ayah <= 20:
        for ayah_num in range(start_ayah + 1, end_ayah + 1):
            _append_unique(results, seen, (surah, ayah_num))
    else:
        _append_unique(results, seen, (surah, end_ayah))


def extract_references(text: str) -> list[tuple[int, int]]:
    """Extract `S:A`, range (`S:A-B`), and `Surah S Ayah A` references from text."""
    results: list[tuple[int, int]] = []
    seen: set[tuple[int, int]] = set()
    cleaned_text = _URL_STRIP_RE.sub(" ", text)

    for match in _REF_OR_RANGE_RE.finditer(cleaned_text):
        _add_range_refs(
            results,
            seen,
            int(match.group(1)),
            int(match.group(2)),
            match.group(3),
        )

    for match in _WORD_REF_RE.finditer(cleaned_text):
        _add_range_refs(
            results,
            seen,
            int(match.group(1)),
            int(match.group(2)),
            match.group(3),
        )

    return results


def extract_surah_mentions(text: str) -> list[int]:
    """Extract explicit `Surah N` / `Chapter N` numbers from text."""
    mentions: list[int] = []
    seen: set[int] = set()
    cleaned_text = _URL_STRIP_RE.sub(" ", text)
    for match in _SURAH_MENTION_RE.finditer(cleaned_text):
        num = int(match.group(1))
        if num not in seen:
            seen.add(num)
            mentions.append(num)
    return mentions


def _normalize_latin(value: str) -> str:
    return _PUNCT_RE.sub("", value.lower().strip())


def find_surah_matches(query: str, limit: int = 5) -> list[SurahMeta]:
    """Find top canonical Surahs matching a number, Arabic name, or English name."""
    cleaned = query.strip()
    if not cleaned:
        return []

    if cleaned.isdigit():
        meta = SURAH_BY_NUMBER.get(int(cleaned))
        return [meta] if meta else []

    norm_q = _normalize_latin(cleaned)
    exact: list[SurahMeta] = []
    partial: list[SurahMeta] = []

    for surah in SURAHS:
        names = (
            _normalize_latin(surah.english_name),
            _normalize_latin(surah.alquran_name),
            _normalize_latin(surah.english_translation),
            surah.arabic_name,
        )
        if norm_q in names or cleaned == surah.arabic_name:
            exact.append(surah)
            continue
        if any(norm_q in n for n in names[:3] if norm_q) or cleaned in surah.arabic_name:
            partial.append(surah)

    return (exact + partial)[:limit]


def strip_bismillah_prefix(text: str, surah: int, ayah: int) -> str:
    """Strip UTF-8 BOM unconditionally and canonical Bismillah prefix when applicable."""
    cleaned = text.lstrip("\ufeff")
    if ayah != 1 or surah in (1, 9):
        return cleaned

    stripped = cleaned.lstrip()
    for prefix in _BISMILLAH_PREFIXES:
        if stripped.startswith(prefix):
            remainder = stripped[len(prefix) :].lstrip()
            return remainder if remainder else stripped
    return cleaned
