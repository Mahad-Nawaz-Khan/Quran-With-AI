import { JUZ_METADATA } from './constants';
import type { SurahMeta } from './types';

export const TOTAL_SURAHS = 114;
export const TOTAL_JUZ = 30;
export const TOTAL_PAGES = 604;
export const TOTAL_AYAHS = 6236;

export const SURAH_METADATA: readonly SurahMeta[] = [
  { number: 1, arabicName: 'سُورَةُ ٱلْفَاتِحَةِ', englishName: 'Al-Fatihah', englishNameTranslation: 'The Opener', revelationType: 'Meccan', revelationOrder: 5, ayahCount: 7, startJuz: 1, startPage: 1 },
  { number: 2, arabicName: 'سُورَةُ البَقَرَةِ', englishName: 'Al-Baqarah', englishNameTranslation: 'The Cow', revelationType: 'Medinan', revelationOrder: 87, ayahCount: 286, startJuz: 1, startPage: 2 },
  { number: 3, arabicName: 'سُورَةُ آلِ عِمۡرَانَ', englishName: "Ali 'Imran", englishNameTranslation: 'Family of Imran', revelationType: 'Medinan', revelationOrder: 89, ayahCount: 200, startJuz: 3, startPage: 50 },
  { number: 4, arabicName: 'سُورَةُ النِّسَاءِ', englishName: 'An-Nisa', englishNameTranslation: 'The Women', revelationType: 'Medinan', revelationOrder: 92, ayahCount: 176, startJuz: 4, startPage: 77 },
  { number: 5, arabicName: 'سُورَةُ المَائـِدَةِ', englishName: "Al-Ma'idah", englishNameTranslation: 'The Table Spread', revelationType: 'Medinan', revelationOrder: 112, ayahCount: 120, startJuz: 6, startPage: 106 },
  { number: 6, arabicName: 'سُورَةُ الأَنۡعَامِ', englishName: "Al-An'am", englishNameTranslation: 'The Cattle', revelationType: 'Meccan', revelationOrder: 55, ayahCount: 165, startJuz: 7, startPage: 128 },
  { number: 7, arabicName: 'سُورَةُ الأَعۡرَافِ', englishName: "Al-A'raf", englishNameTranslation: 'The Heights', revelationType: 'Meccan', revelationOrder: 39, ayahCount: 206, startJuz: 8, startPage: 151 },
  { number: 8, arabicName: 'سُورَةُ الأَنفَالِ', englishName: 'Al-Anfal', englishNameTranslation: 'The Spoils of War', revelationType: 'Medinan', revelationOrder: 88, ayahCount: 75, startJuz: 9, startPage: 177 },
  { number: 9, arabicName: 'سُورَةُ التَّوۡبَةِ', englishName: 'At-Tawbah', englishNameTranslation: 'The Repentance', revelationType: 'Medinan', revelationOrder: 113, ayahCount: 129, startJuz: 10, startPage: 187 },
  { number: 10, arabicName: 'سُورَةُ يُونُسَ', englishName: 'Yunus', englishNameTranslation: 'Jonah', revelationType: 'Meccan', revelationOrder: 51, ayahCount: 109, startJuz: 11, startPage: 208 },
  { number: 11, arabicName: 'سُورَةُ هُودٍ', englishName: 'Hud', englishNameTranslation: 'Hud', revelationType: 'Meccan', revelationOrder: 52, ayahCount: 123, startJuz: 11, startPage: 221 },
  { number: 12, arabicName: 'سُورَةُ يُوسُفَ', englishName: 'Yusuf', englishNameTranslation: 'Joseph', revelationType: 'Meccan', revelationOrder: 53, ayahCount: 111, startJuz: 12, startPage: 235 },
  { number: 13, arabicName: 'سُورَةُ الرَّعۡدِ', englishName: "Ar-Ra'd", englishNameTranslation: 'The Thunder', revelationType: 'Medinan', revelationOrder: 96, ayahCount: 43, startJuz: 13, startPage: 249 },
  { number: 14, arabicName: 'سُورَةُ إِبۡرَاهِيمَ', englishName: 'Ibrahim', englishNameTranslation: 'Abraham', revelationType: 'Meccan', revelationOrder: 72, ayahCount: 52, startJuz: 13, startPage: 255 },
  { number: 15, arabicName: 'سُورَةُ الحِجۡرِ', englishName: 'Al-Hijr', englishNameTranslation: 'The Rocky Tract', revelationType: 'Meccan', revelationOrder: 54, ayahCount: 99, startJuz: 14, startPage: 262 },
  { number: 16, arabicName: 'سُورَةُ النَّحۡلِ', englishName: 'An-Nahl', englishNameTranslation: 'The Bee', revelationType: 'Meccan', revelationOrder: 70, ayahCount: 128, startJuz: 14, startPage: 267 },
  { number: 17, arabicName: 'سُورَةُ الإِسۡرَاءِ', englishName: 'Al-Isra', englishNameTranslation: 'The Night Journey', revelationType: 'Meccan', revelationOrder: 50, ayahCount: 111, startJuz: 15, startPage: 282 },
  { number: 18, arabicName: 'سُورَةُ الكَهۡفِ', englishName: 'Al-Kahf', englishNameTranslation: 'The Cave', revelationType: 'Meccan', revelationOrder: 69, ayahCount: 110, startJuz: 15, startPage: 293 },
  { number: 19, arabicName: 'سُورَةُ مَرۡيَمَ', englishName: 'Maryam', englishNameTranslation: 'Mary', revelationType: 'Meccan', revelationOrder: 44, ayahCount: 98, startJuz: 16, startPage: 305 },
  { number: 20, arabicName: 'سُورَةُ طه', englishName: 'Taha', englishNameTranslation: 'Ta-Ha', revelationType: 'Meccan', revelationOrder: 45, ayahCount: 135, startJuz: 16, startPage: 312 },
  { number: 21, arabicName: 'سُورَةُ الأَنبِيَاءِ', englishName: 'Al-Anbya', englishNameTranslation: 'The Prophets', revelationType: 'Meccan', revelationOrder: 73, ayahCount: 112, startJuz: 17, startPage: 322 },
  { number: 22, arabicName: 'سُورَةُ الحَجِّ', englishName: 'Al-Hajj', englishNameTranslation: 'The Pilgrimage', revelationType: 'Medinan', revelationOrder: 103, ayahCount: 78, startJuz: 17, startPage: 332 },
  { number: 23, arabicName: 'سُورَةُ المُؤۡمِنُونَ', englishName: "Al-Mu'minun", englishNameTranslation: 'The Believers', revelationType: 'Meccan', revelationOrder: 74, ayahCount: 118, startJuz: 18, startPage: 342 },
  { number: 24, arabicName: 'سُورَةُ النُّورِ', englishName: 'An-Nur', englishNameTranslation: 'The Light', revelationType: 'Medinan', revelationOrder: 102, ayahCount: 64, startJuz: 18, startPage: 350 },
  { number: 25, arabicName: 'سُورَةُ الفُرۡقَانِ', englishName: 'Al-Furqan', englishNameTranslation: 'The Criterion', revelationType: 'Meccan', revelationOrder: 42, ayahCount: 77, startJuz: 18, startPage: 359 },
  { number: 26, arabicName: 'سُورَةُ الشُّعَرَاءِ', englishName: "Ash-Shu'ara", englishNameTranslation: 'The Poets', revelationType: 'Meccan', revelationOrder: 47, ayahCount: 227, startJuz: 19, startPage: 367 },
  { number: 27, arabicName: 'سُورَةُ النَّمۡلِ', englishName: 'An-Naml', englishNameTranslation: 'The Ant', revelationType: 'Meccan', revelationOrder: 48, ayahCount: 93, startJuz: 19, startPage: 377 },
  { number: 28, arabicName: 'سُورَةُ القَصَصِ', englishName: 'Al-Qasas', englishNameTranslation: 'The Stories', revelationType: 'Meccan', revelationOrder: 49, ayahCount: 88, startJuz: 20, startPage: 385 },
  { number: 29, arabicName: 'سُورَةُ العَنكَبُوتِ', englishName: "Al-'Ankabut", englishNameTranslation: 'The Spider', revelationType: 'Meccan', revelationOrder: 85, ayahCount: 69, startJuz: 20, startPage: 396 },
  { number: 30, arabicName: 'سُورَةُ الرُّومِ', englishName: 'Ar-Rum', englishNameTranslation: 'The Romans', revelationType: 'Meccan', revelationOrder: 84, ayahCount: 60, startJuz: 21, startPage: 404 },
  { number: 31, arabicName: 'سُورَةُ لُقۡمَانَ', englishName: 'Luqman', englishNameTranslation: 'Luqman', revelationType: 'Meccan', revelationOrder: 57, ayahCount: 34, startJuz: 21, startPage: 411 },
  { number: 32, arabicName: 'سُورَةُ السَّجۡدَةِ', englishName: 'As-Sajdah', englishNameTranslation: 'The Prostration', revelationType: 'Meccan', revelationOrder: 75, ayahCount: 30, startJuz: 21, startPage: 415 },
  { number: 33, arabicName: 'سُورَةُ الأَحۡزَابِ', englishName: 'Al-Ahzab', englishNameTranslation: 'The Combined Forces', revelationType: 'Medinan', revelationOrder: 90, ayahCount: 73, startJuz: 21, startPage: 418 },
  { number: 34, arabicName: 'سُورَةُ سَبَإٍ', englishName: 'Saba', englishNameTranslation: 'Sheba', revelationType: 'Meccan', revelationOrder: 58, ayahCount: 54, startJuz: 22, startPage: 428 },
  { number: 35, arabicName: 'سُورَةُ فَاطِرٍ', englishName: 'Fatir', englishNameTranslation: 'Originator', revelationType: 'Meccan', revelationOrder: 43, ayahCount: 45, startJuz: 22, startPage: 434 },
  { number: 36, arabicName: 'سُورَةُ يسٓ', englishName: 'Ya-Sin', englishNameTranslation: 'Ya Sin', revelationType: 'Meccan', revelationOrder: 41, ayahCount: 83, startJuz: 22, startPage: 440 },
  { number: 37, arabicName: 'سُورَةُ الصَّافَّاتِ', englishName: 'As-Saffat', englishNameTranslation: 'Those who set the Ranks', revelationType: 'Meccan', revelationOrder: 56, ayahCount: 182, startJuz: 23, startPage: 446 },
  { number: 38, arabicName: 'سُورَةُ صٓ', englishName: 'Sad', englishNameTranslation: 'The Letter "Saad"', revelationType: 'Meccan', revelationOrder: 38, ayahCount: 88, startJuz: 23, startPage: 453 },
  { number: 39, arabicName: 'سُورَةُ الزُّمَرِ', englishName: 'Az-Zumar', englishNameTranslation: 'The Troops', revelationType: 'Meccan', revelationOrder: 59, ayahCount: 75, startJuz: 23, startPage: 458 },
  { number: 40, arabicName: 'سُورَةُ غَافِرٍ', englishName: 'Ghafir', englishNameTranslation: 'The Forgiver', revelationType: 'Meccan', revelationOrder: 60, ayahCount: 85, startJuz: 24, startPage: 467 },
  { number: 41, arabicName: 'سُورَةُ فُصِّلَتۡ', englishName: 'Fussilat', englishNameTranslation: 'Explained in Detail', revelationType: 'Meccan', revelationOrder: 61, ayahCount: 54, startJuz: 24, startPage: 477 },
  { number: 42, arabicName: 'سُورَةُ الشُّورَىٰ', englishName: 'Ash-Shuraa', englishNameTranslation: 'The Consultation', revelationType: 'Meccan', revelationOrder: 62, ayahCount: 53, startJuz: 25, startPage: 483 },
  { number: 43, arabicName: 'سُورَةُ الزُّخۡرُفِ', englishName: 'Az-Zukhruf', englishNameTranslation: 'The Ornaments of Gold', revelationType: 'Meccan', revelationOrder: 63, ayahCount: 89, startJuz: 25, startPage: 489 },
  { number: 44, arabicName: 'سُورَةُ الدُّخَانِ', englishName: 'Ad-Dukhan', englishNameTranslation: 'The Smoke', revelationType: 'Meccan', revelationOrder: 64, ayahCount: 59, startJuz: 25, startPage: 496 },
  { number: 45, arabicName: 'سُورَةُ الجَاثِيَةِ', englishName: 'Al-Jathiyah', englishNameTranslation: 'The Crouching', revelationType: 'Meccan', revelationOrder: 65, ayahCount: 37, startJuz: 25, startPage: 499 },
  { number: 46, arabicName: 'سُورَةُ الأَحۡقَافِ', englishName: 'Al-Ahqaf', englishNameTranslation: 'The Wind-Curved Sandhills', revelationType: 'Meccan', revelationOrder: 66, ayahCount: 35, startJuz: 26, startPage: 502 },
  { number: 47, arabicName: 'سُورَةُ مُحَمَّدٍ', englishName: 'Muhammad', englishNameTranslation: 'Muhammad', revelationType: 'Medinan', revelationOrder: 95, ayahCount: 38, startJuz: 26, startPage: 507 },
  { number: 48, arabicName: 'سُورَةُ الفَتۡحِ', englishName: 'Al-Fath', englishNameTranslation: 'The Victory', revelationType: 'Medinan', revelationOrder: 111, ayahCount: 29, startJuz: 26, startPage: 511 },
  { number: 49, arabicName: 'سُورَةُ الحُجُرَاتِ', englishName: 'Al-Hujurat', englishNameTranslation: 'The Rooms', revelationType: 'Medinan', revelationOrder: 106, ayahCount: 18, startJuz: 26, startPage: 515 },
  { number: 50, arabicName: 'سُورَةُ قٓ', englishName: 'Qaf', englishNameTranslation: 'The Letter "Qaf"', revelationType: 'Meccan', revelationOrder: 34, ayahCount: 45, startJuz: 26, startPage: 518 },
  { number: 51, arabicName: 'سُورَةُ الذَّارِيَاتِ', englishName: 'Adh-Dhariyat', englishNameTranslation: 'The Winnowing Winds', revelationType: 'Meccan', revelationOrder: 67, ayahCount: 60, startJuz: 26, startPage: 520 },
  { number: 52, arabicName: 'سُورَةُ الطُّورِ', englishName: 'At-Tur', englishNameTranslation: 'The Mount', revelationType: 'Meccan', revelationOrder: 76, ayahCount: 49, startJuz: 27, startPage: 523 },
  { number: 53, arabicName: 'سُورَةُ النَّجۡمِ', englishName: 'An-Najm', englishNameTranslation: 'The Star', revelationType: 'Meccan', revelationOrder: 23, ayahCount: 62, startJuz: 27, startPage: 526 },
  { number: 54, arabicName: 'سُورَةُ القَمَرِ', englishName: 'Al-Qamar', englishNameTranslation: 'The Moon', revelationType: 'Meccan', revelationOrder: 37, ayahCount: 55, startJuz: 27, startPage: 528 },
  { number: 55, arabicName: 'سُورَةُ الرَّحۡمَٰن', englishName: 'Ar-Rahman', englishNameTranslation: 'The Beneficent', revelationType: 'Medinan', revelationOrder: 97, ayahCount: 78, startJuz: 27, startPage: 531 },
  { number: 56, arabicName: 'سُورَةُ الوَاقِعَةِ', englishName: "Al-Waqi'ah", englishNameTranslation: 'The Inevitable', revelationType: 'Meccan', revelationOrder: 46, ayahCount: 96, startJuz: 27, startPage: 534 },
  { number: 57, arabicName: 'سُورَةُ الحَدِيدِ', englishName: 'Al-Hadid', englishNameTranslation: 'The Iron', revelationType: 'Medinan', revelationOrder: 94, ayahCount: 29, startJuz: 27, startPage: 537 },
  { number: 58, arabicName: 'سُورَةُ المُجَادلَةِ', englishName: 'Al-Mujadila', englishNameTranslation: 'The Pleading Woman', revelationType: 'Medinan', revelationOrder: 105, ayahCount: 22, startJuz: 28, startPage: 542 },
  { number: 59, arabicName: 'سُورَةُ الحَشۡرِ', englishName: 'Al-Hashr', englishNameTranslation: 'The Exile', revelationType: 'Medinan', revelationOrder: 101, ayahCount: 24, startJuz: 28, startPage: 545 },
  { number: 60, arabicName: 'سُورَةُ المُمۡتَحنَةِ', englishName: 'Al-Mumtahanah', englishNameTranslation: 'She that is to be examined', revelationType: 'Medinan', revelationOrder: 91, ayahCount: 13, startJuz: 28, startPage: 549 },
  { number: 61, arabicName: 'سُورَةُ الصَّفِّ', englishName: 'As-Saf', englishNameTranslation: 'The Ranks', revelationType: 'Medinan', revelationOrder: 109, ayahCount: 14, startJuz: 28, startPage: 551 },
  { number: 62, arabicName: 'سُورَةُ الجُمُعَةِ', englishName: "Al-Jumu'ah", englishNameTranslation: 'The Congregation, Friday', revelationType: 'Medinan', revelationOrder: 110, ayahCount: 11, startJuz: 28, startPage: 553 },
  { number: 63, arabicName: 'سُورَةُ المُنَافِقُونَ', englishName: 'Al-Munafiqun', englishNameTranslation: 'The Hypocrites', revelationType: 'Medinan', revelationOrder: 104, ayahCount: 11, startJuz: 28, startPage: 554 },
  { number: 64, arabicName: 'سُورَةُ التَّغَابُنِ', englishName: 'At-Taghabun', englishNameTranslation: 'The Mutual Disillusion', revelationType: 'Medinan', revelationOrder: 108, ayahCount: 18, startJuz: 28, startPage: 556 },
  { number: 65, arabicName: 'سُورَةُ الطَّلَاقِ', englishName: 'At-Talaq', englishNameTranslation: 'The Divorce', revelationType: 'Medinan', revelationOrder: 99, ayahCount: 12, startJuz: 28, startPage: 558 },
  { number: 66, arabicName: 'سُورَةُ التَّحۡرِيمِ', englishName: 'At-Tahrim', englishNameTranslation: 'The Prohibition', revelationType: 'Medinan', revelationOrder: 107, ayahCount: 12, startJuz: 28, startPage: 560 },
  { number: 67, arabicName: 'سُورَةُ المُلۡكِ', englishName: 'Al-Mulk', englishNameTranslation: 'The Sovereignty', revelationType: 'Meccan', revelationOrder: 77, ayahCount: 30, startJuz: 29, startPage: 562 },
  { number: 68, arabicName: 'سُورَةُ القَلَمِ', englishName: 'Al-Qalam', englishNameTranslation: 'The Pen', revelationType: 'Meccan', revelationOrder: 2, ayahCount: 52, startJuz: 29, startPage: 564 },
  { number: 69, arabicName: 'سُورَةُ الحَاقَّةِ', englishName: 'Al-Haqqah', englishNameTranslation: 'The Reality', revelationType: 'Meccan', revelationOrder: 78, ayahCount: 52, startJuz: 29, startPage: 566 },
  { number: 70, arabicName: 'سُورَةُ المَعَارِجِ', englishName: "Al-Ma'arij", englishNameTranslation: 'The Ascending Stairways', revelationType: 'Meccan', revelationOrder: 79, ayahCount: 44, startJuz: 29, startPage: 568 },
  { number: 71, arabicName: 'سُورَةُ نُوحٍ', englishName: 'Nuh', englishNameTranslation: 'Noah', revelationType: 'Meccan', revelationOrder: 71, ayahCount: 28, startJuz: 29, startPage: 570 },
  { number: 72, arabicName: 'سُورَةُ الجِنِّ', englishName: 'Al-Jinn', englishNameTranslation: 'The Jinn', revelationType: 'Meccan', revelationOrder: 40, ayahCount: 28, startJuz: 29, startPage: 572 },
  { number: 73, arabicName: 'سُورَةُ المُزَّمِّلِ', englishName: 'Al-Muzzammil', englishNameTranslation: 'The Enshrouded One', revelationType: 'Meccan', revelationOrder: 3, ayahCount: 20, startJuz: 29, startPage: 574 },
  { number: 74, arabicName: 'سُورَةُ المُدَّثِّرِ', englishName: 'Al-Muddaththir', englishNameTranslation: 'The Cloaked One', revelationType: 'Meccan', revelationOrder: 4, ayahCount: 56, startJuz: 29, startPage: 575 },
  { number: 75, arabicName: 'سُورَةُ القِيَامَةِ', englishName: 'Al-Qiyamah', englishNameTranslation: 'The Resurrection', revelationType: 'Meccan', revelationOrder: 31, ayahCount: 40, startJuz: 29, startPage: 577 },
  { number: 76, arabicName: 'سُورَةُ الإِنسَانِ', englishName: 'Al-Insan', englishNameTranslation: 'The Man', revelationType: 'Medinan', revelationOrder: 98, ayahCount: 31, startJuz: 29, startPage: 578 },
  { number: 77, arabicName: 'سُورَةُ المُرۡسَلَاتِ', englishName: 'Al-Mursalat', englishNameTranslation: 'The Emissaries', revelationType: 'Meccan', revelationOrder: 33, ayahCount: 50, startJuz: 29, startPage: 580 },
  { number: 78, arabicName: 'سُورَةُ النَّبَإِ', englishName: 'An-Naba', englishNameTranslation: 'The Tidings', revelationType: 'Meccan', revelationOrder: 80, ayahCount: 40, startJuz: 30, startPage: 582 },
  { number: 79, arabicName: 'سُورَةُ النَّازِعَاتِ', englishName: "An-Nazi'at", englishNameTranslation: 'Those who drag forth', revelationType: 'Meccan', revelationOrder: 81, ayahCount: 46, startJuz: 30, startPage: 583 },
  { number: 80, arabicName: 'سُورَةُ عَبَسَ', englishName: "'Abasa", englishNameTranslation: 'He Frowned', revelationType: 'Meccan', revelationOrder: 24, ayahCount: 42, startJuz: 30, startPage: 585 },
  { number: 81, arabicName: 'سُورَةُ التَّكۡوِيرِ', englishName: 'At-Takwir', englishNameTranslation: 'The Overthrowing', revelationType: 'Meccan', revelationOrder: 7, ayahCount: 29, startJuz: 30, startPage: 586 },
  { number: 82, arabicName: 'سُورَةُ الانفِطَارِ', englishName: 'Al-Infitar', englishNameTranslation: 'The Cleaving', revelationType: 'Meccan', revelationOrder: 82, ayahCount: 19, startJuz: 30, startPage: 587 },
  { number: 83, arabicName: 'سُورَةُ المُطَفِّفِينَ', englishName: 'Al-Mutaffifin', englishNameTranslation: 'The Defrauding', revelationType: 'Meccan', revelationOrder: 86, ayahCount: 36, startJuz: 30, startPage: 587 },
  { number: 84, arabicName: 'سُورَةُ الانشِقَاقِ', englishName: 'Al-Inshiqaq', englishNameTranslation: 'The Sundering', revelationType: 'Meccan', revelationOrder: 83, ayahCount: 25, startJuz: 30, startPage: 589 },
  { number: 85, arabicName: 'سُورَةُ البُرُوجِ', englishName: 'Al-Buruj', englishNameTranslation: 'The Mansions of the Stars', revelationType: 'Meccan', revelationOrder: 27, ayahCount: 22, startJuz: 30, startPage: 590 },
  { number: 86, arabicName: 'سُورَةُ الطَّارِقِ', englishName: 'At-Tariq', englishNameTranslation: 'The Nightcommer', revelationType: 'Meccan', revelationOrder: 36, ayahCount: 17, startJuz: 30, startPage: 591 },
  { number: 87, arabicName: 'سُورَةُ الأَعۡلَىٰ', englishName: "Al-A'la", englishNameTranslation: 'The Most High', revelationType: 'Meccan', revelationOrder: 8, ayahCount: 19, startJuz: 30, startPage: 591 },
  { number: 88, arabicName: 'سُورَةُ الغَاشِيَةِ', englishName: 'Al-Ghashiyah', englishNameTranslation: 'The Overwhelming', revelationType: 'Meccan', revelationOrder: 68, ayahCount: 26, startJuz: 30, startPage: 592 },
  { number: 89, arabicName: 'سُورَةُ الفَجۡرِ', englishName: 'Al-Fajr', englishNameTranslation: 'The Dawn', revelationType: 'Meccan', revelationOrder: 10, ayahCount: 30, startJuz: 30, startPage: 593 },
  { number: 90, arabicName: 'سُورَةُ البَلَدِ', englishName: 'Al-Balad', englishNameTranslation: 'The City', revelationType: 'Meccan', revelationOrder: 35, ayahCount: 20, startJuz: 30, startPage: 594 },
  { number: 91, arabicName: 'سُورَةُ الشَّمۡسِ', englishName: 'Ash-Shams', englishNameTranslation: 'The Sun', revelationType: 'Meccan', revelationOrder: 26, ayahCount: 15, startJuz: 30, startPage: 595 },
  { number: 92, arabicName: 'سُورَةُ اللَّيۡلِ', englishName: 'Al-Layl', englishNameTranslation: 'The Night', revelationType: 'Meccan', revelationOrder: 9, ayahCount: 21, startJuz: 30, startPage: 595 },
  { number: 93, arabicName: 'سُورَةُ الضُّحَىٰ', englishName: 'Ad-Duhaa', englishNameTranslation: 'The Morning Hours', revelationType: 'Meccan', revelationOrder: 11, ayahCount: 11, startJuz: 30, startPage: 596 },
  { number: 94, arabicName: 'سُورَةُ الشَّرۡحِ', englishName: 'Ash-Sharh', englishNameTranslation: 'The Relief', revelationType: 'Meccan', revelationOrder: 12, ayahCount: 8, startJuz: 30, startPage: 596 },
  { number: 95, arabicName: 'سُورَةُ التِّينِ', englishName: 'At-Tin', englishNameTranslation: 'The Fig', revelationType: 'Meccan', revelationOrder: 28, ayahCount: 8, startJuz: 30, startPage: 597 },
  { number: 96, arabicName: 'سُورَةُ العَلَقِ', englishName: "Al-'Alaq", englishNameTranslation: 'The Clot', revelationType: 'Meccan', revelationOrder: 1, ayahCount: 19, startJuz: 30, startPage: 597 },
  { number: 97, arabicName: 'سُورَةُ القَدۡرِ', englishName: 'Al-Qadr', englishNameTranslation: 'The Power', revelationType: 'Meccan', revelationOrder: 25, ayahCount: 5, startJuz: 30, startPage: 598 },
  { number: 98, arabicName: 'سُورَةُ البَيِّنَةِ', englishName: 'Al-Bayyinah', englishNameTranslation: 'The Clear Proof', revelationType: 'Medinan', revelationOrder: 100, ayahCount: 8, startJuz: 30, startPage: 598 },
  { number: 99, arabicName: 'سُورَةُ الزَّلۡزَلَةِ', englishName: 'Az-Zalzalah', englishNameTranslation: 'The Earthquake', revelationType: 'Medinan', revelationOrder: 93, ayahCount: 8, startJuz: 30, startPage: 599 },
  { number: 100, arabicName: 'سُورَةُ العَادِيَاتِ', englishName: "Al-'Adiyat", englishNameTranslation: 'The Courser', revelationType: 'Meccan', revelationOrder: 14, ayahCount: 11, startJuz: 30, startPage: 599 },
  { number: 101, arabicName: 'سُورَةُ القَارِعَةِ', englishName: "Al-Qari'ah", englishNameTranslation: 'The Calamity', revelationType: 'Meccan', revelationOrder: 30, ayahCount: 11, startJuz: 30, startPage: 600 },
  { number: 102, arabicName: 'سُورَةُ التَّكَاثُرِ', englishName: 'At-Takathur', englishNameTranslation: 'The Rivalry in world increase', revelationType: 'Meccan', revelationOrder: 16, ayahCount: 8, startJuz: 30, startPage: 600 },
  { number: 103, arabicName: 'سُورَةُ العَصۡرِ', englishName: "Al-'Asr", englishNameTranslation: 'The Declining Day', revelationType: 'Meccan', revelationOrder: 13, ayahCount: 3, startJuz: 30, startPage: 601 },
  { number: 104, arabicName: 'سُورَةُ الهُمَزَةِ', englishName: 'Al-Humazah', englishNameTranslation: 'The Traducer', revelationType: 'Meccan', revelationOrder: 32, ayahCount: 9, startJuz: 30, startPage: 601 },
  { number: 105, arabicName: 'سُورَةُ الفِيلِ', englishName: 'Al-Fil', englishNameTranslation: 'The Elephant', revelationType: 'Meccan', revelationOrder: 19, ayahCount: 5, startJuz: 30, startPage: 601 },
  { number: 106, arabicName: 'سُورَةُ قُرَيۡشٍ', englishName: 'Quraysh', englishNameTranslation: 'Quraysh', revelationType: 'Meccan', revelationOrder: 29, ayahCount: 4, startJuz: 30, startPage: 602 },
  { number: 107, arabicName: 'سُورَةُ المَاعُونِ', englishName: "Al-Ma'un", englishNameTranslation: 'The Small kindnesses', revelationType: 'Meccan', revelationOrder: 17, ayahCount: 7, startJuz: 30, startPage: 602 },
  { number: 108, arabicName: 'سُورَةُ الكَوۡثَرِ', englishName: 'Al-Kawthar', englishNameTranslation: 'The Abundance', revelationType: 'Meccan', revelationOrder: 15, ayahCount: 3, startJuz: 30, startPage: 602 },
  { number: 109, arabicName: 'سُورَةُ الكَافِرُونَ', englishName: 'Al-Kafirun', englishNameTranslation: 'The Disbelievers', revelationType: 'Meccan', revelationOrder: 18, ayahCount: 6, startJuz: 30, startPage: 603 },
  { number: 110, arabicName: 'سُورَةُ النَّصۡرِ', englishName: 'An-Nasr', englishNameTranslation: 'The Divine Support', revelationType: 'Medinan', revelationOrder: 114, ayahCount: 3, startJuz: 30, startPage: 603 },
  { number: 111, arabicName: 'سُورَةُ المَسَدِ', englishName: 'Al-Masad', englishNameTranslation: 'The Palm Fiber', revelationType: 'Meccan', revelationOrder: 6, ayahCount: 5, startJuz: 30, startPage: 603 },
  { number: 112, arabicName: 'سُورَةُ الإِخۡلَاصِ', englishName: 'Al-Ikhlas', englishNameTranslation: 'The Sincerity', revelationType: 'Meccan', revelationOrder: 22, ayahCount: 4, startJuz: 30, startPage: 604 },
  { number: 113, arabicName: 'سُورَةُ الفَلَقِ', englishName: 'Al-Falaq', englishNameTranslation: 'The Daybreak', revelationType: 'Meccan', revelationOrder: 20, ayahCount: 5, startJuz: 30, startPage: 604 },
  { number: 114, arabicName: 'سُورَةُ النَّاسِ', englishName: 'An-Nas', englishNameTranslation: 'Mankind', revelationType: 'Meccan', revelationOrder: 21, ayahCount: 6, startJuz: 30, startPage: 604 },
] as const;

