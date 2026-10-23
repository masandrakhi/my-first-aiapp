/**
 * The Coach's curated habit list: the only habits it recommends by id. Plain data, maintained by hand.
 * Deliberately no URL, brand, product or sponsor fields; wording stays small, wholesome and non-medical.
 */
import { HABIT_COLOR_OPTIONS } from '../../src/lib/palette.js'

export const CATALOG_CATEGORIES = [
  'sleep', 'energy', 'focus', 'stress', 'fitness', 'nutrition', 'screen-time', 'social', 'learning', 'tidiness',
] as const

export type CatalogCategory = (typeof CATALOG_CATEGORIES)[number]

export interface CatalogHabit {
  /** Stable slug; proposals refer to habits by this id, so never rename one. */
  id: string
  /** At most NAME_MAX (40) characters, like any habit name. */
  name: string
  emoji: string
  /** One of HABIT_COLORS. */
  color: string
  category: CatalogCategory
  tags: string[]
  /** One short sentence shown under the suggestion. */
  why: string
}

type PaletteName = (typeof HABIT_COLOR_OPTIONS)[number]['name']
const hex = (name: PaletteName): string => HABIT_COLOR_OPTIONS.find((c) => c.name === name)!.hex

/** Each category keeps one colour, so suggestions from the same area look related. */
const CATEGORY_COLOR: Record<CatalogCategory, string> = {
  sleep: hex('Purple'),
  energy: hex('Amber'),
  focus: hex('Blue'),
  stress: hex('Teal'),
  fitness: hex('Orange'),
  nutrition: hex('Emerald'),
  'screen-time': hex('Rose'),
  social: hex('Pink'),
  learning: hex('Blue'),
  tidiness: hex('Teal'),
}

type Entry = Omit<CatalogHabit, 'color'>

