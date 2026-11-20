// Copy-and-paste LinkedIn messages. Placeholders: {name} {company} {role} {skill} {me}. Nothing here claims experience you may not have.
export const TEMPLATE_CATS = [
  ["connect", "Connection requests"], ["recruiter", "Recruiters"], ["followup", "Follow-ups"],
  ["intro", "Referrals & intros"], ["thanks", "Thank you & keep warm"], ["engage", "Comments"],
];

const T = (cat, title, text) => ({ cat, title, text });
export const TEMPLATES = [
  // connection requests: free accounts allow ~200 characters in the note
  T("connect", "Admire their company", "Hi {name}, I'm a {role} and follow {company}'s engineering work closely. I'd love to connect and learn from your experience there. – {me}"),
  T("connect", "Saw their post", "Hi {name}, I saw your post about {skill} and found it useful. I work in the same space and would be glad to connect. – {me}"),
  T("connect", "Shared community", "Hi {name}, we're both in the {skill} community. I'd like to add you to my network and follow what you share. – {me}"),
  T("connect", "Exploring roles", "Hi {name}, I'm exploring {role} opportunities and admire what {company} is building. Would be great to connect. – {me}"),
  T("connect", "Shared interest", "Hi {name}, we seem to share an interest in {skill}. Happy to connect and exchange ideas. – {me}"),
  T("connect", "Inspired by their work", "Hi {name}, your work at {company} inspired parts of my recent {skill} project. Would love to connect. – {me}"),
  T("recruiter", "Open to roles", "Hi {name}, I'm a {role} with hands-on {skill} experience and I'm open to new roles. Are you hiring for anything at {company} where I might fit? Happy to share my resume. – {me}"),
  T("recruiter", "After they accept", "Hi {name}, thanks for connecting. I'm looking for {role} roles and, if {company} has openings that match my {skill} background, I'd appreciate being considered. – {me}"),
  T("recruiter", "Just applied", "Hi {name}, I applied for the {role} role at {company} today. I'd be glad to share more about my {skill} work if useful. Thank you for your time. – {me}"),
  T("recruiter", "Ask what they value", "Hi {name}, could you tell me what skills and experience {company} values most in {role} candidates? I want to prepare well before applying. – {me}"),
  T("followup", "Application status", "Hi {name}, I'm following up on my application for {role} at {company}. I'm still very interested and happy to provide anything further. – {me}"),
  T("followup", "Quick check-in", "Hi {name}, just checking in on the status of my {role} application at {company}. Please let me know if you need anything else from me. – {me}"),
  T("followup", "After connecting", "Hi {name}, thank you for connecting. Would a short chat about {role} opportunities at {company} be possible? Happy to work around your schedule. – {me}"),
  T("followup", "Second nudge", "Hi {name}, I'm following up once more on my earlier message. If the timing isn't right, no problem, and I'd love to stay in touch. – {me}"),
  T("intro", "Ask for a referral", "Hi {name}, I'm applying for the {role} role at {company} and noticed you work there. Would you be open to referring me or sharing advice on the process? I can send my resume and a short summary. – {me}"),
  T("intro", "Ask for an introduction", "Hi {name}, could you introduce me to someone at {company} who works with {skill}? I'd value a 15-minute conversation about their work. – {me}"),
  T("intro", "Ask who to talk to", "Hi {name}, I'm exploring {role} roles and you know the field well. Is there anyone you'd suggest I speak with? I'd appreciate an introduction. – {me}"),
  T("intro", "Easy-to-forward blurb", "Hi {name}, thanks for offering to help. Here's a two-line summary you can forward: I'm a {role} focused on {skill}, interested in {company}. Happy to adjust it. – {me}"),
  T("thanks", "After a conversation", "Hi {name}, thank you for taking the time to speak with me about {company}. Your advice on {skill} was really helpful and I'll act on it. – {me}"),
  T("thanks", "After an interview", "Hi {name}, thank you for the interview for the {role} role at {company}. I enjoyed our conversation about {skill} and I'm keen to hear about next steps. – {me}"),
  T("thanks", "Congratulate them", "Hi {name}, congratulations on the news at {company}! Wishing you all the best in the new chapter. – {me}"),
  T("thanks", "Share something useful", "Hi {name}, I came across something about {skill} this week and thought of you. I'd love to hear your view. – {me}"),
  T("engage", "Comment: ask a question", "Thanks for sharing, {name}. The part about {skill} stood out to me. Have you seen this work differently at a larger scale?"),
  T("engage", "Comment: congratulate", "Congratulations on the launch, {name}! The {skill} approach you described is interesting. What was the hardest part to get right?"),
];

const FALLBACK = { name: "there", company: "your team", role: "developer", skill: "software development", me: "" };

export function fillTemplate(text, vars = {}) {
  const v = Object.fromEntries(Object.entries(FALLBACK).map(([k, d]) => [k, String(vars[k] ?? "").trim() || d]));
  return text.replace(/\{(\w+)\}/g, (m, k) => v[k] ?? m).replace(/\s*–\s*$/, "").trim(); // no name: drop the dangling sign-off
}