export const SURAHS = SURAH_METADATA;

export const PAGE_STARTS: readonly (readonly [number, number])[] = [
  [1, 1], [2, 1], [2, 6], [2, 17], [2, 25], [2, 30], [2, 38], [2, 49], [2, 58], [2, 62], [2, 70], [2, 77],
  [2, 84], [2, 89], [2, 94], [2, 102], [2, 106], [2, 113], [2, 120], [2, 127], [2, 135], [2, 142], [2, 146], [2, 154],
  [2, 164], [2, 170], [2, 177], [2, 182], [2, 187], [2, 191], [2, 197], [2, 203], [2, 211], [2, 216], [2, 220], [2, 225],
  [2, 231], [2, 234], [2, 238], [2, 246], [2, 249], [2, 253], [2, 257], [2, 260], [2, 265], [2, 270], [2, 275], [2, 282],
  [2, 283], [3, 1], [3, 10], [3, 16], [3, 23], [3, 30], [3, 38], [3, 46], [3, 53], [3, 62], [3, 71], [3, 78],
  [3, 84], [3, 92], [3, 101], [3, 109], [3, 116], [3, 122], [3, 133], [3, 141], [3, 149], [3, 154], [3, 158], [3, 166],
  [3, 174], [3, 181], [3, 187], [3, 195], [4, 1], [4, 7], [4, 12], [4, 15], [4, 20], [4, 24], [4, 27], [4, 34],
  [4, 38], [4, 45], [4, 52], [4, 60], [4, 66], [4, 75], [4, 80], [4, 87], [4, 92], [4, 95], [4, 102], [4, 106],
  [4, 114], [4, 122], [4, 128], [4, 135], [4, 141], [4, 148], [4, 155], [4, 163], [4, 171], [4, 176], [5, 3], [5, 6],
  [5, 10], [5, 14], [5, 18], [5, 24], [5, 32], [5, 37], [5, 42], [5, 46], [5, 51], [5, 58], [5, 65], [5, 71],
  [5, 77], [5, 83], [5, 90], [5, 96], [5, 104], [5, 109], [5, 114], [6, 1], [6, 9], [6, 19], [6, 28], [6, 36],
  [6, 45], [6, 53], [6, 60], [6, 69], [6, 74], [6, 82], [6, 91], [6, 95], [6, 102], [6, 111], [6, 119], [6, 125],
  [6, 132], [6, 138], [6, 143], [6, 147], [6, 152], [6, 158], [7, 1], [7, 12], [7, 23], [7, 31], [7, 38], [7, 44],
  [7, 52], [7, 58], [7, 68], [7, 74], [7, 82], [7, 88], [7, 96], [7, 105], [7, 121], [7, 131], [7, 138], [7, 144],
  [7, 150], [7, 156], [7, 160], [7, 164], [7, 171], [7, 179], [7, 188], [7, 196], [8, 1], [8, 9], [8, 17], [8, 26],
  [8, 34], [8, 41], [8, 46], [8, 53], [8, 62], [8, 70], [9, 1], [9, 7], [9, 14], [9, 21], [9, 27], [9, 32],
  [9, 37], [9, 41], [9, 48], [9, 55], [9, 62], [9, 69], [9, 73], [9, 80], [9, 87], [9, 94], [9, 100], [9, 107],
  [9, 112], [9, 118], [9, 123], [10, 1], [10, 7], [10, 15], [10, 21], [10, 26], [10, 34], [10, 43], [10, 54], [10, 62],
  [10, 71], [10, 79], [10, 89], [10, 98], [10, 107], [11, 6], [11, 13], [11, 20], [11, 29], [11, 38], [11, 46], [11, 54],
  [11, 63], [11, 72], [11, 82], [11, 89], [11, 98], [11, 109], [11, 118], [12, 5], [12, 15], [12, 23], [12, 31], [12, 38],
  [12, 44], [12, 53], [12, 64], [12, 70], [12, 79], [12, 87], [12, 96], [12, 104], [13, 1], [13, 6], [13, 14], [13, 19],
  [13, 29], [13, 35], [13, 43], [14, 6], [14, 11], [14, 19], [14, 25], [14, 34], [14, 43], [15, 1], [15, 16], [15, 32],
  [15, 52], [15, 71], [15, 91], [16, 7], [16, 15], [16, 27], [16, 35], [16, 43], [16, 55], [16, 65], [16, 73], [16, 80],
  [16, 88], [16, 94], [16, 103], [16, 111], [16, 119], [17, 1], [17, 8], [17, 18], [17, 28], [17, 39], [17, 50], [17, 59],
  [17, 67], [17, 76], [17, 87], [17, 97], [17, 105], [18, 5], [18, 16], [18, 21], [18, 28], [18, 35], [18, 46], [18, 54],
  [18, 62], [18, 75], [18, 84], [18, 98], [19, 1], [19, 12], [19, 26], [19, 39], [19, 52], [19, 65], [19, 77], [19, 96],
  [20, 13], [20, 38], [20, 52], [20, 65], [20, 77], [20, 88], [20, 99], [20, 114], [20, 126], [21, 1], [21, 11], [21, 25],
  [21, 36], [21, 45], [21, 58], [21, 73], [21, 82], [21, 91], [21, 102], [22, 1], [22, 6], [22, 16], [22, 24], [22, 31],
  [22, 39], [22, 47], [22, 56], [22, 65], [22, 73], [23, 1], [23, 18], [23, 28], [23, 43], [23, 60], [23, 75], [23, 90],
  [23, 105], [24, 1], [24, 11], [24, 21], [24, 28], [24, 32], [24, 37], [24, 44], [24, 54], [24, 59], [24, 62], [25, 3],
  [25, 12], [25, 21], [25, 33], [25, 44], [25, 56], [25, 68], [26, 1], [26, 20], [26, 40], [26, 61], [26, 84], [26, 112],
  [26, 137], [26, 160], [26, 184], [26, 207], [27, 1], [27, 14], [27, 23], [27, 36], [27, 45], [27, 56], [27, 64], [27, 77],
  [27, 89], [28, 6], [28, 14], [28, 22], [28, 29], [28, 36], [28, 44], [28, 51], [28, 60], [28, 71], [28, 78], [28, 85],
  [29, 7], [29, 15], [29, 24], [29, 31], [29, 39], [29, 46], [29, 53], [29, 64], [30, 6], [30, 16], [30, 25], [30, 33],
  [30, 42], [30, 51], [31, 1], [31, 12], [31, 20], [31, 29], [32, 1], [32, 12], [32, 21], [33, 1], [33, 7], [33, 16],
  [33, 23], [33, 31], [33, 36], [33, 44], [33, 51], [33, 55], [33, 63], [34, 1], [34, 8], [34, 15], [34, 23], [34, 32],
  [34, 40], [34, 49], [35, 4], [35, 12], [35, 19], [35, 31], [35, 39], [35, 45], [36, 13], [36, 28], [36, 41], [36, 55],
  [36, 71], [37, 1], [37, 25], [37, 52], [37, 77], [37, 103], [37, 127], [37, 154], [38, 1], [38, 17], [38, 27], [38, 43],
  [38, 62], [38, 84], [39, 6], [39, 11], [39, 22], [39, 32], [39, 41], [39, 48], [39, 57], [39, 68], [39, 75], [40, 8],
  [40, 17], [40, 26], [40, 34], [40, 41], [40, 50], [40, 59], [40, 67], [40, 78], [41, 1], [41, 12], [41, 21], [41, 30],
  [41, 39], [41, 47], [42, 1], [42, 11], [42, 16], [42, 23], [42, 32], [42, 45], [42, 52], [43, 11], [43, 23], [43, 34],
  [43, 48], [43, 61], [43, 74], [44, 1], [44, 19], [44, 40], [45, 1], [45, 14], [45, 23], [45, 33], [46, 6], [46, 15],
  [46, 21], [46, 29], [47, 1], [47, 12], [47, 20], [47, 30], [48, 1], [48, 10], [48, 16], [48, 24], [48, 29], [49, 5],
  [49, 12], [50, 1], [50, 16], [50, 36], [51, 7], [51, 31], [51, 52], [52, 15], [52, 32], [53, 1], [53, 27], [53, 45],
  [54, 7], [54, 28], [54, 50], [55, 17], [55, 41], [55, 68], [56, 17], [56, 51], [56, 77], [57, 4], [57, 12], [57, 19],
  [57, 25], [58, 1], [58, 7], [58, 12], [58, 22], [59, 4], [59, 10], [59, 17], [60, 1], [60, 6], [60, 12], [61, 6],
  [62, 1], [62, 9], [63, 5], [64, 1], [64, 10], [65, 1], [65, 6], [66, 1], [66, 8], [67, 1], [67, 13], [67, 27],
  [68, 16], [68, 43], [69, 9], [69, 35], [70, 11], [70, 40], [71, 11], [72, 1], [72, 14], [73, 1], [73, 20], [74, 18],
  [74, 48], [75, 20], [76, 6], [76, 26], [77, 20], [78, 1], [78, 31], [79, 16], [80, 1], [81, 1], [82, 1], [83, 7],
  [83, 35], [85, 1], [86, 1], [87, 16], [89, 1], [89, 24], [91, 1], [92, 15], [95, 1], [97, 1], [98, 8], [100, 10],
  [103, 1], [106, 1], [109, 1], [112, 1],
] as const;