const ENTRIES: Entry[] = [
  // Sleep
  { id: 'consistent-bedtime', name: 'Go to bed at the same time', emoji: '🛏️', category: 'sleep', tags: ['sleep', 'tired', 'routine', 'night', 'insomnia'], why: 'A steady bedtime helps your body know when to wind down.' },
  { id: 'no-screens-before-bed', name: 'No screens 30 min before bed', emoji: '🌙', category: 'sleep', tags: ['sleep', 'screens', 'phone', 'night', 'relax'], why: 'Dimmer, quieter evenings make it easier to fall asleep.' },
  { id: 'evening-wind-down', name: 'Evening wind-down routine', emoji: '🧘', category: 'sleep', tags: ['sleep', 'relax', 'calm', 'night', 'routine'], why: 'A short ritual signals that the day is done.' },
  { id: 'morning-daylight', name: 'Get daylight in the morning', emoji: '☀️', category: 'sleep', tags: ['sleep', 'energy', 'morning', 'outdoors', 'mood'], why: 'Morning light helps set a natural daily rhythm.' },

  // Energy
  { id: 'drink-water-morning', name: 'Drink a glass of water on waking', emoji: '💧', category: 'energy', tags: ['energy', 'water', 'hydration', 'morning', 'tired'], why: 'Starting the day hydrated is an easy early win.' },
  { id: 'short-walk-after-lunch', name: 'Short walk after lunch', emoji: '🚶', category: 'energy', tags: ['energy', 'walk', 'movement', 'afternoon', 'tired'], why: 'A little movement can lift the afternoon slump.' },
  { id: 'stretch-break', name: 'Take a stretch break', emoji: '🌿', category: 'energy', tags: ['energy', 'stretch', 'desk', 'movement', 'break'], why: 'Standing up and stretching refreshes body and mind.' },
  { id: 'limit-late-coffee', name: 'No coffee after 2 pm', emoji: '☕', category: 'energy', tags: ['energy', 'coffee', 'caffeine', 'sleep', 'afternoon'], why: 'Earlier coffee leaves room for a calmer evening.' },

  // Focus
  { id: 'plan-top-three', name: 'Write my top 3 tasks for the day', emoji: '📝', category: 'focus', tags: ['focus', 'planning', 'productivity', 'morning', 'work'], why: 'Knowing your priorities makes it easier to start.' },
  { id: 'focus-block', name: 'One 25-minute focus block', emoji: '🎯', category: 'focus', tags: ['focus', 'productivity', 'work', 'study', 'procrastination'], why: 'A short, timed block makes hard work feel doable.' },
  { id: 'single-tasking', name: 'Do one thing at a time', emoji: '🧠', category: 'focus', tags: ['focus', 'attention', 'work', 'calm'], why: 'Single-tasking helps you finish what you start.' },
  { id: 'clear-desk-start', name: 'Clear my desk before starting', emoji: '💻', category: 'focus', tags: ['focus', 'work', 'tidy', 'desk', 'study'], why: 'A clear space means fewer distractions.' },

  // Stress
  { id: 'deep-breaths', name: 'Take five slow breaths', emoji: '🧘', category: 'stress', tags: ['stress', 'calm', 'anxious', 'breathing', 'relax'], why: 'A few slow breaths can help you pause and reset.' },
  { id: 'gratitude-note', name: 'Write one thing I’m grateful for', emoji: '🙏', category: 'stress', tags: ['stress', 'mood', 'gratitude', 'journal', 'positive'], why: 'Noticing good moments shifts attention gently.' },
  { id: 'journal-few-lines', name: 'Journal a few lines', emoji: '✍️', category: 'stress', tags: ['stress', 'journal', 'writing', 'reflect', 'mood'], why: 'Writing thoughts down can make them feel lighter.' },
  { id: 'time-outdoors', name: 'Spend 10 minutes outdoors', emoji: '🌱', category: 'stress', tags: ['stress', 'outdoors', 'nature', 'mood', 'calm'], why: 'Fresh air and a change of scene help you unwind.' },

  // Fitness
  { id: 'daily-walk', name: 'Walk for 20 minutes', emoji: '🚶', category: 'fitness', tags: ['fitness', 'walk', 'exercise', 'movement', 'outdoors'], why: 'Walking is a simple way to move more every day.' },
  { id: 'bodyweight-set', name: 'Do a short bodyweight workout', emoji: '🏋️', category: 'fitness', tags: ['fitness', 'exercise', 'strength', 'workout', 'home'], why: 'A few minutes of strength work adds up over time.' },
  { id: 'take-the-stairs', name: 'Take the stairs', emoji: '🏃', category: 'fitness', tags: ['fitness', 'movement', 'exercise', 'work'], why: 'Small choices like the stairs keep you active.' },
  { id: 'morning-stretch', name: 'Stretch for 5 minutes', emoji: '🌿', category: 'fitness', tags: ['fitness', 'stretch', 'flexibility', 'morning', 'movement'], why: 'Gentle stretching helps you feel loose and ready.' },

  // Nutrition
  { id: 'eat-a-vegetable', name: 'Eat a portion of vegetables', emoji: '🥦', category: 'nutrition', tags: ['nutrition', 'food', 'vegetables', 'eating', 'healthy'], why: 'Adding colour to a meal is an easy, positive step.' },
  { id: 'fruit-snack', name: 'Have fruit as a snack', emoji: '🍎', category: 'nutrition', tags: ['nutrition', 'food', 'snack', 'fruit', 'eating'], why: 'Fruit is a simple, tasty snack to reach for.' },
  { id: 'water-bottle', name: 'Keep a water bottle nearby', emoji: '💧', category: 'nutrition', tags: ['nutrition', 'water', 'hydration', 'energy'], why: 'Having water close makes drinking it effortless.' },
  { id: 'cook-at-home', name: 'Cook a meal at home', emoji: '🥗', category: 'nutrition', tags: ['nutrition', 'cooking', 'food', 'meals', 'money'], why: 'Cooking puts you in charge of what’s on the plate.' },

  // Screen time
  { id: 'phone-free-meals', name: 'Phone-free meals', emoji: '📵', category: 'screen-time', tags: ['screen-time', 'phone', 'screens', 'meals', 'mindful'], why: 'Meals without screens are more relaxed and present.' },
  { id: 'no-phone-first-30-min', name: 'No phone in the first 30 min', emoji: '⏰', category: 'screen-time', tags: ['screen-time', 'phone', 'morning', 'focus', 'social media'], why: 'A calm start sets the tone for the day.' },
  { id: 'notifications-off', name: 'Turn off one app’s notifications', emoji: '📵', category: 'screen-time', tags: ['screen-time', 'phone', 'notifications', 'focus', 'distraction'], why: 'Fewer pings means fewer interruptions.' },
  { id: 'screen-break', name: 'Look away from screens hourly', emoji: '😊', category: 'screen-time', tags: ['screen-time', 'screens', 'eyes', 'break', 'work'], why: 'Regular screen breaks give your eyes a rest.' },

  // Social
  { id: 'message-a-friend', name: 'Message a friend', emoji: '❤️', category: 'social', tags: ['social', 'friends', 'connection', 'lonely', 'family'], why: 'A quick hello keeps friendships warm.' },
  { id: 'call-family', name: 'Call a family member', emoji: '😊', category: 'social', tags: ['social', 'family', 'connection', 'call', 'lonely'], why: 'Hearing a familiar voice helps you feel connected.' },
  { id: 'say-thank-you', name: 'Thank someone', emoji: '🙏', category: 'social', tags: ['social', 'gratitude', 'kindness', 'mood'], why: 'Saying thanks brightens two people’s day.' },
  { id: 'kind-act', name: 'Do one kind thing for someone', emoji: '✨', category: 'social', tags: ['social', 'kindness', 'community', 'mood', 'positive'], why: 'Small kindnesses build good connections.' },

  // Learning
  { id: 'read-pages', name: 'Read 10 pages', emoji: '📚', category: 'learning', tags: ['learning', 'reading', 'books', 'relax', 'study'], why: 'A few pages a day adds up to many books a year.' },
  { id: 'learn-new-words', name: 'Practise a language for 10 min', emoji: '📖', category: 'learning', tags: ['learning', 'language', 'study', 'practice'], why: 'Short daily practice is how languages stick.' },
  { id: 'practise-instrument', name: 'Practise an instrument', emoji: '🎸', category: 'learning', tags: ['learning', 'music', 'hobby', 'practice', 'creative'], why: 'Steady practice turns effort into skill.' },
  { id: 'creative-time', name: 'Spend 15 minutes being creative', emoji: '🎨', category: 'learning', tags: ['learning', 'creative', 'hobby', 'art', 'relax'], why: 'Making something is a great way to recharge.' },

  // Tidiness
  { id: 'make-the-bed', name: 'Make my bed', emoji: '🛏️', category: 'tidiness', tags: ['tidiness', 'tidy', 'morning', 'routine', 'home'], why: 'A made bed is a quick win to start the day.' },
  { id: 'ten-minute-tidy', name: '10-minute tidy-up', emoji: '🧹', category: 'tidiness', tags: ['tidiness', 'tidy', 'clean', 'home', 'clutter'], why: 'A short daily tidy keeps mess from piling up.' },
  { id: 'dishes-before-bed', name: 'Wash the dishes before bed', emoji: '🧴', category: 'tidiness', tags: ['tidiness', 'clean', 'kitchen', 'night', 'home'], why: 'Waking up to a clean kitchen feels great.' },
  { id: 'declutter-one-thing', name: 'Put away one thing out of place', emoji: '✨', category: 'tidiness', tags: ['tidiness', 'clutter', 'tidy', 'home', 'organise'], why: 'One item at a time makes clutter manageable.' },
]

export const CATALOG: readonly CatalogHabit[] = ENTRIES.map((e) => ({ ...e, color: CATEGORY_COLOR[e.category] }))

export const catalogById: ReadonlyMap<string, CatalogHabit> = new Map(CATALOG.map((h) => [h.id, h]))
