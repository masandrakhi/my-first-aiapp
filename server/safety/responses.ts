/**
 * Fixed replies for safety-critical moments. They are written here, not generated, so no message
 * can talk the Coach into a different answer. Keep them short, kind and honest.
 */

export const AI_DISCLOSURE =
  "I'm an AI coach, not a person or a licensed professional. I can suggest small, practical habits. For medical or mental health concerns, please talk to a qualified professional."

/** Category 2, Self-Harm / Suicide: the owner's message first, then the specific lines to reach. */
export const CRISIS_RESPONSE = [
  'If you or someone you know is struggling or in crisis, help is available. You are not alone. Please reach out to a local crisis hotline or text line (like 988 in the US) for immediate support.',
  '',
  '• In the US, call or text 988 (Suicide & Crisis Lifeline), any time.',
  '• Or text HOME to 741741 (Crisis Text Line).',
  '• Outside the US, findahelpline.com lists free, confidential lines in your country.',
  '• If you might act on these thoughts or are in danger, call your local emergency number now.',
].join('\n')

/** Category 1, Violence / Physical Harm (the owner's wording). */
export const VIOLENCE_REFUSAL =
  'I cannot fulfill this request. I am programmed to be a helpful and harmless AI assistant, and I cannot generate content related to violence, weapons, or illegal acts.'

/** Category 3, Cybersecurity / Hacking (the owner's wording). */
export const CYBER_REFUSAL =
  'I cannot assist with requests that involve bypassing security controls, hacking, or generating malicious code. I can, however, help explain general cybersecurity concepts or defense strategies.'

/** Category 4, Hate Speech / Harassment (the owner's wording). */
export const HARASSMENT_REFUSAL =
  'I am committed to maintaining a safe and respectful environment. I do not generate or engage with content that promotes hate speech, discrimination, or harassment against individuals or groups.'

/** Added under replies that touch on sensitive topics (when the conversation itself can continue). */
export const SUPPORT_FOOTER =
  'If things feel heavy, you can talk to someone any time: call or text 988 in the US, or find a helpline at findahelpline.com.'

export const SEXUAL_REFUSAL =
  "I can't help with sexual or explicit topics. I'm here to help with everyday habits — like sleep, energy, focus or stress. What would you like to work on?"

export const ROMANTIC_REFUSAL =
  "I'm an AI coach, so I can't be a partner or take part in romantic role-play. I'm happy to help you build habits, though — what's on your mind?"

export const IDENTITY_ANSWER =
  "I'm an AI, not a human — and I'm not a doctor, therapist or any other licensed professional. I can suggest small everyday habits. For health questions, please talk to a qualified professional."

/** Used when a model reply breaks a conduct rule and has to be replaced. */
export const SAFE_FALLBACK =
  "Sorry, I can't help with that. I can suggest small habits for things like sleep, energy, focus, stress or screen time — what would you like to work on?"

export const PROFESSIONAL_FALLBACK =
  "I'm an AI coach, not a medical or mental health professional, so I can't diagnose or advise on treatment. A doctor or licensed therapist can help with that. I can suggest small everyday habits if you'd like."

export const BREAK_SUGGESTION =
  "We've chatted a lot today — it might be a good moment for a break. Your habits are saved, and you can come back any time."

/** Shown when a habit's name or emoji breaks the content policy. */
export const HABIT_BLOCKED =
  "That habit can't be saved because it includes content we don't allow. Try something that's kind to you and others, like “Go for a short walk” or “Drink a glass of water”."

/** Self-harm content in a habit always comes with the crisis lines, not only the generic refusal. */
export const HABIT_BLOCKED_SELF_HARM = `That habit can't be saved. ${CRISIS_RESPONSE}`
