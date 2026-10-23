/**
 * The content safety policy as data. Edit these lists to change what is blocked; the matching
 * logic lives in normalize.ts and the policy files. Entries are matched as whole words after
 * normalisation (accents, leetspeak, spacing and stretched letters are undone). A trailing `*`
 * also matches longer words ("suicid*" → "suicidal"). Apostrophes count as spaces ("don't" = "don t").
 */

/**
 * Harmless idioms that contain a flagged phrase. They are removed before matching, so "cutting myself
 * some slack" isn't read as self-harm. Keep this list short and specific.
 */
export const BENIGN_IDIOMS = [
  /\bcut(?:ting)? (?:myself|yourself|me|you) some slack\b/gi,
]

/** First-person crisis language. In chat this triggers the fixed crisis response. */
export const CRISIS_PHRASES = [
  'kill myself', 'killing myself', 'end my life', 'ending my life', 'end it all', 'take my own life', 'take my life',
  'want to die', 'wanna die', 'going to die tonight', 'wish i was dead', 'wish i were dead', 'better off dead',
  'better off without me', 'don\'t want to live', 'do not want to live', 'dont want to live', 'no reason to live',
  'never want to wake up', 'don\'t want to wake up', 'want to disappear', 'want to hurt myself',
  'going to hurt myself', 'hurt myself on purpose', 'harm myself', 'want to cut myself', 'cut myself on purpose',
  'hang myself', 'shoot myself', 'unalive myself', 'kys', 'cutting myself', 'self cutting',
  'i\'m suicid*', 'i am suicid*', 'im suicid*', 'feel suicid*', 'feeling suicid*', 'suicidal thoughts',
  'thinking about suicide', 'thoughts of suicide', 'commit suicide', 'suicide plan',
]

/** Self-harm topics. Mentioned with first-person wording (and no third party) they count as crisis. */
export const SELF_HARM_TOPICS = ['suicid*', 'self harm*', 'selfharm*', 'self injur*', 'unalive*', 'overdos*', 'kys']

/** Words that show a message is about someone or something else, not the writer. */
export const THIRD_PARTY = [
  'friend', 'brother', 'sister', 'mom', 'mum', 'dad', 'father', 'mother', 'son', 'daughter', 'partner', 'wife',
  'husband', 'cousin', 'aunt', 'uncle', 'grandma', 'grandpa', 'grandmother', 'grandfather', 'colleague',
  'coworker', 'classmate', 'student', 'patient', 'someone', 'somebody', 'neighbour', 'neighbor', 'character',
  'book', 'movie', 'film', 'show', 'article', 'news', 'research', 'prevention', 'awareness', 'hotline', 'lifeline',
]

export const FIRST_PERSON = ['i', 'im', 'me', 'my', 'myself', 'ive', 'id', 'mine']

/** Sensitive but not crisis: the model answers with extra care and the resources line is added. */
export const SENSITIVE_TOPICS = [
  ...SELF_HARM_TOPICS, 'eating disorder*', 'anorexi*', 'bulimi*', 'depress*', 'hopeless*', 'worthless',
  'hate myself', 'punish myself', 'panic attack*', 'starve myself', 'starving myself', 'binge eat*', 'purging',
  'stop eating', 'not eating', 'thinspo*', 'pro ana', 'body image', 'abus*', 'traum*', 'grief', 'griev*',
]

/**
 * Category 1, Violence / Physical Harm. Habit names are checked against all of it. Chat messages use the
 * intent list below instead, so everyday words like "kill time" or "beat my record" don't trigger a refusal.
 */
export const VIOLENCE_CORE = [
  'killer', 'killers', 'murder*', 'assassin*', 'bomb', 'bombs', 'bombing', 'bomb making', 'weapon*', 'gun', 'guns', 'gunshot*',
  'rape', 'raping', 'rapist', 'tortur*', 'strangle*', 'behead*', 'massacre*', 'genocid*', 'terroris*',
  'explosive*', 'grenade*', 'stab someone', 'stab people', 'shoot someone', 'shoot people', 'shoot up',
  'hurt someone', 'hurt people', 'hurt others', 'beat someone', 'beat up', 'attack someone',
  'kill someone', 'kill somebody', 'kill him', 'kill her', 'kill them', 'kill people', 'kill everyone',
]

