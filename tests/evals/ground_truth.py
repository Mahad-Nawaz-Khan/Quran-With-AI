"""Authoritative Quran metadata and verbatim Al-Quran Cloud ground truth.

Provides:
- Canonical 114-surah table (number, arabicName, englishName, englishNameTranslation, numberOfAyahs, revelationType)
- Canonical 30-juz starting coordinates
- Verbatim Al-Quran Cloud verses (quran-uthmani NFC, en.sahih, en.asad, ur.jalandhry)
- Unicode NFC / whitespace normalization helpers
- S:A reference extraction and canonical bounds validation
- SSE parsing and optional live Al-Quran Cloud verification helper
"""

from __future__ import annotations

import json
import re
import unicodedata
from typing import Any

import httpx

CANONICAL_SURAHS: list[tuple[int, str, str, str, int, str]] = [
    (1, "سُورَةُ ٱلْفَاتِحَةِ", "Al-Faatiha", "The Opening", 7, "Meccan"),
    (2, "سُورَةُ البَقَرَةِ", "Al-Baqara", "The Cow", 286, "Medinan"),
    (3, "سُورَةُ آلِ عِمۡرَانَ", "Aal-i-Imraan", "The Family of Imraan", 200, "Medinan"),
    (4, "سُورَةُ النِّسَاءِ", "An-Nisaa", "The Women", 176, "Medinan"),
    (5, "سُورَةُ المَائـِدَةِ", "Al-Maaida", "The Table", 120, "Medinan"),
    (6, "سُورَةُ الأَنۡعَامِ", "Al-An'aam", "The Cattle", 165, "Meccan"),
    (7, "سُورَةُ الأَعۡرَافِ", "Al-A'raaf", "The Heights", 206, "Meccan"),
    (8, "سُورَةُ الأَنفَالِ", "Al-Anfaal", "The Spoils of War", 75, "Medinan"),
    (9, "سُورَةُ التَّوۡبَةِ", "At-Tawba", "The Repentance", 129, "Medinan"),
    (10, "سُورَةُ يُونُسَ", "Yunus", "Jonas", 109, "Meccan"),
    (11, "سُورَةُ هُودٍ", "Hud", "Hud", 123, "Meccan"),
    (12, "سُورَةُ يُوسُفَ", "Yusuf", "Joseph", 111, "Meccan"),
    (13, "سُورَةُ الرَّعۡدِ", "Ar-Ra'd", "The Thunder", 43, "Medinan"),
    (14, "سُورَةُ إِبۡرَاهِيمَ", "Ibrahim", "Abraham", 52, "Meccan"),
    (15, "سُورَةُ الحِجۡرِ", "Al-Hijr", "The Rock", 99, "Meccan"),
    (16, "سُورَةُ النَّحۡلِ", "An-Nahl", "The Bee", 128, "Meccan"),
    (17, "سُورَةُ الإِسۡرَاءِ", "Al-Israa", "The Night Journey", 111, "Meccan"),
    (18, "سُورَةُ الكَهۡفِ", "Al-Kahf", "The Cave", 110, "Meccan"),
    (19, "سُورَةُ مَرۡيَمَ", "Maryam", "Mary", 98, "Meccan"),
    (20, "سُورَةُ طه", "Taa-Haa", "Taa-Haa", 135, "Meccan"),
    (21, "سُورَةُ الأَنبِيَاءِ", "Al-Anbiyaa", "The Prophets", 112, "Meccan"),
    (22, "سُورَةُ الحَجِّ", "Al-Hajj", "The Pilgrimage", 78, "Medinan"),
    (23, "سُورَةُ المُؤۡمِنُونَ", "Al-Muminoon", "The Believers", 118, "Meccan"),
    (24, "سُورَةُ النُّورِ", "An-Noor", "The Light", 64, "Medinan"),
    (25, "سُورَةُ الفُرۡقَانِ", "Al-Furqaan", "The Criterion", 77, "Meccan"),
    (26, "سُورَةُ الشُّعَرَاءِ", "Ash-Shu'araa", "The Poets", 227, "Meccan"),
    (27, "سُورَةُ النَّمۡلِ", "An-Naml", "The Ant", 93, "Meccan"),
    (28, "سُورَةُ القَصَصِ", "Al-Qasas", "The Stories", 88, "Meccan"),
    (29, "سُورَةُ العَنكَبُوتِ", "Al-Ankaboot", "The Spider", 69, "Meccan"),
    (30, "سُورَةُ الرُّومِ", "Ar-Room", "The Romans", 60, "Meccan"),
    (31, "سُورَةُ لُقۡمَانَ", "Luqman", "Luqman", 34, "Meccan"),
    (32, "سُورَةُ السَّجۡدَةِ", "As-Sajda", "The Prostration", 30, "Meccan"),
    (33, "سُورَةُ الأَحۡزَابِ", "Al-Ahzaab", "The Clans", 73, "Medinan"),
    (34, "سُورَةُ سَبَإٍ", "Saba", "Sheba", 54, "Meccan"),
    (35, "سُورَةُ فَاطِرٍ", "Faatir", "The Originator", 45, "Meccan"),
    (36, "سُورَةُ يسٓ", "Yaseen", "Yaseen", 83, "Meccan"),
    (37, "سُورَةُ الصَّافَّاتِ", "As-Saaffaat", "Those drawn up in Ranks", 182, "Meccan"),
    (38, "سُورَةُ صٓ", "Saad", "The letter Saad", 88, "Meccan"),
    (39, "سُورَةُ الزُّمَرِ", "Az-Zumar", "The Groups", 75, "Meccan"),
    (40, "سُورَةُ غَافِرٍ", "Ghafir", "The Forgiver", 85, "Meccan"),
    (41, "سُورَةُ فُصِّلَتۡ", "Fussilat", "Explained in detail", 54, "Meccan"),
    (42, "سُورَةُ الشُّورَىٰ", "Ash-Shura", "Consultation", 53, "Meccan"),
    (43, "سُورَةُ الزُّخۡرُفِ", "Az-Zukhruf", "Ornaments of gold", 89, "Meccan"),
    (44, "سُورَةُ الدُّخَانِ", "Ad-Dukhaan", "The Smoke", 59, "Meccan"),
    (45, "سُورَةُ الجَاثِيَةِ", "Al-Jaathiya", "Crouching", 37, "Meccan"),
    (46, "سُورَةُ الأَحۡقَافِ", "Al-Ahqaf", "The Dunes", 35, "Meccan"),
    (47, "سُورَةُ مُحَمَّدٍ", "Muhammad", "Muhammad", 38, "Medinan"),
    (48, "سُورَةُ الفَتۡحِ", "Al-Fath", "The Victory", 29, "Medinan"),
    (49, "سُورَةُ الحُجُرَاتِ", "Al-Hujuraat", "The Inner Apartments", 18, "Medinan"),
    (50, "سُورَةُ قٓ", "Qaaf", "The letter Qaaf", 45, "Meccan"),
    (51, "سُورَةُ الذَّارِيَاتِ", "Adh-Dhaariyat", "The Winnowing Winds", 60, "Meccan"),
    (52, "سُورَةُ الطُّورِ", "At-Tur", "The Mount", 49, "Meccan"),
    (53, "سُورَةُ النَّجۡمِ", "An-Najm", "The Star", 62, "Meccan"),
    (54, "سُورَةُ القَمَرِ", "Al-Qamar", "The Moon", 55, "Meccan"),
    (55, "سُورَةُ الرَّحۡمَٰن", "Ar-Rahmaan", "The Beneficent", 78, "Medinan"),
    (56, "سُورَةُ الوَاقِعَةِ", "Al-Waaqia", "The Inevitable", 96, "Meccan"),
    (57, "سُورَةُ الحَدِيدِ", "Al-Hadid", "The Iron", 29, "Medinan"),
    (58, "سُورَةُ المُجَادلَةِ", "Al-Mujaadila", "The Pleading Woman", 22, "Medinan"),
    (59, "سُورَةُ الحَشۡرِ", "Al-Hashr", "The Exile", 24, "Medinan"),
    (60, "سُورَةُ المُمۡتَحنَةِ", "Al-Mumtahana", "She that is to be examined", 13, "Medinan"),
    (61, "سُورَةُ الصَّفِّ", "As-Saff", "The Ranks", 14, "Medinan"),
    (62, "سُورَةُ الجُمُعَةِ", "Al-Jumu'a", "Friday", 11, "Medinan"),
    (63, "سُورَةُ المُنَافِقُونَ", "Al-Munaafiqoon", "The Hypocrites", 11, "Medinan"),
    (64, "سُورَةُ التَّغَابُنِ", "At-Taghaabun", "Mutual Disillusion", 18, "Medinan"),
    (65, "سُورَةُ الطَّلَاقِ", "At-Talaaq", "Divorce", 12, "Medinan"),
    (66, "سُورَةُ التَّحۡرِيمِ", "At-Tahrim", "The Prohibition", 12, "Medinan"),
    (67, "سُورَةُ المُلۡكِ", "Al-Mulk", "The Sovereignty", 30, "Meccan"),
    (68, "سُورَةُ القَلَمِ", "Al-Qalam", "The Pen", 52, "Meccan"),
    (69, "سُورَةُ الحَاقَّةِ", "Al-Haaqqa", "The Reality", 52, "Meccan"),
    (70, "سُورَةُ المَعَارِجِ", "Al-Ma'aarij", "The Ascending Stairways", 44, "Meccan"),
    (71, "سُورَةُ نُوحٍ", "Nooh", "Noah", 28, "Meccan"),
    (72, "سُورَةُ الجِنِّ", "Al-Jinn", "The Jinn", 28, "Meccan"),
    (73, "سُورَةُ المُزَّمِّلِ", "Al-Muzzammil", "The Enshrouded One", 20, "Meccan"),
    (74, "سُورَةُ المُدَّثِّرِ", "Al-Muddaththir", "The Cloaked One", 56, "Meccan"),
    (75, "سُورَةُ القِيَامَةِ", "Al-Qiyaama", "The Resurrection", 40, "Meccan"),
    (76, "سُورَةُ الإِنسَانِ", "Al-Insaan", "Man", 31, "Medinan"),
    (77, "سُورَةُ المُرۡسَلَاتِ", "Al-Mursalaat", "The Emissaries", 50, "Meccan"),
    (78, "سُورَةُ النَّبَإِ", "An-Naba", "The Announcement", 40, "Meccan"),
    (79, "سُورَةُ النَّازِعَاتِ", "An-Naazi'aat", "Those who drag forth", 46, "Meccan"),
    (80, "سُورَةُ عَبَسَ", "Abasa", "He frowned", 42, "Meccan"),
    (81, "سُورَةُ التَّكۡوِيرِ", "At-Takwir", "The Overthrowing", 29, "Meccan"),
    (82, "سُورَةُ الانفِطَارِ", "Al-Infitaar", "The Cleaving", 19, "Meccan"),
    (83, "سُورَةُ المُطَفِّفِينَ", "Al-Mutaffifin", "Defrauding", 36, "Meccan"),
    (84, "سُورَةُ الانشِقَاقِ", "Al-Inshiqaaq", "The Splitting Open", 25, "Meccan"),
    (85, "سُورَةُ البُرُوجِ", "Al-Burooj", "The Constellations", 22, "Meccan"),
    (86, "سُورَةُ الطَّارِقِ", "At-Taariq", "The Morning Star", 17, "Meccan"),
    (87, "سُورَةُ الأَعۡلَىٰ", "Al-A'laa", "The Most High", 19, "Meccan"),
    (88, "سُورَةُ الغَاشِيَةِ", "Al-Ghaashiya", "The Overwhelming", 26, "Meccan"),
    (89, "سُورَةُ الفَجۡرِ", "Al-Fajr", "The Dawn", 30, "Meccan"),
    (90, "سُورَةُ البَلَدِ", "Al-Balad", "The City", 20, "Meccan"),
    (91, "سُورَةُ الشَّمۡسِ", "Ash-Shams", "The Sun", 15, "Meccan"),
    (92, "سُورَةُ اللَّيۡلِ", "Al-Lail", "The Night", 21, "Meccan"),
    (93, "سُورَةُ الضُّحَىٰ", "Ad-Dhuhaa", "The Morning Hours", 11, "Meccan"),
    (94, "سُورَةُ الشَّرۡحِ", "Ash-Sharh", "The Consolation", 8, "Meccan"),
    (95, "سُورَةُ التِّينِ", "At-Tin", "The Fig", 8, "Meccan"),
    (96, "سُورَةُ العَلَقِ", "Al-Alaq", "The Clot", 19, "Meccan"),
    (97, "سُورَةُ القَدۡرِ", "Al-Qadr", "The Power, Fate", 5, "Meccan"),
    (98, "سُورَةُ البَيِّنَةِ", "Al-Bayyina", "The Evidence", 8, "Medinan"),
    (99, "سُورَةُ الزَّلۡزَلَةِ", "Az-Zalzala", "The Earthquake", 8, "Medinan"),
    (100, "سُورَةُ العَادِيَاتِ", "Al-Aadiyaat", "The Chargers", 11, "Meccan"),
    (101, "سُورَةُ القَارِعَةِ", "Al-Qaari'a", "The Calamity", 11, "Meccan"),
    (102, "سُورَةُ التَّكَاثُرِ", "At-Takaathur", "Competition", 8, "Meccan"),
    (103, "سُورَةُ العَصۡرِ", "Al-Asr", "The Declining Day, Epoch", 3, "Meccan"),
    (104, "سُورَةُ الهُمَزَةِ", "Al-Humaza", "The Traducer", 9, "Meccan"),
    (105, "سُورَةُ الفِيلِ", "Al-Fil", "The Elephant", 5, "Meccan"),
    (106, "سُورَةُ قُرَيۡشٍ", "Quraish", "Quraysh", 4, "Meccan"),
    (107, "سُورَةُ المَاعُونِ", "Al-Maa'un", "Almsgiving", 7, "Meccan"),
    (108, "سُورَةُ الكَوۡثَرِ", "Al-Kawthar", "Abundance", 3, "Meccan"),
    (109, "سُورَةُ الكَافِرُونَ", "Al-Kaafiroon", "The Disbelievers", 6, "Meccan"),
    (110, "سُورَةُ النَّصۡرِ", "An-Nasr", "Divine Support", 3, "Medinan"),
    (111, "سُورَةُ المَسَدِ", "Al-Masad", "The Palm Fibre", 5, "Meccan"),
    (112, "سُورَةُ الإِخۡلَاصِ", "Al-Ikhlaas", "Sincerity", 4, "Meccan"),
    (113, "سُورَةُ الفَلَقِ", "Al-Falaq", "The Dawn", 5, "Meccan"),
    (114, "سُورَةُ النَّاسِ", "An-Naas", "Mankind", 6, "Meccan"),
]

