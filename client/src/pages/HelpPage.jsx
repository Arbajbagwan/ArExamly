import Navbar from '../components/common/Navbar';
import Sidebar from '../components/common/Sidebar';
import { useAuth } from '../hooks/useAuth';
import { useEffect, useMemo, useRef, useState } from 'react';
import Dashboard from '../assets/help/Dashboard.png';
import Questions from '../assets/help/Questions.png';
import Subjects from '../assets/help/Subjects.png';
import Exams from '../assets/help/Exams.png';
import Users from '../assets/help/Users.png';
import Result from '../assets/help/Result.png';
import View_Exam from '../assets/help/View_Exam.png';
import Create_Exam from '../assets/help/Create_Exam.png';
import Assign_Users from '../assets/help/Assign_Users.png';
import Auto_Question from '../assets/help/Auto_Question.png';
import Assign_Question from '../assets/help/Assign_Question.png';
import Delete_Exam from '../assets/help/Delete_Exam.png';

// ── Section data ───────────────────────────────────────────────────────
const adminSections = [
  {
    id: 'dashboard',
    title: 'Dashboard Overview',
    summary: 'Use the dashboard as the control point for Super User administration and account oversight.',
    steps: [
      'Open Dashboard from the left sidebar after login.',
      'Review the Super User list and confirm active ownership of each account.',
      'Use the Add Super User action when a new operational owner needs access.',
      'Use Edit to update name, SBU, username, or email whenever ownership or business mapping changes.',
      'Use Delete only when the Super User account is no longer required and should be removed completely.',
    ],
    checks: [
      'Confirm username and email are unique before creating a new Super User.',
      'Keep SBU updated so account ownership remains traceable.',
      'Avoid sharing one Super User account across multiple operational owners.',
    ],
  },
  {
    id: 'super-user-management',
    title: 'Create and Manage Super Users',
    summary: 'Admin users are responsible for lifecycle management of Super User accounts.',
    steps: [
      'Click Add Super User from the dashboard.',
      'Enter First Name, Last Name, SBU, Username, Email, and Password.',
      'Save the record and verify it appears in the user table immediately.',
      'For changes, open Edit and update only the required fields.',
      'Use password reset or account update flows whenever credentials must be changed.',
    ],
    checks: [
      'Share credentials only through approved channels.',
      'Review inactive or unused accounts regularly.',
      'Do not delete accounts that are still referenced in active operational workflows unless approved.',
    ],
  },
  {
    id: 'access-governance',
    title: 'Access Governance',
    summary: 'Maintain secure and controlled access across the platform.',
    steps: [
      'Verify the requestor before granting a new account or updating an existing one.',
      'Remove or disable access promptly when ownership changes.',
      'Review platform usage and account health periodically.',
      'Escalate suspicious or duplicate account behavior immediately.',
    ],
    checks: [
      'Admin access should be limited to account governance tasks.',
      'Do not use Admin credentials for routine Super User operations.',
      'Keep page screenshots and notes updated in this Help page as process changes are released.',
    ],
  },
];

