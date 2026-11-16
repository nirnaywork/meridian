import { redirect } from "next/navigation";
import { userClient } from "@/lib/server/db";
import Link from "next/link";
import { ArrowUpRight, ArrowRight, Check, MoveUpRight } from "lucide-react";
import { Logo, ThemeToggle } from "@/components/ui";
export default async function Home() {
  const { data } = await (await userClient()).auth.getCurrentUser();
  if (data.user?.emailVerified) redirect("/projects");
  return (
    <div className="landing">
      <header className="landing-nav">
        <Logo />
        <nav>
          <a href="#how-it-works">How it works</a>
          <a href="#built-together">Built for collaboration</a>
        </nav>
        <div>
          <ThemeToggle />
          <Link href="/sign-in" className="text-btn">
            Sign in
          </Link>
          <Link href="/sign-up" className="btn small">
            Find your people <ArrowUpRight size={16} />
          </Link>
        </div>
      </header>
      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="pill">
              <span />
              WHERE SKILLS FIND THEIR PEOPLE
            </div>
            <h1>
              Your skills.
              <br />
              Their big idea.
              <br />
              <em>Something great.</em>
            </h1>
            <p>
              You don’t need to have it all figured out. Just bring what you
              know, find a team that fits, and build something that matters.
            </p>
            <div className="hero-actions">
              <Link className="btn" href="/sign-up">
                Find your next project <ArrowUpRight size={18} />
              </Link>
              <Link className="text-btn" href="/sign-up">
                Build your team <ArrowRight size={17} />
              </Link>
            </div>
            <div className="hero-proof">
              <div className="avatar-stack">
                <span>AK</span>
                <span>JL</span>
                <span>SM</span>
                <span>YOU</span>
              </div>
              <span>
                A place for curious minds
                <br />
                <b>and things not built yet.</b>
              </span>
            </div>
          </div>
          <div
            className="hero-art"
            aria-label="Skills and ideas finding alignment"
          >
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="orbit orbit-three" />
            <div className="orbit-line" />
            <div className="art-dot dot-one" />
            <div className="art-dot dot-two" />
            <div className="art-dot dot-three" />
            <div className="floating-chip chip-react">
              <span>✳</span>React & TypeScript
            </div>
            <div className="floating-chip chip-design">
              <span>◈</span>A fresh perspective
            </div>
            <div className="floating-chip chip-ml">
              <span>⌘</span>Machine Learning
            </div>
            <div className="hero-project">
              <div className="card-top">
                <span className="project-icon tone-0">↗</span>
                <span className="eyebrow">THE NEXT CHAPTER</span>
              </div>
              <h3>
                An idea worth
                <br />
                building together.
              </h3>
              <p>Your next team is out there.</p>
              <div className="hero-project-footer">
                <div className="mini-ring">✦</div>
                <span>
                  Different skills.
                  <br />
                  <b>Shared direction.</b>
                </span>
                <MoveUpRight size={22} />
              </div>
            </div>
            <span className="art-caption">
              DIFFERENT PATHS. ONE POINT OF CONVERGENCE.
            </span>
          </div>
        </section>
        <section className="landing-strip">
          <span>FOR THE BUILDERS</span>
          <b>The late-night thinkers.</b>
          <b>The “what if” people.</b>
          <b>The learn-by-doing crowd.</b>
          <span>THAT’S YOU. ↗</span>
        </section>
        <section className="how" id="how-it-works">
          <div>
            <span className="eyebrow">FIND YOUR DIRECTION</span>
            <h2>
              Great teams don’t happen
              <br />
              by chance. They <em>align.</em>
            </h2>
          </div>
          <div className="how-grid">
            {[
              [
                "01",
                "Bring your strengths",
                "Tell us what you know, what you’re learning, and what you want to build.",
              ],
              [
                "02",
                "Find your fit",
                  "Browse open projects across disciplines. Role matches and skill overlap help you explore the idea; every project welcomes your application.",
              ],
              [
                "03",
                "Make it real",
                "Join a team or start your own. Turn shared curiosity into something you can point to.",
              ],
            ].map(([n, t, d]) => (
              <article key={n}>
                <span>{n} /</span>
                <h3>{t}</h3>
                <p>{d}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="landing-cta" id="built-together">
          <span className="eyebrow">MORE THAN ANOTHER GROUP PROJECT</span>
          <h2>
            Build your portfolio.
            <br />
            <em>Find your people.</em>
          </h2>
          <p>
            For students, side-project enthusiasts, and anyone ready to learn by
            making.
          </p>
          <Link href="/sign-up" className="btn light">
            Let’s make something <ArrowUpRight size={18} />
          </Link>
          <div>
            <Check size={15} /> Free to join <Check size={15} /> Your skills,
            your direction
          </div>
        </section>
      </main>
      <footer>
        <Logo />
        <span>Different paths. Shared direction.</span>
        <small>© {new Date().getFullYear()} Meridian</small>
      </footer>
    </div>
  );
}