MAX_AYAHS: dict[int, int] = {row[0]: row[4] for row in CANONICAL_SURAHS}
SURAH_BY_NUMBER: dict[int, dict[str, Any]] = {
    row[0]: {
        "number": row[0],
        "name": row[1],
        "englishName": row[2],
        "englishNameTranslation": row[3],
        "numberOfAyahs": row[4],
        "revelationType": row[5],
    }
    for row in CANONICAL_SURAHS
}

TOTAL_SURAHS = 114
TOTAL_AYAHS = sum(MAX_AYAHS.values())  # 6236
TOTAL_JUZ = 30
TOTAL_PAGES = 604

JUZ_LIST: list[dict[str, Any]] = [
    {"juz": 1, "name": "Alif Lam Meem", "startSurah": 1, "startAyah": 1},
    {"juz": 2, "name": "Sayaqool", "startSurah": 2, "startAyah": 142},
    {"juz": 3, "name": "Tilkal Rusull", "startSurah": 2, "startAyah": 253},
    {"juz": 4, "name": "Lan Tana Loo", "startSurah": 3, "startAyah": 93},
    {"juz": 5, "name": "Wal Mohsanat", "startSurah": 4, "startAyah": 24},
    {"juz": 6, "name": "La Yuhibbullah", "startSurah": 4, "startAyah": 148},
    {"juz": 7, "name": "Wa Iza Samiu", "startSurah": 5, "startAyah": 82},
    {"juz": 8, "name": "Wa Lau Annana", "startSurah": 6, "startAyah": 111},
    {"juz": 9, "name": "Qalal Malao", "startSurah": 7, "startAyah": 88},
    {"juz": 10, "name": "Wa A'lamu", "startSurah": 8, "startAyah": 41},
    {"juz": 11, "name": "Yatazeroon", "startSurah": 9, "startAyah": 93},
    {"juz": 12, "name": "Wa Mamin Da'abat", "startSurah": 11, "startAyah": 6},
    {"juz": 13, "name": "Wa Ma Ubrioo", "startSurah": 12, "startAyah": 53},
    {"juz": 14, "name": "Rubama", "startSurah": 15, "startAyah": 1},
    {"juz": 15, "name": "Subhanallazi", "startSurah": 17, "startAyah": 1},
    {"juz": 16, "name": "Qal Alam", "startSurah": 18, "startAyah": 75},
    {"juz": 17, "name": "Aqtarabo", "startSurah": 21, "startAyah": 1},
    {"juz": 18, "name": "Qadd Aflaha", "startSurah": 23, "startAyah": 1},
    {"juz": 19, "name": "Wa Qalallazina", "startSurah": 25, "startAyah": 21},
    {"juz": 20, "name": "A'man Khalaq", "startSurah": 27, "startAyah": 56},
    {"juz": 21, "name": "Utlu Ma Oohi", "startSurah": 29, "startAyah": 46},
    {"juz": 22, "name": "Wa Manyaqnut", "startSurah": 33, "startAyah": 31},
    {"juz": 23, "name": "Wa Mali", "startSurah": 36, "startAyah": 28},
    {"juz": 24, "name": "Faman Azlam", "startSurah": 39, "startAyah": 32},
    {"juz": 25, "name": "Elahe Yuruddo", "startSurah": 41, "startAyah": 47},
    {"juz": 26, "name": "Ha'a Meem", "startSurah": 46, "startAyah": 1},
    {"juz": 27, "name": "Qala Fama Khatbukum", "startSurah": 51, "startAyah": 31},
    {"juz": 28, "name": "Qadd Sami Allah", "startSurah": 58, "startAyah": 1},
    {"juz": 29, "name": "Tabarakallazi", "startSurah": 67, "startAyah": 1},
    {"juz": 30, "name": "Amma Yatasa'aloon", "startSurah": 78, "startAyah": 1},
]