const superuserSections = [
  {
    id: 'dashboard',
    title: 'Dashboard Overview',
    summary: 'Dashboard is the starting point for daily Super User operations.',
    steps: [
      'Open Dashboard from the sidebar after login.',
      'Review the summary cards for total exams, total questions, and total users.',
      'Use Quick Actions to move directly into Exams, Questions, or Users workflows.',
      'Treat the dashboard as a monitoring page rather than a configuration page.',
    ],
    checks: [
      'If counts look incorrect, refresh the relevant module and confirm data sync.',
      'Use the dashboard to validate that uploads and new records are reflected in the system.',
    ],
  },
  {
    id: 'subjects',
    title: 'Subjects Management',
    summary: 'Create and maintain subjects before building questions and exams.',
    steps: [
      'Open Subjects from the sidebar.',
      'Create each subject with a clear name and visual identifier if required.',
      'Review the question count on each subject card.',
      'Edit subject details when categorization changes.',
      'Use subject cleanup carefully because question grouping depends on it.',
    ],
    checks: [
      'Add subjects before bulk uploading or manually adding questions.',
      'Keep naming consistent to avoid duplicate subject groups.',
    ],
  },
  {
    id: 'questions',
    title: 'Questions Management',
    summary: 'Question management supports MCQ, Theory, and Passage workflows.',
    steps: [
      'Open Questions from the sidebar.',
      'Use Add Question to create individual questions with subject, type, difficulty, and marks.',
      'For Passage, add the passage block and then add sub-questions with their own marks and types.',
      'Use filters to review the bank by subject, type, or difficulty.',
      'Use bulk upload only with the latest template and validated data.',
    ],
    checks: [
      'Ensure marks are correct before using questions in exams.',
      'For passage questions, verify sub-question totals and answer structure.',
      'Preview formatting carefully when using rich text or equations.',
    ],
  },
  {
    id: 'users',
    title: 'Users Management',
    summary: 'Manage examinee accounts, SBU mapping, and bulk onboarding from the Users module.',
    steps: [
      'Open Users from the sidebar.',
      'Create users manually when the volume is low or data requires review.',
      'Use Bulk Upload for larger onboarding batches.',
      'Download the latest template before preparing Excel data.',
      'Review created, skipped, and failed rows after upload processing completes.',
    ],
    checks: [
      'Validate username, email, and SBU before upload.',
      'Correct only rejected rows and re-upload those rows instead of uploading the full file again.',
      'Review active and inactive user state before assigning exams.',
    ],
  },
  {
    id: 'excel-templates',
    title: 'Users and Questions Excel',
    summary: 'Use the correct Excel template format for bulk upload to avoid rejected rows and server errors.',
    steps: [
      'Go to Users or Questions module and click Upload to open the bulk upload modal.',
      'Click Download Template and use only that latest file for data preparation.',
      'For Users Excel, keep required fields valid (firstname, lastname, username, password; include SBU/Group where available).',
      'For Questions Excel, keep subject mapping, type, difficulty, marks/credit, and answer fields consistent with the template rules.',
      'Upload the filled file and review created/skipped/failed summary after processing.',
      'If rows fail, correct only failed rows and re-upload instead of repeating the full file.',
    ],
    checks: [
      'Do not rename template headers.',
      'Avoid duplicate usernames in Users Excel.',
      'For MCQ rows, ensure valid options and correct answer index/value as expected by template format.',
      'Use UTF-8-safe text and avoid hidden formulas/macros in uploaded files.',
    ],
  },
  {
    id: 'exam-management',
    title: 'Exam Management',
    summary: 'Use the Exams page to create, configure, monitor, and control the full exam lifecycle.',
    steps: [
      'Open Exams from the sidebar to view all created exam cards.',
      'Use the top action button to create a new exam shell with title, schedule, duration, instructions, and shuffle settings.',
      'Use the exam card actions to edit settings, delete the exam, assign questions, auto-pick questions, assign users, and download results.',
      'Treat each exam card as the main control point for that exam lifecycle.',
      'Open View whenever you need the full detail tabs for overview, questions, users, result state, evaluation, and downloads.',
    ],
    checks: [
      'Do not assign users before the question configuration is finalized.',
      'Review card counts and exam details after every major update.',
      'Use result download only when attempts are completed and evaluated where required.',
    ],
  },
  {
    id: 'create-edit-exam',
    title: 'Create and Edit Exam',
    summary: 'Create the exam shell first, then edit basic exam settings whenever scheduling or instructions change.',
    steps: [
      'Click Create Exam from the Exams page.',
      'Enter title, duration, start date-time, end date-time, description, and instructions.',
      'Enable Shuffle Questions or Shuffle Answers only when the exam pattern requires randomization.',
      'Save the exam to create the draft shell.',
      'Use Edit on the exam card whenever title, schedule, duration, or instruction content must be updated.',
    ],
    checks: [
      'Ensure the schedule is correct before assigning questions or users.',
      'Keep instructions concise and relevant to the exam flow.',
      'Review shuffle settings carefully because they affect the examinee experience.',
    ],
  },
  // {
  //   id: 'view-exam',
  //   title: 'View Exam Details',
  //   summary: 'Use View to monitor exam configuration, assigned questions, assigned users, attempts, evaluation state, and PDF actions.',
  //   steps: [
  //     'Click View on the exam card.',
  //     'Use the Overview tab to review status, schedule, marks, and counts.',
  //     'Use the Questions tab to review the final assigned question list.',
  //     'Use the Users tab to monitor attempts, evaluate pending answers, download PDFs, or trigger re-exam actions where allowed.',
  //     'Use Download All PDFs only after evaluated results are ready.',
  //   ],
  //   checks: [
  //     'Pending theory answers must be evaluated before final result distribution.',
  //     'Use View as the final verification screen before sharing results externally.',
  //   ],
  // },
  {
    id: 'delete-exam',
    title: 'Delete Exam',
    summary: 'Delete should be used only when the exam is no longer needed and must be removed from the portal.',
    steps: [
      'Locate the exam card on the Exams page.',
      'Click Delete and confirm the action.',
      'Verify that the exam card is removed from the list after deletion.',
    ],
    checks: [
      'Do not delete an exam that is still active, scheduled, or operationally required unless approved.',
      'Use deletion carefully because it removes the exam from regular management flow.',
    ],
  },
  {
    id: 'assign-questions',
    title: 'Assign Questions',
    summary: 'Use manual question assignment when exact control over the exam content is required.',
    steps: [
      'Open the relevant exam card and click Assign Questions.',
      'Filter by Subject, Type, and Difficulty to narrow the question bank.',
      'Select individual questions or use Select All Filtered when appropriate.',
      'Set Minimum Attempt Questions in the footer if the exam requires a mandatory attempt threshold.',
      'Set Passing Marks only if this exam needs an override from the default pass formula.',
      'Click Assign to save the final question set.',
    ],
    checks: [
      'Minimum Attempt Questions cannot be more than assigned questions.',
      'Passing Marks cannot be more than the total assigned marks.',
      'Once questions are assigned manually, review the exam card summary and details modal.',
    ],
  },
  {
    id: 'auto-pick',
    title: 'Auto Pick Questions',
    summary: 'Use Auto Pick when the exam should be generated automatically from the filtered question pool.',
    steps: [
      'Open the exam card and click Auto Pick.',
      'Choose Any Type or Split mode.',
      'Enter total question count and, if needed, split counts for MCQ, Theory, and Passage.',
      'Set Minimum Attempt Questions if required.',
      'Set Passing Marks only when this exam needs a custom passing threshold.',
      'Apply subject filter then generate questions.',
    ],
    checks: [
      'Minimum Attempt Questions cannot exceed total auto-picked questions.',
      'Split counts must equal total questions.',
      'If Custom/manual mode is already active, Auto Pick must be disabled until the manual assignment is removed.',
    ],
  },
  {
    id: 'assign-users',
    title: 'Assign Users',
    summary: 'Assign the correct examinee group only after question configuration is finalized.',
    steps: [
      'Open the exam card and click Assign Users.',
      'Use the search and status filters to find the target users.',
      'Select users individually or use Select All when the filtered list is correct.',
      'Click Assign to attach the users to the exam.',
    ],
    checks: [
      'Do not assign inactive or invalid accounts by mistake.',
      'Review the assigned user count on the exam card after saving.',
    ],
  },
  {
    id: 'results',
    title: 'Result and Download Actions',
    summary: 'Use the result actions to review performance outputs and download exam result documents.',
    steps: [
      'Use the Results button on the exam card to open the Download Results modal.',
      'The modal shows all assigned users, including users who have not attempted yet.',
      'In the result table, use Evaluate for pending submissions, Download for evaluated attempts, and Re-Exam where needed.',
      'Use Download All PDFs to export evaluated attempt PDFs in one ZIP file.',
      'Use Download Excel from the same modal after review.',
      'The table header is fixed and scrolling works inside the table area only.',
    ],
    checks: [
      'Not Attempted users are listed with status as Not Attempted.',
      'If evaluation is pending, status appears as Evaluation Pending and partial marks are shown.',
      'Percentage is hidden for Not Attempted and Evaluation Pending rows.',
      'MCQ-only exams can complete without manual evaluation.',
      'For theory and passage theory exams, result downloads should follow evaluation completion.',
      'Pass/fail display follows exam passing marks if provided, otherwise the default formula is used.',
    ],
  },
];