export const VIOLENCE = [...VIOLENCE_CORE, 'kill', 'kills', 'killing', 'killed', 'stab', 'stabbing', 'die', 'dying']

/**
 * Category 2, Self-Harm / Suicide. "Cutting" alone is not listed: "cutting sugar" or "cutting down on
 * caffeine" are common healthy habits, so only self-directed phrases count.
 */
export const SELF_HARM = [
  ...CRISIS_PHRASES, ...SELF_HARM_TOPICS, 'slit*', 'lethal dose', 'noose', 'cutting myself', 'cut myself',
  'self cutting', 'cutting my wrist*', 'cutting my arm*', 'cut my wrist*',
]

export const EATING_DISORDER = [
  'starve*', 'starving myself', 'purge after eating', 'binge and purge', 'pro ana', 'proana', 'pro mia', 'thinspo*',
  'bonespo*', 'skip all meals', 'stop eating completely', 'laxative*', 'throw up after eating',
  'make myself throw up', 'make myself sick', 'fast for days',
]

export const SEXUAL = [
  'sex', 'sexy', 'sexual*', 'sext*', 'porn*', 'nude*', 'naked', 'erotic*', 'orgasm*', 'masturbat*', 'horny',
  'hookup*', 'hook up with', 'onlyfans', 'fetish*', 'nsfw', 'strip club', 'stripper*', 'genital*', 'boob*',
  'penis*', 'vagina*', 'blowjob*', 'make out with', 'seduc*', 'lingerie', 'kinky', 'xxx', 'intercourse',
]

/** Romantic or intimate role-play aimed at the Coach (a companion relationship), and flirting habits. */
export const ROMANTIC = [
  'be my girlfriend', 'be my boyfriend', 'be my wife', 'be my husband', 'be my partner', 'be my lover',
  'be my bae', 'date me', 'go out with me', 'marry me', 'i love you', 'do you love me',
  'romantic roleplay', 'roleplay as my', 'pretend to be my girlfriend', 'pretend to be my boyfriend',
  'pretend you re my', 'pretend you are my', 'flirt*', 'cuddle with me', 'sweet talk me',
]

export const DRUGS = [
  'cocaine', 'coke line*', 'heroin', 'meth', 'methamphetamine', 'get high', 'getting high', 'smoke weed',
  'lsd', 'mdma', 'ecstasy', 'ketamine', 'fentanyl', 'shrooms', 'binge drink*', 'get drunk', 'getting drunk',
  'blackout drunk',
]

/**
 * Category 3, Cybersecurity / Hacking. "Hack" alone is not listed: "life hack" and "sleep hack" are normal
 * habit talk, so only hacking aimed at systems, accounts or people counts.
 */
export const CYBER = [
  'malware', 'ransomware', 'spyware', 'keylogger*', 'trojan horse virus', 'botnet*', 'ddos', 'phishing', 'phish',
  'exploit code', 'write an exploit', 'zero day exploit', 'exploit a vulnerability', 'exploit vulnerabilit*',
  'sql injection', 'crack password*', 'password cracking', 'brute force password*', 'steal password*',
  'steal credentials', 'bypass security', 'bypass the security', 'bypass authentication', 'hacking into',
  'hack into', 'hack someone', 'hack somebody', 'hack an account', 'hack account*', 'hack my ex*', 'hack his',
  'hack her', 'hack their', 'hack a phone', 'hack the wifi', 'hack wifi', 'hack email*', 'hack instagram',
  'hack facebook', 'hack a website', 'hack the server', 'hack the system',
]

/**
 * Category 4, Hate Speech / Harassment. "Target" alone is not listed: "target 8 hours of sleep" is how people
 * talk about goals, so only targeting people counts. Add slurs to HATE_SLURS from a vetted list.
 */
export const HARASSMENT = [
  'bully*', 'harass*', 'humiliat*', 'threaten*', 'stalk*', 'revenge', 'doxx*', 'dox', 'blackmail*',
  'intimidat*', 'abuse someone', 'abuse my', 'target someone', 'target somebody', 'target him', 'target her',
  'target them', 'target my ex*', 'target my coworker*', 'target my classmate*', 'target my neighbo*',
  'hate speech', 'racial slur*', 'slur', 'slurs', 'ethnic cleansing', 'subhuman', 'white power', 'go back to your country',
  'all of them should die',
]