# Verbatim Al-Quran Cloud ground truth (quran-uthmani NFC, en.sahih, en.asad, ur.jalandhry)
CANONICAL_VERSES: dict[str, dict[str, Any]] = {
    "1:1": {
        "surah": 1,
        "ayah": 1,
        "page": 1,
        "juz": 1,
        "hizbQuarter": 1,
        "quran-uthmani": "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ",
        "en.sahih": "In the name of Allah, the Entirely Merciful, the Especially Merciful.",
        "en.asad": "In the name of God, The Most Gracious, The Dispenser of Grace:",
        "ur.jalandhry": "شروع الله کا نام لے کر جو بڑا مہربان نہایت رحم والا ہے",
    },
    "1:2": {
        "surah": 1,
        "ayah": 2,
        "page": 1,
        "juz": 1,
        "hizbQuarter": 1,
        "quran-uthmani": "ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَٰلَمِينَ",
        "en.sahih": "[All] praise is [due] to Allah, Lord of the worlds -",
        "en.asad": "All praise is due to God alone, the Sustainer of all the worlds,",
        "ur.jalandhry": "سب طرح کی تعریف خدا ہی کو (سزاوار) ہے جو تمام مخلوقات کا پروردگار ہے",
    },
    "1:3": {
        "surah": 1,
        "ayah": 3,
        "page": 1,
        "juz": 1,
        "hizbQuarter": 1,
        "quran-uthmani": "ٱلرَّحْمَٰنِ ٱلرَّحِيمِ",
        "en.sahih": "The Entirely Merciful, the Especially Merciful,",
        "en.asad": "The Most Gracious, the Dispenser of Grace,",
        "ur.jalandhry": "بڑا مہربان نہایت رحم والا",
    },
    "1:4": {
        "surah": 1,
        "ayah": 4,
        "page": 1,
        "juz": 1,
        "hizbQuarter": 1,
        "quran-uthmani": "مَٰلِكِ يَوْمِ ٱلدِّينِ",
        "en.sahih": "Sovereign of the Day of Recompense.",
        "en.asad": "Lord of the Day of Judgment!",
        "ur.jalandhry": "انصاف کے دن کا حاکم",
    },
    "1:5": {
        "surah": 1,
        "ayah": 5,
        "page": 1,
        "juz": 1,
        "hizbQuarter": 1,
        "quran-uthmani": "إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ",
        "en.sahih": "It is You we worship and You we ask for help.",
        "en.asad": "Thee alone do we worship; and unto Thee alone do we turn for aid.",
        "ur.jalandhry": "(اے پروردگار) ہم تیری ہی عبادت کرتے ہیں اور تجھ ہی سے مدد مانگتے ہیں",
    },
    "1:6": {
        "surah": 1,
        "ayah": 6,
        "page": 1,
        "juz": 1,
        "hizbQuarter": 1,
        "quran-uthmani": "ٱهْدِنَا ٱلصِّرَٰطَ ٱلْمُسْتَقِيمَ",
        "en.sahih": "Guide us to the straight path -",
        "en.asad": "Guide us the straight way.",
        "ur.jalandhry": "ہم کو سیدھے رستے چلا",
    },
    "1:7": {
        "surah": 1,
        "ayah": 7,
        "page": 1,
        "juz": 1,
        "hizbQuarter": 1,
        "quran-uthmani": "صِرَٰطَ ٱلَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ ٱلْمَغْضُوبِ عَلَيْهِمْ وَلَا ٱلضَّآلِّينَ",
        "en.sahih": "The path of those upon whom You have bestowed favor, not of those who have evoked [Your] anger or of those who are astray.",
        "en.asad": "The way of those upon whom Thou hast bestowed Thy blessings, not of those who have been condemned [by Thee], nor of those who go astray!",
        "ur.jalandhry": "ان لوگوں کے رستے جن پر تو اپنا فضل وکرم کرتا رہا نہ ان کے جن پر غصے ہوتا رہا اور نہ گمراہوں کے",
    },
    "2:153": {
        "surah": 2,
        "ayah": 153,
        "page": 23,
        "juz": 2,
        "hizbQuarter": 9,
        "quran-uthmani": "يَٰٓأَيُّهَا ٱلَّذِينَ ءَامَنُوا۟ ٱسْتَعِينُوا۟ بِٱلصَّبْرِ وَٱلصَّلَوٰةِ ۚ إِنَّ ٱللَّهَ مَعَ ٱلصَّٰبِرِينَ",
        "en.sahih": "O you who have believed, seek help through patience and prayer. Indeed, Allah is with the patient.",
        "en.asad": "O YOU who have attained to faith! Seek aid in steadfast patience and prayer: for, behold, God is with those who are patient in adversity.",
        "ur.jalandhry": "اے ایمان والو صبر اور نماز سے مدد لیا کرو بےشک خدا صبر کرنے والوں کے ساتھ ہے",
    },
    "2:255": {
        "surah": 2,
        "ayah": 255,
        "page": 42,
        "juz": 3,
        "hizbQuarter": 17,
        "quran-uthmani": "ٱللَّهُ لَآ إِلَٰهَ إِلَّا هُوَ ٱلْحَىُّ ٱلْقَيُّومُ ۚ لَا تَأْخُذُهُۥ سِنَةٌۭ وَلَا نَوْمٌۭ ۚ لَّهُۥ مَا فِى ٱلسَّمَٰوَٰتِ وَمَا فِى ٱلْأَرْضِ ۗ مَن ذَا ٱلَّذِى يَشْفَعُ عِندَهُۥٓ إِلَّا بِإِذْنِهِۦ ۚ يَعْلَمُ مَا بَيْنَ أَيْدِيهِمْ وَمَا خَلْفَهُمْ ۖ وَلَا يُحِيطُونَ بِشَىْءٍۢ مِّنْ عِلْمِهِۦٓ إِلَّا بِمَا شَآءَ ۚ وَسِعَ كُرْسِيُّهُ ٱلسَّمَٰوَٰتِ وَٱلْأَرْضَ ۖ وَلَا يَـُٔودُهُۥ حِفْظُهُمَا ۚ وَهُوَ ٱلْعَلِىُّ ٱلْعَظِيمُ",
        "en.sahih": "Allah - there is no deity except Him, the Ever-Living, the Sustainer of [all] existence. Neither drowsiness overtakes Him nor sleep. To Him belongs whatever is in the heavens and whatever is on the earth. Who is it that can intercede with Him except by His permission? He knows what is [presently] before them and what will be after them, and they encompass not a thing of His knowledge except for what He wills. His Kursi extends over the heavens and the earth, and their preservation tires Him not. And He is the Most High, the Most Great.",
        "en.asad": "GOD - there is no deity save Him, the Ever-Living, the Self-Subsistent Fount of All Being. Neither slumber overtakes Him, nor sleep. His is all that is in the heavens and all that is on earth. Who is there that could intercede with Him, unless it be by His leave? He knows all that lies open before men and all that is hidden from them, whereas they cannot attain to aught of His knowledge save that which He wills [them to attain]. His eternal power overspreads the heavens and the earth, and their upholding wearies Him not. And he alone is truly exalted, tremendous.",
        "ur.jalandhry": "خدا (وہ معبود برحق ہے کہ) اس کے سوا کوئی عبادت کے لائق نہیں زندہ ہمیشہ رہنے والا اسے نہ اونگھ آتی ہے نہ نیند جو کچھ آسمانوں میں اور جو کچھ زمین میں ہیں سب اسی کا ہے کون ہے جو اس کی اجازت کے بغیر اس سے (کسی کی) سفارش کر سکے جو کچھ لوگوں کے روبرو ہو رہا ہے اور جو کچھ ان کے پیچھے ہوچکا ہے اسے سب معلوم ہے اور وہ اس کی معلومات میں سے کسی چیز پر دسترس حاصل نہیں کر سکتے ہاں جس قدر وہ چاہتا ہے (اسی قدر معلوم کرا دیتا ہے) اس کی بادشاہی (اور علم) آسمان اور زمین سب پر حاوی ہے اور اسے ان کی حفاظت کچھ بھی دشوار نہیں وہ بڑا عالی رتبہ اور جلیل القدر ہے",
    },
    "9:1": {
        "surah": 9,
        "ayah": 1,
        "page": 187,
        "juz": 10,
        "hizbQuarter": 75,
        "quran-uthmani": "بَرَآءَةٌۭ مِّنَ ٱللَّهِ وَرَسُولِهِۦٓ إِلَى ٱلَّذِينَ عَٰهَدتُّم مِّنَ ٱلْمُشْرِكِينَ",
        "en.sahih": "[This is a declaration of] disassociation, from Allah and His Messenger, to those with whom you had made a treaty among the polytheists.",
        "en.asad": "DISAVOWAL by God and His Apostle [is herewith announced] unto those who ascribe divinity to aught beside God, [and] with whom you [O: believers] have made a covenant.",
        "ur.jalandhry": "(اے اہل اسلام اب) خدا اور اس کے رسول کی طرف سے مشرکوں سے جن سے تم نے عہد کر رکھا تھا بیزاری (اور جنگ کی تیاری) ہے",
    },
    "18:10": {
        "surah": 18,
        "ayah": 10,
        "page": 294,
        "juz": 15,
        "hizbQuarter": 117,
        "quran-uthmani": "إِذْ أَوَى ٱلْفِتْيَةُ إِلَى ٱلْكَهْفِ فَقَالُوا۟ رَبَّنَآ ءَاتِنَا مِن لَّدُنكَ رَحْمَةًۭ وَهَيِّئْ لَنَا مِنْ أَمْرِنَا رَشَدًۭا",
        "en.sahih": "[Mention] when the youths retreated to the cave and said, \"Our Lord, grant us from Yourself mercy and prepare for us from our affair right guidance.\"",
        "en.asad": "When those youths took refuge in the cave, they prayed: \"O our Sustainer! Bestow on us grace from Thyself, and endow us, whatever our [outward] condition, with consciousness of what is right!\"",
        "ur.jalandhry": "جب وہ جوان غار میں جا رہے تو کہنے لگے کہ اے ہمارے پروردگار ہم پر اپنے ہاں سے رحمت نازل فرما۔ اور ہمارے کام درستی (کے سامان) مہیا کر",
    },
    "36:58": {
        "surah": 36,
        "ayah": 58,
        "page": 444,
        "juz": 23,
        "hizbQuarter": 177,
        "quran-uthmani": "سَلَٰمٌۭ قَوْلًۭا مِّن رَّبٍّۢ رَّحِيمٍۢ",
        "en.sahih": "[And] \"Peace,\" a word from a Merciful Lord.",
        "en.asad": "peace and fulfillment through the word of a Sustainer who dispenses all grace.",
        "ur.jalandhry": "پروردگار مہربان کی طرف سے سلام (کہا جائے گا)",
    },
    "39:53": {
        "surah": 39,
        "ayah": 53,
        "page": 464,
        "juz": 24,
        "hizbQuarter": 186,
        "quran-uthmani": "۞ قُلْ يَٰعِبَادِىَ ٱلَّذِينَ أَسْرَفُوا۟ عَلَىٰٓ أَنفُسِهِمْ لَا تَقْنَطُوا۟ مِن رَّحْمَةِ ٱللَّهِ ۚ إِنَّ ٱللَّهَ يَغْفِرُ ٱلذُّنُوبَ جَمِيعًا ۚ إِنَّهُۥ هُوَ ٱلْغَفُورُ ٱلرَّحِيمُ",
        "en.sahih": "Say, \"O My servants who have transgressed against themselves [by sinning], do not despair of the mercy of Allah. Indeed, Allah forgives all sins. Indeed, it is He who is the Forgiving, the Merciful.\"",
        "en.asad": "SAY: “[Thus speaks God:] ‘O you servants of Mine who have transgressed against your own selves! Despair not of God’s mercy: behold, God forgives all sins - for, verily, He alone is much-forgiving, a dis­penser of grace!’”",
        "ur.jalandhry": "(اے پیغمبر میری طرف سے لوگوں کو) کہہ دو کہ اے میرے بندو جنہوں نے اپنی جانوں پر زیادتی کی ہے خدا کی رحمت سے ناامید نہ ہونا۔ خدا تو سب گناہوں کو بخش دیتا ہے۔ (اور) وہ تو بخشنے والا مہربان ہے",
    },
    "94:5": {
        "surah": 94,
        "ayah": 5,
        "page": 596,
        "juz": 30,
        "hizbQuarter": 239,
        "quran-uthmani": "فَإِنَّ مَعَ ٱلْعُسْرِ يُسْرًا",
        "en.sahih": "For indeed, with hardship [will be] ease.",
        "en.asad": "And, behold, with every hardship comes ease:",
        "ur.jalandhry": "ہاں ہاں مشکل کے ساتھ آسانی بھی ہے",
    },
    "94:6": {
        "surah": 94,
        "ayah": 6,
        "page": 596,
        "juz": 30,
        "hizbQuarter": 239,
        "quran-uthmani": "إِنَّ مَعَ ٱلْعُسْرِ يُسْرًۭا",
        "en.sahih": "Indeed, with hardship [will be] ease.",
        "en.asad": "verily, with every hardship comes ease!",
        "ur.jalandhry": "(اور) بے شک مشکل کے ساتھ آسانی ہے",
    },
    "112:1": {
        "surah": 112,
        "ayah": 1,
        "page": 604,
        "juz": 30,
        "hizbQuarter": 240,
        "quran-uthmani": "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ قُلْ هُوَ ٱللَّهُ أَحَدٌ",
        "quran-uthmani-body": "قُلْ هُوَ ٱللَّهُ أَحَدٌ",
        "en.sahih": "Say, \"He is Allah, [who is] One,",
        "en.asad": "SAY: \"He is the One God:",
        "ur.jalandhry": "کہو کہ وہ (ذات پاک جس کا نام) الله (ہے) ایک ہے",
    },
    "112:2": {
        "surah": 112,
        "ayah": 2,
        "page": 604,
        "juz": 30,
        "hizbQuarter": 240,
        "quran-uthmani": "ٱللَّهُ ٱلصَّمَدُ",
        "en.sahih": "Allah, the Eternal Refuge.",
        "en.asad": "\"God the Eternal, the Uncaused Cause of All Being.",
        "ur.jalandhry": "معبود برحق جو بےنیاز ہے",
    },
    "112:3": {
        "surah": 112,
        "ayah": 3,
        "page": 604,
        "juz": 30,
        "hizbQuarter": 240,
        "quran-uthmani": "لَمْ يَلِدْ وَلَمْ يُولَدْ",
        "en.sahih": "He neither begets nor is born,",
        "en.asad": "\"He begets not, and neither is He begotten;",
        "ur.jalandhry": "نہ کسی کا باپ ہے اور نہ کسی کا بیٹا",
    },
    "112:4": {
        "surah": 112,
        "ayah": 4,
        "page": 604,
        "juz": 30,
        "hizbQuarter": 240,
        "quran-uthmani": "وَلَمْ يَكُن لَّهُۥ كُفُوًا أَحَدٌۢ",
        "en.sahih": "Nor is there to Him any equivalent.\"",
        "en.asad": "\"and there is nothing that could be compared with Him.",
        "ur.jalandhry": "اور کوئی اس کا ہمسر نہیں",
    },
    "114:1": {
        "surah": 114,
        "ayah": 1,
        "page": 604,
        "juz": 30,
        "hizbQuarter": 240,
        "quran-uthmani": "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ قُلْ أَعُوذُ بِرَبِّ ٱلنَّاسِ",
        "quran-uthmani-body": "قُلْ أَعُوذُ بِرَبِّ ٱلنَّاسِ",
        "en.sahih": "Say, \"I seek refuge in the Lord of mankind,",
        "en.asad": "SAY: \"I seek refuge with the Sustainer of men,",
        "ur.jalandhry": "کہو کہ میں لوگوں کے پروردگار کی پناہ مانگتا ہوں",
    },
    "114:2": {
        "surah": 114,
        "ayah": 2,
        "page": 604,
        "juz": 30,
        "hizbQuarter": 240,
        "quran-uthmani": "مَلِكِ ٱلنَّاسِ",
        "en.sahih": "The Sovereign of mankind.",
        "en.asad": "\"the Sovereign of men,",
        "ur.jalandhry": "(یعنی) لوگوں کے حقیقی بادشاہ کی",
    },
    "114:3": {
        "surah": 114,
        "ayah": 3,
        "page": 604,
        "juz": 30,
        "hizbQuarter": 240,
        "quran-uthmani": "إِلَٰهِ ٱلنَّاسِ",
        "en.sahih": "The God of mankind,",
        "en.asad": "\"the God of men,",
        "ur.jalandhry": "لوگوں کے معبود برحق کی",
    },
    "114:4": {
        "surah": 114,
        "ayah": 4,
        "page": 604,
        "juz": 30,
        "hizbQuarter": 240,
        "quran-uthmani": "مِن شَرِّ ٱلْوَسْوَاسِ ٱلْخَنَّاسِ",
        "en.sahih": "From the evil of the retreating whisperer -",
        "en.asad": "\"from the evil of the whispering, elusive tempter",
        "ur.jalandhry": "(شیطان) وسوسہ انداز کی برائی سے جو (خدا کا نام سن کر) پیچھے ہٹ جاتا ہے",
    },
    "114:5": {
        "surah": 114,
        "ayah": 5,
        "page": 604,
        "juz": 30,
        "hizbQuarter": 240,
        "quran-uthmani": "ٱلَّذِى يُوَسْوِسُ فِى صُدُورِ ٱلنَّاسِ",
        "en.sahih": "Who whispers [evil] into the breasts of mankind -",
        "en.asad": "\"who whispers in the hearts of men",
        "ur.jalandhry": "جو لوگوں کے دلوں میں وسوسے ڈالتا ہے",
    },
    "114:6": {
        "surah": 114,
        "ayah": 6,
        "page": 604,
        "juz": 30,
        "hizbQuarter": 240,
        "quran-uthmani": "مِنَ ٱلْجِنَّةِ وَٱلنَّاسِ",
        "en.sahih": "From among the jinn and mankind.\"",
        "en.asad": "\"from all [temptation to evil by] invisible forces as well as men,\"",
        "ur.jalandhry": "وہ جنّات میں سے (ہو) یا انسانوں میں سے",
    },
}

