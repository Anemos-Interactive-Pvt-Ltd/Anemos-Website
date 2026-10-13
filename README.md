# Anemos Interactive — the website

This is the source of **[anemosinteractive.com](https://anemosinteractive.com)**, the website of Anemos Interactive Private Limited, a game and technology studio.

![The home page: a runner at the start line, with the wind picking up](docs/screenshots/home.png)

- [The idea](#the-idea)
- [How it came together](#how-it-came-together)
- [What's on the site](#whats-on-the-site)
- [How the run works](#how-the-run-works)
- [How the blog works](#how-the-blog-works)
- [Screens, browsers and speed](#screens-browsers-and-speed)
- [Search, sharing and analytics](#search-sharing-and-analytics)
- [The stack, and why](#the-stack-and-why)
- [Hosting on Cloudflare](#hosting-on-cloudflare)
- [How it's built](#how-its-built)
- [Running it yourself](#running-it-yourself)
- [Folder map](#folder-map)
- [Credits](#credits)

## The idea

We didn't want a brochure. We make games, so the site should feel like one.

The home page is a single run. A runner stands at a start line; as you scroll, the wind pushes them along an obstacle course, and each stop on the course is a section of the site: what we do, the game we're building, courses, where to follow us, who we are. The copy for each stop blows in word by word as the runner reaches it. At the end of a section there's a hoop; run through it and the wind carries you to another page. Every page you land on arrives on the same gust, so the whole site feels like one place.

![Services: the runner between windmills, with the service icons floating over the course](docs/screenshots/home-services.png)

Everything on the course is drawn live: the runner, the wind lines, the hoops, the start gate, the windmills, the construction site, the social-media tiles the runner has to hop over. The words are ordinary HTML laid over the canvas, so search engines, screen readers and people with JavaScript off all get the full text.

## How it came together

It started as one line: *"a runner on an obstacle course, guided by wind, and the text appears as you scroll."* The first version was a stick figure on a flat line and a wall of text. From there it was mostly iteration and other people's eyes.

- **Pace.** The first run was far too quick — one flick of the wheel and you had skipped three sections. The scroll distance was stretched again and again (it ends up at roughly thirty-four screen heights of scrolling for one screen of picture) until it felt like walking through it. A column of dots on the right lets you jump to any stop or drag between them. We tried a "speed bump" that slowed the scroll when you rushed; it felt like fighting the page and was taken out.
- **Worlds.** Each section got its own weather and scenery so you know where you are without reading: a city skyline at the start, windmills for services, a building site for the game in progress, a lecture hall for courses, a sky full of gusts for socials.
- **Screens.** It had to work from a 4K monitor down to a 300-pixel-wide phone, folded and unfolded, upright and on its side. Sideways phones get a different layout: the copy sits on the left over a dark scrim and the run happens on the right.
- **Slow connections.** People in low-bandwidth areas told us the page jumped to the end before it had loaded. The fix was a loading screen that only appears when it is needed, waits until about 60% of the site (by weight) has arrived, and never shows on a return visit because everything is cached by then.
- **Browsers.** Checked in the Chromium, Firefox and WebKit engines, and against Samsung Internet, whose taller toolbars shorten the screen enough to hide things that Chrome shows.
- **Copy.** Friends and a few people in the industry read it and told us where it was vague, where it overclaimed and where it sounded like every other studio. "Technology consulting" became "software & app development" because that is what it is; a line about rendering layers was softened until it was true.
- **The small things people noticed.** The purple that looked off, the logo touching the edge on small phones, the social tiles that made the runner jump too often (now they alternate: hop one, duck under the next), the title on a blog post that didn't line up with the text below it. Most of what is good about the site came from someone saying "that looks wrong".

![Socials: the runner hopping the GitHub tile with YouTube and Instagram on the ground](docs/screenshots/home-socials.png)

The timeline, roughly: a plain static site in late September 2026; the run, the worlds and the responsive work in the first ten days of October; live on 10 October; the loading screen, booking page, analytics and legal pages over the following two days; the blog and its admin after that.

## What's on the site

| Page | What it is |
|---|---|
| **Home** | The run: services, products, courses, socials, about, and a hoop into the contact page |
| **Products** | *It Still Beats*, our first game, and a construction worker waving from the site while it's built |
| **Blogs** | Posts from the team, written in a small admin of our own (see below) |
| **About us** | How we work and who the founders are |
| **Book a call** | A calendar for a free consultation call, shown in the visitor's local time, booked straight into our calendar |
| **Contact** | A form, the company details, and the mark from our business card behind the page |
| **Privacy, Terms** | Written for visitors in the EU, India and elsewhere, and kept in step with what the site actually collects |
| **404** | "The wind took this page somewhere else" |

![Products: It Still Beats, coming soon](docs/screenshots/products.png)

![About us](docs/screenshots/about.png)

## How the run works

All of it lives in [`public/wind.js`](public/wind.js), with the layout in [`public/style.css`](public/style.css).

- The page is very tall and the stage is sticky, so scrolling doesn't move the picture; it moves the runner. Scroll position is converted into a distance along the course, measured in runner heights, and everything on the course is placed in those units. That is why it looks the same whether the screen is a phone or a cinema display: the world scales with the runner.
- Each section is a *panel* of HTML (heading, copy, buttons). The panel fades in as the runner approaches its stop, the words are split into spans and revealed one after another with a stagger, and the whole panel is scaled down on small screens so it never overlaps the course.
- Hoops sit at the end of sections. Reaching one plays a short wipe — the wind sweeps across the screen — and the next page opens with the same wipe clearing, using a flag in session storage so it knows it arrived on the wind.
- The social section's tiles are real links positioned over the canvas, so they are clickable, keyboard-reachable and drawn as obstacles at the same time.
- The dots on the right are the same stops. Click one to go there; drag along them to scrub through the run.
- If the visitor has asked their system for reduced motion, the run is switched off and the sections are shown as a plain page.

## How the blog works

The blog is the only dynamic part of the site. It runs in a Cloudflare Worker ([`src/`](src/)) next to the static pages — about 900 lines of JavaScript with one dependency (the Markdown parser).

**The stack for it, and why**

| Part | What we use | Why |
|---|---|---|
| Pages and API | A Cloudflare Worker (the same one that serves the site) | No server to run or patch; it scales to zero and runs next to the visitor. |
| Posts | Cloudflare D1 (SQLite at the edge) | A real relational database with plain SQL, free at this size, and it lives in the same account as everything else. |
| Images | Cloudflare R2 (object storage) | Ten gigabytes free and no charge for bandwidth, which is the cost that bites on image-heavy blogs elsewhere. |
| Writing | Markdown, parsed by `marked` | Plain text, portable, and simple to render safely. |
| Safety | Cloudflare's built-in HTML rewriter as an allow-list | Every tag and attribute a post can contain is on a short list; anything else is dropped before it reaches a page. |
| Sign-in | Cloudflare Access with Microsoft 365 (Entra ID) as the identity provider | Staff already have Microsoft accounts with multi-factor sign-in; we add nothing to manage, and a disabled account is locked out of the admin instantly. |
| Editor | A plain text box with a formatting bar, in vanilla JavaScript | Fast, no dependencies, and it does exactly what a blog needs and nothing more. |
| Fresh indexing | IndexNow | One request on publish tells Bing and the engines that share its index to recrawl. |


- **Posts** live in a Cloudflare D1 database ([`schema.sql`](schema.sql)): title, address, summary, Markdown, the rendered HTML, cover image, author, status and dates. Images go into an R2 bucket and are served from `/media/`.
- **Public pages:** `/blogs` (cards, newest first, twelve per page) and `/blogs/<address>` for each post, in the same style as the rest of the site, with a share image, structured data for search engines, an RSS feed at `/blogs/feed.xml`, and every published post added to `sitemap.xml` automatically. Posts without a cover get a panel with the studio mark so the grid stays even.
- **Admin:** on its own hostname, behind Cloudflare Access. Only the team's Microsoft 365 accounts can sign in; the Worker verifies the signed token on every request rather than trusting the gate alone. The author's name comes from their Microsoft account, so a rename there changes old posts too. The founder can edit anything; everyone else edits only their own posts.
- **Writing:** Markdown in a plain text box with a formatting bar (headings, bold, italic, underline, strikethrough, sub- and superscript, links, images, lists, checklists, quotes, code, tables, dividers), a live preview, and the list continuation you'd expect from an editor — Enter continues a list, a second Enter ends it. Images are shrunk in the browser before upload and shown at a consistent width in posts, whatever size they were.
- **Safety:** everything typed is rendered through an allow-list, so a post can never carry scripts or styles onto the site; uploads are limited to images under 8 MB; the editor's requests carry a header the API insists on; each environment (live, test, experiment) has its own database and bucket.
- **Search engines:** publishing a post pings IndexNow, so Bing and the engines that share its index pick it up within hours.

## Screens, browsers and speed

- **Fourteen sizes** are checked on every change, from 3840×2160 down to 300×600, including tablets both ways, folding phones open and closed, and phones on their side.
- **Engines:** Chromium, Gecko (Firefox) and WebKit (Safari), plus Samsung Internet's screen sizes, user agent, dark mode and toolbar heights.
- **Layout shift is zero.** Fonts are served from the site itself and preloaded, the sections are hidden until the run is ready, and nothing moves after first paint.
- **Caching:** fonts and the brand set are cached for a year; the stylesheet and scripts for ten minutes. The blog and admin pages stamp their stylesheet and script URLs with a hash on every deploy, so a change shows on the next load without waiting for a cache to expire.

## Search, sharing and analytics

- Every page has its own title, description, canonical address, Open Graph and Twitter card, and the home page carries `Organization` structured data (founders, address, social profiles). Blog posts carry `BlogPosting` data.
- `sitemap.xml` lists every page and, through the Worker, every post. `robots.txt` keeps the 404 page and the admin out of search.
- Analytics is Google Analytics 4 behind a consent line. Until a visitor accepts, nothing is stored on their device; decline is remembered too. The privacy policy spells out exactly what is collected and for how long.

## The stack, and why

| Choice | Why |
|---|---|
| **Plain HTML, CSS and JavaScript** for the pages — no framework, no bundler | The site is nine pages and one big animation. A framework would add a build step, a dependency tree and kilobytes of runtime for no visible benefit, and plain files are the easiest thing to keep running for years. |
| **Canvas 2D** for the run, not WebGL or a game engine export | Canvas 2D works in every browser going back about eight years, needs no GPU features, and draws a few hundred lines and shapes per frame comfortably on a cheap phone. The whole run is one file. |
| **HTML for the words**, drawn over the canvas | Search engines, screen readers and visitors with JavaScript off all get the full copy. Nothing you can read on the site exists only as pixels. |
| **Two self-hosted fonts** (Questrial for headings, Inter for text), with Google Fonts as a fallback | Serving them from our own domain means no third-party request on first paint, no layout shift, and nothing for the privacy policy to explain unless the fallback is used. |
| **Cloudflare Workers** for hosting, **D1** for the blog's database, **R2** for images, **Access** for the admin sign-in | One provider, one deploy command, and all of it on free tiers (see below). |
| **Microsoft 365** for email, the booking calendar and staff identities | We already pay for it; it gives us bookings, calendars and multi-factor sign-in without building any of them. |
| **Web3Forms** for the contact form | A static site cannot receive a form post. Web3Forms delivers the message to our inbox with a honeypot against bots and no account for the visitor to make. |
| **Google Analytics 4** with Consent Mode | We wanted to know how many people visit, from where, on what devices, and which part of the run they use — without setting a cookie until someone agrees. |
| **Markdown** for blog posts | Plain text that any editor can open, easy to render safely, and it keeps authors writing instead of styling. |

## Hosting on Cloudflare

The site started on Netlify with a GitHub Actions deploy. We moved to Cloudflare in October 2026 for three practical reasons: the domain's DNS was already at Cloudflare (it carries our Microsoft 365 mail records), Cloudflare's free tiers cover everything this site does, and there is no bandwidth bill — on most hosts a post that goes viral becomes an invoice; here it doesn't.

How it is laid out:

- **One Worker, three environments.** [`wrangler.jsonc`](wrangler.jsonc) describes `anemos-website` (live, on anemosinteractive.com and www), `anemos-website-test` (test.anemosinteractive.com) and `anemos-website-experiment` (experiment.anemosinteractive.com). Each has its own admin hostname, D1 database and R2 bucket, so nothing written on test can reach the live site. Deploying is `npx wrangler deploy --env <name>`; Cloudflare creates the DNS records and certificates for the hostnames itself.
- **Static assets first.** Everything in `public/` is uploaded as static assets and served from Cloudflare's edge without running any code — those requests are free and unlimited. The Worker only runs for the paths that need it: the blog, the images, the sitemap, and the HTML pages (so the admin hostname can refuse to serve them). Clean URLs come from the assets layer: `/about.html` is served at `/about`.
- **Caching** is set in [`public/_headers`](public/_headers): a year for fonts and the brand set, a week for logos and the share image, ten minutes for the stylesheet and scripts. The blog and admin pages avoid even that wait by stamping their stylesheet and script URLs with a content hash on every deploy ([`scripts/stamp.mjs`](scripts/stamp.mjs)).
- **Limits that matter.** The Workers free plan allows 100,000 Worker requests a day — tens of thousands of page views; past that, Worker-served pages error rather than bill. D1's free tier is five million reads a day; R2's is ten gigabytes stored with no egress charge; Access is free for up to fifty users. If the blog ever needs more, the paid Workers plan is five dollars a month.
- **Branches match environments.** `main` is the live site, `test` is the next release, `experiment` is where new things are built. Nothing reaches `main` without passing the checks on `test` first.

## How it's built

- **Forms and bookings:** the contact form posts to Web3Forms with a honeypot against bots; the booking page embeds Microsoft Bookings, which shows free slots in the visitor's own time zone and books straight into our calendar.
- **Checks before anything goes out:** the resolution matrix, an interaction run (dots, drag, hoops, menu, socials, forms), HTML validation, an accessibility audit, Lighthouse, and the cross-engine run. Changes go to the experiment or test site first and to the live site only after all of that passes.

![Contact](docs/screenshots/contact.png)

## Running it yourself

The static site needs nothing but a web server:

```sh
cd public && python3 -m http.server 8765
# open http://localhost:8765
```

The blog needs a Cloudflare account with a D1 database and an R2 bucket named as in `wrangler.jsonc`:

```sh
npm install
npx wrangler login
npx wrangler d1 execute anemos-blog-experiment --env experiment --remote --file=schema.sql   # once per database
npx wrangler dev --env experiment
```

Deploying is one command per environment: `npx wrangler deploy --env experiment`, `npx wrangler deploy --env test`, or plain `npx wrangler deploy` for the live site. The admin's sign-in is configured per environment with `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` in `wrangler.jsonc`; until those are set, a `DEV_KEY` secret and a simple sign-in form stand in.

<p align="center"><img src="docs/screenshots/home-phone.png" width="300" alt="The home page on a phone"></p>

## Folder map

```
public/            the site as served: pages, style.css, wind.js, analytics.js, fonts, brand, sitemap, robots
public/admin.*     the blog admin's stylesheet and editor script
src/worker.js      entry point: public hostnames → the blog pages or static assets; admin hostname → the admin
src/public.js      /blogs, posts, RSS feed, sitemap, images
src/admin.js       post list, editor, uploads, the JSON API the editor talks to
src/auth.js        Cloudflare Access token verification (and the stand-in sign-in for new environments)
src/markdown.js    Markdown → HTML with the allow-list sanitiser
src/db.js          the database queries
src/layout.js      the shared page shell: header, nav, footer, scripts
schema.sql         the blog's tables
scripts/stamp.mjs  runs before each deploy; stamps stylesheet and script URLs
wrangler.jsonc     hosting configuration for the three environments
docs/screenshots/  the images in this file
```

## Credits

Designed and built by **Ronak Koshy Jacob**, founder and managing director of Anemos Interactive. Brand and visual identity by **Latika Ganesh Salian**, co-founder and creative director. Thanks to the friends who scrolled too fast, read the copy twice and sent screenshots from phones we don't own.

© 2026 Anemos Interactive Private Limited. All rights reserved. The code is published so people can see how the site works; the Anemos Interactive name, logo, artwork, copy and *It Still Beats* are not licensed for reuse.
