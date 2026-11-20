// LinkedIn profile score: deterministic rules over what you imported/entered. The AI only drafts text you choose to use.
import { SKILLS, dropContained, has, titleWords } from "./ats.js";

export const emptyLi = {
  url: "", role: "", headline: "", about: "", location: "", skills: "", experience: [], education: "", certifications: "",
  photo: false, banner: false, openToWork: false, contactInfo: false,
  featured: 0, recommendations: 0, connections: 0, followers: 0, postsLast30: 0, commentsLast30: 0,
};

// linkedin.com/in/<slug>; a slug ending in LinkedIn's random suffix (e.g. -3a91b2104) was never customised
export function checkUrl(url = "") {
  const m = String(url).trim().match(/^(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/([A-Za-z0-9\-_%]+)\/?(?:[?#].*)?$/i);
  if (!m) return { ok: false };
  // the random suffix always contains digits, so a hex-looking word like "-facade" is a real name
  return { ok: true, slug: m[1], custom: !/-(?=[0-9a-f]*\d)[0-9a-f]{6,}$/i.test(m[1]) && !/\d{5,}/.test(m[1]) };
}

// each skill once: "ASP.NET Core" is one skill, not .net + asp.net + asp.net core
const skillsIn = (t = "") => dropContained(SKILLS.filter((k) => has(t, k)));
const words = (t = "") => (t.trim() ? t.trim().split(/\s+/).length : 0);
const NUM = /\d[\d,.]*\s*(%|\+|x\b|[kmb]\b|percent|users|ms|hrs?|hours|days|crore|lakh|apis|services|clients|million|billion)|[$₹€£]\s*\d/i;
const clamp = (x) => Math.max(0, Math.min(1, x));

// your real skills = skills in the master profile; target role words come from the role you pick
export function liChecks(li, profileSkills = "") {
  const mine = skillsIn(profileSkills);
  const roleW = titleWords(li.role || "");
  const head = li.headline || "", about = li.about || "";
  const liSkills = li.skills.split(",").map((x) => x.trim()).filter(Boolean);
  const exp = (li.experience || []).filter((e) => e.title || e.company);
  const url = checkUrl(li.url);
  const headW = titleWords(head);
  const headRole = roleW.length ? roleW.filter((w) => headW.includes(w)).length / roleW.length : 0;
  const headTech = skillsIn(head).length;
  const aboutKw = mine.length ? mine.filter((k) => has(about, k)).length : skillsIn(about).length; // no master profile: count any known skills
  const skillCover = mine.length ? mine.filter((k) => liSkills.some((s) => has(s, k))).length / mine.length : clamp(liSkills.length / 15);
  const descGood = exp.length ? exp.filter((e) => words(e.description) >= 30).length / exp.length : 0;
  const metrics = exp.some((e) => NUM.test(e.description || "")) || NUM.test(about);

  const C = (id, cat, weight, pass, label, fix) => ({ id, cat, weight, pass: clamp(pass), label, fix });
  return [
    C("url", "Basics", 3, url.ok && url.custom ? 1 : 0, "Custom profile URL", url.ok ? "Edit your public profile URL to linkedin.com/in/firstname-lastname (no random numbers)." : "Add your LinkedIn profile link above."),
    C("photo", "Basics", 5, li.photo ? 1 : 0, "Professional photo", "Add a clear, well-lit head-and-shoulders photo; profiles with photos get far more views."),
    C("banner", "Basics", 2, li.banner ? 1 : 0, "Custom banner", "Add a banner showing your stack (e.g. React · Node.js · .NET · AI) instead of the default blue."),
    C("loc", "Basics", 2, li.location.trim() ? 1 : 0, "Location set", "Set your city so Indian recruiters' location filters find you."),
    C("otw", "Basics", 4, li.openToWork ? 1 : 0, "Open to work (recruiters only)", "Turn on Open to work → Recruiters only, with your target job titles and locations."),
    C("contact", "Basics", 2, li.contactInfo ? 1 : 0, "Contact info visible", "Add your email in Contact info so recruiters can reach you without InMail."),
    C("h_len", "Headline", 4, head.length >= 60 && head.length <= 220 ? 1 : head.length >= 30 ? 0.5 : 0, "Headline 60–220 characters", "Write a fuller headline: role | top 3–4 skills | what you deliver."),
    C("h_role", "Headline", 6, roleW.length ? headRole : 0, "Headline names your target role", li.role ? `Put “${li.role}” (or close wording) at the start of your headline: recruiters search by title.` : "Pick your target role above."),
    C("h_tech", "Headline", 5, headTech >= 3 ? 1 : headTech / 3, "3+ key skills in headline", "Add your strongest 3–4 skills to the headline, e.g. React | Node.js | ASP.NET Core | LLM apps."),
    C("a_len", "About", 6, words(about) >= 150 ? 1 : words(about) / 150, "About section 150+ words", "Write an About of 150–300 words: who you are, what you build, proof with numbers, what you're looking for."),
    C("a_kw", "About", 5, clamp(aboutKw / Math.min(6, mine.length || 6)), "About mentions your core skills", "Mention at least 6 of your real skills in About, in sentences, not a list dump."),
    C("a_cta", "About", 2, /@|\b(reach|contact|dm|message|email|connect)\b/i.test(about) ? 1 : 0, "About ends with a call to action", "End About with how to reach you: “Open to full stack roles — email me at …”."),
    C("e_desc", "Experience", 8, descGood, "Every role has a 30+ word description", "Add 3–4 achievement bullets under each role (copy them from your tailored resume)."),
    C("e_num", "Experience", 4, metrics ? 1 : 0, "Achievements have numbers", "Add measurable results (%, users, APIs, time saved) to at least two bullets."),
    C("s_cnt", "Skills", 4, clamp(liSkills.length / 30), "30+ skills listed", "List up to 50 skills; LinkedIn matches recruiter searches against them."),
    C("s_cov", "Skills", 6, skillCover, "Skills match your resume", "Add the skills from your master profile that are missing on LinkedIn."),
    C("cert", "Proof", 3, li.certifications.trim() ? 1 : 0, "Certifications", "Add a free certification (e.g. Microsoft Learn, AWS Cloud Practitioner prep, Google AI) relevant to your target role."),
    C("feat", "Proof", 4, clamp(li.featured / 2), "2+ featured items", "Feature 2–3 items: your best project repo/demo, a post, your resume or portfolio."),
    C("recs", "Proof", 4, clamp(li.recommendations / 2), "2+ recommendations", "Ask a manager and a teammate for a short recommendation about a specific project."),
    C("conn", "Network", 8, clamp(li.connections / 500), "500+ connections", "Grow to 500+: connect with recruiters, engineers at target companies and alumni, with a note."),
    C("foll", "Network", 2, clamp(li.followers / 1000), "1,000 followers", "Followers grow from posting consistently; keep up the weekly posts."),
    C("post", "Activity", 6, clamp(li.postsLast30 / 4), "4 posts in the last 30 days", "Post once a week: something you built, a lesson learned, or a short how-to."),
    C("cmnt", "Activity", 5, clamp(li.commentsLast30 / 20), "20 thoughtful comments in 30 days", "Comment on posts from engineers and recruiters in your stack; comments get you seen by their network."),
  ];
}

export const LI_CATS = ["Basics", "Headline", "About", "Experience", "Skills", "Proof", "Network", "Activity"];

export function liScore(li, profileSkills) {
  const checks = liChecks(li, profileSkills);
  const total = Math.round(checks.reduce((s, c) => s + c.weight * c.pass, 0));
  const cats = LI_CATS.map((cat) => {
    const cs = checks.filter((c) => c.cat === cat), w = cs.reduce((s, c) => s + c.weight, 0);
    return { cat, pct: Math.round((cs.reduce((s, c) => s + c.weight * c.pass, 0) / w) * 100) };
  });
  const label = total >= 85 ? "All-Star" : total >= 70 ? "Strong" : total >= 50 ? "Getting there" : "Needs work";
  return { total, label, cats, checks, missingSkills: skillsIn(profileSkills).filter((k) => !li.skills.split(",").some((s) => has(s, k))) };
}

// recurring growth habits; {company} / {skill} are filled from your wishlist and skills
const HABITS = [
  ["conn", "Send 5 connection requests with a short note to engineers or recruiters at {company}."],
  ["cmnt", "Leave 3 thoughtful comments (2+ sentences) on posts about {skill}."],
  ["post", "Draft a short post about something you built with {skill}; publish it this week."],
  ["cmnt", "Comment on 2 hiring posts for {role} roles and message the poster."],
  ["conn", "Follow {company} and 2 people who work there; react to one of their posts."],
  ["feat", "Reply to every comment and message from the last 2 days."],
  ["post", "Share a 3-line lesson learned from a bug or design decision this week."],
];

const dayNo = (iso) => Math.floor(new Date(`${iso}T00:00:00Z`).getTime() / 864e5);

// today's 3 tasks: the biggest unfinished profile fix, then two rotating habits (stable for the whole day)
export function dailyTasks(score, { date, companies = [], skills = [], role = "" }) {
  const n = dayNo(date);
  const fixes = score.checks.filter((c) => c.pass < 1).sort((a, b) => b.weight * (1 - b.pass) - a.weight * (1 - a.pass));
  const pick = (arr, i) => (arr.length ? arr[((i % arr.length) + arr.length) % arr.length] : "");
  const fill = (t, i) => t.replace("{company}", pick(companies, n + i) || "a company you want to join").replace("{skill}", pick(skills, n + i) || "your main stack").replace("{role}", role || "developer");
  const out = [];
  if (fixes[0]) out.push({ id: `fix-${fixes[0].id}`, kind: "Profile fix", text: fixes[0].fix, gain: Math.round(fixes[0].weight * (1 - fixes[0].pass)) });
  for (let i = 0; out.length < 3; i++) { const [cat, t] = HABITS[(n + i * 3) % HABITS.length]; const text = fill(t, i); if (!out.some((o) => o.text === text)) out.push({ id: `habit-${(n + i * 3) % HABITS.length}`, kind: "Growth habit", cat, text }); }
  return out;
}

// consecutive days (ending today or yesterday) with every task done
export function streak(log = {}, today) {
  let d = dayNo(today), s = 0;
  const done = (k) => { const x = log[new Date(k * 864e5).toISOString().slice(0, 10)]; return x && x.total > 0 && x.done >= x.total; };
  if (!done(d)) d--;
  while (done(d)) { s++; d--; }
  return s;
}