_URL_PATTERN = re.compile(r"https?://\S+")
_SA_PATTERN = re.compile(
    r"(?<!\d)(?<!:)(\d{1,4})\s*:\s*(\d{1,4})(?!\d)(?!:\d)(?!\s*(?:am|pm)\b)",
    re.IGNORECASE,
)
_WORD_REF_PATTERN = re.compile(
    r"\b(?:surah|sura|chapter)\s+(\d{1,4})\s*(?:,?\s*(?:ayah|ayat|verse))\s+(\d{1,4})\b",
    re.IGNORECASE,
)
_ARABIC_SEQ_PATTERN = re.compile(r"[\u0600-\u06FF][\u0600-\u06FF\s]{9,}[\u0600-\u06FF]")


def normalize_arabic(text: str) -> str:
    """Normalize Arabic text to NFC, strip BOM, and collapse whitespace."""
    cleaned = unicodedata.normalize("NFC", text).replace("\ufeff", "")
    return re.sub(r"\s+", " ", cleaned).strip()


def normalize_text(text: str) -> str:
    """Normalize general text to NFC and collapse whitespace."""
    cleaned = unicodedata.normalize("NFC", text)
    return re.sub(r"\s+", " ", cleaned).strip()


def is_valid_reference(surah: int, ayah: int) -> bool:
    """Return True iff (surah, ayah) falls within canonical 114-surah Quran bounds."""
    if surah < 1 or surah > TOTAL_SURAHS:
        return False
    return 1 <= ayah <= MAX_AYAHS[surah]