const AYAH_KEY_REGEX = /^(\d+):(\d+)$/;

export function isValidSurah(surahNumber: number): boolean {
  return Number.isInteger(surahNumber) && surahNumber >= 1 && surahNumber <= TOTAL_SURAHS;
}

export function isValidReference(surahNumber: number, ayahNumber: number): boolean {
  if (!isValidSurah(surahNumber) || !Number.isInteger(ayahNumber)) {
    return false;
  }
  const meta = SURAH_METADATA[surahNumber - 1];
  return ayahNumber >= 1 && ayahNumber <= meta.ayahCount;
}

export function isValidJuz(juzNumber: number): boolean {
  return Number.isInteger(juzNumber) && juzNumber >= 1 && juzNumber <= TOTAL_JUZ;
}

export function isValidPage(pageNumber: number): boolean {
  return Number.isInteger(pageNumber) && pageNumber >= 1 && pageNumber <= TOTAL_PAGES;
}

export function getSurahMeta(surahNumber: number): SurahMeta | null {
  if (!isValidSurah(surahNumber)) {
    return null;
  }
  return SURAH_METADATA[surahNumber - 1];
}

export function getMaxAyahs(surahNumber: number): number {
  const meta = getSurahMeta(surahNumber);
  return meta ? meta.ayahCount : 0;
}

export function getJuzStart(juzNumber: number): { surah: number; ayah: number } | null {
  if (!isValidJuz(juzNumber)) {
    return null;
  }
  const juz = JUZ_METADATA[juzNumber - 1];
  return { surah: juz.startSurah, ayah: juz.startAyah };
}

export function getPageStart(pageNumber: number): { surah: number; ayah: number } | null {
  if (!isValidPage(pageNumber)) {
    return null;
  }
  const [surah, ayah] = PAGE_STARTS[pageNumber - 1];
  return { surah, ayah };
}

export function parseAyahKey(key: string): { surah: number; ayah: number } | null {
  const match = AYAH_KEY_REGEX.exec(key.trim());
  if (!match) {
    return null;
  }
  const surah = Number.parseInt(match[1], 10);
  const ayah = Number.parseInt(match[2], 10);
  if (!isValidReference(surah, ayah)) {
    return null;
  }
  return { surah, ayah };
}
