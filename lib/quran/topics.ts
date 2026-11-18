import type { TopicDefinition } from './types';

export const QURAN_TOPICS: readonly TopicDefinition[] = [
  {
    id: 'rabbana-duas',
    slug: 'rabbana-duas',
    title: 'Rabbana Duas',
    arabicTitle: 'رَبَّنَا دُعَاء',
    description: 'Supplications beginning with "Our Lord" taught directly in the Quran for guidance, patience, and mercy.',
    iconName: 'HeartHandshake',
    verses: [
      { surah: 2, ayah: 201, key: '2:201', label: 'Good in this world and the Hereafter' },
      { surah: 2, ayah: 250, key: '2:250', label: 'Pour patience upon us and make our steps firm' },
      { surah: 2, ayah: 286, key: '2:286', label: 'Ease, pardon, and mercy from burdens' },
      { surah: 3, ayah: 8, key: '3:8', label: 'Steadfastness of heart after guidance' },
      { surah: 14, ayah: 40, key: '14:40', label: 'Establishing prayer and acceptance of supplication' },
      { surah: 25, ayah: 74, key: '25:74', label: 'Comfort in righteous spouses and offspring' },
    ],
  },
  {
    id: 'patience-sabr',
    slug: 'patience-sabr',
    title: 'Patience & Perseverance',
    arabicTitle: 'الصَّبْر',
    description: 'Verses on steadfastness in hardship, seeking Allah’s aid through prayer, and the boundless reward of the patient.',
    iconName: 'ShieldCheck',
    verses: [
      { surah: 2, ayah: 153, key: '2:153', label: 'Seek help through patience and prayer' },
      { surah: 2, ayah: 155, key: '2:155', label: 'Glad tidings to those who are patient in trials' },
      { surah: 3, ayah: 200, key: '3:200', label: 'Persevere, endure, and remain mindful of Allah' },
      { surah: 16, ayah: 127, key: '16:127', label: 'Your patience is only through Allah' },
      { surah: 39, ayah: 10, key: '39:10', label: 'The patient are rewarded without account' },
      { surah: 103, ayah: 3, key: '103:3', label: 'Counselling one another to truth and patience' },
    ],
  },
  {
    id: 'gratitude-shukr',
    slug: 'gratitude-shukr',
    title: 'Gratitude & Thankfulness',
    arabicTitle: 'الشُّكْر',
    description: 'Reflections on remembering Allah, recognizing His countless blessings, and the promise of increase for the grateful.',
    iconName: 'Sparkles',
    verses: [
      { surah: 2, ayah: 152, key: '2:152', label: 'Remember Me, be grateful, and do not deny' },
      { surah: 14, ayah: 7, key: '14:7', label: 'If you are grateful, I will surely increase you' },
      { surah: 16, ayah: 78, key: '16:78', label: 'Gifts of hearing, sight, and hearts' },
      { surah: 27, ayah: 19, key: '27:19', label: "Prophet Sulayman's supplication for gratitude" },
      { surah: 31, ayah: 12, key: '31:12', label: 'Wisdom given to Luqman: be grateful to Allah' },
      { surah: 55, ayah: 13, key: '55:13', label: 'Which of your Lord’s favors would you deny?' },
    ],
  },
  {
    id: 'justice-adl',
    slug: 'justice-adl',
    title: 'Justice & Fairness',
    arabicTitle: 'العَدْل',
    description: 'Quranic principles of equity, truthful testimony, impartial judgment, and upholding balance.',
    iconName: 'Scale',
    verses: [
      { surah: 4, ayah: 135, key: '4:135', label: 'Stand persistently firm in justice as witnesses' },
      { surah: 5, ayah: 8, key: '5:8', label: 'Do not let enmity keep you from being just' },
      { surah: 16, ayah: 90, key: '16:90', label: 'Allah commands justice, excellence, and generosity' },
      { surah: 42, ayah: 15, key: '42:15', label: 'Commanded to judge justly among people' },
      { surah: 49, ayah: 9, key: '49:9', label: 'Reconciling disputes with justice and equity' },
      { surah: 57, ayah: 25, key: '57:25', label: 'Scripture and the balance sent down for justice' },
    ],
  },
  {
    id: 'mercy-rahmah',
    slug: 'mercy-rahmah',
    title: 'Mercy & Compassion',
    arabicTitle: 'الرَّحْمَة',
    description: 'Verses highlighting Allah’s all-encompassing mercy, hope for repentance, and compassion among believers.',
    iconName: 'Sun',
    verses: [
      { surah: 6, ayah: 54, key: '6:54', label: 'Your Lord has decreed mercy upon Himself' },
      { surah: 7, ayah: 156, key: '7:156', label: 'My mercy encompasses all things' },
      { surah: 21, ayah: 107, key: '21:107', label: 'Sent only as a mercy to the worlds' },
      { surah: 39, ayah: 53, key: '39:53', label: 'Do not despair of the mercy of Allah' },
      { surah: 40, ayah: 7, key: '40:7', label: 'You encompass all things in mercy and knowledge' },
      { surah: 90, ayah: 17, key: '90:17', label: 'Counselling one another to patience and compassion' },
    ],
  },
  {
    id: 'stories-prophets',
    slug: 'stories-prophets',
    title: 'Stories of the Prophets',
    arabicTitle: 'قَصَصُ الأَنْبِيَاء',
    description: 'Key moments from the narratives of Adam, Nuh, Yusuf, Musa, and Maryam as lessons for reflection.',
    iconName: 'ScrollText',
    verses: [
      { surah: 2, ayah: 30, key: '2:30', label: 'Appointment of Adam as vicegerent on earth' },
      { surah: 3, ayah: 33, key: '3:33', label: 'Chosen prophets and righteous families' },
      { surah: 11, ayah: 42, key: '11:42', label: 'Prophet Nuh calling out to his son' },
      { surah: 12, ayah: 4, key: '12:4', label: "Prophet Yusuf's dream of eleven stars" },
      { surah: 19, ayah: 16, key: '19:16', label: 'Mention of Maryam withdrawing to an eastern place' },
      { surah: 28, ayah: 7, key: '28:7', label: "Inspiration revealed to Musa's mother" },
    ],
  },
  {
    id: 'knowledge-wisdom',
    slug: 'knowledge-wisdom',
    title: 'Knowledge & Wisdom',
    arabicTitle: 'العِلْمُ وَالحِكْمَة',
    description: 'Verses honoring learning, reflection, sound wisdom, and the distinction of those given knowledge.',
    iconName: 'BookOpen',
    verses: [
      { surah: 2, ayah: 269, key: '2:269', label: 'Whoever is given wisdom is given abundant good' },
      { surah: 20, ayah: 114, key: '20:114', label: 'My Lord, increase me in knowledge' },
      { surah: 35, ayah: 28, key: '35:28', label: 'Those with knowledge truly fear Allah' },
      { surah: 39, ayah: 9, key: '39:9', label: 'Are those who know equal to those who do not?' },
      { surah: 58, ayah: 11, key: '58:11', label: 'Allah raises believers and those given knowledge in degrees' },
      { surah: 96, ayah: 1, key: '96:1', label: 'Recite in the name of your Lord who created' },
    ],
  },
  {
    id: 'remembrance-night-prayer',
    slug: 'remembrance-night-prayer',
    title: 'Remembrance & Night Prayer',
    arabicTitle: 'الذِّكْرُ وَالقِيَام',
    description: 'Tranquility of the heart in dhikr and the spiritual discipline of standing in prayer during the night.',
    iconName: 'Moon',
    verses: [
      { surah: 2, ayah: 152, key: '2:152', label: 'Remember Me and I will remember you' },
      { surah: 13, ayah: 28, key: '13:28', label: 'Assuredly, in the remembrance of Allah do hearts find rest' },
      { surah: 17, ayah: 79, key: '17:79', label: 'Keep vigil in the night with the Quran as an extra prayer' },
      { surah: 33, ayah: 41, key: '33:41', label: 'O you who believe, remember Allah with much remembrance' },
      { surah: 51, ayah: 17, key: '51:17', label: 'They used to sleep but little of the night' },
      { surah: 73, ayah: 2, key: '73:2', label: 'Arise to pray by night, except a little' },
    ],
  },
] as const;

const TOPIC_BY_SLUG: Record<string, TopicDefinition> = Object.fromEntries(
  QURAN_TOPICS.map((topic) => [topic.slug, topic])
);

export function getTopicBySlug(slug: string): TopicDefinition | undefined {
  return Object.hasOwn(TOPIC_BY_SLUG, slug) ? TOPIC_BY_SLUG[slug] : undefined;
}

export const ALL_TOPIC_VERSE_KEYS: readonly string[] = QURAN_TOPICS.flatMap((topic) =>
  topic.verses.map((verse) => verse.key)
);