def extract_sa_references(text: str) -> list[tuple[int, int]]:
    """Extract all S:A and word-form Surah/Ayah references, excluding URLs and timestamps."""
    stripped = _URL_PATTERN.sub(" ", text)
    refs: list[tuple[int, int]] = []
    seen: set[tuple[int, int]] = set()
    for pattern in (_SA_PATTERN, _WORD_REF_PATTERN):
        for m in pattern.finditer(stripped):
            pair = (int(m.group(1)), int(m.group(2)))
            if pair not in seen:
                seen.add(pair)
                refs.append(pair)
    return refs


def find_out_of_bounds_references(text: str) -> list[tuple[int, int]]:
    """Return any extracted S:A references that violate canonical 114-surah bounds."""
    return [(s, a) for s, a in extract_sa_references(text) if not is_valid_reference(s, a)]


def has_long_arabic_span(text: str) -> bool:
    """Return True if text contains a multi-word Arabic span (>=10 Arabic letters)."""
    for match in _ARABIC_SEQ_PATTERN.finditer(text):
        arabic_letters = sum(1 for ch in match.group(0) if "\u0600" <= ch <= "\u06FF")
        if arabic_letters >= 10:
            return True
    return False


def parse_sse_events(raw_body: str) -> list[dict[str, Any]]:
    """Parse SSE `data: {...}` frames from an event-stream response body."""
    events: list[dict[str, Any]] = []
    for line in raw_body.splitlines():
        line = line.strip()
        if not line.startswith("data:"):
            continue
        payload = line[5:].strip()
        if not payload or payload == "[DONE]":
            continue
        events.append(json.loads(payload))
    return events