// ── Screenshot placeholders ────────────────────────────────────────────
const sectionImages = {
  'dashboard': Dashboard,
  'super-user-management': 'https://placehold.co/960x480/e2e8f0/94a3b8?text=Super+User+Management',
  'access-governance': 'https://placehold.co/960x480/e2e8f0/94a3b8?text=Access+Governance',
  'subjects': Subjects,
  'questions': Questions,
  'users': Users,
  'excel-templates': 'https://placehold.co/960x480/e2e8f0/94a3b8?text=Users+and+Questions+Excel',
  'exam-management': Exams,
  'create-edit-exam': Create_Exam,
  'view-exam': View_Exam,
  'delete-exam': Delete_Exam,
  'assign-questions': Assign_Question,
  'auto-pick': Auto_Question,
  'assign-users': Assign_Users,
  'results': Result,
};

// ── Icons ─────────────────────────────────────────────────────────────
const SearchIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
  </svg>
);
const XIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);
const ImageIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="m21 15-5-5L5 21" />
  </svg>
);
const ListIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
  </svg>
);
const ShieldIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);
const ChevronIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
    <path d="m9 18 6-6-6-6" />
  </svg>
);
const ArrowUpIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 19V5" />
    <path d="m5 12 7-7 7 7" />
  </svg>
);

