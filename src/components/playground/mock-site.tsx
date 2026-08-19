import {
  ArrowDownRight,
  ArrowUpRight,
  GitBranch,
  Globe,
  Rocket,
  Settings,
  Star,
  Users,
  Zap,
} from "lucide-react";

const img = (id: string, width: number) =>
  `https://images.unsplash.com/${id}?q=80&w=${width}&auto=format&fit=crop`;

export const MOCK_IMAGES = {
  features: [
    img("photo-1555066931-4365d14bab8c", 800),
    img("photo-1532622785990-d2c36a76f5a6", 800),
    img("photo-1558494949-ef010cbdcc31", 800),
  ],
  gallery: [
    img("photo-1522071820081-009f0129c71c", 900),
    img("photo-1551434678-e076c223a692", 900),
    img("photo-1603201667141-5a2d4c673378", 900),
    img("photo-1572021335469-31706a17aaef", 900),
  ],
  avatar: img("photo-1581065178047-8ee15951ede6", 200),
  glassBackdrop: img("photo-1618005182384-a83a8bd57fbe", 1600),
  hero: img("photo-1774425316479-4de6166e7408", 1740),
} as const;

function MockLink({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`cursor-pointer transition-colors duration-150 ${className}`}
    >
      {children}
    </button>
  );
}

function MockImage({
  src,
  alt,
  className = "",
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      crossOrigin="anonymous"
      loading="lazy"
      className={`h-full w-full object-cover ${className}`}
    />
  );
}

const DASH_NAV = [
  { label: "Overview", icon: Globe, active: true },
  { label: "Deploys", icon: Rocket, active: false },
  { label: "Branches", icon: GitBranch, active: false },
  { label: "Team", icon: Users, active: false },
  { label: "Settings", icon: Settings, active: false },
];

const DASH_STATS = [
  { label: "Deploys this week", value: "128", change: "+12%", up: true },
  { label: "Median deploy", value: "2.3s", change: "-18%", up: true },
  { label: "Success rate", value: "99.2%", change: "-0.4%", up: false },
];

const DASH_BARS = [42, 68, 54, 80, 63, 92, 75, 58, 86, 70, 96, 82];

const DASH_ROWS = [
  {
    name: "feat: new onboarding flow",
    status: "Preview ready",
    time: "2m ago",
  },
  { name: "fix: checkout race condition", status: "Deployed", time: "1h ago" },
  { name: "chore: bump dependencies", status: "In review", time: "3h ago" },
];

const LEGACY_ROWS = [
  { id: "#4021", task: "deploy_prod_v2.sh", status: "QUEUED", date: "09:02" },
  { id: "#4020", task: "build_release.bat", status: "FAILED", date: "08:47" },
  { id: "#4019", task: "ftp_upload_all", status: "OK", date: "08:31" },
  { id: "#4018", task: "run_tests_maybe", status: "SKIPPED", date: "08:12" },
];

