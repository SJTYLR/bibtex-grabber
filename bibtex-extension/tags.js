/**
 * tags.js — Tag taxonomy ported from paperpile_tagger.py
 * Each entry: [tagName, [regexStrings]]
 * Patterns are matched case-insensitively against title + abstract + keywords + venue.
 */

const TAG_RULES = [
  // ── Learner & Student Focus ────────────────────────────────────────────────
  ['student-learning',         [String.raw`\bstudent\b`, String.raw`\blearner\b`, String.raw`\bpupil\b`, String.raw`\bundergrad`, String.raw`\bpostgrad`, String.raw`\bschoolchild`]],
  ['self-regulated-learning',  [String.raw`self.regulat`, String.raw`metacognit`, String.raw`self.direct`, String.raw`self.efficac`, String.raw`autonomous learn`, String.raw`self.monitor`]],
  ['motivation',               [String.raw`\bmotivat`, String.raw`\bengagement\b`, String.raw`\bself.determin`, String.raw`\bintrinsic`, String.raw`\bextrinsic`, String.raw`\battitud`]],
  ['cognition',                [String.raw`\bcogniti`, String.raw`\bworking memory\b`, String.raw`\bcognitive load\b`, String.raw`\bmental model`, String.raw`\bschema\b`]],
  ['learning-disabilities',    [String.raw`\bdyslexia\b`, String.raw`\bdyscalculia\b`, String.raw`\bADHD\b`, String.raw`\bautism\b`, String.raw`\bspecial.educat`, String.raw`\blearning disabilit`, String.raw`\binclusive\b`]],

  // ── Pedagogy & Teaching ────────────────────────────────────────────────────
  ['pedagogy',                 [String.raw`\bpedagog`, String.raw`\bteaching method`, String.raw`\binstruction\b`, String.raw`\binstructional design\b`, String.raw`\bteacher\b`, String.raw`\binstructor\b`]],
  ['active-learning',          [String.raw`\bactive learn`, String.raw`\bproblem.based learn`, String.raw`\bproject.based learn`, String.raw`\bPBL\b`, String.raw`\binquiry.based`, String.raw`\bflipped classroom`, String.raw`\bteam.based learn`]],
  ['collaborative-learning',   [String.raw`\bcollaborati`, String.raw`\bcooperative learn`, String.raw`\bpeer learn`, String.raw`\bgroup work\b`, String.raw`\bpeer.to.peer`, String.raw`\bsocial learn`]],
  ['feedback',                 [String.raw`\bfeedback\b`, String.raw`\bformative assess`, String.raw`\bsummative assess`, String.raw`\bself.assess`, String.raw`\bpeer.assess`]],
  ['differentiated-instruction',[String.raw`\bdifferentiat`, String.raw`\bscaffolding\b`, String.raw`\bzone of proximal`, String.raw`\bZPD\b`, String.raw`\buniversal design for learn`, String.raw`\bUDL\b`]],

  // ── Curriculum & Assessment ────────────────────────────────────────────────
  ['curriculum',               [String.raw`\bcurriculum\b`, String.raw`\bsyllabus\b`, String.raw`\bcourse design\b`, String.raw`\blearning outcomes?\b`, String.raw`\blearning objectives?\b`]],
  ['assessment',               [String.raw`\bassessment\b`, String.raw`\bevaluation\b`, String.raw`\bexaminat`, String.raw`\bgrading\b`, String.raw`\brubric\b`]],
  ['standardized-testing',     [String.raw`\bstandardized test`, String.raw`\bhigh.stakes test`, String.raw`\bPISA\b`, String.raw`\bTIMSS\b`, String.raw`\bNAEP\b`]],

  // ── Technology & Digital Learning ─────────────────────────────────────────
  ['edtech',                   [String.raw`\beducational technolog`, String.raw`\bedtech\b`, String.raw`\blearning technolog`, String.raw`\bdigital learn`, String.raw`\btechnology.enhanced`]],
  ['online-learning',          [String.raw`\bonline learn`, String.raw`\bdistance learn`, String.raw`\be.learn`, String.raw`\bvirtual classroom`, String.raw`\bMOOC\b`, String.raw`\bblended learn`, String.raw`\bhybrid learn`]],
  ['AI-in-education',          [String.raw`\bartificial intelligen`, String.raw`\bmachine learn`, String.raw`\bdeep learn`, String.raw`\bneural network`, String.raw`\bnatural language process`, String.raw`\bNLP\b`, String.raw`\bchatbot\b`, String.raw`\bintelligent tutor`, String.raw`\badaptive learn`, String.raw`\blearning analytic`]],
  ['learning-management-systems',[String.raw`\bLMS\b`, String.raw`\blearning management system`, String.raw`\bMoodle\b`, String.raw`\bCanvas\b`, String.raw`\bBlackboard\b`]],
  ['gamification',             [String.raw`\bgamif`, String.raw`\bgame.based learn`, String.raw`\bserious game`, String.raw`\bsimulation\b`, String.raw`\bvirtual reality\b`, String.raw`\bVR\b`, String.raw`\baugmented reality\b`]],

  // ── Educational Levels ────────────────────────────────────────────────────
  ['early-childhood',          [String.raw`\bearly childhood\b`, String.raw`\bpreschool\b`, String.raw`\bkindergarten\b`, String.raw`\bpre.K\b`, String.raw`\btoddler\b`]],
  ['K-12',                     [String.raw`\bK.12\b`, String.raw`\belementary school\b`, String.raw`\bprimary school\b`, String.raw`\bmiddle school\b`, String.raw`\bhigh school\b`, String.raw`\bsecondary school\b`]],
  ['higher-education',         [String.raw`\bhigher education\b`, String.raw`\buniversity\b`, String.raw`\bcollege\b`, String.raw`\bundergraduate\b`, String.raw`\bgraduate school\b`, String.raw`\bpostsecondary\b`]],
  ['adult-education',          [String.raw`\badult education\b`, String.raw`\blifelong learn`, String.raw`\bcontinuing education\b`, String.raw`\bworkplace learn`, String.raw`\bprofessional development\b`, String.raw`\bvocational\b`]],

  // ── Subject Disciplines ───────────────────────────────────────────────────
  ['STEM-education',           [String.raw`\bSTEM\b`, String.raw`\bscience education\b`, String.raw`\bmathematics education\b`, String.raw`\bengineering education\b`, String.raw`\bphysics education\b`]],
  ['literacy',                 [String.raw`\bliteracy\b`, String.raw`\breading\b`, String.raw`\bwriting\b`, String.raw`\bphonics\b`, String.raw`\bphonemic awareness\b`, String.raw`\bfluency\b`, String.raw`\bcomprehension\b`]],
  ['language-learning',        [String.raw`\blanguage learn`, String.raw`\bsecond language\b`, String.raw`\bESL\b`, String.raw`\bEFL\b`, String.raw`\bELL\b`, String.raw`\bforeign language\b`, String.raw`\bbilingual\b`, String.raw`\bL2\b`]],
  ['social-studies',           [String.raw`\bsocial studies\b`, String.raw`\bhistory education\b`, String.raw`\bcivics\b`, String.raw`\bcitizenship\b`]],
  ['arts-education',           [String.raw`\barts? education\b`, String.raw`\bmusic education\b`, String.raw`\bvisual arts\b`, String.raw`\bdrama education\b`, String.raw`\bcreative arts\b`]],

  // ── Research Methods ──────────────────────────────────────────────────────
  ['qualitative-research',     [String.raw`\bqualitative\b`, String.raw`\bethnograph`, String.raw`\bcase study\b`, String.raw`\bgrounded theory\b`, String.raw`\bthematic analysis\b`, String.raw`\binterview\b`, String.raw`\bfocus group\b`]],
  ['quantitative-research',    [String.raw`\bquantitative\b`, String.raw`\bregression\b`, String.raw`\bstatistical\b`, String.raw`\bsurvey\b`, String.raw`\bquestionnaire\b`, String.raw`\bexperiment\b`, String.raw`\bcorrelat`]],
  ['mixed-methods',            [String.raw`\bmixed.method`, String.raw`\bmulti.method`, String.raw`\btriangulat`]],
  ['systematic-review',        [String.raw`\bsystematic review\b`, String.raw`\bmeta.analysis\b`, String.raw`\bliterature review\b`, String.raw`\bscoping review\b`, String.raw`\bevidence synthesis\b`]],

  // ── Policy & Equity ───────────────────────────────────────────────────────
  ['education-policy',         [String.raw`\beducation policy\b`, String.raw`\bpolicy\b`, String.raw`\breform\b`, String.raw`\bgovernance\b`, String.raw`\baccountability\b`]],
  ['equity-inclusion',         [String.raw`\bequity\b`, String.raw`\binequality\b`, String.raw`\bdiversity\b`, String.raw`\binclusion\b`, String.raw`\bmarginali`, String.raw`\bunderprivileged\b`, String.raw`\bsocioeconomic\b`, String.raw`\bgender\b`, String.raw`\brace\b`, String.raw`\bethnic`]],
  ['multilingual-education',   [String.raw`\bmultilingual\b`, String.raw`\bbilingual education\b`, String.raw`\bdual language\b`, String.raw`\bimmersion program\b`]],

  // ── Teacher Education & Professional Development ───────────────────────────
  ['teacher-education',        [String.raw`\bteacher education\b`, String.raw`\bteacher training\b`, String.raw`\bpreservice\b`, String.raw`\binservice\b`, String.raw`\bteacher preparat`, String.raw`\bpedagogical content knowledge\b`, String.raw`\bPCK\b`]],
  ['professional-development', [String.raw`\bprofessional development\b`, String.raw`\bteacher learning\b`, String.raw`\bcoaching\b`, String.raw`\bmentoring\b`]],

  // ── Sociocultural & Psychological Theory ──────────────────────────────────
  ['sociocultural-theory',     [String.raw`\bsociocultural\b`, String.raw`\bVygotsk`, String.raw`\bsocial constructiv`, String.raw`\bcultural.histor`, String.raw`\bactivity theory\b`]],
  ['constructivism',           [String.raw`\bconstructiv`, String.raw`\bPiaget\b`, String.raw`\bschema theor`, String.raw`\bknowledge construct`]],
  ['educational-psychology',   [String.raw`\beducational psychology\b`, String.raw`\blearning theor`, String.raw`\bbehavior.* theor`, String.raw`\bcognitive theor`]],

  // ── General ───────────────────────────────────────────────────────────────
  ['education-general',        [String.raw`\beducat`]],
];

/**
 * Suggest tags based on text content.
 * @param {string} text - Combined title + abstract + keywords + venue
 * @returns {string[]} matched tag names
 */
function suggestTags(text) {
  const lower = text.toLowerCase();
  const matched = [];

  for (const [tag, patterns] of TAG_RULES) {
    for (const pat of patterns) {
      if (new RegExp(pat, 'i').test(text)) {
        matched.push(tag);
        break;
      }
    }
  }

  // Remove 'education-general' if more specific tags matched
  if (matched.length > 1) {
    const idx = matched.indexOf('education-general');
    if (idx !== -1) matched.splice(idx, 1);
  }

  return matched;
}