def collect_sse_result(events: list[dict[str, Any]]) -> dict[str, Any]:
    """Assemble full text, statuses, metadata, done flag, and error from SSE events."""
    statuses: list[str] = []
    tokens: list[str] = []
    metadata: dict[str, Any] = {}
    done = False
    error: str | None = None

    for evt in events:
        if "status" in evt:
            statuses.append(str(evt["status"]))
        if "token" in evt:
            tokens.append(str(evt["token"]))
        if "metadata" in evt and isinstance(evt["metadata"], dict):
            metadata = evt["metadata"]
        if evt.get("done") is True:
            done = True
        if "error" in evt:
            error = str(evt["error"])

    return {
        "statuses": statuses,
        "text": "".join(tokens),
        "metadata": metadata,
        "done": done,
        "error": error,
    }


def get_ground_truth_verse(
    surah: int,
    ayah: int,
    edition: str = "en.sahih",
    allow_live_fetch: bool = False,
) -> dict[str, Any]:
    """Return canonical verse data from local ground truth or live Al-Quran Cloud API."""
    key = f"{surah}:{ayah}"
    if key in CANONICAL_VERSES:
        entry = CANONICAL_VERSES[key]
        if edition in entry:
            return {
                "surah": surah,
                "ayah": ayah,
                "arabic": entry["quran-uthmani"],
                "translation": entry[edition],
                "edition": edition,
            }

    if allow_live_fetch:
        url = f"https://api.alquran.cloud/v1/ayah/{key}/editions/quran-uthmani,{edition}"
        resp = httpx.get(url, timeout=15.0)
        resp.raise_for_status()
        data = resp.json()["data"]
        return {
            "surah": surah,
            "ayah": ayah,
            "arabic": normalize_arabic(data[0]["text"]),
            "translation": normalize_text(data[1]["text"]),
            "edition": edition,
        }

    raise KeyError(f"Verse {key} ({edition}) not in local ground truth table")