export function MockDashboard({
  variant = "modern",
}: {
  variant?: "modern" | "legacy";
}) {
  if (variant === "legacy") {
    return (
      <div className="flex h-full w-full flex-col bg-[#ece9e2] font-mono text-[#3a382f]">
        <div className="flex items-center justify-between bg-[#2f5d8a] px-4 py-2 text-[12px] text-white">
          <span className="font-bold">bolt admin v1.3</span>
          <span className="hidden text-white/70 sm:block">
            logged in as maya
          </span>
        </div>
        <div className="flex items-center gap-2 border-b border-[#c9c5b8] bg-[#dedad0] px-4 py-2">
          {["New deploy", "Refresh", "Logs"].map((label) => (
            <span
              key={label}
              className="border border-[#a8a496] bg-[#f2efe8] px-2.5 py-1 text-[11px] shadow-[1px_1px_0_#a8a496]"
            >
              {label}
            </span>
          ))}
        </div>
        <div className="flex-1 overflow-hidden p-4">
          <table className="w-full border-collapse text-left text-[11.5px]">
            <thead>
              <tr>
                {["ID", "TASK", "STATUS", "TIME"].map((th) => (
                  <th
                    key={th}
                    className="border border-[#b5b1a3] bg-[#d3cfc2] px-2.5 py-1.5 font-bold"
                  >
                    {th}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {LEGACY_ROWS.map((row) => (
                <tr key={row.id}>
                  <td className="border border-[#b5b1a3] px-2.5 py-1.5">
                    {row.id}
                  </td>
                  <td className="border border-[#b5b1a3] px-2.5 py-1.5">
                    {row.task}
                  </td>
                  <td
                    className={`border border-[#b5b1a3] px-2.5 py-1.5 font-bold ${
                      row.status === "FAILED"
                        ? "text-[#a03123]"
                        : row.status === "OK"
                          ? "text-[#3f6b34]"
                          : ""
                    }`}
                  >
                    {row.status}
                  </td>
                  <td className="border border-[#b5b1a3] px-2.5 py-1.5">
                    {row.date}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[11px] text-[#726e60]">
            Last refresh: 09:12 &middot; 3 jobs queued &middot; deploys take
            around 25 minutes
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full bg-background">
      <aside className="hidden w-40 shrink-0 flex-col gap-1 border-r border-border/60 bg-muted/30 px-3 py-4 sm:flex">
        <span className="mb-3 flex items-center gap-1.5 px-2 text-[14px] font-semibold tracking-tight">
          <Zap aria-hidden className="size-3.5 fill-current" />
          bolt
        </span>
        {DASH_NAV.map((item) => (
          <span
            key={item.label}
            className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] font-medium ${
              item.active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground"
            }`}
          >
            <item.icon aria-hidden className="size-3.5" />
            {item.label}
          </span>
        ))}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col px-5 py-4 sm:px-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[15px] font-semibold tracking-[-0.01em]">
              Deploys
            </p>
            <p className="text-[12px] text-muted-foreground">Last 30 days</p>
          </div>
          <span className="rounded-full bg-foreground px-3 py-1.5 text-[12px] font-medium text-background">
            Deploy now
          </span>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          {DASH_STATS.map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-border/60 bg-card px-3.5 py-3"
            >
              <p className="truncate text-[12px] text-muted-foreground">
                {stat.label}
              </p>
              <p className="mt-1 text-lg font-semibold tracking-[-0.01em]">
                {stat.value}
              </p>
              <p
                className={`mt-0.5 flex items-center gap-0.5 text-[11.5px] font-medium ${
                  stat.up ? "text-emerald-500" : "text-rose-500"
                }`}
              >
                {stat.up ? (
                  <ArrowUpRight aria-hidden className="size-3" />
                ) : (
                  <ArrowDownRight aria-hidden className="size-3" />
                )}
                {stat.change}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-3 flex-1 rounded-xl border border-border/60 bg-card px-3.5 py-3">
          <p className="text-[12px] font-medium text-muted-foreground">
            Deploys per day
          </p>
          <div className="mt-2 flex h-[calc(100%-2rem)] min-h-16 items-end gap-1.5">
            {DASH_BARS.map((height, index) => (
              <div
                key={index}
                className="flex-1 rounded-t-sm bg-foreground/75"
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-border/60 bg-card px-3.5 py-2">
          {DASH_ROWS.map((row, index) => (
            <div
              key={row.name}
              className={`flex items-center justify-between py-2 ${
                index > 0 ? "border-t border-border/50" : ""
              }`}
            >
              <p className="truncate font-mono text-[12px]">{row.name}</p>
              <div className="flex shrink-0 items-center gap-3">
                <span className="rounded-full border border-border/60 px-2 py-0.5 text-[11px] text-muted-foreground">
                  {row.status}
                </span>
                <span className="hidden text-[11.5px] text-muted-foreground sm:block">
                  {row.time}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export interface MockSiteCopy {
  brand: string;
  navLinks: string[];
  signIn: string;
  navCta: string;
  heroTitle: string;
  heroSub: string;
  heroCta: string;
  heroAlt: string;
  press: string[];
  howEyebrow: string;
  howTitle: string;
  features: { title: string; copy: string }[];
  stats: { value: string; label: string }[];
  quote: string;
  quoteAuthor: string;
  quoteRole: string;
  galleryEyebrow: string;
  galleryTitle: string;
  pricingTitle: string;
  tiers: {
    name: string;
    price: string;
    copy: string;
    perks: string[];
    featured: boolean;
  }[];
  finalTitle: string;
  finalSub: string;
  finalCta: string;
  footerTagline: string;
  footerColumns: { title: string; links: string[] }[];
  footerFinePrint: string;
}

/**
 * Two complete versions of the page copy. Effects that swap one body of
 * content for another render the same layout with a different entry, so every
 * line of text differs between them.
 */
export const MOCK_SITE_COPY: [MockSiteCopy, MockSiteCopy] = [
  {
    brand: "bolt",
    navLinks: ["Product", "Pricing", "Docs", "Changelog"],
    signIn: "Sign in",
    navCta: "Start free",
    heroTitle: "Ship in days, not quarters.",
    heroSub:
      "bolt is the home for your team's builds, reviews, and releases. Plan the work, preview every change, and deploy with one click.",
    heroCta: "Start shipping free",
    heroAlt: "Book a demo",
    press: ["LaunchWire", "DevStack", "The Standup", "Console Weekly", "Shipped"],
    howEyebrow: "How it works",
    howTitle: "Less waiting. More shipping.",
    features: [
      {
        title: "Previews for every branch",
        copy: "Every push gets a live environment with its own URL, so reviews happen on the real thing instead of screenshots.",
      },
      {
        title: "Reviews that keep moving",
        copy: "Assign, comment, and approve in one place. bolt nudges the right people so nothing sits in a queue overnight.",
      },
      {
        title: "Rollbacks in one click",
        copy: "Every deploy is a snapshot. If something breaks in production, restore the last good release in seconds.",
      },
    ],
    stats: [
      { value: "40,000+", label: "teams shipping with bolt" },
      { value: "99.99%", label: "uptime over the last twelve months" },
      { value: "2.3s", label: "median time from merge to live" },
    ],
    quote:
      "We went from shipping once a month to shipping every day. bolt paid for itself in the first week.",
    quoteAuthor: "Maya R.",
    quoteRole: "CTO at Northwind",
    galleryEyebrow: "From our customers",
    galleryTitle: "Teams that ship with bolt.",
    pricingTitle: "Pricing that scales with you.",
    tiers: [
      {
        name: "Starter",
        price: "$0",
        copy: "For side projects and first launches.",
        perks: [
          "Unlimited preview branches",
          "2 concurrent deploys",
          "Community support",
        ],
        featured: false,
      },
      {
        name: "Scale",
        price: "$39",
        copy: "For teams shipping every day.",
        perks: [
          "Everything in Starter",
          "Unlimited concurrent deploys",
          "One-click rollbacks",
          "Priority support",
        ],
        featured: true,
      },
    ],
    finalTitle: "Ready to ship faster?",
    finalSub:
      "Start free, no credit card. Your first deploy is live in under two minutes.",
    finalCta: "Start shipping free",
    footerTagline: "The home for teams who would rather ship than wait.",
    footerColumns: [
      { title: "Product", links: ["Features", "Pricing", "Changelog"] },
      { title: "Resources", links: ["Docs", "Guides", "Status"] },
      { title: "Company", links: ["About", "Careers", "Blog"] },
    ],
    footerFinePrint:
      "A mock landing page for the Canvas UI playground. bolt is not a real company, but it would ship.",
  },
  {
    brand: "atlas",
    navLinks: ["Platform", "Pricing", "Guides", "Releases"],
    signIn: "Log in",
    navCta: "Start free",
    heroTitle: "Debug in minutes, not days.",
    heroSub:
      "atlas is the home for your team's traces, alerts, and incidents. Follow the request, read the payload, and fix the real cause.",
    heroCta: "Start tracing free",
    heroAlt: "Book a demo",
    press: ["SignalRoom", "TraceStack", "The Pager", "Console Weekly", "Observed"],
    howEyebrow: "How it works",
    howTitle: "Less guessing. More knowing.",
    features: [
      {
        title: "Traces for every request",
        copy: "Every call is followed through each hop with its payload kept, so you debug the real thing instead of a hunch.",
      },
      {
        title: "Alerts that stay quiet",
        copy: "Thresholds learn your normal traffic. atlas pages the right people when a pattern breaks, and stays quiet otherwise.",
      },
      {
        title: "Replay any incident",
        copy: "Every minute is recorded. If something breaks in production, scrub back and watch it happen again.",
      },
    ],
    stats: [
      { value: "12M+", label: "spans ingested every minute" },
      { value: "94.5%", label: "of incidents traced to a root cause" },
      { value: "1.8s", label: "median time from alert to answer" },
    ],
    quote:
      "We went from a day of guesswork to a minute of reading traces. atlas paid for itself the first night.",
    quoteAuthor: "Dev P.",
    quoteRole: "CTO at Cardinal",
    galleryEyebrow: "From our customers",
    galleryTitle: "Teams that debug with atlas.",
    pricingTitle: "Pricing that fits your stack.",
    tiers: [
      {
        name: "Solo",
        price: "$0",
        copy: "For side projects and first services.",
        perks: [
          "Seven day trace retention",
          "1 million spans",
          "Community support",
        ],
        featured: false,
      },
      {
        name: "Team",
        price: "$49",
        copy: "For services people rely on.",
        perks: [
          "Everything in Solo",
          "Ninety day trace retention",
          "One-click incident replay",
          "Priority support",
        ],
        featured: true,
      },
    ],
    finalTitle: "Ready to stop guessing?",
    finalSub:
      "Start free, no credit card. Your first full trace lands in under two minutes.",
    finalCta: "Start tracing free",
    footerTagline: "The home for teams who would rather know than guess.",
    footerColumns: [
      { title: "Platform", links: ["Tracing", "Pricing", "Releases"] },
      { title: "Resources", links: ["Guides", "Recipes", "Status"] },
      { title: "Company", links: ["About", "Careers", "Journal"] },
    ],
    footerFinePrint:
      "A mock landing page for the Canvas UI playground. atlas is not a real company, but it would page you.",
  },
];

const FEATURE_MEDIA = [
  { image: MOCK_IMAGES.features[0], alt: "A laptop screen filled with source code" },
  { image: MOCK_IMAGES.features[1], alt: "Two engineers sketching a plan on a whiteboard" },
  { image: MOCK_IMAGES.features[2], alt: "Network cables wired into a server rack" },
];

export function MockSite({
  heroMedia,
  heroBleed = false,
  copy = MOCK_SITE_COPY[0],
}: {
  heroMedia?: React.ReactNode;
  /** Lets 3D hero scenes overflow the panel instead of clipping at its edge. */
  heroBleed?: boolean;
  /** Which body of page copy to render. Defaults to the first variant. */
  copy?: MockSiteCopy;
}) {
  return (
    <div
      className={`mx-auto w-full max-w-5xl rounded-3xl border border-border/60 bg-background shadow-sm ${
        heroBleed ? "" : "overflow-hidden"
      }`}
    >
      <header className="flex items-center justify-between gap-4 border-b border-border/50 px-6 py-4 sm:px-10">
        <span className="flex items-center gap-1.5 text-lg font-semibold tracking-tight">
          <Zap aria-hidden className="size-4.5 fill-current" />
          {copy.brand}
        </span>
        <nav
          aria-label="Mock site"
          className="hidden items-center gap-1 md:flex"
        >
          {copy.navLinks.map((label) => (
            <MockLink
              key={label}
              className="rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              {label}
            </MockLink>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <MockLink className="hidden px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground sm:block">
            {copy.signIn}
          </MockLink>
          <MockLink className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background hover:bg-foreground/85">
            {copy.navCta}
          </MockLink>
        </div>
      </header>

      <section className="px-6 pt-16 pb-10 text-center sm:px-10 sm:pt-24">
        <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-[-0.03em] text-balance sm:text-6xl">
          {copy.heroTitle}
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-balance text-muted-foreground sm:text-lg sm:leading-8">
          {copy.heroSub}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <MockLink className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:bg-foreground/85">
            {copy.heroCta}
          </MockLink>
          <MockLink className="rounded-full border border-border px-5 py-2.5 text-sm font-medium hover:bg-muted/60">
            {copy.heroAlt}
          </MockLink>
        </div>
      </section>

      <section className="px-4 sm:px-6" aria-label="Showcase">
        <div
          className={`relative aspect-video rounded-2xl border border-border/60 ${
            heroBleed ? "" : "overflow-hidden"
          }`}
        >
          {heroMedia ?? <MockImage src={MOCK_IMAGES.hero} alt="Showcase" />}
        </div>
      </section>

      <section
        aria-label="Featured in"
        className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3 px-6 py-12 sm:px-10"
      >
        {copy.press.map((name) => (
          <span
            key={name}
            className="font-mono text-[13px] tracking-[0.12em] text-muted-foreground/70 uppercase"
          >
            {name}
          </span>
        ))}
      </section>

      <section className="border-t border-border/50 px-6 py-16 sm:px-10">
        <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">
          {copy.howEyebrow}
        </p>
        <h2 className="mt-3 max-w-lg text-3xl font-semibold tracking-[-0.02em] text-balance">
          {copy.howTitle}
        </h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {copy.features.map((feature, index) => (
            <article
              key={feature.title}
              className="flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-muted/30"
            >
              <div className="aspect-4/3 overflow-hidden">
                <MockImage
                  src={FEATURE_MEDIA[index].image}
                  alt={FEATURE_MEDIA[index].alt}
                />
              </div>
              <div className="p-5">
                <h3 className="text-[15px] font-medium tracking-tight">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {feature.copy}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-8 border-t border-border/50 px-6 py-14 sm:grid-cols-3 sm:px-10">
        {copy.stats.map((stat) => (
          <div key={stat.label} className="text-center sm:text-left">
            <p className="text-4xl font-semibold tracking-[-0.02em]">
              {stat.value}
            </p>
            <p className="mt-1.5 text-sm text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </section>

      <section className="border-t border-border/50 px-6 py-16 text-center sm:px-10">
        <div
          className="flex items-center justify-center gap-1 text-foreground"
          aria-label="5 out of 5 stars"
        >
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} aria-hidden className="size-4 fill-current" />
          ))}
        </div>
        <blockquote className="mx-auto mt-6 max-w-2xl text-2xl leading-9 font-medium tracking-[-0.01em] text-balance sm:text-3xl sm:leading-11">
          &ldquo;{copy.quote}&rdquo;
        </blockquote>
        <p className="mt-6 flex items-center justify-center gap-2.5 text-sm text-muted-foreground">
          <span className="size-7 overflow-hidden rounded-full border border-border/60">
            <MockImage src={MOCK_IMAGES.avatar} alt={copy.quoteAuthor} />
          </span>
          {copy.quoteAuthor} <span className="mx-1">&middot;</span>{" "}
          {copy.quoteRole}
        </p>
      </section>

      <section className="border-t border-border/50 px-6 py-16 sm:px-10">
        <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase">
          {copy.galleryEyebrow}
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.02em]">
          {copy.galleryTitle}
        </h2>
        <div className="mt-10 grid grid-cols-2 gap-4">
          {MOCK_IMAGES.gallery.map((src, index) => (
            <div
              key={src}
              className={`overflow-hidden rounded-2xl ${
                index % 3 === 0 ? "aspect-4/3" : "aspect-square sm:aspect-4/3"
              }`}
            >
              <MockImage src={src} alt={`Customer team ${index + 1}`} />
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-border/50 px-6 py-16 sm:px-10">
        <h2 className="text-center text-3xl font-semibold tracking-[-0.02em]">
          {copy.pricingTitle}
        </h2>
        <div className="mx-auto mt-10 grid max-w-3xl gap-4 sm:grid-cols-2">
          {copy.tiers.map((tier) => (
            <article
              key={tier.name}
              className={`rounded-2xl border p-6 ${
                tier.featured
                  ? "border-foreground/40 bg-foreground/5"
                  : "border-border/60 bg-muted/30"
              }`}
            >
              <h3 className="text-[15px] font-medium tracking-tight">
                {tier.name}
              </h3>
              <p className="mt-3 text-3xl font-semibold tracking-[-0.02em]">
                {tier.price}
                <span className="text-sm font-normal text-muted-foreground">
                  /month
                </span>
              </p>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {tier.copy}
              </p>
              <ul className="mt-5 flex flex-col gap-2.5">
                {tier.perks.map((perk) => (
                  <li
                    key={perk}
                    className="flex items-center gap-2.5 text-sm text-foreground/90"
                  >
                    <Zap
                      aria-hidden
                      className="size-3.5 shrink-0 fill-current"
                    />
                    {perk}
                  </li>
                ))}
              </ul>
              <MockLink
                className={`mt-6 w-full rounded-full py-2.5 text-sm font-medium ${
                  tier.featured
                    ? "bg-foreground text-background hover:bg-foreground/85"
                    : "border border-border hover:bg-muted/60"
                }`}
              >
                Choose {tier.name}
              </MockLink>
            </article>
          ))}
        </div>
      </section>

      <section className="border-t border-border/50 px-6 py-20 text-center sm:px-10">
        <h2 className="mx-auto max-w-xl text-3xl font-semibold tracking-[-0.02em] text-balance sm:text-4xl">
          {copy.finalTitle}
        </h2>
        <p className="mx-auto mt-4 max-w-md text-base leading-7 text-muted-foreground">
          {copy.finalSub}
        </p>
        <MockLink className="mt-8 rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background hover:bg-foreground/85">
          {copy.finalCta}
        </MockLink>
      </section>

      <footer className="border-t border-border/50 px-6 py-12 sm:px-10">
        <div className="flex flex-col justify-between gap-10 sm:flex-row">
          <div>
            <span className="flex items-center gap-1.5 text-lg font-semibold tracking-tight">
              <Zap aria-hidden className="size-4.5 fill-current" />
              {copy.brand}
            </span>
            <p className="mt-3 max-w-55 text-sm leading-6 text-muted-foreground">
              {copy.footerTagline}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-8">
            {copy.footerColumns.map((column) => (
              <div key={column.title}>
                <p className="text-[13px] font-medium">{column.title}</p>
                <ul className="mt-3 flex flex-col gap-2">
                  {column.links.map((label) => (
                    <li key={label}>
                      <MockLink className="text-[13px] text-muted-foreground hover:text-foreground">
                        {label}
                      </MockLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <p className="mt-12 text-xs text-muted-foreground/70">
          {copy.footerFinePrint}
        </p>
      </footer>
    </div>
  );
}