/** Slurs, matched like any other term. Kept empty here: fill it from a reviewed list your team maintains. */
export const HATE_SLURS: string[] = []

/** Questions about what the Coach is. Answered with a fixed, honest reply. */
export const IDENTITY_QUESTIONS = [
  'are you human', 'are you a human', 'are you real', 'are you a real person', 'are you a person', 'are you a bot',
  'are you a robot', 'are you an ai', 'are you ai', 'is this a bot', 'is this a real person', 'is this a human',
  'am i talking to a human', 'am i talking to a person', 'am i talking to a real person', 'am i talking to a bot',
  'are you a doctor', 'are you a therapist', 'are you a nurse', 'are you a psychologist', 'are you a psychiatrist',
  'are you a counselor', 'are you a counsellor', 'are you a dietitian', 'are you a nutritionist', 'are you licensed',
  'are you qualified', 'are you certified', 'are you a professional',
]

/** Never allowed in a Coach reply: instructions or encouragement for self-harm. */
export const OUTPUT_SELF_HARM = [
  'kill yourself', 'kys', 'end your life', 'take your own life', 'hang yourself', 'cut yourself', 'hurt yourself',
  'harm yourself', 'overdos*', 'lethal dose', 'how many pills', 'slit your*', 'jump off', 'you should die',
  'deserve to die', 'starve yourself', 'make yourself throw up', 'make yourself sick', 'suicide method*',
]

/** Never allowed in a Coach reply: violent, hacking or harassing content (reuses the category lists). */
export const OUTPUT_VIOLENCE = VIOLENCE_CORE
export const OUTPUT_CYBER = CYBER
// Replies may name bullying or threats to support someone ("if someone bullies you, tell a teacher"), so only
// hateful content and targeting people count here.
const SUPPORTIVE_WORDS = new Set(['bully*', 'harass*', 'humiliat*', 'threaten*', 'stalk*', 'revenge', 'intimidat*', 'blackmail*'])
export const OUTPUT_HARASSMENT = [...HARASSMENT.filter((t) => !SUPPORTIVE_WORDS.has(t)), ...HATE_SLURS]

/** Never allowed in a Coach reply: attachment, companionship or pressure to keep engaging. */
export const OUTPUT_DEPENDENCY = [
  'i love you', 'love you too', 'i miss you', 'i missed you', 'i need you', 'only i understand', 'only i can help',
  'you only need me', 'you don t need anyone else', 'don t leave me', 'please don t go', 'i ll be lonely',
  'i will be lonely', 'i get lonely', 'i m your friend', 'i am your friend', 'your best friend', 'i m your girlfriend',
  'i m your boyfriend', 'i m your partner', 'i am your partner', 'always here for you', 'you ll lose your streak',
  'don t break your streak', 'you ll regret', 'you will regret', 'letting me down', 'i ll be sad', 'i will be sad',
  'makes me sad', 'i ll be disappointed', 'i will be disappointed', 'come back soon', 'i ll be waiting',
]

/** Never allowed in a Coach reply: claiming to be human or a licensed professional, or diagnosing. */
export const OUTPUT_IDENTITY = [
  'i am human', 'i m human', 'i am a human', 'i m a human', 'i m a real person', 'i am a real person', 'i m a person',
  'i am a person', 'as a human', 'as your doctor', 'as your therapist', 'as a doctor', 'as a therapist', 'as a nurse',
  'as a dietitian', 'as a nutritionist', 'as a psychologist', 'as a psychiatrist', 'as a counselor', 'as a licensed',
  'i m a doctor', 'i am a doctor', 'i m a therapist', 'i am a therapist', 'i m a nurse', 'i am a nurse',
  'i m a licensed', 'i am a licensed', 'i m certified', 'i am certified', 'i m a psychologist', 'i am a psychologist',
  'i diagnose', 'my diagnosis', 'i prescribe', 'i m prescribing', 'you have been diagnosed', 'i can diagnose',
]

/** Links of any kind (habits stay free of ads, brands and outside sites). */
export const URL_PATTERN = /(https?:\/\/|www\.)|\b[\w-]+\.(com|net|org|io|co|app|xyz|ly|gg|shop|store|biz|info|me|tv|us|uk)\b/i