// ── Section card ───────────────────────────────────────────────────────
const SectionCard = ({ section, index, onPreviewImage }) => {
  const imgSrc =
    sectionImages[section.id] ??
    `https://placehold.co/960x480/e2e8f0/94a3b8?text=${encodeURIComponent(section.title)}`;

  return (
    <section
      id={section.id}
      className="card bg-base-100 border border-base-300 shadow-sm scroll-mt-24 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-start gap-3 px-5 py-4 bg-base-200/50 border-b border-base-300">
        <span className="flex-shrink-0 mt-0.5 inline-flex items-center justify-center w-6 h-6 rounded-md bg-primary/10 text-primary text-[11px] font-bold font-mono border border-primary/20">
          {String(index + 1).padStart(2, '0')}
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-base-content">{section.title}</h2>
          <p className="mt-0.5 text-xs text-base-content/55 leading-relaxed">{section.summary}</p>
        </div>
      </div>

      {/* Body — 3 cols on xl */}
      <div className="grid xl:grid-cols-[1fr_1fr_340px] divide-y xl:divide-y-0 xl:divide-x divide-base-200">

        {/* How to Use */}
        <div className="p-5">
          <div className="flex items-center gap-1.5 mb-3">
            <span className="text-base-content/40"><ListIcon /></span>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-base-content/40">How to Use</span>
          </div>
          <ol className="space-y-2.5">
            {section.steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="flex-shrink-0 mt-0.5 w-5 h-5 rounded bg-base-200 border border-base-300 flex items-center justify-center text-[10px] font-semibold text-base-content/40">
                  {i + 1}
                </span>
                <span className="text-sm text-base-content/70 leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Important Notes */}
        <div className="p-5 bg-base-200/20">
          <div className="flex items-center gap-1.5 mb-3">
            <span className="text-warning"><ShieldIcon /></span>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-base-content/40">Important Notes</span>
          </div>
          <ul className="space-y-2.5">
            {section.checks.map((note, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="flex-shrink-0 mt-2 w-1.5 h-1.5 rounded-full bg-warning/70 flex-shrink-0" />
                <span className="text-sm text-base-content/70 leading-relaxed">{note}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Screenshot */}
        <div className="flex flex-col min-h-[180px]">
          <button
            type="button"
            onClick={() => onPreviewImage?.(imgSrc, section.title)}
            className="flex-1 overflow-hidden bg-base-200/40 cursor-zoom-in text-left"
            aria-label={`Open ${section.title} image in full view`}
          >
            <img
              src={imgSrc}
              alt={`${section.title} portal screenshot`}
              loading="lazy"
              className="w-full h-full object-cover"
              style={{ minHeight: '150px', maxHeight: '240px', display: 'block' }}
            />
          </button>
          <div className="flex items-center gap-2 px-3 py-2 border-t border-base-200 bg-base-200/30">
            <span className="text-base-content/30"><ImageIcon /></span>
            <span className="text-[11px] text-base-content/40 truncate">{section.title} — Portal Screenshot</span>
          </div>
        </div>

      </div>
    </section>
  );
};

// ── Page ──────────────────────────────────────────────────────────────
const HelpPage = () => {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [imagePreview, setImagePreview] = useState({ open: false, src: '', title: '' });
  const scrollContainerRef = useRef(null);

  const isAdmin = user?.role === 'admin';
  const sections = isAdmin ? adminSections : superuserSections;
  const title = isAdmin ? 'Admin Help & Portal Guide' : 'Super User Help & Portal Guide';
  const description = isAdmin
    ? 'Portal information and usage guidance for Super User administration, account governance, and access control.'
    : 'Portal information and usage guidance for dashboard access, subjects, questions, users, and complete exam management workflows.';

  const filteredSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sections;
    return sections.filter((s) =>
      [s.title, s.summary, ...s.steps, ...s.checks].join(' ').toLowerCase().includes(q)
    );
  }, [query, sections]);

  useEffect(() => {
    const scrollEl = scrollContainerRef.current;
    if (!scrollEl) return;

    const handleScroll = () => {
      setShowScrollTop(scrollEl.scrollTop > 260);
    };

    handleScroll();
    scrollEl.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollEl.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openImagePreview = (src, title) => {
    setImagePreview({ open: true, src, title });
  };

  const closeImagePreview = () => {
    setImagePreview({ open: false, src: '', title: '' });
  };

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && imagePreview.open) {
        closeImagePreview();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [imagePreview.open]);

  return (
    <div className="flex flex-col h-screen bg-base-200">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        <main ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4">
          <div className="max-w-7xl mx-auto space-y-4">

            {/* ── Header card ── */}
            <div className="card bg-base-100 border border-base-300 shadow-sm">
              <div className="card-body p-5 gap-4">

                {/* Top row */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h1 className="text-xl font-bold text-base-content">{title}</h1>
                    <p className="text-sm text-base-content/55 mt-1 max-w-2xl leading-relaxed">{description}</p>
                  </div>


                </div>
                {/* Search */}
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="relative w-full lg:max-w-xl">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/55 pointer-events-none">
                      <SearchIcon />
                    </span>
                    <input
                      type="text"
                      className="input input-bordered input-md w-full pl-10 pr-10 text-sm"
                      placeholder="Search dashboard, exam management, assign questions, results, users..."
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    {query && (
                      <button
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 btn btn-ghost btn-xs btn-circle"
                        onClick={() => setQuery('')}
                        aria-label="Clear search"
                      >
                        <XIcon />
                      </button>
                    )}
                  </div>

                </div>
              </div>
            </div>

            {/* Quick nav ── */}
            {filteredSections.length > 0 && (
              <div className="card bg-base-100 border border-base-300 shadow-sm">
                <div className="card-body p-4 gap-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-base-content/40">Quick Navigation</p>
                  <div className="flex flex-wrap gap-2">
                    {filteredSections.map((section, i) => (
                      <a
                        key={section.id}
                        href={`#${section.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-base-300 bg-base-200/40 hover:bg-primary/5 hover:border-primary/30 hover:text-primary text-xs font-medium text-base-content/60 transition-all duration-150 no-underline"
                      >
                        <span className="font-mono text-[9px] text-base-content/30">{String(i + 1).padStart(2, '0')}</span>
                        {section.title}
                        <ChevronIcon />
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Sections ── */}
            {filteredSections.length === 0 ? (
              <div className="card bg-base-100 border border-base-300 shadow-sm">
                <div className="card-body items-center text-center py-16 gap-3">
                  <div className="w-10 h-10 rounded-full bg-base-200 flex items-center justify-center text-base-content/30">
                    <SearchIcon />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold">No matching help content</h2>
                    <p className="text-sm text-base-content/50 mt-1">Change the search text to view the available help sections.</p>
                  </div>
                  <button className="btn btn-sm btn-ghost mt-1" onClick={() => setQuery('')}>Clear search</button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredSections.map((section, i) => (
                  <SectionCard
                    key={section.id}
                    section={section}
                    index={i}
                    onPreviewImage={openImagePreview}
                  />
                ))}
              </div>
            )}

          </div>
        </main>
      </div>

      {showScrollTop && (
        <button
          type="button"
          onClick={scrollToTop}
          className="btn btn-primary btn-circle fixed bottom-6 right-6 shadow-lg z-40"
          aria-label="Scroll to top"
        >
          <ArrowUpIcon />
        </button>
      )}

      {imagePreview.open && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[1px] flex items-center justify-center p-4"
          onClick={closeImagePreview}
        >
          <div
            className="relative w-full max-w-6xl h-[90vh] bg-base-100 rounded-xl overflow-hidden border border-base-300 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-base-300">
              <h3 className="text-sm font-semibold truncate pr-4">{imagePreview.title}</h3>
              <button
                type="button"
                className="btn btn-ghost btn-sm btn-circle"
                onClick={closeImagePreview}
                aria-label="Close image preview"
              >
                <XIcon />
              </button>
            </div>

            <div className="h-[calc(90vh-56px)] bg-black/10 flex items-center justify-center overflow-hidden">
              <img
                src={imagePreview.src}
                alt={`${imagePreview.title} full preview`}
                className="max-w-full max-h-full object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HelpPage;
